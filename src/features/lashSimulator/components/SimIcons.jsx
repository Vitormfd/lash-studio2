import { getCurl } from '../catalog'

// Ícones próprios do simulador, no mesmo traço dos ícones do app (24px, stroke 1.8).
const PATHS = {
  camera: (
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </>
  ),
  refresh: (
    <>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>
  ),
  compare: (
    <>
      <polyline points="9 7 4 12 9 17" /><polyline points="15 7 20 12 15 17" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ),
}

export const SimIcon = ({ name, size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
)

/** Silhueta da curvatura (vista lateral do fio), gerada a partir dos parâmetros do catálogo. */
export const CurlGlyph = ({ curlId, size = 26 }) => {
  const { curlDeg, baseElevation, kink } = getCurl(curlId).render
  const steps = 14
  const total = 20
  let x = 3
  let y = 21
  let d = `M${x} ${y}`
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) / steps
    const progress = kink > 0
      ? Math.min(1, Math.max(0, (s - kink) / 0.25))
      : Math.pow(s, 1.3)
    const angle = (baseElevation + curlDeg * progress) * Math.PI / 180
    x += Math.cos(angle) * (total / steps)
    y -= Math.sin(angle) * (total / steps)
    d += ` L${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/** Mini gráfico do mapeamento (comprimento por região). */
export const MappingSparkline = ({ lengths, width = 64, height = 22 }) => {
  if (!lengths?.length) return null
  const min = 5
  const max = 16
  const gap = 1.5
  const barW = (width - gap * (lengths.length - 1)) / lengths.length
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {lengths.map((mm, i) => {
        const h = Math.max(2, ((mm - min) / (max - min)) * height)
        return <rect key={i} x={i * (barW + gap)} y={height - h} width={barW} height={h} rx={1} fill="currentColor" opacity={0.85} />
      })}
    </svg>
  )
}
