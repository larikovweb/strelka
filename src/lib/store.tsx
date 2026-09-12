import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, tg } from './api'
import { weekOffsetOf } from './dates'
import { toggleValue } from './model'
import { supabase } from './supabase'
import { inTelegram, tgApp } from './telegram'
import type { Cell, Day, GroupState, Rule, SlotId } from './types'

export type Page = 'home' | 'sched' | 'meet' | 'us'
export type Sheet =
  | { type: 'detail'; id: string }
  | { type: 'menu' }
  | { type: 'rule'; rule?: Rule; kind?: Rule['kind'] }
  | { type: 'meeting'; id: string }
  | { type: 'profile' }
  | { type: 'gather' }
  | null

type Status = 'boot' | 'nocode' | 'pick' | 'ready' | 'error'

const LS_CODE = 'strelka.code'
const LS_ME = 'strelka.me'

function readHash(): { code: string; weekStart: string | null } | null {
  const m = location.hash.match(/#\/j\/([A-Za-z0-9_-]+)(?:\/w\/(\d{4}-\d{2}-\d{2}))?/)
  if (!m) return null
  history.replaceState(null, '', location.pathname)
  return { code: m[1], weekStart: m[2] ?? null }
}

function ls(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, v: string | null) {
  try { v === null ? localStorage.removeItem(key) : localStorage.setItem(key, v) } catch { /* private mode */ }
}

interface Store {
  status: Status
  error: string | null
  code: string | null
  me: string | null
  data: GroupState | null
  week: number
  page: Page
  sel: string | null
  sheet: Sheet
  toastMsg: string | null
  setWeek(w: number): void
  setPage(p: Page): void
  setSel(id: string | null): void
  openSheet(s: Sheet): void
  closeSheet(): void
  toast(msg: string): void
  pickMe(personId: string): Promise<void>
  forgetMe(): void
  refresh(): Promise<void>
  toggleMe(day: Day, slot: SlotId): Promise<void>
  book(cell: Cell): Promise<void>
  cancelMeeting(id: string): Promise<void>
  updateMeeting(id: string, title: string | null, place: string | null): Promise<void>
  saveRule(rule: Omit<Rule, 'id'> & { id?: string }): Promise<void>
  deleteRule(id: string): Promise<void>
  updatePerson(name: string, color: string, note: string | null): Promise<void>
  gather(note: string): Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('boot')
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [data, setData] = useState<GroupState | null>(null)
  const [week, setWeek] = useState(0)
  const [page, setPage] = useState<Page>('home')
  const [sel, setSel] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const touchTimer = useRef<number | undefined>(undefined)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2200)
  }, [])

  const load = useCallback(async (c: string) => {
    const s = await api.state(c)
    setData(s)
    return s
  }, [])

  const refresh = useCallback(async () => {
    if (!code) return
    try { await load(code) } catch (e) { toast((e as Error).message) }
  }, [code, load, toast])

  // старт: Telegram Mini App или обычный веб
  useEffect(() => {
    (async () => {
      try {
        const hash = readHash()
        const hashCode = hash?.code ?? null
        if (hash?.weekStart) { setWeek(Math.max(0, weekOffsetOf(hash.weekStart))); setPage('sched') }
        if (inTelegram && tgApp) {
          tgApp.ready(); tgApp.expand()
          const r = await tg<{ code: string | null; personId: string | null; weekStart: string | null }>('auth', {
            initData: tgApp.initData, startParam: tgApp.initDataUnsafe.start_param ?? null, code: hashCode ?? ls(LS_CODE),
          })
          if (!r.code) { setStatus('nocode'); return }
          setCode(r.code); lsSet(LS_CODE, r.code)
          if (r.weekStart) { setWeek(Math.max(0, weekOffsetOf(r.weekStart))); setPage('sched') }
          await load(r.code)
          if (r.personId) { setMe(r.personId); setStatus('ready') } else setStatus('pick')
          return
        }
        const c = hashCode ?? ls(LS_CODE)
        if (!c) { setStatus('nocode'); return }
        const s = await load(c)
        setCode(c); lsSet(LS_CODE, c)
        const m = ls(LS_ME)
        if (m && s.people.some((p) => p.id === m)) { setMe(m); setStatus('ready') } else setStatus('pick')
      } catch (e) {
        const msg = (e as Error).message
        if (msg.includes('bad_code')) { lsSet(LS_CODE, null); setStatus('nocode') } else { setError(msg); setStatus('error') }
      }
    })()
  }, [load])

  // realtime: broadcast «changed» → перечитать
  useEffect(() => {
    if (!data?.group.id || channel.current) return
    const ch = supabase.channel(`strelka:${data.group.id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'changed' }, () => { void refresh() }).subscribe()
    channel.current = ch
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible) }
  }, [data?.group.id, refresh])

  const announce = useCallback(() => {
    void channel.current?.send({ type: 'broadcast', event: 'changed', payload: {} })
  }, [])

  /** Сообщить боту, что я обновил занятость (если открыт сбор) — с задержкой, чтобы не дёргать на каждый тап. */
  const touch = useCallback(() => {
    if (!code || !me || !data?.group.tgLinked) return
    if (!data.gatherings.some((g) => !g.closedAt)) return
    window.clearTimeout(touchTimer.current)
    touchTimer.current = window.setTimeout(() => { tg('touch', { code, personId: me }).catch(() => {}) }, 2500)
  }, [code, me, data])

  const run = useCallback(async (fn: () => Promise<unknown>, after?: () => void) => {
    if (!code) return
    try { await fn(); after?.(); announce(); await load(code) } catch (e) { toast((e as Error).message); await refresh() }
  }, [code, announce, load, refresh, toast])

  const pickMe = useCallback(async (personId: string) => {
    if (inTelegram && tgApp && code) {
      try { await tg('bind', { initData: tgApp.initData, code, personId }) } catch (e) { toast((e as Error).message); return }
    }
    setMe(personId); lsSet(LS_ME, personId); setStatus('ready')
  }, [code, toast])

  const forgetMe = useCallback(() => { setMe(null); lsSet(LS_ME, null); setStatus('pick'); setSheet(null) }, [])

  const toggleMe = useCallback(async (day: Day, slot: SlotId) => {
    if (!data || !me || !code) return
    const v = toggleValue(data, me, day, slot)
    // оптимистично
    setData((d) => d && ({ ...d, overrides: [...d.overrides.filter((o) => !(o.personId === me && o.date === day.key && o.slot === slot)), ...(v === null ? [] : [{ personId: me, date: day.key, slot, busy: v, title: null }])] }))
    await run(() => api.setOverride(code, me, day.key, slot, v), touch)
  }, [data, me, code, run, touch])

  const book = useCallback(async (cell: Cell) => {
    if (!code || !me) return
    await run(async () => {
      const id = await api.book(code, me, cell.day.key, cell.slot.id)
      if (data?.group.tgLinked) tg('booked', { code, meetingId: id }).catch(() => {})
    })
  }, [code, me, data, run])

  const cancelMeeting = useCallback(async (id: string) => {
    if (!code) return
    const m = data?.meetings.find((x) => x.id === id)
    await run(async () => {
      await api.updateMeeting(code, id, m?.title ?? null, m?.place ?? null, true)
      if (data?.group.tgLinked) tg('canceled', { code, meetingId: id }).catch(() => {})
    })
  }, [code, data, run])

  const updateMeeting = useCallback(async (id: string, title: string | null, place: string | null) => {
    if (!code) return
    await run(() => api.updateMeeting(code, id, title, place, false))
  }, [code, run])

  const saveRule = useCallback(async (rule: Omit<Rule, 'id'> & { id?: string }) => {
    if (!code) return
    await run(() => api.saveRule(code, rule), touch)
  }, [code, run, touch])

  const deleteRule = useCallback(async (id: string) => {
    if (!code) return
    await run(() => api.deleteRule(code, id), touch)
  }, [code, run, touch])

  const updatePerson = useCallback(async (name: string, color: string, note: string | null) => {
    if (!code || !me) return
    await run(() => api.updatePerson(code, me, name, color, note))
  }, [code, me, run])

  const gather = useCallback(async (note: string) => {
    if (!code || !me) return
    try {
      await tg('gather', { code, personId: me, weekOffset: week, note })
      announce(); await load(code)
      toast('Отправили в Telegram')
    } catch (e) { toast((e as Error).message) }
  }, [code, me, week, announce, load, toast])

  const value = useMemo<Store>(() => ({
    status, error, code, me, data, week, page, sel, sheet, toastMsg,
    setWeek: (w) => { setWeek(w); setSel(null) },
    setPage: (p) => { setPage(p); setSheet(null); window.scrollTo({ top: 0 }) },
    setSel, openSheet: setSheet, closeSheet: () => setSheet(null), toast,
    pickMe, forgetMe, refresh, toggleMe, book, cancelMeeting, updateMeeting, saveRule, deleteRule, updatePerson, gather,
  }), [status, error, code, me, data, week, page, sel, sheet, toastMsg, toast, pickMe, forgetMe, refresh, toggleMe, book, cancelMeeting, updateMeeting, saveRule, deleteRule, updatePerson, gather])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

/** Хук для готового состояния: данные и «я» точно есть. */
export function useReady() {
  const s = useStore()
  return { ...s, data: s.data!, me: s.me!, code: s.code! }
}
