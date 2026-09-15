export const DEFAULT_WHATSAPP_REMINDER_TEMPLATE =
  'Oi, {nome}! Passando para te lembrar do seu atendimento no dia {data} às {hora}. Te espero ✨🤍'

export const WHATSAPP_REMINDER_PLACEHOLDERS = [
  { token: '{nome}', label: 'primeiro nome' },
  { token: '{nomeCompleto}', label: 'nome completo' },
  { token: '{data}', label: 'data' },
  { token: '{hora}', label: 'horário' },
  { token: '{servico}', label: 'serviço' },
]

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
