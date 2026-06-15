import { useEffect, useState } from 'react'
import { DB } from '../lib/supabase'
import { Spinner } from '../components/UI'

const ACTION_LABELS = {
  create: 'Criou',
  update: 'Atualizou',
  delete: 'Removeu',
}

const formatWhen = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ActivityLog = ({ userId }) => {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const data = await DB.getAuditLog(userId, { limit: 200 })
      if (!cancelled) {
        setEntries(data)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  if (loading) return <Spinner text="Carregando histórico..." />

  return (
    <div style={{ padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 640 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Histórico de alterações</h3>
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 18, lineHeight: 1.5 }}>
          Registro de quem criou, editou ou removeu itens no app.
        </p>

        {entries.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-mid)' }}>Nenhuma alteração registrada ainda.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--rose-light)',
                  background: 'var(--off-white)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>
                      {entry.summary}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
                      {entry.operatorName}
                      {' · '}
                      {ACTION_LABELS[entry.action] || entry.action}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-light)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {formatWhen(entry.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ActivityLog
