// Компактная копия модели доступности из фронта (src/lib/model.ts) для сводок в Telegram.
export type SlotId = 'm' | 'd' | 'e'
export interface Person { id: string; name: string; color: string; sort: number }
export interface Rule { personId: string; kind: 'recurring' | 'oneoff' | 'shift'; title: string; weekdays: number[]; dates: string[]; slots: SlotId[]; startMin: number | null; endMin: number | null }
export interface Override { personId: string; date: string; slot: SlotId; busy: boolean }
export interface Meeting { id: string; date: string; slot: SlotId; title: string | null; place: string | null; canceledAt: string | null }
export interface State { group: { id: string; name: string; code: string }; people: Person[]; rules: Rule[]; overrides: Override[]; meetings: Meeting[] }

export const SLOT_LABEL: Record<SlotId, string> = { m: 'утро', d: 'день', e: 'вечер' }
export const SLOT_HOURS: Record<SlotId, string> = { m: '6–12', d: '12–18', e: '18–24' }
const SLOTS: SlotId[] = ['m', 'd', 'e']
const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MSK = 3 * 3600 * 1000

const pad = (n: number) => String(n).padStart(2, '0')
export function dkey(d: Date): string { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }
function parse(key: string): Date { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 864e5) }

/** Сегодня по Москве (в UTC-полночь). */
export function todayMsk(): Date { const t = new Date(Date.now() + MSK); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) }
export function mondayOf(d: Date): Date { return addDays(d, -((d.getUTCDay() + 6) % 7)) }
export function weekStartKey(offset: number): string { return dkey(addDays(mondayOf(todayMsk()), offset * 7)) }

export function fmtDay(key: string): string { const d = parse(key); return `${DOW[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}` }
export function fmtDayLong(key: string): string { const d = parse(key); return `${d.getUTCDate()} ${MONG[d.getUTCMonth()]}` }
export function weekLabel(weekStart: string, weeks = 1): string {
  const a = parse(weekStart), b = addDays(a, weeks * 7 - 1)
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONG[a.getUTCMonth()]}` : `${a.getUTCDate()} ${MONG[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONG[b.getUTCMonth()]}`
}

// Границы слотов и порог «занят» — как в src/lib/model.ts фронта.
const SLOT_RANGE: Record<SlotId, [number, number]> = { m: [360, 720], d: [720, 1080], e: [1080, 1440] }
const BUSY_MIN = 180
function ruleSlots(r: Rule): SlotId[] {
  if (r.startMin != null && r.endMin != null) return SLOTS.filter((sl) => { const [s, e] = SLOT_RANGE[sl]; return Math.min(e, r.endMin!) - Math.max(s, r.startMin!) >= BUSY_MIN })
  return r.slots
}

export function isBusy(state: State, personId: string, dateKey: string, wd: number, slot: SlotId): boolean {
  const o = state.overrides.find((x) => x.personId === personId && x.date === dateKey && x.slot === slot)
  if (o) return o.busy
  return state.rules.some((r) => r.personId === personId && ruleSlots(r).includes(slot) && (r.kind === 'recurring' ? r.weekdays.includes(wd) : r.dates.includes(dateKey)))
}

export interface Win { date: string; slot: SlotId; free: Person[]; busy: Person[]; n: number }

export function rangeLabel(from: string, to: string): string {
  const a = parse(from), b = parse(to)
  if (from === to) return `${a.getUTCDate()} ${MONG[a.getUTCMonth()]}`
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONG[a.getUTCMonth()]}` : `${a.getUTCDate()} ${MONG[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONG[b.getUTCMonth()]}`
}
export function addDaysKey(key: string, n: number): string { return dkey(addDays(parse(key), n)) }

export function windows(state: State, from: string, to: string): Win[] {
  const today = dkey(todayMsk())
  const out: Win[] = []
  for (let d = parse(from); d <= parse(to); d = addDays(d, 1)) {
    const dateKey = dkey(d)
    if (dateKey < today) continue
    const wd = ((d.getUTCDay() + 6) % 7) + 1
    for (const slot of SLOTS) {
      if (slot === 'm') continue // утром не встречаемся
      const free = state.people.filter((p) => !isBusy(state, p.id, dateKey, wd, slot))
      const busy = state.people.filter((p) => !free.includes(p))
      out.push({ date: dateKey, slot, free, busy, n: free.length })
    }
  }
  return out.sort((a, b) => b.n - a.n || tier(a) - tier(b) || a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
}

/** Вечер и выходной день — лучше всего, будний день — хуже (как meetTier во фронте). */
function tier(w: Win): number {
  const wd = ((parse(w.date).getUTCDay() + 6) % 7) + 1
  return w.slot === 'e' ? 0 : wd >= 6 ? 0 : 1
}

export function winLabel(w: Win): string { return `${fmtDay(w.date)} ${SLOT_LABEL[w.slot]}` }
