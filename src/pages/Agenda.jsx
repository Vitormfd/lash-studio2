import { useState } from 'react'
import Modal from '../components/Modal'
import AppointmentForm from '../components/AppointmentForm'
import { Btn } from '../components/UI'
import Icon from '../components/Icon'
import {
  HOURS, DAYS_PT, MONTHS_PT,
  normalizeServiceColor, hexToRgba,
  apptDurationMin, apptCoversSlotHour, apptStartsInHourRow, apptIntervalsOverlap,
  formatDurationLabel, endTimeLabel,
} from '../lib/utils'

const Agenda = ({ appointments, clients, services, onNew, onEdit, onDelete, onMarkStatus, addToast }) => {
  const [view, setView] = useState('day')
  const [current, setCurrent] = useState(new Date())
  const [modal, setModal] = useState(null)

  const dateStr = current.toISOString().slice(0, 10)
  const getClientName = (id) => clients.find((c) => c.id === id)?.name || 'Bloqueado'
  const getServiceName = (id) => services.find((s) => s.id === id)?.name || ''

  const statusColor = (a) => {
    if (a.blocked) return { bg: '#F5E5E5', border: '#E8B4B4', text: '#C5515F' }
    if (a.status === 'cancelled') return { bg: '#F0F0F0', border: '#CCCCCC', text: '#999' }
    const hex = normalizeServiceColor(services.find((s) => s.id === a.serviceId)?.color)
    const tint = hex ? hexToRgba(hex, 0.22) || 'var(--rose-light)' : null
    if (a.status === 'done') {
      if (hex) return { bg: hexToRgba(hex, 0.14) || '#E8F5E8', border: hex, text: '#2D6A2D' }
      return { bg: '#E8F5E8', border: '#B4D8B4', text: '#5A9A5A' }
    }
    if (hex) return { bg: tint, border: hex, text: hex }
    return { bg: 'var(--rose-light)', border: 'var(--blush-mid)', text: 'var(--rose-dark)' }
  }

  // ── DAY VIEW ──────────────────────────────────────────────────────────────
  const DayView = () => {
    const dayAppts = appointments.filter((a) => a.date === dateStr).sort((a, b) => a.time.localeCompare(b.time))
    return (
      <div style={{ overflowY: 'auto', flex: 1, minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
        {HOURS.map((h) => {
          const appt = dayAppts.find((a) => apptStartsInHourRow(a, h))
          const slotBusy = dayAppts.some((a) => apptCoversSlotHour(a, dateStr, h))
          const colors = appt ? statusColor(appt) : null
          const dm = appt ? apptDurationMin(appt) : 60
          return (
            <div key={h} onClick={() => !slotBusy && setModal({ date: dateStr, time: h })}
              style={{ display: 'flex', minHeight: 60, borderBottom: '1px solid var(--rose-light)', cursor: slotBusy ? 'default' : 'pointer' }}>
              <div style={{ width: 52, padding: '8px 10px 0', fontSize: 11, color: 'var(--text-light)', flexShrink: 0, textAlign: 'right' }}>{h}</div>
              <div style={{ flex: 1, padding: '4px 8px', position: 'relative' }}>
                {appt && (
                  <div style={{ background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
                        {appt.blocked ? '🔒 Bloqueado' : getClientName(appt.clientId)}
                        <span style={{ fontWeight: 400, color: 'var(--text-light)', marginLeft: 6 }}>{String(appt.time).slice(0, 5)}–{endTimeLabel(appt.time, dm)}</span>
                      </div>
                      {!appt.blocked && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{getServiceName(appt.serviceId)} · R$ {appt.value} · {formatDurationLabel(dm)}</div>}
                      {appt.blocked && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{formatDurationLabel(dm)}</div>}
                      {appt.notes && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>{appt.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {!appt.blocked && onMarkStatus && appt.status !== 'cancelled' && (
                        <button
                          type="button"
                          title={appt.status === 'done' ? 'Reabrir atendimento' : 'Marcar como concluído'}
                          onClick={(e) => {
                            e.stopPropagation()
                            onMarkStatus(appt, appt.status === 'done' ? 'confirmed' : 'done')
                          }}
                          style={{
                            background: appt.status === 'done' ? 'rgba(123,175,123,0.25)' : 'rgba(212,145,90,0.2)',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            padding: '4px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            color: appt.status === 'done' ? '#065F46' : '#92400E',
                            fontFamily: 'inherit',
                          }}
                        >
                          {appt.status === 'done' ? 'Reabrir' : 'Concluir'}
                        </button>
                      )}
                      {!appt.blocked && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(appt) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-light)' }}>
                          <Icon name="edit" size={13} />
                        </button>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(appt.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#C5515F' }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>
                )}
                {!appt && slotBusy && (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-light)', fontStyle: 'italic' }}>⏱ intervalo ocupado</span>
                  </div>
                )}
                {!slotBusy && (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--rose-light)', opacity: 0.6 }}>+ adicionar</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── WEEK VIEW ─────────────────────────────────────────────────────────────
  const WeekView = () => {
    const start = new Date(current); start.setDate(current.getDate() - current.getDay() + 1)
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
    return (
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: 500, display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', gap: 0 }}>
          <div />
          {days.map((d) => {
            const isToday = d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
            return (
              <div key={d.toISOString()} style={{ textAlign: 'center', padding: '6px 2px', borderBottom: '1px solid var(--rose-light)', background: isToday ? 'var(--rose-light)' : '#fff' }}>
                <div style={{ fontSize: 10, color: 'var(--text-light)' }}>{DAYS_PT[d.getDay()]}</div>
                <div style={{ fontSize: 14, fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--rose-deep)' : 'var(--text)' }}>{d.getDate()}</div>
              </div>
            )
          })}
          {HOURS.map((h) => (
            <div key={h} style={{ display: 'contents' }}>
              <div style={{ padding: '4px 6px 0', fontSize: 10, color: 'var(--text-light)', textAlign: 'right', borderBottom: '1px solid var(--rose-light)' }}>{h}</div>
              {days.map((d) => {
                const ds = d.toISOString().slice(0, 10)
                const dayList = appointments.filter((a) => a.date === ds)
                const appt = dayList.find((a) => apptStartsInHourRow(a, h))
                const slotBusy = dayList.some((a) => apptCoversSlotHour(a, ds, h))
                const colors = appt ? statusColor(appt) : null
                const wdm = appt ? apptDurationMin(appt) : 60
                return (
                  <div key={ds} onClick={() => !slotBusy && setModal({ date: ds, time: h })}
                    style={{ minHeight: 44, padding: 3, borderBottom: '1px solid var(--rose-light)', borderLeft: '1px solid var(--rose-light)', cursor: slotBusy ? 'default' : 'pointer' }}>
                    {appt && (
                      <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '3px 5px', height: '100%', overflow: 'hidden' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {appt.blocked ? '🔒' : getClientName(appt.clientId)}
                        </div>
                        {!appt.blocked && <div style={{ fontSize: 9, color: 'var(--text-light)' }}>{getServiceName(appt.serviceId)}</div>}
                        <div style={{ fontSize: 8, color: 'var(--text-light)' }}>{formatDurationLabel(wdm)}</div>
                      </div>
                    )}
                    {!appt && slotBusy && (
                      <div style={{ fontSize: 8, color: 'var(--text-light)', textAlign: 'center', paddingTop: 4 }}>…</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── MONTH VIEW ────────────────────────────────────────────────────────────
  const MonthView = () => {
    const y = current.getFullYear(), m = current.getMonth()
    const firstDay = new Date(y, m, 1).getDay()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, i) => {
      const day = i - firstDay + 1
      return day < 1 || day > daysInMonth ? null : day
    })
    const todayStr = new Date().toISOString().slice(0, 10)
    return (
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0, padding: '0 4px', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAYS_PT.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-light)', padding: '4px 0', fontWeight: 600 }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const appts = appointments.filter((a) => a.date === ds && !a.blocked && a.status !== 'cancelled')
            const isToday = ds === todayStr
            return (
              <div key={i} onClick={() => { setCurrent(new Date(ds + 'T12:00')); setView('day') }}
                style={{ minHeight: 64, padding: 4, borderRadius: 8, cursor: 'pointer', background: isToday ? 'var(--rose-light)' : '#fff', border: `1px solid ${isToday ? 'var(--rose)' : 'var(--rose-light)'}`, transition: 'background 0.15s' }}>
                <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--rose-deep)' : 'var(--text)', textAlign: 'right', marginBottom: 3 }}>{day}</div>
                {appts.slice(0, 2).map((a) => {
                  const acc = normalizeServiceColor(services.find((s) => s.id === a.serviceId)?.color)
                  return (
                    <div key={a.id} style={{ fontSize: 9, background: acc ? hexToRgba(acc, 0.35) || 'var(--rose)' : 'var(--rose)', color: acc ? '#2C1A1E' : 'var(--rose-dark)', borderLeft: acc ? `3px solid ${acc}` : '3px solid transparent', borderRadius: 3, padding: '1px 4px', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(a.time).slice(0, 5)} {getClientName(a.clientId)}
                    </div>
                  )
                })}
                {appts.length > 2 && <div style={{ fontSize: 9, color: 'var(--text-light)' }}>+{appts.length - 2}</div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const navigate = (dir) => {
    const d = new Date(current)
    if (view === 'day') d.setDate(d.getDate() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCurrent(d)
  }

  const fmtHeader = () => {
    if (view === 'day') return current.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    if (view === 'week') {
      const s = new Date(current); s.setDate(current.getDate() - current.getDay() + 1)
      const e = new Date(s); e.setDate(s.getDate() + 6)
      return `${s.getDate()} — ${e.getDate()} ${MONTHS_PT[s.getMonth()]}`
    }
    return `${MONTHS_PT[current.getMonth()]} ${current.getFullYear()}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)', overflow: 'hidden', padding: '12px 0 0', minWidth: 0, width: '100%' }}>
      {/* Controls */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex' }}><Icon name="chevLeft" size={15} /></button>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', minWidth: 150, textAlign: 'center' }}>{fmtHeader()}</span>
          <button onClick={() => navigate(1)} style={{ background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex' }}><Icon name="chevRight" size={15} /></button>
          <Btn variant="ghost" sm onClick={() => setCurrent(new Date())}>Hoje</Btn>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['day', 'week', 'month'].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, background: view === v ? 'var(--rose-deep)' : 'var(--rose-light)', color: view === v ? '#fff' : 'var(--text-mid)', transition: 'all 0.15s' }}>
              {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
          <Btn variant="outline" sm onClick={() => setModal({ date: dateStr, time: '09:00', blocked: true })}>
            <Icon name="lock" size={12} color="var(--rose-deep)" /> Bloquear
          </Btn>
        </div>
      </div>

      {view === 'day' && <DayView />}
      {view === 'week' && <WeekView />}
      {view === 'month' && <MonthView />}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.blocked ? 'Bloquear Horário' : 'Novo Agendamento'}>
        {modal && (
          <AppointmentForm
            initial={{ date: modal.date, time: modal.time }}
            blocked={modal.blocked}
            clients={clients}
            services={services}
            onClose={() => setModal(null)}
            onSave={(form) => {
              const dur = Number(form.durationMinutes) || 60
              const clash = appointments.find((a) =>
                apptIntervalsOverlap(form.date, form.time, dur, a.date, a.time, apptDurationMin(a))
              )
              if (clash) { addToast(form.blocked ? 'Esse intervalo já está ocupado.' : 'Horário conflita com outro agendamento.', 'error'); return }
              onNew(form)
              setModal(null)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

export default Agenda
