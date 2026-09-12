-- Telegram: привязка чата и пользователей, «сборы» (gatherings) по запросу.

alter table strelka.groups add column if not exists tg_chat_id bigint;
alter table strelka.people add column if not exists tg_user_id bigint unique;
alter table strelka.people add column if not exists tg_username text;

create table if not exists strelka.gatherings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references strelka.groups(id) on delete cascade,
  week_start date not null,
  initiated_by uuid references strelka.people(id) on delete set null,
  note text,
  responded uuid[] not null default '{}',
  tg_message_id bigint,
  all_notified_at timestamptz,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists gatherings_group_idx on strelka.gatherings(group_id, created_at desc);
alter table strelka.gatherings enable row level security;

create or replace function public.strelka_state(code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g strelka.groups;
begin
  select * into g from strelka.groups where invite_code = code;
  if g.id is null then raise exception 'bad_code'; end if;
  return jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'code', g.invite_code, 'tgLinked', g.tg_chat_id is not null),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'color',p.color,'sort',p.sort,'note',p.note,'tg',p.tg_user_id is not null,'avatar',p.avatar_url) order by p.sort)
                        from strelka.people p where p.group_id = g.id), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'personId',r.person_id,'kind',r.kind,'title',r.title,'weekdays',r.weekdays,'dates',r.dates,'slots',r.slots,'startMin',r.start_min,'endMin',r.end_min) order by r.created_at)
                       from strelka.rules r where r.group_id = g.id), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('personId',o.person_id,'date',o.date,'slot',o.slot,'busy',o.busy,'title',o.title))
                           from strelka.overrides o where o.group_id = g.id and o.date >= current_date - 14), '[]'::jsonb),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'date',m.date,'slot',m.slot,'title',m.title,'place',m.place,'createdBy',m.created_by,'canceledAt',m.canceled_at) order by m.date)
                          from strelka.meetings m where m.group_id = g.id and m.date >= current_date - 60), '[]'::jsonb),
    'gatherings', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'weekStart',x.week_start,'initiatedBy',x.initiated_by,'note',x.note,'responded',x.responded,'weeks',x.weeks,'dateFrom',x.date_from,'dateTo',x.date_to,'timeFrom',x.time_from,'timeTo',x.time_to,'closedAt',x.closed_at) order by x.created_at desc)
                          from strelka.gatherings x where x.group_id = g.id and x.week_start >= current_date - 7), '[]'::jsonb)
  );
end $$;

-- Функции только для service_role (используются Edge Function бота).
create or replace function public.strelka_admin_group_by_chat(chat_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'code', invite_code, 'name', name) from strelka.groups where tg_chat_id = chat_id
$$;

