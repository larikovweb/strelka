import { useState } from 'react'
import { DOW, MONTHS, monthGrid, todayKey } from '../lib/dates'

interface Props { from: string | null; to: string | null; onChange: (from: string | null, to: string | null) => void }

/** Календарь одного месяца с переключателем; тап — начало периода, второй тап — конец. */
export function RangeCalendar({ from, to, onChange }: Props) {
  const today = todayKey()
  const now = new Date()
  const base = from ? new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1) : now
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  const minView = now.getFullYear() * 12 + now.getMonth()
  const cur = view.y * 12 + view.m
  const shift = (n: number) => { const v = cur + n; setView({ y: Math.floor(v / 12), m: ((v % 12) + 12) % 12 }) }
  const pick = (d: string) => {
    if (!from || (from && to)) onChange(d, null)
    else if (d < from) onChange(d, null)
    else onChange(from, d)
  }
  const end = to ?? from
  const rows = monthGrid(view.y, view.m)
  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" aria-label="Предыдущий месяц" disabled={cur <= minView} onClick={() => shift(-1)}>‹</button>
        <span className="cal-title">{MONTHS[view.m]}{view.y !== now.getFullYear() ? ` ${view.y}` : ''}</span>
        <button type="button" aria-label="Следующий месяц" disabled={cur >= minView + 11} onClick={() => shift(1)}>›</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {rows.flat().map((d, k) => {
          if (!d) return <div key={k} />
          const past = d < today
          const inR = from && end && d >= from && d <= end
          const cls = ['cal-day', past && 'past', inR && 'in', d === from && 'start', d === end && 'end', d === today && 'today'].filter(Boolean).join(' ')
          return <button key={k} type="button" className={cls} disabled={past} onClick={() => pick(d)}>{Number(d.slice(8))}</button>
        })}
      </div>
    </div>
  )
}
