/** Cálculos puros para o dashboard — fácil de testar e reutilizar */

export const getTodayStr = (d = new Date()) => d.toISOString().slice(0, 10)

export const isRealAppointment = (a) => !a.blocked && a.status !== 'cancelled'

/** Agendamentos “ativos” no dia (não cancelados, não bloqueio) */
export const todayActiveList = (appointments, todayStr = getTodayStr()) =>
  appointments
    .filter((a) => a.date === todayStr && isRealAppointment(a))
    .sort((a, b) => a.time.localeCompare(b.time))

export const getTodaySummary = (appointments, todayStr = getTodayStr()) => {
  const today = todayActiveList(appointments, todayStr)
  const revenueScheduled = today
    .filter((a) => a.status === 'pending' || a.status === 'confirmed')
    .reduce((s, a) => s + Number(a.value || 0), 0)
  const revenueDone = today
    .filter((a) => a.status === 'done')
    .reduce((s, a) => s + Number(a.value || 0), 0)
  const uniqueClients = new Set(today.map((a) => a.clientId).filter(Boolean)).size
  return {
    count: today.length,
    uniqueClients,
    revenueScheduled,
    revenueDone,
    /** compat: “previsto” = o que ainda não foi concluído (pendente + confirmado) */
    revenue: revenueScheduled,
    appointments: today,
  }
}

/**
 * Próximo atendimento de hoje ainda não concluído (pendente ou confirmado).
 * Prefere o primeiro horário >= agora; se todos passaram, retorna o primeiro da lista ou null.
 */
export const getNextAppointmentToday = (appointments, todayStr = getTodayStr(), now = new Date()) => {
  const list = todayActiveList(appointments, todayStr).filter((a) => a.status !== 'done')
  if (list.length === 0) return null
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const a of list) {
    const parts = String(a.time || '00:00').slice(0, 5).split(':')
    const hh = Number(parts[0]) || 0
    const mm = Number(parts[1]) || 0
    const tMin = hh * 60 + mm
    if (tMin >= nowMin) return a
  }
  return list[0]
}
