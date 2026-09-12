import { SLOTS, SLOT_ORDER, slotPast, weekDays } from './dates'
import type { Cell, Day, Entry, GroupState, Meeting, Person, Rule, SlotId } from './types'

export const KIND_LABEL: Record<Entry['kind'], string> = {
  recurring: 'каждую неделю',
  oneoff: 'разово',
  shift: 'смена',
  manual: 'отмечено вручную',
}

/** Границы слотов в минутах от полуночи. */
export const SLOT_RANGE: Record<SlotId, [number, number]> = { m: [360, 720], d: [720, 1080], e: [1080, 1440] }
/** Слот считается занятым, если пересечение с точным временем ≥ 3 часов. */
export const BUSY_MIN = 180

export const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function overlap(startMin: number, endMin: number, slot: SlotId): number {
  const [s, e] = SLOT_RANGE[slot]
  return Math.max(0, Math.min(e, endMin) - Math.max(s, startMin))
}

/** Слоты, которые правило занимает: из точного времени или из явного списка. */
export function ruleSlots(r: Pick<Rule, 'slots' | 'startMin' | 'endMin'>): SlotId[] {
  if (r.startMin != null && r.endMin != null) return (Object.keys(SLOT_RANGE) as SlotId[]).filter((sl) => overlap(r.startMin!, r.endMin!, sl) >= BUSY_MIN)
  return r.slots
}

/** Частичная занятость слота точным временем: «занят до 19:00» / «занят с 20:00». */
export function partialNote(r: Rule, slot: SlotId): string | null {
  if (r.startMin == null || r.endMin == null) return null
  const ov = overlap(r.startMin, r.endMin, slot)
  if (ov <= 0 || ov >= BUSY_MIN) return null
  const [s, e] = SLOT_RANGE[slot]
  if (r.startMin <= s) return `${r.title.toLowerCase()} до ${fmtMin(Math.min(e, r.endMin))}`
  if (r.endMin >= e) return `${r.title.toLowerCase()} с ${fmtMin(r.startMin)}`
  return `${r.title.toLowerCase()} ${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`
}

export const initials = (p: Person) => p.name.trim()[0]?.toUpperCase() ?? '?'

export function genitive(name: string): string {
  const n = name.trim()
  if (/я$/i.test(n)) return n.slice(0, -1) + 'и'
  if (/а$/i.test(n)) return n.slice(0, -1) + (/[кгхжшчщ]а$/i.test(n) ? 'и' : 'ы')
  if (/[йь]$/i.test(n)) return n.slice(0, -1) + 'я'
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(n)) return n + 'а'
  return n
}

function ruleApplies(r: Rule, day: Day): boolean {
  return r.kind === 'recurring' ? r.weekdays.includes(day.wd) : r.dates.includes(day.key)
}

const withTime = (r: Rule, kind: Entry['kind']): Entry => ({ title: r.title, kind, time: r.startMin != null && r.endMin != null ? `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}` : undefined })

export function baseEntry(state: GroupState, personId: string, day: Day, slot: SlotId): Entry | null {
  const mine = state.rules.filter((r) => r.personId === personId && ruleApplies(r, day) && ruleSlots(r).includes(slot))
  const one = mine.find((r) => r.kind !== 'recurring')
  if (one) return withTime(one, one.kind)
  const rec = mine.find((r) => r.kind === 'recurring')
  return rec ? withTime(rec, 'recurring') : null
}

/** Пометка для свободного слота, если точное время правила задевает его меньше чем на 3 часа. */
export function freeNote(state: GroupState, personId: string, day: Day, slot: SlotId): string | null {
  const o = state.overrides.find((x) => x.personId === personId && x.date === day.key && x.slot === slot)
  if (o) return null
  for (const r of state.rules) {
    if (r.personId !== personId || !ruleApplies(r, day)) continue
    const n = partialNote(r, slot)
    if (n) return n
  }
  return null
}

export function entry(state: GroupState, personId: string, day: Day, slot: SlotId): Entry | null {
  const o = state.overrides.find((x) => x.personId === personId && x.date === day.key && x.slot === slot)
  if (o) return o.busy ? { title: o.title || 'Занят', kind: 'manual' } : null
  return baseEntry(state, personId, day, slot)
}

export function activeMeeting(state: GroupState, date: string, slot: SlotId): Meeting | null {
  return state.meetings.find((m) => m.date === date && m.slot === slot && !m.canceledAt) ?? null
}

export function cellOf(state: GroupState, day: Day, slot: SlotId): Cell {
  const busy: Cell['busy'] = []
  const free: Person[] = []
  const notes: Record<string, string> = {}
  for (const p of state.people) {
    const e = entry(state, p.id, day, slot)
    if (e) busy.push({ person: p, ...e })
    else {
      free.push(p)
      const n = freeNote(state, p.id, day, slot)
      if (n) notes[p.id] = n
    }
  }
  return { id: `${day.key}|${slot}`, day, slot: SLOTS.find((s) => s.id === slot)!, busy, free, notes, n: free.length, past: slotPast(day, slot), meeting: activeMeeting(state, day.key, slot) }
}

export function weekCells(state: GroupState, offset: number): Cell[][] {
  return weekDays(offset).map((d) => SLOTS.map((s) => cellOf(state, d, s.id)))
}

export function rank(state: GroupState, offset: number): Cell[] {
  const all = weekCells(state, offset).flat().filter((c) => !c.past)
  return all.sort((a, b) => b.n - a.n || a.day.key.localeCompare(b.day.key) || SLOT_ORDER[a.slot.id] - SLOT_ORDER[b.slot.id])
}

export function topCell(state: GroupState, offset: number): Cell | null {
  const r = rank(state, offset)
  return r.find((c) => c.meeting) ?? r[0] ?? null
}

export function cellById(state: GroupState, id: string, offset: number): Cell | null {
  return weekCells(state, offset).flat().find((c) => c.id === id) ?? null
}

/** Следующее действие для переключателя «я занят» — что записать в overrides. */
export function toggleValue(state: GroupState, personId: string, day: Day, slot: SlotId): boolean | null {
  const cur = entry(state, personId, day, slot)
  const base = baseEntry(state, personId, day, slot)
  if (cur) return base ? false : null
  return base ? null : true
}

/** «12:00–19:00» или «день, вечер» / «весь день». */
export function ruleWhen(r: Rule): string {
  if (r.startMin != null && r.endMin != null) return `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`
  return r.slots.length === 3 ? 'весь день' : r.slots.map((x) => SLOTS.find((s) => s.id === x)!.label.toLowerCase()).join(', ')
}
