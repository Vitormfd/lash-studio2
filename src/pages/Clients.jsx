import { useState } from 'react'
import Modal from '../components/Modal'
import { Btn, Field, Inp, Textarea, inputStyle } from '../components/UI'
import Icon from '../components/Icon'
import { uid } from '../lib/supabase'
import { statusMeta } from '../lib/appointmentStatus'

const normPhone = (v) => (v || '').toString().replace(/\D/g, '')
const normalizeImportedPhone = (v) => {
  const digits = normPhone(v)
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2)
  return digits
}
const pickFirst = (v) => (Array.isArray(v) ? v[0] : v)
const decodeVcardValue = (v) => {
  if (v == null) return ''
  return v
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}
const unfoldVcard = (text) => text.replace(/=\r?\n/g, '').replace(/\r?\n[ \t]/g, '')
const decodeQuotedPrintable = (v) => {
  const src = (v || '').replace(/=\r?\n/g, '')
  const bytes = []
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '=' && i + 2 < src.length) {
      const hex = src.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += 2
        continue
      }
    }
    bytes.push(ch.charCodeAt(0))
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  } catch {
    return src
  }
}
const parseVcf = (rawText) => {
  const text = unfoldVcard((rawText || '').replace(/\u0000/g, ''))
  const blocks = text.split(/BEGIN:VCARD/i).slice(1)
  const out = []

  for (const b of blocks) {
    const chunk = b.split(/END:VCARD/i)[0] || ''
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    let name = ''
    const tels = []

    for (const line of lines) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const left = line.slice(0, idx)
      const right = line.slice(idx + 1)
      const leftParts = left.split(';')
      const rawKey = leftParts[0].toUpperCase()
      // iOS costuma exportar como item1.TEL / item2.TEL etc.
      const key = rawKey.includes('.') ? rawKey.split('.').pop() : rawKey
      const hasQuotedPrintable = left.toUpperCase().includes('ENCODING=QUOTED-PRINTABLE')
      let value = hasQuotedPrintable ? decodeQuotedPrintable(right) : decodeVcardValue(right)
      if (key === 'TEL' && /^tel:/i.test(value)) value = value.replace(/^tel:/i, '')
      if (key === 'FN' && value) name = value
      if (key === 'N' && !name && value) {
        const [last, first] = value.split(';')
        name = [decodeVcardValue(first), decodeVcardValue(last)].filter(Boolean).join(' ').trim()
      }
      if (key === 'TEL' && value) tels.push(value)
    }

    const tel = tels.find((t) => normPhone(t)) || ''
    if (!name && !normPhone(tel)) continue
    out.push({ id: uid(), name: name || 'Sem nome', phone: tel })
  }

  return out
}
const pickTelValue = (tel) => {
  const t = pickFirst(tel)
  if (!t) return ''
  if (typeof t === 'string') return t
  if (typeof t === 'object') return t.number || t.tel || t.value || ''
  return ''
}
const asMoney = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
/** Apenas concluídos — valores efetivamente realizados */
const validRevenueAppts = (appointments, clientId) => appointments.filter(
  (a) => a.clientId === clientId && !a.blocked && a.status === 'done'
)
const getClientSpendMetrics = (client, appointments) => {
  const now = new Date()
  const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6)
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1)
  const createdAt = client.createdAt ? new Date(client.createdAt) : null

  const appts = validRevenueAppts(appointments, client.id)
  const sumBy = (predicate) => appts
    .filter((a) => predicate(new Date(`${a.date}T12:00`)))
    .reduce((sum, a) => sum + Number(a.value || 0), 0)

  return {
    sinceCreated: sumBy((d) => !createdAt || Number.isNaN(createdAt.getTime()) || d >= createdAt),
    last6Months: sumBy((d) => d >= sixMonthsAgo),
    last12Months: sumBy((d) => d >= oneYearAgo),
  }
}

const getVisitPattern = (clientId, appointments) => {
  const done = appointments
    .filter((a) => a.clientId === clientId && !a.blocked && a.status === 'done')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  if (done.length >= 2) {
    const gaps = []
    for (let i = 1; i < done.length; i += 1) {
      const d0 = new Date(done[i - 1].date + 'T12:00')
      const d1 = new Date(done[i].date + 'T12:00')
      gaps.push((d1 - d0) / 86400000)
    }
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length
    if (avg >= 60) return `~${Math.round(avg / 30)} meses entre visitas`
    if (avg >= 14) return `~${Math.round(avg / 7)} semanas entre visitas`
    return `~${Math.round(avg)} dias entre visitas`
  }
  if (done.length === 1) return 'Primeira visita concluída'
  return 'Ainda sem visitas concluídas'
}

