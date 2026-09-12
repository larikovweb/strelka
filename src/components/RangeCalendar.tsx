import { DOW, MONTHS, monthGrid, todayKey } from '../lib/dates'

interface Props { from: string | null; to: string | null; onChange: (from: string | null, to: string | null) => void; months?: number }

/** Календарь с выбором периода: тап — начало, второй тап — конец. */
export function RangeCalendar({ from, to, onChange, months = 2 }: Props) {
  const today = todayKey()
  const now = new Date()
  const pick = (d: string) => {
    if (!from || (from && to)) onChange(d, null)
    else if (d < from) onChange(d, null)
    else onChange(from, d)
  }
  const end = to ?? from
  return (
    <div className="cal">
      {Array.from({ length: months }, (_, i) => {
        const y = now.getFullYear(), m = now.getMonth() + i
        const rows = monthGrid(y, m)
        return (
          <div className="cal-month" key={i}>
            <div className="cal-title">{MONTHS[new Date(y, m, 1).getMonth()]}</div>
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
      })}
    </div>
  )
}
