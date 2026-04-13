import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import webpush from 'npm:web-push@3.6.7'

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  keys_p256dh: string
  keys_auth: string
  reminder_minutes_before: number | null
}

type AppointmentRow = {
  id: string
  user_id: string
  date: string
  time: string
  status: string | null
  reminder_enabled: boolean | null
  reminder_minutes_before: number | null
}

const jsonHeaders = { 'Content-Type': 'application/json' }
const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@localhost'

const WINDOW_MS = 10 * 60 * 1000

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const parseBearerToken = (header: string | null) =>
  header?.replace(/^Bearer\s+/i, '').trim() || ''

const parseAppointmentDate = (date: string, time: string) => {
  const [hoursRaw, minutesRaw] = String(time || '').slice(0, 5).split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`)
}

const isAppointmentDue = (appt: AppointmentRow, minutesBefore: number, nowMs: number) => {
  const at = parseAppointmentDate(appt.date, appt.time)
  if (!at) return false
  const fireAt = at.getTime() - minutesBefore * 60 * 1000
  const delta = nowMs - fireAt
  return delta >= 0 && delta <= WINDOW_MS
}

const buildReminderBody = (minutesBefore: number) =>
  minutesBefore === 60
    ? 'Falta 1h pro seu próximo atendimento ⏰'
    : `Faltam ${minutesBefore} min pro seu próximo atendimento ⏰`

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' })

  const secret = Deno.env.get('CRON_SECRET') || ''
  const auth = parseBearerToken(req.headers.get('Authorization'))
  if (!secret || auth !== secret) return json(401, { ok: false, error: 'Unauthorized' })

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json(500, { ok: false, error: 'Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY' })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const sb = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: subscriptions, error: subsError } = await sb
    .from('push_subscriptions')
    .select('id,user_id,endpoint,keys_p256dh,keys_auth,reminder_minutes_before')

  if (subsError) return json(500, { ok: false, error: `push_subscriptions query failed: ${subsError.message}` })
  if (!subscriptions?.length) return json(200, { ok: true, sent: 0, reason: 'no_subscriptions' })

  const today = new Date().toISOString().slice(0, 10)
  const userIds = [...new Set(subscriptions.map((s) => s.user_id).filter(Boolean))]
  const { data: appointments, error: apptError } = await sb
    .from('appointments')
    .select('id,user_id,date,time,status,reminder_enabled,reminder_minutes_before')
    .in('user_id', userIds)
    .eq('date', today)
    .eq('reminder_enabled', true)
    .in('status', ['pending', 'confirmed'])
    .is('reminder_sent_at', null)

  if (apptError) return json(500, { ok: false, error: `appointments query failed: ${apptError.message}` })
  if (!appointments?.length) return json(200, { ok: true, sent: 0, reason: 'no_due_appointments_today' })

  const appointmentsByUser = new Map<string, AppointmentRow[]>()
  for (const appt of appointments as AppointmentRow[]) {
    const arr = appointmentsByUser.get(appt.user_id) || []
    arr.push(appt)
    appointmentsByUser.set(appt.user_id, arr)
  }

  const nowMs = Date.now()
  const sentAppointmentIds = new Set<string>()
  const staleSubscriptionIds = new Set<string>()
  let sent = 0
  let failed = 0

  for (const sub of subscriptions as PushSubscriptionRow[]) {
    const userAppointments = appointmentsByUser.get(sub.user_id) || []
    if (!userAppointments.length) continue

    const minutesBefore =
      sub.reminder_minutes_before != null && Number(sub.reminder_minutes_before) > 0
        ? Number(sub.reminder_minutes_before)
        : 60

    const due = userAppointments.find((appt) => {
      const effectiveMinutes =
        appt.reminder_minutes_before != null && Number(appt.reminder_minutes_before) > 0
          ? Number(appt.reminder_minutes_before)
          : minutesBefore
      return isAppointmentDue(appt, effectiveMinutes, nowMs)
    })

    if (!due) continue

    const effectiveMinutes =
      due.reminder_minutes_before != null && Number(due.reminder_minutes_before) > 0
        ? Number(due.reminder_minutes_before)
        : minutesBefore

    const payload = JSON.stringify({
      title: 'Lash Studio',
      body: buildReminderBody(effectiveMinutes),
      tag: `appt-${due.id}`,
      data: { url: '/agenda' },
    })

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys_p256dh,
            auth: sub.keys_auth,
          },
        },
        payload,
      )
      sent += 1
      sentAppointmentIds.add(due.id)
    } catch (error) {
      failed += 1
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0
      if (statusCode === 404 || statusCode === 410) {
        staleSubscriptionIds.add(sub.id)
      }
      console.error('[push] send failed', {
        subscriptionId: sub.id,
        userId: sub.user_id,
        appointmentId: due.id,
        statusCode,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (staleSubscriptionIds.size > 0) {
    const ids = [...staleSubscriptionIds]
    const { error } = await sb.from('push_subscriptions').delete().in('id', ids)
    if (error) {
      console.error('[push] failed to prune stale subscriptions', { count: ids.length, error: error.message })
    }
  }

  if (sentAppointmentIds.size > 0) {
    const ids = [...sentAppointmentIds]
    const nowIso = new Date().toISOString()
    let { error } = await sb
      .from('appointments')
      .update({ reminder_sent_at: nowIso, notification_status: 'sent' })
      .in('id', ids)

    if (error) {
      const fallback = await sb.from('appointments').update({ reminder_sent_at: nowIso }).in('id', ids)
      error = fallback.error
    }

    if (error) {
      console.error('[push] failed to mark reminder as sent', { count: ids.length, error: error.message })
    }
  }

  return json(200, {
    ok: true,
    subscriptions: subscriptions.length,
    appointmentsToday: appointments.length,
    sent,
    failed,
    staleSubscriptionsRemoved: staleSubscriptionIds.size,
    remindersMarkedSent: sentAppointmentIds.size,
  })
})
