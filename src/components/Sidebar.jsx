import Icon from './Icon'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'clients', label: 'Clientes', icon: 'users' },
  { id: 'services', label: 'Serviços', icon: 'scissors' },
  { id: 'inventory', label: 'Estoque', icon: 'box' },
  { id: 'finance', label: 'Financeiro', icon: 'dollar' },
  { id: 'reports', label: 'Relatórios', icon: 'chart' },
  { id: 'settings', label: 'Configurações', icon: 'settings' },
]

const Sidebar = ({ active, setActive, open, setOpen, session, onLogout }) => (
  <>
    {open && (
      <div
        onClick={() => setOpen(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 49 }}
      />
    )}
    <aside
      style={{
        position: 'fixed', top: 0, left: open ? 0 : -280, width: 240, height: '100vh',
        background: 'var(--surface)', borderRight: '1px solid var(--rose-light)', zIndex: 50,
        display: 'flex', flexDirection: 'column', transition: 'left 0.3s ease',
        boxShadow: open ? '4px 0 30px rgba(139,77,85,0.12)' : 'none',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '28px 20px 20px', borderBottom: '1px solid var(--rose-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--rose) 0%, var(--rose-deep) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="star" size={16} color="#fff" />
          </div>
          <div>
            <div className="serif" style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', lineHeight: 1.2 }}>Lash Studio</div>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 1 }}>Gestão Profissional</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => { setActive(n.id); setOpen(false) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, border: 'none', marginBottom: 2,
              cursor: 'pointer', fontFamily: 'inherit',
              background: active === n.id ? 'var(--rose-light)' : 'transparent',
              color: active === n.id ? 'var(--rose-dark)' : 'var(--text-mid)',
              fontSize: 13, fontWeight: active === n.id ? 500 : 400,
              transition: 'all 0.15s',
            }}
          >
            <Icon name={n.icon} size={16} color={active === n.id ? 'var(--rose-deep)' : 'var(--text-light)'} />
            {n.label}
          </button>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--rose-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--nude)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--rose-dark)', flexShrink: 0 }}>
            {session?.name ? session.name[0].toUpperCase() : 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {session?.name || 'Usuária'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {session?.email || ''}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'transparent', color: 'var(--text-light)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Icon name="logout" size={13} />
          Sair da conta
        </button>
      </div>
    </aside>
  </>
)

export default Sidebar
