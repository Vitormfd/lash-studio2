import { useState } from 'react'
import Modal from '../components/Modal'
import { Btn, Field, Inp, Textarea, inputStyle } from '../components/UI'
import Icon from '../components/Icon'
import { uid } from '../lib/supabase'

const normPhone = (v) => (v || '').toString().replace(/\D/g, '')
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
const unfoldVcard = (text) => text.replace(/\r?\n[ \t]/g, '')
const parseVcf = (rawText) => {
  const text = unfoldVcard(rawText || '')
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
      const key = left.split(';')[0].toUpperCase()
      const value = decodeVcardValue(right)
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

const Clients = ({ clients, setClients, appointments, addToast }) => {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', notes: '' })
  const canPickContacts = typeof navigator !== 'undefined' && !!navigator.contacts?.select
  const [importModal, setImportModal] = useState(false)
  const [importList, setImportList] = useState([])
  const [importSearch, setImportSearch] = useState('')
  const [importSelected, setImportSelected] = useState(() => new Set())

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search))
  )

  const save = () => {
    if (!form.name) return
    if (modal === 'new') {
      setClients([...clients, { ...form, id: uid(), createdAt: new Date().toISOString() }])
      addToast('Cliente cadastrado!', 'success')
    } else {
      setClients(clients.map((c) => (c.id === modal.id ? { ...c, ...form } : c)))
      addToast('Cliente atualizado!', 'success')
    }
    setModal(null)
  }

  const del = (id) => {
    if (appointments.some((a) => a.clientId === id)) { addToast('Cliente possui agendamentos!', 'warning'); return }
    setClients(clients.filter((c) => c.id !== id))
    addToast('Cliente removido.', 'success')
  }

  const openEdit = (c) => { setForm({ name: c.name, phone: c.phone, notes: c.notes }); setModal(c) }
  const openNew = () => { setForm({ name: '', phone: '', notes: '' }); setModal('new') }
  const getApptCount = (id) => appointments.filter((a) => a.clientId === id && a.status !== 'cancelled').length

  const importContacts = async () => {
    if (!canPickContacts) { addToast('Seu navegador não suporta importar contatos.', 'warning'); return }
    try {
      const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      const existingPhones = new Set(clients.map((c) => normPhone(c.phone)).filter(Boolean))

      const toAdd = []
      for (const p of (picked || [])) {
        const name = (pickFirst(p.name) || '').toString().trim()
        const phone = pickTelValue(p.tel).toString().trim()
        const phoneNorm = normPhone(phone)
        if (!name && !phoneNorm) continue
        if (phoneNorm && existingPhones.has(phoneNorm)) continue

        if (phoneNorm) existingPhones.add(phoneNorm)
        toAdd.push({ id: uid(), name: name || 'Sem nome', phone, notes: '', createdAt: new Date().toISOString() })
      }

      if (toAdd.length === 0) { addToast('Nenhum contato novo para importar.', 'info'); return }
      setClients([...clients, ...toAdd])
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
    const existingPhones = new Set(clients.map((c) => normPhone(c.phone)).filter(Boolean))
    const selected = importList.filter((c) => importSelected.has(c.id))
    const toAdd = []

    for (const c of selected) {
      const name = (c.name || '').toString().trim()
      const phone = (c.phone || '').toString().trim()
      const phoneNorm = normPhone(phone)
      if (!name && !phoneNorm) continue
      if (phoneNorm && existingPhones.has(phoneNorm)) continue
      if (phoneNorm) existingPhones.add(phoneNorm)
      toAdd.push({ id: uid(), name: name || 'Sem nome', phone, notes: '', createdAt: new Date().toISOString() })
    }

    if (toAdd.length === 0) { addToast('Nenhum contato novo para importar.', 'info'); setImportModal(false); return }
    setClients([...clients, ...toAdd])
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <Inp placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }} />
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
          <Btn onClick={openNew}><Icon name="plus" size={14} color="#fff" /> Nova Cliente</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {filtered.map((c) => {
          const count = getApptCount(c.id)
          const initials = c.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
          return (
            <div key={c.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--rose-light)' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-light)' }}>{count} atendimentos</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn variant="ghost" sm onClick={() => openEdit(c)}><Icon name="edit" size={12} /></Btn>
                  <Btn variant="ghost" sm onClick={() => del(c.id)}><Icon name="trash" size={12} color="#C5515F" /></Btn>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-light)' }}>
          <p style={{ fontSize: 16 }}>Nenhuma cliente encontrada</p>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Nova Cliente' : 'Editar Cliente'}>
        <Field label="Nome completo">
          <Inp value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome da cliente" />
        </Field>
        <Field label="Telefone">
          <Inp value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="Observações">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Alergias, preferências, etc." rows={3} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn onClick={save} disabled={!form.name}><Icon name="check" size={14} color="#fff" /> Salvar</Btn>
        </div>
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
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--rose-light)', cursor: 'pointer', background: importSelected.has(c.id) ? 'var(--rose-light)' : '#fff' }}>
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
