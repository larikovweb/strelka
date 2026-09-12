declare const __APP_VERSION__: string
export const APP_VERSION = __APP_VERSION__

let checking = false

/** Если на сервере новая сборка — перезагрузить страницу (один раз на версию, чтобы не зациклиться). */
export async function checkForUpdate() {
  if (checking || APP_VERSION.startsWith('dev-')) return
  checking = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const { version } = (await res.json()) as { version: string }
    if (version && version !== APP_VERSION) {
      const key = 'strelka.reloaded-for'
      if (sessionStorage.getItem(key) === version) return
      sessionStorage.setItem(key, version)
      location.reload()
    }
  } catch { /* офлайн — не страшно */ } finally { checking = false }
}
