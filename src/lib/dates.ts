import type { Day, Slot, SlotId } from './types'

export const SLOTS: Slot[] = [
  { id: 'm', label: 'Утро', hours: '6:00–12:00' },
  { id: 'd', label: 'День', hours: '12:00–18:00' },
  { id: 'e', label: 'Вечер', hours: '18:00–24:00' },
]
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<SlotId, Slot>
export const SLOT_ORDER: Record<SlotId, number> = { m: 0, d: 1, e: 2 }

export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DOWF = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const pad = (n: number) => String(n).padStart(2, '0')
export const dkey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function todayKey(): string {
  return dkey(new Date())
}

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const wd = (x.getDay() + 6) % 7
  return addDays(x, -wd)
}

export function weekStartKey(offset: number): string {
  return dkey(addDays(mondayOf(new Date()), offset * 7))
}

export function weekOffsetOf(weekStart: string): number {
  const ms = parseKey(weekStart).getTime() - mondayOf(new Date()).getTime()
  return Math.round(ms / (7 * 864e5))
}

export function weekDays(offset: number): Day[] {
  const monday = addDays(mondayOf(new Date()), offset * 7)
  const today = todayKey()
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    const key = dkey(d)
    return {
      key,
      wd: i + 1,
      dow: DOW[i],
      dowf: DOWF[i],
      num: d.getDate(),
      mong: MONG[d.getMonth()],
      today: key === today,
      past: key < today,
    }
  })
}

export function dayOf(key: string): Day {
  const d = parseKey(key)
  const today = todayKey()
  const wd = ((d.getDay() + 6) % 7) + 1
  return { key, wd, dow: DOW[wd - 1], dowf: DOWF[wd - 1], num: d.getDate(), mong: MONG[d.getMonth()], today: key === today, past: key < today }
}

export function weekLabel(offset: number, weeks = 1): string {
  const a = weekDays(offset)[0], b = weekDays(offset + weeks - 1)[6]
  return a.mong === b.mong ? `${a.num}–${b.num} ${a.mong}` : `${a.num} ${a.mong} – ${b.num} ${b.mong}`
}

export function fmtDay(key: string): string {
  const d = dayOf(key)
  return `${d.dow} ${d.num}`
}

export function fmtDayLong(key: string): string {
  const d = dayOf(key)
  return `${d.num} ${d.mong}`
}

/** Слот уже прошёл: день в прошлом или сегодня и его окно закончилось. */
export function slotPast(day: Day, slot: SlotId): boolean {
  if (day.past) return true
  if (!day.today) return false
  const h = new Date().getHours()
  return slot === 'm' ? h >= 12 : slot === 'd' ? h >= 18 : false
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  let d = parseKey(from)
  const end = parseKey(to < from ? from : to)
  while (d <= end) {
    out.push(dkey(d))
    d = addDays(d, 1)
  }
  return out
}
