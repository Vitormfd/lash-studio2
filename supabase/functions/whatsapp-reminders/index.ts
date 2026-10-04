import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

type Sb = ReturnType<typeof createClient>

type RequestBody = {
  action?: string
  number?: string
  text?: string
}

type ConfigRow = {
  user_id: string
  whatsapp_instance: string | null
  whatsapp_auto_hours_before: number | null
  whatsapp_reminder_template: string | null
  whatsapp_auto_template: string | null
}

type AppointmentRow = {
  id: string
  user_id: string
  client_id: string | null
  service_id: string | null
  date: string
  time: string
  status: string | null
  blocked: boolean | null
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
// Pasting into a terminal can wrap the value in bracketed-paste markers or invisible chars,
// which make fetch() reject the header. Keep only visible ASCII.
const cleanSecret = (value: string) =>
  value.replace(/\x1b?\[20[01]~/g, '').replace(/[^\x21-\x7E]/g, '')
const EVOLUTION_API_URL = cleanSecret(Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '')
const EVOLUTION_API_KEY = cleanSecret(Deno.env.get('EVOLUTION_API_KEY') || '')
const INSTANCE_PREFIX = (Deno.env.get('EVOLUTION_INSTANCE_PREFIX') || 'easystudio').trim()

// Brazil is UTC-3 (no DST for most states including SP/RJ).
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000
// Don't send if the appointment starts in less than this.
const MIN_LEAD_MS = 15 * 60 * 1000
// Keep each cron run well under the Edge Function time limit.
const MAX_SENDS_PER_RUN = 60
const DELAY_BETWEEN_SENDS_MS = 1200

const DEFAULT_TEMPLATE =
  'Oi, {nome}! Passando para te lembrar do seu atendimento no dia {data} às {hora}. Te espero ✨🤍'

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const parseBearerToken = (header: string | null) =>
  header?.replace(/^Bearer\s+/i, '').trim() || ''

// A fresh name per connection: Evolution 2.3.x can leave a logged-out instance stuck as
// `open` and refuse to delete it, so we never reuse a name after disconnecting.
const newInstanceName = (userId: string) =>
  `${INSTANCE_PREFIX}_${userId.replace(/-/g, '').slice(0, 12)}_${Date.now().toString(36)}`

const loadInstanceName = async (sb: Sb, userId: string) => {
  const { data } = await sb.from('config').select('whatsapp_instance').eq('user_id', userId).maybeSingle()
  return String((data as { whatsapp_instance?: string | null } | null)?.whatsapp_instance || '')
}

const saveInstanceName = async (sb: Sb, userId: string, instance: string | null) => {
  const patch = instance
    ? { whatsapp_instance: instance }
    : { whatsapp_instance: null, whatsapp_auto_enabled: false }
  const { data, error } = await sb.from('config').update(patch).eq('user_id', userId).select('user_id')
  if (error) throw new Error(`config update failed: ${error.message}`)
  if (!data?.length && instance) {
    const inserted = await sb.from('config').insert({ user_id: userId, ...patch })
    if (inserted.error) throw new Error(`config insert failed: ${inserted.error.message}`)
  }
}

// ─── Evolution API ───────────────────────────────────────────────────────────

const evo = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${EVOLUTION_API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  return { ok: res.ok, status: res.status, data }
}

const errorMessageOf = (data: any) => {
  const msg = data?.response?.message ?? data?.message ?? data?.error ?? data?.raw
  if (Array.isArray(msg)) return msg.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('; ')
  return typeof msg === 'string' ? msg : JSON.stringify(msg ?? data)
}

/** 'open' | 'connecting' | 'close' | 'not_created' */
const getConnectionState = async (instance: string) => {
  const res = await evo('GET', `/instance/connectionState/${instance}`)
  if (res.status === 404) return 'not_created'
  if (!res.ok) throw new Error(`Evolution connectionState ${res.status}: ${errorMessageOf(res.data)}`)
  return String(res.data?.instance?.state ?? res.data?.state ?? 'close')
}

const getConnectedNumber = async (instance: string) => {
  const res = await evo('GET', `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`)
  if (!res.ok) return ''
  const list = Array.isArray(res.data) ? res.data : [res.data]
  const item = list.find(Boolean) || {}
  const jid = String(item.ownerJid ?? item.instance?.owner ?? item.owner ?? '')
  return jid.split('@')[0].split(':')[0]
}

const pickQr = (data: any) => ({
  qr: String(data?.qrcode?.base64 ?? data?.base64 ?? '') || null,
  pairingCode: String(data?.qrcode?.pairingCode ?? data?.pairingCode ?? '') || null,
})

const createInstance = async (instance: string, number?: string) => {
  const created = await evo('POST', '/instance/create', {
    instanceName: instance,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
    ...(number ? { number } : {}),
  })
  if (!created.ok) throw new Error(`Evolution create ${created.status}: ${errorMessageOf(created.data)}`)
  return pickQr(created.data)
}

const requestConnect = async (instance: string, number?: string) => {
  const query = number ? `?number=${encodeURIComponent(number)}` : ''
  const res = await evo('GET', `/instance/connect/${instance}${query}`)
  if (!res.ok) throw new Error(`Evolution connect ${res.status}: ${errorMessageOf(res.data)}`)
  return pickQr(res.data)
}

/** Sem número: devolve QR Code. Com número: devolve também o código de pareamento (conectar pelo mesmo celular). */
const connectInstance = async (instance: string, number?: string) => {
  const state = await getConnectionState(instance)
  if (state === 'open') return { state, qr: null, pairingCode: null }

  if (state === 'not_created') {
    const created = await createInstance(instance, number)
    if (number ? created.pairingCode : created.qr) return { state: 'connecting', ...created }
  }

  return { state: 'connecting', ...(await requestConnect(instance, number)) }
}

const disconnectInstance = async (instance: string) => {
  await evo('DELETE', `/instance/logout/${instance}`)
  await evo('DELETE', `/instance/delete/${instance}`)
}

const toWhatsappNumber = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  // Local BR numbers (DDD + número) get the country code.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

const postText = async (instance: string, number: string, text: string) => {
  // Evolution v2 format; falls back to the v1 body shape if rejected.
  let res = await evo('POST', `/message/sendText/${instance}`, { number, text })
  if (res.status === 400 && /textMessage|text.*(required|should)/i.test(errorMessageOf(res.data))) {
    res = await evo('POST', `/message/sendText/${instance}`, { number, textMessage: { text } })
  }
  return res
}

const isConnectionClosed = (message: string) => /connection closed|not connected|socket/i.test(message)

/**
 * Right after pairing (and sometimes after idle periods) Baileys drops the socket while
 * Evolution still reports `open`. Restart the instance and wait for it to come back.
 */
const restartInstance = async (instance: string) => {
  let res = await evo('POST', `/instance/restart/${instance}`)
  if (res.status === 404 || res.status === 405) res = await evo('PUT', `/instance/restart/${instance}`)
  for (let i = 0; i < 10; i += 1) {
    await sleep(2000)
    try {
      if ((await getConnectionState(instance)) === 'open') return true
    } catch {
      // keep waiting
    }
  }
  return false
}

const sendText = async (instance: string, number: string, text: string) => {
  let res = await postText(instance, number, text)
  if (!res.ok && isConnectionClosed(errorMessageOf(res.data))) {
    console.warn('[whatsapp] connection closed, restarting instance', { instance })
    await restartInstance(instance)
    await sleep(1500)
    res = await postText(instance, number, text)
  }
  if (!res.ok) throw new Error(`Evolution sendText ${res.status}: ${errorMessageOf(res.data)}`)
  return res.data
}

// ─── Message ─────────────────────────────────────────────────────────────────

const buildMessage = (
  template: string | null,
  vars: { fullName: string; date: string; time: string; service: string },
) => {
  const fullName = vars.fullName.trim()
  const firstName = fullName.split(/\s+/)[0] || ''
  const values: Record<string, string> = {
    nomecompleto: fullName || firstName,
    nome: firstName,
    data: vars.date,
    hora: vars.time,
    servico: vars.service,
    serviço: vars.service,
  }
  const text = String(template || '').trim() || DEFAULT_TEMPLATE
  return text.replace(/\{(nomeCompleto|nome|data|hora|servi[cç]o)\}/gi, (_, key) => values[String(key).toLowerCase()] ?? '')
}

const formatDateBr = (ymd: string) => {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ymd
}

const parseAppointmentDate = (date: string, time: string) => {
  const [h, m] = String(time || '').slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return new Date(`${String(date).slice(0, 10)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`)
}

const brtYmd = (ms: number) => new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 10)

// ─── Cron: envia lembretes ───────────────────────────────────────────────────

const sendDueReminders = async (sb: Sb) => {
  const { data: configs, error: cfgError } = await sb
    .from('config')
    .select('user_id,whatsapp_instance,whatsapp_auto_hours_before,whatsapp_reminder_template,whatsapp_auto_template')
    .eq('whatsapp_auto_enabled', true)

  if (cfgError) return json(500, { ok: false, error: `config query failed: ${cfgError.message}` })
  if (!configs?.length) return json(200, { ok: true, sent: 0, reason: 'no_accounts_enabled' })

  const nowMs = Date.now()
  let sent = 0
  let failed = 0
  const skippedAccounts: Record<string, string> = {}

  for (const cfg of configs as ConfigRow[]) {
    if (sent + failed >= MAX_SENDS_PER_RUN) break

    const hoursBefore = Number(cfg.whatsapp_auto_hours_before) > 0 ? Number(cfg.whatsapp_auto_hours_before) : 24
    const leadMs = hoursBefore * 60 * 60 * 1000
    const dates = new Set<string>()
    for (let t = nowMs - 86400000; t <= nowMs + leadMs + 86400000; t += 86400000) dates.add(brtYmd(t))

    const { data: appts, error: apptError } = await sb
      .from('appointments')
      .select('id,user_id,client_id,service_id,date,time,status,blocked')
      .eq('user_id', cfg.user_id)
      .in('date', [...dates])
      .in('status', ['pending', 'confirmed'])
      .is('whatsapp_reminder_sent_at', null)
      .not('client_id', 'is', null)

    if (apptError) {
      console.error('[whatsapp] appointments query failed', { userId: cfg.user_id, error: apptError.message })
      continue
    }

    const due = ((appts || []) as AppointmentRow[]).filter((a) => {
      if (a.blocked) return false
      const at = parseAppointmentDate(a.date, a.time)
      if (!at) return false
      const startMs = at.getTime()
      return nowMs >= startMs - leadMs && nowMs <= startMs - MIN_LEAD_MS
    })
    if (!due.length) continue

    const instance = String(cfg.whatsapp_instance || '')
    if (!instance) {
      skippedAccounts[cfg.user_id] = 'whatsapp_not_connected'
      continue
    }
    let state = ''
    try {
      state = await getConnectionState(instance)
    } catch (error) {
      skippedAccounts[cfg.user_id] = error instanceof Error ? error.message : String(error)
      continue
    }
    if (state !== 'open') {
      // Not marked as sent: it retries next run if the WhatsApp is reconnected in time.
      skippedAccounts[cfg.user_id] = `whatsapp_${state}`
      continue
    }

    const clientIds = [...new Set(due.map((a) => a.client_id).filter(Boolean))] as string[]
    const serviceIds = [...new Set(due.map((a) => a.service_id).filter(Boolean))] as string[]
    const [{ data: clients }, { data: services }] = await Promise.all([
      sb.from('clients').select('id,name,phone').in('id', clientIds),
      serviceIds.length
        ? sb.from('services').select('id,name').in('id', serviceIds)
        : Promise.resolve({ data: [] }),
    ])
    const clientById = new Map((clients || []).map((c: any) => [c.id, c]))
    const serviceById = new Map((services || []).map((s: any) => [s.id, s]))

    for (const appt of due) {
      if (sent + failed >= MAX_SENDS_PER_RUN) break

      const client = clientById.get(appt.client_id) as { name?: string; phone?: string } | undefined
      const number = toWhatsappNumber(client?.phone || '')
      if (!number) {
        await sb.from('appointments')
          .update({ whatsapp_reminder_sent_at: new Date().toISOString(), whatsapp_reminder_error: 'cliente_sem_telefone' })
          .eq('id', appt.id)
        continue
      }

      // Claim the appointment first so overlapping runs never send twice.
      const { data: claimed } = await sb
        .from('appointments')
        .update({ whatsapp_reminder_sent_at: new Date().toISOString(), whatsapp_reminder_error: null })
        .eq('id', appt.id)
        .is('whatsapp_reminder_sent_at', null)
        .select('id')
      if (!claimed?.length) continue

      const text = buildMessage(cfg.whatsapp_auto_template || cfg.whatsapp_reminder_template, {
        fullName: String(client?.name || ''),
        date: formatDateBr(appt.date),
        time: String(appt.time).slice(0, 5),
        service: String((serviceById.get(appt.service_id) as { name?: string } | undefined)?.name || ''),
      })

      try {
        await sendText(instance, number, text)
        sent += 1
      } catch (error) {
        failed += 1
        const message = error instanceof Error ? error.message : String(error)
        console.error('[whatsapp] send failed', { appointmentId: appt.id, userId: cfg.user_id, message })
        // Number that isn't on WhatsApp → give up; anything else → retry next run.
        const permanent = /exists.*false|not.*whatsapp/i.test(message)
        await sb.from('appointments')
          .update({
            whatsapp_reminder_sent_at: permanent ? new Date().toISOString() : null,
            whatsapp_reminder_error: message.slice(0, 500),
          })
          .eq('id', appt.id)
        // WhatsApp dropped and didn't come back: try this account again next run.
        if (isConnectionClosed(message)) {
          skippedAccounts[cfg.user_id] = 'whatsapp_connection_closed'
          break
        }
      }

      await sleep(DELAY_BETWEEN_SENDS_MS)
    }
  }

  return json(200, { ok: true, accounts: configs.length, sent, failed, skippedAccounts })
}

// ─── Ações do app (usuária logada) ───────────────────────────────────────────

const handleUserAction = async (sb: Sb, userId: string, body: RequestBody) => {
  try {
    let instance = await loadInstanceName(sb, userId)

    switch (body.action) {
      case 'status': {
        if (!instance) return json(200, { ok: true, state: 'not_created', number: '' })
        const state = await getConnectionState(instance)
        const number = state === 'open' ? await getConnectedNumber(instance) : ''
        return json(200, { ok: true, state, number })
      }
      case 'connect': {
        const pairingNumber = body.number ? toWhatsappNumber(body.number) : ''
        if (instance) {
          const state = await getConnectionState(instance)
          if (state === 'open') return json(200, { ok: true, state, qr: null, pairingCode: null })
          // Start over with a clean instance; a half-paired one can't switch between QR and code.
          await disconnectInstance(instance)
        }
        instance = newInstanceName(userId)
        await saveInstanceName(sb, userId, instance)
        const result = await connectInstance(instance, pairingNumber || undefined)
        return json(200, { ok: true, ...result })
      }
      case 'disconnect': {
        // Best effort on Evolution; the app forgets the instance either way.
        if (instance) await disconnectInstance(instance).catch(() => {})
        await saveInstanceName(sb, userId, null)
        return json(200, { ok: true, state: 'not_created' })
      }
      case 'test': {
        const number = toWhatsappNumber(body.number || '')
        const text = String(body.text || '').trim()
        if (!number || !text) return json(400, { ok: false, error: 'Informe número e mensagem.' })
        if (!instance) return json(409, { ok: false, error: 'WhatsApp não está conectado.' })
        const state = await getConnectionState(instance)
        if (state !== 'open') return json(409, { ok: false, error: 'WhatsApp não está conectado.' })
        try {
          await sendText(instance, number, text.slice(0, 4000))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (isConnectionClosed(message)) {
            return json(409, { ok: false, error: 'A conexão com o WhatsApp caiu. Toque em Desconectar e conecte de novo.' })
          }
          throw error
        }
        return json(200, { ok: true })
      }
      default:
        return json(400, { ok: false, error: 'unknown_action' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[whatsapp] action failed', { action: body.action, userId, message })
    return json(502, { ok: false, error: message })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' })

  let body: RequestBody = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return json(500, { ok: false, error: 'Missing EVOLUTION_API_URL or EVOLUTION_API_KEY' })
  }

  const sb = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const token = parseBearerToken(req.headers.get('Authorization'))

  // Manutenção: chama a Evolution passo a passo e devolve as respostas cruas.
  if (body.action === 'diagnose') {
    if (!CRON_SECRET || token !== CRON_SECRET) return json(401, { ok: false, error: 'Unauthorized' })
    const instance = String((body as Record<string, unknown>).instance || '')
    if (!instance.startsWith(`${INSTANCE_PREFIX}_`)) return json(400, { ok: false, error: 'bad_instance' })
    const allowed: Record<string, [string, string]> = {
      state: ['GET', `/instance/connectionState/${instance}`],
      fetch: ['GET', `/instance/fetchInstances?instanceName=${instance}`],
      restart: ['POST', `/instance/restart/${instance}`],
      logout: ['DELETE', `/instance/logout/${instance}`],
      delete: ['DELETE', `/instance/delete/${instance}`],
    }
    const steps = Array.isArray((body as Record<string, unknown>).steps) ? (body as { steps: string[] }).steps : ['state']
    const results = []
    for (const step of steps) {
      if (step === 'wait') { await sleep(5000); results.push({ step }); continue }
      const def = allowed[step]
      if (!def) continue
      const res = await evo(def[0], def[1])
      results.push({ step, status: res.status, data: res.data })
    }
    return json(200, { ok: true, results })
  }

  if (body.action === 'send_reminders') {
    if (!CRON_SECRET || token !== CRON_SECRET) return json(401, { ok: false, error: 'Unauthorized' })
    return sendDueReminders(sb)
  }

  if (!token) return json(401, { ok: false, error: 'Unauthorized' })
  const { data: userData, error: userError } = await sb.auth.getUser(token)
  const userId = userData?.user?.id || ''
  if (userError || !userId) return json(401, { ok: false, error: 'Unauthorized' })

  return handleUserAction(sb, userId, body)
})

