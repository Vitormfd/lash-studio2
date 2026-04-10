/** Mensagens dinâmicas — reutilizáveis no app e em Edge Functions (copiar texto se necessário) */

export const morningPushBody = (clientCount) => {
  if (clientCount > 0) {
    const n = clientCount === 1 ? '1 cliente' : `${clientCount} clientes`
    return `Bom dia! Hoje você tem ${n} agendadas 💅`
  }
  return 'Bom dia! Que tal organizar sua agenda hoje? ✨'
}

export const nextAppointmentPushBody = (minutesBefore = 60) =>
  minutesBefore === 60
    ? 'Falta 1h pro seu próximo atendimento ⏰'
    : `Faltam ${minutesBefore} min pro seu próximo atendimento ⏰`

export const progressPushBody = (revenueDone) =>
  `Você já faturou R$${Number(revenueDone).toFixed(2).replace('.', ',')} hoje 💰`

/** Linha de “personalidade” no dashboard (contexto do dia) */
export const getPersonalityMessage = (summary) => {
  const count = summary?.count ?? 0
  const done = Number(summary?.revenueDone ?? 0)
  const scheduled = Number(summary?.revenueScheduled ?? 0)

  if (count >= 6) return 'Agenda cheia hoje 🔥'
  if (count === 0) return 'Dia tranquilo hoje ✨'
  if (done >= 400 || (done >= 150 && scheduled === 0)) return 'Você está indo bem hoje 💪'
  if (done > 0) return 'Você está indo bem hoje 💪'
  if (count >= 3) return 'Ótimo ritmo hoje — respira e arrasa 💅'
  return 'Ótimo dia para brilhar ✨'
}
