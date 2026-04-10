/** Placeholder leve enquanto dados pesados carregam (percepção de fluidez) */
const bar = (w) => (
  <div
    className="skeleton-line"
    style={{ width: w, height: 12, borderRadius: 6, marginBottom: 8 }}
  />
)

const DashboardSkeleton = () => (
  <div style={{ padding: '20px 16px', minHeight: '100vh', animation: 'fadeUp 0.35s ease both' }}>
    <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 14 }}>Carregando seu dia…</p>
    <div className="skeleton-line" style={{ width: '55%', height: 14, borderRadius: 6, marginBottom: 10 }} />
    <div className="skeleton-line" style={{ width: '40%', height: 22, borderRadius: 8, marginBottom: 20 }} />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ flex: '1 1 140px', minHeight: 88, borderRadius: 12 }}
        />
      ))}
    </div>
    <div className="skeleton-line" style={{ width: '100%', height: 120, borderRadius: 14, marginBottom: 12 }} />
    {bar('80%')}
    {bar('60%')}
  </div>
)

export default DashboardSkeleton
