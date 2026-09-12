export function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return <button type="button" className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onChange} />
}
