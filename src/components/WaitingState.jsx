import { useEffect, useState } from 'react'
import LoadingMascot from './LoadingMascot'

export const WAITING_STILL_AFTER_MS = 4000
export const WAITING_LONG_AFTER_MS = 12000
export const WAITING_STILL_MESSAGE = 'Still working…'
export const WAITING_LONG_MESSAGE =
  'This is taking longer than usual. Please keep this page open.'

export default function WaitingState({ title, message, illustration }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed((current) => current + 250)
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  const stepped =
    elapsed >= WAITING_LONG_AFTER_MS
      ? WAITING_LONG_MESSAGE
      : elapsed >= WAITING_STILL_AFTER_MS
        ? WAITING_STILL_MESSAGE
        : message

  return (
    <div className="waiting-state" role="status">
      <div className="waiting-state__art">{illustration ?? <LoadingMascot />}</div>
      {title ? <h2 className="waiting-state__title">{title}</h2> : null}
      <p className="waiting-state__message">{stepped}</p>
    </div>
  )
}
