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

// Fuso de cada estado (o Brasil não tem horário de verão desde 2019). Sem estado salvo, usa Brasília.
// O horário do agendamento é o horário local da profissional.
const UF_UTC_OFFSET_HOURS: Record<string, number> = { AC: 5, AM: 4, RR: 4, RO: 4, MT: 4, MS: 4 }
const utcOffsetHoursForUf = (uf: string | null | undefined) => UF_UTC_OFFSET_HOURS[String(uf || '').trim().toUpperCase()] ?? 3
// Don't send if the appointment starts in less than this.
const MIN_LEAD_MS = 15 * 60 * 1000
// Keep each cron run well under the Edge Function time limit.
const MAX_SENDS_PER_RUN = 60
const DELAY_BETWEEN_SENDS_MS = 1200

const DEFAULT_TEMPLATE =
  'Oi, {nome}! Passando para te lembrar do seu atendimento no dia {data} às {hora}. Te espero ✨🤍'

// Confirmação por resposta: vai no fim do lembrete quando a conta deixa ligado (padrão).
const CONFIRM_BY_REPLY_FOOTER = '\n\nPara confirmar, responda *SIM*. Se precisar remarcar, é só me avisar por aqui.'
// Respostas aceitas como confirmação / pedido de remarcar (a mensagem inteira, sem pontuação).
// O texto chega sem acentos e sem pontuação (normalizeReply). Pedido de remarcar vence a confirmação.
const CONFIRM_REPLY_RE = /^(1|s|sim+|confirm\w*|ok+|okay|pode ser|combinado|certo|beleza|blz|estarei|vou sim|com certeza|claro|perfeito|otimo|👍|✅|❤|🥰|😍)(\s|$)/i
const RESCHEDULE_REPLY_RE = /(^2$|^nao$|remarc|desmarc|cancel|nao vou|nao posso|nao consigo|imprevisto|outro horario|outro dia)/i
// Só vale resposta até 3 dias depois do lembrete.
const REPLY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

/** Token do webhook de cada instância: não precisa de segredo novo e não é adivinhável. */
const webhookTokenFor = async (instance: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`whatsapp-webhook:${CRON_SECRET}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(instance))
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const webhookUrlFor = async (instance: string) =>
  `${PROJECT_URL}/functions/v1/whatsapp-reminders?hook=${encodeURIComponent(instance)}&t=${await webhookTokenFor(instance)}`

/** Pede para a Evolution avisar esta função quando chegar mensagem nesta instância. */
const ensureWebhook = async (instance: string) => {
  const url = await webhookUrlFor(instance)
  // Formato da Evolution v2 (aninhado); versões antigas aceitam o formato plano.
  let res = await evo('POST', `/webhook/set/${instance}`, {
    webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
  })
  if (!res.ok && res.status === 400) {
    res = await evo('POST', `/webhook/set/${instance}`, {
      enabled: true, url, webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT'],
    })
  }
  if (!res.ok) throw new Error(`Evolution webhook ${res.status}: ${errorMessageOf(res.data)}`)
}

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
  // Instância nova precisa do webhook de novo (o cron liga no primeiro lembrete).
  const patch = instance
    ? { whatsapp_instance: instance, whatsapp_webhook_at: null }
    : { whatsapp_instance: null, whatsapp_auto_enabled: false, whatsapp_webhook_at: null }
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

const parseAppointmentDate = (date: string, time: string, offsetHours = 3) => {
  const [h, m] = String(time || '').slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const tz = `-0${offsetHours}:00`
  return new Date(`${String(date).slice(0, 10)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${tz}`)
}

const brtYmd = (ms: number, offsetHours = 3) => new Date(ms - offsetHours * 60 * 60 * 1000).toISOString().slice(0, 10)

// ─── Cron: envia lembretes ───────────────────────────────────────────────────

type RunResult = { accounts: number; sent: number; failed: number; skippedAccounts: Record<string, string>; error?: string }

/**
 * Só envia para contas com acesso completo: assinatura ativa, liberação manual ou teste em dia
 * (mesma regra de public.is_full_access). Teste vencido e assinatura cancelada não recebem lembretes.
 * Se a consulta falhar, segue sem filtrar para não cortar os lembretes de quem paga.
 */
const keepFullAccessAccounts = async <T extends { user_id: string }>(
  sb: Sb,
  configs: T[],
  skippedAccounts: Record<string, string>,
): Promise<T[]> => {
  const userIds = [...new Set(configs.map((c) => c.user_id))]
  if (!userIds.length) return configs
  const { data, error } = await sb
    .from('profiles')
    .select('id,access_level,subscription_expires_at')
    .in('id', userIds)
  if (error) {
    console.error('[whatsapp] access check failed, sending without filter', error.message)
    return configs
  }
  const nowMs = Date.now()
  const allowed = new Set(
    ((data || []) as { id: string; access_level: string | null; subscription_expires_at: string | null }[])
      .filter((p) => p.access_level === 'full' && (!p.subscription_expires_at || Date.parse(p.subscription_expires_at) > nowMs))
      .map((p) => p.id),
  )
  return configs.filter((c) => {
    if (allowed.has(c.user_id)) return true
    skippedAccounts[c.user_id] = 'sem_acesso_completo'
    return false
  })
}

const sendDueReminders = async (sb: Sb): Promise<RunResult> => {
  const { data: configs, error: cfgError } = await sb
    .from('config')
    .select('user_id,whatsapp_instance,whatsapp_auto_hours_before,whatsapp_reminder_template,whatsapp_auto_template,state_uf,whatsapp_confirm_by_reply,whatsapp_webhook_at')
    .eq('whatsapp_auto_enabled', true)

  const nowMs = Date.now()
  let sent = 0
  let failed = 0
  const skippedAccounts: Record<string, string> = {}

  if (cfgError) return { accounts: 0, sent, failed, skippedAccounts, error: `config query failed: ${cfgError.message}` }
  if (!configs?.length) return { accounts: 0, sent, failed, skippedAccounts }

  const eligible = await keepFullAccessAccounts(sb, configs as ConfigRow[], skippedAccounts)

  for (const cfg of eligible) {
    if (sent + failed >= MAX_SENDS_PER_RUN) break

    const hoursBefore = Number(cfg.whatsapp_auto_hours_before) > 0 ? Number(cfg.whatsapp_auto_hours_before) : 24
    const leadMs = hoursBefore * 60 * 60 * 1000
    const offsetHours = utcOffsetHoursForUf((cfg as { state_uf?: string | null }).state_uf)
    const dates = new Set<string>()
    for (let t = nowMs - 86400000; t <= nowMs + leadMs + 86400000; t += 86400000) dates.add(brtYmd(t, offsetHours))

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
      const at = parseAppointmentDate(a.date, a.time, offsetHours)
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

    // Instâncias conectadas antes da confirmação por resposta: liga o webhook uma vez.
    if (!(cfg as { whatsapp_webhook_at?: string | null }).whatsapp_webhook_at) {
      try {
        await ensureWebhook(instance)
        await sb.from('config').update({ whatsapp_webhook_at: new Date().toISOString() }).eq('user_id', cfg.user_id)
      } catch (error) {
        console.error('[whatsapp] webhook setup failed', { userId: cfg.user_id, message: error instanceof Error ? error.message : String(error) })
      }
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

      const baseText = buildMessage(cfg.whatsapp_auto_template || cfg.whatsapp_reminder_template, {
        fullName: String(client?.name || ''),
        date: formatDateBr(appt.date),
        time: String(appt.time).slice(0, 5),
        service: String((serviceById.get(appt.service_id) as { name?: string } | undefined)?.name || ''),
      })
      // Pedido de confirmação só para quem ainda não confirmou.
      const askReply = (cfg as { whatsapp_confirm_by_reply?: boolean | null }).whatsapp_confirm_by_reply !== false
        && appt.status === 'pending'
      const text = askReply ? `${baseText}${CONFIRM_BY_REPLY_FOOTER}` : baseText

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

  return { accounts: configs.length, sent, failed, skippedAccounts }
}

// ─── Cron: lembrete de manutenção ────────────────────────────────────────────
// Mesma regra de src/lib/clientInsights.js (getMaintenanceOverview + isMaintenanceDue) — mantenha as duas iguais.

type MaintenanceConfigRow = {
  user_id: string
  whatsapp_instance: string | null
  whatsapp_maintenance_template: string | null
}

const DEFAULT_MAINTENANCE_DAYS: Record<string, number> = {
  lash: 21,
  nail: 21,
  sobrancelha: 30,
  estetica: 30,
  barbeiro: 21,
}
// Barbeiro não recebe lembrete automático de manutenção (mesma regra de src/lib/clientInsights.js).
const MAINTENANCE_AUTO_EXCLUDED_TYPES = new Set(['barbeiro'])
const MAINTENANCE_MIN_INTERVAL = 7
const MAINTENANCE_MAX_INTERVAL = 120
// Só avisa automaticamente até N dias depois do vencimento; atrasadas há mais tempo ficam para o envio manual.
const MAINTENANCE_SEND_WINDOW_DAYS = 7
// Envia só em horário comercial (BRT).
const MAINTENANCE_SEND_HOURS = { from: 9, to: 19 }
const MAINTENANCE_HISTORY_DAYS = 400

const DEFAULT_MAINTENANCE_TEMPLATE =
  'Oi, {nome}! Já está na hora da sua manutenção ✨ Quer que eu reserve um horário pra você esta semana?'

const buildMaintenanceMessage = (template: string | null, vars: { fullName: string; service: string; days: number }) => {
  const fullName = vars.fullName.trim()
  const firstName = fullName.split(/\s+/)[0] || ''
  const values: Record<string, string> = {
    nomecompleto: fullName,
    nome: firstName,
    servico: vars.service,
    serviço: vars.service,
    dias: String(vars.days),
  }
  const text = String(template || '').trim() || DEFAULT_MAINTENANCE_TEMPLATE
  return text.replace(/\{(nomeCompleto|nome|servi[cç]o|dias)\}/gi, (_, key) => values[String(key).toLowerCase()] ?? '')
}

const daysBetween = (fromYmd: string, toYmd: string) =>
  Math.round((Date.parse(`${toYmd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) / 86400000)

const sendMaintenanceReminders = async (sb: Sb, budget: number): Promise<RunResult> => {
  let sent = 0
  let failed = 0
  const skippedAccounts: Record<string, string> = {}

  const nowMs = Date.now()
  // Hora local de cada conta; antes de 9h em Brasília ninguém está no horário ainda.
  const localHour = (offsetHours: number) => new Date(nowMs - offsetHours * 60 * 60 * 1000).getUTCHours()
  if (localHour(3) < MAINTENANCE_SEND_HOURS.from) {
    return { accounts: 0, sent, failed, skippedAccounts }
  }

  const { data: configs, error: cfgError } = await sb
    .from('config')
    .select('user_id,whatsapp_instance,whatsapp_maintenance_template,state_uf')
    .eq('whatsapp_maintenance_enabled', true)

  // Coluna ainda não criada (whatsapp_maintenance_reminders.sql): só não envia.
  if (cfgError) return { accounts: 0, sent, failed, skippedAccounts, error: `maintenance config query failed: ${cfgError.message}` }
  if (!configs?.length) return { accounts: 0, sent, failed, skippedAccounts }

  const today = brtYmd(nowMs)
  const historyStart = brtYmd(nowMs - MAINTENANCE_HISTORY_DAYS * 86400000)

  const eligible = await keepFullAccessAccounts(sb, configs as MaintenanceConfigRow[], skippedAccounts)

  for (const cfg of eligible) {
    if (sent + failed >= budget) break

    const offsetHours = utcOffsetHoursForUf((cfg as { state_uf?: string | null }).state_uf)
    const hourHere = localHour(offsetHours)
    if (hourHere < MAINTENANCE_SEND_HOURS.from || hourHere >= MAINTENANCE_SEND_HOURS.to) {
      skippedAccounts[cfg.user_id] = 'fora_do_horario_local'
      continue
    }

    const { data: profile } = await sb.from('profiles').select('professional_type').eq('id', cfg.user_id).maybeSingle()
    const professionalType = String((profile as any)?.professional_type || '')
    if (MAINTENANCE_AUTO_EXCLUDED_TYPES.has(professionalType)) {
      skippedAccounts[cfg.user_id] = `maintenance_not_available_for_${professionalType}`
      continue
    }

    const { data: appts, error: apptError } = await sb
      .from('appointments')
      .select('client_id,service_id,date,time,status,blocked')
      .eq('user_id', cfg.user_id)
      .gte('date', historyStart)
      .not('client_id', 'is', null)
      .in('status', ['pending', 'confirmed', 'done'])
    if (apptError) {
      console.error('[whatsapp] maintenance appointments query failed', { userId: cfg.user_id, error: apptError.message })
      continue
    }

    const fallback = DEFAULT_MAINTENANCE_DAYS[professionalType] || 21
    // Período próprio da cliente; sem a coluna (client_maintenance_interval.sql) todas ficam no padrão.
    const { data: intervalRows } = await sb
      .from('clients')
      .select('id,maintenance_interval_days')
      .eq('user_id', cfg.user_id)
      .not('maintenance_interval_days', 'is', null)
    const customIntervals = new Map<string, number>()
    for (const r of (intervalRows || []) as { id: string; maintenance_interval_days: number | null }[]) {
      const n = Number(r.maintenance_interval_days)
      if (Number.isFinite(n) && n > 0) {
        customIntervals.set(r.id, Math.min(MAINTENANCE_MAX_INTERVAL, Math.max(MAINTENANCE_MIN_INTERVAL, Math.round(n))))
      }
    }
    const doneByClient = new Map<string, AppointmentRow[]>()
    const hasFuture = new Set<string>()
    for (const a of (appts || []) as AppointmentRow[]) {
      if (!a.client_id || a.blocked) continue
      if (a.status !== 'done' && a.date >= today) hasFuture.add(a.client_id)
      if (a.status === 'done') {
        if (!doneByClient.has(a.client_id)) doneByClient.set(a.client_id, [])
        doneByClient.get(a.client_id)!.push(a)
      }
    }

    const due: { clientId: string; last: AppointmentRow; daysSinceLast: number }[] = []
    for (const [clientId, done] of doneByClient) {
      if (hasFuture.has(clientId)) continue
      done.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

      const interval = customIntervals.get(clientId) || fallback

      const last = done[done.length - 1]
      const daysSinceLast = daysBetween(last.date, today)
      const daysOverdue = daysSinceLast - interval
      if (daysOverdue < 0 || daysOverdue > MAINTENANCE_SEND_WINDOW_DAYS) continue
      due.push({ clientId, last, daysSinceLast })
    }
    if (!due.length) continue

    const { data: clients } = await sb
      .from('clients')
      .select('id,name,phone,maintenance_reminder_for')
      .in('id', due.map((d) => d.clientId))
    const clientById = new Map((clients || []).map((c: any) => [c.id, c]))
    // Um lembrete por visita: pula quem já recebeu para este último atendimento.
    const pending = due.filter((d) => {
      const c = clientById.get(d.clientId) as { maintenance_reminder_for?: string | null } | undefined
      return c && String(c.maintenance_reminder_for || '').slice(0, 10) !== d.last.date
    })
    if (!pending.length) continue

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
      skippedAccounts[cfg.user_id] = `whatsapp_${state}`
      continue
    }

    const serviceIds = [...new Set(pending.map((d) => d.last.service_id).filter(Boolean))] as string[]
    const { data: services } = serviceIds.length
      ? await sb.from('services').select('id,name').in('id', serviceIds)
      : { data: [] }
    const serviceById = new Map((services || []).map((s: any) => [s.id, s]))

    for (const item of pending) {
      if (sent + failed >= budget) break
      const client = clientById.get(item.clientId) as { name?: string; phone?: string } | undefined
      const number = toWhatsappNumber(client?.phone || '')

      // Claim first so overlapping runs never send twice.
      const { data: claimed } = await sb
        .from('clients')
        .update({
          maintenance_reminder_for: item.last.date,
          maintenance_reminder_sent_at: new Date().toISOString(),
          maintenance_reminder_error: number ? null : 'cliente_sem_telefone',
        })
        .eq('id', item.clientId)
        .or(`maintenance_reminder_for.is.null,maintenance_reminder_for.neq.${item.last.date}`)
        .select('id')
      if (!claimed?.length || !number) continue

      const text = buildMaintenanceMessage(cfg.whatsapp_maintenance_template, {
        fullName: String(client?.name || ''),
        service: String((serviceById.get(item.last.service_id) as { name?: string } | undefined)?.name || ''),
        days: item.daysSinceLast,
      })

      try {
        await sendText(instance, number, text)
        sent += 1
      } catch (error) {
        failed += 1
        const message = error instanceof Error ? error.message : String(error)
        console.error('[whatsapp] maintenance send failed', { clientId: item.clientId, userId: cfg.user_id, message })
        const permanent = /exists.*false|not.*whatsapp/i.test(message)
        await sb.from('clients')
          .update({
            // Falha temporária: libera para tentar de novo no próximo ciclo.
            maintenance_reminder_for: permanent ? item.last.date : null,
            maintenance_reminder_sent_at: permanent ? new Date().toISOString() : null,
            maintenance_reminder_error: message.slice(0, 500),
          })
          .eq('id', item.clientId)
        if (isConnectionClosed(message)) {
          skippedAccounts[cfg.user_id] = 'whatsapp_connection_closed'
          break
        }
      }

      await sleep(DELAY_BETWEEN_SENDS_MS)
    }
  }

  return { accounts: configs.length, sent, failed, skippedAccounts }
}

