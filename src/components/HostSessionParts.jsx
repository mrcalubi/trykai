import { guestInitials } from '../lib/hostSessions'

/** One segment per spot, filled for booked ones. A plain bar past 12 spots. */
export function SpotBar({ booked, capacity, className = '' }) {
  const total = Math.max(0, capacity)
  const filled = Math.min(Math.max(0, booked), total)
  const classes = ['spot-bar', className].filter(Boolean).join(' ')
  if (total === 0) return null
  if (total > 12) {
    return (
      <span className={`${classes} spot-bar--long`} aria-hidden="true">
        <span className="spot-bar__fill" style={{ width: `${(filled / total) * 100}%` }} />
      </span>
    )
  }
  return (
    <span className={classes} aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < filled ? 'spot-bar__seg spot-bar__seg--on' : 'spot-bar__seg'} />
      ))}
    </span>
  )
}

export function GuestAvatar({ name, className = '' }) {
  return (
    <span className={['guest-avatar', className].filter(Boolean).join(' ')} aria-hidden="true">
      {guestInitials(name)}
    </span>
  )
}
