import { useEffect, useState } from 'react'
import { Btn, Field, Inp, Textarea } from './UI'
import Icon from './Icon'
import {
  DEFAULT_BOOKING_CONFIRM_TEMPLATE,
  WHATSAPP_REMINDER_PLACEHOLDERS,
  buildBookingConfirmText,
  toWhatsappDigits,
} from '../lib/whatsappReminder'

const PREVIEW_VARS = {
  firstName: 'Maria',
  fullName: 'Maria Silva',
  date: 'sexta-feira, 10 de outubro',
  time: '14:30',
  service: 'Volume brasileiro',
}

const maskPhoneBr = (value) => {
  const d = String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const card = { background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }

const BookingWhatsappConfirm = ({ config, setConfig, addToast, isDemo = false }) => {
  const [phone, setPhone] = useState(() => maskPhoneBr(config.businessWhatsapp))
  const [template, setTemplate] = useState(() => config.bookingConfirmTemplate || DEFAULT_BOOKING_CONFIRM_TEMPLATE)

  useEffect(() => {
    setPhone(maskPhoneBr(config.businessWhatsapp))
    setTemplate(config.bookingConfirmTemplate || DEFAULT_BOOKING_CONFIRM_TEMPLATE)
  }, [config.businessWhatsapp, config.bookingConfirmTemplate])

  const insertToken = (token) => {
    const el = document.getElementById('booking-confirm-template')
    if (!el) {
      setTemplate((prev) => `${prev}${token}`)
      return
    }
    const start = el.selectionStart ?? template.length
    const end = el.selectionEnd ?? start
    setTemplate(`${template.slice(0, start)}${token}${template.slice(end)}`)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  const save = () => {
    if (isDemo) {
      addToast('Modo demonstracao: configuracoes em somente leitura.', 'info')
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (digits && !toWhatsappDigits(digits)) {
      addToast('Informe o WhatsApp com DDD, ex.: (11) 99999-9999.', 'error')
      return
    }
    const trimmed = template.trim()
    setConfig({
      ...config,
      businessWhatsapp: digits,
      // Guardar vazio quando igual ao padrão: se o texto padrão melhorar, a conta acompanha.
      bookingConfirmTemplate: trimmed === DEFAULT_BOOKING_CONFIRM_TEMPLATE ? '' : trimmed,
    })
    addToast(digits ? 'Confirmação pelo WhatsApp salva!' : 'Botão de confirmação desativado.', 'success')
  }

  return (
    <div style={card}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Confirmação do agendamento online</h3>
      <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.55 }}>
        Quando a cliente termina o agendamento pelo link, aparece um botão para ela confirmar enviando esta mensagem para o seu WhatsApp.
        Deixe o número em branco para esconder o botão.
      </p>

      <Field label="Seu WhatsApp">
        <Inp
          value={phone}
          onChange={(e) => setPhone(maskPhoneBr(e.target.value))}
          placeholder="(11) 99999-9999"
          inputMode="tel"
          disabled={isDemo}
        />
      </Field>

      <Field label="Mensagem que a cliente envia">
        <Textarea
          id="booking-confirm-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={7}
          maxLength={1500}
          disabled={isDemo}
          placeholder={DEFAULT_BOOKING_CONFIRM_TEMPLATE}
        />
      </Field>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -8, marginBottom: 14 }}>
        {WHATSAPP_REMINDER_PLACEHOLDERS.map((item) => (
          <button
            key={item.token}
            type="button"
            disabled={isDemo}
            onClick={() => insertToken(item.token)}
            title={`Inserir ${item.token}`}
            style={{
              fontSize: 11,
              color: 'var(--text-mid)',
              background: 'var(--off-white)',
              border: '1px solid var(--rose-light)',
              borderRadius: 999,
              padding: '4px 8px',
              cursor: isDemo ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <code style={{ fontSize: 11 }}>{item.token}</code> {item.label}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--off-white)', border: '1px dashed var(--rose-light)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Prévia
        </p>
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
          {buildBookingConfirmText(template, PREVIEW_VARS)}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn onClick={save} disabled={isDemo}>
          <Icon name="check" size={14} color="#fff" /> Salvar
        </Btn>
        <Btn variant="ghost" onClick={() => setTemplate(DEFAULT_BOOKING_CONFIRM_TEMPLATE)} disabled={isDemo}>
          Restaurar padrão
        </Btn>
      </div>
    </div>
  )
}

export default BookingWhatsappConfirm
