import { useStore } from '../lib/store'

export function Toast() {
  const { toastMsg } = useStore()
  return <div className={`toast${toastMsg ? ' show' : ''}`} role="status">{toastMsg}</div>
}
