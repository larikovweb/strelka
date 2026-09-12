import { DOW, SLOT, SLOTS, fmtDayLong, slotPast, weekDays, weekLabel } from '../lib/dates'
import { entry } from '../lib/model'
import { useReady } from '../lib/store'
import { WeekTabs } from '../components/WeekTabs'

const ICON = { recurring: '↻', oneoff: '✈', shift: '⇄' } as const

export function Schedule() {
  const { data, me, week, toggleMe, openSheet } = useReady()
  const days = weekDays(week)
  const mine = data.rules.filter((r) => r.personId === me)
  const manual = data.overrides.filter((o) => o.personId === me && days.some((d) => d.key === o.date)).length
  const wdLabel = (a: number[]) => (a.length === 5 && a[0] === 1 && a[4] === 5 ? 'пн–пт' : a.length === 7 ? 'каждый день' : a.map((i) => DOW[i - 1].toLowerCase()).join(', '))
  const datesLabel = (ds: string[]) => (ds.length === 1 ? fmtDayLong(ds[0]) : `${fmtDayLong(ds[0])} – ${fmtDayLong(ds[ds.length - 1])}`)

  return (
    <>
      <header className="head"><h1>Моё расписание<small>отмечай, когда занят — остальные увидят сразу</small></h1></header>
      <WeekTabs />
      <div className="sched">
        <article className="card">
          <h2>Быстро по неделе<small>{weekLabel(week)} · тап — занят / свободен</small></h2>
          <div className="mygrid">
            <div />
            {days.map((d) => <div key={d.key} className={`hd${d.today ? ' today' : ''}`}>{d.dow}<b>{d.num}</b></div>)}
            {SLOTS.map((s) => (
              <div key={s.id} className="contents">
                <div className="hl">{s.label}</div>
                {days.map((d) => {
                  const e = entry(data, me, d, s.id), past = slotPast(d, s.id)
                  return <button key={d.key} type="button" disabled={past} className={`my${e ? ' busy ' + e.kind : ''}${past ? ' past' : ''}`} onClick={() => void toggleMe(d, s.id)}>{e ? e.title.slice(0, 7) : ''}</button>
                })}
              </div>
            ))}
          </div>
          <div className="legend"><span><i style={{ '--bg': '#FF4D3D' } as React.CSSProperties} />занят</span><span><i style={{ '--bg': '#FFB020' } as React.CSSProperties} />разово / смена</span><span><i style={{ '--bg': '#F4F5F9' } as React.CSSProperties} />свободен</span></div>
        </article>

        <article className="card">
          <h2>Мои правила<small>{mine.length ? `${mine.length} шт.` : 'пока пусто'}</small></h2>
          {mine.map((r) => (
            <button key={r.id} type="button" className="row rowbtn" onClick={() => openSheet({ type: 'rule', rule: r })}>
              <span className="ic">{ICON[r.kind]}</span>
              <span className="nm">{r.title}<small>{r.kind === 'recurring' ? `каждую неделю · ${wdLabel(r.weekdays)}` : `${r.kind === 'shift' ? 'смена' : 'разово'} · ${datesLabel(r.dates)}`} · {r.slots.length === 3 ? 'весь день' : r.slots.map((s) => SLOT[s].label.toLowerCase()).join(', ')}</small></span>
              <span className="chev">›</span>
            </button>
          ))}
          {manual > 0 && <div className="row"><span className="ic">✎</span><span className="nm">Отмечено вручную<small>{manual} на этой неделе — в сетке выше</small></span></div>}
          {!mine.length && <p className="hint">Добавь то, что повторяется (работа, зал) и разовое (поездки). Остальное — тапами в сетке.</p>}
          <button type="button" className="btn dark" onClick={() => openSheet({ type: 'menu' })}>+ Добавить занятость</button>
        </article>
      </div>
    </>
  )
}
