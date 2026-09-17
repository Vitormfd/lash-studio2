import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { getClient } from '../lib/supabase'
import { Btn, Field, Inp } from '../components/UI'

const TOKEN_REFRESH_MS = 4 * 60 * 1000

const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '').slice(0, 11)

const maskPhoneBr = (value) => {
  const d = normalizePhoneDigits(value)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

const StampGrid = ({ goal, filled }) => {
  const items = Array.from({ length: goal }, (_, i) => i < filled)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
      {items.map((done, i) => (
        <div
          key={i}
          style={{
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            background: done ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.14)',
            color: done ? 'var(--rose-dark)' : 'rgba(255,255,255,0.55)',
            border: done ? 'none' : '1px solid rgba(255,255,255,0.3)',
          }}
        >
          {done ? '★' : i + 1}
        </div>
      ))}
    </div>
  )
}

const PublicLoyalty = ({ professionalId }) => {
  const sb = useMemo(() => getClient(), [])
  const hasProfessionalId = !!String(professionalId || '').trim()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [candidates, setCandidates] = useState(null)
  const [card, setCard] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const refreshTimer = useRef(null)

  const fetchCard = async (clientId) => {
    if (!sb || !professionalId || !clientId) return
    const { data, error } = await sb.rpc('get_public_loyalty_card', {
      p_professional_id: professionalId,
      p_client_id: clientId,
    })
    if (error || !data?.ok) {
      setErrorMsg('Não foi possível atualizar seu cartão agora.')
      return
    }
    setCard(data)
  }

  const submitLookup = async () => {
    const digits = normalizePhoneDigits(phone)
    const cleanName = name.trim()
    if (digits.length < 8 && cleanName.length < 2) {
      setErrorMsg('Informe seu telefone ou seu nome.')
      return
    }
    setLoading(true)
    setErrorMsg('')
    setCandidates(null)
    try {
      if (!sb || !professionalId) throw new Error('Sem conexão')
      const { data, error } = await sb.rpc('get_public_loyalty_lookup', {
        p_professional_id: professionalId,
        p_phone: phone,
        p_name: cleanName,
      })
      if (error) throw error
      if (!data?.ok) {
        setErrorMsg('Não encontramos seu cadastro. Confira o telefone ou nome informado.')
        return
      }
      if (data.mode === 'choice') {
        setCandidates(data.candidates || [])
        return
      }
      setCard(data)
    } catch {
      setErrorMsg('Não foi possível buscar seu cartão agora. Tente novamente em instantes.')
    } finally {
      setLoading(false)
    }
  }

  const pickCandidate = async (clientId) => {
    setLoading(true)
    setErrorMsg('')
    try {
      await fetchCard(clientId)
      setCandidates(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!card?.qr_token) {
      setQrDataUrl('')
      return
    }
    let alive = true
    QRCode.toDataURL(String(card.qr_token), { margin: 1, width: 240, color: { dark: '#2C1A1E', light: '#FFFFFF' } })
      .then((url) => { if (alive) setQrDataUrl(url) })
      .catch(() => { if (alive) setQrDataUrl('') })
    return () => { alive = false }
  }, [card?.qr_token])

  useEffect(() => {
    if (!card?.client_id) return undefined
    refreshTimer.current = window.setInterval(() => {
      fetchCard(card.client_id)
    }, TOKEN_REFRESH_MS)
    return () => window.clearInterval(refreshTimer.current)
  }, [card?.client_id])

  if (!hasProfessionalId) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--off-white)', padding: '20px 14px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 16 }}>
          <h1 className="serif" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Link inválido</h1>
          <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6 }}>
            Este link de fidelidade está incompleto. Peça o link correto para a profissional.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off-white)', padding: '20px 14px' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <h1 className="serif" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', marginBottom: 6, textAlign: 'center' }}>
          Cartão de Fidelidade
        </h1>

        {!card && (
          <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 16, textAlign: 'center' }}>
            Digite seu telefone e/ou nome para ver seu progresso.
          </p>
        )}

        {errorMsg && (
          <div style={{ marginBottom: 12, border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            {errorMsg}
          </div>
        )}

        {!card && !candidates && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 18 }}>
            <Field label="Telefone">
              <Inp
                value={phone}
                onChange={(e) => setPhone(maskPhoneBr(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
              />
            </Field>
            <Field label="Nome (opcional se informar o telefone)">
              <Inp
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                onKeyDown={(e) => e.key === 'Enter' && submitLookup()}
              />
            </Field>
            <Btn full onClick={submitLookup} loading={loading}>Ver meu cartão</Btn>
          </div>
        )}

        {candidates && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 18 }}>
            <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 10 }}>Encontramos mais de um cadastro. Qual é você?</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {candidates.map((c) => (
                <button
                  key={c.client_id}
                  type="button"
                  onClick={() => pickCandidate(c.client_id)}
                  style={{ textAlign: 'left', border: '1px solid var(--rose-light)', background: 'var(--nude-light)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{c.phone || 'Sem telefone cadastrado'}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => setCandidates(null)}>Voltar</Btn>
            </div>
          </div>
        )}

        {card && (
          <div
            style={{
              background: 'linear-gradient(160deg, var(--rose-deep) 0%, var(--rose-dark) 100%)',
              borderRadius: 22,
              padding: 22,
              color: '#fff',
              boxShadow: '0 16px 40px rgba(139,77,85,0.35)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', opacity: 0.9, marginBottom: 16, textTransform: 'uppercase' }}>
              {card.professional_name}
            </div>

            <StampGrid goal={card.goal} filled={card.stamped_count} />

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cliente</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{card.client_name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Faltam</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {Math.max(0, card.goal - card.stamped_count)} atendimento{card.goal - card.stamped_count === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {card.reward_description && (
              <div style={{ marginTop: 14, fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
                🎁 Recompensa: {card.reward_description}
              </div>
            )}

            <div style={{ marginTop: 20, background: '#fff', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'center' }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code de fidelidade" width={200} height={200} />
              ) : (
                <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: 12 }}>
                  Gerando código...
                </div>
              )}
            </div>

            <p style={{ marginTop: 12, fontSize: 11, opacity: 0.75, textAlign: 'center', lineHeight: 1.5 }}>
              Mostre este código para a profissional escanear a cada atendimento.
              Ele se renova automaticamente.
            </p>
          </div>
        )}

        {card && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <Btn variant="ghost" onClick={() => { setCard(null); setQrDataUrl('') }}>Buscar outro cadastro</Btn>
          </div>
        )}
      </div>
    </div>
  )
}

export default PublicLoyalty
