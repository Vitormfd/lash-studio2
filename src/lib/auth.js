import { getClient, local, uid } from './supabase'
import { toLocalYmd } from './dashboardStats'

const uset = (userId, key, val) => local.set(`u_${userId}_${key}`, val)
const DEMO_USER_ID = 'demo_user'

const ensureDemoSeed = () => {
  const hasSeed = local.get(`u_${DEMO_USER_ID}_demo_seeded`)
  if (hasSeed) return

  const clients = [
    { id: uid(), name: 'Marina Costa', phone: '(11) 98888-1001', notes: 'Prefere efeito fox eyes', createdAt: new Date().toISOString() },
    { id: uid(), name: 'Bianca Lima', phone: '(11) 97777-2222', notes: 'Sensibilidade leve', createdAt: new Date().toISOString() },
    { id: uid(), name: 'Patricia Rocha', phone: '(11) 96666-3333', notes: 'Retorno a cada 15 dias', createdAt: new Date().toISOString() },
  ]
  const services = [
    { id: uid(), name: 'Volume Brasileiro', price: 160, color: '#C17B82' },
    { id: uid(), name: 'Fio a Fio', price: 130, color: '#9B8FB8' },
    { id: uid(), name: 'Manutencao 15 dias', price: 90, color: '#7BAF9A' },
  ]
  const demoInventoryItemId = uid()

  const today = toLocalYmd(new Date())
  uset(DEMO_USER_ID, 'clients', clients)
  uset(DEMO_USER_ID, 'services', services)
  uset(DEMO_USER_ID, 'appointments', [
    { id: uid(), clientId: clients[0].id, serviceId: services[0].id, date: today, time: '09:00', value: 160, notes: 'Cliente confirmou no WhatsApp', status: 'confirmed', blocked: false, durationMinutes: 90 },
    { id: uid(), clientId: clients[1].id, serviceId: services[2].id, date: today, time: '12:30', value: 90, notes: '', status: 'pending', blocked: false, durationMinutes: 60 },
    { id: uid(), clientId: null, serviceId: null, date: today, time: '15:00', value: null, notes: 'Horario reservado para encaixe', status: 'blocked', blocked: true, durationMinutes: 60 },
  ])
  uset(DEMO_USER_ID, 'config', { avgCost: 12.35 })
  uset(DEMO_USER_ID, 'inventory_items', [
    { id: demoInventoryItemId, name: 'Cola Pro Fix', category: 'Cola', unit: 'un', costPrice: 58, sellPrice: 0, stock: 6, minStock: 3, supplier: 'BeautyLab', notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ])
  uset(DEMO_USER_ID, 'inventory_movements', [
    { id: uid(), itemId: demoInventoryItemId, type: 'out', qty: 2, reason: 'Uso semanal', createdAt: new Date().toISOString() },
  ])
  uset(DEMO_USER_ID, 'demo_seeded', true)
}

export const AUTH = {
  async createDemoSession() {
    ensureDemoSeed()
    return {
      userId: DEMO_USER_ID,
      name: 'Conta Demonstracao',
      email: 'demo@lashstudio.app',
      isDemo: true,
      demoExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    }
  },

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
