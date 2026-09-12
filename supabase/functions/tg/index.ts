// Стрелка · Telegram-бот и мост для Mini App.
// Вебхук Telegram (заголовок X-Telegram-Bot-Api-Secret-Token) и JSON-действия из приложения ({action: ...}).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { type State, SLOT_HOURS, SLOT_LABEL, addDaysKey, dkey, fmtDay, fmtDayLong, rangeLabel, timeLabel, todayMsk, weekStartKey, winLabel, windows } from './model.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const HOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/?$/, '/')
const BOT_USERNAME = Deno.env.get('BOT_USERNAME') ?? ''
const APP_SHORT = Deno.env.get('TG_APP_SHORT_NAME') ?? ''

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}
const state = (code: string) => rpc<State>('strelka_state', { code })

async function tgApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description}`)
  return data.result as T
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------- Mini App: проверка initData ---------- */
async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))
}
async function verifyInitData(initData: string): Promise<{ id: number; first_name: string; username?: string }> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) throw new Error('no_hash')
  params.delete('hash')
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = await hmac(new TextEncoder().encode('WebAppData'), BOT_TOKEN)
  const sig = [...new Uint8Array(await hmac(secret, check))].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (sig !== hash) throw new Error('bad_signature')
  if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400 * 7) throw new Error('stale')
  return JSON.parse(params.get('user') ?? '{}')
}

/* ---------- ссылки ---------- */
function openLink(gatheringId: string | null, code: string, weekStart: string): string {
  if (BOT_USERNAME && APP_SHORT) return `https://t.me/${BOT_USERNAME}/${APP_SHORT}?startapp=${gatheringId ? 'g_' + gatheringId : 'j_' + code}`
  return `${APP_URL}#/j/${code}/w/${weekStart}`
}
const keyboard = (gatheringId: string | null, code: string, weekStart: string) => ({
  inline_keyboard: [[{ text: '📝 Отметить, когда могу', url: openLink(gatheringId, code, weekStart) }]],
})

/* ---------- упоминания ---------- */
interface TgPerson { id: string; name: string; tgUserId: number | null; tgUsername: string | null }
const peopleTg = (code: string) => rpc<TgPerson[]>('strelka_admin_people_tg', { code })
/** Имя с упоминанием, если человек привязан к Telegram (упоминание по id работает и без username). */
function mention(p: { id: string; name: string }, tg: TgPerson[]): string {
  const t = tg.find((x) => x.id === p.id)
  return t?.tgUserId ? `<a href="tg://user?id=${t.tgUserId}">${esc(p.name)}</a>` : esc(p.name)
}

/* ---------- аватар из Telegram → Storage ---------- */
async function syncAvatar(personId: string, tgUserId: number) {
  try {
    const photos = await tgApi<{ total_count: number; photos: { file_id: string; file_unique_id: string; width: number }[][] }>('getUserProfilePhotos', { user_id: tgUserId, limit: 1 })
    const sizes = photos.photos[0]
    if (!sizes?.length) return
    const pick = sizes.find((x) => x.width >= 160) ?? sizes[sizes.length - 1]
    const file = await tgApi<{ file_path: string }>('getFile', { file_id: pick.file_id })
    const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`)
    if (!res.ok) return
    const bytes = new Uint8Array(await res.arrayBuffer())
    const path = `${personId}.jpg`
    const { error } = await sb.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
    if (error) { console.error('avatar upload', error); return }
    const url = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/avatars/${path}?v=${pick.file_unique_id}`
    await rpc('strelka_admin_set_avatar', { person_id: personId, url })
  } catch (e) { console.error('avatar', e) }
}

/* ---------- сводка сбора ---------- */
interface Gathering { id: string; group_id: string; week_start: string; weeks: number; date_from: string; date_to: string; time_from: number | null; time_to: number | null; initiated_by: string | null; note: string | null; responded: string[]; tg_message_id: number | null; all_notified_at: string | null; closed_at: string | null }

