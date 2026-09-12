export type SlotId = 'm' | 'd' | 'e'
export type RuleKind = 'recurring' | 'oneoff' | 'shift'
export type EntryKind = RuleKind | 'manual'

export interface Person {
  id: string
  name: string
  color: string
  sort: number
  note: string | null
}

export interface Rule {
  id: string
  personId: string
  kind: RuleKind
  title: string
  weekdays: number[]
  dates: string[]
  slots: SlotId[]
}

export interface Override {
  personId: string
  date: string
  slot: SlotId
  busy: boolean
  title: string | null
}

export interface Meeting {
  id: string
  date: string
  slot: SlotId
  title: string | null
  place: string | null
  createdBy: string | null
  canceledAt: string | null
}

export interface Gathering {
  id: string
  weekStart: string
  initiatedBy: string | null
  note: string | null
  responded: string[]
  closedAt: string | null
}

export interface GroupState {
  group: { id: string; name: string; code: string; tgLinked: boolean }
  people: Person[]
  rules: Rule[]
  overrides: Override[]
  meetings: Meeting[]
  gatherings: Gathering[]
}

export interface Entry {
  title: string
  kind: EntryKind
}

export interface Day {
  key: string
  wd: number
  dow: string
  dowf: string
  num: number
  mong: string
  today: boolean
  past: boolean
}

export interface Slot {
  id: SlotId
  label: string
  hours: string
}

export interface BusyEntry extends Entry {
  person: Person
}

export interface Cell {
  id: string
  day: Day
  slot: Slot
  busy: BusyEntry[]
  free: Person[]
  n: number
  past: boolean
  meeting: Meeting | null
}
