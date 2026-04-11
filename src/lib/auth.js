import { getClient, local, uid } from './supabase'
import { toLocalYmd } from './dashboardStats'

const uset = (userId, key, val) => local.set(`u_${userId}_${key}`, val)

export const AUTH = {
  async signUp(name, email, password) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } })
      if (error) throw new Error(error.message)
      return { userId: data.user.id, name, email }
    }
    return AUTH._localRegister(name, email, password)
  },

  async signIn(email, password) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error('E-mail ou senha incorretos.')
      const name = data.user.user_metadata?.name || email.split('@')[0]
      return { userId: data.user.id, name, email }
    }
    return AUTH._localLogin(email, password)
  },

  async signOut() {
    const sb = getClient()
    if (sb) await sb.auth.signOut()
    local.del('ls_session')
  },

  async getSession() {
    const sb = getClient()
    if (sb) {
      const { data } = await sb.auth.getSession()
      if (data?.session?.user) {
        const u = data.session.user
        return { userId: u.id, name: u.user_metadata?.name || u.email.split('@')[0], email: u.email }
      }
      return null
    }
    return local.get('ls_session')
  },

  async changePassword(newPassword) {
    const sb = getClient()
    if (sb) {
      const { error } = await sb.auth.updateUser({ password: newPassword })
      if (error) throw new Error(error.message)
      return
    }
    throw new Error('Troca de senha local: faça logout e crie nova conta.')
  },

  saveLocalSession: (s) => local.set('ls_session', s),
  clearLocalSession: () => local.del('ls_session'),

  // ── Local fallback helpers ──
  _getUsers: () => local.get('ls_users') || [],

  async _localRegister(name, email, password) {
    const hash = await AUTH._hash(password)
    const users = AUTH._getUsers()
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase()))
      throw new Error('E-mail já cadastrado.')
    const newUser = { id: uid(), name, email: email.toLowerCase(), passwordHash: hash, createdAt: new Date().toISOString() }
    local.set('ls_users', [...users, newUser])
    const userId = newUser.id
    const clients = [
      { id: uid(), name: 'Ana Beatriz', phone: '(71) 99999-1111', notes: 'Prefere volume russo', createdAt: new Date().toISOString() },
      { id: uid(), name: 'Carla Mendes', phone: '(71) 98888-2222', notes: 'Alérgica a cola forte', createdAt: new Date().toISOString() },
    ]
    const services = [
      { id: uid(), name: 'Volume Russo', price: 180, color: '#C17B82' },
      { id: uid(), name: 'Clássico', price: 120, color: '#9B8FB8' },
      { id: uid(), name: 'Manutenção', price: 80, color: '#7BAF9A' },
    ]
    const today = toLocalYmd(new Date())
    uset(userId, 'clients', clients)
    uset(userId, 'services', services)
    uset(userId, 'appointments', [
      { id: uid(), clientId: clients[0].id, serviceId: services[0].id, date: today, time: '09:00', value: 180, notes: '', status: 'confirmed', blocked: false, durationMinutes: 120 },
    ])
    uset(userId, 'config', { avgCost: 12.35 })
    return { userId, name, email: email.toLowerCase() }
  },

  async _localLogin(email, password) {
    const hash = await AUTH._hash(password)
    const user = AUTH._getUsers().find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.passwordHash === hash
    )
    if (!user) throw new Error('E-mail ou senha incorretos.')
    return { userId: user.id, name: user.name, email: user.email }
  },

  async _hash(password) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  },
}
