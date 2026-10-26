import { useEffect, useRef, useState } from 'react'
import {
  pokeOffset,
  pokeTransform,
  prefersReducedMotion,
} from '../lib/heroBadgePoke'

export default function HeroBadge({ src, className = '' }) {
  const ref = useRef(null)
  const clearRef = useRef(0)
  const [offset, setOffset] = useState(null)

  useEffect(() => () => window.clearTimeout(clearRef.current), [])

  function onPointerDown(event) {
    if (prefersReducedMotion()) return
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setOffset(
      pokeOffset(
        { x: event.clientX, y: event.clientY },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      ),
    )
    window.clearTimeout(clearRef.current)
    clearRef.current = window.setTimeout(() => setOffset(null), 0)
  }

  return (
    <span
      ref={ref}
      className={`home-hero__badge ${className}`.trim()}
      style={offset ? { transform: pokeTransform(offset) } : undefined}
      onPointerDown={onPointerDown}
    >
      <span className="home-hero__badge-inner">
        <img src={src} alt="" draggable={false} loading="lazy" />
      </span>
    </span>
  )
}
