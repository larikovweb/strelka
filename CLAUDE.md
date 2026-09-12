# Стрелка — контекст проекта

Личный проект: планировщик встреч для компании из пяти друзей. Mobile-first, десктоп — производный.

## Стек
- `src/` — Vite + React 19 + TS, без роутера и UI-библиотек; стили в `src/styles.css` (токены в `:root`, mobile-first, десктоп в `@media (min-width:900px)`).
- Состояние — `src/lib/store.tsx` (контекст), модель доступности — `src/lib/model.ts`, даты — `src/lib/dates.ts`.
- Supabase project `nlqqthtgqzybgipcrjyo`: таблицы в схеме `strelka` (не экспонирована), доступ только через `public.strelka_*` RPC по invite-коду; `strelka_admin_*` — только service_role (для бота). SQL — `supabase/schema.sql` + `supabase/telegram.sql`, применяется через Management API (`POST /v1/projects/<ref>/database/query`, нужен `User-Agent`).
- Edge Function `tg` — бот и мост Mini App (`supabase/functions/tg`). Деплой: `npx supabase functions deploy tg --project-ref … --no-verify-jwt`.
- Деплой фронта — GitHub Pages, base `/strelka/`, роутинг через hash (`#/j/<code>[/w/<date>]`).

## Секреты
`.env.local` (publishable key) и `.env.secrets` (пароль БД, invite-код) — gitignored. PAT Supabase — в vault `60_Resources/powwow-secrets.md`.

## Правила
- Никаких логинов/регистраций: личность = выбранный человек в localStorage или tg-аккаунт в Mini App.
- Все изменения — оптимистично в сторе, затем RPC, затем `strelka_state` заново; другим клиентам — broadcast `changed`.
- В PL/pgSQL параметры не должны совпадать с именами колонок (см. `p_*` в `strelka_set_override`).
