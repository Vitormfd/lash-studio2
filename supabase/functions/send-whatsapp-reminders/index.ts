import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

type AppointmentWithClient = {
  id: string
  user_id: string
  client_id: string | null
  start_time: string | null
  status: string | null
  reminder_sent: boolean | null
  clients: {
    name: string | null
    phone: string | null
  } | null
}

type SendResult = {
  ok: boolean
  providerMessageId?: string
  error?: string
  payload?: Record<string, unknown>
}

type RequestBody = {
  dryRun?: boolean
}

type ConfigRow = {
  user_id: string
  professional_whatsapp: string | null
}

const jsonHeaders = { 'Content-Type': 'application/json' }
const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY') || ''
const WHATSAPP_NUMBER = Deno.env.get('WHATSAPP_NUMBER') || ''
const WHATSAPP_PROVIDER = (Deno.env.get('WHATSAPP_PROVIDER') || 'mock').toLowerCase()
const WHATSAPP_API_URL = Deno.env.get('WHATSAPP_API_URL') || ''

const WINDOW_MIN_START = 55
const WINDOW_MIN_END = 65
const BRT_TZ = 'America/Sao_Paulo'

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const parseBearerToken = (header: string | null) =>
  header?.replace(/^Bearer\s+/i, '').trim() || ''

const isE164 = (phone: string | null | undefined) =>
  typeof phone === 'string' && /^\+[1-9]\d{10,14}$/.test(phone)

const formatBrtTime = (isoDate: string) =>
  new Date(isoDate).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BRT_TZ,
  })

const buildReminderMessage = (clientName: string | null, startTimeIso: string) => {
  const hour = formatBrtTime(startTimeIso)
  const firstName = (clientName || '').trim().split(/\s+/)[0] || 'tudo bem'
  return `Oi, ${firstName}! Passando para te lembrar do seu atendimento as ${hour} 💅`
}

const resolveSenderNumber = (professionalNumber?: string | null) => {
  const candidate = (professionalNumber || '').trim()
  if (isE164(candidate)) return candidate
  return ''
}

const sendWhatsAppMessage = async (
  phone: string,
  message: string,
  senderNumber: string,
): Promise<SendResult> => {
  if (!senderNumber) {
    return { ok: false, error: 'Missing sender WhatsApp number (professional_whatsapp or WHATSAPP_NUMBER)' }
  }

  if (WHATSAPP_PROVIDER === 'mock') {
    console.log('[whatsapp][mock] message prepared', { to: phone, from: senderNumber, message })
    return {
      ok: true,
      providerMessageId: `mock-${crypto.randomUUID()}`,
      payload: { to: phone, from: senderNumber, provider: 'mock' },
    }
  }

  if (!WHATSAPP_API_KEY) {
    return { ok: false, error: 'Missing WHATSAPP_API_KEY' }
  }

  if (WHATSAPP_PROVIDER === 'twilio') {
    const endpoint = WHATSAPP_API_URL || 'https://api.twilio.com/2010-04-01/Accounts/messages.json'
    const body = new URLSearchParams({
      From: `whatsapp:${senderNumber}`,
      To: `whatsapp:${phone}`,
      Body: message,
    })

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        error: `Twilio send failed (${response.status}): ${text.slice(0, 300)}`,
        payload: { provider: 'twilio', endpoint },
      }
    }

    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = null
    }

    return {
      ok: true,
      providerMessageId: parsed?.sid ? String(parsed.sid) : undefined,
      payload: parsed || { provider: 'twilio', raw: text.slice(0, 300) },
    }
  }

  if (WHATSAPP_PROVIDER === 'waba') {
    if (!WHATSAPP_API_URL) {
      return { ok: false, error: 'Missing WHATSAPP_API_URL for WABA provider' }
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    }

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        error: `WABA send failed (${response.status}): ${text.slice(0, 300)}`,
        payload: { provider: 'waba', endpoint: WHATSAPP_API_URL },
      }
    }

    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = null
    }

    return {
      ok: true,
      providerMessageId: parsed?.messages && Array.isArray(parsed.messages) && parsed.messages[0]?.id
        ? String(parsed.messages[0].id)
        : undefined,
      payload: parsed || { provider: 'waba', raw: text.slice(0, 300) },
    }
  }

  return { ok: false, error: `Unsupported WHATSAPP_PROVIDER: ${WHATSAPP_PROVIDER}` }
}

