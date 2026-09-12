import { useState } from 'react'
import { DOW, SLOTS, dateRange, todayKey } from '../lib/dates'
import { useReady } from '../lib/store'
import type { Rule, RuleKind, SlotId } from '../lib/types'

const KINDS: { id: RuleKind; label: string; hint: string }[] = [
  { id: 'recurring', label: 'Каждую неделю', hint: 'Работа, зал, английский…' },
  { id: 'oneoff', label: 'Разово', hint: 'Дача, ДР мамы, врач…' },
  { id: 'shift', label: 'Смена', hint: 'Смена' },
]

export function RuleForm({ rule, kind: initialKind }: { rule?: Rule; kind?: RuleKind }) {
  const { me, saveRule, deleteRule, closeSheet, toast } = useReady()
  const [kind, setKind] = useState<RuleKind>(rule?.kind ?? initialKind ?? 'recurring')
  const [title, setTitle] = useState(rule?.title ?? (kind === 'shift' ? 'Смена' : ''))
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? [1, 2, 3, 4, 5])
  const [from, setFrom] = useState(rule?.dates[0] ?? todayKey())
  const [to, setTo] = useState(rule?.dates[rule.dates.length - 1] ?? todayKey())
  const [slots, setSlots] = useState<SlotId[]>(rule?.slots ?? ['d'])
  const [saving, setSaving] = useState(false)

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  async function submit(again = false) {
    const t = title.trim() || (kind === 'shift' ? 'Смена' : '')
    if (!t) { toast('Напиши название'); return }
    if (!slots.length) { toast('Выбери время дня'); return }
    if (kind === 'recurring' && !weekdays.length) { toast('Выбери дни недели'); return }
    setSaving(true)
    await saveRule({
      id: rule?.id, personId: me, kind, title: t,
      weekdays: kind === 'recurring' ? [...weekdays].sort() : [],
      dates: kind === 'recurring' ? [] : kind === 'shift' ? [from] : dateRange(from, to),
      slots: SLOTS.map((s) => s.id).filter((s) => slots.includes(s)),
    })
    setSaving(false)
    if (again) { setFrom(nextDay(from)); toast('Смена добавлена — следующая дата') } else closeSheet()
  }

  return (
    <div className="form">
      <div className="seg">
        {KINDS.map((k) => <button key={k.id} type="button" className={kind === k.id ? 'on' : ''} onClick={() => { setKind(k.id); if (k.id === 'shift' && !title) setTitle('Смена') }}>{k.label}</button>)}
      </div>
      <div>
        <label htmlFor="rule-title">Название</label>
        <input id="rule-title" className="input" value={title} placeholder={KINDS.find((k) => k.id === kind)!.hint} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {kind === 'recurring' && (
        <div>
          <label>Дни недели</label>
          <div className="chips">{DOW.map((d, i) => <button key={d} type="button" className={weekdays.includes(i + 1) ? 'on' : ''} onClick={() => setWeekdays(toggle(weekdays, i + 1))}>{d}</button>)}</div>
        </div>
      )}
      {kind === 'oneoff' && (
        <div>
          <label>Даты</label>
          <div className="dates">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      )}
      {kind === 'shift' && (
        <div>
          <label>Дата смены</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
      )}
      <div>
        <label>Когда</label>
        <div className="chips">
          {SLOTS.map((s) => <button key={s.id} type="button" className={slots.includes(s.id) ? 'on' : ''} onClick={() => setSlots(toggle(slots, s.id))}>{s.label} <span className="dim">{s.hours}</span></button>)}
          <button type="button" className={slots.length === 3 ? 'on' : ''} onClick={() => setSlots(slots.length === 3 ? [] : ['m', 'd', 'e'])}>Весь день</button>
        </div>
      </div>
      <button type="button" className="btn dark" disabled={saving} onClick={() => void submit()}>{rule ? 'Сохранить' : 'Добавить'}</button>
      {kind === 'shift' && !rule && <button type="button" className="btn ghost" disabled={saving} onClick={() => void submit(true)}>Добавить и ввести следующую</button>}
      {rule && <button type="button" className="btn ghost danger" onClick={() => { void deleteRule(rule.id); closeSheet() }}>Удалить</button>}
    </div>
  )
}

function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const x = new Date(y, m - 1, d + 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
