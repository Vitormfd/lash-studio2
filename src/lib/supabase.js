import { createClient } from '@supabase/supabase-js'
import { getActiveOperatorGlobal } from './operator'
import { normalizeWorkHours } from './workHours'

// ─── LOCAL STORAGE HELPERS 1───────────────────────────────────────────────────
export const local = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)) || null } catch { return null } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
}

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://mbxfswxjrdikdyzpukmw.supabase.co'
const SUPABASE_KEY = 'sb_publishable_X8Pu3A3o_MfOKR0octLAyw_p_SzMKO3'

let _supabase = null

export const initSupabase = (url, anonKey) => {
  if (!url || !anonKey) return null
  try {
    _supabase = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
    return _supabase
  } catch { return null }
}

export const getClient = () => {
  if (_supabase) return _supabase
  return initSupabase(SUPABASE_URL, SUPABASE_KEY)
}

export const getSupabaseConfig = () => ({ url: SUPABASE_URL, anonKey: SUPABASE_KEY })

const getFunctionsBaseUrl = () => {
  const explicit = (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || '').trim().replace(/\/$/, '')
  if (explicit) return explicit
  if (!SUPABASE_URL) return ''
  return SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co')
}

const formatApptWhen = (date, time) => {
  const ymd = String(date || '').slice(0, 10)
  const parts = ymd.split('-')
  const hhmm = String(time || '').slice(0, 5)
  if (parts.length === 3) return `${parts[2]}/${parts[1]} às ${hhmm}`
  return hhmm
}

const getAccessToken = async () => {
  const sb = getClient()
  if (!sb) return ''
  const { data } = await sb.auth.getSession()
  return data?.session?.access_token || ''
}

/** Avisa a profissional de um agendamento feito pelo link público. Best-effort. */
export const notifyProfessionalNewBooking = (appointmentId) => {
  const id = String(appointmentId || '').trim()
  const base = getFunctionsBaseUrl()
  if (!id || !base) return
  fetch(`${base}/send-scheduled-pushes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ mode: 'new_booking', appointment_id: id }),
  }).catch(() => {})
}

const notifyOwnerStaffBookingPush = async (appointmentId, actorOperatorId) => {
  const id = String(appointmentId || '').trim()
  const base = getFunctionsBaseUrl()
  if (!id || !base) return
  const token = await getAccessToken()
  if (!token) return
  fetch(`${base}/send-scheduled-pushes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: 'staff_booking',
      appointment_id: id,
      actor_operator_id: actorOperatorId || '',
    }),
  }).catch(() => {})
}

// ─── USER-SCOPED LOCAL STORAGE ───────────────────────────────────────────────
const userKey = (userId, key) => `u_${userId}_${key}`
const uget = (userId, key) => local.get(userKey(userId, key))
const uset = (userId, key, val) => local.set(userKey(userId, key), val)

// ─── NORMALIZADORES ──────────────────────────────────────────────────────────
const normalizeClient = (c) => ({
  id: c.id,
  name: c.name || '',
  phone: toAppPhone(c.phone),
  notes: c.notes || '',
  createdAt: c.created_at || c.createdAt || new Date().toISOString(),
})

const toAppPhone = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  // DB stores BR phones as +55..., but the UI should keep the local format users type.
  if (raw.startsWith('+55')) {
    const digits = raw.slice(1).replace(/\D/g, '')
    if (digits.length === 12 || digits.length === 13) {
      return digits.slice(2)
    }
  }

  return raw
}

const normalizeService = (s) => ({
  id: s.id,
  name: s.name,
  price: Number(s.price),
  costPerClient: s.service_cost != null ? Number(s.service_cost) : (s.costPerClient != null ? Number(s.costPerClient) : null),
  color: s.color || '',
})

const isE164Phone = (value) => /^\+[1-9]\d{7,14}$/.test(value)

const toE164PhoneCandidates = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return []

  const candidates = []
  const pushCandidate = (candidate) => {
    if (isE164Phone(candidate) && !candidates.includes(candidate)) candidates.push(candidate)
  }

  // Already in international format.
  if (raw.startsWith('+')) {
    const digitsPlus = raw.slice(1).replace(/\D/g, '')
    if (digitsPlus) pushCandidate(`+${digitsPlus}`)
  }

  let digits = raw.replace(/\D/g, '')
  if (!digits) return candidates

  // International prefix 00XXXXXXXX -> +XXXXXXXX
  if (digits.startsWith('00') && digits.length > 2) {
    digits = digits.slice(2)
  }

  // Remove trunk leading zeros used in local dialing.
  digits = digits.replace(/^0+/, '')
  if (!digits) return candidates

  // Numbers that already include country code without plus.
  if (digits.startsWith('55')) {
    pushCandidate(`+${digits}`)
  }

  // Common BR local formats (subscriber only, with DDD, etc.).
  if (digits.length >= 8 && digits.length <= 11) {
    pushCandidate(`+55${digits}`)
  }

  // Any other international-like number without plus.
  if (digits.length >= 12 && digits.length <= 15) {
    pushCandidate(`+${digits}`)
  }

  return candidates
}

const toE164Phone = (value) => {
  const candidates = toE164PhoneCandidates(value)
  return candidates[0] || null
}

