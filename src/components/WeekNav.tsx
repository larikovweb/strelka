import { weekLabelShort } from '../lib/dates'
import { useStore } from '../lib/store'

/** Стрелки недели для заголовка карточки. */
export function WeekNav() {
  const { week, setWeek } = useStore()
  return (
    <span className="wknav">
      <button type="button" aria-label="Предыдущая неделя" disabled={week <= 0} onClick={() => setWeek(week - 1)}>‹</button>
      <small>{weekLabelShort(week)}</small>
      <button type="button" aria-label="Следующая неделя" disabled={week >= 3} onClick={() => setWeek(week + 1)}>›</button>
    </span>
  )
}
