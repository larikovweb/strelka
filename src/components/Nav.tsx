import { useReady, type Page } from '../lib/store'
import { Avatar } from './Avatar'

const TABS: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Главная', icon: <path d="M3 11 L12 4 L21 11 V20 H15 V14 H9 V20 H3 Z" /> },
  { id: 'sched', label: 'Расписание', icon: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10 H21 M8 3 V7 M16 3 V7" /></> },
  { id: 'meet', label: 'Встречи', icon: <><path d="M12 21 C12 21 5 14.5 5 9.5 A7 7 0 0 1 19 9.5 C19 14.5 12 21 12 21 Z" /><circle cx="12" cy="9.5" r="2.5" /></> },
  { id: 'us', label: 'Мы', icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20 C2.5 15.5 5.5 13.5 9 13.5 S15.5 15.5 15.5 20" /><circle cx="17" cy="9" r="2.5" /><path d="M16 13.5 C19.5 13.5 21.5 15.5 21.5 19" /></> },
]

export function Nav() {
  const { page, setPage, openSheet, data, me } = useReady()
  const meP = data.people.find((p) => p.id === me)!
  return (
    <nav className="nav">
      <div className="brand"><span className="lg"><svg viewBox="0 0 24 24"><path d="M5 19 L19 5 M9 5 h10 v10" /></svg></span>Стрелка</div>
      {TABS.map((t) => (
        <button key={t.id} type="button" className={`tab${page === t.id ? ' on' : ''}`} onClick={() => setPage(t.id)}>
          <svg viewBox="0 0 24 24">{t.icon}</svg>{t.label}
        </button>
      ))}
      <button type="button" className="side-cta" onClick={() => openSheet({ type: 'rule' })}>+ Отметить занятость</button>
      <button type="button" className="me" onClick={() => openSheet({ type: 'profile' })}>
        <Avatar person={meP} /><span>{meP.name}<small>это ты · профиль</small></span>
      </button>
    </nav>
  )
}
