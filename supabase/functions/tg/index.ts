// Стрелка · Telegram-бот и мост для Mini App.
// Вебхук Telegram (заголовок X-Telegram-Bot-Api-Secret-Token) и JSON-действия из приложения ({action: ...}).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { type State, SLOT_HOURS, SLOT_LABEL, fmtDay, fmtDayLong, weekLabel, weekStartKey, winLabel, windows } from './model.ts'

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

/* ---------- сводка сбора ---------- */
interface Gathering { id: string; group_id: string; week_start: string; weeks: number; initiated_by: string | null; note: string | null; responded: string[]; tg_message_id: number | null; all_notified_at: string | null; closed_at: string | null }

function summary(st: State, g: Gathering): string {
  const total = st.people.length
  const by = st.people.find((p) => p.id === g.initiated_by)
  const responded = st.people.filter((p) => g.responded.includes(p.id))
  const waiting = st.people.filter((p) => !g.responded.includes(p.id))
  const wins = windows(st, g.week_start, g.weeks)
  const all = wins.filter((w) => w.n === total).sort((a, b) => a.date.localeCompare(b.date))
  const lines = [
    `📣 <b>Собираемся?</b> ${by ? esc(by.name) + ' предлагает' : 'Предложение'} встретиться ${g.weeks > 1 ? 'в период' : 'на неделе'} <b>${weekLabel(g.week_start, g.weeks)}</b>.`,
    g.note ? `<i>${esc(g.note)}</i>` : '',
    '',
    responded.length ? `Отметились: ${responded.map((p) => esc(p.name) + ' ✓').join(' · ')}` : 'Пока никто не отметился.',
    waiting.length ? `Ждём: ${waiting.map((p) => esc(p.name)).join(', ')}` : '<b>Все отметились!</b>',
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
  const text = summary(st, g)
  if (g.tg_message_id) {
    try { await tgApi('editMessageText', { chat_id: chatId, message_id: g.tg_message_id, text, parse_mode: 'HTML', reply_markup: keyboard(g.id, code, g.week_start) }) } catch (e) { if (!String(e).includes('not modified')) throw e }
  } else {
    const m = await tgApi<{ message_id: number }>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: keyboard(g.id, code, g.week_start) })
    await rpc('strelka_admin_gathering_update', { gathering_id: g.id, tg_message_id: m.message_id })
  }
  // все отметились → отдельное сообщение один раз
  if (st.people.every((p) => g.responded.includes(p.id)) && !g.all_notified_at) {
    const wins = windows(st, g.week_start, g.weeks), total = st.people.length
    const all = wins.filter((w) => w.n === total).sort((a, b) => a.date.localeCompare(b.date))
    const text2 = all.length
      ? `✅ Все отметились! Окно для всех: <b>${winLabel(all[0])}</b>${all.length > 1 ? ` (ещё: ${all.slice(1, 4).map(winLabel).join(', ')})` : ''}. Забивайте в приложении.`
      : `✅ Все отметились, но окна для всех пятерых нет. Лучшее: <b>${winLabel(wins[0])}</b> — без ${wins[0].busy.map((p) => esc(p.name)).join(', ')}. Решайте в чате или подвиньте планы.`
    await tgApi('sendMessage', { chat_id: chatId, text: text2, parse_mode: 'HTML', reply_markup: keyboard(g.id, code, g.week_start) })
    await rpc('strelka_admin_gathering_update', { gathering_id: g.id, mark_all_notified: true })
  }
}

async function startGathering(code: string, chatId: number, initiatedBy: string | null, weekOffset: number, weeks: number, note: string | null) {
  const weekStart = weekStartKey(weekOffset)
  const g = await rpc<Gathering>('strelka_admin_open_gathering', { code, week_start: weekStart, weeks: Math.min(8, Math.max(1, weeks)), initiated_by: initiatedBy, note: note || null })
  // инициатор сам ещё не отметился — но его правила уже учтены; считаем, что он «в курсе»
  const g2 = initiatedBy ? await rpc<Gathering>('strelka_admin_gathering_update', { gathering_id: g.id, add_responded: initiatedBy }) : g
  await postGathering(code, g2, chatId)
  return g2
}

/* ---------- вебхук Telegram ---------- */
interface TgUpdate { message?: { message_id: number; text?: string; chat: { id: number; type: string }; from?: { id: number; first_name: string; username?: string } } }

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

  if (cmd === '/strelka' || cmd === '/meet' || cmd === '/сбор') {
    const g = await rpc<{ id: string; code: string; name: string } | null>('strelka_admin_group_by_chat', { chat_id: chatId })
    if (!g) { await tgApi('sendMessage', { chat_id: chatId, text: 'Чат ещё не привязан: напиши /link <код> (код — в разделе «Мы» приложения).' }); return }
    const p = await rpc<{ personId: string } | null>('strelka_admin_person_by_tg', { tg_user_id: m.from.id })
    // /strelka [след] [месяц] [повод]
    const next = /\bслед\w*|\bnext\b/i.test(args)
    const month = /\bмесяц\b|\bmonth\b/i.test(args)
    const note = args.replace(/\b(след\w*|next|месяц|month)\b/gi, '').replace(/\s+/g, ' ').trim()
    await startGathering(g.code, chatId, p?.personId ?? null, next ? 1 : 0, month ? 4 : 1, note)
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
    return { ok: true }
  }
  if (!code) throw new Error('no_code')
  const info = await rpc<{ chatId: number | null }>('strelka_admin_group_info', { code })
  if (!info?.chatId) throw new Error('Бот не подключён к беседе — см. раздел «Мы»')

  if (a === 'gather') {
    const g = await startGathering(code, info.chatId, String(body.personId), Number(body.weekOffset ?? 0), Number(body.weeks ?? 1), body.note ? String(body.note) : null)
    return { gatheringId: g.id }
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
    try { await handleUpdate(await req.json()) } catch (e) { console.error('update', e) }
    return json({ ok: true })
  }
  try {
    return json(await handleAction(await req.json()))
  } catch (e) {
    console.error('action', e)
    return json({ error: (e as Error).message }, 400)
  }
})
