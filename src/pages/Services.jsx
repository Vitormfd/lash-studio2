import { useState } from 'react'
import Modal from '../components/Modal'
import { Btn, Field, Inp, inputStyle } from '../components/UI'
import Icon from '../components/Icon'
import { uid } from '../lib/supabase'
import { normalizeServiceColor, SERVICE_COLOR_PRESETS } from '../lib/utils'

const Services = ({ services, setServices, appointments, addToast }) => {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ name: '', price: '', color: '' })

  const q = search.trim().toLowerCase()
  const filtered = services.filter((s) => {
    if (!q) return true
    const name = (s.name || '').toLowerCase()
    const priceStr = String(s.price ?? '')
    return name.includes(q) || priceStr.includes(search.trim())
  })

  const save = () => {
    if (!form.name || !form.price) return
    const colorClean = normalizeServiceColor(form.color) || ''
    if (modal === 'new') {
      setServices([...services, { ...form, price: Number(form.price), color: colorClean, id: uid() }])
      addToast('Serviço criado!', 'success')
    } else {
      setServices(services.map((s) => s.id === modal.id ? { ...s, ...form, price: Number(form.price), color: colorClean } : s))
      addToast('Serviço atualizado!', 'success')
    }
    setModal(null)
  }

  const del = (id) => {
    if (appointments.some((a) => a.serviceId === id)) { addToast('Serviço em uso!', 'warning'); return }
    setServices(services.filter((s) => s.id !== id))
    addToast('Serviço removido.', 'success')
  }

  const getCount = (id) => appointments.filter((a) => a.serviceId === id && a.status !== 'cancelled').length

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <Inp
          placeholder="Buscar serviço por nome ou valor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 220px', maxWidth: 360 }}
        />
        <Btn onClick={() => { setForm({ name: '', price: '', color: '' }); setModal('new') }}>
          <Icon name="plus" size={14} color="#fff" /> Novo Serviço
        </Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {filtered.map((s) => (
          <div key={s.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--rose-light)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: normalizeServiceColor(s.color) || 'var(--rose-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: normalizeServiceColor(s.color) ? 'inset 0 0 0 1px rgba(0,0,0,0.06)' : 'none' }}>
                <Icon name="star" size={16} color={normalizeServiceColor(s.color) ? '#2C1A1E' : 'var(--rose-deep)'} />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Btn variant="ghost" sm onClick={() => { setForm({ name: s.name, price: s.price, color: s.color || '' }); setModal(s) }}>
                  <Icon name="edit" size={12} />
                </Btn>
                <Btn variant="ghost" sm onClick={() => del(s.id)}>
                  <Icon name="trash" size={12} color="#C5515F" />
                </Btn>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--rose-deep)', marginTop: 2 }}>R$ {s.price}</div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>{getCount(s.id)} realizados</div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-light)' }}>
          <p style={{ fontSize: 15 }}>Nenhum serviço encontrado</p>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Novo Serviço' : 'Editar Serviço'}>
        <Field label="Nome do serviço">
          <Inp value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Volume Russo" />
        </Field>
        <Field label="Preço padrão (R$)">
          <Inp type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" />
        </Field>
        <Field label="Cor na agenda">
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 10 }}>
            Os agendamentos deste serviço aparecem com esta cor na agenda.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {SERVICE_COLOR_PRESETS.map((p) => (
              <button key={p.hex} type="button" title={p.name} onClick={() => setForm((f) => ({ ...f, color: p.hex }))}
                style={{ width: 34, height: 34, borderRadius: 10, background: p.hex, cursor: 'pointer', padding: 0, border: normalizeServiceColor(form.color) === p.hex ? '3px solid var(--text)' : '2px solid var(--border-mid)', boxShadow: '0 2px 8px rgba(44,26,30,0.12)' }} />
            ))}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-mid)', cursor: 'pointer' }}>
              Outra
              <input type="color" value={normalizeServiceColor(form.color) || '#C17B82'} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                style={{ width: 40, height: 34, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0, background: 'transparent' }} />
            </label>
            <Btn variant="ghost" sm type="button" onClick={() => setForm((f) => ({ ...f, color: '' }))}>Padrão do tema</Btn>
          </div>
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn onClick={save} disabled={!form.name || !form.price}>
            <Icon name="check" size={14} color="#fff" /> Salvar
          </Btn>
        </div>
      </Modal>
    </div>
  )
}

export default Services
