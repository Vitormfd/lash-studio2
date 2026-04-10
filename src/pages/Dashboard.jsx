import { StatCard } from '../components/UI'
import { Btn } from '../components/UI'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { normalizeServiceColor, hexToRgba, formatDurationLabel, apptDurationMin } from '../lib/utils'
import { getTodaySummary, getTodayStr } from '../lib/dashboardStats'

const Dashboard = ({
  appointments,
  clients,
  services,
  config,
  onGoAgenda,
  onNewAppointment,
  onGoClients,
}) => {
  const now = new Date()
  const today = getTodayStr(now)
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
  const monday = new Date(now); monday.setDate(now.getDate() - now.getDay() + 1)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const monthStr = today.slice(0, 7)

  const real = appointments.filter((a) => !a.blocked)
  const monthAppts = real.filter((a) => a.date.startsWith(monthStr) && a.status !== 'cancelled')
  const revenue = monthAppts.reduce((s, a) => s + Number(a.value), 0)
  const cost = monthAppts.length * config.avgCost
  const profit = revenue - cost
  const avg = monthAppts.length ? revenue / monthAppts.length : 0

  const todaySummary = getTodaySummary(appointments, today)
  const todayAppts = real.filter((a) => a.date === today && a.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time))
  const tomorrowAppts = real.filter((a) => a.date === tomorrow && a.status !== 'cancelled')
  const weekAppts = real.filter((a) => {
    const d = new Date(a.date + 'T12:00')
    return d >= monday && d <= sunday && a.status !== 'cancelled'
  })

  const getClientName = (id) => clients.find((c) => c.id === id)?.name || '—'
  const getServiceName = (id) => services.find((s) => s.id === id)?.name || '—'
  const svcAccent = (serviceId) => normalizeServiceColor(services.find((s) => s.id === serviceId)?.color)

  const h = now.getHours()
  const greetingLine = h >= 5 && h < 12 ? 'Bom dia! ✨' : h >= 12 && h < 18 ? 'Boa tarde! ✨' : 'Boa noite! 🌙'

  return (
    <div style={{ padding: '20px 16px' }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-light)' }}>
          {now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <h2 className="serif" style={{ fontSize: 22, fontWeight: 500, color: 'var(--text)', marginTop: 2 }}>
          {greetingLine}
        </h2>
      </div>

      {/* Resumo do dia */}
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Resumo de hoje
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <StatCard label="Atendimentos hoje" value={todaySummary.count} icon="check" color="var(--rose-deep)" />
          <StatCard label="Clientes (distintos)" value={todaySummary.uniqueClients} icon="users" color="var(--rose-dark)" />
          <StatCard
            label="Faturamento previsto hoje"
            value={`R$ ${todaySummary.revenue.toFixed(2).replace('.', ',')}`}
            icon="dollar"
            color="#7BAF7B"
          />
        </div>
        {todaySummary.count === 0 && (
          <EmptyState
            icon="☕"
            title="Nenhum atendimento agendado para hoje"
            hint="Crie um agendamento ou abra a agenda para planejar seu dia."
          />
        )}
      </div>

      {/* Atalhos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <Btn onClick={onNewAppointment}><Icon name="plus" size={14} color="#fff" /> Novo agendamento</Btn>
        <Btn variant="ghost" onClick={onGoAgenda}><Icon name="calendar" size={14} /> Ver agenda</Btn>
        <Btn variant="outline" onClick={onGoClients}><Icon name="users" size={14} /> Clientes</Btn>
      </div>

      {/* Stats do mês */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <StatCard label="Faturamento do mês" value={`R$ ${revenue.toFixed(2).replace('.', ',')}`} icon="dollar" />
        <StatCard label="Lucro do mês" value={`R$ ${profit.toFixed(2).replace('.', ',')}`} sub={`Custo: R$ ${cost.toFixed(2).replace('.', ',')}`} icon="chart" />
        <StatCard label="Atendimentos" value={monthAppts.length} sub="este mês" icon="check" />
        <StatCard label="Ticket médio" value={`R$ ${avg.toFixed(2).replace('.', ',')}`} icon="star" />
      </div>

      {/* Schedule cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {[
          { title: 'Hoje', list: todayAppts, color: 'var(--rose-deep)' },
          { title: 'Amanhã', list: tomorrowAppts, color: 'var(--rose)' },
          { title: 'Esta semana', list: weekAppts, color: 'var(--nude-dark)' },
        ].map(({ title, list, color }) => (
          <div key={title} style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid var(--rose-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
              <span style={{ background: 'var(--rose-light)', color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                {list.length} {list.length === 1 ? 'apto.' : 'aptos.'}
              </span>
            </div>
            {list.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-light)', textAlign: 'center', padding: '12px 0' }}>
                {title === 'Hoje' ? 'Nenhum cliente agendado hoje' : 'Nenhum agendamento'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.slice(0, 4).map((a) => {
                  const acc = svcAccent(a.serviceId)
                  return (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                        background: acc ? hexToRgba(acc, 0.14) || 'var(--rose-light)' : 'var(--rose-light)',
                        borderLeft: acc ? `4px solid ${acc}` : 'none',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 600, color: acc || color, minWidth: 40, textAlign: 'center', lineHeight: 1.2 }}>
                        {String(a.time).slice(0, 5)}<br />
                        <span style={{ fontWeight: 500, opacity: 0.85 }}>{formatDurationLabel(apptDurationMin(a))}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {getClientName(a.clientId)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{getServiceName(a.serviceId)}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--rose-dark)' }}>R${a.value}</div>
                    </div>
                  )
                })}
                {list.length > 4 && (
                  <p style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center' }}>+{list.length - 4} mais</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Dashboard
