import { getClient, local, uid } from './supabase'
import { toLocalYmd } from './dashboardStats'
import { DEFAULT_PROFESSIONAL_TYPE, normalizeProfessionalType } from './domain'

const uset = (userId, key, val) => local.set(`u_${userId}_${key}`, val)
const DEMO_USER_ID = 'demo_user'

const STARTER_CONTENT_BY_TYPE = {
  lash: {
    clients: [
      { name: 'Marina Costa', phone: '(11) 98888-1001', notes: 'Prefere efeito mais marcado' },
      { name: 'Bianca Lima', phone: '(11) 97777-2222', notes: 'Sensibilidade leve na região dos olhos' },
      { name: 'Patricia Rocha', phone: '(11) 96666-3333', notes: 'Costuma retornar a cada 15 dias' },
    ],
    services: [
      { name: 'Volume brasileiro', price: 160, color: '#C17B82' },
      { name: 'Fio a fio', price: 130, color: '#9B8FB8' },
      { name: 'Manutenção', price: 90, color: '#7BAF9A' },
    ],
    inventoryItem: { name: 'Cola Pro Fix', category: 'Fixação', supplier: 'BeautyLab', costPrice: 58 },
  },
  nail: {
    clients: [
      { name: 'Marina Costa', phone: '(11) 98888-1001', notes: 'Prefere agenda no começo da manhã' },
      { name: 'Bianca Lima', phone: '(11) 97777-2222', notes: 'Gosta de tons claros' },
      { name: 'Patricia Rocha', phone: '(11) 96666-3333', notes: 'Retoca a cada 20 dias' },
    ],
    services: [
      { name: 'Alongamento em gel', price: 170, color: '#C17B82' },
      { name: 'Blindagem', price: 110, color: '#9B8FB8' },
      { name: 'Manutenção', price: 95, color: '#7BAF9A' },
    ],
    inventoryItem: { name: 'Gel construtor', category: 'Alongamento', supplier: 'BeautyLab', costPrice: 64 },
  },
  sobrancelha: {
    clients: [
      { name: 'Marina Costa', phone: '(11) 98888-1001', notes: 'Prefere acabamento natural' },
      { name: 'Bianca Lima', phone: '(11) 97777-2222', notes: 'Evita horários muito tarde' },
      { name: 'Patricia Rocha', phone: '(11) 96666-3333', notes: 'Retorna mensalmente' },
    ],
    services: [
      { name: 'Design de sobrancelha', price: 70, color: '#C17B82' },
      { name: 'Henna', price: 55, color: '#9B8FB8' },
      { name: 'Brow lamination', price: 130, color: '#7BAF9A' },
    ],
    inventoryItem: { name: 'Henna castanho médio', category: 'Coloração', supplier: 'BeautyLab', costPrice: 36 },
  },
  estetica: {
    clients: [
      { name: 'Marina Costa', phone: '(11) 98888-1001', notes: 'Busca sessões de manutenção mensal' },
      { name: 'Bianca Lima', phone: '(11) 97777-2222', notes: 'Prefere atendimento no almoço' },
      { name: 'Patricia Rocha', phone: '(11) 96666-3333', notes: 'Quer acompanhamento de rotina' },
    ],
    services: [
      { name: 'Limpeza de pele', price: 150, color: '#C17B82' },
      { name: 'Hidratação facial', price: 120, color: '#9B8FB8' },
      { name: 'Sessão de manutenção', price: 95, color: '#7BAF9A' },
    ],
    inventoryItem: { name: 'Máscara facial calmante', category: 'Skincare', supplier: 'BeautyLab', costPrice: 42 },
  },
}

