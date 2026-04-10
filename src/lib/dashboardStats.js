/** Cálculos puros para o dashboard — fácil de testar e reutilizar */

export const getTodayStr = (d = new Date()) => d.toISOString().slice(0, 10)

export const isRealAppointment = (a) => !a.blocked && a.status !== 'cancelled'

export const getTodaySummary = (appointments, todayStr = getTodayStr()) => {
  const today = appointments.filter((a) => a.date === todayStr && isRealAppointment(a))
  const revenue = today.reduce((s, a) => s + Number(a.value || 0), 0)
  const uniqueClients = new Set(today.map((a) => a.clientId).filter(Boolean)).size
  return {
    count: today.length,
    uniqueClients,
    revenue,
    appointments: today,
  }
}
