import { createClient } from '@supabase/supabase-js'

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
        return normalized
      }

      if (error) throw error
    }
    const normalized = normalizeClient({ ...client, created_at: client.createdAt })
    const all = uget(userId, 'clients') || []
    const exists = all.find((c) => c.id === normalized.id)
    uset(userId, 'clients', exists ? all.map((c) => (c.id === normalized.id ? normalized : c)) : [...all, normalized])
    return normalized
  },

  async deleteClient(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('clients').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'clients', (uget(userId, 'clients') || []).filter((c) => c.id !== id))
  },

  // ── Serviços ──
  async getServices(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('services').select('*').eq('user_id', userId).order('name')
      if (!error && data) {
        const normalized = data.map(normalizeService)
        uset(userId, 'services', normalized)
        return normalized
      }
    }
    return uget(userId, 'services') || []
  },

  async saveService(userId, service) {
    const sb = getClient()
    if (sb) {
      const row = {
        id: service.id,
        user_id: userId,
        name: service.name,
        price: service.price,
        color: service.color && String(service.color).trim() ? String(service.color).trim() : null,
      }
      const { data, error } = service._new
        ? await sb.from('services').insert(row).select().single()
        : await sb.from('services').update(row).eq('id', service.id).eq('user_id', userId).select().single()
      if (!error && data) {
        const normalized = normalizeService(data)
        const all = uget(userId, 'services') || []
        const exists = all.find((s) => s.id === normalized.id)
        uset(userId, 'services', exists ? all.map((s) => (s.id === normalized.id ? normalized : s)) : [...all, normalized])
        return normalized
      }
    }
    const normalized = normalizeService(service)
    const all = uget(userId, 'services') || []
    const exists = all.find((s) => s.id === normalized.id)
    uset(userId, 'services', exists ? all.map((s) => (s.id === normalized.id ? normalized : s)) : [...all, normalized])
    return normalized
  },

  async deleteService(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('services').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'services', (uget(userId, 'services') || []).filter((s) => s.id !== id))
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
    return fallback
  },

  async deleteAppointment(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('appointments').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'appointments', (uget(userId, 'appointments') || []).filter((a) => a.id !== id))
  },

  // ── Config ──
  async getConfig(userId) {
    const sb = getClient()
    if (sb) {
      const { data } = await sb.from('config').select('*').eq('user_id', userId).single()
      if (data) return { avgCost: Number(data.avg_cost ?? 12.35) }
    }
    const stored = uget(userId, 'config')
    return { avgCost: Number(stored?.avgCost ?? 12.35) }
  },

  async saveConfig(userId, config) {
    const sb = getClient()
    if (sb) {
      await sb.from('config').upsert({ user_id: userId, avg_cost: config.avgCost }, { onConflict: 'user_id' })
    }
    uset(userId, 'config', config)
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
        return normalized
      }
    }
    const all = uget(userId, 'inventory_items') || []
    const exists = all.find((i) => i.id === item.id)
    uset(userId, 'inventory_items', exists ? all.map((i) => (i.id === item.id ? item : i)) : [...all, item])
    return item
  },

  async deleteInventoryItem(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('inventory_items').delete().eq('id', id).eq('user_id', userId) }
    uset(userId, 'inventory_items', (uget(userId, 'inventory_items') || []).filter((i) => i.id !== id))
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
        return normalized
      }
    }
    const all = uget(userId, 'inventory_movements') || []
    uset(userId, 'inventory_movements', [movement, ...all])
    return movement
  },

  // ── Push Web (PWA) — tabela push_subscriptions (ver supabase/sql/push_subscriptions.sql) ──
  async savePushSubscription(userId, subscription, prefs = {}) {
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
      const { error } = await sb.from('push_subscriptions').upsert(row, { onConflict: 'user_id,endpoint' })
      if (!error) return true
    }
    uset(userId, 'push_subscription', { ...subJson, prefs, updatedAt: new Date().toISOString() })
    return true
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
}
