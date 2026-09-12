import { SLOTS, weekDays, weekLabel } from '../lib/dates'
import { genitive, rank, topCell, weekCells } from '../lib/model'
import { useReady } from '../lib/store'
import type { Cell } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { DetailList } from '../components/DetailList'
import { WeekTabs } from '../components/WeekTabs'
import { burst } from '../components/confetti'
import { GatheringBanner } from '../components/GatheringBanner'

function heat(n: number, total: number, booked: boolean): [string, string] {
  if (booked) return ['#10131A', '#fff']
  const miss = total - n
  return miss === 0 ? ['#FF4D3D', '#fff'] : miss === 1 ? ['#FFC2BB', '#10131A'] : miss === 2 ? ['#FFE3DF', '#10131A'] : ['#F1F2F7', n >= 2 ? '#6B7280' : '#B4BAC8']
}

export function Home() {
  const { data, week, sel, setSel, openSheet, book, cancelMeeting } = useReady()
  const days = weekDays(week)
  const cells = weekCells(data, week)
  const all = cells.flat()
  const top = topCell(data, week)
  const total = data.people.length
  const selected = all.find((c) => c.id === sel) ?? top ?? all[0]
  const alts = rank(data, week).filter((c) => top && c.id !== top.id && c.n >= Math.max(2, total - 2)).slice(0, 5)

  const pick = (c: Cell) => {
    setSel(c.id)
    if (innerWidth < 900) openSheet({ type: 'detail', id: c.id })
  }
  let i = 0

  return (
    <>
      <header className="head">
        <h1>Когда собираемся?<small>{data.group.name} · {weekLabel(week)}</small></h1>
        <button type="button" className="gather-btn" onClick={() => openSheet({ type: 'gather' })}>Собираемся?</button>
      </header>
      <WeekTabs />
      <GatheringBanner where="home" />
      <div className="home">
        <article className="card hero">
          {top ? (
            <>
              <div>
                <div className="eyebrow">{top.meeting ? 'Забито, ждём всех' : top.n === total ? 'Ближайшее окно, когда свободны все' : `Лучшее окно недели — свободны ${top.n} из ${total}`}</div>
                <div className="big">{top.day.dow} {top.day.num}<small>{top.day.num} {top.day.mong}, {top.slot.label.toLowerCase()} {top.slot.hours}</small></div>
              </div>
              <div className="hero-row">
                <div className="stack">{data.people.map((p, k) => <Avatar key={p.id} person={p} className="hav" off={top.busy.some((b) => b.person.id === p.id)} style={{ '--i': k } as React.CSSProperties} />)}</div>
                {top.n === total ? <span className="chip ok">все {total} свободны</span> : <span className="chip">без {top.busy.map((b) => genitive(b.person.name)).join(', ')}</span>}
                {top.meeting
                  ? <button type="button" className="btn done" onClick={() => void cancelMeeting(top.meeting!.id)}>Забито ✓</button>
                  : <button type="button" className="btn" onClick={(e) => { burst(e.clientX, e.clientY, data.people.map((p) => p.color)); void book(top) }}>Забить встречу</button>}
              </div>
            </>
          ) : (
            <div><div className="eyebrow">Эта неделя уже прошла</div><div className="big">Листай<small>вперёд — там свободные вечера</small></div></div>
          )}
        </article>

        <article className="card alts">
          <h2>Ещё варианты<small>тап — кто занят</small></h2>
          {alts.length ? alts.map((c) => (
            <button key={c.id} type="button" className={`alt${c.id === selected?.id ? ' sel' : ''}`} onClick={() => pick(c)}>
              <b>{c.day.dow} {c.day.num}</b><span>{c.slot.label.toLowerCase()}</span>
              <span className="dots">{data.people.map((p) => <i key={p.id} className={c.busy.some((b) => b.person.id === p.id) ? 'off' : ''} style={{ '--c': p.color } as React.CSSProperties} />)}</span>
            </button>
          )) : <div className="empty">Пока нет окон, где свободны почти все. Отметьте занятость — и они появятся.</div>}
        </article>

        <article className="card heatcard">
          <h2>Вся неделя<small>сколько свободны</small></h2>
          <div className="hgrid">
            <div />
            {days.map((d) => <div key={d.key} className={`hd${d.today ? ' today' : ''}`}>{d.dow}<b>{d.num}</b></div>)}
            {SLOTS.map((s, si) => (
              <div key={s.id} className="contents">
                <div className="hl">{s.label}</div>
                {days.map((_, di) => {
                  const c = cells[di][si]; const [bg, fg] = heat(c.n, total, !!c.meeting)
                  return <button key={c.id} type="button" className={`hc${c.id === selected?.id ? ' sel' : ''}${c.past ? ' past' : ''}${c.meeting ? ' booked' : ''}`} style={{ '--bg': bg, '--fg': fg, '--i': i++ } as React.CSSProperties} onClick={() => pick(c)}>{c.n}</button>
                })}
              </div>
            ))}
          </div>
          <div className="legend"><span><i style={{ '--bg': '#FF4D3D' } as React.CSSProperties} />все</span><span><i style={{ '--bg': '#FFC2BB' } as React.CSSProperties} />без одного</span><span><i style={{ '--bg': '#FFE3DF' } as React.CSSProperties} />без двух</span><span><i style={{ '--bg': '#F1F2F7' } as React.CSSProperties} />меньше</span><span><i style={{ '--bg': '#10131A' } as React.CSSProperties} />забито</span></div>
        </article>

        {selected && (
          <article className="card detail-card">
            <h2>{selected.day.dow} {selected.day.num}, {selected.slot.label.toLowerCase()}<small>{selected.slot.hours}</small></h2>
            <DetailList cell={selected} />
          </article>
        )}

        <div className="people">
          {data.people.map((p) => {
            const busyN = all.filter((c) => c.busy.some((b) => b.person.id === p.id)).length
            return (
              <div className="pcard" key={p.id}>
                <Avatar person={p} className="av sq" />
                <b>{p.name}</b>
                <span className="bar"><i style={{ '--c': p.color, '--w': `${Math.round((busyN / 21) * 100)}%` } as React.CSSProperties} /></span>
                <small>занят {busyN} из 21</small>
                {p.note && <span className="tag">{p.note}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
