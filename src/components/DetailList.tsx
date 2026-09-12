import { useReady } from '../lib/store'
import { KIND_LABEL, genitive } from '../lib/model'
import type { Cell } from '../lib/types'
import { Avatar } from './Avatar'
import { Switch } from './Switch'
import { burst } from './confetti'

export function DetailList({ cell }: { cell: Cell }) {
  const { data, me, toggleMe, book, cancelMeeting } = useReady()
  const meBusy = cell.busy.some((b) => b.person.id === me)
  const busyOthers = cell.busy.map((b) => genitive(b.person.name)).join(', ')
  return (
    <>
      {data.people.map((p) => {
        const b = cell.busy.find((x) => x.person.id === p.id)
        return (
          <div className="row" key={p.id}>
            <Avatar person={p} />
            <span className="nm">{p.name}{p.id === me && <small>это ты</small>}</span>
            {b
              ? <span className="st busy"><i />{b.title}<small> · {b.time ?? KIND_LABEL[b.kind]}</small></span>
              : <span className="st"><i />может{cell.notes[p.id] && <small> · {cell.notes[p.id]}</small>}</span>}
            {p.id === me && !cell.past && <Switch on={meBusy} label="Я занят" onChange={() => void toggleMe(cell.day, cell.slot.id)} />}
          </div>
        )
      })}
      {!cell.past && (cell.meeting
        ? <button type="button" className="btn done" onClick={() => void cancelMeeting(cell.meeting!.id)}>Забито ✓ · отменить</button>
        : <button type="button" className={`btn${cell.n < 5 ? ' ghost' : ''}`} onClick={(e) => { burst(e.clientX, e.clientY, data.people.map((p) => p.color)); void book(cell) }}>
            {cell.n === data.people.length ? 'Забить встречу здесь' : `Забить без ${busyOthers}`}
          </button>)}
    </>
  )
}
