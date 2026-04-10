import { statusMeta } from '../lib/appointmentStatus'

const AppointmentStatusBadge = ({ status, sm }) => {
  const m = statusMeta(status)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: sm ? 10 : 11,
        fontWeight: 700,
        padding: sm ? '2px 8px' : '3px 10px',
        borderRadius: 20,
        background: m.bg,
        color: m.text,
        border: `1px solid ${m.border}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  )
}

export default AppointmentStatusBadge