function summary(st: State, g: Gathering, tg: TgPerson[]): string {
  const total = st.people.length
  const by = st.people.find((p) => p.id === g.initiated_by)
  const responded = st.people.filter((p) => g.responded.includes(p.id))
  const waiting = st.people.filter((p) => !g.responded.includes(p.id))
  const wins = windows(st, g.date_from, g.date_to, g.time_from, g.time_to)
  const all = wins.filter((w) => w.n === total).sort((a, b) => a.date.localeCompare(b.date))
  const tl = timeLabel(g.time_from, g.time_to)
  const lines = [
    `📣 <b>Собираемся?</b> ${by ? esc(by.name) + ' предлагает' : 'Предложение'} встретиться: <b>${rangeLabel(g.date_from, g.date_to)}${tl ? `, ${tl}` : ''}</b>.`,
    g.note ? `<i>${esc(g.note)}</i>` : '',
    '',
    responded.length ? `Отметились: ${responded.map((p) => esc(p.name) + ' ✓').join(' · ')}` : 'Пока никто не отметился.',
    waiting.length ? `Ждём: ${waiting.map((p) => mention(p, tg)).join(', ')}` : '<b>Все отметились!</b>',
    '',
  ]
  if (all.length) lines.push(`🟢 Окна для всех: ${all.slice(0, 8).map((w) => `<b>${winLabel(w)}</b>`).join(', ')}${all.length > 8 ? ` и ещё ${all.length - 8}` : ''}`)
  else {
    const best = wins.slice(0, 3).filter((w) => w.n >= total - 2)
    lines.push(best.length ? `🟡 Окна для всех пока нет. Лучшие: ${best.map((w) => `${winLabel(w)} (${w.n}/${total}, без ${w.busy.map((p) => esc(p.name)).join(', ')})`).join('; ')}` : '🔴 Свободных окон почти нет — отметьте, где всё-таки можете.')
  }
  return lines.join('\n')
}

async function postGathering(code: string, g: Gathering, chatId: number) {
  const st = await state(code)
  const text = summary(st, g, await peopleTg(code))
  if (g.tg_message_id) {
    try { await tgApi('editMessageText', { chat_id: chatId, message_id: g.tg_message_id, text, parse_mode: 'HTML', reply_markup: keyboard(g.id, code, g.week_start) }) } catch (e) { if (!String(e).includes('not modified')) throw e }
  } else {
    const m = await tgApi<{ message_id: number }>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: keyboard(g.id, code, g.week_start) })
    await rpc('strelka_admin_gathering_update', { gathering_id: g.id, tg_message_id: m.message_id })
  }
  // все отметились → отдельное сообщение один раз
  if (st.people.every((p) => g.responded.includes(p.id)) && !g.all_notified_at) {
    const wins = windows(st, g.date_from, g.date_to, g.time_from, g.time_to), total = st.people.length
    const all = wins.filter((w) => w.n === total).sort((a, b) => a.date.localeCompare(b.date))
    const text2 = all.length
      ? `✅ Все отметились! Окно для всех: <b>${winLabel(all[0])}</b>${all.length > 1 ? ` (ещё: ${all.slice(1, 4).map(winLabel).join(', ')})` : ''}. Забивайте в приложении.`
      : `✅ Все отметились, но окна для всех пятерых нет. Лучшее: <b>${winLabel(wins[0])}</b> — без ${wins[0].busy.map((p) => esc(p.name)).join(', ')}. Решайте в чате или подвиньте планы.`
    await tgApi('sendMessage', { chat_id: chatId, text: text2, parse_mode: 'HTML', reply_markup: keyboard(g.id, code, g.week_start) })
    await rpc('strelka_admin_gathering_update', { gathering_id: g.id, mark_all_notified: true })
  }
}

async function cancelGathering(code: string, chatId: number, byPersonId: string | null) {
  const g = await rpc<Gathering | null>('strelka_admin_open_gathering_of', { code })
  if (!g) return false
  await rpc('strelka_admin_gathering_update', { gathering_id: g.id, close: true })
  const st = await state(code)
  const by = st.people.find((p) => p.id === byPersonId)
  const text = `❌ <b>Сбор отменён</b>${by ? ` — ${esc(by.name)}` : ''}. Период: ${rangeLabel(g.date_from, g.date_to)}.`
  if (g.tg_message_id) {
    try { await tgApi('editMessageText', { chat_id: chatId, message_id: g.tg_message_id, text, parse_mode: 'HTML' }) } catch { await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' }) }
  } else await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' })
  return true
}

async function startGathering(code: string, chatId: number, initiatedBy: string | null, from: string, to: string, note: string | null, timeFrom: number | null = null, timeTo: number | null = null) {
  const g = await rpc<Gathering>('strelka_admin_open_gathering', { code, date_from: from, date_to: to, initiated_by: initiatedBy, note: note || null, time_from: timeFrom, time_to: timeTo })
  // инициатор сам ещё не отметился — но его правила уже учтены; считаем, что он «в курсе»
  const g2 = initiatedBy ? await rpc<Gathering>('strelka_admin_gathering_update', { gathering_id: g.id, add_responded: initiatedBy }) : g
  await postGathering(code, g2, chatId)
  return g2
}

/* ---------- разбор дат из команды ---------- */
const MON_RX = /(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)/i
const MON_IDX: Record<string, number> = { янв: 0, фев: 1, мар: 2, апр: 3, май: 4, мая: 4, июн: 5, июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11 }
interface Tok { day: number; month: number | null; year: number | null; raw: string }

/** Находит в тексте до двух дат: «14», «14.09», «14.09.2026», «14 сентября». */
function dateTokens(text: string): Tok[] {
  const out: Tok[] = []
  const rx = /(\d{1,2})(?:[./](\d{1,2})(?:[./](\d{4}))?)?(?:\s*(янв\w*|фев\w*|мар\w*|апр\w*|ма[йя]|июн\w*|июл\w*|авг\w*|сен\w*|окт\w*|ноя\w*|дек\w*))?/gi
  for (const m of text.matchAll(rx)) {
    const day = Number(m[1])
    if (!day || day > 31) continue
    let month: number | null = m[2] ? Number(m[2]) - 1 : null
    if (m[4]) month = MON_IDX[m[4].slice(0, 3).toLowerCase()] ?? MON_IDX[m[4].toLowerCase()] ?? month
    out.push({ day, month, year: m[3] ? Number(m[3]) : null, raw: m[0] })
    if (out.length === 2) break
  }
  return out
}

/** «14-20», «14.09–20.09», «с 14 по 20 сентября», «19» → {from, to, rest}; null, если дат нет. */
function parseRange(text: string): { from: string; to: string; rest: string } | null {
  const toks = dateTokens(text)
  if (!toks.length) return null
  const today = todayMsk()
  const y0 = today.getUTCFullYear(), m0 = today.getUTCMonth()
  const [a, b] = toks
  // месяц берём явный, иначе — от соседнего токена, иначе текущий (или следующий, если день уже прошёл)
  let ma = a.month ?? b?.month ?? m0
  if (a.month == null && b?.month == null && a.day < today.getUTCDate()) ma = m0 + 1
  const mb = b ? (b.month ?? ma) : ma
  const mk = (d: number, m: number, y: number | null) => { const dt = new Date(Date.UTC(y ?? y0, m, d)); return dkey(dt) }
  let from = mk(a.day, ma, a.year), to = b ? mk(b.day, mb, b.year ?? a.year) : from
  if (to < from) { const t = to; to = from; from = t }
  let rest = text
  for (const t of toks) rest = rest.replace(t.raw, ' ')
  rest = rest.replace(/\b(с|по|до|c|-|–|—)\b/gi, ' ').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim()
  return { from, to, rest }
}

function gatherPrompt(code: string, weekStart: string) {
  const today = dkey(todayMsk())
  const sunday = addDaysKey(weekStartKey(0), 6)
  const nextMon = weekStartKey(1)
  const rows: { text: string; callback_data?: string; url?: string }[][] = []
  if (today < sunday) rows.push([{ text: `До конца недели · ${rangeLabel(today, sunday)}`, callback_data: `g:${today}:${sunday}` }])
  rows.push([{ text: `Следующая неделя · ${rangeLabel(nextMon, addDaysKey(nextMon, 6))}`, callback_data: `g:${nextMon}:${addDaysKey(nextMon, 6)}` }])
  rows.push([{ text: `Две недели · ${rangeLabel(nextMon, addDaysKey(nextMon, 13))}`, callback_data: `g:${nextMon}:${addDaysKey(nextMon, 13)}` }])
  rows.push([{ text: `Месяц · ${rangeLabel(today, addDaysKey(today, 30))}`, callback_data: `g:${today}:${addDaysKey(today, 30)}` }])
  rows.push([{ text: '📅 Выбрать даты в календаре', url: BOT_USERNAME && APP_SHORT ? `https://t.me/${BOT_USERNAME}/${APP_SHORT}?startapp=gather` : `${APP_URL}#/j/${code}/g` }])
  rows.push([{ text: '✕ Не сейчас', callback_data: 'g:cancel' }])
  return { text: `На какие даты ищем окно? Можно и текстом: <code>/strelka 14-20</code> или <code>/strelka с 14 по 20 сентября бар?</code>`, keyboard: { inline_keyboard: rows }, weekStart }
}

/* ---------- вебхук Telegram ---------- */
interface TgUser { id: number; first_name: string; username?: string }
interface TgUpdate {
  message?: { message_id: number; text?: string; chat: { id: number; type: string }; from?: TgUser }
  callback_query?: { id: string; data?: string; from: TgUser; message?: { message_id: number; chat: { id: number } } }
}

/** Участник по tg-аккаунту; если не привязан — автопривязка по уникальному имени. */
async function resolvePerson(code: string, from: TgUser): Promise<{ personId: string } | null> {
  const p = await rpc<{ personId: string } | null>('strelka_admin_person_by_tg', { tg_user_id: from.id })
  if (p) { void syncAvatar(p.personId, from.id); return p }
  const tg = await peopleTg(code)
  const same = tg.filter((x) => !x.tgUserId && x.name.trim().toLowerCase() === from.first_name.trim().toLowerCase())
  if (same.length !== 1) return null
  await rpc('strelka_admin_bind_tg', { code, person_id: same[0].id, tg_user_id: from.id, tg_username: from.username ?? null })
  await syncAvatar(same[0].id, from.id)
  return { personId: same[0].id }
}

async function handleCallback(q: NonNullable<TgUpdate['callback_query']>) {
  const chatId = q.message?.chat.id
  const data = q.data ?? ''
  if (!chatId || !data.startsWith('g:')) { await tgApi('answerCallbackQuery', { callback_query_id: q.id }); return }
  if (data === 'g:cancel') {
    await tgApi('answerCallbackQuery', { callback_query_id: q.id })
    if (q.message) await tgApi('deleteMessage', { chat_id: chatId, message_id: q.message.message_id }).catch(() => {})
    return
  }
  const [, from, to] = data.split(':')
  const g = await rpc<{ id: string; code: string; name: string } | null>('strelka_admin_group_by_chat', { chat_id: chatId })
  if (!g) { await tgApi('answerCallbackQuery', { callback_query_id: q.id, text: 'Чат не привязан' }); return }
  const p = await resolvePerson(g.code, q.from)
  await tgApi('answerCallbackQuery', { callback_query_id: q.id, text: 'Запускаю сбор' })
  if (q.message) await tgApi('deleteMessage', { chat_id: chatId, message_id: q.message.message_id }).catch(() => {})
  await startGathering(g.code, chatId, p?.personId ?? null, from, to, null)
}

async function handleUpdate(u: TgUpdate) {
  const m = u.message
  if (!m?.text || !m.from) return
  const chatId = m.chat.id
  const [cmdRaw, ...rest] = m.text.trim().split(/\s+/)
  const cmd = cmdRaw.replace(/@\w+$/, '').toLowerCase()
  const args = rest.join(' ')

  if (cmd === '/link') {
    if (!args) { await tgApi('sendMessage', { chat_id: chatId, text: 'Нужен код: /link <код из раздела «Мы»>' }); return }
    try {
      const g = await rpc<{ name: string }>('strelka_admin_link_chat', { code: args, chat_id: chatId })
      await tgApi('sendMessage', { chat_id: chatId, text: `Готово: чат привязан к «${g.name}». Команда /strelka запускает сбор.` })
    } catch { await tgApi('sendMessage', { chat_id: chatId, text: 'Код не подошёл. Скопируй его из раздела «Мы» в приложении.' }) }
    return
  }

  if (cmd === '/start' && m.chat.type === 'private') {
    const p = await rpc<{ code: string; personId: string; name: string } | null>('strelka_admin_person_by_tg', { tg_user_id: m.from.id })
    const code = p?.code ?? (args.startsWith('j_') ? args.slice(2) : null)
    if (!code) { await tgApi('sendMessage', { chat_id: chatId, text: 'Привет! Открой Стрелку по кнопке из вашей беседы — там я пойму, кто ты.' }); return }
    const btn = BOT_USERNAME && APP_SHORT ? { text: 'Открыть Стрелку', web_app: { url: APP_URL } } : { text: 'Открыть Стрелку', url: `${APP_URL}#/j/${code}` }
    await tgApi('sendMessage', { chat_id: chatId, text: p ? `Привет, ${p.name}!` : 'Привет!', reply_markup: { inline_keyboard: [[btn]] } })
    return
  }

  if (cmd === '/help' || (cmd === '/start' && m.chat.type !== 'private')) {
    await tgApi('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: [
      '<b>Стрелка</b> — когда собираемся?',
      '/strelka — выбрать даты кнопками',
      '/strelka 14-20 — сбор на эти числа (можно «с 14 по 20 сентября», «14.09–20.09», одно число)',
      '/strelka след · /strelka месяц — следующая неделя / 30 дней',
      '/strelka отмена — отменить текущий сбор',
      'Отмечать занятость и забивать встречу — в приложении по кнопке из сбора.',
    ].join('\n') })
    return
  }

  if (cmd === '/strelka' || cmd === '/meet' || cmd === '/сбор') {
    const g = await rpc<{ id: string; code: string; name: string } | null>('strelka_admin_group_by_chat', { chat_id: chatId })
    if (!g) { await tgApi('sendMessage', { chat_id: chatId, text: 'Чат ещё не привязан: напиши /link <код> (код — в разделе «Мы» приложения).' }); return }
    const p = await resolvePerson(g.code, m.from)
    if (/^(отмена|cancel)$/i.test(args.trim())) {
      const ok = await cancelGathering(g.code, chatId, p?.personId ?? null)
      if (!ok) await tgApi('sendMessage', { chat_id: chatId, text: 'Открытого сбора нет.' })
      return
    }
    // даты в команде → сразу сбор; иначе — спросить кнопками
    const today = dkey(todayMsk())
    const range = parseRange(args)
    if (range) { await startGathering(g.code, chatId, p?.personId ?? null, range.from, range.to, range.rest || null); return }
    if (/\bслед\w*|\bnext\b/i.test(args)) { const f = weekStartKey(1); await startGathering(g.code, chatId, p?.personId ?? null, f, addDaysKey(f, 6), args.replace(/\b(след\w*|next)\b/gi, '').trim() || null); return }
    if (/\bмесяц\b|\bmonth\b/i.test(args)) { await startGathering(g.code, chatId, p?.personId ?? null, today, addDaysKey(today, 30), args.replace(/\b(месяц|month)\b/gi, '').trim() || null); return }
    const pr = gatherPrompt(g.code, weekStartKey(0))
    await tgApi('sendMessage', { chat_id: chatId, text: pr.text, parse_mode: 'HTML', reply_markup: pr.keyboard })
    return
  }
}

