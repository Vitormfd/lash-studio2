/** Cálculos puros de manutenção e ranking de clientes */

import { toLocalYmd } from './dashboardStats'
import { buildMaintenanceText } from './whatsappReminder'

/** Intervalo padrão de manutenção (dias) quando a cliente não tem um período próprio */
export const DEFAULT_MAINTENANCE_DAYS = {
  lash: 21,
  nail: 21,
  sobrancelha: 30,
  estetica: 30,
  barbeiro: 21,
}

/** Atalhos do período por cliente (dias) */
export const MAINTENANCE_INTERVAL_PRESETS = [15, 20, 21, 25, 30]

/** Perfis sem lembrete automático de manutenção pelo WhatsApp (mesma regra do servidor) */
const MAINTENANCE_AUTO_EXCLUDED_TYPES = new Set(['barbeiro'])

export const supportsMaintenanceAutoReminder = (professionalType) =>
  !MAINTENANCE_AUTO_EXCLUDED_TYPES.has(professionalType)

/** Serviço de exemplo para a prévia da mensagem de manutenção */
export const MAINTENANCE_PREVIEW_SERVICE = {
  lash: 'Volume brasileiro',
  nail: 'Alongamento em gel',
  sobrancelha: 'Design com henna',
  estetica: 'Limpeza de pele',
}

/** Avisa a partir de N dias antes de vencer */
export const MAINTENANCE_HEADS_UP_DAYS = 3

/** Cliente ativa = último atendimento concluído há no máximo N dias */
export const MAINTENANCE_ACTIVE_DAYS = 60

export const MAINTENANCE_MIN_INTERVAL = 7
export const MAINTENANCE_MAX_INTERVAL = 120

const daysBetween = (fromYmd, toYmd) =>
  Math.round((new Date(`${toYmd}T12:00`) - new Date(`${fromYmd}T12:00`)) / 86400000)

const addDays = (ymd, days) => {
  const d = new Date(`${ymd}T12:00`)
  d.setDate(d.getDate() + days)
  return toLocalYmd(d)
}

const isDone = (a) => !a.blocked && a.status === 'done'

export const getDefaultMaintenanceDays = (professionalType) => DEFAULT_MAINTENANCE_DAYS[professionalType] || 21

/** Período próprio da cliente (dias) ou null se ela segue o padrão */
export const getCustomMaintenanceDays = (client) => {
  const n = Number(client?.maintenanceIntervalDays)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(MAINTENANCE_MAX_INTERVAL, Math.max(MAINTENANCE_MIN_INTERVAL, Math.round(n)))
}

/**
 * Situação de manutenção de cada cliente com pelo menos um atendimento concluído.
 * O intervalo é o período próprio da cliente ou o padrão da profissão (21 dias para lash).
 * A média real entre visitas vem só como referência para ajustar o período.
 */
export const getMaintenanceOverview = (clients, appointments, professionalType, today = toLocalYmd()) => {
  const fallback = getDefaultMaintenanceDays(professionalType)
  const doneByClient = new Map()
  const nextByClient = new Map()

  for (const a of appointments) {
    if (!a.clientId || a.blocked) continue
    if (a.status !== 'cancelled' && a.status !== 'done' && a.date >= today) {
      const cur = nextByClient.get(a.clientId)
      if (!cur || (a.date + a.time).localeCompare(cur.date + cur.time) < 0) nextByClient.set(a.clientId, a)
    }
    if (isDone(a)) {
      if (!doneByClient.has(a.clientId)) doneByClient.set(a.clientId, [])
      doneByClient.get(a.clientId).push(a)
    }
  }

  const rows = []
  for (const client of clients) {
    const done = doneByClient.get(client.id)
    if (!done) continue
    done.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

    let historyAverage = null
    if (done.length >= 2) {
      const gaps = []
      for (let i = 1; i < done.length; i += 1) {
        const gap = daysBetween(done[i - 1].date, done[i].date)
        if (gap > 0) gaps.push(gap)
      }
      if (gaps.length) historyAverage = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
    }

    const custom = getCustomMaintenanceDays(client)
    const interval = custom || fallback
    const last = done[done.length - 1]
    const dueDate = addDays(last.date, interval)

    rows.push({
      client,
      lastAppointment: last,
      nextAppointment: nextByClient.get(client.id) || null,
      interval,
      isCustomInterval: !!custom,
      historyAverage,
      dueDate,
      daysUntilDue: daysBetween(today, dueDate),
      daysSinceLast: daysBetween(last.date, today),
    })
  }

  return rows
}

/** Venceu ou vence em breve e ainda não tem horário marcado */
export const isMaintenanceDue = (row) => !row.nextAppointment && row.daysUntilDue <= MAINTENANCE_HEADS_UP_DAYS

export const isMaintenanceActive = (row) => row.daysSinceLast <= MAINTENANCE_ACTIVE_DAYS

/** Mais próximas da manutenção primeiro (atrasadas no topo); quem já tem horário marcado vai para o fim */
export const sortByMaintenanceProximity = (rows) =>
  [...rows].sort((a, b) =>
    Number(!!a.nextAppointment) - Number(!!b.nextAppointment) || a.daysUntilDue - b.daysUntilDue)

export const RANKING_PERIOD_OPTIONS = [
  { value: 'month', label: 'Este mês' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '12 meses' },
  { value: 'all', label: 'Sempre' },
]

const periodStart = (period, now = new Date()) => {
  if (period === 'month') return toLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1))
  if (period === '6m') return toLocalYmd(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()))
  if (period === '12m') return toLocalYmd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()))
  return null
}

/** Ranking por quantidade de serviços concluídos; desempate pelo valor gasto */
export const getClientRanking = (clients, appointments, period = 'all', now = new Date()) => {
  const start = periodStart(period, now)
  const stats = new Map()

  for (const a of appointments) {
    if (!a.clientId || !isDone(a)) continue
    if (start && a.date < start) continue
    const s = stats.get(a.clientId) || { count: 0, total: 0, lastDate: '' }
    s.count += 1
    s.total += Number(a.value || 0)
    if (a.date > s.lastDate) s.lastDate = a.date
    stats.set(a.clientId, s)
  }

  return clients
    .filter((c) => stats.has(c.id))
    .map((c) => ({ client: c, ...stats.get(c.id) }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
}

/** Link de WhatsApp com a mesma mensagem do lembrete automático de manutenção */
export const buildMaintenanceWhatsappUrl = (client, { template, service, days } = {}) => {
  const digits = String(client?.phone || '').replace(/\D/g, '')
  if (!digits) return ''
  const phone = digits.startsWith('55') ? digits : `55${digits}`
  const text = buildMaintenanceText(template, { fullName: client?.name, service, days })
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

/** O lembrete automático já saiu para esta visita? */
export const wasMaintenanceReminderSent = (alert) =>
  !!alert?.client?.maintenanceReminderFor &&
  String(alert.client.maintenanceReminderFor).slice(0, 10) === alert.lastAppointment?.date
