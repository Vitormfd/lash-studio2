import { useState } from 'react'
import Modal from '../components/Modal'
import AppointmentForm from '../components/AppointmentForm'
import { Btn, Field, Inp, Textarea } from '../components/UI'
import Icon from '../components/Icon'
import {
  HOURS, DAYS_PT, MONTHS_PT,
  normalizeServiceColor, hexToRgba,
  apptDurationMin, apptCoversSlotHour, apptStartsInHourRow, apptIntervalsOverlap,
  formatDurationLabel, endTimeLabel,
} from '../lib/utils'
import { statusMeta } from '../lib/appointmentStatus'
import { toLocalYmd } from '../lib/dashboardStats'

const Agenda = ({
  appointments,
  clients,
  services,
  onNew,
  onEdit,
  onDelete,
  onMarkStatus,
  addToast,
  canUserEdit,
  onBlockedAction,
  onUpgrade,
}) => {
  const [view, setView] = useState('day')
  const [current, setCurrent] = useState(new Date())
  const [modal, setModal] = useState(null)
  const [paymentModal, setPaymentModal] = useState({ open: false, appt: null, method: '', value: '', notes: '' })

  const dateStr = toLocalYmd(current)
  const getClientName = (id) => clients.find((c) => c.id === id)?.name || 'Bloqueado'
  const getServiceName = (id) => services.find((s) => s.id === id)?.name || ''
  const paymentMethods = [
    { value: 'cash', label: 'Dinheiro', icon: '💵' },
    { value: 'pix', label: 'Pix', icon: '💰' },
    { value: 'credit_card', label: 'Cartão de crédito', icon: '💳' },
    { value: 'debit_card', label: 'Cartão de débito', icon: '💳' },
  ]

  const paymentMethodLabel = (method) => paymentMethods.find((m) => m.value === method)?.label || ''
  const paymentMethodIcon = (method) => paymentMethods.find((m) => m.value === method)?.icon || ''
  const formatMoney = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`

  const statusColor = (a) => {
    if (a.blocked) return { bg: '#F5E5E5', border: '#E8B4B4', text: '#C5515F' }
    const m = statusMeta(a.status)
    return { bg: m.bg, border: m.border, text: m.text }
  }

  const quickBtn = (label, appt, next, extra = {}) => (
    <button
      type="button"
      key={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        if (!canUserEdit) {
          onBlockedAction?.('Desbloqueie para marcar atendimento como concluido.')
          return
        }
        if (next === 'done') {
          setPaymentModal({
            open: true,
            appt,
            method: appt.paymentMethod || '',
            value: String(appt.paymentValue != null ? appt.paymentValue : Number(appt.value || 0)),
            notes: appt.paymentNotes || '',
          })
          return
        }
        onMarkStatus(appt, next)
      }}
      style={{
        background: 'rgba(255,255,255,0.65)',
        border: `1px solid ${extra.border || 'var(--border-mid)'}`,
        borderRadius: 6,
        cursor: 'pointer',
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 700,
        color: extra.color || 'var(--text)',
        fontFamily: 'inherit',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
        boxShadow: '0 1px 2px rgba(44,26,30,0.06)',
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)' }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {label}
    </button>
  )

  const QuickStatusRow = ({ appt }) => {
    if (appt.blocked || !onMarkStatus) return null
    if (appt.status === 'cancelled') return null
    if (appt.status === 'pending') {
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {quickBtn('Confirmar', appt, 'confirmed', { border: '#93C5FD', color: '#1D4ED8' })}
          {quickBtn('Concluir', appt, 'done', { border: '#6EE7B7', color: '#065F46' })}
          {quickBtn('Cancelar', appt, 'cancelled', { border: '#FCA5A5', color: '#991B1B' })}
        </div>
      )
    }
    if (appt.status === 'confirmed') {
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {quickBtn('Concluir', appt, 'done', { border: '#6EE7B7', color: '#065F46' })}
          {quickBtn('Cancelar', appt, 'cancelled', { border: '#FCA5A5', color: '#991B1B' })}
        </div>
      )
    }
    if (appt.status === 'done') {
      return (
        <div style={{ marginTop: 6 }}>
          {quickBtn('Reabrir', appt, 'confirmed', { border: '#93C5FD', color: '#1D4ED8' })}
        </div>
      )
    }
    return null
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
                      {!appt.blocked && appt.status === 'done' && appt.paymentMethod && (
                        <div style={{ fontSize: 11, color: '#0F766E', marginTop: 2, fontWeight: 600 }}>
                          {paymentMethodLabel(appt.paymentMethod)} {paymentMethodIcon(appt.paymentMethod)} · {formatMoney(appt.paymentValue != null ? appt.paymentValue : appt.value)}
                        </div>
                      )}
                      {appt.blocked && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{formatDurationLabel(dm)}</div>}
                      {appt.notes && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>{appt.notes}</div>}
                      {!appt.blocked && (
                        <QuickStatusRow appt={appt} />
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignSelf: 'flex-start' }}>
                      {!appt.blocked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!canUserEdit) {
                              onBlockedAction?.('Desbloqueie para editar agendamentos.')
                              return
                            }
                            onEdit(appt)
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-light)', opacity: canUserEdit ? 1 : 0.72 }}
                        >
                          <Icon name={canUserEdit ? 'edit' : 'lock'} size={13} />
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
            const isToday = toLocalYmd(d) === toLocalYmd(new Date())
            return (
              <div key={toLocalYmd(d)} style={{ textAlign: 'center', padding: '6px 2px', borderBottom: '1px solid var(--rose-light)', background: isToday ? 'var(--rose-light)' : 'var(--surface)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-light)' }}>{DAYS_PT[d.getDay()]}</div>
                <div style={{ fontSize: 14, fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--rose-deep)' : 'var(--text)' }}>{d.getDate()}</div>
              </div>
            )
          })}
          {HOURS.map((h) => (
            <div key={h} style={{ display: 'contents' }}>
              <div style={{ padding: '4px 6px 0', fontSize: 10, color: 'var(--text-light)', textAlign: 'right', borderBottom: '1px solid var(--rose-light)' }}>{h}</div>
              {days.map((d) => {
                const ds = toLocalYmd(d)
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
    const todayStr = toLocalYmd(new Date())
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
                style={{ minHeight: 64, padding: 4, borderRadius: 8, cursor: 'pointer', background: isToday ? 'var(--rose-light)' : 'var(--surface)', border: `1px solid ${isToday ? 'var(--rose)' : 'var(--rose-light)'}`, transition: 'background 0.15s' }}>
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
        {!canUserEdit && (
          <div style={{ width: '100%', border: '1px solid var(--rose-light)', borderRadius: 10, background: 'var(--rose-light)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-mid)' }}>Desbloqueie para criar agendamentos</span>
            <Btn sm onClick={() => onUpgrade?.()}>
              <Icon name="lock" size={12} color="#fff" /> Desbloquear agora
            </Btn>
          </div>
        )}
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
          {canUserEdit ? (
            <Btn variant="outline" sm onClick={() => setModal({ date: dateStr, time: '09:00', blocked: true })}>
              <Icon name="lock" size={12} color="var(--rose-deep)" /> Bloquear
            </Btn>
          ) : (
            <button
              type="button"
              onClick={() => onBlockedAction?.('Desbloqueie para criar agendamentos.')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1.5px solid var(--rose-deep)',
                background: 'transparent',
                color: 'var(--rose-deep)',
                opacity: 0.7,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Icon name="lock" size={12} color="var(--rose-deep)" /> Bloquear
            </button>
          )}
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
              if (!canUserEdit) {
                onBlockedAction?.('Desbloqueie para criar agendamentos.')
                return
              }
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

      <Modal
        open={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, appt: null, method: '', value: '', notes: '' })}
        title="Finalizar atendimento 💅"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Método de pagamento">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {paymentMethods.map((pm) => {
                const active = paymentModal.method === pm.value
                return (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => setPaymentModal((prev) => ({ ...prev, method: pm.value }))}
                    style={{
                      minHeight: 52,
                      borderRadius: 12,
                      border: active ? '2px solid #0F766E' : '1.5px solid var(--border-mid)',
                      background: active ? 'rgba(15,118,110,0.08)' : 'var(--surface)',
                      color: active ? '#0F766E' : 'var(--text)',
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      padding: '10px 8px',
                    }}
                  >
                    <span>{pm.icon}</span>
                    <span>{pm.label}</span>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Valor pago">
            <Inp
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={paymentModal.value}
              onChange={(e) => setPaymentModal((prev) => ({ ...prev, value: e.target.value }))}
            />
          </Field>

          <Field label="Observação (opcional)">
            <Textarea
              placeholder="Ex.: cliente pagou parte em Pix e parte no dinheiro"
              value={paymentModal.notes}
              onChange={(e) => setPaymentModal((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </Field>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 2 }}>
            <Btn
              variant="ghost"
              touch
              onClick={() => setPaymentModal({ open: false, appt: null, method: '', value: '', notes: '' })}
            >
              Cancelar
            </Btn>
            <Btn
              variant="success"
              touch
              onClick={() => {
                if (!paymentModal.method) {
                  addToast('Selecione o método de pagamento.', 'warning')
                  return
                }
                const paidValue = Number(paymentModal.value || 0)
                onMarkStatus(paymentModal.appt, 'done', {
                  paymentMethod: paymentModal.method,
                  paymentValue: Number.isFinite(paidValue) ? paidValue : 0,
                  paymentNotes: paymentModal.notes || '',
                })
                setPaymentModal({ open: false, appt: null, method: '', value: '', notes: '' })
              }}
            >
              Confirmar pagamento
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Agenda
