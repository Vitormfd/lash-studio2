// ─── BTN ─────────────────────────────────────────────────────────────────────
export const Btn = ({ children, variant = 'primary', sm, full, onClick, type = 'button', disabled }) => {
  const styles = {
    primary: { background: 'var(--rose-deep)', color: '#fff', border: 'none' },
    outline: { background: 'transparent', color: 'var(--rose-deep)', border: '1.5px solid var(--rose-deep)' },
    ghost: { background: 'var(--rose-light)', color: 'var(--text-mid)', border: 'none' },
    danger: { background: '#C5515F', color: '#fff', border: 'none' },
    success: { background: '#7BAF7B', color: '#fff', border: 'none' },
    warning: { background: '#D4915A', color: '#fff', border: 'none' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant],
        borderRadius: 10,
        padding: sm ? '7px 14px' : '11px 20px',
        fontSize: sm ? 12 : 14,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: full ? '100%' : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.2s, transform 0.1s',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

// ─── FORM FIELD ───────────────────────────────────────────────────────────────
export const Field = ({ label, children, half }) => (
  <div style={{ marginBottom: 16, width: half ? 'calc(50% - 6px)' : '100%' }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-light)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </label>
    {children}
  </div>
)

// ─── INPUT STYLE ─────────────────────────────────────────────────────────────
export const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  border: '1.5px solid var(--border-mid)',
  borderRadius: 10,
  fontSize: 14,
  color: 'var(--text)',
  background: '#fff',
  transition: 'border-color 0.2s',
}

export const Inp = (props) => (
  <input
    style={inputStyle}
    {...props}
    onFocus={(e) => (e.target.style.borderColor = 'var(--rose)')}
    onBlur={(e) => (e.target.style.borderColor = 'var(--border-mid)')}
  />
)

export const Sel = ({ children, ...props }) => (
  <select
    style={{
      ...inputStyle,
      appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23A07880' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
    }}
    {...props}
  >
    {children}
  </select>
)

export const Textarea = (props) => (
  <textarea
    style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
    {...props}
    onFocus={(e) => (e.target.style.borderColor = 'var(--rose)')}
    onBlur={(e) => (e.target.style.borderColor = 'var(--border-mid)')}
  />
)

// ─── STAT CARD ────────────────────────────────────────────────────────────────
import Icon from './Icon'

export const StatCard = ({ label, value, sub, color = 'var(--rose-deep)', icon }) => (
  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--rose-light)', flex: '1 1 140px', minWidth: 130 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--rose-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={color} />
      </div>
    </div>
    <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 3 }}>{sub}</div>}
  </div>
)

// ─── SPINNER ─────────────────────────────────────────────────────────────────
export const Spinner = ({ text = 'Carregando...' }) => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--off-white)' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--rose-light)', borderTopColor: 'var(--rose-deep)', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
      <p style={{ fontSize: 13, color: 'var(--text-light)' }}>{text}</p>
    </div>
  </div>
)
