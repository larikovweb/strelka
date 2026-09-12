import { useStore } from '../lib/store'
import { weekDays } from '../lib/dates'

const LABELS = ['эта неделя', 'следующая', 'через одну', 'через две']

export function WeekTabs() {
  const { week, setWeek, data } = useStore()
  const g = data?.gatherings.find((x) => !x.closedAt)
  const hasG = (i: number) => { if (!g) return false; const ds = weekDays(i); return ds[6].key >= g.dateFrom && ds[0].key <= g.dateTo }
  return (
    <div className="weeks">
      {LABELS.map((l, i) => (
        <button key={i} type="button" className={`${week === i ? 'on' : ''}${hasG(i) ? ' g' : ''}`} onClick={() => setWeek(i)}>{l}</button>
      ))}
    </div>
  )
}
