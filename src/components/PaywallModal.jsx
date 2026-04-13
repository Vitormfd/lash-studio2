import Modal from './Modal'
import { Btn } from './UI'
import Icon from './Icon'
import { CHECKOUT_URL, openCheckout } from '../lib/billing'
import { APP_NAME } from '../lib/domain'

const PaywallModal = ({ open, onClose, subtitle }) => (
  <Modal open={open} onClose={onClose} title="Upgrade">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="serif" style={{ fontSize: 22, color: 'var(--rose-dark)', lineHeight: 1.2 }}>
        Esta função é exclusiva do plano completo.
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.45 }}>
        Desbloqueie todas as funcionalidades e gerencie sua rotina sem limites no {APP_NAME}.
      </p>
      {subtitle && (
        <p style={{ fontSize: 12, color: 'var(--text-light)' }}>
          {subtitle}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <Btn onClick={() => openCheckout()} full>
          <Icon name="lock" size={14} color="#fff" /> Desbloquear agora
        </Btn>
        <Btn variant="ghost" onClick={onClose} full>
          Continuar em modo de teste
        </Btn>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center' }}>
        Checkout: {CHECKOUT_URL}
      </p>
    </div>
  </Modal>
)

export default PaywallModal
