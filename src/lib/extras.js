/**
 * Recursos extras (opcionais). Todos começam desligados: nada muda para quem não ligar.
 * Ficam em config.extras (jsonb) — exceto o apelido do link, que é config.booking_slug (único).
 */

export const DEFAULT_CONSENT_TEXT =
  'Declaro que as informações da minha ficha são verdadeiras, que fui informada sobre o procedimento, ' +
  'seus cuidados e possíveis reações, e autorizo a realização do atendimento. ' +
  'Autorizo também o registro de fotos do antes e depois para meu histórico.'

export const DEFAULT_BIRTHDAY_TEMPLATE =
  'Feliz aniversário, {nome}! 🎉 Que seu dia seja lindo. Para comemorar, seu próximo horário comigo tem um mimo especial. Quer marcar?'

export const DEFAULT_BOOKING_POLICY =
  'Chegue com 5 minutos de antecedência. Se precisar desmarcar, avise com pelo menos 24 horas.'

export const PIX_KEY_TYPES = [
  { id: 'phone', label: 'Celular' },
  { id: 'cpf', label: 'CPF ou CNPJ' },
  { id: 'email', label: 'E-mail' },
  { id: 'random', label: 'Chave aleatória' },
]

/** Formas de pagamento do app (mesmas chaves de appointment.paymentMethod). */
export const FEE_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'debit_card', label: 'Cartão de débito' },
  { id: 'credit_card', label: 'Cartão de crédito' },
  { id: 'cash', label: 'Dinheiro' },
]

const num = (v, fallback = 0) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max)

export const normalizeExtras = (raw) => {
  const e = raw && typeof raw === 'object' ? raw : {}
  const profile = e.profile || {}
  const deposit = e.deposit || {}
  const records = e.clientRecords || {}
  const birthdays = e.birthdays || {}
  const fin = e.financeExtras || {}
  const fees = fin.fees || {}
  return {
    profile: {
      enabled: !!profile.enabled,
      businessName: str(profile.businessName, 60),
      address: str(profile.address, 160),
      instagram: str(profile.instagram, 40).replace(/^@+/, ''),
      policy: str(profile.policy, 600),
    },
    deposit: {
      enabled: !!deposit.enabled,
      type: deposit.type === 'percent' ? 'percent' : 'fixed',
      value: Math.max(0, num(deposit.value)),
      pixKeyType: PIX_KEY_TYPES.some((t) => t.id === deposit.pixKeyType) ? deposit.pixKeyType : 'phone',
      pixKey: str(deposit.pixKey, 77),
      holderName: str(deposit.holderName, 60),
      city: str(deposit.city, 40),
    },
    clientRecords: {
      enabled: !!records.enabled,
      consentText: str(records.consentText, 2000),
    },
    birthdays: {
      enabled: !!birthdays.enabled,
      template: str(birthdays.template, 600),
    },
    financeExtras: {
      enabled: !!fin.enabled,
      fixedCosts: (Array.isArray(fin.fixedCosts) ? fin.fixedCosts : [])
        .map((c) => ({ id: str(c?.id, 40) || Math.random().toString(36).slice(2, 10), name: str(c?.name, 60), amount: Math.max(0, num(c?.amount)) }))
        .filter((c) => c.name || c.amount > 0)
        .slice(0, 30),
      fees: Object.fromEntries(FEE_METHODS.map((m) => [m.id, Math.min(30, Math.max(0, num(fees[m.id])))])),
    },
  }
}

export const getExtras = (config) => normalizeExtras(config?.extras)

// ─── Link curto ────────────────────────────────────────────────────────────────

/** "Estúdio da Ana!" → "estudio-da-ana" */
export const slugify = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')

/** Mesma regra do banco: 3–40 caracteres, letras minúsculas, números e hífen (sem hífen nas pontas). */
export const isValidSlug = (slug) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(String(slug || ''))

export const bookingLinkFor = (origin, userId, slug) =>
  slug ? `${origin}/agendar/${slug}` : `${origin}/booking/${userId}`

// ─── Sinal ─────────────────────────────────────────────────────────────────────

/** Valor do sinal para um serviço (mesma conta do banco, em centavos inteiros). */
export const depositAmountFor = (deposit, servicePrice) => {
  if (!deposit?.enabled) return 0
  const price = Math.max(0, num(servicePrice))
  const raw = deposit.type === 'percent' ? (price * num(deposit.value)) / 100 : num(deposit.value)
  const capped = price > 0 ? Math.min(raw, price) : raw
  return Math.max(0, Math.round(capped * 100) / 100)
}

// ─── Aniversários ("MM-DD") ────────────────────────────────────────────────────

/** "05/03" ou "5/3" → "03-05" (dia/mês). Vazio → null. Inválido → undefined. */
export const parseBirthdayInput = (text) => {
  const t = String(text || '').trim()
  if (!t) return null
  const m = t.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*\d{2,4})?$/)
  if (!m) return undefined
  const day = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12 || day < 1) return undefined
  const maxDay = new Date(2024, month, 0).getDate() // 2024 é bissexto: aceita 29/02
  if (day > maxDay) return undefined
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const formatBirthday = (md) => {
  const m = String(md || '').match(/^(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[1]}` : ''
}

/**
 * Clientes que fazem aniversário de hoje até `days` dias à frente, ordenadas pela data.
 * Quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos.
 */
export const upcomingBirthdays = (clients, now = new Date(), days = 7) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isLeap = (y) => new Date(y, 1, 29).getMonth() === 1
  const out = []
  for (const c of clients || []) {
    const m = String(c?.birthday || '').match(/^(\d{2})-(\d{2})$/)
    if (!m) continue
    const month = Number(m[1]) - 1
    let day = Number(m[2])
    for (const year of [start.getFullYear(), start.getFullYear() + 1]) {
      const d = month === 1 && day === 29 && !isLeap(year) ? 28 : day
      const date = new Date(year, month, d)
      const diff = Math.round((date - start) / 86400000)
      if (diff >= 0 && diff <= days) {
        out.push({ client: c, daysAway: diff, date })
        break
      }
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || String(a.client.name).localeCompare(String(b.client.name)))
}

export const buildBirthdayText = (template, clientName) => {
  const first = String(clientName || '').trim().split(/\s+/)[0] || ''
  return String(template || DEFAULT_BIRTHDAY_TEMPLATE).replace(/\{nome\}/gi, first)
}

// ─── Custos fixos e taxas ──────────────────────────────────────────────────────

export const fixedCostsTotal = (financeExtras) =>
  financeExtras?.enabled ? (financeExtras.fixedCosts || []).reduce((s, c) => s + num(c.amount), 0) : 0

/** Taxa de um pagamento: valor × % da forma de pagamento. */
export const paymentFeeFor = (financeExtras, method, amount) => {
  if (!financeExtras?.enabled) return 0
  const pct = num(financeExtras.fees?.[method || 'cash'])
  return Math.round(num(amount) * pct) / 100
}
