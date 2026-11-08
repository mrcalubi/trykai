import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { dayOneStatus, DAY_ONE_ENDS_AT, launchBannerCopy, showsLaunchBanner } from '../lib/dayOne'

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
 * Soft-launch banner under the nav: Day One badge for the first 50 guests and
 * bring-a-friend. Hidden after launch, on account pages, and for the rest of
 * the visit once closed.
 */
export default function LaunchBanner() {
  const { pathname } = useLocation()
  const [status, setStatus] = useState(null)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    let cancelled = false
    dayOneStatus().then((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (dismissed || !showsLaunchBanner(pathname)) return null
  const copy = launchBannerCopy({
    spotsLeft: status?.spotsLeft,
    endsAt: status?.endsAt ?? DAY_ONE_ENDS_AT,
  })
  if (!copy) return null

  return (
    <aside className="launch-banner" aria-label="Soft launch offer">
      <div className="launch-banner__inner">
        <p className="launch-banner__text">
          <span className="launch-banner__headline">{copy.headline}</span>{' '}
          <span className="launch-banner__friends">{copy.friends}</span>
        </p>
        <div className="launch-banner__side">
          {copy.countdown ? <span className="launch-banner__countdown">{copy.countdown}</span> : null}
          {pathname !== '/' ? (
            <Link to="/" className="launch-banner__link">
              Find a session
            </Link>
          ) : null}
          <button
            type="button"
            className="launch-banner__close"
            aria-label="Close"
            onClick={() => {
              writeDismissed()
              setDismissed(true)
            }}
          >
            ×
          </button>
        </div>
      </div>
    </aside>
  )
}