const ENTITY_LABELS = {
  client: 'cliente',
  service: 'serviço',
  appointment: 'agendamento',
  config: 'configuração',
  inventory_item: 'item de estoque',
  inventory_movement: 'movimentação de estoque',
  cash_expense: 'saída de caixa',
  team_member: 'operador',
}

const buildAuditSummary = (action, entityType, entityName) => {
  const label = ENTITY_LABELS[entityType] || entityType
  const verb = action === 'create' ? 'Criou' : action === 'update' ? 'Atualizou' : 'Removeu'
  return entityName ? `${verb} ${label}: ${entityName}` : `${verb} ${label}`
}

const normalizeTeamMember = (member) => ({
  id: member.id,
  name: member.name || '',
  color: member.color || null,
  pinHash: member.pin_hash || member.pinHash || null,
  active: member.active !== false,
  createdAt: member.created_at || member.createdAt || new Date().toISOString(),
  updatedAt: member.updated_at || member.updatedAt || new Date().toISOString(),
})

const normalizeAuditEntry = (entry) => ({
  id: entry.id,
  operatorId: entry.operator_id || entry.operatorId || null,
  operatorName: entry.operator_name || entry.operatorName || 'Desconhecido',
  action: entry.action,
  entityType: entry.entity_type || entry.entityType,
  entityId: entry.entity_id || entry.entityId || null,
  summary: entry.summary,
  payload: entry.payload || null,
  createdAt: entry.created_at || entry.createdAt || new Date().toISOString(),
})

const normalizeNotification = (row) => ({
  id: row.id,
  type: row.type || 'public_booking',
  title: row.title || 'Notificação',
  body: row.body || '',
  appointmentId: row.appointment_id || row.appointmentId || null,
  operatorId: row.operator_id || row.operatorId || null,
  payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  readAt: row.read_at || row.readAt || null,
  createdAt: row.created_at || row.createdAt || new Date().toISOString(),
})

const logAudit = async (userId, { action, entityType, entityId, summary, payload, entityName }) => {
  const operator = getActiveOperatorGlobal()
  const normalized = {
    id: uid(),
    operatorId: operator?.id || null,
    operatorName: operator?.name || 'Desconhecido',
    action,
    entityType,
    entityId: entityId || null,
    summary: summary || buildAuditSummary(action, entityType, entityName),
    payload: payload || null,
    createdAt: new Date().toISOString(),
  }

  const sb = getClient()
  if (sb) {
    const { error } = await sb.from('audit_log').insert({
      id: normalized.id,
      user_id: userId,
      operator_id: normalized.operatorId,
      operator_name: normalized.operatorName,
      action: normalized.action,
      entity_type: normalized.entityType,
      entity_id: normalized.entityId,
      summary: normalized.summary,
      payload: normalized.payload,
      created_at: normalized.createdAt,
    })
    if (!error) {
      const all = uget(userId, 'audit_log') || []
      uset(userId, 'audit_log', [normalized, ...all].slice(0, 500))
      return normalized
    }
  }

  const all = uget(userId, 'audit_log') || []
  uset(userId, 'audit_log', [normalized, ...all].slice(0, 500))
  return normalized
}

// ─── DB LAYER (Supabase com cache write-through no localStorage) ──────────────
export const DB = {
  // ── Clientes ──
  async getClients(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('clients').select('*').eq('user_id', userId).order('name')
      if (!error && data) {
        const normalized = data.map(normalizeClient)
        uset(userId, 'clients', normalized)
        return normalized
      }
    }
    return uget(userId, 'clients') || []
  },

  async saveClient(userId, client) {
    const sb = getClient()
    if (sb) {
      const phoneRaw = String(client.phone || '').trim()
      const phoneDigits = phoneRaw.replace(/\D/g, '')
      const phoneCandidates = toE164PhoneCandidates(phoneRaw)
      const phonePrimary = toE164Phone(phoneRaw)
      const phoneFallback = phoneDigits ? toE164Phone(phoneDigits) : null
      const row = {
        id: client.id,
        user_id: userId,
        name: client.name,
        phone: phonePrimary || phoneFallback,
        notes: client.notes || '',
        created_at: client.createdAt || new Date().toISOString(),
      }
      let { data, error } = client._new
        ? await sb.from('clients').insert(row).select().single()
        : await sb.from('clients').update(row).eq('id', client.id).eq('user_id', userId).select().single()

      // If DB rejects phone format, retry without phone to avoid blocking client creation.
      const isPhoneCheckError = error?.code === '23514' && String(error?.message || '').includes('clients_phone_e164_check')
      if (isPhoneCheckError) {
        // Try alternative normalized candidates before dropping the phone.
        const alternatives = phoneCandidates.filter((candidate) => candidate !== row.phone)
        for (const candidate of alternatives) {
          const retriedRow = { ...row, phone: candidate }
          const retry = client._new
            ? await sb.from('clients').insert(retriedRow).select().single()
            : await sb.from('clients').update(retriedRow).eq('id', client.id).eq('user_id', userId).select().single()
          data = retry.data
          error = retry.error
          if (!error) break
        }

        const stillPhoneCheckError = error?.code === '23514' && String(error?.message || '').includes('clients_phone_e164_check')
        // Only allow null fallback when the user did not provide any digits.
        if (stillPhoneCheckError && !phoneDigits) {
          const rowNoPhone = { ...row, phone: null }
          const second = client._new
            ? await sb.from('clients').insert(rowNoPhone).select().single()
            : await sb.from('clients').update(rowNoPhone).eq('id', client.id).eq('user_id', userId).select().single()
          data = second.data
          error = second.error
        }
      }

      if (!error && data) {
        const normalized = normalizeClient(data)
        const all = uget(userId, 'clients') || []
        const exists = all.find((c) => c.id === normalized.id)
        uset(userId, 'clients', exists ? all.map((c) => (c.id === normalized.id ? normalized : c)) : [...all, normalized])
        await logAudit(userId, {
          action: client._new ? 'create' : 'update',
          entityType: 'client',
          entityId: normalized.id,
          entityName: normalized.name,
        })
        return normalized
      }

      if (error) throw error
    }
    const normalized = normalizeClient({ ...client, created_at: client.createdAt })
    const all = uget(userId, 'clients') || []
    const exists = all.find((c) => c.id === normalized.id)
    uset(userId, 'clients', exists ? all.map((c) => (c.id === normalized.id ? normalized : c)) : [...all, normalized])
    await logAudit(userId, {
      action: client._new ? 'create' : 'update',
      entityType: 'client',
      entityId: normalized.id,
      entityName: normalized.name,
    })
    return normalized
  },

  async deleteClient(userId, id) {
    const existing = (uget(userId, 'clients') || []).find((c) => c.id === id)
    const sb = getClient()
    if (sb) { await sb.from('clients').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'clients', (uget(userId, 'clients') || []).filter((c) => c.id !== id))
    await logAudit(userId, {
      action: 'delete',
      entityType: 'client',
      entityId: id,
      entityName: existing?.name,
    })
  },

  // ── Serviços ──
  async getServices(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('services').select('*').eq('user_id', userId).order('name')
      if (!error && data) {
        const cached = uget(userId, 'services') || []
        const hasServiceCostColumn = data.length === 0 || Object.prototype.hasOwnProperty.call(data[0], 'service_cost')
        const normalized = data.map((serviceRow) => {
          const service = normalizeService(serviceRow)
          if (hasServiceCostColumn) return service
          const cachedService = cached.find((c) => c.id === service.id)
          return cachedService?.costPerClient != null
            ? { ...service, costPerClient: Number(cachedService.costPerClient) }
            : service
        })
        uset(userId, 'services', normalized)
        return normalized
      }
    }
    return uget(userId, 'services') || []
  },

  async saveService(userId, service) {
    const sb = getClient()
    if (sb) {
      const rowBase = {
        id: service.id,
        user_id: userId,
        name: service.name,
        price: service.price,
        color: service.color && String(service.color).trim() ? String(service.color).trim() : null,
      }
      const rowWithCost = {
        ...rowBase,
        cost_per_client: service.costPerClient != null ? Number(service.costPerClient) : null,
      }
      const run = (row) =>
        service._new
          ? sb.from('services').insert(row).select().single()
          : sb.from('services').update(row).eq('id', service.id).eq('user_id', userId).select().single()

      let { data, error } = await run(rowWithCost)
      const isMissingCostColumn = String(error?.message || '').includes('cost_per_client')
      if (isMissingCostColumn) {
        const second = await run(rowBase)
        data = second.data
        error = second.error
      }
      if (!error && data) {
        const normalized = {
          ...normalizeService(data),
          costPerClient: service.costPerClient != null ? Number(service.costPerClient) : null,
        }
        const all = uget(userId, 'services') || []
        const exists = all.find((s) => s.id === normalized.id)
        uset(userId, 'services', exists ? all.map((s) => (s.id === normalized.id ? normalized : s)) : [...all, normalized])
        await logAudit(userId, {
          action: service._new ? 'create' : 'update',
          entityType: 'service',
          entityId: normalized.id,
          entityName: normalized.name,
        })
        return normalized
      }
    }
    const normalized = normalizeService(service)
    const all = uget(userId, 'services') || []
    const exists = all.find((s) => s.id === normalized.id)
    uset(userId, 'services', exists ? all.map((s) => (s.id === normalized.id ? normalized : s)) : [...all, normalized])
    await logAudit(userId, {
      action: service._new ? 'create' : 'update',
      entityType: 'service',
      entityId: normalized.id,
      entityName: normalized.name,
    })
    return normalized
  },

  async deleteService(userId, id) {
    const existing = (uget(userId, 'services') || []).find((s) => s.id === id)
    const sb = getClient()
    if (sb) { await sb.from('services').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'services', (uget(userId, 'services') || []).filter((s) => s.id !== id))
    await logAudit(userId, {
      action: 'delete',
      entityType: 'service',
      entityId: id,
      entityName: existing?.name,
    })
  },

  // ── Agendamentos ──
  async getAppointments(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('appointments').select('*').eq('user_id', userId).order('date').order('time')
      if (!error && data) {
        const normalized = data.map((a) => ({
          id: a.id,
          clientId: a.client_id,
          serviceId: a.service_id,
          date: a.date,
          time: a.time,
          value: a.value,
          notes: a.notes,
          status: a.status,
          blocked: a.blocked,
          durationMinutes: a.duration_minutes != null ? Number(a.duration_minutes) : 60,
          reminderEnabled: !!a.reminder_enabled,
          reminderMinutesBefore: a.reminder_minutes_before != null ? Number(a.reminder_minutes_before) : 60,
          notificationStatus: a.notification_status != null ? String(a.notification_status) : 'none',
          reminderSentAt: a.reminder_sent_at || null,
          paymentMethod: a.payment_method || '',
          paymentValue: a.payment_value != null ? Number(a.payment_value) : null,
          paymentNotes: a.payment_notes || '',
          paidAt: a.paid_at || null,
        }))
        uset(userId, 'appointments', normalized)
        return normalized
      }
    }
    const raw = uget(userId, 'appointments') || []
    return raw.map((a) => ({
      ...a,
      notificationStatus: a.notificationStatus ?? 'none',
      reminderSentAt: a.reminderSentAt ?? null,
      paymentMethod: a.paymentMethod ?? '',
      paymentValue: a.paymentValue != null ? Number(a.paymentValue) : null,
      paymentNotes: a.paymentNotes ?? '',
      paidAt: a.paidAt ?? null,
    }))
  },

  async saveAppointment(userId, appt) {
    const sb = getClient()
    const mapRow = (a) => ({
      id: a.id,
      clientId: a.client_id,
      serviceId: a.service_id,
      date: a.date,
      time: a.time,
      value: a.value,
      notes: a.notes || '',
      status: a.status,
      blocked: !!a.blocked,
      durationMinutes: a.duration_minutes != null ? Number(a.duration_minutes) : 60,
      reminderEnabled: !!a.reminder_enabled,
      reminderMinutesBefore: a.reminder_minutes_before != null ? Number(a.reminder_minutes_before) : 60,
      notificationStatus: a.notification_status != null ? String(a.notification_status) : 'none',
      reminderSentAt: a.reminder_sent_at || null,
      paymentMethod: a.payment_method || '',
      paymentValue: a.payment_value != null ? Number(a.payment_value) : null,
      paymentNotes: a.payment_notes || '',
      paidAt: a.paid_at || null,
    })
    if (sb) {
      const defaultStatus = appt.blocked ? 'blocked' : 'pending'
      const row = {
        id: appt.id,
        user_id: userId,
        client_id: appt.clientId || null,
        service_id: appt.serviceId || null,
        date: appt.date,
        time: appt.time,
        value: appt.value || null,
        notes: appt.notes || '',
        status: appt.status || defaultStatus,
        blocked: appt.blocked || false,
        duration_minutes: appt.durationMinutes != null && Number(appt.durationMinutes) > 0
          ? Number(appt.durationMinutes) : 60,
        reminder_enabled: !!appt.reminderEnabled,
        reminder_minutes_before: appt.reminderMinutesBefore != null && Number(appt.reminderMinutesBefore) > 0
          ? Number(appt.reminderMinutesBefore) : 60,
        notification_status: appt.notificationStatus != null ? String(appt.notificationStatus) : 'none',
        reminder_sent_at: appt.reminderSentAt || null,
        payment_method: appt.paymentMethod || null,
        payment_value: appt.paymentValue != null ? Number(appt.paymentValue) : null,
        payment_notes: appt.paymentNotes || null,
        paid_at: appt.paidAt || null,
      }
      const run = async (r) =>
        appt._new
          ? sb.from('appointments').insert(r).select().single()
          : sb.from('appointments').update(r).eq('id', appt.id).eq('user_id', userId).select().single()
      let { data, error } = await run(row)
      const isMissingClientFk = error?.code === '23503' && String(error?.message || '').includes('appointments_client_id_fkey')
      if (isMissingClientFk && appt.clientId) {
        const localClients = uget(userId, 'clients') || []
        const missingClient = localClients.find((c) => c.id === appt.clientId)
        if (missingClient) {
          await DB.saveClient(userId, { ...missingClient, _new: true })
          const third = await run(row)
          data = third.data
          error = third.error
        }
      }
      if (error) {
        const {
          reminder_enabled: _re,
          reminder_minutes_before: _rm,
          notification_status: _ns,
          reminder_sent_at: _rsa,
          payment_method: _pm,
          payment_value: _pv,
          payment_notes: _pn,
          paid_at: _pa,
          ...rest
        } = row
        const second = await run(rest)
        data = second.data
        error = second.error
      }
      if (!error && data) {
        const normalized = { ...mapRow(data), _new: undefined }
        const all = uget(userId, 'appointments') || []
        const exists = all.find((a) => a.id === normalized.id)
        uset(userId, 'appointments', exists ? all.map((a) => (a.id === normalized.id ? normalized : a)) : [...all, normalized])
        const clients = uget(userId, 'clients') || []
        const clientName = clients.find((c) => c.id === normalized.clientId)?.name
        const summary = appt.blocked
          ? `${appt._new ? 'Bloqueou' : 'Atualizou bloqueio em'} ${appt.date} ${appt.time}`
          : buildAuditSummary(appt._new ? 'create' : 'update', 'appointment', clientName || `${appt.date} ${appt.time}`)
        await logAudit(userId, {
          action: appt._new ? 'create' : 'update',
          entityType: 'appointment',
          entityId: normalized.id,
          summary,
          payload: { date: normalized.date, time: normalized.time, status: normalized.status },
        })
        return normalized
      }
    }
    const { _new: __n, ...apptClean } = appt
    const fallback = {
      ...apptClean,
      notificationStatus: apptClean.notificationStatus ?? 'none',
      reminderSentAt: apptClean.reminderSentAt ?? null,
    }
    const all = uget(userId, 'appointments') || []
    const exists = all.find((a) => a.id === fallback.id)
    uset(userId, 'appointments', exists ? all.map((a) => (a.id === fallback.id ? fallback : a)) : [...all, fallback])
    await logAudit(userId, {
      action: appt._new ? 'create' : 'update',
      entityType: 'appointment',
      entityId: fallback.id,
      summary: buildAuditSummary(appt._new ? 'create' : 'update', 'appointment', `${fallback.date} ${fallback.time}`),
    })
    return fallback
  },

  async deleteAppointment(userId, id) {
    const existing = (uget(userId, 'appointments') || []).find((a) => a.id === id)
    const sb = getClient()
    if (sb) { await sb.from('appointments').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'appointments', (uget(userId, 'appointments') || []).filter((a) => a.id !== id))
    await logAudit(userId, {
      action: 'delete',
      entityType: 'appointment',
      entityId: id,
      summary: existing ? `Removeu agendamento: ${existing.date} ${existing.time}` : 'Removeu agendamento',
    })
  },

  // ── Config ──
  async getConfig(userId) {
    const sb = getClient()
    if (sb) {
      const { data } = await sb.from('config').select('*').eq('user_id', userId).single()
      if (data) return {
        avgCost: Number(data.avg_cost ?? 12.35),
        salaryPercentage: Number(data.salary_percentage ?? 50),
        stateUf: data.state_uf || '',
        city: data.city || '',
        workHours: normalizeWorkHours(data.work_hours),
      }
    }
    const stored = uget(userId, 'config')
    return {
      avgCost: Number(stored?.avgCost ?? 12.35),
      salaryPercentage: Number(stored?.salaryPercentage ?? 50),
      stateUf: stored?.stateUf || '',
      city: stored?.city || '',
      workHours: normalizeWorkHours(stored?.workHours),
    }
  },

  async saveConfig(userId, config) {
    const sb = getClient()
    const workHours = normalizeWorkHours(config.workHours)
    const nextConfig = { ...config, workHours }
    if (sb) {
      await sb.from('config').upsert({
        user_id: userId,
        avg_cost: nextConfig.avgCost,
        salary_percentage: nextConfig.salaryPercentage ?? 50,
        state_uf: nextConfig.stateUf || null,
        city: nextConfig.city || null,
        work_hours: workHours,
      }, { onConflict: 'user_id' })
    }
    uset(userId, 'config', nextConfig)
    await logAudit(userId, {
      action: 'update',
      entityType: 'config',
      summary: 'Atualizou configurações',
      payload: nextConfig,
    })
  },

  // ── Estoque ──
  async getInventoryItems(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('inventory_items').select('*').eq('user_id', userId).order('name')
      if (!error && data) {
        const normalized = data.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category || '',
          unit: i.unit || 'un',
          costPrice: Number(i.cost_price || 0),
          sellPrice: Number(i.sell_price || 0),
          stock: Number(i.stock || 0),
          minStock: Number(i.min_stock || 0),
          supplier: i.supplier || '',
          notes: i.notes || '',
          createdAt: i.created_at || new Date().toISOString(),
          updatedAt: i.updated_at || i.created_at || new Date().toISOString(),
        }))
        uset(userId, 'inventory_items', normalized)
        return normalized
      }
    }
    return uget(userId, 'inventory_items') || []
  },

  async saveInventoryItem(userId, item) {
    const sb = getClient()
    if (sb) {
      const row = {
        id: item.id,
        user_id: userId,
        name: item.name,
        category: item.category || '',
        unit: item.unit || 'un',
        cost_price: Number(item.costPrice || 0),
        sell_price: Number(item.sellPrice || 0),
        stock: Number(item.stock || 0),
        min_stock: Number(item.minStock || 0),
        supplier: item.supplier || '',
        notes: item.notes || '',
        created_at: item.createdAt || new Date().toISOString(),
        updated_at: item.updatedAt || new Date().toISOString(),
      }
      const { data, error } = item._new
        ? await sb.from('inventory_items').insert(row).select().single()
        : await sb.from('inventory_items').update(row).eq('id', item.id).eq('user_id', userId).select().single()
      if (!error && data) {
        const normalized = {
          id: data.id,
          name: data.name,
          category: data.category || '',
          unit: data.unit || 'un',
          costPrice: Number(data.cost_price || 0),
          sellPrice: Number(data.sell_price || 0),
          stock: Number(data.stock || 0),
          minStock: Number(data.min_stock || 0),
          supplier: data.supplier || '',
          notes: data.notes || '',
          createdAt: data.created_at || new Date().toISOString(),
          updatedAt: data.updated_at || new Date().toISOString(),
        }
        const all = uget(userId, 'inventory_items') || []
        const exists = all.find((i) => i.id === normalized.id)
        uset(userId, 'inventory_items', exists ? all.map((i) => (i.id === normalized.id ? normalized : i)) : [...all, normalized])
        await logAudit(userId, {
          action: item._new ? 'create' : 'update',
          entityType: 'inventory_item',
          entityId: normalized.id,
          entityName: normalized.name,
        })
        return normalized
      }
    }
    const all = uget(userId, 'inventory_items') || []
    const exists = all.find((i) => i.id === item.id)
    uset(userId, 'inventory_items', exists ? all.map((i) => (i.id === item.id ? item : i)) : [...all, item])
    await logAudit(userId, {
      action: item._new ? 'create' : 'update',
      entityType: 'inventory_item',
      entityId: item.id,
      entityName: item.name,
    })
    return item
  },

  async deleteInventoryItem(userId, id) {
    const existing = (uget(userId, 'inventory_items') || []).find((i) => i.id === id)
    const sb = getClient()
    if (sb) { await sb.from('inventory_items').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'inventory_items', (uget(userId, 'inventory_items') || []).filter((i) => i.id !== id))
    await logAudit(userId, {
      action: 'delete',
      entityType: 'inventory_item',
      entityId: id,
      entityName: existing?.name,
    })
  },

  async getInventoryMovements(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('inventory_movements').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      if (!error && data) {
        const normalized = data.map((m) => ({
          id: m.id,
          itemId: m.item_id,
          type: m.type || 'in',
          qty: Number(m.qty || 0),
          reason: m.reason || '',
          createdAt: m.created_at || new Date().toISOString(),
        }))
        uset(userId, 'inventory_movements', normalized)
        return normalized
      }
    }
    return uget(userId, 'inventory_movements') || []
  },

  async saveInventoryMovement(userId, movement) {
    const sb = getClient()
    if (sb) {
      const row = {
        id: movement.id,
        user_id: userId,
        item_id: movement.itemId,
        type: movement.type || 'in',
        qty: Number(movement.qty || 0),
        reason: movement.reason || '',
        created_at: movement.createdAt || new Date().toISOString(),
      }
      const { data, error } = await sb.from('inventory_movements').insert(row).select().single()
      if (!error && data) {
        const normalized = {
          id: data.id,
          itemId: data.item_id,
          type: data.type || 'in',
          qty: Number(data.qty || 0),
          reason: data.reason || '',
          createdAt: data.created_at || new Date().toISOString(),
        }
        const all = uget(userId, 'inventory_movements') || []
        uset(userId, 'inventory_movements', [normalized, ...all])
        const items = uget(userId, 'inventory_items') || []
        const itemName = items.find((i) => i.id === normalized.itemId)?.name
        await logAudit(userId, {
          action: 'create',
          entityType: 'inventory_movement',
          entityId: normalized.id,
          summary: `Registrou ${normalized.type === 'in' ? 'entrada' : 'saída'} de estoque${itemName ? `: ${itemName}` : ''}`,
          payload: normalized,
        })
        return normalized
      }
    }
    const all = uget(userId, 'inventory_movements') || []
    uset(userId, 'inventory_movements', [movement, ...all])
    await logAudit(userId, {
      action: 'create',
      entityType: 'inventory_movement',
      entityId: movement.id,
      summary: 'Registrou movimentação de estoque',
      payload: movement,
    })
    return movement
  },

  // ── Saídas de caixa ──
  async getCashExpenses(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb
        .from('cash_expenses')
        .select('*')
        .eq('user_id', userId)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (!error && data) {
        const normalized = data.map((e) => ({
          id: e.id,
          category: e.category || 'materials',
          amount: Number(e.amount || 0),
          paymentMethod: e.payment_method || 'cash',
          notes: e.notes || '',
          expenseDate: e.expense_date || String(e.created_at || '').slice(0, 10),
          createdAt: e.created_at || new Date().toISOString(),
          updatedAt: e.updated_at || e.created_at || new Date().toISOString(),
        }))
        uset(userId, 'cash_expenses', normalized)
        return normalized
      }
    }
    return uget(userId, 'cash_expenses') || []
  },

  async saveCashExpense(userId, expense) {
    const sb = getClient()
    if (sb) {
      const row = {
        id: expense.id,
        user_id: userId,
        category: expense.category || 'materials',
        amount: Number(expense.amount || 0),
        payment_method: expense.paymentMethod || 'cash',
        notes: expense.notes || '',
        expense_date: expense.expenseDate || new Date().toISOString().slice(0, 10),
        created_at: expense.createdAt || new Date().toISOString(),
        updated_at: expense.updatedAt || new Date().toISOString(),
      }
      const { data, error } = expense._new
        ? await sb.from('cash_expenses').insert(row).select().single()
        : await sb.from('cash_expenses').update(row).eq('id', expense.id).eq('user_id', userId).select().single()
      if (!error && data) {
        const normalized = {
          id: data.id,
          category: data.category || 'materials',
          amount: Number(data.amount || 0),
          paymentMethod: data.payment_method || 'cash',
          notes: data.notes || '',
          expenseDate: data.expense_date || String(data.created_at || '').slice(0, 10),
          createdAt: data.created_at || new Date().toISOString(),
          updatedAt: data.updated_at || new Date().toISOString(),
        }
        const all = uget(userId, 'cash_expenses') || []
        const exists = all.find((e) => e.id === normalized.id)
        uset(userId, 'cash_expenses', exists
          ? all.map((e) => (e.id === normalized.id ? normalized : e))
          : [normalized, ...all])
        await logAudit(userId, {
          action: expense._new ? 'create' : 'update',
          entityType: 'cash_expense',
          entityId: normalized.id,
          summary: `Registrou saída de caixa: R$ ${normalized.amount.toFixed(2)}`,
          payload: normalized,
        })
        return normalized
      }
    }
    const all = uget(userId, 'cash_expenses') || []
    const exists = all.find((e) => e.id === expense.id)
    const localRow = {
      id: expense.id,
      category: expense.category || 'materials',
      amount: Number(expense.amount || 0),
      paymentMethod: expense.paymentMethod || 'cash',
      notes: expense.notes || '',
      expenseDate: expense.expenseDate || new Date().toISOString().slice(0, 10),
      createdAt: expense.createdAt || new Date().toISOString(),
      updatedAt: expense.updatedAt || new Date().toISOString(),
    }
    uset(userId, 'cash_expenses', exists
      ? all.map((e) => (e.id === localRow.id ? localRow : e))
      : [localRow, ...all])
    await logAudit(userId, {
      action: expense._new ? 'create' : 'update',
      entityType: 'cash_expense',
      entityId: localRow.id,
      summary: `Registrou saída de caixa: R$ ${localRow.amount.toFixed(2)}`,
      payload: localRow,
    })
    return localRow
  },

  async deleteCashExpense(userId, id) {
    const existing = (uget(userId, 'cash_expenses') || []).find((e) => e.id === id)
    const sb = getClient()
    if (sb) { await sb.from('cash_expenses').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'cash_expenses', (uget(userId, 'cash_expenses') || []).filter((e) => e.id !== id))
    await logAudit(userId, {
      action: 'delete',
      entityType: 'cash_expense',
      entityId: id,
      summary: existing ? `Removeu saída de caixa: R$ ${Number(existing.amount || 0).toFixed(2)}` : 'Removeu saída de caixa',
      payload: existing || { id },
    })
  },

  // ── Push Web (PWA) — tabela push_subscriptions (ver supabase/sql/push_subscriptions.sql) ──
  async savePushSubscription(userId, subscription, prefs = {}, operatorId = null) {
    const subJson = subscription && typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription
    if (!subJson?.endpoint) return false
    const sb = getClient()
    if (sb) {
      const row = {
        user_id: userId,
        endpoint: subJson.endpoint,
        keys_p256dh: subJson.keys?.p256dh ?? '',
        keys_auth: subJson.keys?.auth ?? '',
        morning_enabled: prefs.morningEnabled !== false,
        reminder_minutes_before: prefs.reminderMinutesBefore ?? 60,
        progress_enabled: prefs.progressEnabled !== false,
        updated_at: new Date().toISOString(),
      }
      if (operatorId) row.operator_id = operatorId
      let { error } = await sb.from('push_subscriptions').upsert(row, { onConflict: 'user_id,endpoint' })
      if (error && /operator_id/i.test(error.message || '')) {
        const { operator_id: _op, ...rest } = row
        const retry = await sb.from('push_subscriptions').upsert(rest, { onConflict: 'user_id,endpoint' })
        error = retry.error
      }
      if (!error) return true
    }
    uset(userId, 'push_subscription', { ...subJson, prefs, operatorId: operatorId || null, updatedAt: new Date().toISOString() })
    return true
  },

  async bindPushSubscriptionToOperator(userId, subscription, operatorId) {
    if (!userId || !operatorId || !subscription) return false
    return this.savePushSubscription(userId, subscription, {
      morningEnabled: true,
      reminderMinutesBefore: 60,
      progressEnabled: true,
    }, operatorId)
  },

  async deletePushSubscription(userId, subscriptionOrEndpoint) {
    const endpoint =
      typeof subscriptionOrEndpoint === 'string'
        ? subscriptionOrEndpoint
        : subscriptionOrEndpoint?.endpoint
    if (!endpoint) return
    const sb = getClient()
    if (sb) {
      await sb.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
    }
    uset(userId, 'push_subscription', null)
  },

  // ── Operadores da equipe ──
  async getTeamMembers(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb
        .from('team_members')
        .select('*')
        .eq('user_id', userId)
        .order('name')
      if (!error && data) {
        const normalized = data.map(normalizeTeamMember)
        uset(userId, 'team_members', normalized)
        return normalized
      }
    }
    return (uget(userId, 'team_members') || []).map(normalizeTeamMember)
  },

  async saveTeamMember(userId, member) {
    const sb = getClient()
    const row = {
      id: member.id,
      user_id: userId,
      name: member.name,
      color: member.color || null,
      pin_hash: member.pinHash ?? null,
      active: member.active !== false,
      created_at: member.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (sb) {
      const { data, error } = member._new
        ? await sb.from('team_members').insert(row).select().single()
        : await sb.from('team_members').update({
          name: row.name,
          color: row.color,
          pin_hash: row.pin_hash,
          active: row.active,
          updated_at: row.updated_at,
        }).eq('id', member.id).eq('user_id', userId).select().single()

      if (!error && data) {
        const normalized = normalizeTeamMember(data)
        const all = uget(userId, 'team_members') || []
        const exists = all.find((m) => m.id === normalized.id)
        uset(userId, 'team_members', exists ? all.map((m) => (m.id === normalized.id ? normalized : m)) : [...all, normalized])
        await logAudit(userId, {
          action: member._new ? 'create' : 'update',
          entityType: 'team_member',
          entityId: normalized.id,
          entityName: normalized.name,
        })
        return normalized
      }
    }

    const normalized = normalizeTeamMember({ ...member, pin_hash: member.pinHash })
    const all = uget(userId, 'team_members') || []
    const exists = all.find((m) => m.id === normalized.id)
    uset(userId, 'team_members', exists ? all.map((m) => (m.id === normalized.id ? normalized : m)) : [...all, normalized])
    await logAudit(userId, {
      action: member._new ? 'create' : 'update',
      entityType: 'team_member',
      entityId: normalized.id,
      entityName: normalized.name,
    })
    return normalized
  },

  async deleteTeamMember(userId, id) {
    const existing = (uget(userId, 'team_members') || []).find((m) => m.id === id)
    const sb = getClient()
    if (sb) {
      await sb.from('team_members').delete().eq('id', id).eq('user_id', userId)
    }
    uset(userId, 'team_members', (uget(userId, 'team_members') || []).filter((m) => m.id !== id))
    await logAudit(userId, {
      action: 'delete',
      entityType: 'team_member',
      entityId: id,
      entityName: existing?.name,
    })
  },

  // ── Histórico de alterações ──
  async getAuditLog(userId, { limit = 200 } = {}) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb
        .from('audit_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (!error && data) {
        const normalized = data.map(normalizeAuditEntry)
        uset(userId, 'audit_log', normalized)
        return normalized
      }
    }
    return (uget(userId, 'audit_log') || []).map(normalizeAuditEntry).slice(0, limit)
  },

  async getNotifications(userId, { limit = 80 } = {}) {
    const sb = getClient()
    if (sb && userId && userId !== 'demo_user') {
      const { data, error } = await sb
        .from('app_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (!error && data) {
        const normalized = data.map(normalizeNotification)
        uset(userId, 'app_notifications', normalized)
        return normalized
      }
    }
    return (uget(userId, 'app_notifications') || []).map(normalizeNotification).slice(0, limit)
  },

  async markNotificationsRead(userId, ids) {
    const idList = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
    if (!idList.length) return this.getNotifications(userId)
    const nowIso = new Date().toISOString()
    const sb = getClient()
    if (sb && userId && userId !== 'demo_user') {
      await sb
        .from('app_notifications')
        .update({ read_at: nowIso, updated_at: nowIso })
        .eq('user_id', userId)
        .in('id', idList)
        .is('read_at', null)
    }
    return this.getNotifications(userId)
  },

  async markAllNotificationsRead(userId, { operatorId = null, includeUnscoped = false } = {}) {
    const nowIso = new Date().toISOString()
    const sb = getClient()
    if (sb && userId && userId !== 'demo_user') {
      let query = sb
        .from('app_notifications')
        .update({ read_at: nowIso, updated_at: nowIso })
        .eq('user_id', userId)
        .is('read_at', null)
      if (operatorId && includeUnscoped) {
        query = query.or(`operator_id.eq.${operatorId},operator_id.is.null`)
      } else if (operatorId) {
        query = query.eq('operator_id', operatorId)
      }
      await query
    }
    return this.getNotifications(userId)
  },

  async deleteNotifications(userId, ids) {
    const idList = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
    if (!idList.length) return this.getNotifications(userId)
    const sb = getClient()
    if (sb && userId && userId !== 'demo_user') {
      await sb.from('app_notifications').delete().eq('user_id', userId).in('id', idList)
    }
    const remaining = (uget(userId, 'app_notifications') || []).filter((n) => !idList.includes(n.id))
    uset(userId, 'app_notifications', remaining)
    return this.getNotifications(userId)
  },

  async deleteAllNotifications(userId, { operatorId = null, includeUnscoped = false } = {}) {
    const sb = getClient()
    if (sb && userId && userId !== 'demo_user') {
      if (operatorId && includeUnscoped) {
        await sb.from('app_notifications').delete().eq('user_id', userId).or(`operator_id.eq.${operatorId},operator_id.is.null`)
      } else if (operatorId) {
        await sb.from('app_notifications').delete().eq('user_id', userId).eq('operator_id', operatorId)
      } else {
        await sb.from('app_notifications').delete().eq('user_id', userId)
      }
    } else if (userId) {
      uset(userId, 'app_notifications', [])
    }
    return this.getNotifications(userId)
  },

  async notifyOwnerStaffBooking(userId, {
    appointment,
    ownerOperatorId,
    actorOperatorId,
    actorName,
    clientName,
    serviceName,
  } = {}) {
    if (!userId || userId === 'demo_user' || !appointment?.id || !ownerOperatorId) return
    if (actorOperatorId && actorOperatorId === ownerOperatorId) return
    if (appointment.blocked) return

    const when = formatApptWhen(appointment.date, appointment.time)
    const who = actorName || 'Funcionário'
    const client = clientName || 'Cliente'
    const body = serviceName
      ? `${who} agendou ${client} — ${serviceName} para ${when}`
      : `${who} agendou ${client} para ${when}`
    const row = {
      user_id: userId,
      operator_id: ownerOperatorId,
      type: 'staff_booking',
      title: 'Novo agendamento',
      body,
      appointment_id: appointment.id,
      payload: {
        date: appointment.date,
        time: String(appointment.time || '').slice(0, 5),
        clientName: client,
        serviceName: serviceName || '',
        actorName: who,
      },
    }

    const sb = getClient()
    if (sb) {
      let { error } = await sb.from('app_notifications').insert(row)
      if (error && /operator_id/i.test(error.message || '')) {
        const { operator_id: _op, ...rest } = row
        const retry = await sb.from('app_notifications').insert(rest)
        error = retry.error
      }
      if (error && error.code !== '23505') {
        console.warn('[notify] failed to insert staff booking inbox', error.message)
      }
    }

    notifyOwnerStaffBookingPush(appointment.id, actorOperatorId)
  },
}
