import { SLOTS, SLOT_ORDER, slotPast, weekDays } from './dates'
import type { Cell, Day, Entry, GroupState, Meeting, Person, SlotId } from './types'

export const KIND_LABEL: Record<Entry['kind'], string> = {
  recurring: 'каждую неделю',
  oneoff: 'разово',
  shift: 'смена',
  manual: 'отмечено вручную',
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

export function baseEntry(state: GroupState, personId: string, day: Day, slot: SlotId): Entry | null {
  for (const r of state.rules) {
    if (r.personId !== personId || !r.slots.includes(slot)) continue
    if ((r.kind === 'oneoff' || r.kind === 'shift') && r.dates.includes(day.key)) return { title: r.title, kind: r.kind }
  }
  for (const r of state.rules) {
    if (r.personId !== personId || !r.slots.includes(slot)) continue
    if (r.kind === 'recurring' && r.weekdays.includes(day.wd)) return { title: r.title, kind: 'recurring' }
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
  for (const p of state.people) {
    const e = entry(state, p.id, day, slot)
    if (e) busy.push({ person: p, ...e })
    else free.push(p)
  }
  return { id: `${day.key}|${slot}`, day, slot: SLOTS.find((s) => s.id === slot)!, busy, free, n: free.length, past: slotPast(day, slot), meeting: activeMeeting(state, day.key, slot) }
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
