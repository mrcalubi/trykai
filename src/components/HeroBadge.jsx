import { useEffect, useRef } from 'react'
import {
  pokeOffset,
  pokeWobbleKeyframes,
  pokeWobbleOptions,
  prefersReducedMotion,
} from '../lib/heroBadgePoke'

export default function HeroBadge({ src, className = '' }) {
  const ref = useRef(null)
  const animRef = useRef(null)

  useEffect(
    () => () => {
      animRef.current?.cancel()
    },
    [],
  )

  function onPointerDown(event) {
    if (prefersReducedMotion()) return
    const node = ref.current
    if (!node || typeof node.animate !== 'function') return
    const rect = node.getBoundingClientRect()
    const offset = pokeOffset(
      { x: event.clientX, y: event.clientY },
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    )
    animRef.current?.cancel()
    animRef.current = node.animate(pokeWobbleKeyframes(offset), pokeWobbleOptions())
  }

  return (
    <span
      ref={ref}
      className={`home-hero__badge ${className}`.trim()}
      onPointerDown={onPointerDown}
    >
      <span className="home-hero__badge-inner">
        <img src={src} alt="" draggable={false} loading="lazy" />
      </span>
    </span>
  )
}