const buildStarterSeed = (professionalType = DEFAULT_PROFESSIONAL_TYPE) => {
  const normalizedType = normalizeProfessionalType(professionalType)
  const preset = STARTER_CONTENT_BY_TYPE[normalizedType] || STARTER_CONTENT_BY_TYPE[DEFAULT_PROFESSIONAL_TYPE]
  const createdAt = new Date().toISOString()
  const clients = preset.clients.map((client) => ({ id: uid(), ...client, createdAt }))
  const services = preset.services.map((service) => ({ id: uid(), ...service }))
  const inventoryItemId = uid()
  const today = toLocalYmd(new Date())

  return {
    professionalType: normalizedType,
    clients,
    services,
    appointments: [
      {
        id: uid(),
        clientId: clients[0].id,
        serviceId: services[0].id,
        date: today,
        time: '09:00',
        value: services[0].price,
        notes: 'Cliente confirmou pelo WhatsApp',
        status: 'confirmed',
        blocked: false,
        durationMinutes: 90,
      },
      {
        id: uid(),
        clientId: clients[1].id,
        serviceId: services[2].id,
        date: today,
        time: '12:30',
        value: services[2].price,
        notes: '',
        status: 'pending',
        blocked: false,
        durationMinutes: 60,
      },
      {
        id: uid(),
        clientId: null,
        serviceId: null,
        date: today,
        time: '15:00',
        value: null,
        notes: 'Horário reservado para encaixe',
        status: 'blocked',
        blocked: true,
        durationMinutes: 60,
      },
    ],
    inventoryItemId,
    inventoryItems: [
      {
        id: inventoryItemId,
        name: preset.inventoryItem.name,
        category: preset.inventoryItem.category,
        unit: 'un',
        costPrice: preset.inventoryItem.costPrice,
        sellPrice: 0,
        stock: 6,
        minStock: 3,
        supplier: preset.inventoryItem.supplier,
        notes: '',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    inventoryMovements: [
      { id: uid(), itemId: inventoryItemId, type: 'out', qty: 2, reason: 'Uso semanal', createdAt },
    ],
  }
}

const ensureDemoSeed = (professionalType = DEFAULT_PROFESSIONAL_TYPE) => {
  const hasSeed = local.get(`u_${DEMO_USER_ID}_demo_seeded`)
  if (hasSeed) return
  const seed = buildStarterSeed(professionalType)
  const { clients, services, appointments, inventoryItems, inventoryMovements } = seed
  uset(DEMO_USER_ID, 'clients', clients)
  uset(DEMO_USER_ID, 'services', services)
  uset(DEMO_USER_ID, 'appointments', appointments)
  uset(DEMO_USER_ID, 'config', { avgCost: 12.35 })
  uset(DEMO_USER_ID, 'inventory_items', inventoryItems)
  uset(DEMO_USER_ID, 'inventory_movements', inventoryMovements)
  uset(DEMO_USER_ID, 'demo_seeded', true)
}

export const AUTH = {
  async createDemoSession(professionalType = DEFAULT_PROFESSIONAL_TYPE) {
    const normalizedType = normalizeProfessionalType(professionalType)
    ensureDemoSeed(normalizedType)
    return {
      userId: DEMO_USER_ID,
      name: 'Conta Demonstracao',
      email: 'demo@lashstudio.app',
      isDemo: true,
      professionalType: normalizedType,
      demoExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    }
  },

  async signUp(name, email, password, professionalType = DEFAULT_PROFESSIONAL_TYPE) {
    const normalizedType = normalizeProfessionalType(professionalType)
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { name, professional_type: normalizedType } },
      })
      if (error) throw new Error(error.message)
      return { userId: data.user.id, name, email, professionalType: normalizedType }
    }
    return AUTH._localRegister(name, email, password, normalizedType)
  },

  async signIn(email, password) {
    const sb = getClient()
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error('E-mail ou senha incorretos.')
      const name = data.user.user_metadata?.name || email.split('@')[0]
      return {
        userId: data.user.id,
        name,
        email,
        professionalType: normalizeProfessionalType(data.user.user_metadata?.professional_type),
      }
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
        return {
          userId: u.id,
          name: u.user_metadata?.name || u.email.split('@')[0],
          email: u.email,
          professionalType: normalizeProfessionalType(u.user_metadata?.professional_type),
        }
      }
      return null
    }
    const session = local.get('ls_session')
    if (!session) return null
    return {
      ...session,
      professionalType: normalizeProfessionalType(session.professionalType),
    }
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

  async _localRegister(name, email, password, professionalType = DEFAULT_PROFESSIONAL_TYPE) {
    const hash = await AUTH._hash(password)
    const users = AUTH._getUsers()
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase()))
      throw new Error('E-mail já cadastrado.')
    const normalizedType = normalizeProfessionalType(professionalType)
    const newUser = {
      id: uid(),
      name,
      email: email.toLowerCase(),
      passwordHash: hash,
      professionalType: normalizedType,
      createdAt: new Date().toISOString(),
    }
    local.set('ls_users', [...users, newUser])
    const userId = newUser.id
    const seed = buildStarterSeed(normalizedType)
    uset(userId, 'clients', seed.clients)
    uset(userId, 'services', seed.services)
    uset(userId, 'appointments', [seed.appointments[0]])
    uset(userId, 'config', { avgCost: 12.35 })
    return { userId, name, email: email.toLowerCase(), professionalType: normalizedType }
  },

  async _localLogin(email, password) {
    const hash = await AUTH._hash(password)
    const user = AUTH._getUsers().find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.passwordHash === hash
    )
    if (!user) throw new Error('E-mail ou senha incorretos.')
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      professionalType: normalizeProfessionalType(user.professionalType),
    }
  },

  async _hash(password) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  },
}
