import { useEffect, useMemo, useState } from 'react'
import { getClient } from '../lib/supabase'
import { Btn, Field, Inp } from '../components/UI'
import { apptIntervalsOverlap, formatDurationLabel, timeToMins } from '../lib/utils'

const DEFAULT_START = '08:00'
const DEFAULT_END = '18:00'
const SLOT_STEP_MIN = 30

const toTwo = (n) => String(n).padStart(2, '0')

const formatCurrencyBr = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '').slice(0, 11)

const maskPhoneBr = (value) => {
  const d = normalizePhoneDigits(value)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

const toIsoDateLabel = (ymd) => {
  if (!ymd) return ''
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

const normalizeTimeValue = (raw) => {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const h = Math.max(0, Math.min(23, Math.floor(raw)))
    return `${toTwo(h)}:00`
  }
  const s = String(raw).trim()
  if (!s) return null
  const hhmm = s.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) {
    const h = Number(hhmm[1])
    const m = Number(hhmm[2])
    if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${toTwo(h)}:${toTwo(m)}`
    }
  }
  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s)
    if (Number.isFinite(h) && h >= 0 && h <= 23) return `${toTwo(h)}:00`
  }
  return null
}

const resolveWindow = (configRow) => {
  const row = configRow || {}
  const start =
    normalizeTimeValue(row.start_time) ||
    normalizeTimeValue(row.start_hour) ||
    normalizeTimeValue(row.work_start) ||
    normalizeTimeValue(row.working_start) ||
    normalizeTimeValue(row.opening_hour) ||
    normalizeTimeValue(row.business_start) ||
    DEFAULT_START

  const end =
    normalizeTimeValue(row.end_time) ||
    normalizeTimeValue(row.end_hour) ||
    normalizeTimeValue(row.work_end) ||
    normalizeTimeValue(row.working_end) ||
    normalizeTimeValue(row.closing_hour) ||
    normalizeTimeValue(row.business_end) ||
    DEFAULT_END

  if (timeToMins(end) <= timeToMins(start)) {
    return { start: DEFAULT_START, end: DEFAULT_END }
  }

  return { start, end }
}

const buildSlots = ({ selectedDate, durationMinutes, appointments, windowStart, windowEnd }) => {
  const slots = []
  const begin = timeToMins(windowStart)
  const finish = timeToMins(windowEnd)
  const duration = Number(durationMinutes) || 60
  if (finish <= begin || duration <= 0) return slots

  for (let mins = begin; mins + duration <= finish; mins += SLOT_STEP_MIN) {
    const hour = toTwo(Math.floor(mins / 60))
    const minute = toTwo(mins % 60)
    const hhmm = `${hour}:${minute}`
    const blocked = appointments.some((a) =>
      apptIntervalsOverlap(selectedDate, hhmm, duration, a.date, a.time, Number(a.durationMinutes) || 60)
    )
    slots.push({
      time: hhmm,
      available: !blocked,
    })
  }

  return slots
}

const groupSlotsByPeriod = (slots) => {
  const groups = {
    morning: { key: 'morning', label: 'Manhã', items: [] },
    afternoon: { key: 'afternoon', label: 'Tarde', items: [] },
    evening: { key: 'evening', label: 'Noite', items: [] },
  }

  slots.forEach((slot) => {
    const mins = timeToMins(slot.time)
    if (mins < 12 * 60) {
      groups.morning.items.push(slot)
      return
    }
    if (mins < 18 * 60) {
      groups.afternoon.items.push(slot)
      return
    }
    groups.evening.items.push(slot)
  })

  return [groups.morning, groups.afternoon, groups.evening].filter((group) => group.items.length > 0)
}

const BookingSkeleton = () => (
  <div style={{ display: 'grid', gap: 10 }}>
    <div className="skeleton-line" style={{ width: '58%', height: 14, borderRadius: 8 }} />
    <div className="skeleton-line" style={{ width: '100%', height: 72, borderRadius: 12 }} />
    <div className="skeleton-line" style={{ width: '100%', height: 72, borderRadius: 12 }} />
    <div className="skeleton-line" style={{ width: '75%', height: 12, borderRadius: 8 }} />
  </div>
)

const PublicBooking = ({ professionalId }) => {
  const sb = useMemo(() => getClient(), [])
  const hasProfessionalId = !!String(professionalId || '').trim()

  const [step, setStep] = useState(1)
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [services, setServices] = useState([])
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [slots, setSlots] = useState([])
  const [workWindow, setWorkWindow] = useState({ start: DEFAULT_START, end: DEFAULT_END })
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [success, setSuccess] = useState(null)
  const [professionalName, setProfessionalName] = useState('Profissional Easy Studio')

  const selectedService = services.find((s) => s.id === selectedServiceId) || null
  const todayYmd = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let alive = true

    const loadServices = async () => {
      setLoadingServices(true)
      setErrorMsg('')
      try {
        if (!sb || !professionalId) {
          setServices([])
          return
        }
        const { data, error } = await sb.rpc('get_public_booking_services', {
          p_professional_id: professionalId,
        })
        if (error) throw error
        const list = (data || []).map((row) => ({
          id: row.id,
          name: row.name || 'Serviço sem nome',
          price: Number(row.price || 0),
          durationMinutes: Number(row.duration_minutes) > 0 ? Number(row.duration_minutes) : 60,
        }))
        if (!alive) return
        setServices(list)
      } catch {
        if (!alive) return
        setServices([])
        setErrorMsg('Nao foi possivel carregar os servicos desta profissional.')
      } finally {
        if (alive) setLoadingServices(false)
      }
    }

    loadServices()
    return () => { alive = false }
  }, [sb, professionalId])

  const loadSlots = async (dateYmd, service) => {
    if (!dateYmd || !service) return
    setLoadingSlots(true)
    setErrorMsg('')
    try {
      if (!sb || !professionalId) {
        setSlots([])
        return
      }

      const [appointmentsRes, windowRes] = await Promise.all([
        sb.rpc('get_public_booking_occupied_slots', {
          p_professional_id: professionalId,
          p_date: dateYmd,
        }),
        sb.rpc('get_public_booking_window', {
          p_professional_id: professionalId,
        }),
      ])

      if (appointmentsRes.error) throw appointmentsRes.error

      const dayAppointments = (appointmentsRes.data || []).map((a) => ({
        id: a.id,
        date: dateYmd,
        time: String(a.slot_time || a.time).slice(0, 5),
        durationMinutes: Number(a.duration_minutes) > 0 ? Number(a.duration_minutes) : 60,
        blocked: false,
      }))

      const windowRow = Array.isArray(windowRes.data) ? windowRes.data[0] : windowRes.data
      const nextWindow = resolveWindow(windowRow || null)
      setWorkWindow(nextWindow)

      const generated = buildSlots({
        selectedDate: dateYmd,
        durationMinutes: service.durationMinutes,
        appointments: dayAppointments,
        windowStart: nextWindow.start,
        windowEnd: nextWindow.end,
      })
      setSlots(generated)
    } catch {
      setSlots([])
      setErrorMsg('Nao foi possivel carregar os horarios para esta data.')
    } finally {
      setLoadingSlots(false)
    }
  }

  const hasAnyAvailable = slots.some((slot) => slot.available)
  const groupedSlots = useMemo(() => groupSlotsByPeriod(slots), [slots])

  const toStepTwo = () => {
    if (!selectedService) return
    setErrorMsg('')
    setStep(2)
  }

  const toStepThree = () => {
    if (!selectedDate || !selectedTime || !selectedService) return
    setErrorMsg('')
    setStep(3)
  }

  const confirmBooking = async () => {
    if (!selectedService || !selectedDate || !selectedTime) return

    const cleanName = String(clientName || '').trim()
    const digits = normalizePhoneDigits(clientPhone)
    if (!cleanName) {
      setErrorMsg('Informe seu nome completo.')
      return
    }
    if (digits.length < 10) {
      setErrorMsg('Informe um telefone válido no formato brasileiro.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      if (!sb || !professionalId) throw new Error('Sem conexão')

      const rpc = await sb.rpc('create_public_booking', {
        p_professional_id: professionalId,
        p_service_id: selectedService.id,
        p_date: selectedDate,
        p_time: selectedTime,
        p_client_name: cleanName,
        p_client_phone: clientPhone,
      })

      if (rpc.error) {
        const detail = rpc.error.details || rpc.error.message || 'booking_error'
        throw new Error(String(detail))
      }

      const result = rpc.data || {}
      const ok = result?.ok === true
      if (!ok && result?.reason === 'conflict') {
        setErrorMsg('Este horário acabou de ser reservado. Por favor, escolha outro horário.')
        setStep(2)
        await loadSlots(selectedDate, selectedService)
        return
      }
      if (!ok && result?.reason === 'plan_required') {
        setErrorMsg('Esta profissional nao esta com agenda publica ativa no momento.')
        return
      }
      if (!ok && result?.detail) {
        setErrorMsg(`Nao foi possivel confirmar: ${result.detail}`)
        return
      }
      if (!ok) throw new Error(String(result?.reason || 'booking_error'))

      setSuccess({
        serviceName: selectedService.name,
        dateLabel: toIsoDateLabel(selectedDate),
        time: selectedTime,
        professionalName,
      })
    } catch {
      setErrorMsg('Nao foi possivel confirmar o agendamento agora. Tente novamente em instantes.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    setStep(1)
    setSelectedServiceId('')
    setSelectedDate('')
    setSelectedTime('')
    setClientName('')
    setClientPhone('')
    setSlots([])
    setErrorMsg('')
    setSuccess(null)
  }

  const pageTitle = success ? 'Agendamento confirmado! ✓' : 'Agendar atendimento'

  if (!hasProfessionalId) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--off-white)', padding: '20px 14px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 16 }}>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Link de agendamento inválido
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6 }}>
            Este link está incompleto. Peça para a profissional enviar o link de agendamento completo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off-white)', padding: '20px 14px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 16 }}>
        <h1 className="serif" style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{pageTitle}</h1>
        {!success && (
          <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 14 }}>
            Agende com praticidade em três etapas.
          </p>
        )}

        {errorMsg && (
          <div style={{ marginBottom: 12, border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            {errorMsg}
          </div>
        )}

        {success ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ border: '1px solid var(--rose-light)', background: 'var(--nude-light)', borderRadius: 12, padding: 14 }}>
              <p style={{ fontSize: 14, color: 'var(--text-mid)', marginBottom: 8 }}>Resumo do seu agendamento</p>
              <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65 }}>
                <strong>Serviço:</strong> {success.serviceName}
                <br />
                <strong>Data:</strong> {success.dateLabel}
                <br />
                <strong>Horário:</strong> {success.time}
                <br />
                <strong>Profissional:</strong> {success.professionalName}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Btn onClick={resetFlow}>
                Fazer novo agendamento
              </Btn>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { id: 1, label: '1. Serviço' },
                { id: 2, label: '2. Data e horário' },
                { id: 3, label: '3. Seus dados' },
              ].map((item) => (
                <span
                  key={item.id}
                  style={{
                    border: '1px solid var(--rose-light)',
                    background: step === item.id ? 'var(--rose-light)' : 'var(--surface)',
                    color: step === item.id ? 'var(--rose-dark)' : 'var(--text-light)',
                    borderRadius: 999,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </span>
              ))}
            </div>

            {step === 1 && (
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Etapa 1 — Escolha do serviço</h2>
                {loadingServices ? (
                  <BookingSkeleton />
                ) : services.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--text-light)' }}>Esta profissional ainda não cadastrou seus serviços.</p>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                      {services.map((service) => {
                        const active = selectedServiceId === service.id
                        return (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => setSelectedServiceId(service.id)}
                            style={{
                              textAlign: 'left',
                              border: active ? '2px solid var(--rose-deep)' : '1px solid var(--rose-light)',
                              background: active ? 'var(--rose-light)' : 'var(--surface)',
                              borderRadius: 12,
                              padding: 12,
                              display: 'grid',
                              gap: 4,
                            }}
                          >
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{service.name}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{formatDurationLabel(service.durationMinutes)}</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--rose-dark)' }}>{formatCurrencyBr(service.price)}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                      <Btn onClick={toStepTwo} disabled={!selectedServiceId}>Continuar</Btn>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 2 && selectedService && (
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Etapa 2 — Escolha de data e horário</h2>

                <div style={{ marginBottom: 12, maxWidth: 280 }}>
                  <Field label="Data">
                    <Inp
                      type="date"
                      min={todayYmd}
                      value={selectedDate}
                      onChange={async (e) => {
                        const nextDate = e.target.value
                        setSelectedDate(nextDate)
                        setSelectedTime('')
                        if (nextDate) await loadSlots(nextDate, selectedService)
                      }}
                    />
                  </Field>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10 }}>
                  Janela de atendimento: {workWindow.start} às {workWindow.end}
                </p>

                {loadingSlots ? (
                  <BookingSkeleton />
                ) : selectedDate ? (
                  <>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {groupedSlots.map((group) => (
                        <div key={group.key} style={{ border: '1px solid var(--rose-light)', borderRadius: 12, padding: 10, background: 'var(--surface)' }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            {group.label}
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                            {group.items.map((slot) => {
                              const active = selectedTime === slot.time
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  disabled={!slot.available}
                                  onClick={() => setSelectedTime(slot.time)}
                                  className="lash-btn-press"
                                  style={{
                                    minHeight: 52,
                                    border: active ? '2px solid var(--rose-deep)' : '1px solid var(--rose-light)',
                                    background: !slot.available ? '#FAFAFA' : active ? 'var(--rose-light)' : 'var(--surface)',
                                    color: !slot.available ? 'var(--text-light)' : 'var(--text)',
                                    borderRadius: 10,
                                    padding: '10px 8px',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: slot.available ? 'pointer' : 'not-allowed',
                                    opacity: slot.available ? 1 : 0.85,
                                  }}
                                >
                                  {slot.available ? slot.time : `${slot.time} · Horário indisponível`}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {!hasAnyAvailable && (
                      <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text-light)' }}>
                        Não há horários disponíveis neste dia. Tente outra data.
                      </p>
                    )}

                    <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <Btn variant="ghost" onClick={() => setStep(1)}>Voltar</Btn>
                      <Btn onClick={toStepThree} disabled={!selectedTime}>Continuar</Btn>
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 14, color: 'var(--text-light)' }}>Escolha uma data para ver os horários disponíveis.</p>
                )}
              </div>
            )}

            {step === 3 && selectedService && (
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Etapa 3 — Dados da cliente e confirmação</h2>

                <Field label="Nome completo">
                  <Inp
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Digite seu nome completo"
                  />
                </Field>

                <Field label="Telefone">
                  <Inp
                    value={clientPhone}
                    onChange={(e) => setClientPhone(maskPhoneBr(e.target.value))}
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                  />
                </Field>

                <div style={{ border: '1px solid var(--rose-light)', borderRadius: 12, padding: 12, background: 'var(--nude-light)', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 8 }}>Resumo do agendamento</p>
                  <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65 }}>
                    <strong>Serviço:</strong> {selectedService.name}
                    <br />
                    <strong>Data:</strong> {toIsoDateLabel(selectedDate)}
                    <br />
                    <strong>Horário:</strong> {selectedTime}
                    <br />
                    <strong>Duração:</strong> {formatDurationLabel(selectedService.durationMinutes)}
                    <br />
                    <strong>Preço:</strong> {formatCurrencyBr(selectedService.price)}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <Btn variant="ghost" onClick={() => setStep(2)}>Voltar</Btn>
                  <Btn onClick={confirmBooking} loading={submitting}>
                    Confirmar agendamento
                  </Btn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default PublicBooking