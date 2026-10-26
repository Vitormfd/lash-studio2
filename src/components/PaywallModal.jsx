import { useState } from 'react'
import Modal from './Modal'
import { Btn } from './UI'
import Icon from './Icon'
import { openCheckout } from '../lib/billing'
import { APP_NAME } from '../lib/domain'

const PaywallModal = ({ open, onClose, subtitle, onUpgrade, trialDays = null, trialExpired = false }) => {
  const [loading, setLoading] = useState(false)

  const handleUpgrade = async () => {
    try {
      setLoading(true)
      if (typeof onUpgrade === 'function') {
        await onUpgrade()
      } else {
        await openCheckout()
      }
    } finally {
      setLoading(false)
    }
  }

  const inTrial = trialDays != null && !trialExpired
  const title = inTrial ? 'Assine o Easy Studio' : trialExpired ? 'Seu teste grátis terminou' : 'Upgrade'
  const headline = inTrial
    ? (trialDays <= 1 ? 'Hoje é o último dia do seu teste grátis.' : `Faltam ${trialDays} dias do seu teste grátis.`)
    : trialExpired
      ? 'Assine para continuar usando sua agenda.'
      : 'Esta função é exclusiva do plano completo.'
  const body = inTrial
    ? `Assine agora e continue usando o ${APP_NAME} sem interrupção quando o teste acabar.`
    : trialExpired
      ? 'Seus clientes, agendamentos e configurações continuam salvos. É só assinar para voltar a editar.'
      : `Desbloqueie todas as funcionalidades e gerencie sua rotina sem limites no ${APP_NAME}.`

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="serif" style={{ fontSize: 22, color: 'var(--rose-dark)', lineHeight: 1.2 }}>
          {headline}
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.45 }}>
          {body}
        </p>
        {subtitle && !inTrial && (
          <p style={{ fontSize: 12, color: 'var(--text-light)' }}>
            {subtitle}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <Btn onClick={handleUpgrade} full loading={loading}>
            <Icon name={inTrial ? 'check' : 'lock'} size={14} color="#fff" /> {inTrial ? 'Assinar agora' : 'Desbloquear agora'}
          </Btn>
          <Btn variant="ghost" onClick={onClose} full disabled={loading}>
            {inTrial ? 'Continuar no teste' : 'Agora não'}
          </Btn>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center' }}>
          R$ 59,90/mês · cancele quando quiser
        </p>
      </div>
    </Modal>
  )
}

export default PaywallModal
