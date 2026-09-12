# Стрелка

Приложение для одной компании друзей: кто когда свободен и когда собираемся. Работает как сайт (GitHub Pages) и как Telegram Mini App.

- **Фронт**: Vite + React + TypeScript, без UI-библиотек (`src/`).
- **Бэкенд**: Supabase — таблицы в закрытой схеме `strelka`, наружу только RPC-функции с проверкой invite-кода (`supabase/schema.sql`, `supabase/telegram.sql`).
- **Бот**: Edge Function `supabase/functions/tg` — вебхук Telegram и действия из приложения (сбор, сводка, «забили»).
- **Хостинг**: GitHub Pages через `.github/workflows/deploy.yml`.

## Локально

```bash
cp .env.example .env.local   # подставить URL и publishable key
npm i
npm run dev
```

Вход — по ссылке `…/#/j/<invite-код>`; код группы лежит в разделе «Мы».

## Бот

```bash
SUPABASE_ACCESS_TOKEN=… npx supabase functions deploy tg --project-ref <ref> --no-verify-jwt
```

Секреты функции: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `APP_URL`, `BOT_USERNAME`, `TG_APP_SHORT_NAME`.
Вебхук: `https://api.telegram.org/bot<token>/setWebhook?url=<functions-url>/tg&secret_token=<secret>`.
В беседе: `/link <код>` — привязать чат, `/strelka [след] [повод]` — запустить сбор.
