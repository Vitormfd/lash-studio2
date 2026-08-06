import { useState, useEffect, useMemo } from 'react'
import { Btn, Field, Inp, Sel, Textarea, inputStyle } from './UI'
import Icon from './Icon'
import {
  DURATION_OPTIONS,
  BLOCK_DURATION_OPTIONS,
  formatDurationLabel,
  endTimeLabel,
  getFullDayBlock,
  getFullDayBlockMinutes,
  AGENDA_DAY_START,
} from '../lib/utils'
import { toLocalYmd } from '../lib/dashboardStats'

const listBoxStyle = {
  maxHeight: 200,
  overflowY: 'auto',
  border: '1.5px solid var(--border-mid)',
  borderRadius: 10,
  background: 'var(--surface)',
  marginTop: 6,
}

const durationOptionLabel = (m) => {
  if (m === getFullDayBlockMinutes()) return `Dia inteiro (${AGENDA_DAY_START}–${endTimeLabel(AGENDA_DAY_START, m)})`
  return formatDurationLabel(m)
}

const AppointmentForm = ({ initial, onSave, onClose, clients, services, blocked }) => {
  const [clientFilter, setClientFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    clientId: '', serviceId: '',
    date: toLocalYmd(new Date()),
    value: '', notes: '',
    ...initial,
    blocked: blocked != null ? blocked : !!initial?.blocked,
    durationMinutes: initial?.durationMinutes != null && Number(initial.durationMinutes) > 0
      ? Number(initial.durationMinutes) : 60,
    time: initial?.time != null && String(initial.time).trim() !== ''
      ? String(initial.time).trim().slice(0, 5)
      : '09:00',
    reminderEnabled: initial?.reminderEnabled != null ? !!initial.reminderEnabled : true,
    reminderMinutesBefore: initial?.reminderMinutesBefore != null && Number(initial.reminderMinutesBefore) > 0
      ? Number(initial.reminderMinutesBefore) : 60,
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (form.serviceId && !blocked) {
      const svc = services.find((s) => s.id === form.serviceId)
      if (svc) set('value', svc.price)
    }
  }, [form.serviceId])

  const filteredClients = useMemo(() => {
    const q = clientFilter.trim().toLowerCase()
    const raw = clientFilter.trim()
    const list = !q
      ? clients
      : clients.filter((c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.phone || '').toString().includes(raw)
        )
    return list.slice(0, 80)
  }, [clients, clientFilter])

  const filteredServices = useMemo(() => {
    const q = serviceFilter.trim().toLowerCase()
    const raw = serviceFilter.trim()
    const list = !q
      ? services
      : services.filter((s) =>
          (s.name || '').toLowerCase().includes(q) ||
          String(s.price ?? '').includes(raw)
        )
    return list.slice(0, 80)
  }, [services, serviceFilter])

  const selectedClient = clients.find((c) => c.id === form.clientId)
  const selectedService = services.find((s) => s.id === form.serviceId)

  const dur = Number(form.durationMinutes) || 60
  const durationBase = form.blocked ? BLOCK_DURATION_OPTIONS : DURATION_OPTIONS
  const durationSelectValues = [...new Set([...durationBase, dur])].sort((a, b) => a - b)
  const timeStr = form.time && String(form.time).trim() ? String(form.time).trim().slice(0, 5) : '09:00'
  const fullDay = getFullDayBlock()
  const isFullDayBlock = !!form.blocked && timeStr === fullDay.time && dur === fullDay.durationMinutes
  const valid = form.blocked
    ? form.date && timeStr && dur > 0
    : form.clientId && form.serviceId && form.date && timeStr && form.value && dur > 0

  const applyFullDayBlock = (enabled) => {
    if (enabled) {
      setForm((f) => ({ ...f, time: fullDay.time, durationMinutes: fullDay.durationMinutes }))
      return
    }
    setForm((f) => ({ ...f, durationMinutes: 60 }))
  }

  const submit = async () => {
    if (!valid) return
    setSaving(true)
    try {
      await Promise.resolve(onSave({ ...form, time: timeStr }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {!blocked && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Cliente">
            {selectedClient ? (
              <div style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-mid)', background: 'var(--rose-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{selectedClient.name}</span>
                <button type="button" onClick={() => { set('clientId', ''); setClientFilter('') }} style={{ fontSize: 12, color: 'var(--rose-deep)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <Inp
                  autoFocus={!blocked && !selectedClient}
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  placeholder="Digite nome ou telefone para buscar..."
                  style={inputStyle}
                />
                <div style={listBoxStyle}>
                  {filteredClients.length === 0 ? (
                    <p style={{ padding: 12, fontSize: 12, color: 'var(--text-light)', margin: 0 }}>Nenhum cliente encontrado</p>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { set('clientId', c.id); setClientFilter('') }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: 'none',
                          borderBottom: '1px solid var(--rose-light)',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: 'var(--text)',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        {c.phone && <span style={{ fontSize: 12, color: 'var(--text-light)', marginLeft: 8 }}>{c.phone}</span>}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </Field>
          <Field label="Serviço">
            {selectedService ? (
              <div style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-mid)', background: 'var(--rose-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{selectedService.name} — R$ {selectedService.price}</span>
                <button type="button" onClick={() => { set('serviceId', ''); setServiceFilter('') }} style={{ fontSize: 12, color: 'var(--rose-deep)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <Inp
                  autoFocus={!blocked && !!selectedClient && !selectedService}
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  placeholder="Digite nome ou valor para buscar..."
                  style={inputStyle}
                />
                <div style={listBoxStyle}>
                  {filteredServices.length === 0 ? (
                    <p style={{ padding: 12, fontSize: 12, color: 'var(--text-light)', margin: 0 }}>Nenhum serviço encontrado</p>
                  ) : (
                    filteredServices.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { set('serviceId', s.id); setServiceFilter('') }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: 'none',
                          borderBottom: '1px solid var(--rose-light)',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: 'var(--text)',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--rose-deep)', marginLeft: 8 }}>R$ {s.price}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </Field>
        </div>
      )}

      {blocked && (
        <Field label="Motivo do bloqueio">
          <Inp value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex: Consulta médica, compromisso pessoal..." />
        </Field>
      )}

      {blocked && (
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 12,
            border: `1.5px solid ${isFullDayBlock ? 'var(--rose-deep)' : 'var(--border-mid)'}`,
            background: isFullDayBlock ? 'var(--rose-light)' : 'var(--surface)',
            cursor: 'pointer',
            marginBottom: 14,
          }}
        >
          <input
            type="checkbox"
            checked={isFullDayBlock}
            onChange={(e) => applyFullDayBlock(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--rose-deep)', flexShrink: 0 }}
          />
          <span>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Bloquear dia inteiro</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-light)', marginTop: 3, lineHeight: 1.4 }}>
              Fecha toda a agenda do dia ({AGENDA_DAY_START} às {endTimeLabel(AGENDA_DAY_START, fullDay.durationMinutes)}).
            </span>
          </span>
        </label>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Data" half>
          <Inp type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Início" half>
          <Inp
            type="time"
            value={timeStr}
            disabled={isFullDayBlock}
            onChange={(e) => set('time', e.target.value)}
          />
        </Field>
        <Field label="Duração" half>
          <Sel
            value={String(dur)}
            disabled={isFullDayBlock}
            onChange={(e) => {
              const m = Number(e.target.value)
              if (form.blocked && m === fullDay.durationMinutes) {
                setForm((f) => ({ ...f, time: fullDay.time, durationMinutes: m }))
                return
              }
              set('durationMinutes', m)
            }}
          >
            {durationSelectValues.map((m) => (
              <option key={m} value={m}>{form.blocked ? durationOptionLabel(m) : formatDurationLabel(m)}</option>
            ))}
          </Sel>
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 5 }}>
            Término: {endTimeLabel(timeStr, dur)}
          </p>
        </Field>
      </div>

      {!blocked && (
        <>
          <Field label="Valor (R$)">
            <Inp type="number" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Observações">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Observações sobre o atendimento..." rows={3} />
          </Field>
          <Field label="Lembrete (estrutura para envio futuro)">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-mid)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.reminderEnabled}
                onChange={(e) => set('reminderEnabled', e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--rose-deep)' }}
              />
              Quero registrar lembrete para este horário
            </label>
            <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6, lineHeight: 1.45 }}>
              Marque se quiser identificar este horário como lembrete dentro da agenda.
            </p>
            {form.reminderEnabled && (
              <Sel
                value={String(form.reminderMinutesBefore)}
                onChange={(e) => set('reminderMinutesBefore', Number(e.target.value))}
                style={{ ...inputStyle, marginTop: 10 }}
              >
                <option value="15">15 min antes</option>
                <option value="30">30 min antes</option>
                <option value="60">1 hora antes</option>
                <option value="120">2 horas antes</option>
                <option value="1440">1 dia antes</option>
              </Sel>
            )}
          </Field>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
        <Btn onClick={submit} disabled={!valid} loading={saving}>
          <Icon name="check" size={14} color="#fff" />
          {initial?.id ? 'Salvar' : form.blocked ? 'Bloquear' : 'Agendar'}
        </Btn>
      </div>
    </div>
  )
}

export default AppointmentForm
