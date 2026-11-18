import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import webpush from 'npm:web-push@3.6.7'

type PushSubscriptionRow = {
  id: string
  user_id: string
  operator_id?: string | null
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

type RequestBody = {
  mode?: string
  title?: string
  body?: string
  url?: string
  debug?: boolean
  appointment_id?: string
  appointmentId?: string
  actor_operator_id?: string
  actorOperatorId?: string
}

type ProfileRow = {
  id: string
  professional_type: string | null
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@localhost'

const WINDOW_MS = 10 * 60 * 1000
// Brazil is UTC-3 (no DST for most states including SP/RJ).
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

// Fuso de cada estado (o Brasil não tem horário de verão desde 2019). Sem estado salvo, usa Brasília.
// O horário do agendamento é o horário local da profissional.
const UF_UTC_OFFSET_HOURS: Record<string, number> = { AC: 5, AM: 4, RR: 4, RO: 4, MT: 4, MS: 4 }
const utcOffsetHoursForUf = (uf: string | null | undefined) => UF_UTC_OFFSET_HOURS[String(uf || '').trim().toUpperCase()] ?? 3
// Fuso por conta, carregado no início de cada execução do cron.
const offsetHoursByUser = new Map<string, number>()

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const parseBearerToken = (header: string | null) =>
  header?.replace(/^Bearer\s+/i, '').trim() || ''

const parseAppointmentDate = (date: string, time: string, offsetHours = 3) => {
  const [hoursRaw, minutesRaw] = String(time || '').slice(0, 5).split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  // Data e hora do agendamento estão no horário local da profissional (fuso do estado dela).
  return new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-0${offsetHours}:00`)
}

const isAppointmentDue = (appt: AppointmentRow, minutesBefore: number, nowMs: number) => {
  const at = parseAppointmentDate(appt.date, appt.time, offsetHoursByUser.get(appt.user_id) ?? 3)
  if (!at) return false
  const fireAt = at.getTime() - minutesBefore * 60 * 1000
  const delta = nowMs - fireAt
  return delta >= 0 && delta <= WINDOW_MS
}

const buildReminderBody = (minutesBefore: number, professionalType?: string | null) => {
  const unit = professionalType === 'barbeiro' ? 'corte' : 'atendimento'
  return minutesBefore === 60
    ? `Falta 1h pro seu próximo ${unit} ⏰`
    : `Faltam ${minutesBefore} min pro seu próximo ${unit} ⏰`
}

const maskEndpoint = (endpoint: string) => {
  try {
    const url = new URL(endpoint)
    const tail = url.pathname.slice(-16)
    return `${url.hostname}${tail ? `...${tail}` : ''}`
  } catch {
    return endpoint.slice(-24)
  }
}

const sendPush = async (
  sub: PushSubscriptionRow,
  payload: string,
) => webpush.sendNotification(
  {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.keys_p256dh,
      auth: sub.keys_auth,
    },
  },
  payload,
)

const statusCodeOf = (error: unknown) =>
  typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: number }).statusCode)
    : 0

const formatBookingWhen = (date: string, time: string) => {
  const ymd = String(date || '').slice(0, 10)
  const parts = ymd.split('-')
  const hhmm = String(time || '').slice(0, 5)
  if (parts.length === 3) return `${parts[2]}/${parts[1]} às ${hhmm}`
  return hhmm
}

const loadSubscriptions = async (
  sb: ReturnType<typeof createClient>,
  userId: string,
) => {
  const withOperator = await sb
    .from('push_subscriptions')
    .select('id,user_id,operator_id,endpoint,keys_p256dh,keys_auth,reminder_minutes_before')
    .eq('user_id', userId)

  if (!withOperator.error) {
    return { subscriptions: (withOperator.data || []) as PushSubscriptionRow[], error: null as string | null }
  }

  const missingColumn = /operator_id/i.test(withOperator.error.message)
  if (!missingColumn) {
    return { subscriptions: [] as PushSubscriptionRow[], error: withOperator.error.message }
  }

  const fallback = await sb
    .from('push_subscriptions')
    .select('id,user_id,endpoint,keys_p256dh,keys_auth,reminder_minutes_before')
    .eq('user_id', userId)

  if (fallback.error) {
    return { subscriptions: [] as PushSubscriptionRow[], error: fallback.error.message }
  }
  return { subscriptions: (fallback.data || []) as PushSubscriptionRow[], error: null as string | null }
}

const loadAccountOwnerId = async (
  sb: ReturnType<typeof createClient>,
  userId: string,
) => {
  const rpc = await sb.rpc('account_owner_id', { p_user_id: userId })
  if (!rpc.error && rpc.data) return String(rpc.data)

  const { data, error } = await sb
    .from('team_members')
    .select('id,created_at')
    .eq('user_id', userId)
    .eq('active', true)

  if (error || !data?.length) return null
  const sorted = [...data].sort((a, b) => {
    const ta = new Date(String((a as { created_at?: string }).created_at || 0)).getTime()
    const tb = new Date(String((b as { created_at?: string }).created_at || 0)).getTime()
    if (ta !== tb) return ta - tb
    return String((a as { id: string }).id).localeCompare(String((b as { id: string }).id))
  })
  return (sorted[0] as { id?: string } | undefined)?.id || null
}

const sendToSubscriptions = async (subscriptions: PushSubscriptionRow[], payload: string) => {
  const staleSubscriptionIds = new Set<string>()
  let sent = 0
  let failed = 0

  for (const sub of subscriptions) {
    try {
      await sendPush(sub, payload)
      sent += 1
    } catch (error) {
      failed += 1
      const statusCode = statusCodeOf(error)
      if (statusCode === 404 || statusCode === 410) staleSubscriptionIds.add(sub.id)
      console.error('[push] send failed', {
        subscriptionId: sub.id,
        userId: sub.user_id,
        statusCode,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { sent, failed, staleSubscriptionIds }
}

const pruneStaleSubscriptions = async (
  sb: ReturnType<typeof createClient>,
  staleSubscriptionIds: Set<string>,
) => {
  if (staleSubscriptionIds.size === 0) return
  const ids = [...staleSubscriptionIds]
  const { error } = await sb.from('push_subscriptions').delete().in('id', ids)
  if (error) {
    console.error('[push] failed to prune stale subscriptions', { count: ids.length, error: error.message })
  }
}

// ─── Resumo do dia ───────────────────────────────────────────────────────────
// 1h antes do primeiro atendimento: "Hoje você tem 3 atendimentos: 09:00, 10:30 e 14:00."
// Vai só para contas com acesso completo (mesma regra de public.is_full_access) e
// uma vez por dia (tabela daily_summary_pushes).

const SUMMARY_MINUTES_BEFORE = 60
const SUMMARY_MAX_TIMES = 8

type DayAppointment = { id: string; user_id: string; date: string; time: string }

const formatTimesList = (times: string[]) => {
  const shown = times.slice(0, SUMMARY_MAX_TIMES)
  const rest = times.length - shown.length
  if (rest > 0) return `${shown.join(', ')} e mais ${rest}`
  if (shown.length === 1) return shown[0]
  return `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`
}

const buildDailySummaryBody = (times: string[], professionalType?: string | null) => {
  const barber = professionalType === 'barbeiro'
  const one = barber ? 'corte' : 'atendimento'
  const many = barber ? 'cortes' : 'atendimentos'
  if (times.length === 1) return `Hoje você tem 1 ${one}, às ${times[0]}. Falta 1h ⏰`
  return `Hoje você tem ${times.length} ${many}: ${formatTimesList(times)}. O primeiro é daqui a 1h ⏰`
}

const sendDailySummaries = async (
  sb: ReturnType<typeof createClient>,
  userIds: string[],
  professionalTypeByUserId: Map<string, string>,
  todayBrt: string,
  nowMs: number,
) => {
  const result = { sent: 0, failed: 0, accounts: 0, coveredAppointmentIds: new Set<string>(), staleSubscriptionIds: new Set<string>() }
  if (!userIds.length) return result

  const { data, error } = await sb
    .from('appointments')
    .select('id,user_id,date,time,status,blocked')
    .in('user_id', userIds)
    .eq('date', todayBrt)
    .in('status', ['pending', 'confirmed'])
  if (error) {
    console.error('[push] daily summary query failed', error.message)
    return result
  }

  const byUser = new Map<string, DayAppointment[]>()
  for (const appt of (data || []) as Array<DayAppointment & { blocked?: boolean | null }>) {
    if (appt.blocked) continue
    const list = byUser.get(appt.user_id) || []
    list.push(appt)
    byUser.set(appt.user_id, list)
  }

  // Quem está na hora: agora entre 60 e 50 min antes do primeiro atendimento.
  const dueUsers: Array<{ userId: string; appts: DayAppointment[] }> = []
  for (const [userId, appts] of byUser) {
    appts.sort((a, b) => String(a.time).localeCompare(String(b.time)))
    const first = parseAppointmentDate(appts[0].date, appts[0].time, offsetHoursByUser.get(userId) ?? 3)
    if (!first) continue
    const delta = nowMs - (first.getTime() - SUMMARY_MINUTES_BEFORE * 60 * 1000)
    if (delta >= 0 && delta <= WINDOW_MS) dueUsers.push({ userId, appts })
  }
  if (!dueUsers.length) return result

  const { data: profiles } = await sb
    .from('profiles')
    .select('id,access_level,subscription_expires_at')
    .in('id', dueUsers.map((u) => u.userId))
  const fullAccess = new Set(
    ((profiles || []) as Array<{ id: string; access_level: string | null; subscription_expires_at: string | null }>)
      .filter((p) => p.access_level === 'full' && (!p.subscription_expires_at || Date.parse(p.subscription_expires_at) > nowMs))
      .map((p) => p.id),
  )

  for (const { userId, appts } of dueUsers) {
    if (!fullAccess.has(userId)) continue

    // Reserva o dia antes de enviar: se outra execução já reservou, não manda de novo.
    const claim = await sb.from('daily_summary_pushes').insert({ user_id: userId, day: todayBrt, appointments: appts.length })
    if (claim.error) {
      if (claim.error.code !== '23505') console.error('[push] daily summary claim failed', { userId, error: claim.error.message })
      continue
    }

    const { subscriptions, error: subsError } = await loadSubscriptions(sb, userId)
    if (subsError || !subscriptions.length) continue
    // Equipe: o resumo da agenda inteira vai para a dona da conta (ou aparelhos sem operadora).
    const ownerId = subscriptions.some((s) => s.operator_id) ? await loadAccountOwnerId(sb, userId) : null
    const targets = subscriptions.filter((s) => !s.operator_id || !ownerId || s.operator_id === ownerId)
    if (!targets.length) continue

    const times = appts.map((a) => String(a.time).slice(0, 5))
    const payload = JSON.stringify({
      title: 'Agenda de hoje',
      body: buildDailySummaryBody(times, professionalTypeByUserId.get(userId)),
      tag: `daily-${todayBrt}`,
      data: { url: '/agenda' },
    })
    const sentNow = await sendToSubscriptions(targets, payload)
    result.sent += sentNow.sent
    result.failed += sentNow.failed
    result.accounts += 1
    for (const id of sentNow.staleSubscriptionIds) result.staleSubscriptionIds.add(id)
    // O aviso "Falta 1h" do primeiro atendimento sairia no mesmo minuto: o resumo já cobre.
    if (sentNow.sent > 0) result.coveredAppointmentIds.add(appts[0].id)
  }

  return result
}

const handleNewBooking = async (
  sb: ReturnType<typeof createClient>,
  appointmentId: string,
) => {
  const { data: appt, error: apptError } = await sb
    .from('appointments')
    .select('id,user_id,client_id,service_id,date,time,notes,owner_notified_at,created_at')
    .eq('id', appointmentId)
    .maybeSingle()

  let appointment = appt as {
    id: string
    user_id: string
    client_id: string | null
    service_id: string | null
    date: string
    time: string
    notes: string | null
    owner_notified_at?: string | null
    created_at?: string | null
  } | null

  if (apptError) {
    const missingColumn = /owner_notified_at/i.test(apptError.message)
    if (!missingColumn) {
      return json(500, { ok: false, error: `appointments query failed: ${apptError.message}` })
    }
    const fallback = await sb
      .from('appointments')
      .select('id,user_id,client_id,service_id,date,time,notes,created_at')
      .eq('id', appointmentId)
      .maybeSingle()
    if (fallback.error) {
      return json(500, { ok: false, error: `appointments query failed: ${fallback.error.message}` })
    }
    appointment = fallback.data as typeof appointment
  }

  if (!appointment) return json(404, { ok: false, error: 'appointment_not_found' })
  if (String(appointment.notes || '').trim() !== 'Agendamento público') {
    return json(403, { ok: false, error: 'not_public_booking' })
  }
  if (appointment.owner_notified_at) {
    return json(200, { ok: true, sent: 0, reason: 'already_notified' })
  }
  if (appointment.created_at) {
    const createdMs = new Date(appointment.created_at).getTime()
    if (Number.isFinite(createdMs) && Date.now() - createdMs > 30 * 60 * 1000) {
      return json(200, { ok: true, sent: 0, reason: 'booking_too_old' })
    }
  }

  const [{ data: clientRow }, { data: serviceRow }] = await Promise.all([
    appointment.client_id
      ? sb.from('clients').select('name').eq('id', appointment.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.service_id
      ? sb.from('services').select('name').eq('id', appointment.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const clientName = String((clientRow as { name?: string } | null)?.name || '').trim() || 'Cliente'
  const serviceName = String((serviceRow as { name?: string } | null)?.name || '').trim()
  const when = formatBookingWhen(appointment.date, appointment.time)
  const payload = JSON.stringify({
    title: 'Novo agendamento',
    body: serviceName
      ? `${clientName} agendou ${serviceName} para ${when}`
      : `${clientName} agendou para ${when}`,
    tag: `new-booking-${appointment.id}`,
    data: { url: '/agenda' },
  })

  const { subscriptions, error: subsError } = await loadSubscriptions(sb, appointment.user_id)
  if (subsError) return json(500, { ok: false, error: `push_subscriptions query failed: ${subsError}` })

  const userSubs = subscriptions
  if (!userSubs.length) {
    await sb.from('appointments').update({ owner_notified_at: new Date().toISOString() }).eq('id', appointment.id)
    return json(200, { ok: true, mode: 'new_booking', sent: 0, reason: 'no_subscriptions' })
  }

  const { sent, failed, staleSubscriptionIds } = await sendToSubscriptions(userSubs, payload)
  await pruneStaleSubscriptions(sb, staleSubscriptionIds)

  if (sent > 0 || userSubs.length === staleSubscriptionIds.size) {
    const marked = await sb
      .from('appointments')
      .update({ owner_notified_at: new Date().toISOString() })
      .eq('id', appointment.id)
    if (marked.error && !/owner_notified_at/i.test(marked.error.message)) {
      console.error('[push] failed to mark owner notified', { appointmentId: appointment.id, error: marked.error.message })
    }
  }

  return json(200, {
    ok: true,
    mode: 'new_booking',
    sent,
    failed,
    staleSubscriptionsRemoved: staleSubscriptionIds.size,
  })
}

const handleStaffBooking = async (
  sb: ReturnType<typeof createClient>,
  appointmentId: string,
  accountUserId: string,
  actorOperatorId: string,
) => {
  const { data: appt, error: apptError } = await sb
    .from('appointments')
    .select('id,user_id,client_id,service_id,date,time,notes,blocked,created_at')
    .eq('id', appointmentId)
    .eq('user_id', accountUserId)
    .maybeSingle()

  if (apptError) return json(500, { ok: false, error: `appointments query failed: ${apptError.message}` })
  const appointment = appt as {
    id: string
    user_id: string
    client_id: string | null
    service_id: string | null
    date: string
    time: string
    notes: string | null
    blocked?: boolean | null
    created_at?: string | null
  } | null

  if (!appointment) return json(404, { ok: false, error: 'appointment_not_found' })
  if (appointment.blocked) return json(200, { ok: true, sent: 0, reason: 'blocked_slot' })
  if (String(appointment.notes || '').trim() === 'Agendamento público') {
    return json(200, { ok: true, sent: 0, reason: 'public_booking_uses_other_mode' })
  }
  if (appointment.created_at) {
    const createdMs = new Date(appointment.created_at).getTime()
    if (Number.isFinite(createdMs) && Date.now() - createdMs > 30 * 60 * 1000) {
      return json(200, { ok: true, sent: 0, reason: 'booking_too_old' })
    }
  }

  const ownerId = await loadAccountOwnerId(sb, appointment.user_id)
  if (!ownerId) return json(200, { ok: true, sent: 0, reason: 'no_owner' })

  const actorIsOwner = !!(actorOperatorId && actorOperatorId === ownerId)

  const [{ data: clientRow }, { data: serviceRow }, { data: actorRow }, { data: teamRows }] = await Promise.all([
    appointment.client_id
      ? sb.from('clients').select('name').eq('id', appointment.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.service_id
      ? sb.from('services').select('name').eq('id', appointment.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
    actorOperatorId
      ? sb.from('team_members').select('name').eq('id', actorOperatorId).eq('user_id', appointment.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    actorIsOwner
      ? sb.from('team_members').select('id').eq('user_id', appointment.user_id).eq('active', true)
      : Promise.resolve({ data: null }),
  ])

  const clientName = String((clientRow as { name?: string } | null)?.name || '').trim() || 'Cliente'
  const serviceName = String((serviceRow as { name?: string } | null)?.name || '').trim()
  const actorName = String((actorRow as { name?: string } | null)?.name || '').trim()
    || (actorIsOwner ? 'Dona' : 'Funcionário')
  const when = formatBookingWhen(appointment.date, appointment.time)
  const payload = JSON.stringify({
    title: 'Novo agendamento',
    body: serviceName
      ? `${actorName} agendou ${clientName} — ${serviceName} para ${when}`
      : `${actorName} agendou ${clientName} para ${when}`,
    tag: `staff-booking-${appointment.id}`,
    data: { url: '/agenda' },
  })

  const { subscriptions, error: subsError } = await loadSubscriptions(sb, appointment.user_id)
  if (subsError) return json(500, { ok: false, error: `push_subscriptions query failed: ${subsError}` })

  let targetSubs: PushSubscriptionRow[] = []
  if (actorIsOwner) {
    const staffIds = new Set(
      ((teamRows || []) as Array<{ id?: string }>)
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id && id !== ownerId)),
    )
    if (!staffIds.size) {
      return json(200, { ok: true, mode: 'staff_booking', sent: 0, reason: 'no_staff' })
    }
    targetSubs = subscriptions.filter((sub) => sub.operator_id && staffIds.has(sub.operator_id))
    if (!targetSubs.length) {
      return json(200, { ok: true, mode: 'staff_booking', sent: 0, reason: 'no_staff_subscriptions' })
    }
  } else {
    targetSubs = subscriptions.filter((sub) => !sub.operator_id || sub.operator_id === ownerId)
    if (!targetSubs.length) {
      return json(200, { ok: true, mode: 'staff_booking', sent: 0, reason: 'no_owner_subscriptions' })
    }
  }

  const { sent, failed, staleSubscriptionIds } = await sendToSubscriptions(targetSubs, payload)
  await pruneStaleSubscriptions(sb, staleSubscriptionIds)

  return json(200, {
    ok: true,
    mode: 'staff_booking',
    sent,
    failed,
    staleSubscriptionsRemoved: staleSubscriptionIds.size,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' })

  let requestBody: RequestBody = {}
  try {
    requestBody = await req.json()
  } catch {
    requestBody = {}
  }

  const appointmentId = String(requestBody.appointment_id || requestBody.appointmentId || '').trim()
  const actorOperatorId = String(requestBody.actor_operator_id || requestBody.actorOperatorId || '').trim()
  const isNewBooking = requestBody.mode === 'new_booking'
  const isStaffBooking = requestBody.mode === 'staff_booking'
  const secret = Deno.env.get('CRON_SECRET') || ''
  const auth = parseBearerToken(req.headers.get('Authorization'))
  const cronAuthorized = Boolean(secret && auth === secret)

  if (!isNewBooking && !isStaffBooking && !cronAuthorized) return json(401, { ok: false, error: 'Unauthorized' })
  if ((isNewBooking || isStaffBooking) && !appointmentId) {
    return json(400, { ok: false, error: 'appointment_id required' })
  }

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

  if (isNewBooking) return handleNewBooking(sb, appointmentId)

  if (isStaffBooking) {
    if (!auth || cronAuthorized) return json(401, { ok: false, error: 'Unauthorized' })
    const { data: userData, error: userError } = await sb.auth.getUser(auth)
    const accountUserId = userData?.user?.id || ''
    if (userError || !accountUserId) return json(401, { ok: false, error: 'Unauthorized' })
    return handleStaffBooking(sb, appointmentId, accountUserId, actorOperatorId)
  }

  const { data: subscriptions, error: subsError } = await sb
    .from('push_subscriptions')
    .select('id,user_id,endpoint,keys_p256dh,keys_auth,reminder_minutes_before')

  if (subsError) return json(500, { ok: false, error: `push_subscriptions query failed: ${subsError.message}` })
  if (!subscriptions?.length) return json(200, { ok: true, sent: 0, reason: 'no_subscriptions' })

  if (requestBody.mode === 'broadcast_test') {
    const staleSubscriptionIds = new Set<string>()
    let sent = 0
    let failed = 0
    const results: Array<Record<string, unknown>> = []

    const payload = JSON.stringify({
      title: requestBody.title?.trim() || 'Teste de notificacao',
      body: requestBody.body?.trim() || 'Seu envio push esta funcionando neste dispositivo.',
      tag: 'broadcast-test',
      data: { url: requestBody.url?.trim() || '/' },
    })

    for (const sub of subscriptions as PushSubscriptionRow[]) {
      try {
        await sendPush(sub, payload)
        sent += 1
        if (requestBody.debug) {
          results.push({
            subscriptionId: sub.id,
            userId: sub.user_id,
            endpoint: maskEndpoint(sub.endpoint),
            status: 'sent',
          })
        }
      } catch (error) {
        failed += 1
        const statusCode = typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0
        if (statusCode === 404 || statusCode === 410) staleSubscriptionIds.add(sub.id)
        if (requestBody.debug) {
          results.push({
            subscriptionId: sub.id,
            userId: sub.user_id,
            endpoint: maskEndpoint(sub.endpoint),
            status: 'failed',
            statusCode,
            message: error instanceof Error ? error.message : String(error),
          })
        }
        console.error('[push] broadcast test failed', {
          subscriptionId: sub.id,
          userId: sub.user_id,
          statusCode,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (staleSubscriptionIds.size > 0) {
      const ids = [...staleSubscriptionIds]
      const { error } = await sb.from('push_subscriptions').delete().in('id', ids)
      if (error) {
        console.error('[push] failed to prune stale subscriptions after broadcast', { count: ids.length, error: error.message })
      }
    }

    return json(200, {
      ok: true,
      mode: 'broadcast_test',
      subscriptions: subscriptions.length,
      sent,
      failed,
      staleSubscriptionsRemoved: staleSubscriptionIds.size,
      results: requestBody.debug ? results : undefined,
    })
  }

  // Use BRT date so we match appointment dates stored in Brazilian local time.
  const todayBrt = new Date(Date.now() - BRT_OFFSET_MS).toISOString().slice(0, 10)
  // Also look 1 day back because near midnight BRT the UTC date may differ.
  const yesterdayBrt = new Date(Date.now() - BRT_OFFSET_MS - 86400000).toISOString().slice(0, 10)
  const today = todayBrt
  const userIds = [...new Set(subscriptions.map((s) => s.user_id).filter(Boolean))]
  const { data: profiles } = await sb
    .from('profiles')
    .select('id,professional_type')
    .in('id', userIds)

  const professionalTypeByUserId = new Map<string, string>()
  for (const profile of (profiles || []) as ProfileRow[]) {
    professionalTypeByUserId.set(profile.id, profile.professional_type || 'lash')
  }

  offsetHoursByUser.clear()
  const { data: tzRows } = await sb.from('config').select('user_id,state_uf').in('user_id', userIds)
  for (const row of (tzRows || []) as Array<{ user_id: string; state_uf: string | null }>) {
    offsetHoursByUser.set(row.user_id, utcOffsetHoursForUf(row.state_uf))
  }

  const summary = await sendDailySummaries(sb, userIds, professionalTypeByUserId, todayBrt, Date.now())
  const summaryStats = { accounts: summary.accounts, sent: summary.sent, failed: summary.failed }
  if (summary.staleSubscriptionIds.size > 0) {
    await pruneStaleSubscriptions(sb, summary.staleSubscriptionIds)
  }

  const { data: appointments, error: apptError } = await sb
    .from('appointments')
    .select('id,user_id,date,time,status,reminder_enabled,reminder_minutes_before')
    .in('user_id', userIds)
    .in('date', [today, yesterdayBrt])
    .eq('reminder_enabled', true)
    .in('status', ['pending', 'confirmed'])
    .is('reminder_sent_at', null)

  if (apptError) return json(500, { ok: false, error: `appointments query failed: ${apptError.message}` })
  if (!appointments?.length) return json(200, { ok: true, sent: 0, reason: 'no_due_appointments_today', dailySummary: summaryStats })

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

    // O resumo do dia acabou de sair para este primeiro atendimento: não manda o "Falta 1h" junto.
    if (summary.coveredAppointmentIds.has(due.id)) {
      sentAppointmentIds.add(due.id)
      continue
    }

    const effectiveMinutes =
      due.reminder_minutes_before != null && Number(due.reminder_minutes_before) > 0
        ? Number(due.reminder_minutes_before)
        : minutesBefore

    const payload = JSON.stringify({
      title: 'Easy Studio',
      body: buildReminderBody(effectiveMinutes, professionalTypeByUserId.get(sub.user_id)),
      tag: `appt-${due.id}`,
      data: { url: '/agenda' },
    })

    try {
      await sendPush(sub, payload)
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
    dailySummary: summaryStats,
  })
})
