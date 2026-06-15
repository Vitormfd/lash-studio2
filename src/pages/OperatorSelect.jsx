import { useState } from 'react'
import { Btn, Field, Inp } from '../components/UI'
import Icon from '../components/Icon'
import { hashPin, pickMemberColor } from '../lib/operator'
import { DB, uid } from '../lib/supabase'

const cardStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px solid var(--rose-light)',
  background: 'var(--surface)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
}

const OperatorSelect = ({
  userId,
  teamMembers,
  sessionName,
  onSelected,
  onTeamUpdated,
  setupMode = false,
}) => {
  const [pinTarget, setPinTarget] = useState(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [loading, setLoading] = useState(false)
  const [setupName, setSetupName] = useState(sessionName || '')
  const [setupPin, setSetupPin] = useState('')

  const activeMembers = teamMembers.filter((m) => m.active !== false)

  const handlePick = async (member) => {
    if (member.pinHash) {
      setPinTarget(member)
      setPin('')
      setPinError('')
      return
    }
    onSelected(member)
  }

  const confirmPin = async () => {
    if (!pinTarget) return
    setLoading(true)
    setPinError('')
    const entered = await hashPin(pin)
    if (entered !== pinTarget.pinHash) {
      setPinError('PIN incorreto.')
      setLoading(false)
      return
    }
    onSelected(pinTarget)
    setPinTarget(null)
    setPin('')
    setLoading(false)
  }

  const handleSetup = async () => {
    const name = setupName.trim()
    if (!name) return
    setLoading(true)
    try {
      const pinHash = setupPin.trim() ? await hashPin(setupPin) : null
      const member = await DB.saveTeamMember(userId, {
        id: uid(),
        name,
        color: pickMemberColor(0),
        pinHash,
        active: true,
        _new: true,
      })
      await onTeamUpdated?.()
      onSelected(member)
    } finally {
      setLoading(false)
    }
  }

  if (setupMode || activeMembers.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--off-white)' }}>
        <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 18, padding: 28, border: '1px solid var(--rose-light)', boxShadow: '0 8px 40px rgba(139,77,85,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', background: 'linear-gradient(135deg, var(--rose) 0%, var(--rose-deep) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="users" size={24} color="#fff" />
            </div>
            <h2 className="serif" style={{ fontSize: 22, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Quem usa o app?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-light)', lineHeight: 1.6 }}>
              Cadastre a primeira pessoa da equipe. Depois você pode adicionar mais em Configurações.
            </p>
          </div>

          <Field label="Seu nome">
            <Inp value={setupName} onChange={(e) => setSetupName(e.target.value)} placeholder="Ex.: Ana, Recepção..." />
          </Field>
          <Field label="PIN (opcional, 4 dígitos)">
            <Inp
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={setupPin}
              onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Para trocar de operador"
            />
          </Field>

          <Btn onClick={handleSetup} loading={loading} disabled={!setupName.trim() || loading} full touch>
            Começar
          </Btn>
        </div>
      </div>
    )
  }

  if (pinTarget) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--off-white)' }}>
        <div style={{ width: '100%', maxWidth: 380, background: 'var(--surface)', borderRadius: 18, padding: 28, border: '1px solid var(--rose-light)' }}>
          <button
            type="button"
            onClick={() => { setPinTarget(null); setPin(''); setPinError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--text-light)', fontSize: 13, cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="chevLeft" size={16} /> Voltar
          </button>
          <h2 className="serif" style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{pinTarget.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 18 }}>Digite o PIN para continuar</p>
          <Field label="PIN">
            <Inp
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmPin() }}
            />
          </Field>
          {pinError && <p style={{ fontSize: 12, color: '#C5515F', marginBottom: 12 }}>{pinError}</p>}
          <Btn onClick={confirmPin} loading={loading} disabled={pin.length < 4 || loading} full touch>
            Confirmar
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--off-white)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <h2 className="serif" style={{ fontSize: 24, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Quem está usando?</h2>
          <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Selecione para registrar suas ações no app</p>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {activeMembers.map((member) => (
            <button key={member.id} type="button" onClick={() => handlePick(member)} style={cardStyle}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: member.color || 'var(--nude)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                {member.name[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{member.name}</div>
                {member.pinHash && (
                  <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="lock" size={11} /> PIN protegido
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default OperatorSelect
