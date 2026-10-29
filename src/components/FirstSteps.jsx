import { useState } from 'react'
import Icon from './Icon'
import { local } from '../lib/supabase'

const dismissKey = (userId) => `lash-first-steps-dismissed:${userId}`

/** Card "Primeiros passos" do painel: some quando os 3 passos estão feitos ou se a pessoa fechar */
const FirstSteps = ({
  userId,
  isBarber,
  hasClient,
  hasAppointment,
  reminderOn,
  onNewClient,
  onNewAppointment,
  onReminder,
  onServices,
}) => {
  const [dismissed, setDismissed] = useState(() => !!local.get(dismissKey(userId)))
  if (dismissed || (hasClient && hasAppointment && reminderOn)) return null

  const clientWord = isBarber ? 'seu primeiro cliente' : 'sua primeira cliente'
  const steps = [
    {
      done: hasClient,
      title: `Cadastre ${clientWord}`,
      hint: 'Nome e WhatsApp já bastam.',
      action: onNewClient,
    },
    {
      done: hasAppointment,
      title: 'Marque o primeiro horário',
      hint: 'Escolha o dia, o serviço e pronto.',
      action: onNewAppointment,
    },
    {
      done: reminderOn,
      title: 'Ative o lembrete no WhatsApp',
      hint: `O app avisa ${isBarber ? 'o cliente' : 'a cliente'} sozinho antes do horário.`,
      action: onReminder,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const current = steps.findIndex((s) => !s.done)

  const dismiss = () => {
    local.set(dismissKey(userId), true)
    setDismissed(true)
  }

  return (
    <div style={{ marginBottom: 18, background: 'linear-gradient(135deg, var(--rose-light) 0%, var(--surface) 70%)', border: '1.5px solid var(--rose)', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Primeiros passos</p>
          <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{doneCount} de 3 · leva uns 2 minutos</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Fechar primeiros passos" style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => {
          const isCurrent = i === current
          return (
            <button
              key={step.title}
              type="button"
              onClick={step.done ? undefined : step.action}
              disabled={step.done}
              className="lash-btn-press"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', fontFamily: 'inherit',
                padding: '12px 14px', borderRadius: 12, cursor: step.done ? 'default' : 'pointer',
                background: 'var(--surface)',
                border: isCurrent ? '2px solid var(--rose-deep)' : '1px solid var(--rose-light)',
                opacity: step.done ? 0.7 : 1,
              }}
            >
              <span style={{
                width: 26, height: 26, minWidth: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                background: step.done ? 'var(--rose-deep)' : isCurrent ? 'var(--rose-light)' : 'var(--off-white)',
                color: step.done ? '#fff' : 'var(--rose-deep)',
                border: step.done ? 'none' : '1px solid var(--rose)',
              }}>
                {step.done ? <Icon name="check" size={14} color="#fff" /> : i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</span>
                {!step.done && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{step.hint}</span>}
              </span>
              {!step.done && <Icon name="chevRight" size={16} color="var(--rose-deep)" />}
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 12, lineHeight: 1.5 }}>
        Já deixamos alguns serviços prontos com preços sugeridos.{' '}
        <button type="button" onClick={onServices} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--rose-dark)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textDecoration: 'underline' }}>
          Conferir meus preços
        </button>
      </p>
    </div>
  )
}

export default FirstSteps
