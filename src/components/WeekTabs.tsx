import { useStore } from '../lib/store'

const LABELS = ['эта неделя', 'следующая', 'через одну', 'через две']

export function WeekTabs() {
  const { week, setWeek } = useStore()
  return (
    <div className="weeks">
      {LABELS.map((l, i) => (
        <button key={i} type="button" className={week === i ? 'on' : ''} onClick={() => setWeek(i)}>{l}</button>
      ))}
    </div>
  )
}