/* ---------- действия приложения ---------- */
async function handleAction(body: Record<string, unknown>) {
  const a = String(body.action)
  const code = typeof body.code === 'string' ? body.code : null

  if (a === 'auth') {
    const user = await verifyInitData(String(body.initData))
    const p = await rpc<{ code: string; personId: string } | null>('strelka_admin_person_by_tg', { tg_user_id: user.id })
    if (p) await syncAvatar(p.personId, user.id)
    const sp = typeof body.startParam === 'string' ? body.startParam : ''
    let resolved = p?.code ?? code ?? null, weekStart: string | null = null
    if (sp.startsWith('g_')) {
      const { data } = await sb.rpc('strelka_admin_gathering_get', { gathering_id: sp.slice(2) })
      if (data) { resolved = data.code; weekStart = data.week_start }
    } else if (sp.startsWith('j_')) resolved = sp.slice(2)
    return { code: resolved, personId: p?.personId ?? null, weekStart }
  }
  if (a === 'bind') {
    const user = await verifyInitData(String(body.initData))
    await rpc('strelka_admin_bind_tg', { code, person_id: body.personId, tg_user_id: user.id, tg_username: user.username ?? null })
    await syncAvatar(String(body.personId), user.id)
    return { ok: true }
  }
  if (!code) throw new Error('no_code')
  const info = await rpc<{ chatId: number | null }>('strelka_admin_group_info', { code })
  if (!info?.chatId) throw new Error('Бот не подключён к беседе — см. раздел «Мы»')

  if (a === 'gather') {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const g = await startGathering(code, info.chatId, String(body.personId), String(body.from), String(body.to), body.note ? String(body.note) : null, num(body.timeFrom), num(body.timeTo))
    return { gatheringId: g.id }
  }
  if (a === 'sync_avatars') {
    const tg = await peopleTg(code)
    await Promise.all(tg.filter((x) => x.tgUserId).map((x) => syncAvatar(x.id, x.tgUserId!)))
    return { ok: true }
  }
  if (a === 'cancel_gathering') {
    await cancelGathering(code, info.chatId, String(body.personId))
    return { ok: true }
  }
  if (a === 'touch') {
    const g = await rpc<Gathering | null>('strelka_admin_open_gathering_of', { code })
    if (!g) return { ok: true }
    // respond=true — человек нажал «я отметился»; иначе просто обновляем сводку
    const g2 = body.respond ? await rpc<Gathering>('strelka_admin_gathering_update', { gathering_id: g.id, add_responded: body.personId }) : g
    await postGathering(code, g2, info.chatId)
    return { ok: true }
  }
  if (a === 'booked' || a === 'canceled') {
    const st = await state(code)
    const m = st.meetings.find((x) => x.id === body.meetingId)
    if (!m) return { ok: true }
    const when = `<b>${fmtDay(m.date)}, ${SLOT_LABEL[m.slot]}</b> (${fmtDayLong(m.date)}, ${SLOT_HOURS[m.slot]})`
    if (a === 'booked') {
      const g = await rpc<Gathering | null>('strelka_admin_open_gathering_of', { code })
      await tgApi('sendMessage', { chat_id: info.chatId, text: `🎉 Забили: ${when}${m.title ? ` — ${esc(m.title)}` : ''}${m.place ? `, ${esc(m.place)}` : ''}. Не проспите!` })
      if (g) await rpc('strelka_admin_gathering_update', { gathering_id: g.id, close: true })
    } else {
      await tgApi('sendMessage', { chat_id: info.chatId, text: `❌ Встреча ${when} отменена.` })
    }
    return { ok: true }
  }
  throw new Error('unknown_action')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const hookHeader = req.headers.get('x-telegram-bot-api-secret-token')
  if (hookHeader) {
    if (!HOOK_SECRET || hookHeader !== HOOK_SECRET) return json({ error: 'forbidden' }, 403)
    try {
      const u = (await req.json()) as TgUpdate
      if (u.callback_query) await handleCallback(u.callback_query); else await handleUpdate(u)
    } catch (e) { console.error('update', e) }
    return json({ ok: true })
  }
  try {
    return json(await handleAction(await req.json()))
  } catch (e) {
    console.error('action', e)
    return json({ error: (e as Error).message }, 400)
  }
})
