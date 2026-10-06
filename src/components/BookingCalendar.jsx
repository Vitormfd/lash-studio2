import { useState } from 'react'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const toTwo = (n) => String(n).padStart(2, '0')
const toYmd = (y, m, d) => `${y}-${toTwo(m + 1)}-${toTwo(d)}`

const monthLabel = (y, m) => {
  const label = new Date(y, m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const Chevron = ({ dir }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
)

const BookingCalendar = ({ value, min, onChange, isDisabled }) => {
  const minDate = min ? new Date(`${min}T12:00:00`) : null
  const initial = value ? new Date(`${value}T12:00:00`) : minDate || new Date()
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() })

  const todayYmd = (() => {
    const d = new Date()
    return toYmd(d.getFullYear(), d.getMonth(), d.getDate())
  })()

  const firstWeekday = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const canGoPrev = !minDate || view.y > minDate.getFullYear() || (view.y === minDate.getFullYear() && view.m > minDate.getMonth())

  const shift = (delta) => {
    setView(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const navBtn = (enabled) => ({
    width: 34,
    height: 34,
    borderRadius: 10,
    border: '1px solid var(--rose-light)',
    background: 'var(--surface)',
    color: enabled ? 'var(--text)' : 'var(--text-light)',
    opacity: enabled ? 1 : 0.4,
    cursor: enabled ? 'pointer' : 'default',
    display: 'grid',
    placeItems: 'center',
  })

  return (
    <div style={{ border: '1px solid var(--rose-light)', borderRadius: 14, padding: 14, background: 'var(--surface)', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button type="button" aria-label="Mês anterior" disabled={!canGoPrev} onClick={() => shift(-1)} style={navBtn(canGoPrev)}>
          <Chevron dir="left" />
        </button>
        <span className="serif" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{monthLabel(view.y, view.m)}</span>
        <button type="button" aria-label="Próximo mês" onClick={() => shift(1)} style={navBtn(true)}>
          <Chevron dir="right" />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <span key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-light)', letterSpacing: '0.06em', padding: '4px 0' }}>
            {w}
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />
          const ymd = toYmd(view.y, view.m, day)
          const disabled = (!!min && ymd < min) || (!!isDisabled && isDisabled(ymd))
          const selected = ymd === value
          const isToday = ymd === todayYmd
          return (
            <button
              key={ymd}
              type="button"
              disabled={disabled}
              onClick={() => onChange(ymd)}
              className={disabled ? undefined : 'lash-btn-press'}
              aria-pressed={selected}
              style={{
                position: 'relative',
                aspectRatio: '1',
                minHeight: 38,
                borderRadius: 10,
                border: selected ? '1px solid var(--rose-deep)' : '1px solid transparent',
                background: selected ? 'var(--rose-deep)' : 'transparent',
                color: selected ? 'var(--surface)' : disabled ? 'var(--text-light)' : 'var(--text)',
                opacity: disabled ? 0.35 : 1,
                textDecoration: disabled && !(min && ymd < min) ? 'line-through' : 'none',
                fontSize: 14,
                fontWeight: selected || isToday ? 700 : 500,
                cursor: disabled ? 'default' : 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!disabled && !selected) e.currentTarget.style.background = 'var(--rose-light)' }}
              onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent' }}
            >
              {day}
              {isToday && !selected && (
                <span style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 999, background: 'var(--rose-deep)' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default BookingCalendar
