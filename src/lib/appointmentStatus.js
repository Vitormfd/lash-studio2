/** Status de agendamento — único lugar para labels e cores (UI + agenda + financeiro) */

export const APPOINTMENT_STATUS = {
  pending: 'pending',
  confirmed: 'confirmed',
  done: 'done',
  cancelled: 'cancelled',
}

export const statusMeta = (status) => {
  switch (status) {
    case 'pending':
      return { label: 'Pendente', bg: '#F3F4F6', border: '#D1D5DB', text: '#4B5563', dot: '#9CA3AF' }
    case 'confirmed':
      return { label: 'Confirmado', bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8', dot: '#3B82F6' }
    case 'done':
      return { label: 'Concluído', bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46', dot: '#10B981' }
    case 'cancelled':
      return { label: 'Cancelado', bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', dot: '#EF4444' }
    default:
      return { label: status || '—', bg: '#F3F4F6', border: '#E5E7EB', text: '#6B7280', dot: '#9CA3AF' }
  }
}

/** Próximo status ao concluir a partir de pendente/confirmado */
export const statusAfterDone = () => 'done'

/** Ao reabrir conclusão */
export const statusAfterReopen = () => 'confirmed'
