import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const FOCUSABLE = 'button:not([disabled])'

export default function PhotoLightbox({ photos, title, startIndex = 0, onClose }) {
  const count = photos.length
  const [index, setIndex] = useState(() => {
    if (count === 0) return 0
    return Math.min(Math.max(startIndex, 0), count - 1)
  })
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const openerRef = useRef(null)
  const scrollRef = useRef(null)
  const hasMany = count > 1

  useLayoutEffect(() => {
    if (count === 0) return undefined

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    scrollRef.current = {
      body: document.body.style.overflow,
      root: document.documentElement.style.overflow,
    }
    document.body.classList.add('lightbox-open')
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.body.classList.remove('lightbox-open')
      if (scrollRef.current) {
        document.body.style.overflow = scrollRef.current.body
        document.documentElement.style.overflow = scrollRef.current.root
      }
      const opener = openerRef.current
      if (opener && document.contains(opener)) {
        opener.focus()
      }
    }
  }, [count])

  useEffect(() => {
    function focusables() {
      return [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowLeft' && hasMany) {
        event.preventDefault()
        setIndex((current) => (current - 1 + count) % count)
        return
      }

      if (event.key === 'ArrowRight' && hasMany) {
        event.preventDefault()
        setIndex((current) => (current + 1) % count)
        return
      }

      if (event.key !== 'Tab') return

      const nodes = focusables()
      if (nodes.length === 0) return

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      const inside = Boolean(dialogRef.current?.contains(active))

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [count, hasMany, onClose])

  if (count === 0) return null

  function goTo(delta) {
    setIndex((current) => (current + delta + count) % count)
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      ref={dialogRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
      onClick={handleBackdropClick}
    >
      <button
        ref={closeRef}
        type="button"
        className="lightbox__close"
        aria-label="Close"
        onClick={onClose}
      >
        ×
      </button>

      {hasMany && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--prev"
          aria-label="Previous photo"
          onClick={() => goTo(-1)}
        >
          ‹
        </button>
      )}

      <img src={photos[index]} alt={`${title} ${index + 1}`} className="lightbox__photo" />

      {hasMany && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--next"
          aria-label="Next photo"
          onClick={() => goTo(1)}
        >
          ›
        </button>
      )}

      <p className="lightbox__position" aria-live="polite">
        {index + 1} / {count}
      </p>
    </div>
  )
}
