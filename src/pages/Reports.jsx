import { useState } from 'react'
import { StatCard } from '../components/UI'

const Reports = ({ appointments, services, clients }) => {
  const [period, setPeriod] = useState('month')
  const now = new Date()
  const real = appointments.filter((a) => !a.blocked && a.status !== 'cancelled')

  const getFiltered = () => {
    const cutoff = new Date(now)
    if (period === 'week') cutoff.setDate(now.getDate() - 7)
    else if (period === 'month') cutoff.setMonth(now.getMonth() - 1)
    else cutoff.setFullYear(now.getFullYear() - 1)
    return real.filter((a) => new Date(a.date + 'T12:00') >= cutoff)
  }

  const filtered = getFiltered()
  const revenue = filtered.reduce((s, a) => s + Number(a.value), 0)

  // Daily chart data
  const dailyMap = {}
  filtered.forEach((a) => { dailyMap[a.date] = (dailyMap[a.date] || 0) + Number(a.value) })
  const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
  const maxDaily = Math.max(...daily.map(([, v]) => v), 1)

  // By service
  const svcMap = {}
  filtered.forEach((a) => { svcMap[a.serviceId] = (svcMap[a.serviceId] || 0) + Number(a.value) })

  return (
    <div style={{ padding: 16 }}>
      {/* Period filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['week', 'Semana'], ['month', 'Mês'], ['year', 'Ano']].map(([v, l]) => (
          <button key={v} onClick={() => setPeriod(v)} style={{ padding: '7px 16px', borderRadius: 20, border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: period === v ? 'var(--rose-deep)' : 'var(--rose-light)', color: period === v ? '#fff' : 'var(--text-mid)', transition: 'all 0.15s' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <StatCard label="Faturamento" value={`R$ ${revenue.toFixed(2).replace('.', ',')}`} icon="dollar" />
        <StatCard label="Atendimentos" value={filtered.length} icon="check" />
        <StatCard label="Ticket médio" value={`R$ ${filtered.length ? (revenue / filtered.length).toFixed(2).replace('.', ',') : '0,00'}`} icon="star" />
      </div>

      {/* Daily chart */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 16px 12px', border: '1px solid var(--rose-light)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Faturamento por dia</h3>
        {daily.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: 'var(--text-light)', fontSize: 13 }}>Sem dados</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, paddingBottom: 24, position: 'relative' }}>
            {daily.map(([date, val]) => {
              const h = Math.max((val / maxDaily) * 80, 4)
              const d = new Date(date + 'T12:00')
              return (
                <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div title={`R$ ${val}`} style={{ width: '100%', height: h, background: 'linear-gradient(180deg, var(--rose-deep) 0%, var(--rose) 100%)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s ease', cursor: 'default' }} />
                  <div style={{ fontSize: 8, color: 'var(--text-light)', whiteSpace: 'nowrap', position: 'absolute', bottom: 0 }}>{d.getDate()}/{d.getMonth() + 1}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* By service */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid var(--rose-light)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Por serviço</h3>
        {services.filter((s) => svcMap[s.id]).sort((a, b) => (svcMap[b.id] || 0) - (svcMap[a.id] || 0)).map((s) => {
          const val = svcMap[s.id] || 0
          const cnt = filtered.filter((a) => a.serviceId === s.id).length
          const pct = revenue ? val / revenue * 100 : 0
          return (
            <div key={s.id} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--rose-dark)', fontWeight: 600 }}>
                    R$ {val.toFixed(2).replace('.', ',')} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>({cnt}x)</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--rose-light)' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--rose-deep)', borderRadius: 3 }} />
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-light)', minWidth: 36 }}>{pct.toFixed(0)}%</span>
            </div>
          )
        })}
        {Object.keys(svcMap).length === 0 && (
          <p style={{ textAlign: 'center', padding: 20, color: 'var(--text-light)', fontSize: 13 }}>Sem dados no período</p>
        )}
      </div>
    </div>
  )
}

export default Reports
