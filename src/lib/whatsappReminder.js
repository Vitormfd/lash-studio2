export const DEFAULT_WHATSAPP_REMINDER_TEMPLATE =
  'Oi, {nome}! Passando para te lembrar do seu atendimento no dia {data} às {hora}. Te espero ✨🤍'

export const DEFAULT_WHATSAPP_AUTO_TEMPLATE =
  'Oi, {nome}! Lembrete do seu atendimento no dia {data} às {hora}. Se precisar remarcar, é só responder esta mensagem ✨'

/** Mensagem do lembrete automático. Vazia = usa a mensagem manual (comportamento antigo). */
export function resolveWhatsappAutoTemplate(autoTemplate, manualTemplate) {
  return String(autoTemplate || '').trim() || String(manualTemplate || '').trim() || DEFAULT_WHATSAPP_AUTO_TEMPLATE
}

export const WHATSAPP_REMINDER_PLACEHOLDERS = [
  { token: '{nome}', label: 'primeiro nome' },
  { token: '{nomeCompleto}', label: 'nome completo' },
  { token: '{data}', label: 'data' },
  { token: '{hora}', label: 'horário' },
  { token: '{servico}', label: 'serviço' },
]

export const DEFAULT_MAINTENANCE_TEMPLATE =
  'Oi, {nome}! Já está na hora da sua manutenção ✨ Quer que eu reserve um horário pra você esta semana?'

export const MAINTENANCE_PLACEHOLDERS = [
  { token: '{nome}', label: 'primeiro nome' },
  { token: '{nomeCompleto}', label: 'nome completo' },
  { token: '{servico}', label: 'último serviço' },
  { token: '{dias}', label: 'dias desde a última visita' },
]

/** Mesma regra do servidor (whatsapp-reminders) — mantenha as duas iguais. */
export function buildMaintenanceText(template, vars = {}) {
  const fullName = String(vars.fullName || '').trim()
  const firstName = fullName.split(/\s+/)[0] || ''
  const values = {
    nomecompleto: fullName,
    nome: firstName,
    servico: String(vars.service || '').trim(),
    serviço: String(vars.service || '').trim(),
    dias: vars.days != null ? String(vars.days) : '',
  }
  const text = String(template || '').trim() || DEFAULT_MAINTENANCE_TEMPLATE
  return text.replace(/\{(nomeCompleto|nome|servi[cç]o|dias)\}/gi, (_, key) => values[String(key).toLowerCase()] ?? '')
}

export function normalizeWhatsappReminderTemplate(value) {
  const text = String(value || '').trim()
  return text || DEFAULT_WHATSAPP_REMINDER_TEMPLATE
}

export function buildWhatsappReminderText(template, vars = {}) {
  const firstName = String(vars.firstName || '').trim()
  const fullName = String(vars.fullName || '').trim() || firstName
  const values = {
    nomecompleto: fullName,
    nome: firstName,
    data: String(vars.date || '').trim(),
    hora: String(vars.time || '').trim(),
    servico: String(vars.service || '').trim(),
    serviço: String(vars.service || '').trim(),
  }

  return normalizeWhatsappReminderTemplate(template).replace(
    /\{(nomeCompleto|nome|data|hora|servi[cç]o)\}/gi,
    (_, key) => values[String(key).toLowerCase()] ?? '',
  )
}
