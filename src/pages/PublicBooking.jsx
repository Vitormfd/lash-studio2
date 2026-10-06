import { useCallback, useEffect, useMemo, useState } from 'react'
import { getClient, notifyProfessionalNewBooking } from '../lib/supabase'
import { Btn, Field, Inp } from '../components/UI'
import { apptIntervalsOverlap, formatDurationLabel, timeToMins } from '../lib/utils'
import { getHolidaysOnDate, formatHolidaySummary } from '../lib/holidays'
import { applyTheme } from '../lib/theme'
import BookingCalendar from '../components/BookingCalendar'

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
  if (row.closed === true || row.closed === 'true' || row.closed === 1) {
    return { closed: true, start: null, end: null, hasLunch: false, lunchStart: null, lunchEnd: null }
  }

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
    return { closed: false, start: DEFAULT_START, end: DEFAULT_END, hasLunch: false, lunchStart: null, lunchEnd: null }
  }

  const lunchStart = normalizeTimeValue(row.lunch_start)
  const lunchEnd = normalizeTimeValue(row.lunch_end)
  const hasLunch =
    !!row.has_lunch &&
    !!lunchStart &&
    !!lunchEnd &&
    timeToMins(lunchEnd) > timeToMins(lunchStart) &&
    timeToMins(lunchStart) >= timeToMins(start) &&
    timeToMins(lunchEnd) <= timeToMins(end)

  return { closed: false, start, end, hasLunch, lunchStart: hasLunch ? lunchStart : null, lunchEnd: hasLunch ? lunchEnd : null }
}

const localTodayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${toTwo(d.getMonth() + 1)}-${toTwo(d.getDate())}`
}

const nowMinutes = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

const isPastSlot = (dateYmd, hhmm) => {
  const today = localTodayYmd()
  if (dateYmd < today) return true
  return dateYmd === today && timeToMins(hhmm) <= nowMinutes()
}

const buildSlots = ({ selectedDate, durationMinutes, appointments, windowStart, windowEnd, lunchStart, lunchEnd }) => {
  const slots = []
  const begin = timeToMins(windowStart)
  const finish = timeToMins(windowEnd)
  const duration = Number(durationMinutes) || 60
  if (finish <= begin || duration <= 0) return slots

  const lunchBeginMins = lunchStart ? timeToMins(lunchStart) : null
  const lunchEndMins = lunchEnd ? timeToMins(lunchEnd) : null

  for (let mins = begin; mins + duration <= finish; mins += SLOT_STEP_MIN) {
    if (isPastSlot(selectedDate, `${toTwo(Math.floor(mins / 60))}:${toTwo(mins % 60)}`)) continue
    const hour = toTwo(Math.floor(mins / 60))
    const minute = toTwo(mins % 60)
    const hhmm = `${hour}:${minute}`
    const blockedByAppointment = appointments.some((a) =>
      apptIntervalsOverlap(selectedDate, hhmm, duration, a.date, a.time, Number(a.durationMinutes) || 60)
    )
    const blockedByLunch =
      lunchBeginMins != null && lunchEndMins != null && mins < lunchEndMins && mins + duration > lunchBeginMins
    slots.push({
      time: hhmm,
      available: !blockedByAppointment && !blockedByLunch,
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
  const [workWindow, setWorkWindow] = useState({ closed: false, start: DEFAULT_START, end: DEFAULT_END, hasLunch: false, lunchStart: null, lunchEnd: null })
  const [dayClosed, setDayClosed] = useState(false)
  const [dayHolidayLabel, setDayHolidayLabel] = useState('')
  const [closedWeekdays, setClosedWeekdays] = useState([])
  const [bookingLoc, setBookingLoc] = useState({ stateUf: '', city: '' })
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [success, setSuccess] = useState(null)
  const [professionalName, setProfessionalName] = useState('Profissional Easy Studio')

  const selectedService = services.find((s) => s.id === selectedServiceId) || null
  const todayYmd = localTodayYmd()

  useEffect(() => {
    if (!sb || !professionalId) return
    let alive = true
    sb.rpc('get_public_theme_id', { p_professional_id: professionalId })
      .then(({ data }) => { if (alive) applyTheme(data || 'rose') })
      .catch(() => {})
    return () => { alive = false }
  }, [sb, professionalId])

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
        setErrorMsg('Nao foi possivel carregar os servicos deste link.')
      } finally {
        if (alive) setLoadingServices(false)
      }
    }

    loadServices()
    return () => { alive = false }
  }, [sb, professionalId])

  useEffect(() => {
    if (!sb || !professionalId) return
    let alive = true

    // O fechamento depende só do dia da semana, então 7 consultas cobrem o calendário inteiro.
    const loadWeekSchedule = async () => {
      try {
        const base = new Date(`${localTodayYmd()}T12:00:00`)
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(base)
          d.setDate(base.getDate() + i)
          return { dow: d.getDay(), ymd: `${d.getFullYear()}-${toTwo(d.getMonth() + 1)}-${toTwo(d.getDate())}` }
        })
        const results = await Promise.all(
          days.map((day) => sb.rpc('get_public_booking_window', { p_professional_id: professionalId, p_date: day.ymd }))
        )
        if (!alive) return
        const closed = []
        let loc = null
        results.forEach((res, i) => {
          if (res.error) return
          const row = Array.isArray(res.data) ? res.data[0] : res.data
          if (!loc && row) loc = { stateUf: row.state_uf || '', city: row.city || '' }
          if (resolveWindow(row || null).closed) closed.push(days[i].dow)
        })
        setClosedWeekdays(closed)
        if (loc) setBookingLoc(loc)
      } catch {
        // Sem a agenda semanal o calendário só bloqueia datas passadas; loadSlots ainda avisa dias fechados.
      }
    }

    loadWeekSchedule()
    return () => { alive = false }
  }, [sb, professionalId])

  const isDateUnavailable = useCallback(
    (ymd) => {
      const dow = new Date(`${ymd}T12:00:00`).getDay()
      if (closedWeekdays.includes(dow)) return true
      return getHolidaysOnDate(ymd, bookingLoc).length > 0
    },
    [closedWeekdays, bookingLoc]
  )

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
          p_date: dateYmd,
        }),
      ])

      if (appointmentsRes.error) throw appointmentsRes.error
      if (windowRes.error) throw windowRes.error

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

      const loc = {
        stateUf: windowRow?.state_uf || '',
        city: windowRow?.city || '',
      }

      const holidays = getHolidaysOnDate(dateYmd, loc)
      if (holidays.length) {
        setDayHolidayLabel(formatHolidaySummary(holidays))
        setDayClosed(false)
        setSelectedTime('')
        setSlots([])
        return
      }
      setDayHolidayLabel('')

      if (nextWindow.closed) {
        setDayClosed(true)
        setSelectedTime('')
        setSlots([])
        return
      }
      setDayClosed(false)

      const generated = buildSlots({
        selectedDate: dateYmd,
        durationMinutes: service.durationMinutes,
        appointments: dayAppointments,
        windowStart: nextWindow.start,
        windowEnd: nextWindow.end,
        lunchStart: nextWindow.lunchStart,
        lunchEnd: nextWindow.lunchEnd,
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
    if (isPastSlot(selectedDate, selectedTime)) {
      setErrorMsg('Este horário já passou. Por favor, escolha outro horário.')
      setSelectedTime('')
      setStep(2)
      await loadSlots(selectedDate, selectedService)
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
      if (!ok && result?.reason === 'outside_hours') {
        setErrorMsg('Este horário está fora do horário de atendimento. Escolha outro horário.')
        setStep(2)
        await loadSlots(selectedDate, selectedService)
        return
      }
      if (!ok && result?.reason === 'plan_required') {
        setErrorMsg('A agenda publica nao esta ativa no momento.')
        return
      }
      if (!ok && result?.detail) {
        setErrorMsg(`Nao foi possivel confirmar: ${result.detail}`)
        return
      }
      if (!ok) throw new Error(String(result?.reason || 'booking_error'))

      notifyProfessionalNewBooking(result.appointment_id)

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
            Este link está incompleto. Peça a quem te atende o link de agendamento completo.
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
            Escolha o serviço, o horário e confirme em três etapas.
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
                  <p style={{ fontSize: 14, color: 'var(--text-light)' }}>Ainda não há serviços cadastrados para agendamento.</p>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, alignItems: 'start' }}>
                  <div>
                    <BookingCalendar
                      min={todayYmd}
                      value={selectedDate}
                      isDisabled={isDateUnavailable}
                      onChange={async (nextDate) => {
                        if (nextDate === selectedDate) return
                        setSelectedDate(nextDate)
                        setSelectedTime('')
                        await loadSlots(nextDate, selectedService)
                      }}
                    />
                    <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
                      Dias riscados não têm atendimento.
                    </p>
                  </div>

                  <div>
                    {!selectedDate ? (
                      <div style={{ border: '1px dashed var(--rose-light)', borderRadius: 14, padding: '28px 16px', textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'var(--text-light)' }}>Escolha uma data no calendário para ver os horários disponíveis.</p>
                      </div>
                    ) : (
                      <>
                        <p className="serif" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                          {(() => {
                            const label = toIsoDateLabel(selectedDate)
                            return label.charAt(0).toUpperCase() + label.slice(1)
                          })()}
                        </p>
                        {!loadingSlots && !dayClosed && !dayHolidayLabel && (
                          <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 12 }}>
                            {`Atendimento das ${workWindow.start} às ${workWindow.end}`}
                            {workWindow.hasLunch ? ` · almoço ${workWindow.lunchStart}–${workWindow.lunchEnd}` : ''}
                          </p>
                        )}

                        {loadingSlots ? (
                          <div style={{ marginTop: 12 }}><BookingSkeleton /></div>
                        ) : (
                          <>
                            <div style={{ display: 'grid', gap: 14 }}>
                              {groupedSlots.map((group) => (
                                <div key={group.key}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                                    {group.label}
                                  </p>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
                                    {group.items.map((slot) => {
                                      const active = selectedTime === slot.time
                                      return (
                                        <button
                                          key={slot.time}
                                          type="button"
                                          disabled={!slot.available}
                                          onClick={() => setSelectedTime(slot.time)}
                                          className={slot.available ? 'lash-btn-press' : undefined}
                                          aria-label={slot.available ? slot.time : `${slot.time} indisponível`}
                                          aria-pressed={active}
                                          style={{
                                            height: 40,
                                            border: active ? '1px solid var(--rose-deep)' : '1px solid var(--rose-light)',
                                            background: active ? 'var(--rose-deep)' : 'var(--surface)',
                                            color: active ? 'var(--surface)' : 'var(--text)',
                                            borderRadius: 10,
                                            fontSize: 14,
                                            fontWeight: 600,
                                            fontVariantNumeric: 'tabular-nums',
                                            textDecoration: slot.available ? 'none' : 'line-through',
                                            cursor: slot.available ? 'pointer' : 'default',
                                            opacity: slot.available ? 1 : 0.35,
                                            transition: 'background 0.15s, border-color 0.15s',
                                          }}
                                        >
                                          {slot.time}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {!hasAnyAvailable && (
                              <p style={{ marginTop: 12, fontSize: 14, color: dayHolidayLabel || dayClosed ? '#9B3D4A' : 'var(--text-light)' }}>
                                {dayHolidayLabel
                                  ? `Feriado: ${dayHolidayLabel}. Escolha outra data.`
                                  : dayClosed
                                    ? 'Neste dia não há atendimento. Escolha outra data.'
                                    : 'Não há horários disponíveis neste dia. Tente outra data.'}
                              </p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <Btn variant="ghost" onClick={() => setStep(1)}>Voltar</Btn>
                  <Btn onClick={toStepThree} disabled={!selectedTime}>
                    {selectedTime ? `Continuar · ${selectedTime}` : 'Continuar'}
                  </Btn>
                </div>
              </div>
            )}

            {step === 3 && selectedService && (
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Etapa 3 — Seus dados e confirmação</h2>

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