create or replace function public.strelka_admin_link_chat(code text, chat_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g strelka.groups;
begin
  update strelka.groups set tg_chat_id = chat_id where invite_code = code returning * into g;
  if g.id is null then raise exception 'bad_code'; end if;
  return jsonb_build_object('id', g.id, 'code', g.invite_code, 'name', g.name);
end $$;

create or replace function public.strelka_admin_person_by_tg(tg_user_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('personId', p.id, 'code', g.invite_code, 'name', p.name)
  from strelka.people p join strelka.groups g on g.id = p.group_id where p.tg_user_id = strelka_admin_person_by_tg.tg_user_id
$$;

create or replace function public.strelka_admin_bind_tg(code text, person_id uuid, tg_user_id bigint, tg_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code);
begin
  update strelka.people p set tg_user_id = null where p.tg_user_id = strelka_admin_bind_tg.tg_user_id and p.group_id = g;
  update strelka.people p set tg_user_id = strelka_admin_bind_tg.tg_user_id, tg_username = strelka_admin_bind_tg.tg_username
  where p.id = person_id and p.group_id = g;
end $$;

create or replace function public.strelka_admin_group_info(code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'code', invite_code, 'name', name, 'chatId', tg_chat_id) from strelka.groups where invite_code = code
$$;

create or replace function public.strelka_admin_open_gathering(code text, week_start date, initiated_by uuid, note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); x strelka.gatherings;
begin
  update strelka.gatherings set closed_at = now() where group_id = g and closed_at is null and gatherings.week_start <> strelka_admin_open_gathering.week_start;
  select * into x from strelka.gatherings where group_id = g and closed_at is null and gatherings.week_start = strelka_admin_open_gathering.week_start;
  if x.id is null then
    insert into strelka.gatherings (group_id, week_start, initiated_by, note) values (g, week_start, initiated_by, note) returning * into x;
  end if;
  return to_jsonb(x);
end $$;

create or replace function public.strelka_admin_gathering_update(gathering_id uuid, tg_message_id bigint default null, add_responded uuid default null, mark_all_notified boolean default false, close boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x strelka.gatherings;
begin
  update strelka.gatherings set
    tg_message_id = coalesce(strelka_admin_gathering_update.tg_message_id, gatherings.tg_message_id),
    responded = case when add_responded is not null and not (add_responded = any(responded)) then responded || add_responded else responded end,
    all_notified_at = case when mark_all_notified then coalesce(all_notified_at, now()) else all_notified_at end,
    closed_at = case when close then coalesce(closed_at, now()) else closed_at end
  where id = gathering_id returning * into x;
  return to_jsonb(x);
end $$;

create or replace function public.strelka_admin_open_gathering_of(code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from strelka.gatherings x where x.group_id = strelka.gid(code) and x.closed_at is null order by x.created_at desc limit 1
$$;

revoke execute on function public.strelka_admin_group_by_chat(bigint), public.strelka_admin_link_chat(text, bigint), public.strelka_admin_person_by_tg(bigint),
  public.strelka_admin_bind_tg(text, uuid, bigint, text), public.strelka_admin_group_info(text), public.strelka_admin_open_gathering(text, date, uuid, text),
  public.strelka_admin_gathering_update(uuid, bigint, uuid, boolean, boolean), public.strelka_admin_open_gathering_of(text) from public, anon, authenticated;
grant execute on function public.strelka_admin_group_by_chat(bigint), public.strelka_admin_link_chat(text, bigint), public.strelka_admin_person_by_tg(bigint),
  public.strelka_admin_bind_tg(text, uuid, bigint, text), public.strelka_admin_group_info(text), public.strelka_admin_open_gathering(text, date, uuid, text),
  public.strelka_admin_gathering_update(uuid, bigint, uuid, boolean, boolean), public.strelka_admin_open_gathering_of(text) to service_role;

create or replace function public.strelka_admin_gathering_get(gathering_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'code', g.invite_code, 'week_start', x.week_start, 'date_from', x.date_from)
  from strelka.gatherings x join strelka.groups g on g.id = x.group_id where x.id = gathering_id
$$;
revoke execute on function public.strelka_admin_gathering_get(uuid) from public, anon, authenticated;
grant execute on function public.strelka_admin_gathering_get(uuid) to service_role;

-- Период сбора: несколько недель подряд начиная с week_start.
alter table strelka.gatherings add column if not exists weeks int not null default 1;

create or replace function public.strelka_admin_open_gathering(code text, week_start date, initiated_by uuid, note text, weeks int default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); x strelka.gatherings;
begin
  update strelka.gatherings set closed_at = now() where group_id = g and closed_at is null;
  insert into strelka.gatherings (group_id, week_start, weeks, initiated_by, note) values (g, week_start, greatest(1, weeks), initiated_by, note) returning * into x;
  return to_jsonb(x);
end $$;
drop function if exists public.strelka_admin_open_gathering(text, date, uuid, text);
revoke execute on function public.strelka_admin_open_gathering(text, date, uuid, text, int) from public, anon, authenticated;
grant execute on function public.strelka_admin_open_gathering(text, date, uuid, text, int) to service_role;

-- Период сбора датами (date_from..date_to); week_start/weeks остаются для дип-линка на неделю.
alter table strelka.gatherings add column if not exists date_from date, add column if not exists date_to date;
update strelka.gatherings set date_from = week_start, date_to = week_start + weeks * 7 - 1 where date_from is null;
alter table strelka.gatherings alter column date_from set not null, alter column date_to set not null;

drop function if exists public.strelka_admin_open_gathering(text, date, uuid, text, int);
create or replace function public.strelka_admin_open_gathering(code text, date_from date, date_to date, initiated_by uuid, note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); x strelka.gatherings; ws date := date_from - (extract(isodow from date_from)::int - 1);
begin
  if date_to < date_from then raise exception 'bad_range'; end if;
  update strelka.gatherings set closed_at = now() where group_id = g and closed_at is null;
  insert into strelka.gatherings (group_id, week_start, weeks, date_from, date_to, initiated_by, note)
  values (g, ws, ceil((date_to - ws + 1) / 7.0)::int, date_from, date_to, initiated_by, note) returning * into x;
  return to_jsonb(x);
end $$;
revoke execute on function public.strelka_admin_open_gathering(text, date, date, uuid, text) from public, anon, authenticated;
grant execute on function public.strelka_admin_open_gathering(text, date, date, uuid, text) to service_role;

-- Точное время занятости в правиле (минуты от полуночи); слоты выводятся из пересечения.
alter table strelka.rules add column if not exists start_min int, add column if not exists end_min int;

create or replace function public.strelka_save_rule(code text, rule jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); rid uuid := (rule->>'id')::uuid; pid uuid := (rule->>'personId')::uuid;
  v_wd int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(rule->'weekdays') x), '{}');
  v_dates date[] := coalesce((select array_agg(x::date) from jsonb_array_elements_text(rule->'dates') x), '{}');
  v_slots text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(rule->'slots') x), '{}');
  v_start int := (rule->>'startMin')::int; v_end int := (rule->>'endMin')::int;
