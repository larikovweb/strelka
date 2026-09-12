import { useStore } from '../lib/store'
import { Avatar } from '../components/Avatar'

export function NoCode() {
  return (
    <div className="join">
      <div className="logo"><svg viewBox="0 0 24 24"><path d="M5 19 L19 5 M9 5 h10 v10" /></svg></div>
      <h1>Стрелка</h1>
      <p>Приложение для одной компании друзей: кто когда свободен и когда собираемся.</p>
      <p className="hint">Чтобы войти, открой ссылку-приглашение от друзей — она выглядит как <code>…/#/j/код</code>.</p>
    </div>
  )
}

export function Pick() {
  const { data, pickMe } = useStore()
  if (!data) return null
  return (
    <div className="join">
      <h1>Кто ты?</h1>
      <p>{data.group.name}. Выбери себя — запомним на этом устройстве.</p>
      <div className="picklist">
        {data.people.map((p) => (
          <button key={p.id} type="button" onClick={() => void pickMe(p.id)}><Avatar person={p} />{p.name}{p.note && <small>{p.note}</small>}</button>
        ))}
      </div>
    </div>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="join">
      <h1>Не получилось</h1>
      <p className="hint">{message}</p>
      <button type="button" className="btn dark" onClick={() => location.reload()}>Попробовать снова</button>
    </div>
  )
}
