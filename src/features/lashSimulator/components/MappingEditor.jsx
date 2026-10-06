import { useRef, useState } from 'react'
import { LENGTH_MAX_MM, LENGTH_MIN_MM } from '../catalog'
import { SimIcon } from './SimIcons'

const regionName = (index, total) => {
  if (index === 0) return 'canto interno'
  if (index === total - 1) return 'canto externo'
  return `região ${index + 1}`
}

/**
 * Editor de comprimentos por região do olho (canto interno → externo).
 * Arraste as barras para cima/baixo, ou toque numa barra e use − / +.
 */
const MappingEditor = ({ lengths, onChange }) => {
  const [selected, setSelected] = useState(Math.floor(lengths.length / 2))
  const barsRef = useRef(null)
  const dragRef = useRef(null)
  // Valores mais recentes, mesmo entre eventos de arraste antes do próximo render.
  const latestRef = useRef(lengths)
  latestRef.current = lengths

  const setLength = (index, mm) => {
    const value = Math.min(LENGTH_MAX_MM, Math.max(LENGTH_MIN_MM, Math.round(mm)))
    if (value === latestRef.current[index]) return
    const next = [...latestRef.current]
    next[index] = value
    latestRef.current = next
    onChange(next)
  }

  const valueFromPointer = (clientY) => {
    const rect = barsRef.current.getBoundingClientRect()
    const ratio = 1 - (clientY - rect.top - 18) / (rect.height - 18)
    return LENGTH_MIN_MM - 1 + ratio * (LENGTH_MAX_MM - LENGTH_MIN_MM + 1)
  }

  const indexFromPointer = (clientX) => {
    const rect = barsRef.current.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return Math.min(lengths.length - 1, Math.max(0, Math.floor(ratio * lengths.length)))
  }

  const handlePointerDown = (event) => {
    if (!barsRef.current) return
    const index = indexFromPointer(event.clientX)
    dragRef.current = { index, pointerId: event.pointerId }
    barsRef.current.setPointerCapture?.(event.pointerId)
    setSelected(index)
    setLength(index, valueFromPointer(event.clientY))
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // Arrastar na horizontal "pinta" as barras vizinhas, como num equalizador.
    const index = indexFromPointer(event.clientX)
    if (index !== drag.index) {
      drag.index = index
      setSelected(index)
    }
    setLength(index, valueFromPointer(event.clientY))
  }

  const endDrag = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    barsRef.current?.releasePointerCapture?.(event.pointerId)
  }

  const handleKeyDown = (index) => (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      setLength(index, lengths[index] + 1)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      setLength(index, lengths[index] - 1)
    } else return
    event.preventDefault()
  }

  const range = LENGTH_MAX_MM - LENGTH_MIN_MM + 1

  return (
    <div className="ls-map">
      <div
        ref={barsRef}
        className="ls-map-bars"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {lengths.map((mm, index) => (
          <button
            key={index}
            type="button"
            className="ls-map-col"
            data-selected={selected === index}
            role="slider"
            aria-label={`Comprimento no ${regionName(index, lengths.length)}`}
            aria-valuemin={LENGTH_MIN_MM}
            aria-valuemax={LENGTH_MAX_MM}
            aria-valuenow={mm}
            aria-valuetext={`${mm} milímetros`}
            onFocus={() => setSelected(index)}
            onKeyDown={handleKeyDown(index)}
          >
            <span className="ls-map-value">{mm}</span>
            <span className="ls-map-bar" style={{ height: `${((mm - LENGTH_MIN_MM + 1) / range) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="ls-map-axis">
        <span>Canto interno</span>
        <span>mm</span>
        <span>Canto externo</span>
      </div>
      <div className="ls-map-stepper">
        <button
          type="button"
          className="ls-step-btn"
          aria-label="Diminuir comprimento"
          onClick={() => setLength(selected, lengths[selected] - 1)}
          disabled={lengths[selected] <= LENGTH_MIN_MM}
        >
          <SimIcon name="minus" size={16} />
        </button>
        <span style={{ textAlign: 'center', flex: 1 }}>
          <strong style={{ color: 'var(--text)' }}>{lengths[selected]} mm</strong>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-light)', textTransform: 'capitalize' }}>
            {regionName(selected, lengths.length)}
          </span>
        </span>
        <button
          type="button"
          className="ls-step-btn"
          aria-label="Aumentar comprimento"
          onClick={() => setLength(selected, lengths[selected] + 1)}
          disabled={lengths[selected] >= LENGTH_MAX_MM}
        >
          <SimIcon name="plus" size={16} />
        </button>
      </div>
    </div>
  )
}

export default MappingEditor
