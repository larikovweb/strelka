import { rangeLabel, weekOffsetOf } from '../lib/dates'
import { useReady } from '../lib/store'
import { timeLabel } from '../lib/model'

/** Баннер открытого сбора: кто отметился, кнопка «Я отметился». */
export function GatheringBanner({ where }: { where: 'home' | 'sched' }) {
  const { data, me, openGathering: g, setPage, setWeek, respond, cancelGathering } = useReady()
  if (!g) return null
  const waiting = data.people.filter((p) => !g.responded.includes(p.id))
  const meDone = g.responded.includes(me)
  return (
    <div className={`banner${meDone ? ' done' : ''}`}>
      <div className="banner-text">
        <b><span className="dot" />Идёт сбор: {rangeLabel(g.dateFrom, g.dateTo)}{timeLabel(g.timeFrom, g.timeTo) && `, ${timeLabel(g.timeFrom, g.timeTo)}`}</b>
        <span>{waiting.length ? `Отметились ${g.responded.length} из ${data.people.length}, ждём: ${waiting.map((p) => p.name).join(', ')}.` : 'Все отметились — выбирайте окно.'}</span>
      </div>
      <div className="banner-actions">
        {meDone
          ? <span className="ok">✓ Ты отметился</span>
          : where === 'home'
            ? <button type="button" onClick={() => { setWeek(Math.max(0, weekOffsetOf(g.weekStart))); setPage('sched') }}>Отметить занятость</button>
            : <button type="button" onClick={() => void respond()}>Я отметился — всё заполнил</button>}
        <button type="button" className="link" onClick={() => { if (confirm('Отменить сбор? Бот напишет об этом в беседу.')) void cancelGathering() }}>Отменить сбор</button>
      </div>
    </div>
  )
}
