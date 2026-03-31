import Icon from './Icon'

const Toast = ({ toasts, removeToast }) => (
  <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {toasts.map((t) => (
      <div
        key={t.id}
        style={{
          background: t.type === 'error' ? '#C5515F' : t.type === 'warning' ? '#D4915A' : '#7BAF7B',
          color: '#fff', padding: '12px 18px', borderRadius: 12, fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 10, minWidth: 240, maxWidth: 320,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)', animation: 'slideIn 0.2s ease',
        }}
      >
        <Icon name={t.type === 'error' ? 'x' : 'check'} size={15} />
        {t.msg}
        <button
          onClick={() => removeToast(t.id)}
          style={{ marginLeft: 'auto', background: 'none', color: 'rgba(255,255,255,0.8)', padding: 2, border: 'none', cursor: 'pointer' }}
        >
          <Icon name="x" size={13} />
        </button>
      </div>
    ))}
  </div>
)

export default Toast
