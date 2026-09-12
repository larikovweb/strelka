import { useState } from 'react'
import { SLOT, fmtDayLong, weekLabel } from '../lib/dates'
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
  const { sheet, data, week, openSheet, closeSheet, setPage, me, updateMeeting, cancelMeeting, updatePerson, forgetMe, gather, toast } = useReady()
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

  if (sheet.type === 'menu') {
    return (
      <>
        <h3>Что добавить?</h3>
        <div className="menu">
          <button type="button" onClick={() => openSheet({ type: 'rule', kind: 'recurring' })}><span className="ic">↻</span><span>Повторяющееся<small>работа, зал, учёба — по дням недели</small></span></button>
          <button type="button" onClick={() => openSheet({ type: 'rule', kind: 'oneoff' })}><span className="ic">✈</span><span>Разовое<small>уезжаю, день рождения, врач — по датам</small></span></button>
          <button type="button" onClick={() => openSheet({ type: 'rule', kind: 'shift' })}><span className="ic">⇄</span><span>Смены<small>вбить график по датам: утро / день / вечер</small></span></button>
          <button type="button" onClick={() => { closeSheet(); setPage('home') }}><span className="ic">📍</span><span>Найти окно для встречи<small>на главной — выбрать и забить</small></span></button>
        </div>
      </>
    )
  }

  if (sheet.type === 'rule') {
    return (
      <>
        <h3>{sheet.rule ? 'Изменить' : 'Добавить'}<small>появится у всех сразу после сохранения</small></h3>
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
    return <GatherForm week={weekLabel(week)} linked={data.group.tgLinked} onSend={async (note) => { await gather(note); closeSheet() }} onCopy={() => { toast('Ссылка скопирована') }} />
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

function GatherForm({ week, linked, onSend, onCopy }: { week: string; linked: boolean; onSend: (note: string) => Promise<void>; onCopy: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const link = location.origin + location.pathname
  return (
    <>
      <h3>Собираемся?<small>неделя {week}</small></h3>
      <div className="form">
        <p className="hint">{linked
          ? 'Бот напишет в беседу с кнопкой «отметить, когда могу» и будет обновлять сводку, пока все не ответят.'
          : 'Бот ещё не подключён к беседе: в разделе «Мы» есть инструкция. Пока можно отправить ссылку вручную.'}</p>
        <div><label htmlFor="g-note">Повод (необязательно)</label><input id="g-note" className="input" value={note} placeholder="Давно не виделись! Бар? Настолки?" onChange={(e) => setNote(e.target.value)} /></div>
        {linked
          ? <button type="button" className="btn" disabled={busy} onClick={() => { setBusy(true); void onSend(note.trim()).finally(() => setBusy(false)) }}>Отправить в беседу</button>
          : <button type="button" className="btn dark" onClick={() => { void navigator.clipboard?.writeText(`${note.trim() ? note.trim() + '\n' : ''}Отметьте, когда можете на неделе ${week}: ${link}`); onCopy() }}>Скопировать сообщение для чата</button>}
      </div>
    </>
  )
}
