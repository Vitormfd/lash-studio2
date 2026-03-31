import { createClient } from '@supabase/supabase-js'

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────────────────────
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
        }))
    }
    return uget(userId, 'appointments') || []
  },

  async saveAppointment(userId, appt) {
    const sb = getClient()
    if (sb) {
      const row = {
        id: appt.id,
        user_id: userId,
        client_id: appt.clientId || null,
        service_id: appt.serviceId || null,
        date: appt.date,
        time: appt.time,
        value: appt.value || null,
        notes: appt.notes || '',
        status: appt.status || 'confirmed',
        blocked: appt.blocked || false,
        duration_minutes: appt.durationMinutes != null && Number(appt.durationMinutes) > 0
          ? Number(appt.durationMinutes) : 60,
      }
      const { data, error } = appt._new
        ? await sb.from('appointments').insert(row).select().single()
        : await sb.from('appointments').update(row).eq('id', appt.id).select().single()
      if (!error && data) return { ...appt, id: data.id }
    }
    const all = uget(userId, 'appointments') || []
    const exists = all.find((a) => a.id === appt.id)
    const updated = exists ? all.map((a) => (a.id === appt.id ? appt : a)) : [...all, appt]
    uset(userId, 'appointments', updated)
    return appt
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
      if (data) return { avgCost: data.avg_cost }
    }
    return uget(userId, 'config') || { avgCost: 12.35 }
  },

  async saveConfig(userId, config) {
    const sb = getClient()
    if (sb) {
      await sb.from('config').upsert({ user_id: userId, avg_cost: config.avgCost }, { onConflict: 'user_id' })
    }
    uset(userId, 'config', config)
  },
}
