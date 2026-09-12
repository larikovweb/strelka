import { weekLabel, weekOffsetOf } from '../lib/dates'
import { useReady } from '../lib/store'

/** Баннер открытого сбора: кто отметился, кнопка «Я отметился». */
export function GatheringBanner({ where }: { where: 'home' | 'sched' }) {
  const { data, me, openGathering: g, setPage, setWeek, respond } = useReady()
  if (!g) return null
  const off = Math.max(0, weekOffsetOf(g.weekStart))
  const waiting = data.people.filter((p) => !g.responded.includes(p.id))
  const meDone = g.responded.includes(me)
  const period = weekLabel(off, g.weeks)
  return (
    <div className={`banner${meDone ? ' done' : ''}`}>
      <span className="dot" />
      <span>
        <b>Идёт сбор на {period}.</b>{' '}
        {waiting.length ? `Отметились ${g.responded.length} из ${data.people.length}, ждём: ${waiting.map((p) => p.name).join(', ')}.` : 'Все отметились — выбирайте окно.'}
        {where === 'sched' && !meDone && ' Проверь недели периода и нажми «Я отметился».'}
      </span>
      {meDone
        ? <span className="ok">✓ ты отметился</span>
        : where === 'home'
          ? <button type="button" onClick={() => { setWeek(off); setPage('sched') }}>Отметить</button>
          : <button type="button" onClick={() => void respond()}>Я отметился</button>}
    </div>
  )
}
