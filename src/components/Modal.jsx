import { createPortal } from 'react-dom'
import Icon from './Icon'

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null
  // Renderiza direto no <body>: no iPhone a área de rolagem da página criava uma "camada"
  // própria e a janela ficava por baixo da barra do topo e da barra inferior.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(44,26,30,0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 20, width: '100%',
          maxWidth: wide ? 600 : 460, maxHeight: '92dvh', overflowY: 'auto', overflowX: 'hidden', minWidth: 0,
          boxShadow: '0 20px 60px rgba(139,77,85,0.2)',
        }}
      >
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--rose-light)' }}>
          <h3 className="serif" style={{ fontSize: 18, fontWeight: 500, color: 'var(--rose-dark)' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: 6, color: 'var(--text-mid)', display: 'flex', cursor: 'pointer' }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default Modal
