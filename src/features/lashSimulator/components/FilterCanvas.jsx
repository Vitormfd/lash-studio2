import { useEffect, useRef } from 'react'
import { drawFilteredPhoto, eyePivot, nearestEye } from '../overlayFilter'

const MAX_PREVIEW_SIDE = 1100

/**
 * Foto com o filtro de cílios, editável com o dedo/mouse:
 * - um dedo: arrasta o filtro do olho tocado (ou os dois, espelhados);
 * - dois dedos: pinça muda o tamanho e gira.
 */
const FilterCanvas = ({ photo, analysis, overlay, image, adjustments, linked, activeEye, onSelectEye, onAdjust }) => {
  const canvasRef = useRef(null)
  const gestureRef = useRef(null)
  const pointersRef = useRef(new Map())
  const frameRef = useRef(0)

  const scale = Math.min(1, MAX_PREVIEW_SIDE / Math.max(analysis.width, analysis.height))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      canvas.width = Math.round(analysis.width * scale)
      canvas.height = Math.round(analysis.height * scale)
      drawFilteredPhoto(canvas.getContext('2d'), photo.canvas, analysis, overlay, image, adjustments, { scale })
    })
    return () => cancelAnimationFrame(frameRef.current)
  }, [photo, analysis, overlay, image, adjustments, scale])

  const toPhoto = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * analysis.width,
      y: ((event.clientY - rect.top) / rect.height) * analysis.height,
    }
  }

  const startGesture = () => {
    const points = [...pointersRef.current.values()]
    const eye = activeEyeRef.current
    const base = adjustmentsRef.current
    if (points.length >= 2) {
      const [a, b] = points
      gestureRef.current = {
        type: 'pinch',
        eye,
        base,
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      }
    } else if (points.length === 1) {
      gestureRef.current = { type: 'drag', eye, base, start: points[0] }
    } else {
      gestureRef.current = null
    }
  }

  // Refs para os handlers sempre verem o estado atual.
  const activeEyeRef = useRef(activeEye)
  activeEyeRef.current = activeEye
  const adjustmentsRef = useRef(adjustments)
  adjustmentsRef.current = adjustments

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = toPhoto(event)
    if (pointersRef.current.size === 0) {
      const eye = nearestEye(analysis, point)
      if (eye !== activeEye) {
        activeEyeRef.current = eye
        onSelectEye(eye)
      }
    }
    pointersRef.current.set(event.pointerId, point)
    startGesture()
  }

  const handlePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, toPhoto(event))
    const gesture = gestureRef.current
    if (!gesture) return
    const points = [...pointersRef.current.values()]
    if (gesture.type === 'drag' && points.length === 1) {
      const dx = points[0].x - gesture.start.x
      const dy = points[0].y - gesture.start.y
      onAdjust(gesture.eye, (adj) => ({ ...adj, dx: adj.dx + dx, dy: adj.dy + dy }), gesture.base)
    } else if (gesture.type === 'pinch' && points.length >= 2) {
      const [a, b] = points
      const ratio = Math.hypot(b.x - a.x, b.y - a.y) / gesture.dist
      const rotate = ((Math.atan2(b.y - a.y, b.x - a.x) - gesture.angle) * 180) / Math.PI
      onAdjust(gesture.eye, (adj) => ({ ...adj, scale: adj.scale * ratio, rotate: adj.rotate + rotate }), gesture.base)
    }
  }

  const handlePointerUp = (event) => {
    pointersRef.current.delete(event.pointerId)
    startGesture()
  }

  const marker = !linked && analysis.eyes[activeEye] ? eyePivot(analysis.eyes[activeEye]) : null
  const adj = adjustments[activeEye]

  return (
    <div className="ls-filter-stage">
      <canvas
        ref={canvasRef}
        className="ls-filter-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Foto com filtro de cílios. Arraste para posicionar; use dois dedos para ajustar tamanho e rotação."
        role="img"
      />
      {marker && (
        <span
          className="ls-filter-marker"
          style={{
            left: `${((marker.x + adj.dx) / analysis.width) * 100}%`,
            top: `${((marker.y + adj.dy) / analysis.height) * 100}%`,
          }}
        />
      )}
    </div>
  )
}

export default FilterCanvas
