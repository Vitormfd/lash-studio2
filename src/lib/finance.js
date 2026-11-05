/**
 * Regras do financeiro — único lugar para Painel, Financeiro, Relatórios e clientes.
 *
 * - Faturamento: só atendimentos concluídos, pelo valor realmente cobrado
 *   (payment_value; se não foi informado, o preço do atendimento).
 * - Previsto: atendimentos pendentes ou confirmados, pelo preço marcado.
 * - Datas sempre no fuso local (nunca toISOString, que usa UTC).
 */

import { getAppointmentCost } from './utils'
import { toLocalYmd } from './dashboardStats'

export const isDoneAppointment = (a) => !a.blocked && a.status === 'done'
export const isScheduledAppointment = (a) => !a.blocked && (a.status === 'pending' || a.status === 'confirmed')

/** Valor que entrou de fato: o pago, se informado; senão, o preço do atendimento. */
export const paidAmount = (a) => {
  const paid = a.paymentValue != null && a.paymentValue !== '' ? Number(a.paymentValue) : Number(a.value || 0)
  return Number.isFinite(paid) ? paid : 0
}

export const scheduledAmount = (a) => {
  const v = Number(a.value || 0)
  return Number.isFinite(v) ? v : 0
}

/** Primeiro dia do mês deslocado em `offset` meses (sem pular meses nos dias 29–31). */
export const shiftMonth = (offset = 0, now = new Date()) => new Date(now.getFullYear(), now.getMonth() + offset, 1)

/** "YYYY-MM" no fuso local. */
export const monthKey = (d = new Date()) => toLocalYmd(d).slice(0, 7)

/**
 * Resumo financeiro de um mês ("YYYY-MM").
 * O custo estimado vale só para atendimentos concluídos (o material é gasto quando atende).
 */
export const summarizeMonth = ({ appointments = [], services = [], avgCost = 0, cashExpenses = [], month }) => {
  const inMonth = (a) => String(a.date || '').startsWith(month)
  const done = appointments.filter((a) => isDoneAppointment(a) && inMonth(a))
  const scheduled = appointments.filter((a) => isScheduledAppointment(a) && inMonth(a))

  const revenue = done.reduce((s, a) => s + paidAmount(a), 0)
  const expected = scheduled.reduce((s, a) => s + scheduledAmount(a), 0)
  const cost = done.reduce((s, a) => s + getAppointmentCost(a, services, avgCost), 0)
  const expenses = cashExpenses.filter((e) => String(e.expenseDate || '').startsWith(month))
  const materialsOut = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const profit = revenue - cost - materialsOut

  return {
    done,
    scheduled,
    revenue,
    expected,
    cost,
    expenses,
    materialsOut,
    profit,
    count: done.length,
    avgTicket: done.length ? revenue / done.length : 0,
  }
}

/**
 * Faturamento por serviço, incluindo um grupo para atendimentos de serviços apagados,
 * para a soma da lista sempre fechar com o total.
 */
export const revenueByService = (doneAppointments, services) => {
  const byId = new Map()
  for (const a of doneAppointments) {
    const key = services.some((s) => s.id === a.serviceId) ? a.serviceId : '__removed__'
    const cur = byId.get(key) || { total: 0, count: 0 }
    cur.total += paidAmount(a)
    cur.count += 1
    byId.set(key, cur)
  }
  const rows = services
    .filter((s) => byId.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, ...byId.get(s.id) }))
  if (byId.has('__removed__')) rows.push({ id: '__removed__', name: 'Serviço removido', ...byId.get('__removed__') })
  return rows.sort((a, b) => b.total - a.total)
}

/**
 * Intervalo [início, fim] (YYYY-MM-DD, local) dos períodos dos Relatórios.
 * Semana, Mês e Ano terminam hoje: o futuro não entra no faturamento.
 */
export const reportRange = (period, now = new Date(), customStart = '', customEnd = '') => {
  const today = toLocalYmd(now)
  if (period === 'custom') {
    if (!customStart || !customEnd) return null
    return customStart <= customEnd ? [customStart, customEnd] : [customEnd, customStart]
  }
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  // Mesmo dia do mês/ano anterior; se não existir (ex.: 31/03 → 31/02), usa o último dia daquele mês.
  const sameDayBack = (year, month) => new Date(year, month, Math.min(d, new Date(year, month + 1, 0).getDate()))
  let start
  if (period === 'week') start = new Date(y, m, d - 6)
  else if (period === 'month') start = sameDayBack(y, m - 1)
  else start = sameDayBack(y - 1, m)
  return [toLocalYmd(start), today]
}
