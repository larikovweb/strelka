import { useState } from 'react'
import { DOW, SLOT, SLOTS, addDays, dkey, fmtDayLong, mondayOf, rangeLabel, slotPast, todayKey, weekDays, weekLabel } from '../lib/dates'
import { entry, ruleWhen } from '../lib/model'
import { Avatar } from './Avatar'
import { RangeCalendar } from './RangeCalendar'
import { cellById } from '../lib/model'
import { useReady } from '../lib/store'
import { DetailList } from './DetailList'
import { RuleForm } from './RuleForm'

const COLORS = ['#F5B942', '#45A8F5', '#F75C9B', '#3DCF8E', '#A277F2', '#FF7A45', '#2ED3C6', '#FF5C7A', '#8BC34A', '#7C83FF']

export function Sheet() {
  const s = useReady()
  const { sheet, closeSheet } = s
  return (
    <div className={`sheet${sheet ? ' open' : ''}`} aria-hidden={!sheet}>
      <div className="scrim" onClick={closeSheet} />
      <div className="body">
        <div className="handle" onClick={closeSheet} />
        {sheet && <SheetBody />}
      </div>
    </div>
  )
}

function SheetBody() {
  const { sheet, data, week, closeSheet, me, updateMeeting, cancelMeeting, updatePerson, forgetMe, gather, toast } = useReady()
  if (!sheet) return null

  if (sheet.type === 'detail') {
    const c = cellById(data, sheet.id, week)
    if (!c) return null
    return (
      <>
        <h3>{c.day.dow} {c.day.num}, {c.slot.label.toLowerCase()}<small>{c.day.dowf}, {c.slot.hours} · свободны {c.n} из {data.people.length}</small></h3>
        <DetailList cell={c} />
      </>
    )
  }

  if (sheet.type === 'rule') {
    return (
      <>
        <h3>{sheet.rule ? 'Изменить занятость' : 'Отметить занятость'}<small>появится у всех сразу после сохранения</small></h3>
        <RuleForm rule={sheet.rule} kind={sheet.kind} />
      </>
    )
  }

  if (sheet.type === 'meeting') {
    const m = data.meetings.find((x) => x.id === sheet.id)
    if (!m) return null
    return <MeetingForm id={m.id} title={m.title ?? ''} place={m.place ?? ''} onSave={async (t, p) => { await updateMeeting(m.id, t || null, p || null); closeSheet() }} onCancel={async () => { await cancelMeeting(m.id); closeSheet() }} label={`${fmtDayLong(m.date)}, ${SLOT[m.slot].label.toLowerCase()}`} />
  }

  if (sheet.type === 'profile') {
    const p = data.people.find((x) => x.id === me)!
    return <ProfileForm name={p.name} color={p.color} note={p.note ?? ''} onSave={async (n, c, note) => { await updatePerson(n, c, note || null); closeSheet() }} onSwitch={forgetMe} />
  }

  if (sheet.type === 'gather') {
    return <GatherForm linked={data.group.tgLinked} onSend={async (note, from, to) => { await gather(note, from, to); closeSheet() }} onCopy={() => { toast('Сообщение скопировано') }} />
  }

  if (sheet.type === 'person') {
    const p = data.people.find((x) => x.id === sheet.id)
    if (!p) return null
    return <PersonView person={p} />
  }
  return null
}

function MeetingForm({ label, title, place, onSave, onCancel }: { id: string; label: string; title: string; place: string; onSave: (t: string, p: string) => Promise<void>; onCancel: () => Promise<void> }) {
  const [t, setT] = useState(title)
  const [p, setP] = useState(place)
  return (
    <>
      <h3>Встреча<small>{label}</small></h3>
      <div className="form">
        <div><label htmlFor="m-title">Что делаем</label><input id="m-title" className="input" value={t} placeholder="Бар, кино, настолки…" onChange={(e) => setT(e.target.value)} /></div>
        <div><label htmlFor="m-place">Где</label><input id="m-place" className="input" value={p} placeholder="Адрес или название" onChange={(e) => setP(e.target.value)} /></div>
        <button type="button" className="btn dark" onClick={() => void onSave(t.trim(), p.trim())}>Сохранить</button>
        <button type="button" className="btn ghost danger" onClick={() => void onCancel()}>Отменить встречу</button>
      </div>
    </>
  )
}