const runCron = async (sb: Sb) => {
  const reminders = await sendDueReminders(sb)
  if (reminders.error) return json(500, { ok: false, error: reminders.error })
  const budget = MAX_SENDS_PER_RUN - reminders.sent - reminders.failed
  const maintenance = budget > 0
    ? await sendMaintenanceReminders(sb, budget)
    : { accounts: 0, sent: 0, failed: 0, skippedAccounts: {} }
  if (maintenance.error) console.error('[whatsapp] maintenance skipped', maintenance.error)
  return json(200, {
    ok: true,
    accounts: reminders.accounts,
    sent: reminders.sent,
    failed: reminders.failed,
    skippedAccounts: reminders.skippedAccounts,
    maintenance,
  })
}

// ─── Respostas das clientes (webhook da Evolution) ───────────────────────────

const normalizeReply = (text: string) =>
  String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.!?,;:*~_"'()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const extractText = (message: any): string =>
  String(
    message?.conversation
      ?? message?.extendedTextMessage?.text
      ?? message?.buttonsResponseMessage?.selectedDisplayText
      ?? message?.listResponseMessage?.title
      ?? (message?.reactionMessage?.text ? message.reactionMessage.text : '')
      ?? '',
  )

/** Telefone de quem respondeu. Com o "LID" do WhatsApp o número pode vir em outro campo. */
const senderPhoneDigits = (data: any): string => {
  const key = data?.key || {}
  const candidates = [key.remoteJidAlt, key.senderPn, data?.senderPn, key.participantAlt, key.remoteJid]
  for (const jid of candidates) {
    const value = String(jid || '')
    if (value.endsWith('@s.whatsapp.net')) return value.split('@')[0].split(':')[0].replace(/\D/g, '')
  }
  return ''
}

