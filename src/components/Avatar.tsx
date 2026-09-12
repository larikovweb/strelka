import { useState } from 'react'
import { initials } from '../lib/model'
import type { Person } from '../lib/types'

/** Аватар: фото из Telegram, если есть, иначе инициал на цвете человека. */
export function Avatar({ person, off, className = 'av', style }: { person: Person; off?: boolean; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false)
  const photo = person.avatar && !broken && !off
  return (
    <span className={`${className}${off ? ' off' : ''}${photo ? ' photo' : ''}`} style={{ '--c': person.color, ...style } as React.CSSProperties} title={person.name}>
      {photo ? <img src={person.avatar!} alt="" onError={() => setBroken(true)} /> : initials(person)}
    </span>
  )
}
