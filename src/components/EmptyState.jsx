/** Estado vazio reutilizável — mantém o visual do app */
const EmptyState = ({ icon = '📋', title, hint }) => (
  <div
    style={{
      textAlign: 'center',
      padding: '40px 20px',
      color: 'var(--text-light)',
      background: '#fff',
      borderRadius: 14,
      border: '1px dashed var(--rose-light)',
    }}
  >
    <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.85 }}>{icon}</div>
    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-mid)', marginBottom: 6 }}>{title}</p>
    {hint && <p style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 360, margin: '0 auto' }}>{hint}</p>}
  </div>
)

export default EmptyState