const handleIncomingWebhook = async (sb: Sb, url: URL, payload: any) => {
  const instance = String(url.searchParams.get('hook') || '')
  const token = String(url.searchParams.get('t') || '')
  if (!CRON_SECRET || !instance.startsWith(`${INSTANCE_PREFIX}_`) || token !== await webhookTokenFor(instance)) {
    return json(401, { ok: false })
  }

  const event = String(payload?.event || '').toLowerCase().replace('_', '.')
  if (event !== 'messages.upsert') return json(200, { ok: true, ignored: 'event' })
  const items = Array.isArray(payload?.data) ? payload.data : [payload?.data]

  const { data: cfg } = await sb.from('config').select('user_id,whatsapp_confirm_by_reply').eq('whatsapp_instance', instance).maybeSingle()
  const userId = (cfg as { user_id?: string } | null)?.user_id
  if (!userId) return json(200, { ok: true, ignored: 'instance' })
  if ((cfg as { whatsapp_confirm_by_reply?: boolean | null }).whatsapp_confirm_by_reply === false) {
    return json(200, { ok: true, ignored: 'disabled' })
  }

  let handled = 0
  for (const data of items) {
    if (!data || data?.key?.fromMe) continue
    if (String(data?.key?.remoteJid || '').endsWith('@g.us')) continue
    const reply = normalizeReply(extractText(data?.message))
    if (!reply) continue
    const reschedule = RESCHEDULE_REPLY_RE.test(reply)
    const confirms = !reschedule && CONFIRM_REPLY_RE.test(reply)
    if (!confirms && !reschedule) continue

    const digits = senderPhoneDigits(data)
    const local = digits.startsWith('55') ? digits.slice(2) : digits
    if (local.length < 10) continue
    const ddd = local.slice(0, 2)
    const last8 = local.slice(-8)

    const { data: clients } = await sb
      .from('clients')
      .select('id,name')
      .eq('user_id', userId)
      .like('phone', `+55${ddd}%${last8}`)
      .limit(5)
    const clientIds = ((clients || []) as { id: string }[]).map((c) => c.id)
    if (!clientIds.length) continue

    // O atendimento cujo lembrete saiu nos últimos dias e ainda não passou.
    const since = new Date(Date.now() - REPLY_WINDOW_MS).toISOString()
    const { data: appts } = await sb
      .from('appointments')
      .select('id,client_id,date,time,status,service_id')
      .eq('user_id', userId)
      .in('client_id', clientIds)
      .in('status', ['pending', 'confirmed'])
      .gte('whatsapp_reminder_sent_at', since)
      .gte('date', brtYmd(Date.now() - 86400000))
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(1)
    const appt = (appts || [])[0] as { id: string; client_id: string; date: string; time: string; status: string; service_id: string | null } | undefined
    if (!appt) continue

    const clientName = String(((clients || []) as { id: string; name?: string }[]).find((c) => c.id === appt.client_id)?.name || 'Cliente').trim()
    const when = `${formatDateBr(appt.date).slice(0, 5)} às ${String(appt.time).slice(0, 5)}`

    if (confirms) {
      if (appt.status === 'pending') {
        await sb.from('appointments').update({ status: 'confirmed' }).eq('id', appt.id).eq('status', 'pending')
        await sb.rpc('insert_team_app_notifications', {
          p_user_id: userId,
          p_type: 'whatsapp_confirmed',
          p_title: 'Confirmado pelo WhatsApp',
          p_body: `${clientName} confirmou o horário de ${when}.`,
          // Sem appointment_id: o índice único (conta, perfil, agendamento) descartaria este aviso
          // quando o agendamento veio do link público e já tem o aviso de "Novo agendamento".
          p_appointment_id: null,
          p_payload: { reply: reply.slice(0, 80), appointmentId: appt.id, date: appt.date, time: String(appt.time).slice(0, 5) },
        })
      }
    } else {
      await sb.rpc('insert_team_app_notifications', {
        p_user_id: userId,
        p_type: 'whatsapp_reschedule',
        p_title: 'Cliente quer remarcar',
        p_body: `${clientName} respondeu o lembrete de ${when}: "${reply.slice(0, 80)}"`,
        p_appointment_id: null,
        p_payload: { reply: reply.slice(0, 200), appointmentId: appt.id, date: appt.date, time: String(appt.time).slice(0, 5) },
      })
    }
    handled += 1
  }

  return json(200, { ok: true, handled })
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
        // Confirmação por resposta: a Evolution avisa esta função quando a cliente responder.
        try {
          await ensureWebhook(instance)
          await sb.from('config').update({ whatsapp_webhook_at: new Date().toISOString() }).eq('user_id', userId)
        } catch (error) {
          console.error('[whatsapp] webhook setup on connect failed', { userId, message: error instanceof Error ? error.message : String(error) })
        }
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

  // Webhook da Evolution (resposta da cliente ao lembrete): autenticado pelo token da URL.
  const url = new URL(req.url)
  if (url.searchParams.has('hook')) {
    try {
      return await handleIncomingWebhook(sb, url, body)
    } catch (error) {
      console.error('[whatsapp] webhook failed', error instanceof Error ? error.message : String(error))
      return json(200, { ok: false })
    }
  }

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
    return runCron(sb)
  }

  if (!token) return json(401, { ok: false, error: 'Unauthorized' })
  const { data: userData, error: userError } = await sb.auth.getUser(token)
  const userId = userData?.user?.id || ''
  if (userError || !userId) return json(401, { ok: false, error: 'Unauthorized' })

  return handleUserAction(sb, userId, body)
})

