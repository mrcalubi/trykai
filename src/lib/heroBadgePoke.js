export const HERO_BADGE_POKE_PX = 10
export const HERO_BADGE_POKE_MS = 900

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function pokeOffset(pointer, center, distance = HERO_BADGE_POKE_PX) {
  const dx = center.x - pointer.x
  const dy = center.y - pointer.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: 0, y: -distance }
  return { x: (dx / length) * distance, y: (dy / length) * distance }
}

export function pokeAngleDeg(offset) {
  return (Math.atan2(offset.y, offset.x) * 180) / Math.PI
}

function wobbleTransform(offset, distance, along, across) {
  const peak = Math.hypot(offset.x, offset.y) || 1
  const tx = (offset.x / peak) * distance
  const ty = (offset.y / peak) * distance
  const angle = pokeAngleDeg(offset)
  return `translate(${tx}px, ${ty}px) rotate(${angle}deg) scale(${along}, ${across}) rotate(${-angle}deg)`
}

export function pokeWobbleKeyframes(offset) {
  const ease = { easing: 'ease-out' }
  return [
    { offset: 0, transform: wobbleTransform(offset, 0, 1, 1), ...ease },
    { offset: 0.12, transform: wobbleTransform(offset, 10, 0.82, 1.12), ...ease },
    { offset: 0.3, transform: wobbleTransform(offset, 6, 1.1, 0.92), ...ease },
    { offset: 0.48, transform: wobbleTransform(offset, 3, 0.95, 1.05), ...ease },
    { offset: 0.66, transform: wobbleTransform(offset, 1, 1.03, 0.98), ...ease },
    { offset: 0.84, transform: wobbleTransform(offset, 0, 0.99, 1.01), ...ease },
    { offset: 1, transform: wobbleTransform(offset, 0, 1, 1) },
  ]
}

export function pokeWobbleOptions() {
  return { duration: HERO_BADGE_POKE_MS, easing: 'linear' }
}
