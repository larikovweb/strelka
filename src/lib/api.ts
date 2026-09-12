import { SUPABASE_URL, supabase } from './supabase'
import type { GroupState, Rule, SlotId } from './types'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const api = {
  state: (code: string) => rpc<GroupState>('strelka_state', { code }),

  saveRule: (code: string, rule: Omit<Rule, 'id'> & { id?: string }) => rpc<string>('strelka_save_rule', { code, rule }),
  deleteRule: (code: string, ruleId: string) => rpc<void>('strelka_delete_rule', { code, rule_id: ruleId }),

  setOverride: (code: string, personId: string, date: string, slot: SlotId, busy: boolean | null, title?: string) =>
    rpc<void>('strelka_set_override', { code, person_id: personId, d: date, slot, busy, title: title ?? null }),

  book: (code: string, personId: string, date: string, slot: SlotId, title?: string, place?: string) =>
    rpc<string>('strelka_book', { code, person_id: personId, d: date, slot, title: title ?? null, place: place ?? null }),
  updateMeeting: (code: string, meetingId: string, title: string | null, place: string | null, canceled: boolean) =>
    rpc<void>('strelka_update_meeting', { code, meeting_id: meetingId, title, place, canceled }),

  updatePerson: (code: string, personId: string, name: string, color: string, note: string | null) =>
    rpc<void>('strelka_update_person', { code, person_id: personId, name, color, note }),
}

/** Вызовы Edge Function бота (Telegram). */
export async function tg<T = unknown>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_KEY as string },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `tg ${action} failed`)
  return data as T
}
