import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export default function OverflowMenu({ label = 'More actions', items, className = '' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const itemRefs = useRef([])
  const triggerRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  function focusItem(index) {
    const nodes = itemRefs.current.filter(Boolean)
    if (nodes.length === 0) return
    const next = ((index % nodes.length) + nodes.length) % nodes.length
    nodes[next]?.focus()
  }

  function handleMenuKeyDown(event) {
    const nodes = itemRefs.current.filter(Boolean)
    const current = nodes.indexOf(document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusItem(current + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusItem(current - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusItem(nodes.length - 1)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  function closeAnd(select) {
    setOpen(false)
    select?.()
  }

  return (
    <div className={['ui-overflow', className].filter(Boolean).join(' ')} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-overflow__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        ⋯
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          className="ui-overflow__menu"
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => {
            const classes = [
              'ui-overflow__item',
              item.destructive ? 'ui-overflow__item--destructive' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <li key={item.label} role="none">
                {item.to ? (
                  <Link
                    ref={(node) => {
                      itemRefs.current[index] = node
                    }}
                    role="menuitem"
                    className={classes}
                    to={item.to}
                    onClick={() => closeAnd(item.onSelect)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    ref={(node) => {
                      itemRefs.current[index] = node
                    }}
                    type="button"
                    role="menuitem"
                    className={classes}
                    onClick={() => closeAnd(item.onSelect)}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
