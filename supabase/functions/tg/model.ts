// Компактная копия модели доступности из фронта (src/lib/model.ts) для сводок в Telegram.
export type SlotId = 'm' | 'd' | 'e'
export interface Person { id: string; name: string; color: string; sort: number }
export interface Rule { personId: string; kind: 'recurring' | 'oneoff' | 'shift'; title: string; weekdays: number[]; dates: string[]; slots: SlotId[] }
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
export function weekLabel(weekStart: string): string {
  const a = parse(weekStart), b = addDays(a, 6)
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONG[a.getUTCMonth()]}` : `${a.getUTCDate()} ${MONG[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONG[b.getUTCMonth()]}`
}

export function isBusy(state: State, personId: string, dateKey: string, wd: number, slot: SlotId): boolean {
  const o = state.overrides.find((x) => x.personId === personId && x.date === dateKey && x.slot === slot)
  if (o) return o.busy
  return state.rules.some((r) => r.personId === personId && r.slots.includes(slot) && (r.kind === 'recurring' ? r.weekdays.includes(wd) : r.dates.includes(dateKey)))
}

export interface Win { date: string; slot: SlotId; free: Person[]; busy: Person[]; n: number }

export function windows(state: State, weekStart: string): Win[] {
  const today = dkey(todayMsk())
  const out: Win[] = []
  for (let i = 0; i < 7; i++) {
    const dateKey = dkey(addDays(parse(weekStart), i))
    if (dateKey < today) continue
    for (const slot of SLOTS) {
      const free = state.people.filter((p) => !isBusy(state, p.id, dateKey, i + 1, slot))
      const busy = state.people.filter((p) => !free.includes(p))
      out.push({ date: dateKey, slot, free, busy, n: free.length })
    }
  }
  return out.sort((a, b) => b.n - a.n || a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
}

export function winLabel(w: Win): string { return `${fmtDay(w.date)} ${SLOT_LABEL[w.slot]}` }