const Clients = ({
  clients,
  setClients,
  appointments,
  services = [],
  isBarber,
  addToast,
  onScheduleAfterCreate,
  canUserEdit,
  onBlockedAction,
  onUpgrade,
}) => {
  const appointmentsLabel = isBarber ? 'cortes' : 'atendimentos'
  const appointmentLabelSingular = isBarber ? 'corte' : 'atendimento'
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [historyClient, setHistoryClient] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', notes: '' })
  const canPickContacts = typeof navigator !== 'undefined' && !!navigator.contacts?.select
  const [importModal, setImportModal] = useState(false)
  const [importList, setImportList] = useState([])
  const [importSearch, setImportSearch] = useState('')
  const [importSelected, setImportSelected] = useState(() => new Set())
  const addClientsSequentially = (items) => {
    for (const item of items) {
      setClients((prev) => [...prev, item])
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = clients.filter((c) => {
    if (!q) return true
    const name = (c.name || '').toLowerCase()
    const phone = (c.phone || '').toString()
    const notes = (c.notes || '').toLowerCase()
    return name.includes(q) || phone.includes(search.trim()) || notes.includes(q)
  })

  const save = (andSchedule) => {
    if (!canUserEdit) {
      onBlockedAction?.('Desbloqueie para salvar clientes.')
      return
    }
    if (!form.name) return
    if (modal === 'new') {
      const newId = uid()
      setClients([...clients, { ...form, id: newId, createdAt: new Date().toISOString() }])
      addToast('Cliente salvo com sucesso!', 'success')
      setModal(null)
      if (andSchedule && onScheduleAfterCreate) onScheduleAfterCreate(newId)
    } else {
      setClients(clients.map((c) => (c.id === modal.id ? { ...c, ...form } : c)))
      addToast('Cliente salvo com sucesso!', 'success')
      setModal(null)
    }
  }

  const del = (id) => {
    if (appointments.some((a) => a.clientId === id)) { addToast('Cliente possui agendamentos!', 'warning'); return }
    setClients(clients.filter((c) => c.id !== id))
    addToast('Cliente removido.', 'success')
  }

  const openEdit = (c) => { setForm({ name: c.name, phone: c.phone, notes: c.notes }); setModal(c) }
  const openNew = () => {
    if (!canUserEdit) {
      onBlockedAction?.('Desbloqueie para salvar clientes.')
      return
    }
    setForm({ name: '', phone: '', notes: '' })
    setModal('new')
  }
  const getApptCount = (id) => appointments.filter((a) => a.clientId === id && a.status !== 'cancelled').length

  const getClientHistory = (clientId) =>
    appointments
      .filter((a) => a.clientId === clientId && !a.blocked)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))

  const statusLabel = (s) => statusMeta(s).label

  const importContacts = async () => {
    if (!canPickContacts) { addToast('Seu navegador não suporta importar contatos.', 'warning'); return }
    try {
      const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      const existingKeys = new Set(
        clients.map((c) => `${(c.name || '').trim().toLowerCase()}|${normPhone(c.phone)}`).filter((x) => x !== '|')
      )

      const toAdd = []
      for (const p of (picked || [])) {
        const name = (pickFirst(p.name) || '').toString().trim()
        const phone = normalizeImportedPhone(pickTelValue(p.tel))
        const phoneNorm = normPhone(phone)
        const key = `${name.toLowerCase()}|${phoneNorm}`
        if (!name && !phoneNorm) continue
        if (existingKeys.has(key)) continue

        existingKeys.add(key)
        toAdd.push({ id: uid(), name: name || 'Sem nome', phone, notes: '', createdAt: new Date().toISOString() })
      }

      if (toAdd.length === 0) { addToast('Nenhum contato novo para importar.', 'info'); return }
      addClientsSequentially(toAdd)
      addToast(`${toAdd.length} contato(s) importado(s)!`, 'success')
    } catch (e) {
      const msg = (e && typeof e === 'object' && 'name' in e) ? e.name : ''
      if (msg === 'AbortError') { addToast('Importação cancelada.', 'info'); return }
      if (msg === 'NotAllowedError' || msg === 'SecurityError') { addToast('Permissão negada para acessar contatos.', 'warning'); return }
      addToast('Não foi possível importar contatos.', 'error')
    }
  }

  const openVcfPicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.vcf,text/vcard'
    input.multiple = false
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) { addToast('Nenhum arquivo selecionado.', 'info'); return }
      const reader = new FileReader()
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        const parsed = parseVcf(text)
        if (parsed.length === 0) { addToast('Nenhum contato encontrado no arquivo.', 'warning'); return }
        setImportList(parsed.map((p) => ({ ...p, notes: '', createdAt: new Date().toISOString() })))
        setImportSelected(new Set(parsed.map((p) => p.id)))
        setImportSearch('')
        setImportModal(true)
      }
      reader.onerror = () => addToast('Falha ao ler o arquivo de contatos.', 'error')
      reader.readAsText(file)
    }
    input.click()
  }

  const confirmImportSelected = () => {
    const existingKeys = new Set(
      clients.map((c) => `${(c.name || '').trim().toLowerCase()}|${normPhone(c.phone)}`).filter((x) => x !== '|')
    )
    const selected = importList.filter((c) => importSelected.has(c.id))
    const toAdd = []

    for (const c of selected) {
      const name = (c.name || '').toString().trim()
      const phone = normalizeImportedPhone(c.phone)
      const phoneNorm = normPhone(phone)
      const key = `${name.toLowerCase()}|${phoneNorm}`
      if (!name && !phoneNorm) continue
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      toAdd.push({ id: uid(), name: name || 'Sem nome', phone, notes: '', createdAt: new Date().toISOString() })
    }

    if (toAdd.length === 0) { addToast('Nenhum contato novo para importar.', 'info'); setImportModal(false); return }
    addClientsSequentially(toAdd)
    addToast(`${toAdd.length} contato(s) importado(s)!`, 'success')
    setImportModal(false)
  }

  const visibleImportList = importList.filter((c) => {
    const q = importSearch.trim().toLowerCase()
    if (!q) return true
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
  })

  return (
    <div style={{ padding: 16 }}>
      {!canUserEdit && (
        <div style={{ marginBottom: 12, border: '1px solid var(--rose-light)', background: 'var(--rose-light)', borderRadius: 12, padding: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--rose-dark)' }}>Desbloqueie para salvar clientes</p>
          <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2, marginBottom: 8 }}>Tenha acesso completo ao sistema.</p>
          <Btn onClick={() => onUpgrade?.()} sm>
            <Icon name="lock" size={12} color="#fff" /> Desbloquear agora
          </Btn>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <Inp placeholder="Buscar por nome, telefone ou observações..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, flex: '1 1 220px', maxWidth: 360 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="ghost" onClick={importContacts} disabled={!canPickContacts}>
            <Icon name="upload" size={14} />
            Importar contato
          </Btn>
          {!canPickContacts && (
            <Btn variant="ghost" onClick={openVcfPicker}>
              <Icon name="upload" size={14} />
              Importar .vcf (iPhone)
            </Btn>
          )}
          {canUserEdit ? (
            <Btn onClick={openNew}><Icon name="plus" size={14} color="#fff" /> Novo cliente</Btn>
          ) : (
            <button
              type="button"
              onClick={() => onBlockedAction?.('Desbloqueie para salvar clientes.')}
              className="lash-btn-press"
              style={{
                background: 'var(--rose-deep)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '11px 20px',
                fontSize: 14,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                opacity: 0.72,
                filter: 'blur(0.2px)',
              }}
            >
              <Icon name="lock" size={13} color="#fff" /> Novo cliente
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {filtered.map((c) => {
          const count = getApptCount(c.id)
          const spend = getClientSpendMetrics(c, appointments)
          const pattern = getVisitPattern(c.id, appointments)
          const recent = getClientHistory(c.id).slice(0, 3)
          const initials = c.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
          return (
            <div key={c.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--rose-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, var(--rose-light) 0%, var(--nude) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--rose-dark)' }}>
                  {initials}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{c.phone}</div>
                </div>
              </div>
              {c.notes && (
                <p style={{ fontSize: 12, color: 'var(--text-mid)', background: 'var(--rose-light)', padding: '6px 10px', borderRadius: 8, marginBottom: 10 }}>
                  {c.notes}
                </p>
              )}
              <div style={{ background: 'var(--off-white)', borderRadius: 10, border: '1px solid var(--rose-light)', padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-mid)', marginBottom: 8, lineHeight: 1.35 }}>
                  <strong style={{ color: 'var(--text)' }}>Frequência:</strong> {pattern}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-light)', marginBottom: 4 }}>
                  <span>Total pago (desde cadastro)</span><strong style={{ color: 'var(--rose-dark)', fontSize: 12 }}>{asMoney(spend.sinceCreated)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-light)', marginBottom: 4 }}>
                  <span>Últimos 6 meses</span><strong style={{ color: 'var(--rose-dark)', fontSize: 12 }}>{asMoney(spend.last6Months)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-light)' }}>
                  <span>Último ano</span><strong style={{ color: 'var(--rose-dark)', fontSize: 12 }}>{asMoney(spend.last12Months)}</strong>
                </div>
              </div>
              {recent.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Últimos horários</div>
                  {recent.map((a) => {
                    const sm = statusMeta(a.status)
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 12,
                          padding: '6px 8px',
                          borderRadius: 8,
                          background: 'var(--rose-light)',
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ color: 'var(--text)' }}>
                          {new Date(a.date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {String(a.time).slice(0, 5)}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--rose-dark)' }}>{asMoney(a.value)}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: sm.bg, color: sm.text }}>{sm.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-light)' }}>{count} {appointmentsLabel}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Btn variant="ghost" sm onClick={() => setHistoryClient(c)} title={`Histórico de ${appointmentsLabel}`}>
                    <Icon name="calendar" size={12} /> Histórico
                  </Btn>
                  <Btn
                    variant="ghost"
                    sm
                    onClick={() => {
                      if (!canUserEdit) {
                        onBlockedAction?.('Desbloqueie para editar clientes.')
                        return
                      }
                      openEdit(c)
                    }}
                  >
                    <Icon name={canUserEdit ? 'edit' : 'lock'} size={12} />
                  </Btn>
                  <Btn variant="ghost" sm onClick={() => del(c.id)}><Icon name="trash" size={12} color="#C5515F" /></Btn>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-light)' }}>
          <p style={{ fontSize: 16 }}>Nenhum cliente encontrado</p>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Novo cliente' : 'Editar cliente'}>
        <Field label="Nome completo">
          <Inp value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome do cliente" />
        </Field>
        <Field label="Telefone">
          <Inp value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="Observações">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Alergias, preferências, etc." rows={3} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          {modal === 'new' ? (
            <>
              <Btn variant="outline" onClick={() => save(false)} disabled={!form.name}>Salvar</Btn>
              <Btn onClick={() => save(true)} disabled={!form.name}>
                <Icon name="calendar" size={14} color="#fff" /> Salvar e agendar
              </Btn>
            </>
          ) : (
            <Btn onClick={() => save(false)} disabled={!form.name}><Icon name="check" size={14} color="#fff" /> Salvar</Btn>
          )}
        </div>
      </Modal>

      <Modal open={!!historyClient} onClose={() => setHistoryClient(null)} title={historyClient ? `Histórico — ${historyClient.name}` : ''}>
        {historyClient && (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 12 }}>
              {`${isBarber ? 'Cortes' : 'Atendimentos'} registrados (agendamentos não cancelados e bloqueios não aparecem como ${appointmentLabelSingular}).`}
            </p>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--rose-light)', borderRadius: 12 }}>
              {getClientHistory(historyClient.id).length === 0 ? (
                <p style={{ padding: 16, fontSize: 13, color: 'var(--text-light)', margin: 0 }}>{`Nenhum ${appointmentLabelSingular} ainda.`}</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--rose-light)', background: 'var(--rose-light)' }}>
                      {['Data', 'Serviço', 'Valor', 'Status'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, color: 'var(--text-light)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getClientHistory(historyClient.id).map((a) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--rose-light)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--text)' }}>
                          {new Date(a.date + 'T12:00').toLocaleDateString('pt-BR')} {String(a.time).slice(0, 5)}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-mid)' }}>{services.find((s) => s.id === a.serviceId)?.name || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--rose-dark)' }}>{asMoney(a.value)}</td>
                        <td style={{ padding: '8px 10px' }}>{statusLabel(a.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => setHistoryClient(null)}>Fechar</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={importModal} onClose={() => setImportModal(false)} title="Importar contatos">
        <Field label="Buscar no arquivo">
          <Inp value={importSearch} onChange={(e) => setImportSearch(e.target.value)} placeholder="Nome ou telefone" />
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 6 }}>
          <Btn
            variant="ghost"
            sm
            onClick={() => setImportSelected(new Set(visibleImportList.map((c) => c.id)))}
            disabled={visibleImportList.length === 0}
          >
            Selecionar visíveis
          </Btn>
          <Btn
            variant="ghost"
            sm
            onClick={() => setImportSelected(new Set())}
            disabled={importSelected.size === 0}
          >
            Limpar seleção
          </Btn>
        </div>

        <div style={{ marginTop: 10, border: '1px solid var(--rose-light)', borderRadius: 12, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
          {visibleImportList.map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--rose-light)', cursor: 'pointer', background: importSelected.has(c.id) ? 'var(--rose-light)' : 'var(--surface)' }}>
              <input
                type="checkbox"
                checked={importSelected.has(c.id)}
                onChange={() => {
                  setImportSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(c.id)) next.delete(c.id)
                    else next.add(c.id)
                    return next
                  })
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{c.phone || '-'}</div>
              </div>
            </label>
          ))}
          {visibleImportList.length === 0 && (
            <div style={{ padding: 14, color: 'var(--text-light)', fontSize: 12 }}>Nenhum contato encontrado.</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <Btn variant="ghost" onClick={() => setImportModal(false)}>Cancelar</Btn>
          <Btn onClick={confirmImportSelected} disabled={importSelected.size === 0}>
            <Icon name="check" size={14} color="#fff" /> Importar selecionados ({importSelected.size})
          </Btn>
        </div>
      </Modal>
    </div>
  )
}

export default Clients
