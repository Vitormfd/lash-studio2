import Icon from './Icon'
import { Btn } from './UI'

const Topbar = ({ title, setOpen, notifs, onBellClick, onNewAppt, offline, isDemo, canUserEdit, onUpgrade }) => (
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
      {isDemo && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#7C2D12', background: '#FFEDD5', padding: '4px 10px', borderRadius: 20, border: '1px solid #FDBA74' }}>
          Teste gratis
        </span>
      )}
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
      {canUserEdit ? (
        <Btn onClick={onNewAppt} sm>
          <Icon name="plus" size={14} color="#fff" /> Novo
        </Btn>
      ) : (
        <button
          type="button"
          onClick={() => onUpgrade?.()}
          className="lash-btn-press"
          style={{
            background: 'var(--rose-deep)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            opacity: 0.7,
            filter: 'saturate(0.7)',
          }}
        >
          <Icon name="lock" size={13} color="#fff" /> Novo
        </button>
      )}
    </div>
  </header>
)

export default Topbar
