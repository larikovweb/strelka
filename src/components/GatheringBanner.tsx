import { rangeLabel, weekOffsetOf } from '../lib/dates'
import { useReady } from '../lib/store'

/** Баннер открытого сбора: кто отметился, кнопка «Я отметился». */
export function GatheringBanner({ where }: { where: 'home' | 'sched' }) {
  const { data, me, openGathering: g, setPage, setWeek, respond } = useReady()
  if (!g) return null
  const waiting = data.people.filter((p) => !g.responded.includes(p.id))
  const meDone = g.responded.includes(me)
  return (
    <div className={`banner${meDone ? ' done' : ''}`}>
      <div className="banner-text">
        <b><span className="dot" />Идёт сбор: {rangeLabel(g.dateFrom, g.dateTo)}</b>
        <span>{waiting.length ? `Отметились ${g.responded.length} из ${data.people.length}, ждём: ${waiting.map((p) => p.name).join(', ')}.` : 'Все отметились — выбирайте окно.'}</span>
      </div>
      {meDone
        ? <span className="ok">✓ Ты отметился</span>
        : where === 'home'
          ? <button type="button" onClick={() => { setWeek(Math.max(0, weekOffsetOf(g.weekStart))); setPage('sched') }}>Отметить занятость</button>
          : <button type="button" onClick={() => void respond()}>Я отметился — всё заполнил</button>}
    </div>
  )
}