begin
  if not exists (select 1 from strelka.people where id = pid and group_id = g) then raise exception 'bad_person'; end if;
  if rid is not null then
    update strelka.rules set kind = rule->>'kind', title = rule->>'title', weekdays = v_wd, dates = v_dates, slots = v_slots, start_min = v_start, end_min = v_end
    where id = rid and group_id = g;
    return rid;
  end if;
  insert into strelka.rules (group_id, person_id, kind, title, weekdays, dates, slots, start_min, end_min)
  values (g, pid, rule->>'kind', rule->>'title', v_wd, v_dates, v_slots, v_start, v_end) returning id into rid;
  return rid;
end $$;

-- Telegram-идентификаторы участников (только для бота).
create or replace function public.strelka_admin_people_tg(code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'tgUserId', p.tg_user_id, 'tgUsername', p.tg_username, 'avatar', p.avatar_url) order by p.sort), '[]'::jsonb)
  from strelka.people p where p.group_id = strelka.gid(code)
$$;
revoke execute on function public.strelka_admin_people_tg(text) from public, anon, authenticated;
grant execute on function public.strelka_admin_people_tg(text) to service_role;

-- Границы времени сбора (минуты от полуночи, null — без ограничения).
alter table strelka.gatherings add column if not exists time_from int, add column if not exists time_to int;

drop function if exists public.strelka_admin_open_gathering(text, date, date, uuid, text);
create or replace function public.strelka_admin_open_gathering(code text, date_from date, date_to date, initiated_by uuid, note text, time_from int default null, time_to int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g uuid := strelka.gid(code); x strelka.gatherings; ws date := date_from - (extract(isodow from date_from)::int - 1);
begin
  if date_to < date_from then raise exception 'bad_range'; end if;
  update strelka.gatherings set closed_at = now() where group_id = g and closed_at is null;
  insert into strelka.gatherings (group_id, week_start, weeks, date_from, date_to, time_from, time_to, initiated_by, note)
  values (g, ws, ceil((date_to - ws + 1) / 7.0)::int, date_from, date_to, time_from, time_to, initiated_by, note) returning * into x;
  return to_jsonb(x);
end $$;
revoke execute on function public.strelka_admin_open_gathering(text, date, date, uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.strelka_admin_open_gathering(text, date, date, uuid, text, int, int) to service_role;

-- Аватар из Telegram (публичный URL в Supabase Storage, бакет avatars).
alter table strelka.people add column if not exists avatar_url text;
create or replace function public.strelka_admin_set_avatar(person_id uuid, url text) returns void
language sql security definer set search_path = '' as $$
  update strelka.people p set avatar_url = url where p.id = person_id
$$;
revoke execute on function public.strelka_admin_set_avatar(uuid, text) from public, anon, authenticated;
grant execute on function public.strelka_admin_set_avatar(uuid, text) to service_role;
