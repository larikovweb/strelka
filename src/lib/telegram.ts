/** Минимальная обвязка Telegram Mini App SDK (загружается в index.html, вне Telegram отсутствует). */
interface TgWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string }; start_param?: string }
  ready(): void
  expand(): void
  colorScheme: 'light' | 'dark'
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void; notificationOccurred(type: 'success' | 'error' | 'warning'): void }
  openTelegramLink(url: string): void
}

declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

export const tgApp: TgWebApp | null = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null

export const inTelegram = !!tgApp

export function haptic(kind: 'tap' | 'success' | 'error' = 'tap') {
  const h = tgApp?.HapticFeedback
  if (!h) return
  if (kind === 'tap') h.impactOccurred('light')
  else h.notificationOccurred(kind)
}
