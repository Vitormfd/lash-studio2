import Icon from './Icon'
import { Btn } from './UI'

const Topbar = ({ title, setOpen, notifs, onBellClick, onNewAppt, offline }) => (
  <header
    style={{
      position: 'sticky', top: 0,
      background: 'color-mix(in srgb, var(--off-white) 92%, transparent)', backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--rose-light)', padding: '12px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 40,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={() => setOpen(true)}
        style={{ background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: 8, display: 'flex', color: 'var(--text-mid)', cursor: 'pointer' }}
      >
        <Icon name="menu" size={18} />
      </button>
      <h1 className="serif" style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)' }}>{title}</h1>
      {offline && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '4px 10px', borderRadius: 20, border: '1px solid #FCD34D' }}>
          Sem internet
        </span>
      )}
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        title="Horários próximos"
        aria-label={notifs > 0 ? `Há ${notifs} horário(s) nos próximos 30 minutos` : 'Ver agenda e lembretes'}
        onClick={() => onBellClick?.()}
        className="lash-btn-press"
        style={{ position: 'relative', background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: 8, display: 'flex', color: 'var(--text-mid)', cursor: 'pointer' }}
      >
        <Icon name="bell" size={17} />
        {notifs > 0 && (
          <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: 'var(--rose-deep)', borderRadius: '50%', border: '2px solid var(--off-white)' }} />
        )}
      </button>
      <Btn onClick={onNewAppt} sm>
        <Icon name="plus" size={14} color="#fff" /> Novo
      </Btn>
    </div>
  </header>
)

export default Topbar
