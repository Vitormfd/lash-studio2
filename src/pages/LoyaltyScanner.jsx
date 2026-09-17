import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { getClient, DB } from '../lib/supabase'
import { useOperator } from '../lib/operator'
import { Btn, Field, Inp, Textarea } from '../components/UI'
import Icon from '../components/Icon'

const SCANNER_ELEMENT_ID = 'loyalty-qr-reader'

const LoyaltyScanner = ({ userId, isDemo, addToast, canUserEdit, onBlockedAction }) => {
  const { operator } = useOperator()
  const [cfg, setCfg] = useState({ goalCount: 10, rewardDescription: '', active: true })
  const [savingCfg, setSavingCfg] = useState(false)
  const [loadingCfg, setLoadingCfg] = useState(true)

  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [result, setResult] = useState(null)
  const scannerRef = useRef(null)
  const busyRef = useRef(false)

  const shareLink = userId && userId !== 'demo_user' ? `${window.location.origin}/fidelidade/${userId}` : ''
  const [posterQr, setPosterQr] = useState('')

  useEffect(() => {
    let alive = true
    DB.getLoyaltyConfig(userId).then((c) => { if (alive) setCfg(c) }).finally(() => { if (alive) setLoadingCfg(false) })
    return () => { alive = false }
  }, [userId])

  useEffect(() => {
    if (!shareLink) { setPosterQr(''); return undefined }
    let alive = true
    QRCode.toDataURL(shareLink, { margin: 1, width: 220 })
      .then((url) => { if (alive) setPosterQr(url) })
      .catch(() => { if (alive) setPosterQr('') })
    return () => { alive = false }
  }, [shareLink])

  const saveCfg = async () => {
    if (onBlockedAction && onBlockedAction('Desbloqueie para configurar a fidelidade.')) return
    setSavingCfg(true)
    try {
      await DB.saveLoyaltyConfig(userId, cfg)
      addToast?.('Configuração de fidelidade salva!', 'success')
    } catch {
      addToast?.('Não foi possível salvar agora.', 'error')
    } finally {
      setSavingCfg(false)
    }
  }

  const copyShareLink = async () => {
    if (!shareLink) {
      addToast?.('Link indisponível no modo de teste.', 'warning')
      return
    }
    try {
      await navigator.clipboard.writeText(shareLink)
      addToast?.('Link copiado!', 'success')
    } catch {
      window.prompt('Copie o link de fidelidade:', shareLink)
    }
  }

  const stopScanner = async () => {
    const instance = scannerRef.current
    scannerRef.current = null
    if (instance) {
      try { await instance.stop() } catch {}
      try { await instance.clear() } catch {}
    }
    setScanning(false)
  }

  const handleDecoded = async (decodedText) => {
    if (busyRef.current) return
    busyRef.current = true
    await stopScanner()
    setScanError('')
    try {
      const sb = getClient()
      if (!sb) throw new Error('offline')
      const { data, error } = await sb.rpc('redeem_loyalty_scan_token', {
        p_token: String(decodedText || '').trim(),
        p_team_member_id: operator?.id || null,
      })
      if (error) throw error
      if (!data?.ok) {
        setScanError(
          data?.reason === 'invalid_or_expired'
            ? 'Código expirado ou já usado. Peça para a cliente atualizar a tela.'
            : 'Não foi possível confirmar o código.'
        )
        return
      }
      setResult(data)
      addToast?.(
        data.reward_unlocked
          ? `🎉 ${data.client_name} atingiu a meta! Aplique a recompensa.`
          : `Selo adicionado para ${data.client_name}: ${data.stamped_count}/${data.goal}`,
        'success'
      )
    } catch {
      setScanError('Não foi possível registrar o selo agora. Tente novamente.')
    } finally {
      busyRef.current = false
    }
  }

  const startScanner = async () => {
    if (onBlockedAction && onBlockedAction('Desbloqueie para marcar a fidelidade das clientes.')) return
    if (isDemo) {
      addToast?.('Leitor de QR indisponível no modo de teste.', 'warning')
      return
    }
    setResult(null)
    setScanError('')
    setScanning(true)
  }

  useEffect(() => {
    if (!scanning) return undefined
    let cancelled = false
    let instance = null
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (cancelled) return
      instance = new Html5Qrcode(SCANNER_ELEMENT_ID)
      scannerRef.current = instance
      instance
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decodedText) => { if (!cancelled) handleDecoded(decodedText) },
          () => {}
        )
        .catch(() => {
          if (!cancelled) {
            setScanError('Não foi possível acessar a câmera. Verifique a permissão do navegador.')
            setScanning(false)
          }
        })
    })
    return () => {
      cancelled = true
      if (scannerRef.current === instance) stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
      <h1 className="serif" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Fidelidade</h1>
      <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 20 }}>
        A cada atendimento, escaneie o QR code que a cliente mostra na tela dela para dar 1 selo.
      </p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 18, marginBottom: 16 }}>
        {!scanning && (
          <Btn full onClick={startScanner}>
            <Icon name="check" size={16} /> Escanear QR da cliente
          </Btn>
        )}

        {scanning && (
          <div>
            <div id={SCANNER_ELEMENT_ID} style={{ width: '100%', borderRadius: 12, overflow: 'hidden' }} />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              <Btn variant="ghost" onClick={stopScanner}>Cancelar</Btn>
            </div>
          </div>
        )}

        {scanError && (
          <div style={{ marginTop: 12, border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            {scanError}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 14, border: '1px solid var(--rose-light)', background: 'var(--nude-light)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{result.client_name}</p>
            {result.reward_unlocked ? (
              <p style={{ fontSize: 13, color: 'var(--rose-dark)', fontWeight: 600 }}>
                🎉 Meta atingida! Recompensa: {result.reward_description || 'combine com a cliente'}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-mid)' }}>{result.stamped_count} de {result.goal} selos</p>
            )}
            <div style={{ marginTop: 10 }}>
              <Btn sm onClick={startScanner}>Escanear outro</Btn>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Configuração da meta</h2>
        {loadingCfg ? (
          <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Carregando...</p>
        ) : (
          <>
            <Field label="Atendimentos até a recompensa">
              <Inp
                type="number"
                min={1}
                value={cfg.goalCount}
                onChange={(e) => setCfg((c) => ({ ...c, goalCount: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </Field>
            <Field label="Descrição da recompensa">
              <Textarea
                value={cfg.rewardDescription}
                onChange={(e) => setCfg((c) => ({ ...c, rewardDescription: e.target.value }))}
                placeholder="Ex: 1 sessão de manutenção grátis"
              />
            </Field>
            <Btn onClick={saveCfg} loading={savingCfg}>Salvar</Btn>
          </>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--rose-light)', borderRadius: 16, padding: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Cartão da cliente</h2>
        <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 12, lineHeight: 1.6 }}>
          Compartilhe este link para a cliente acompanhar o progresso dela e mostrar o QR na hora do atendimento.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Btn variant="outline" onClick={copyShareLink}>Copiar link</Btn>
        </div>
        {posterQr && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={posterQr} alt="QR do cartão de fidelidade" width={160} height={160} />
          </div>
        )}
      </div>
    </div>
  )
}

export default LoyaltyScanner
