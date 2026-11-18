/**
 * Planilhas (CSV) para a profissional baixar os próprios dados.
 * Separador ";" e vírgula decimal: abre certo no Excel em português e no Google Planilhas.
 */

const cell = (value) => {
  if (value == null) return ''
  let s = typeof value === 'number' ? String(value).replace('.', ',') : String(value)
  // Evita que o Excel trate o texto como fórmula (=, +, -, @ no começo).
  if (/^[=+\-@\t\r]/.test(s) && typeof value !== 'number') s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (headers, rows) =>
  '﻿' + [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')

const STATUS_LABEL = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  done: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Faltou',
  blocked: 'Bloqueio',
}
const PAYMENT_LABEL = { cash: 'Dinheiro', pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito' }

const dmy = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

export const clientsCsv = (clients) =>
  toCsv(
    ['Nome', 'Telefone', 'Aniversário', 'Observações', 'Manutenção (dias)', 'Cadastrada em'],
    (clients || []).map((c) => [
      c.name,
      c.phone,
      c.birthday ? `${c.birthday.slice(3)}/${c.birthday.slice(0, 2)}` : '',
      c.notes,
      c.maintenanceIntervalDays ?? '',
      dmy(c.createdAt),
    ]),
  )

export const appointmentsCsv = (appointments, clients, services) => {
  const clientName = new Map((clients || []).map((c) => [c.id, c.name]))
  const serviceName = new Map((services || []).map((s) => [s.id, s.name]))
  return toCsv(
    ['Data', 'Horário', 'Cliente', 'Serviço', 'Situação', 'Preço', 'Valor pago', 'Forma de pagamento', 'Sinal', 'Observações'],
    (appointments || [])
      .filter((a) => !a.blocked)
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .map((a) => [
        dmy(a.date),
        String(a.time || '').slice(0, 5),
        clientName.get(a.clientId) || '',
        serviceName.get(a.serviceId) || '',
        STATUS_LABEL[a.status] || a.status || '',
        a.value != null && a.value !== '' ? Number(a.value) : '',
        a.paymentValue != null ? Number(a.paymentValue) : '',
        PAYMENT_LABEL[a.paymentMethod] || '',
        a.depositAmount ? `${a.depositStatus === 'paid' ? 'Pago' : 'Pendente'} (${String(Number(a.depositAmount).toFixed(2)).replace('.', ',')})` : '',
        a.notes,
      ]),
  )
}

export const expensesCsv = (expenses) =>
  toCsv(
    ['Data', 'Valor', 'Categoria', 'Forma de pagamento', 'Observações'],
    (expenses || [])
      .slice()
      .sort((a, b) => String(a.expenseDate).localeCompare(String(b.expenseDate)))
      .map((e) => [
        dmy(e.expenseDate),
        Number(e.amount || 0),
        e.category === 'materials' ? 'Materiais' : 'Outro',
        PAYMENT_LABEL[e.paymentMethod] || '',
        e.notes,
      ]),
  )

export const downloadText = (filename, text, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
