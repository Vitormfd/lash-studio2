import { useEffect, useRef, useState } from 'react'
import { Btn, Field, Inp, Sel, Textarea } from './UI'
import Icon from './Icon'
import { callWhatsappReminders } from '../lib/supabase'
import {
  DEFAULT_MAINTENANCE_TEMPLATE,
  MAINTENANCE_PLACEHOLDERS,
  buildMaintenanceText,
  DEFAULT_WHATSAPP_AUTO_TEMPLATE,
  WHATSAPP_REMINDER_PLACEHOLDERS,
  buildWhatsappReminderText,
  resolveWhatsappAutoTemplate,
} from '../lib/whatsappReminder'

const PREVIEW_VARS = {
  firstName: 'Maria',
  fullName: 'Maria Silva',
  date: new Date().toLocaleDateString('pt-BR'),
  time: '14:30',
  service: 'Volume brasileiro',
}

const HOURS_OPTIONS = [
  { value: 1, label: '1 hora antes' },
  { value: 2, label: '2 horas antes' },
  { value: 3, label: '3 horas antes' },
  { value: 6, label: '6 horas antes' },
  { value: 12, label: '12 horas antes' },
  { value: 24, label: '1 dia antes' },
  { value: 48, label: '2 dias antes' },
]

const formatPhone = (digits) => {
  const d = String(digits || '').replace(/\D/g, '')
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return d
}

const isTouchDevice = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

const formatPairingCode = (code) => {
  const c = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

const MAINTENANCE_PREVIEW_VARS = { fullName: 'Maria Silva', service: 'Volume brasileiro', days: 21 }

const TokenChips = ({ items, onPick, disabled }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -8, marginBottom: 12 }}>
    {items.map((item) => (
      <button
        key={item.token}
        type="button"
        disabled={disabled}
        onClick={() => onPick(item.token)}
        title={`Inserir ${item.token}`}
        style={{
          fontSize: 11,
          color: 'var(--text-mid)',
          background: 'var(--off-white)',
          border: '1px solid var(--rose-light)',
          borderRadius: 999,
          padding: '4px 8px',
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <code style={{ fontSize: 11 }}>{item.token}</code> {item.label}
      </button>
    ))}
  </div>
)

const insertAtCursor = (elementId, value, setValue, token) => {
  const el = document.getElementById(elementId)
  if (!el) {
    setValue(`${value}${token}`)
    return
  }
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? start
  setValue(`${value.slice(0, start)}${token}${value.slice(end)}`)
  requestAnimationFrame(() => {
    el.focus()
    const pos = start + token.length
    el.setSelectionRange(pos, pos)
  })
}

/** Lembrete de manutenção: mesma conexão e mesmo cron do lembrete de atendimento */
const MaintenanceReminder = ({ config, setConfig, addToast, isDemo, connected }) => {
  const saved = String(config.whatsappMaintenanceTemplate || '').trim() || DEFAULT_MAINTENANCE_TEMPLATE
  const [template, setTemplate] = useState(saved)
  useEffect(() => {
    setTemplate(saved)
  }, [saved])
  const enabled = !!config.whatsappMaintenanceEnabled

  const toggle = () => {
    if (isDemo) return
    if (!enabled && !connected) {
      addToast('Conecte o WhatsApp primeiro.', 'warning')
      return
    }
    setConfig({ ...config, whatsappMaintenanceEnabled: !enabled })
    addToast(!enabled ? 'Lembrete de manutenção ligado!' : 'Lembrete de manutenção desligado.', 'success')
  }

  const save = () => {
    if (isDemo) return
    const next = String(template || '').trim() || DEFAULT_MAINTENANCE_TEMPLATE
    setTemplate(next)
    setConfig({ ...config, whatsappMaintenanceTemplate: next })
    addToast('Mensagem de manutenção salva!', 'success')
  }

  return (
    <div id="whatsapp-maintenance-reminder" style={{ borderTop: '1px solid var(--rose-light)', marginTop: 18, paddingTop: 18, scrollMarginTop: 80 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Lembrete de manutenção</h4>
      <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.55 }}>
        No dia em que a manutenção vence, o app chama a cliente no WhatsApp, se ela ainda não tiver horário marcado.
        O prazo é a média de retorno dela (ou o padrão da sua área, até ter 2 visitas concluídas).
      </p>

      {!connected ? (
        <p style={{ fontSize: 12, color: 'var(--text-mid)', background: 'var(--off-white)', border: '1px dashed var(--rose-light)', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
          Conecte o WhatsApp acima para ativar.
        </p>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Enviar lembrete de manutenção automaticamente</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={toggle}
              disabled={isDemo}
              style={{ width: 20, height: 20, accentColor: 'var(--rose-deep)' }}
            />
          </label>
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: -4, marginBottom: 16, lineHeight: 1.5 }}>
            Uma mensagem por visita, enviada entre 9h e 19h. Conta só atendimentos marcados como <b>Concluído</b>.
            Clientes atrasadas há mais de 7 dias ficam só na aba Manutenção, para você chamar manualmente.
          </p>

          <Field label="Mensagem de manutenção">
            <Textarea
              id="whatsapp-maintenance-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              maxLength={1500}
              disabled={isDemo}
              placeholder={DEFAULT_MAINTENANCE_TEMPLATE}
            />
          </Field>
          <TokenChips
            items={MAINTENANCE_PLACEHOLDERS}
            disabled={isDemo}
            onPick={(token) => insertAtCursor('whatsapp-maintenance-template', template, setTemplate, token)}
          />
          <div style={{ background: 'var(--off-white)', border: '1px dashed var(--rose-light)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Prévia
            </p>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
              {buildMaintenanceText(template, MAINTENANCE_PREVIEW_VARS)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={save} disabled={isDemo || template.trim() === saved}>
              <Icon name="check" size={14} color="#fff" /> Salvar mensagem
            </Btn>
            <Btn variant="ghost" onClick={() => setTemplate(DEFAULT_MAINTENANCE_TEMPLATE)} disabled={isDemo}>
              Restaurar padrão
            </Btn>
          </div>
        </>
      )}
    </div>
  )
}

const card = { background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }

const WhatsappAutoReminder = ({ config, setConfig, addToast, isDemo }) => {
  const [state, setState] = useState(isDemo ? 'not_created' : 'loading')
  const [number, setNumber] = useState('')
  const [qr, setQr] = useState(null)
  const [pairingCode, setPairingCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [testNumber, setTestNumber] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const savedAutoTemplate = resolveWhatsappAutoTemplate(config.whatsappAutoTemplate, config.whatsappReminderTemplate)
  const [autoTemplate, setAutoTemplate] = useState(savedAutoTemplate)

  useEffect(() => {
    setAutoTemplate(savedAutoTemplate)
  }, [savedAutoTemplate])
  // No celular não dá pra ler o QR da própria tela: usa código de pareamento.
  const [useCode, setUseCode] = useState(isTouchDevice)
  const [pairPhone, setPairPhone] = useState('')
  const pollRef = useRef(null)

  const enabled = !!config.whatsappAutoEnabled
  const hoursBefore = Number(config.whatsappAutoHoursBefore) > 0 ? Number(config.whatsappAutoHoursBefore) : 24
  const connected = state === 'open'

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }

  const refreshStatus = async () => {
    const res = await callWhatsappReminders('status')
    if (!res.ok) {
      setState('error')
      return res
    }
    setState(res.state)
    setNumber(res.number || '')
    if (res.state === 'open') {
      setQr(null)
      setPairingCode(null)
      stopPolling()
    }
    return res
  }

  useEffect(() => {
    if (isDemo) return undefined
    refreshStatus()
    return stopPolling
  }, [isDemo])

  const connect = async () => {
    if (isDemo) return
    const phoneDigits = pairPhone.replace(/\D/g, '')
    if (useCode && phoneDigits.length < 10) {
      addToast('Digite o número do WhatsApp do estúdio com DDD.', 'warning')
      return
    }
    setBusy(true)
    const res = await callWhatsappReminders('connect', useCode ? { number: phoneDigits } : {})
    setBusy(false)
    if (!res.ok) {
      addToast(res.error || 'Não foi possível gerar o QR Code.', 'error')
      return
    }
    if (res.state === 'open') {
      await refreshStatus()
      return
    }
    if (useCode && !res.pairingCode) {
      addToast('O servidor não gerou o código. Tente pelo QR Code.', 'error')
    }
    setState('connecting')
    setQr(res.qr || null)
    setPairingCode(useCode ? res.pairingCode || null : null)
    stopPolling()
    let ticks = 0
    pollRef.current = setInterval(async () => {
      ticks += 1
      const status = await refreshStatus()
      if (status?.state === 'open') {
        addToast('WhatsApp conectado!', 'success')
      } else if (ticks >= 40) {
        // ~2 min: QR Code expira, pede um novo.
        stopPolling()
        setQr(null)
        setPairingCode(null)
        setState('close')
      }
    }, 3000)
  }

  const disconnect = async () => {
    if (isDemo) return
    if (!window.confirm('Desconectar o WhatsApp? Os lembretes automáticos serão desligados.')) return
    setBusy(true)
    const res = await callWhatsappReminders('disconnect')
    setBusy(false)
    if (!res.ok) {
      addToast(res.error || 'Não foi possível desconectar.', 'error')
      return
    }
    stopPolling()
    setQr(null)
    setState('not_created')
    setNumber('')
    setConfig({ ...config, whatsappAutoEnabled: false })
    addToast('WhatsApp desconectado.', 'info')
  }

  const toggleEnabled = () => {
    if (isDemo) return
    if (!enabled && !connected) {
      addToast('Conecte o WhatsApp primeiro.', 'warning')
      return
    }
    setConfig({ ...config, whatsappAutoEnabled: !enabled })
    addToast(!enabled ? 'Lembretes automáticos ligados!' : 'Lembretes automáticos desligados.', 'success')
  }

  const saveTemplate = () => {
    if (isDemo) return
    const next = String(autoTemplate || '').trim() || DEFAULT_WHATSAPP_AUTO_TEMPLATE
    setAutoTemplate(next)
    setConfig({ ...config, whatsappAutoTemplate: next })
    addToast('Mensagem do lembrete salva!', 'success')
  }

  const insertToken = (token) => insertAtCursor('whatsapp-auto-template', autoTemplate, setAutoTemplate, token)

  const sendTest = async () => {
    if (isDemo) return
    const digits = testNumber.replace(/\D/g, '')
    if (digits.length < 10) {
      addToast('Digite um número com DDD.', 'warning')
      return
    }
    setTestBusy(true)
    const text = buildWhatsappReminderText(autoTemplate, PREVIEW_VARS)
    const res = await callWhatsappReminders('test', { number: digits, text })
    setTestBusy(false)
    if (res.ok) addToast('Mensagem de teste enviada!', 'success')
    else addToast(res.error || 'Falha ao enviar o teste.', 'error')
  }

  const statusLabel = {
    loading: { text: 'Verificando...', color: 'var(--text-light)' },
    open: { text: number ? `Conectado: ${formatPhone(number)}` : 'Conectado', color: '#3F8F5A' },
    connecting: { text: useCode ? 'Aguardando o código no WhatsApp' : 'Aguardando leitura do QR Code', color: '#C98A2E' },
    close: { text: 'Desconectado', color: '#C5515F' },
    not_created: { text: 'Não conectado', color: 'var(--text-light)' },
    error: { text: 'Servidor do WhatsApp indisponível', color: '#C5515F' },
  }[state] || { text: state, color: 'var(--text-light)' }

  return (
    <div id="whatsapp-auto-reminder" style={{ ...card, scrollMarginTop: 80 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Lembrete automático no WhatsApp</h3>
      <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.55 }}>
        Conecte o WhatsApp do estúdio e o app manda o lembrete abaixo sozinho para cada cliente antes do atendimento.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: statusLabel.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: statusLabel.color, fontWeight: 500 }}>{statusLabel.text}</span>
      </div>

      {state === 'connecting' && useCode && pairingCode && (
        <div style={{ background: 'var(--off-white)', border: '1px dashed var(--rose-light)', borderRadius: 12, padding: 14, marginBottom: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Seu código
          </p>
          <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text)', margin: '6px 0 10px', fontFamily: 'monospace' }}>
            {formatPairingCode(pairingCode)}
          </p>
          <Btn
            variant="outline"
            sm
            onClick={() => {
              navigator.clipboard?.writeText(String(pairingCode).replace(/[^A-Za-z0-9]/g, ''))
                .then(() => addToast('Código copiado!', 'success'))
                .catch(() => {})
            }}
          >
            Copiar código
          </Btn>
          <ol style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6, textAlign: 'left', margin: '12px 0 0', paddingLeft: 18 }}>
            <li>Abra o WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>.</li>
            <li>Toque em <b>Conectar com número de telefone</b>.</li>
            <li>Digite o código acima e volte para cá. Ele vale por cerca de 1 minuto.</li>
          </ol>
          <p style={{ fontSize: 11, color: 'var(--text-light)', margin: '8px 0 0', lineHeight: 1.5 }}>
            Se o WhatsApp mostrar uma notificação pedindo o código, é só tocar nela e digitar.
          </p>
        </div>
      )}

      {state === 'connecting' && !useCode && qr && (
        <div style={{ background: 'var(--off-white)', border: '1px dashed var(--rose-light)', borderRadius: 12, padding: 14, marginBottom: 14, textAlign: 'center' }}>
          <img src={qr} alt="QR Code do WhatsApp" style={{ width: 220, height: 220, background: '#fff', borderRadius: 8 }} />
          <p style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.55, marginTop: 10, marginBottom: 0 }}>
            No celular do estúdio: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para o código.
          </p>
        </div>
      )}

      {!connected && useCode && (
        <Field label="Número do WhatsApp do estúdio">
          <Inp
            value={pairPhone}
            onChange={(e) => setPairPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            inputMode="tel"
            disabled={isDemo}
          />
        </Field>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: connected ? 18 : 0 }}>
        {!connected && (
          <Btn onClick={connect} loading={busy} disabled={isDemo || state === 'loading'}>
            <Icon name="whatsapp" size={14} color="#fff" />{' '}
            {useCode
              ? (state === 'connecting' ? 'Gerar novo código' : 'Gerar código de conexão')
              : (state === 'connecting' ? 'Gerar novo QR Code' : 'Conectar WhatsApp')}
          </Btn>
        )}
        {(connected || state === 'connecting' || state === 'close') && (
          <Btn variant="ghost" onClick={disconnect} disabled={isDemo || busy}>
            Desconectar
          </Btn>
        )}
      </div>

      {!connected && (
        <button
          type="button"
          onClick={() => {
            stopPolling()
            setQr(null)
            setPairingCode(null)
            if (state === 'connecting') setState('close')
            setUseCode((v) => !v)
          }}
          disabled={isDemo}
          style={{ display: 'block', marginTop: 12, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--rose-deep)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {useCode ? 'Prefiro ler o QR Code de outro aparelho' : 'Está neste celular? Conectar com código'}
        </button>
      )}

      {connected && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Enviar lembretes automaticamente</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={toggleEnabled}
              disabled={isDemo}
              style={{ width: 20, height: 20, accentColor: 'var(--rose-deep)' }}
            />
          </label>
          <Field label="Quando enviar">
            <Sel
              value={hoursBefore}
              onChange={(e) => setConfig({ ...config, whatsappAutoHoursBefore: Number(e.target.value) })}
              disabled={isDemo}
            >
              {HOURS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Sel>
          </Field>
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: -4, marginBottom: 16, lineHeight: 1.5 }}>
            Vale para agendamentos pendentes e confirmados. Se o horário for remarcado, o lembrete é enviado de novo.
          </p>

          <Field label="Mensagem do lembrete">
            <Textarea
              id="whatsapp-auto-template"
              value={autoTemplate}
              onChange={(e) => setAutoTemplate(e.target.value)}
              rows={5}
              maxLength={1500}
              disabled={isDemo}
              placeholder={DEFAULT_WHATSAPP_AUTO_TEMPLATE}
            />
          </Field>
          <TokenChips items={WHATSAPP_REMINDER_PLACEHOLDERS} disabled={isDemo} onPick={insertToken} />
          <div style={{ background: 'var(--off-white)', border: '1px dashed var(--rose-light)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Prévia
            </p>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
              {buildWhatsappReminderText(autoTemplate, PREVIEW_VARS)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <Btn onClick={saveTemplate} disabled={isDemo || autoTemplate.trim() === savedAutoTemplate}>
              <Icon name="check" size={14} color="#fff" /> Salvar mensagem
            </Btn>
            <Btn variant="ghost" onClick={() => setAutoTemplate(DEFAULT_WHATSAPP_AUTO_TEMPLATE)} disabled={isDemo}>
              Restaurar padrão
            </Btn>
          </div>

          <Field label="Enviar mensagem de teste para">
            <div style={{ display: 'flex', gap: 8 }}>
              <Inp
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                disabled={isDemo}
              />
              <Btn variant="outline" onClick={sendTest} loading={testBusy} disabled={isDemo}>
                Testar
              </Btn>
            </div>
          </Field>
        </>
      )}

      <MaintenanceReminder config={config} setConfig={setConfig} addToast={addToast} isDemo={isDemo} connected={connected} />
    </div>
  )
}

export default WhatsappAutoReminder
