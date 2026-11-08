import { useEffect, useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './ui/Icon'
import {
  BANNER_ROTATE_MS,
  dayOneStatus,
  DAY_ONE_ENDS_AT,
  launchBannerCopy,
  showsLaunchBanner,
} from '../lib/dayOne'

const DISMISS_KEY = 'trykai:launch-banner-dismissed'

function readDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Private mode: the banner simply comes back on the next page.
  }
}

/**
 * Soft-launch bar under the nav: one short line at a time, rotating between
 * Day One and bring-a-friend. Tap for the details. Hidden after launch, on
 * account pages, and for the rest of the visit once closed.
 */
export default function LaunchBanner() {
  const { pathname } = useLocation()
  const detailsId = useId()
  const [status, setStatus] = useState(null)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let cancelled = false
    dayOneStatus().then((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = !dismissed && showsLaunchBanner(pathname)
  const copy = visible
    ? launchBannerCopy({ spotsLeft: status?.spotsLeft, endsAt: status?.endsAt ?? DAY_ONE_ENDS_AT })
    : null
  const count = copy?.messages.length ?? 0

  useEffect(() => {
    if (count < 2 || open || paused) return undefined
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), BANNER_ROTATE_MS)
    return () => clearInterval(timer)
  }, [count, open, paused])

  if (!copy) return null
  const message = copy.messages[index % count]

  return (
    <aside
      className="launch-banner"
      aria-label="Soft launch offer"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="launch-banner__bar">
        <button
          type="button"
          className="launch-banner__main"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((current) => !current)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span key={message.key} className="launch-banner__message">
            <Icon name={message.icon} size={16} strokeWidth={2.2} />
            <span className="launch-banner__text launch-banner__text--long">{message.text}</span>
            <span className="launch-banner__text launch-banner__text--short" aria-hidden="true">
              {message.short}
            </span>
            {message.chip ? <span className="launch-banner__chip">{message.chip}</span> : null}
          </span>
          {count > 1 ? (
            <span className="launch-banner__dots" aria-hidden="true">
              {copy.messages.map((item, i) => (
                <i key={item.key} className={i === index % count ? 'is-on' : ''} />
              ))}
            </span>
          ) : null}
          <Icon
            name="chevronDown"
            size={16}
            strokeWidth={2.4}
            className={`launch-banner__chevron${open ? ' is-open' : ''}`}
          />
        </button>
        <button
          type="button"
          className="launch-banner__close"
          aria-label="Close"
          onClick={() => {
            writeDismissed()
            setDismissed(true)
          }}
        >
          <Icon name="close" size={16} strokeWidth={2.4} />
        </button>
      </div>
      {open ? (
        <div id={detailsId} className="launch-banner__details">
          {copy.details.map((item) => (
            <p key={item.key}>
              {item.parts.map((part, i) =>
                part.highlight ? (
                  <mark key={i} className="launch-banner__highlight">
                    {part.text}
                  </mark>
                ) : part.strong ? (
                  <strong key={i}>{part.text}</strong>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </p>
          ))}
          <p className="launch-banner__details-foot">
            {copy.countdown ? <span>{copy.countdown} until launch on 1 Dec.</span> : null}
            {pathname !== '/' ? (
              <Link to="/" className="launch-banner__link" onClick={() => setOpen(false)}>
                Find a session
              </Link>
            ) : null}
          </p>
        </div>
      ) : null}
    </aside>
  )
}
