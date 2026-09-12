import { initials } from '../lib/model'
import type { Person } from '../lib/types'

export function Avatar({ person, off, className = 'av', style }: { person: Person; off?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`${className}${off ? ' off' : ''}`} style={{ '--c': person.color, ...style } as React.CSSProperties} title={person.name}>
      {initials(person)}
    </span>
  )
}
