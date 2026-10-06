import { Btn } from '../../../components/UI'
import { describeSettings, normalizeSettings } from '../catalog'
import { SimIcon } from './SimIcons'

const EYE_LABELS = ['Olho da esquerda', 'Olho da direita']

const Slider = ({ label, value, min, max, step, format, onChange }) => (
  <label className="ls-slider">
    <span className="ls-slider-head">
      <span>{label}</span>
      <strong>{format(value)}</strong>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </label>
)

/**
 * Controles do modo Filtro manual: escolha do filtro pronto, olho em edição,
 * ajustes finos (tamanho, rotação, posição) e aplicação.
 */
const FilterPanel = ({
  overlays, status, selectedId, onSelect, adjustments, activeEye, onSelectEye,
  linked, onLinkedChange, onAdjust, onReset, onApply, disabled,
}) => {
  const selected = overlays.find((o) => o.id === selectedId)
  const adj = adjustments[activeEye]
  const set = (patch) => onAdjust(activeEye, (a) => ({ ...a, ...patch }), adjustments)
  const nudge = (dx, dy) => onAdjust(activeEye, (a) => ({ ...a, dx: a.dx + dx, dy: a.dy + dy }), adjustments)

  return (
    <div style={{ marginTop: 16 }}>
      <section className="ls-section">
        <div className="ls-section-title"><span>Escolha o filtro de cílios</span></div>
        {status === 'loading' && <p className="ls-hint">Carregando filtros…</p>}
        {status === 'empty' && (
          <p className="ls-selected-desc">
            Ainda não há filtros publicados. Gere os filtros com <code>scripts/generate_lash_overlays.py</code>.
          </p>
        )}
        {overlays.length > 0 && (
          <div className="ls-filter-grid">
            {overlays.map((overlay) => (
              <button
                key={overlay.id}
                type="button"
                className="ls-filter-thumb"
                aria-pressed={overlay.id === selectedId}
                onClick={() => onSelect(overlay.id)}
              >
                <span className="ls-filter-thumb-img"><img src={overlay.file} alt="" loading="lazy" /></span>
                <span className="ls-filter-thumb-label">{overlay.label}</span>
              </button>
            ))}
          </div>
        )}
        {selected?.settings && (
          <p className="ls-selected-desc">{describeSettings(normalizeSettings(selected.settings))}</p>
        )}
      </section>

      {selected && (
        <section className="ls-section">
          <div className="ls-section-title"><span>Ajuste no rosto</span></div>
          <p className="ls-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            O filtro já vem encaixado nos olhos. Arraste na foto para mover e use dois dedos para aumentar ou girar.
          </p>

          <label className="ls-toggle">
            <input type="checkbox" checked={linked} onChange={(e) => onLinkedChange(e.target.checked)} />
            <span>Ajustar os dois olhos juntos (espelhado)</span>
          </label>

          {!linked && (
            <div className="ls-chips" role="group" aria-label="Olho em ajuste" style={{ marginTop: 10 }}>
              {EYE_LABELS.map((label, index) => (
                <button key={label} type="button" className="ls-chip" aria-pressed={activeEye === index} onClick={() => onSelectEye(index)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <Slider label="Tamanho" value={adj.scale} min={0.6} max={1.6} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ scale: v })} />
            <Slider label="Rotação" value={adj.rotate} min={-30} max={30} step={0.5} format={(v) => `${v.toFixed(1).replace('.', ',')}°`} onChange={(v) => set({ rotate: v })} />
          </div>

          <div className="ls-nudge" aria-label="Mover filtro">
            <span>Posição</span>
            <button type="button" className="ls-step-btn" aria-label="Mover para cima" onClick={() => nudge(0, -2)}>↑</button>
            <button type="button" className="ls-step-btn" aria-label="Mover para baixo" onClick={() => nudge(0, 2)}>↓</button>
            <button type="button" className="ls-step-btn" aria-label="Mover para a esquerda" onClick={() => nudge(-2, 0)}>←</button>
            <button type="button" className="ls-step-btn" aria-label="Mover para a direita" onClick={() => nudge(2, 0)}>→</button>
          </div>

          <div className="ls-row">
            <Btn variant="ghost" sm touch onClick={onReset}>
              <SimIcon name="refresh" size={15} /> Reposicionar automaticamente
            </Btn>
          </div>
        </section>
      )}

      <div className="ls-actionbar">
        <Btn full touch onClick={onApply} disabled={!selected || disabled}>
          <SimIcon name="check" size={16} /> Aplicar filtro
        </Btn>
        <p className="ls-hint" style={{ textAlign: 'center' }}>
          {selected ? selected.label : 'Escolha um filtro para ver na foto'}
        </p>
      </div>
    </div>
  )
}

export default FilterPanel
