import { useEffect, useLayoutEffect, useRef } from 'react'
import HostTermsContent from './HostTermsContent'
import Icon from './ui/Icon'

const FOCUSABLE = 'a[href], button:not([disabled])'

export default function HostTermsDialog({ onClose }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const openerRef = useRef(null)
  const scrollRef = useRef(null)

  useLayoutEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    scrollRef.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = scrollRef.current
      const opener = openerRef.current
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

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
  }, [onClose])

  return (
    <div className="confirm-dialog-backdrop confirm-dialog-backdrop--sheet">
      <div
        ref={dialogRef}
        className="confirm-dialog confirm-dialog--sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-terms-title"
      >
        <div className="confirm-dialog__sheet-bar">
          <h2 id="host-terms-title" className="confirm-dialog__sheet-title">
            Host terms
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="wizard__close"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="confirm-dialog__sheet-body policy-page">
          <HostTermsContent />
        </div>
      </div>
    </div>
  )
}
