import { useEffect, useState } from 'react'
import { Btn, Field, Inp, Sel, Textarea, inputStyle } from './UI'
import Icon from './Icon'
import {
  DEFAULT_BIRTHDAY_TEMPLATE,
  DEFAULT_BOOKING_POLICY,
  DEFAULT_CONSENT_TEXT,
  FEE_METHODS,
  PIX_KEY_TYPES,
  bookingLinkFor,
  depositAmountFor,
  getExtras,
  isValidSlug,
  slugify,
} from '../lib/extras'
import { normalizePixKey } from '../lib/pix'
import { appointmentsCsv, clientsCsv, downloadText, expensesCsv } from '../lib/csv'
import { uid } from '../lib/supabase'

const money = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const card = { background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 560, marginTop: 14 }
const hint = { fontSize: 12, color: 'var(--text-light)', lineHeight: 1.55, margin: '0 0 12px' }

/** Interruptor: liga/desliga o recurso e já salva. */
const Toggle = ({ on, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!on)}
    style={{
      width: 46,
      height: 26,
      borderRadius: 999,
      border: 'none',
      padding: 3,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: on ? 'var(--rose-deep)' : 'var(--border-mid, #d9cdd0)',
      display: 'flex',
      justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'background 0.15s',
      flexShrink: 0,
    }}
  >
    <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
  </button>
)

const Section = ({ title, description, on, onToggle, busy, children }) => (
  <div style={card}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{title}</h3>
        <p style={{ ...hint, marginBottom: on && children ? 14 : 0 }}>{description}</p>
      </div>
      {onToggle && <Toggle on={on} onChange={onToggle} label={title} disabled={busy} />}
    </div>
    {on && children}
  </div>
)

