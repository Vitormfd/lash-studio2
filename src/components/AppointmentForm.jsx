import { useState, useEffect } from 'react'
import { Btn, Field, Inp, Sel, Textarea } from './UI'
import Icon from './Icon'
import { DURATION_OPTIONS, SERVICE_COLOR_PRESETS, normalizeServiceColor, formatDurationLabel, endTimeLabel } from '../lib/utils'

const AppointmentForm = ({ initial, onSave, onClose, clients, services, blocked }) => {
  const [form, setForm] = useState({
    clientId: '', serviceId: '',
    date: new Date().toISOString().slice(0, 10),
    value: '', notes: '', durationMinutes: 60,
    ...initial,
    blocked: blocked != null ? blocked : !!initial?.blocked,
    durationMinutes: initial?.durationMinutes != null && Number(initial.durationMinutes) > 0
      ? Number(initial.durationMinutes) : 60,
    time: initial?.time != null && String(initial.time).trim() !== ''
      ? String(initial.time).trim().slice(0, 5)
      : '09:00',
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (form.serviceId && !blocked) {
      const svc = services.find((s) => s.id === form.serviceId)
      if (svc) set('value', svc.price)
    }
  }, [form.serviceId])

  const dur = Number(form.durationMinutes) || 60
  const durationSelectValues = [...new Set([...DURATION_OPTIONS, dur])].sort((a, b) => a - b)
  const timeStr = form.time && String(form.time).trim() ? String(form.time).trim().slice(0, 5) : '09:00'
  const valid = form.blocked
    ? form.date && timeStr && dur > 0
    : form.clientId && form.serviceId && form.date && timeStr && form.value && dur > 0

  return (
    <div>
      {!blocked && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Cliente">
            <Sel value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
              <option value="">Selecione um cliente</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Sel>
          </Field>
          <Field label="Serviço">
            <Sel value={form.serviceId} onChange={(e) => set('serviceId', e.target.value)}>
              <option value="">Selecione um serviço</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} — R$ {s.price}</option>)}
            </Sel>
          </Field>
        </div>
      )}

      {blocked && (
        <Field label="Motivo do bloqueio">
          <Inp value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex: Consulta médica, compromisso pessoal..." />
        </Field>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Data" half>
          <Inp type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Início" half>
          <Inp type="time" value={timeStr} onChange={(e) => set('time', e.target.value)} />
        </Field>
        <Field label="Duração" half>
          <Sel value={String(dur)} onChange={(e) => set('durationMinutes', Number(e.target.value))}>
            {durationSelectValues.map((m) => (
              <option key={m} value={m}>{formatDurationLabel(m)}</option>
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
        </>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={() => valid && onSave({ ...form, time: timeStr })} disabled={!valid}>
          <Icon name="check" size={14} color="#fff" />
          {initial?.id ? 'Salvar' : form.blocked ? 'Bloquear' : 'Agendar'}
        </Btn>
      </div>
    </div>
  )
}

export default AppointmentForm
