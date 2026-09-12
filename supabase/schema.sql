-- Стрелка: схема БД. Таблицы живут в непубличной схеме strelka (нет доступа через Data API),
-- наружу открыты только RPC-функции в public, каждая проверяет invite-код группы.

create extension if not exists pgcrypto;
create schema if not exists strelka;

create table if not exists strelka.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists strelka.people (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references strelka.groups(id) on delete cascade,
  name text not null,
  color text not null,
  sort int not null default 0,
  note text
);

create table if not exists strelka.rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references strelka.groups(id) on delete cascade,
  person_id uuid not null references strelka.people(id) on delete cascade,
  kind text not null check (kind in ('recurring','oneoff','shift')),
  title text not null,
  weekdays int[] not null default '{}',
  dates date[] not null default '{}',
  slots text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists strelka.overrides (
  group_id uuid not null references strelka.groups(id) on delete cascade,
  person_id uuid not null references strelka.people(id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('m','d','e')),
  busy boolean not null,
  title text,
  updated_at timestamptz not null default now(),
  primary key (person_id, date, slot)
);

create table if not exists strelka.meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references strelka.groups(id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('m','d','e')),
  title text,
  place text,
  created_by uuid references strelka.people(id) on delete set null,
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create index if not exists rules_group_idx on strelka.rules(group_id);
create index if not exists overrides_group_date_idx on strelka.overrides(group_id, date);
create index if not exists meetings_group_date_idx on strelka.meetings(group_id, date);

alter table strelka.groups enable row level security;
alter table strelka.people enable row level security;
alter table strelka.rules enable row level security;
alter table strelka.overrides enable row level security;
alter table strelka.meetings enable row level security;

revoke all on schema strelka from anon, authenticated;

create or replace function strelka.gid(code text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare g uuid;
begin
  select id into g from strelka.groups where invite_code = code;
  if g is null then raise exception 'bad_code'; end if;
  return g;
end $$;

create or replace function public.strelka_state(code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g strelka.groups;
begin
  select * into g from strelka.groups where invite_code = code;
  if g.id is null then raise exception 'bad_code'; end if;
  return jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'code', g.invite_code),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'color',p.color,'sort',p.sort,'note',p.note) order by p.sort)
                        from strelka.people p where p.group_id = g.id), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'personId',r.person_id,'kind',r.kind,'title',r.title,'weekdays',r.weekdays,'dates',r.dates,'slots',r.slots) order by r.created_at)
                       from strelka.rules r where r.group_id = g.id), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('personId',o.person_id,'date',o.date,'slot',o.slot,'busy',o.busy,'title',o.title))
                           from strelka.overrides o where o.group_id = g.id and o.date >= current_date - 14), '[]'::jsonb),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'date',m.date,'slot',m.slot,'title',m.title,'place',m.place,'createdBy',m.created_by,'canceledAt',m.canceled_at) order by m.date)
                          from strelka.meetings m where m.group_id = g.id and m.date >= current_date - 60), '[]'::jsonb)
  );
end $$;

create or replace function public.strelka_save_rule(code text, rule jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); rid uuid := (rule->>'id')::uuid; pid uuid := (rule->>'personId')::uuid;
begin
  if not exists (select 1 from strelka.people where id = pid and group_id = g) then raise exception 'bad_person'; end if;
  if rid is not null then
    update strelka.rules set kind = rule->>'kind', title = rule->>'title',
      weekdays = coalesce((select array_agg(x::int) from jsonb_array_elements_text(rule->'weekdays') x), '{}'),
      dates = coalesce((select array_agg(x::date) from jsonb_array_elements_text(rule->'dates') x), '{}'),
      slots = (select array_agg(x) from jsonb_array_elements_text(rule->'slots') x)
    where id = rid and group_id = g;
    return rid;
  end if;
  insert into strelka.rules (group_id, person_id, kind, title, weekdays, dates, slots)
  values (g, pid, rule->>'kind', rule->>'title',
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(rule->'weekdays') x), '{}'),
    coalesce((select array_agg(x::date) from jsonb_array_elements_text(rule->'dates') x), '{}'),
    (select array_agg(x) from jsonb_array_elements_text(rule->'slots') x))
  returning id into rid;
  return rid;
end $$;

create or replace function public.strelka_delete_rule(code text, rule_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from strelka.rules where id = rule_id and group_id = strelka.gid(code);
end $$;

create or replace function public.strelka_set_override(code text, person_id uuid, d date, slot text, busy boolean, title text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); p_person uuid := person_id; p_slot text := slot; p_busy boolean := busy; p_title text := title;
begin
  if not exists (select 1 from strelka.people p where p.id = p_person and p.group_id = g) then raise exception 'bad_person'; end if;
  if p_busy is null then
    delete from strelka.overrides o where o.person_id = p_person and o.date = d and o.slot = p_slot;
  else
    insert into strelka.overrides as o (group_id, person_id, date, slot, busy, title) values (g, p_person, d, p_slot, p_busy, p_title)
    on conflict on constraint overrides_pkey do update set busy = excluded.busy, title = excluded.title, updated_at = now();
  end if;
end $$;

create or replace function public.strelka_book(code text, person_id uuid, d date, slot text, title text default null, place text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); mid uuid; p_person uuid := person_id; p_slot text := slot; p_title text := title; p_place text := place;
begin
  insert into strelka.meetings (group_id, date, slot, title, place, created_by) values (g, d, p_slot, p_title, p_place, p_person) returning id into mid;
  return mid;
end $$;

create or replace function public.strelka_update_meeting(code text, meeting_id uuid, title text, place text, canceled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update strelka.meetings m set title = strelka_update_meeting.title, place = strelka_update_meeting.place,
    canceled_at = case when canceled then coalesce(m.canceled_at, now()) else null end
  where m.id = meeting_id and m.group_id = strelka.gid(code);
end $$;

create or replace function public.strelka_update_person(code text, person_id uuid, name text, color text, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update strelka.people p set name = strelka_update_person.name, color = strelka_update_person.color, note = strelka_update_person.note
  where p.id = person_id and p.group_id = strelka.gid(code);
end $$;

grant execute on function public.strelka_state(text), public.strelka_save_rule(text, jsonb), public.strelka_delete_rule(text, uuid),
  public.strelka_set_override(text, uuid, date, text, boolean, text), public.strelka_book(text, uuid, date, text, text, text),
  public.strelka_update_meeting(text, uuid, text, text, boolean), public.strelka_update_person(text, uuid, text, text, text)
  to anon, authenticated;