const ExtrasSettings = ({ config, setConfig, addToast, userId, isDemo, exportData }) => {
  const extras = getExtras(config)
  const [busy, setBusy] = useState('')
  const [profile, setProfile] = useState(extras.profile)
  const [slug, setSlug] = useState(config.bookingSlug || '')
  const [deposit, setDeposit] = useState(extras.deposit)
  const [records, setRecords] = useState(extras.clientRecords)
  const [birthdays, setBirthdays] = useState(extras.birthdays)
  const [fin, setFin] = useState(extras.financeExtras)

  useEffect(() => {
    const e = getExtras(config)
    setProfile(e.profile)
    setDeposit(e.deposit)
    setRecords(e.clientRecords)
    setBirthdays(e.birthdays)
    setFin(e.financeExtras)
    setSlug(config.bookingSlug || '')
  }, [config])

  /** Salva um pedaço dos extras. Devolve true quando gravou. */
  const save = async (key, value, { okMsg = 'Salvo!', bookingSlug } = {}) => {
    setBusy(key)
    try {
      const next = { ...config, extras: { ...getExtras(config), [key]: value } }
      if (bookingSlug !== undefined) next.bookingSlug = bookingSlug
      const ok = await setConfig(next)
      if (ok !== false) addToast(okMsg, 'success')
      return ok !== false
    } finally {
      setBusy('')
    }
  }

  const toggle = (key, draft, setDraft, labelOn, labelOff) => (on) => {
    const value = { ...draft, enabled: on }
    setDraft(value)
    save(key, value, { okMsg: on ? labelOn : labelOff }).then((ok) => { if (!ok) setDraft(draft) })
  }

  // ─── Link e perfil ───
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.easystudio.com.br'
  const cleanSlug = slugify(slug)
  const slugError = cleanSlug && !isValidSlug(cleanSlug) ? 'Use de 3 a 40 letras, números ou hífen.' : ''
  const saveProfile = async () => {
    if (slugError) return addToast(slugError, 'warning')
    if (isDemo && cleanSlug) return addToast('Na demonstração o link não é publicado. Crie sua conta para ter o seu.', 'info')
    await save('profile', profile, { okMsg: 'Link e perfil salvos!', bookingSlug: cleanSlug })
  }

  // ─── Sinal ───
  const pixOk = !!normalizePixKey(deposit.pixKeyType, deposit.pixKey)
  const exampleDeposit = depositAmountFor({ ...deposit, enabled: true }, 150)
  const saveDeposit = async () => {
    if (!pixOk) return addToast('Confira a chave Pix: ela não está no formato do tipo escolhido.', 'warning')
    if (!(Number(deposit.value) > 0)) return addToast('Informe o valor do sinal.', 'warning')
    if (deposit.type === 'percent' && Number(deposit.value) > 100) return addToast('A porcentagem vai até 100%.', 'warning')
    if (!deposit.holderName.trim()) return addToast('Informe o nome de quem recebe o Pix.', 'warning')
    await save('deposit', deposit, { okMsg: 'Sinal salvo! Ele aparece nas próximas reservas pelo link.' })
  }

  // ─── Custos fixos ───
  const fixedTotal = fin.fixedCosts.reduce((s, c) => s + Number(c.amount || 0), 0)
  const setCost = (id, patch) => setFin((f) => ({ ...f, fixedCosts: f.fixedCosts.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  // ─── Exportar ───
  const stamp = new Date().toISOString().slice(0, 10)
  const exportFile = (kind) => {
    const { clients = [], appointments = [], services = [], cashExpenses = [] } = exportData || {}
    if (kind === 'clients') downloadText(`clientes-${stamp}.csv`, clientsCsv(clients))
    if (kind === 'appointments') downloadText(`agendamentos-${stamp}.csv`, appointmentsCsv(appointments, clients, services))
    if (kind === 'expenses') downloadText(`saidas-${stamp}.csv`, expensesCsv(cashExpenses))
    addToast('Planilha baixada.', 'success')
  }

  return (
    <div>
      <p style={{ ...hint, maxWidth: 560 }}>
        Recursos opcionais: ligue só o que fizer sentido para você. Desligado, nada muda no app nem no seu link.
      </p>

      <Section
        title="Link curto e perfil"
        description="Um endereço fácil de lembrar e uma página com o nome do seu espaço, endereço, Instagram e regras de agendamento."
        on={profile.enabled}
        busy={busy === 'profile'}
        onToggle={toggle('profile', profile, setProfile, 'Perfil ligado no seu link.', 'Perfil desligado.')}
      >
        <Field label="Endereço do link">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-light)' }}>{origin.replace(/^https?:\/\//, '')}/agendar/</span>
            <Inp
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={slugify(profile.businessName) || 'estudio-da-ana'}
              autoCapitalize="none"
              autoCorrect="off"
              style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }}
            />
          </div>
          {slugError && <p style={{ fontSize: 12, color: '#9B3D4A', marginTop: 4 }}>{slugError}</p>}
          {!slugError && cleanSlug && cleanSlug !== slug.trim() && (
            <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>Vai ficar assim: /agendar/{cleanSlug}</p>
          )}
          {!slug && profile.businessName && (
            <button type="button" onClick={() => setSlug(slugify(profile.businessName))} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--rose-deep)', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              Usar "{slugify(profile.businessName)}"
            </button>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
            O link antigo continua funcionando. {config.bookingSlug ? `Seu link: ${bookingLinkFor(origin, userId, config.bookingSlug)}` : ''}
          </p>
        </Field>
        <Field label="Nome do seu espaço">
          <Inp value={profile.businessName} onChange={(e) => setProfile((p) => ({ ...p, businessName: e.target.value }))} placeholder="Ex.: Estúdio da Ana" maxLength={60} />
        </Field>
        <Field label="Endereço (opcional)">
          <Inp value={profile.address} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} placeholder="Rua, número, bairro, cidade" maxLength={160} />
        </Field>
        <Field label="Instagram (opcional)">
          <Inp value={profile.instagram} onChange={(e) => setProfile((p) => ({ ...p, instagram: e.target.value.replace(/^@+/, '') }))} placeholder="seuperfil" maxLength={40} />
        </Field>
        <Field label="Regras do agendamento (opcional)">
          <Textarea rows={3} value={profile.policy} onChange={(e) => setProfile((p) => ({ ...p, policy: e.target.value }))} placeholder={DEFAULT_BOOKING_POLICY} maxLength={600} />
          {!profile.policy && (
            <button type="button" onClick={() => setProfile((p) => ({ ...p, policy: DEFAULT_BOOKING_POLICY }))} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--rose-deep)', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              Usar o texto sugerido
            </button>
          )}
        </Field>
        <Btn onClick={saveProfile} loading={busy === 'profile'}><Icon name="check" size={14} color="#fff" /> Salvar link e perfil</Btn>
      </Section>

      <Section
        title="Sinal via Pix no agendamento online"
        description="Quem marca pelo link vê o valor do sinal e um Pix copia e cola para a sua chave. O dinheiro cai direto na sua conta; você confirma o recebimento na agenda."
        on={deposit.enabled}
        busy={busy === 'deposit'}
        onToggle={toggle('deposit', deposit, setDeposit, 'Sinal ligado. Confira a chave Pix e salve.', 'Sinal desligado.')}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Field label="Tipo de sinal" half>
            <Sel value={deposit.type} onChange={(e) => setDeposit((d) => ({ ...d, type: e.target.value }))}>
              <option value="fixed">Valor fixo (R$)</option>
              <option value="percent">Porcentagem do serviço (%)</option>
            </Sel>
          </Field>
          <Field label={deposit.type === 'percent' ? 'Porcentagem' : 'Valor (R$)'} half>
            <Inp type="number" min={0} step={deposit.type === 'percent' ? 5 : 1} value={deposit.value || ''} onChange={(e) => setDeposit((d) => ({ ...d, value: e.target.value }))} />
          </Field>
        </div>
        <p style={hint}>Exemplo: num serviço de R$ 150,00 o sinal fica em {money(exampleDeposit)}.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Field label="Tipo da chave Pix" half>
            <Sel value={deposit.pixKeyType} onChange={(e) => setDeposit((d) => ({ ...d, pixKeyType: e.target.value }))}>
              {PIX_KEY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Sel>
          </Field>
          <Field label="Chave Pix" half>
            <Inp value={deposit.pixKey} onChange={(e) => setDeposit((d) => ({ ...d, pixKey: e.target.value }))} placeholder={deposit.pixKeyType === 'phone' ? '(11) 98765-4321' : ''} />
          </Field>
        </div>
        {deposit.pixKey && !pixOk && <p style={{ fontSize: 12, color: '#9B3D4A', margin: '-6px 0 10px' }}>Essa chave não está no formato de {PIX_KEY_TYPES.find((t) => t.id === deposit.pixKeyType)?.label}.</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Field label="Nome de quem recebe" half>
            <Inp value={deposit.holderName} onChange={(e) => setDeposit((d) => ({ ...d, holderName: e.target.value }))} placeholder="Como aparece no banco" maxLength={60} />
          </Field>
          <Field label="Cidade" half>
            <Inp value={deposit.city} onChange={(e) => setDeposit((d) => ({ ...d, city: e.target.value }))} placeholder={config.city || 'Sua cidade'} maxLength={40} />
          </Field>
        </div>
        <p style={hint}>
          O sinal não bloqueia a reserva: o horário fica marcado como "sinal pendente" e você toca em "Sinal recebido" quando o Pix cair. Agendamentos feitos por você no app não pedem sinal.
        </p>
        <Btn onClick={saveDeposit} loading={busy === 'deposit'}><Icon name="check" size={14} color="#fff" /> Salvar sinal</Btn>
      </Section>

      <Section
        title="Ficha da cliente"
        description="Anamnese, termo de consentimento assinado no celular e fotos de antes e depois, guardados com segurança em cada cliente."
        on={records.enabled}
        busy={busy === 'clientRecords'}
        onToggle={toggle('clientRecords', records, setRecords, 'Ficha ligada: abra uma cliente e toque em "Ficha".', 'Ficha desligada. As fichas já salvas continuam guardadas.')}
      >
        <Field label="Texto do termo de consentimento">
          <Textarea rows={5} value={records.consentText || DEFAULT_CONSENT_TEXT} onChange={(e) => setRecords((r) => ({ ...r, consentText: e.target.value }))} maxLength={2000} />
        </Field>
        <Btn onClick={() => save('clientRecords', { ...records, consentText: records.consentText || DEFAULT_CONSENT_TEXT }, { okMsg: 'Termo salvo!' })} loading={busy === 'clientRecords'}>
          <Icon name="check" size={14} color="#fff" /> Salvar termo
        </Btn>
      </Section>

      <Section
        title="Aniversariantes"
        description="Campo de aniversário no cadastro da cliente e um aviso no painel com as aniversariantes da semana, com mensagem pronta para o WhatsApp."
        on={birthdays.enabled}
        busy={busy === 'birthdays'}
        onToggle={toggle('birthdays', birthdays, setBirthdays, 'Aniversariantes ligado.', 'Aniversariantes desligado.')}
      >
        <Field label="Mensagem de aniversário">
          <Textarea rows={3} value={birthdays.template || DEFAULT_BIRTHDAY_TEMPLATE} onChange={(e) => setBirthdays((b) => ({ ...b, template: e.target.value }))} maxLength={600} />
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{'{nome}'} vira o primeiro nome da cliente.</p>
        </Field>
        <Btn onClick={() => save('birthdays', { ...birthdays, template: birthdays.template || DEFAULT_BIRTHDAY_TEMPLATE }, { okMsg: 'Mensagem salva!' })} loading={busy === 'birthdays'}>
          <Icon name="check" size={14} color="#fff" /> Salvar mensagem
        </Btn>
      </Section>

      <Section
        title="Custos fixos e taxas"
        description="Desconta do lucro o que você paga todo mês (aluguel, MEI, internet) e a taxa da maquininha em cada forma de pagamento."
        on={fin.enabled}
        busy={busy === 'financeExtras'}
        onToggle={toggle('financeExtras', fin, setFin, 'Custos fixos e taxas ligados.', 'Custos fixos e taxas desligados.')}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Custos fixos por mês</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginBottom: 8 }}>
          {fin.fixedCosts.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
              <Inp value={c.name} onChange={(e) => setCost(c.id, { name: e.target.value })} placeholder="Ex.: Aluguel" style={{ ...inputStyle, flex: '2 1 0', width: 'auto', minWidth: 0 }} maxLength={60} />
              <Inp type="number" min={0} step="0.01" value={c.amount || ''} onChange={(e) => setCost(c.id, { amount: e.target.value })} placeholder="R$" style={{ ...inputStyle, flex: '1 1 0', width: 'auto', minWidth: 0 }} />
              <button type="button" aria-label={`Remover ${c.name || 'custo'}`} onClick={() => setFin((f) => ({ ...f, fixedCosts: f.fixedCosts.filter((x) => x.id !== c.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>
                <Icon name="trash" size={14} color="#C5515F" />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <Btn variant="ghost" sm onClick={() => setFin((f) => ({ ...f, fixedCosts: [...f.fixedCosts, { id: uid(), name: '', amount: '' }] }))}>
            <Icon name="plus" size={12} /> Adicionar custo
          </Btn>
          <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>Total: <strong>{money(fixedTotal)}</strong>/mês</span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Taxa por forma de pagamento (%)</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
          {FEE_METHODS.map((m) => (
            <Field key={m.id} label={m.label}>
              <Inp type="number" min={0} max={30} step="0.01" value={fin.fees[m.id] || ''} placeholder="0" onChange={(e) => setFin((f) => ({ ...f, fees: { ...f.fees, [m.id]: e.target.value } }))} />
            </Field>
          ))}
        </div>
        <Btn onClick={() => save('financeExtras', fin, { okMsg: 'Custos e taxas salvos! O lucro do Financeiro já considera.' })} loading={busy === 'financeExtras'}>
          <Icon name="check" size={14} color="#fff" /> Salvar custos e taxas
        </Btn>
      </Section>

      <Section
        title="Baixar meus dados"
        description="Planilhas com tudo o que está no app, para guardar uma cópia ou abrir no Excel e no Google Planilhas."
        on
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="outline" sm onClick={() => exportFile('clients')}><Icon name="users" size={12} /> Clientes</Btn>
          <Btn variant="outline" sm onClick={() => exportFile('appointments')}><Icon name="calendar" size={12} /> Agendamentos</Btn>
          <Btn variant="outline" sm onClick={() => exportFile('expenses')}><Icon name="dollar" size={12} /> Saídas do caixa</Btn>
        </div>
      </Section>
    </div>
  )
}

export default ExtrasSettings
