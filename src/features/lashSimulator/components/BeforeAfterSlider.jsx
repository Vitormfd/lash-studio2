import { useCallback, useRef, useState } from 'react'
import { SimIcon } from './SimIcons'

/**
 * Comparação Antes | Depois com divisor arrastável.
 * touch-action: pan-y deixa a página rolar na vertical enquanto o arraste
 * horizontal move o divisor (funciona com toque, mouse e teclado).
 */
const BeforeAfterSlider = ({ beforeSrc, afterSrc, alt = 'Simulação de cílios' }) => {
  const [position, setPosition] = useState(50)
  const containerRef = useRef(null)
  const draggingRef = useRef(false)

  const updateFromClientX = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !rect.width) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, next)))
  }, [])

  const handlePointerDown = (event) => {
    draggingRef.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateFromClientX(event.clientX)
  }

  const handlePointerMove = (event) => {
    if (!draggingRef.current) return
    updateFromClientX(event.clientX)
  }

  const stopDragging = (event) => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const handleKeyDown = (event) => {
    const step = event.shiftKey ? 10 : 3
    if (event.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - step))
    else if (event.key === 'ArrowRight') setPosition((p) => Math.min(100, p + step))
    else if (event.key === 'Home') setPosition(0)
    else if (event.key === 'End') setPosition(100)
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={containerRef}
      className="ls-compare"
      role="slider"
      tabIndex={0}
      aria-label="Comparar antes e depois"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${Math.round(position)}% antes`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={handleKeyDown}
    >
      <img src={afterSrc} alt={`${alt} — depois`} draggable={false} />
      <div className="ls-compare-before" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={beforeSrc} alt={`${alt} — antes`} draggable={false} />
      </div>
      <span className="ls-compare-tag" style={{ left: 10, opacity: position > 12 ? 1 : 0 }}>Antes</span>
      <span className="ls-compare-tag" style={{ right: 10, opacity: position < 88 ? 1 : 0 }}>Depois</span>
      <div className="ls-compare-divider" style={{ left: `${position}%` }} />
      <div className="ls-compare-handle" style={{ left: `${position}%` }}>
        <SimIcon name="compare" size={20} />
      </div>
    </div>
  )
}

export default BeforeAfterSlider
