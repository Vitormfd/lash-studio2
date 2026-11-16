import { useState } from 'react'
import Modal from './Modal'
import { Btn } from './UI'
import Icon from './Icon'
import { openCheckout, PIX_ACCESS_DAYS } from '../lib/billing'
import { APP_NAME } from '../lib/domain'

/**
 * trialExpired: o teste grátis acabou.
 * accessExpired: acabou o acesso pago (Pix de 30 dias vencido ou assinatura encerrada).
 * pixDaysLeft: acesso atual veio de Pix e ainda está valendo (tela usada para renovar).
 */
const PaywallModal = ({
  open,
  onClose,
  subtitle,
  onUpgrade,
  onPix,
  trialDays = null,
  trialExpired = false,
  accessExpired = false,
  pixDaysLeft = null,
}) => {
  const [loading, setLoading] = useState('')

  const run = async (kind, fn) => {
    try {
      setLoading(kind)
      await fn()
    } finally {
      setLoading('')
    }
  }

  const handleCard = () => run('card', () => (typeof onUpgrade === 'function' ? onUpgrade() : openCheckout()))
  const handlePix = () => run('pix', () => onPix?.())

  const renewingPix = pixDaysLeft != null
  const inTrial = trialDays != null && !trialExpired && !renewingPix
  const ended = trialExpired || accessExpired

  const title = renewingPix
    ? 'Renovar acesso'
    : inTrial
      ? 'Assine o Easy Studio'
      : trialExpired
        ? 'Seu teste grátis terminou'
        : accessExpired
          ? 'Seu acesso terminou'
          : 'Upgrade'
  const headline = renewingPix
    ? (pixDaysLeft <= 1 ? 'Seu acesso via Pix vence hoje.' : `Seu acesso via Pix vence em ${pixDaysLeft} dias.`)
    : inTrial
      ? (trialDays <= 1 ? 'Hoje é o último dia do seu teste grátis.' : `Faltam ${trialDays} dias do seu teste grátis.`)
      : ended
        ? 'Assine para continuar usando sua agenda.'
        : 'Esta função é exclusiva do plano completo.'
  const body = renewingPix
    ? `Pague mais ${PIX_ACCESS_DAYS} dias no Pix: eles somam aos dias que ainda faltam. Ou assine no cartão para renovar sozinho todo mês.`
    : inTrial
      ? `Assine agora e continue usando o ${APP_NAME} sem interrupção quando o teste acabar.`
      : ended
        ? 'Seus clientes, agendamentos e configurações continuam salvos. É só assinar para voltar a editar.'
        : `Desbloqueie todas as funcionalidades e gerencie sua rotina sem limites no ${APP_NAME}.`

  const cardLabel = inTrial || renewingPix ? 'Assinar no cartão' : ended ? 'Assinar no cartão e continuar' : 'Desbloquear agora'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="serif" style={{ fontSize: 22, color: 'var(--rose-dark)', lineHeight: 1.2 }}>
          {headline}
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.45 }}>
          {body}
        </p>
        {subtitle && !inTrial && !renewingPix && (
          <p style={{ fontSize: 12, color: 'var(--text-light)' }}>
            {subtitle}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <Btn onClick={handleCard} full loading={loading === 'card'} disabled={!!loading && loading !== 'card'}>
            <Icon name={inTrial ? 'check' : 'lock'} size={14} color="#fff" /> {cardLabel}
          </Btn>
          {onPix && (
            <Btn variant="outline" onClick={handlePix} full loading={loading === 'pix'} disabled={!!loading && loading !== 'pix'}>
              Pagar {PIX_ACCESS_DAYS} dias no Pix
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose} full disabled={!!loading}>
            {inTrial ? 'Continuar no teste' : 'Agora não'}
          </Btn>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center' }}>
          R$ 59,90/mês · cartão renova sozinho e cancela quando quiser · Pix vale {PIX_ACCESS_DAYS} dias
        </p>
      </div>
    </Modal>
  )
}

export default PaywallModal