function ProfileForm({ name, color, note, onSave, onSwitch }: { name: string; color: string; note: string; onSave: (n: string, c: string, note: string) => Promise<void>; onSwitch: () => void }) {
  const [n, setN] = useState(name)
  const [c, setC] = useState(color)
  const [nt, setNt] = useState(note)
  return (
    <>
      <h3>Профиль<small>как тебя видят остальные</small></h3>
      <div className="form">
        <div><label htmlFor="p-name">Имя</label><input id="p-name" className="input" value={n} onChange={(e) => setN(e.target.value)} /></div>
        <div><label>Цвет</label><div className="chips colors">{COLORS.map((x) => <button key={x} type="button" className={c === x ? 'on' : ''} style={{ '--c': x } as React.CSSProperties} onClick={() => setC(x)} aria-label={x} />)}</div></div>
        <div><label htmlFor="p-note">Про график</label><input id="p-note" className="input" value={nt} placeholder="сменный график, офис 9–18…" onChange={(e) => setNt(e.target.value)} /></div>
        <button type="button" className="btn dark" onClick={() => { if (n.trim()) void onSave(n.trim(), c, nt.trim()) }}>Сохранить</button>
        <button type="button" className="btn ghost" onClick={onSwitch}>Это не я — выбрать другого</button>
      </div>
    </>
  )
}

function GatherForm({ linked, onSend, onCopy }: { linked: boolean; onSend: (note: string, from: string, to: string) => Promise<void>; onCopy: () => void }) {
  const [note, setNote] = useState('')
  const [from, setFrom] = useState<string | null>(todayKey())
  const [to, setTo] = useState<string | null>(dkey(addDays(mondayOf(new Date()), 13)))
  const [busy, setBusy] = useState(false)
  const end = to ?? from
  const period = from && end ? rangeLabel(from, end) : 'выбери даты'
  const link = location.origin + location.pathname
  return (
    <>
      <h3>Собираемся?<small>{period}</small></h3>
      <div className="form">
        <RangeCalendar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <div><label htmlFor="g-note">Повод (необязательно)</label><input id="g-note" className="input" value={note} placeholder="Давно не виделись! Бар? Настолки?" onChange={(e) => setNote(e.target.value)} /></div>
        {linked
          ? <button type="button" className="btn" disabled={busy || !from} onClick={() => { if (!from || !end) return; setBusy(true); void onSend(note.trim(), from, end).finally(() => setBusy(false)) }}>Отправить в беседу</button>
          : <button type="button" className="btn dark" disabled={!from} onClick={() => { void navigator.clipboard?.writeText(`${note.trim() ? note.trim() + '\n' : ''}Отметьте, когда можете (${period}): ${link}`); onCopy() }}>Скопировать сообщение для чата</button>}
        {!linked && <p className="hint">Бот не подключён к беседе — инструкция в разделе «Мы».</p>}
      </div>
    </>
  )
}

/** Календарь другого человека: его неделя и правила, только просмотр. */
function PersonView({ person }: { person: import('../lib/types').Person }) {
  const { data, week, setWeek } = useReady()
  const days = weekDays(week)
  const rules = data.rules.filter((r) => r.personId === person.id)
  const wdLabel = (a: number[]) => (a.length === 5 && a[0] === 1 && a[4] === 5 ? 'пн–пт' : a.length === 7 ? 'каждый день' : a.map((i) => DOW[i - 1].toLowerCase()).join(', '))
  return (
    <>
      <h3><Avatar person={person} className="av inline" /> {person.name}<small>{person.note || 'про график не написано'} · {weekLabel(week)}</small></h3>
      <div className="weeks">{['эта неделя', 'следующая', 'через одну', 'через две'].map((l, i) => <button key={i} type="button" className={week === i ? 'on' : ''} onClick={() => setWeek(i)}>{l}</button>)}</div>
      <div className="mygrid">
        <div />
        {days.map((d) => <div key={d.key} className={`hd${d.today ? ' today' : ''}`}>{d.dow}<b>{d.num}</b></div>)}
        {SLOTS.map((s) => (
          <div key={s.id} className="contents">
            <div className="hl">{s.label}</div>
            {days.map((d) => { const e = entry(data, person.id, d, s.id); return <div key={d.key} className={`my ro${e ? ' busy ' + e.kind : ''}${slotPast(d, s.id) ? ' past' : ''}`}>{e ? e.title.slice(0, 7) : ''}</div> })}
          </div>
        ))}
      </div>
      <div className="legend"><span><i style={{ '--bg': '#FF4D3D' } as React.CSSProperties} />занят</span><span><i style={{ '--bg': '#FFB020' } as React.CSSProperties} />разово / смена</span><span><i style={{ '--bg': '#F4F5F9' } as React.CSSProperties} />свободен</span></div>
      <h4 className="sub">Правила</h4>
      {rules.length ? rules.map((r) => (
        <div className="row" key={r.id}><span className="ic">{r.kind === 'recurring' ? '↻' : r.kind === 'oneoff' ? '✈' : '⇄'}</span><span className="nm">{r.title}<small>{r.kind === 'recurring' ? `каждую неделю · ${wdLabel(r.weekdays)}` : `${r.kind === 'shift' ? 'смена' : 'разово'} · ${r.dates.length === 1 ? fmtDayLong(r.dates[0]) : `${fmtDayLong(r.dates[0])} – ${fmtDayLong(r.dates[r.dates.length - 1])}`}`} · {ruleWhen(r)}</small></span></div>
      )) : <p className="hint">Правил пока нет — только тапы в сетке.</p>}
    </>
  )
}
