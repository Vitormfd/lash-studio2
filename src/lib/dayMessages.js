/** Mensagens dinamicas - reutilizaveis no app e em Edge Functions (copiar texto se necessario) */

const isBarberType = (professionalType) => professionalType === 'barbeiro'

export const morningPushBody = (clientCount, professionalType) => {
  const isBarber = isBarberType(professionalType)
  if (clientCount === 0) return 'Bom dia! Aproveita para organizar sua agenda e caprichar no atendimento \uD83D\uDC85'
  if (clientCount === 1) {
    return isBarber
      ? 'Bom dia! Voc\u00EA tem 1 corte hoje \u2014 faz bonito! \u2702\uFE0F'
      : 'Bom dia! Voc\u00EA tem 1 atendimento hoje \u2014 capricha! \uD83D\uDC85'
  }
  return isBarber
    ? `Bom dia! Hoje s\u00E3o ${clientCount} cortes na fila \u2014 bora! \u2702\uFE0F\uD83D\uDD25`
    : `Bom dia! Hoje s\u00E3o ${clientCount} atendimentos \u2014 que dia cheio de energia! \uD83D\uDC85\u2728`
}

export const nextAppointmentPushBody = (minutesBefore = 60, professionalType) => {
  const isBarber = isBarberType(professionalType)
  if (minutesBefore <= 15) {
    return isBarber
      ? `Faltam ${minutesBefore} min pro pr\u00F3ximo corte \u2014 prepara a tesoura! \u2702\uFE0F`
      : `Faltam ${minutesBefore} min pro pr\u00F3ximo atendimento \u2014 quase l\u00E1! \uD83D\uDC85`
  }
  if (minutesBefore === 60) {
    return isBarber
      ? 'Falta 1h pro seu pr\u00F3ximo corte. Se prepara! \u2702\uFE0F\u23F0'
      : 'Falta 1h pro seu pr\u00F3ximo atendimento. Bora se preparar! \uD83D\uDC85\u23F0'
  }
  return isBarber
    ? `Faltam ${minutesBefore} min pro seu pr\u00F3ximo corte \u23F0`
    : `Faltam ${minutesBefore} min pro seu pr\u00F3ximo atendimento \u23F0`
}

export const progressPushBody = (revenueDone) => {
  const value = Number(revenueDone)
  const formatted = value.toFixed(2).replace('.', ',')
  if (value >= 500) return `Uau! Voc\u00EA j\u00E1 faturou R$${formatted} hoje \uD83E\uDD11\uD83D\uDD25`
  if (value >= 200) return `Mandando bem! R$${formatted} faturados hoje \uD83D\uDCB0\u2728`
  return `Voc\u00EA j\u00E1 faturou R$${formatted} hoje \u2014 continua assim! \uD83D\uDCAA`
}

/** Linha de "personalidade" no dashboard (contexto do dia) */
export const getPersonalityMessage = (summary) => {
  const count = summary?.count ?? 0
  const done = Number(summary?.revenueDone ?? 0)
  const scheduled = Number(summary?.revenueScheduled ?? 0)

  if (count === 0) return 'Dia livre na agenda \u2014 respira e se organiza \u2728'
  if (count >= 8) return 'Agenda lotada hoje! Respira fundo e arrasa \uD83D\uDD25'
  if (count >= 6) return 'Dia cheio! Voc\u00EA consegue \uD83D\uDCAA\uD83D\uDD25'
  if (done >= 500) return 'Que dia incr\u00EDvel \u2014 voc\u00EA est\u00E1 mandando demais! \uD83E\uDD11'
  if (done >= 250 || (done >= 100 && scheduled === 0)) return 'Ótimo faturamento hoje, continua assim! \uD83D\uDCB0'
  if (done > 0 && count >= 3) return 'Ritmo perfeito \u2014 segue o fluxo! \u2728'
  if (done > 0) return 'Come\u00E7ou bem! O restante do dia \u00E9 seu \uD83D\uDC85'
  if (count >= 3) return 'Agenda animada hoje. Bora brilhar! \u2728'
  return '\u00D3timo dia para fazer bonito \uD83D\uDC85'
}