const checkUpcomingAppointments = async (sb: ReturnType<typeof createClient>) => {
  const now = new Date()
  const minAt = new Date(now.getTime() + WINDOW_MIN_START * 60 * 1000).toISOString()
  const maxAt = new Date(now.getTime() + WINDOW_MIN_END * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from('appointments')
    .select('id,user_id,client_id,start_time,status,reminder_sent,clients(name,phone)')
    .gte('start_time', minAt)
    .lte('start_time', maxAt)
    .eq('reminder_sent', false)
    .in('status', ['pending', 'confirmed'])

  if (error) {
    throw new Error(`appointments query failed: ${error.message}`)
  }

  return (data || []) as AppointmentWithClient[]
}

const claimReminder = async (sb: ReturnType<typeof createClient>, appointmentId: string) => {
  const { data, error } = await sb
    .from('appointments')
    .update({ notification_status: 'pending' })
    .eq('id', appointmentId)
    .eq('reminder_sent', false)
    .select('id')
    .maybeSingle()

  if (error) {
    // Se coluna notification_status nao existir em algum ambiente, tenta claim sem ela.
    const fallback = await sb
      .from('appointments')
      .update({ reminder_sent: false })
      .eq('id', appointmentId)
      .eq('reminder_sent', false)
      .select('id')
      .maybeSingle()

    if (fallback.error) {
      console.error('[whatsapp] claim failed', { appointmentId, error: fallback.error.message })
      return false
    }

    return !!fallback.data
  }

  return !!data
}

const markSent = async (sb: ReturnType<typeof createClient>, appointmentId: string) => {
  const nowIso = new Date().toISOString()
  let { error } = await sb
    .from('appointments')
    .update({
      reminder_sent: true,
      reminder_sent_at: nowIso,
      notification_status: 'sent',
    })
    .eq('id', appointmentId)

  if (!error) return

  const fallback = await sb
    .from('appointments')
    .update({ reminder_sent: true })
    .eq('id', appointmentId)

  error = fallback.error
  if (error) {
    console.error('[whatsapp] failed to mark sent', { appointmentId, error: error.message })
  }
}

const markFailed = async (sb: ReturnType<typeof createClient>, appointmentId: string) => {
  const { error } = await sb
    .from('appointments')
    .update({ notification_status: 'failed' })
    .eq('id', appointmentId)

  if (error) {
    console.error('[whatsapp] failed to mark failed status', { appointmentId, error: error.message })
  }
}

const insertLog = async (
  sb: ReturnType<typeof createClient>,
  args: {
    userId: string
    appointmentId: string
    clientId: string | null
    phone: string
    message: string
    status: 'sent' | 'failed'
    error?: string
    providerMessageId?: string
    payload?: Record<string, unknown>
  },
) => {
  const row = {
    user_id: args.userId,
    appointment_id: args.appointmentId,
    client_id: args.clientId,
    phone: args.phone,
    message: args.message,
    provider: WHATSAPP_PROVIDER,
    status: args.status,
    error: args.error || null,
    provider_message_id: args.providerMessageId || null,
    payload: args.payload || null,
  }

  const { error } = await sb.from('whatsapp_message_logs').insert(row)
  if (error) {
    console.error('[whatsapp] failed to insert log', {
      appointmentId: args.appointmentId,
      status: args.status,
      error: error.message,
    })
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' })

  const auth = parseBearerToken(req.headers.get('Authorization'))
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return json(401, { ok: false, error: 'Unauthorized' })
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  let requestBody: RequestBody = {}
  try {
    requestBody = await req.json()
  } catch {
    requestBody = {}
  }

  const sb = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let upcoming: AppointmentWithClient[] = []
  try {
    upcoming = await checkUpcomingAppointments(sb)
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (!upcoming.length) {
    return json(200, {
      ok: true,
      checked: 0,
      sent: 0,
      failed: 0,
      reason: 'no_upcoming_appointments',
    })
  }

  const userIds = [...new Set(upcoming.map((appt) => appt.user_id).filter(Boolean))]
  const senderByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: configRows, error: configError } = await sb
      .from('config')
      .select('user_id,professional_whatsapp')
      .in('user_id', userIds)

    if (configError) {
      console.error('[whatsapp] failed to load config sender numbers', { error: configError.message })
    } else {
      for (const row of (configRows || []) as ConfigRow[]) {
        senderByUserId.set(row.user_id, row.professional_whatsapp || '')
      }
    }
  }

  let sent = 0
  let failed = 0
  let skippedNoPhone = 0
  let skippedInvalidPhone = 0
  let skippedNoSender = 0
  let skippedClaimed = 0

  for (const appt of upcoming) {
    const phone = appt.clients?.phone || null
    const clientName = appt.clients?.name || null

    if (!phone) {
      skippedNoPhone += 1
      continue
    }

    if (!isE164(phone)) {
      skippedInvalidPhone += 1
      continue
    }

    const claimed = await claimReminder(sb, appt.id)
    if (!claimed) {
      skippedClaimed += 1
      continue
    }

    const startTimeIso = appt.start_time
    if (!startTimeIso) {
      await markFailed(sb, appt.id)
      failed += 1
      await insertLog(sb, {
        userId: appt.user_id,
        appointmentId: appt.id,
        clientId: appt.client_id,
        phone,
        message: '',
        status: 'failed',
        error: 'Appointment has no start_time',
      })
      continue
    }

    const message = buildReminderMessage(clientName, startTimeIso)
    const senderNumber = resolveSenderNumber(senderByUserId.get(appt.user_id))

    if (!senderNumber) {
      skippedNoSender += 1
      await markFailed(sb, appt.id)
      await insertLog(sb, {
        userId: appt.user_id,
        appointmentId: appt.id,
        clientId: appt.client_id,
        phone,
        message,
        status: 'failed',
        error: 'Missing sender number: configure professional_whatsapp or WHATSAPP_NUMBER fallback',
      })
      continue
    }

    if (requestBody.dryRun) {
      console.log('[whatsapp][dry-run] would send', {
        appointmentId: appt.id,
        userId: appt.user_id,
        phone,
        from: senderNumber,
        message,
      })

      await markSent(sb, appt.id)
      sent += 1
      await insertLog(sb, {
        userId: appt.user_id,
        appointmentId: appt.id,
        clientId: appt.client_id,
        phone,
        message,
        status: 'sent',
        providerMessageId: 'dry-run',
        payload: { dryRun: true, from: senderNumber },
      })
      continue
    }

    const result = await sendWhatsAppMessage(phone, message, senderNumber)
    if (result.ok) {
      sent += 1
      await markSent(sb, appt.id)
      await insertLog(sb, {
        userId: appt.user_id,
        appointmentId: appt.id,
        clientId: appt.client_id,
        phone,
        message,
        status: 'sent',
        providerMessageId: result.providerMessageId,
        payload: { ...(result.payload || {}), from: senderNumber },
      })
      console.log('[whatsapp] sent', {
        appointmentId: appt.id,
        userId: appt.user_id,
        phone,
        from: senderNumber,
        provider: WHATSAPP_PROVIDER,
      })
      continue
    }

    failed += 1
    await markFailed(sb, appt.id)
    await insertLog(sb, {
      userId: appt.user_id,
      appointmentId: appt.id,
      clientId: appt.client_id,
      phone,
      message,
      status: 'failed',
      error: result.error,
      payload: result.payload,
    })

    console.error('[whatsapp] send failed', {
      appointmentId: appt.id,
      userId: appt.user_id,
      phone,
      provider: WHATSAPP_PROVIDER,
      from: senderNumber,
      error: result.error,
    })
  }

  return json(200, {
    ok: true,
    provider: WHATSAPP_PROVIDER,
    checked: upcoming.length,
    sent,
    failed,
    skippedNoPhone,
    skippedInvalidPhone,
    skippedNoSender,
    skippedClaimed,
    windowMinutes: [WINDOW_MIN_START, WINDOW_MIN_END],
  })
})
