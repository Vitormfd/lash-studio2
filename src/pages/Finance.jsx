import { useState } from 'react'
import { StatCard, Btn, Inp, inputStyle } from '../components/UI'
import Icon from '../components/Icon'
import { MONTHS_PT } from '../lib/utils'
import { statusMeta } from '../lib/appointmentStatus'

const Finance = ({ appointments, services, clients, config, setConfig }) => {
  const [editCost, setEditCost] = useState(false)
  const [costVal, setCostVal] = useState(config.avgCost)
  const [monthOffset, setMonthOffset] = useState(0)

  const target = new Date(); target.setMonth(target.getMonth() + monthOffset)
  const monthStr = target.toISOString().slice(0, 7)
  const monthLabel = `${MONTHS_PT[target.getMonth()]} ${target.getFullYear()}`

  const real = appointments.filter((a) => !a.blocked && a.date.startsWith(monthStr) && a.status !== 'cancelled')
  const revenue = real.reduce((s, a) => s + Number(a.value), 0)
  const count = real.length
  const cost = count * config.avgCost
  const profit = revenue - cost
  const avg = count ? revenue / count : 0

  return (
    <div style={{ padding: 16 }}>
      {/* Header controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMonthOffset((o) => o - 1)} style={{ background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex' }}>
            <Icon name="chevLeft" size={15} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', minWidth: 140, textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={() => setMonthOffset((o) => o + 1)} style={{ background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex' }}>
            <Icon name="chevRight" size={15} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Custo médio por cliente:</span>
          {editCost ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Inp type="number" value={costVal} onChange={(e) => setCostVal(e.target.value)} style={{ ...inputStyle, width: 90 }} />
              <Btn sm onClick={() => { setConfig({ ...config, avgCost: Number(costVal) }); setEditCost(false) }}>OK</Btn>
            </div>
          ) : (
            <button onClick={() => setEditCost(true)} style={{ background: 'var(--rose-light)', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 13, fontWeight: 600, color: 'var(--rose-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              R$ {config.avgCost.toFixed(2).replace('.', ',')} <Icon name="edit" size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <StatCard label="Faturamento" value={`R$ ${revenue.toFixed(2).replace('.', ',')}`} icon="dollar" color="var(--rose-deep)" />
        <StatCard label="Custo total" value={`R$ ${cost.toFixed(2).replace('.', ',')}`} icon="settings" color="#D4915A" />
        <StatCard label="Lucro real" value={`R$ ${profit.toFixed(2).replace('.', ',')}`} icon="chart" color="#7BAF7B" />
        <StatCard label="Atendimentos" value={count} icon="check" color="var(--rose)" />
        <StatCard label="Ticket médio" value={`R$ ${avg.toFixed(2).replace('.', ',')}`} icon="star" color="var(--rose-dark)" />
      </div>

      {/* Per-service breakdown */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--rose-light)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Faturamento por Serviço</h3>
        {services.map((s) => {
          const appts = real.filter((a) => a.serviceId === s.id)
          const rev = appts.reduce((sum, a) => sum + Number(a.value), 0)
          const pct = revenue ? rev / revenue * 100 : 0
          return (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{s.name}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rose-dark)' }}>
                  R$ {rev.toFixed(2).replace('.', ',')} <span style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>({appts.length}x)</span>
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--rose-light)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--rose) 0%, var(--rose-deep) 100%)', borderRadius: 3, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Appointments table */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--rose-light)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Atendimentos do mês</h3>
        <div style={{ overflowX: 'auto', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rose-light)' }}>
                {['Data', 'Cliente', 'Serviço', 'Valor', 'Status'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {real.sort((a, b) => b.date.localeCompare(a.date)).map((a) => {
                const client = clients.find((c) => c.id === a.clientId)
                const service = services.find((s) => s.id === a.serviceId)
                const sm = statusMeta(a.status)
                const bg = sm.bg
                const tc = sm.text
                const label = sm.label
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--rose-light)' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text)' }}>{new Date(a.date + 'T12:00').toLocaleDateString('pt-BR')} {a.time}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{client?.name || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-mid)' }}>{service?.name || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: 'var(--rose-dark)' }}>R$ {Number(a.value).toFixed(2).replace('.', ',')}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ background: bg, color: tc, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20 }}>{label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {real.length === 0 && <p style={{ textAlign: 'center', padding: 30, fontSize: 13, color: 'var(--text-light)' }}>Nenhum atendimento este mês</p>}
        </div>
      </div>
    </div>
  )
}

export default Finance
