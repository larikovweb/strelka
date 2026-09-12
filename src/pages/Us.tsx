import { useReady } from '../lib/store'
import { Avatar } from '../components/Avatar'
import { inTelegram } from '../lib/telegram'

export function Us() {
  const { data, me, code, openSheet, toast } = useReady()
  const link = `${location.origin}${location.pathname}#/j/${code}`
  const copy = (text: string, msg: string) => { void navigator.clipboard?.writeText(text); toast(msg) }

  return (
    <>
      <header className="head"><h1>Мы<small>компания и настройки</small></h1></header>
      <div className="two">
        <article className="card">
          <h2>{data.group.name}<small>{data.people.length} человек</small></h2>
          {data.people.map((p) => (
            <div className="row" key={p.id}>
              <Avatar person={p} />
              <span className="nm">{p.name}{p.id === me && ' (ты)'}<small>{p.note || '—'}</small></span>
              {p.id === me && <button type="button" className="mini" onClick={() => openSheet({ type: 'profile' })}>Профиль</button>}
            </div>
          ))}
          <div className="link"><code>{link}</code><button type="button" onClick={() => copy(link, 'Ссылка скопирована')}>Скопировать</button></div>
          <p className="hint">Кто откроет ссылку — попадёт в компанию и выберет, кто он. Регистрации нет.</p>
        </article>

        <article className="card">
          <h2>Telegram<small>{data.group.tgLinked ? 'бот подключён к беседе' : 'бот не подключён'}</small></h2>
          {data.group.tgLinked ? (
            <p className="hint">Кнопка «Собираемся?» на главной отправляет в беседу сбор с кнопкой «отметить». Бот сам обновляет сводку и пишет, когда все ответили и когда встреча забита.</p>
          ) : (
            <ol className="steps">
              <li>Добавьте бота <b>@{import.meta.env.VITE_BOT_USERNAME || 'strelka_bot'}</b> в беседу.</li>
              <li>Напишите в беседе команду <code>/link {code}</code> — бот привяжет чат.</li>
              <li>Готово: «Собираемся?» на главной и <code>/strelka</code> в чате запускают сбор.</li>
            </ol>
          )}
          {!data.group.tgLinked && <button type="button" className="btn ghost" onClick={() => copy(`/link ${code}`, 'Команда скопирована')}>Скопировать команду /link</button>}
          {!inTelegram && <p className="hint">Внутри Telegram приложение открывается как мини-апп и само понимает, кто ты.</p>}
        </article>

        <article className="card">
          <h2>Как считаем</h2>
          <div className="row"><span className="nm">Слоты дня<small>утро 6–12 · день 12–18 · вечер 18–24</small></span></div>
          <div className="row"><span className="nm">Правила<small>повторяющиеся — по дням недели; разовые и смены — по датам; тап в сетке перекрывает правило на один слот</small></span></div>
          <div className="row"><span className="nm">Окно для всех<small>слот, где никто не отметил занятость</small></span></div>
        </article>
      </div>
    </>
  )
}
