import { SLOT, dayOf, fmtDayLong, todayKey } from '../lib/dates'
import { cellOf } from '../lib/model'
import { useReady } from '../lib/store'
import { Avatar } from '../components/Avatar'

export function Meetings() {
  const { data, openSheet, setPage } = useReady()
  const today = todayKey()
  const active = data.meetings.filter((m) => !m.canceledAt)
  const upcoming = active.filter((m) => m.date >= today)
  const past = active.filter((m) => m.date < today).reverse()

  return (
    <>
      <header className="head"><h1>Встречи<small>что забито и что было</small></h1></header>
      <div className="two">
        <article className="card">
          <h2>Ближайшие</h2>
          {upcoming.length ? upcoming.map((m) => {
            const c = cellOf(data, dayOf(m.date), m.slot)
            return (
              <button key={m.id} type="button" className="meet" onClick={() => openSheet({ type: 'meeting', id: m.id })}>
                <div className="big">{c.day.dow} {c.day.num}<small>{fmtDayLong(m.date)}, {SLOT[m.slot].label.toLowerCase()} {SLOT[m.slot].hours}</small></div>
                <div className="hero-row">
                  <div className="stack">{data.people.map((p, k) => <Avatar key={p.id} person={p} className="hav light" off={c.busy.some((b) => b.person.id === p.id)} style={{ '--i': k } as React.CSSProperties} />)}</div>
                  <span className="chip soft">идут {c.n} из {data.people.length}</span>
                </div>
                <div className="meta">{m.title || 'Что делаем — не решили'}{m.place ? ` · ${m.place}` : ''} <span className="chev">›</span></div>
              </button>
            )
          }) : (
            <>
              <div className="empty"><b>Пока ничего не забито</b>Найди окно на главной или запусти сбор.</div>
              <button type="button" className="btn" onClick={() => setPage('home')}>Найти окно для всех</button>
            </>
          )}
        </article>
        <article className="card">
          <h2>Прошедшие</h2>
          {past.length ? past.map((m) => (
            <div key={m.id} className="row"><span className="ic">✓</span><span className="nm">{m.title || 'Встреча'}<small>{fmtDayLong(m.date)}, {SLOT[m.slot].label.toLowerCase()}{m.place ? ` · ${m.place}` : ''}</small></span></div>
          )) : <p className="hint">Здесь будет история встреч.</p>}
        </article>
      </div>
    </>
  )
}
