/** Cálculos puros de manutenção e ranking de clientes */

import { toLocalYmd } from './dashboardStats'
import { buildMaintenanceText } from './whatsappReminder'

/** Intervalo padrão de manutenção (dias) quando a cliente ainda não tem histórico suficiente */
export const DEFAULT_MAINTENANCE_DAYS = {
  lash: 21,
  nail: 21,
  sobrancelha: 30,
  estetica: 30,
  barbeiro: 21,
}

/** Avisa a partir de N dias antes de vencer */
export const MAINTENANCE_HEADS_UP_DAYS = 3

const MIN_INTERVAL = 7
const MAX_INTERVAL = 120

const daysBetween = (fromYmd, toYmd) =>
  Math.round((new Date(`${toYmd}T12:00`) - new Date(`${fromYmd}T12:00`)) / 86400000)

const addDays = (ymd, days) => {
  const d = new Date(`${ymd}T12:00`)
  d.setDate(d.getDate() + days)
  return toLocalYmd(d)
}

const isDone = (a) => !a.blocked && a.status === 'done'

/**
 * Clientes cuja manutenção venceu ou vence em breve e que não têm horário futuro marcado.
 * O intervalo usa a média real da cliente (2+ visitas) ou o padrão da profissão.
 */
export const getMaintenanceAlerts = (clients, appointments, professionalType, today = toLocalYmd()) => {
  const fallback = DEFAULT_MAINTENANCE_DAYS[professionalType] || 21
  const doneByClient = new Map()
  const hasFuture = new Set()

  for (const a of appointments) {
    if (!a.clientId || a.blocked) continue
    if (a.status !== 'cancelled' && a.status !== 'done' && a.date >= today) hasFuture.add(a.clientId)
    if (isDone(a)) {
      if (!doneByClient.has(a.clientId)) doneByClient.set(a.clientId, [])
      doneByClient.get(a.clientId).push(a)
    }
  }

  const alerts = []
  for (const client of clients) {
    const done = doneByClient.get(client.id)
    if (!done || hasFuture.has(client.id)) continue
    done.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

    let interval = fallback
    let basedOnHistory = false
    if (done.length >= 2) {
      const gaps = []
      for (let i = 1; i < done.length; i += 1) {
        const gap = daysBetween(done[i - 1].date, done[i].date)
        if (gap > 0) gaps.push(gap)
      }
      if (gaps.length) {
        const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length
        interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(avg)))
        basedOnHistory = true
      }
    }

    const last = done[done.length - 1]
    const dueDate = addDays(last.date, interval)
    const daysUntilDue = daysBetween(today, dueDate)
    if (daysUntilDue > MAINTENANCE_HEADS_UP_DAYS) continue

    alerts.push({
      client,
      lastAppointment: last,
      interval,
      basedOnHistory,
      dueDate,
      daysUntilDue,
      daysSinceLast: daysBetween(last.date, today),
    })
  }

  // Mais atrasadas primeiro
  return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}

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
