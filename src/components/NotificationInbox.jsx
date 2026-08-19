import { useEffect, useRef } from 'react'
import Icon from './Icon'

const formatRelative = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const NotificationInbox = ({
  unreadCount = 0,
  soonCount = 0,
  items = [],
  soonItems = [],
  open,
  onToggle,
  onClose,
  onItemClick,
  onSoonClick,
  onMarkAllRead,
}) => {
  const rootRef = useRef(null)
  const hasUnread = unreadCount > 0
  const showDot = !hasUnread && soonCount > 0

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
    }
  }, [open, onClose])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        title="Notificações"
        aria-label={hasUnread ? `${unreadCount} notificação(ões) não lida(s)` : 'Abrir notificações'}
        aria-expanded={open}
        onClick={() => onToggle?.()}
        className="lash-btn-press"
        style={{
          position: 'relative',
          background: open ? 'var(--blush)' : 'var(--rose-light)',
          border: 'none',
          borderRadius: 8,
          padding: 8,
          display: 'flex',
          color: 'var(--text-mid)',
          cursor: 'pointer',
        }}
      >
        <Icon name="bell" size={17} />
        {hasUnread && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              background: 'var(--rose-deep)',
              color: '#fff',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--off-white)',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {showDot && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              background: 'var(--rose-deep)',
              borderRadius: '50%',
              border: '2px solid var(--off-white)',
            }}
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificações"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 'min(360px, calc(100vw - 24px))',
            maxHeight: 'min(70vh, 480px)',
            background: 'var(--surface)',
            border: '1px solid var(--rose-light)',
            borderRadius: 16,
            boxShadow: '0 16px 40px var(--shadow)',
            zIndex: 80,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 16px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              borderBottom: '1px solid var(--rose-light)',
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Notificações</p>
            {hasUnread && (
              <button
                type="button"
                onClick={() => onMarkAllRead?.()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--rose-deep)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                }}
              >
                Marcar como lidas
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {soonItems.length > 0 && (
              <div style={{ padding: '10px 12px 4px' }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--text-light)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    margin: '0 4px 8px',
                  }}
                >
                  Em breve
                </p>
                {soonItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSoonClick?.(item)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'var(--nude-light)',
                      border: '1px solid var(--rose-light)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      marginBottom: 8,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{item.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '4px 0 0', lineHeight: 1.45 }}>{item.body}</p>
                  </button>
                ))}
              </div>
            )}

            {items.length === 0 && soonItems.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Nenhuma notificação</p>
                <p style={{ fontSize: 12, color: 'var(--text-light)', lineHeight: 1.5, margin: 0 }}>
                  Quando alguém agendar pelo link público, o aviso aparece aqui.
                </p>
              </div>
            ) : (
              <div style={{ padding: soonItems.length ? '4px 12px 12px' : '10px 12px 12px' }}>
                {soonItems.length > 0 && items.length > 0 && (
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--text-light)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      margin: '8px 4px',
                    }}
                  >
                    Agendamentos
                  </p>
                )}
                {items.map((item) => {
                  const unread = !item.readAt
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onItemClick?.(item)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: unread ? 'var(--rose-light)' : 'transparent',
                        border: 'none',
                        borderRadius: 12,
                        padding: '10px 12px',
                        marginBottom: 4,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                      }}
                    >
                      {unread && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--rose-deep)',
                            marginTop: 6,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                            alignItems: 'baseline',
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.title}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>
                            {formatRelative(item.createdAt)}
                          </span>
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12,
                            color: 'var(--text-mid)',
                            marginTop: 4,
                            lineHeight: 1.45,
                          }}
                        >
                          {item.body}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationInbox
