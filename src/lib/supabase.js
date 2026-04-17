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

// ─── DB LAYER (Supabase com fallback para localStorage) ──────────────────────
export const DB = {
  // ── Clientes ──
  async getClients(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('clients').select('*').order('name')
      if (!error) return data
    }
    return uget(userId, 'clients') || []
  },

  async saveClient(userId, client) {
    const sb = getClient()
    if (sb) {
      const row = {
        id: client.id,
        user_id: userId,
        name: client.name,
        phone: client.phone || '',
        notes: client.notes || '',
        created_at: client.createdAt || new Date().toISOString(),
      }
      const { data, error } = client._new
        ? await sb.from('clients').insert(row).select().single()
        : await sb.from('clients').update(row).eq('id', client.id).select().single()
      if (!error) return data
    }
    const all = uget(userId, 'clients') || []
    const exists = all.find((c) => c.id === client.id)
    const updated = exists ? all.map((c) => (c.id === client.id ? client : c)) : [...all, client]
    uset(userId, 'clients', updated)
    return client
  },

  async deleteClient(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('clients').delete().eq('id', id); return }
    uset(userId, 'clients', (uget(userId, 'clients') || []).filter((c) => c.id !== id))
  },

  // ── Serviços ──
  async getServices(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('services').select('*').order('name')
      if (!error) return data.map((s) => ({ id: s.id, name: s.name, price: Number(s.price), color: s.color || '' }))
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
        : await sb.from('services').update(row).eq('id', service.id).select().single()
      if (!error && data) return { id: data.id, name: data.name, price: Number(data.price), color: data.color || '' }
    }
    const all = uget(userId, 'services') || []
    const exists = all.find((s) => s.id === service.id)
    const updated = exists ? all.map((s) => (s.id === service.id ? service : s)) : [...all, service]
    uset(userId, 'services', updated)
    return service
  },

  async deleteService(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('services').delete().eq('id', id); return }
    uset(userId, 'services', (uget(userId, 'services') || []).filter((s) => s.id !== id))
  },

  // ── Agendamentos ──
  async getAppointments(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('appointments').select('*').order('date').order('time')
      if (!error)
        return data.map((a) => ({
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
          : sb.from('appointments').update(r).eq('id', appt.id).select().single()
      let { data, error } = await run(row)
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
      if (!error && data) return { ...mapRow(data), _new: undefined }
    }
    const all = uget(userId, 'appointments') || []
    const exists = all.find((a) => a.id === appt.id)
    const merged = exists ? all.map((a) => (a.id === appt.id ? appt : a)) : [...all, appt]
    uset(userId, 'appointments', merged)
    const { _new: __n, ...rest } = appt
    return {
      ...rest,
      notificationStatus: rest.notificationStatus ?? 'none',
      reminderSentAt: rest.reminderSentAt ?? null,
    }
  },

  async deleteAppointment(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('appointments').delete().eq('id', id); return }
    uset(userId, 'appointments', (uget(userId, 'appointments') || []).filter((a) => a.id !== id))
  },

  // ── Config ──
  async getConfig(userId) {
    const sb = getClient()
    if (sb) {
      const { data } = await sb.from('config').select('*').single()
      if (data) {
        return {
          avgCost: Number(data.avg_cost ?? 12.35),
          professionalWhatsapp: data.professional_whatsapp || '',
        }
      }
    }
    const stored = uget(userId, 'config')
    return {
      avgCost: Number(stored?.avgCost ?? 12.35),
      professionalWhatsapp: stored?.professionalWhatsapp || '',
    }
  },

  async saveConfig(userId, config) {
    const sb = getClient()
    if (sb) {
      const row = {
        user_id: userId,
        avg_cost: config.avgCost,
        professional_whatsapp: config.professionalWhatsapp || null,
      }
      let { error } = await sb.from('config').upsert(row, { onConflict: 'user_id' })
      if (error) {
        // Backward-compatible fallback for environments where the column
        // professional_whatsapp has not been created yet.
        const fallback = await sb
          .from('config')
          .upsert({ user_id: userId, avg_cost: config.avgCost }, { onConflict: 'user_id' })
        error = fallback.error
      }
    }
    uset(userId, 'config', config)
  },

  // ── Estoque ──
  async getInventoryItems(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('inventory_items').select('*').order('name')
      if (!error) {
        return data.map((i) => ({
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
        : await sb.from('inventory_items').update(row).eq('id', item.id).select().single()
      if (!error && data) {
        return {
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
      }
    }
    const all = uget(userId, 'inventory_items') || []
    const exists = all.find((i) => i.id === item.id)
    const updated = exists ? all.map((i) => (i.id === item.id ? item : i)) : [...all, item]
    uset(userId, 'inventory_items', updated)
    return item
  },

  async deleteInventoryItem(userId, id) {
    const sb = getClient()
    if (sb) { await sb.from('inventory_items').delete().eq('id', id); return }
    uset(userId, 'inventory_items', (uget(userId, 'inventory_items') || []).filter((i) => i.id !== id))
  },

  async getInventoryMovements(userId) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.from('inventory_movements').select('*').order('created_at', { ascending: false })
      if (!error) {
        return data.map((m) => ({
          id: m.id,
          itemId: m.item_id,
          type: m.type || 'in',
          qty: Number(m.qty || 0),
          reason: m.reason || '',
          createdAt: m.created_at || new Date().toISOString(),
        }))
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
        return {
          id: data.id,
          itemId: data.item_id,
          type: data.type || 'in',
          qty: Number(data.qty || 0),
          reason: data.reason || '',
          createdAt: data.created_at || new Date().toISOString(),
        }
      }
    }
    const all = uget(userId, 'inventory_movements') || []
    const updated = [movement, ...all]
    uset(userId, 'inventory_movements', updated)
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
