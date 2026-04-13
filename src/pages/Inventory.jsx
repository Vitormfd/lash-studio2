import { useMemo, useState } from 'react'
import Modal from '../components/Modal'
import { Btn, Field, Inp, Sel, StatCard, Textarea, inputStyle } from '../components/UI'
import Icon from '../components/Icon'
import { uid } from '../lib/supabase'

const asMoney = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`

const Inventory = ({ items, movements, onSaveItem, onDeleteItem, onSaveMovement, addToast }) => {
  const [search, setSearch] = useState('')
  const [onlyLowStock, setOnlyLowStock] = useState(false)
  const [itemModal, setItemModal] = useState(null)
  const [moveModal, setMoveModal] = useState(null)
  const [itemForm, setItemForm] = useState({ name: '', category: '', unit: 'un', costPrice: '', sellPrice: '', stock: '', minStock: '', supplier: '', notes: '' })
  const [moveForm, setMoveForm] = useState({ type: 'in', qty: '', reason: '' })

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const q = search.trim().toLowerCase()
      const match = !q || i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q) || (i.supplier || '').toLowerCase().includes(q)
      if (!match) return false
      if (!onlyLowStock) return true
      return Number(i.stock || 0) <= Number(i.minStock || 0)
    })
  }, [items, search, onlyLowStock])

  const stats = useMemo(() => {
    const low = items.filter((i) => Number(i.stock || 0) <= Number(i.minStock || 0)).length
    const value = items.reduce((sum, i) => sum + (Number(i.stock || 0) * Number(i.costPrice || 0)), 0)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    const move30 = movements.filter((m) => new Date(m.createdAt) >= cutoff).length
    return { totalItems: items.length, low, value, move30 }
  }, [items, movements])

  const openNewItem = () => {
    setItemForm({ name: '', category: '', unit: 'un', costPrice: '', sellPrice: '', stock: '', minStock: '', supplier: '', notes: '' })
    setItemModal('new')
  }

  const openEditItem = (item) => {
    setItemForm({
      name: item.name || '',
      category: item.category || '',
      unit: item.unit || 'un',
      costPrice: item.costPrice ?? '',
      sellPrice: item.sellPrice ?? '',
      stock: item.stock ?? '',
      minStock: item.minStock ?? '',
      supplier: item.supplier || '',
      notes: item.notes || '',
    })
    setItemModal(item)
  }

  const saveItem = async () => {
    if (!itemForm.name.trim()) return
    const payload = {
      id: itemModal === 'new' ? uid() : itemModal.id,
      name: itemForm.name.trim(),
      category: itemForm.category.trim(),
      unit: itemForm.unit || 'un',
      costPrice: Number(itemForm.costPrice || 0),
      sellPrice: Number(itemForm.sellPrice || 0),
      stock: Number(itemForm.stock || 0),
      minStock: Number(itemForm.minStock || 0),
      supplier: itemForm.supplier.trim(),
      notes: itemForm.notes.trim(),
      updatedAt: new Date().toISOString(),
      createdAt: itemModal === 'new' ? new Date().toISOString() : itemModal.createdAt,
      _new: itemModal === 'new',
    }
    await onSaveItem(payload)
    addToast(itemModal === 'new' ? 'Item criado!' : 'Item atualizado!', 'success')
    setItemModal(null)
  }

  const removeItem = async (item) => {
    const hasMov = movements.some((m) => m.itemId === item.id)
    if (hasMov) { addToast('Este item já possui movimentações.', 'warning'); return }
    await onDeleteItem(item.id)
    addToast('Item removido.', 'success')
  }

  const openMovement = (item, type) => {
    setMoveModal(item)
    setMoveForm({ type, qty: '', reason: '' })
  }

  const saveMovement = async () => {
    if (!moveModal) return
    const qty = Number(moveForm.qty || 0)
    if (qty <= 0) return

    const current = Number(moveModal.stock || 0)
    const nextStock = moveForm.type === 'in'
      ? current + qty
      : moveForm.type === 'out'
        ? current - qty
        : qty
    if (nextStock < 0) { addToast('Estoque não pode ficar negativo.', 'warning'); return }

    await onSaveItem({ ...moveModal, stock: nextStock, updatedAt: new Date().toISOString() })
    await onSaveMovement({
      id: uid(),
      itemId: moveModal.id,
      type: moveForm.type,
      qty,
      reason: moveForm.reason.trim(),
      createdAt: new Date().toISOString(),
      _new: true,
    })
    addToast('Movimentação registrada!', 'success')
    setMoveModal(null)
  }

  const getItemById = (id) => items.find((i) => i.id === id)

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <StatCard label="Itens cadastrados" value={stats.totalItems} icon="box" />
        <StatCard label="Estoque baixo" value={stats.low} icon="warning" color="#D4915A" />
        <StatCard label="Valor em estoque" value={asMoney(stats.value)} icon="dollar" />
        <StatCard label="Movimentos (30d)" value={stats.move30} icon="chart" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Inp placeholder="Buscar item, categoria ou fornecedor..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, minWidth: 280 }} />
          <Btn variant={onlyLowStock ? 'warning' : 'ghost'} sm onClick={() => setOnlyLowStock((v) => !v)}>
            {onlyLowStock ? 'Mostrando só baixo' : 'Filtrar estoque baixo'}
          </Btn>
        </div>
        <Btn onClick={openNewItem}><Icon name="plus" size={14} color="#fff" /> Novo Item</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {filtered.map((item) => {
          const low = Number(item.stock || 0) <= Number(item.minStock || 0)
          return (
            <div key={item.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, border: `1px solid ${low ? '#FBC7C7' : 'var(--rose-light)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{item.category || 'Sem categoria'}</div>
                </div>
                {low && <span style={{ fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: 20, padding: '4px 8px', height: 20 }}>BAIXO</span>}
              </div>

              <div style={{ marginTop: 10, background: 'var(--off-white)', borderRadius: 10, padding: '8px 10px', border: '1px solid var(--rose-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-mid)' }}>
                  <span>Estoque</span><strong>{Number(item.stock || 0)} {item.unit || 'un'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-light)', marginTop: 3 }}>
                  <span>Mínimo</span><span>{Number(item.minStock || 0)} {item.unit || 'un'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-light)', marginTop: 3 }}>
                  <span>Custo</span><span>{asMoney(item.costPrice)}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                <Btn variant="success" sm onClick={() => openMovement(item, 'in')}>Entrada</Btn>
                <Btn variant="warning" sm onClick={() => openMovement(item, 'out')}>Saída</Btn>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <Btn variant="ghost" sm onClick={() => openEditItem(item)}><Icon name="edit" size={12} /> Editar</Btn>
                <Btn variant="ghost" sm onClick={() => removeItem(item)}><Icon name="trash" size={12} color="#C5515F" /> Excluir</Btn>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-light)' }}>
          <p style={{ fontSize: 16 }}>Nenhum item encontrado</p>
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--rose-light)', marginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Últimas movimentações</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rose-light)' }}>
                {['Data', 'Item', 'Tipo', 'Qtd', 'Motivo'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...movements].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 40).map((m) => {
                const item = getItemById(m.itemId)
                const map = { in: ['#D1FAE5', '#065F46', 'Entrada'], out: ['#FEF3C7', '#92400E', 'Saída'], adjust: ['#DBEAFE', '#1E40AF', 'Ajuste'] }
                const [bg, color, label] = map[m.type] || map.in
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--rose-light)' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text)' }}>{new Date(m.createdAt).toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text)' }}>{item?.name || 'Item removido'}</td>
                    <td style={{ padding: '8px 10px' }}><span style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 20, padding: '3px 8px' }}>{label}</span></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text)' }}>{Number(m.qty || 0)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-light)' }}>{m.reason || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {movements.length === 0 && <p style={{ textAlign: 'center', padding: 20, color: 'var(--text-light)', fontSize: 13 }}>Sem movimentações</p>}
        </div>
      </div>

      <Modal open={!!itemModal} onClose={() => setItemModal(null)} title={itemModal === 'new' ? 'Novo Item de Estoque' : 'Editar Item'}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Nome do item"><Inp value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Cola Premium" /></Field>
          <Field label="Categoria"><Inp value={itemForm.category} onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))} placeholder="Ex: Higiene, acabamento, skincare..." /></Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Unidade" half>
            <Sel value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}>
              <option value="un">Unidade</option>
              <option value="ml">ml</option>
              <option value="g">g</option>
              <option value="cx">Caixa</option>
              <option value="pct">Pacote</option>
            </Sel>
          </Field>
          <Field label="Estoque atual" half><Inp type="number" value={itemForm.stock} onChange={(e) => setItemForm((f) => ({ ...f, stock: e.target.value }))} /></Field>
          <Field label="Estoque mínimo" half><Inp type="number" value={itemForm.minStock} onChange={(e) => setItemForm((f) => ({ ...f, minStock: e.target.value }))} /></Field>
          <Field label="Preço de custo (R$)" half><Inp type="number" step="0.01" value={itemForm.costPrice} onChange={(e) => setItemForm((f) => ({ ...f, costPrice: e.target.value }))} /></Field>
          <Field label="Preço de venda (R$)" half><Inp type="number" step="0.01" value={itemForm.sellPrice} onChange={(e) => setItemForm((f) => ({ ...f, sellPrice: e.target.value }))} /></Field>
          <Field label="Fornecedor" half><Inp value={itemForm.supplier} onChange={(e) => setItemForm((f) => ({ ...f, supplier: e.target.value }))} /></Field>
        </div>
        <Field label="Observações"><Textarea value={itemForm.notes} onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))} rows={3} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setItemModal(null)}>Cancelar</Btn>
          <Btn onClick={saveItem} disabled={!itemForm.name.trim()}><Icon name="check" size={14} color="#fff" /> Salvar</Btn>
        </div>
      </Modal>

      <Modal open={!!moveModal} onClose={() => setMoveModal(null)} title={`Movimentar: ${moveModal?.name || ''}`}>
        <Field label="Tipo">
          <Sel value={moveForm.type} onChange={(e) => setMoveForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="in">Entrada</option>
            <option value="out">Saída</option>
            <option value="adjust">Ajuste (definir estoque)</option>
          </Sel>
        </Field>
        <Field label={moveForm.type === 'adjust' ? 'Novo estoque' : 'Quantidade'}>
          <Inp type="number" value={moveForm.qty} onChange={(e) => setMoveForm((f) => ({ ...f, qty: e.target.value }))} />
        </Field>
        <Field label="Motivo">
          <Textarea value={moveForm.reason} onChange={(e) => setMoveForm((f) => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Ex: Compra fornecedor, uso em atendimento..." />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setMoveModal(null)}>Cancelar</Btn>
          <Btn onClick={saveMovement} disabled={Number(moveForm.qty || 0) <= 0}>
            <Icon name="check" size={14} color="#fff" /> Confirmar
          </Btn>
        </div>
      </Modal>
    </div>
  )
}

export default Inventory

