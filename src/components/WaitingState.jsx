import { useEffect, useState } from 'react'
import LoadingMascot from './LoadingMascot'

export const WAITING_STILL_AFTER_MS = 4000
export const WAITING_LONG_AFTER_MS = 12000
export const WAITING_STILL_MESSAGE = 'Still working…'
export const WAITING_LONG_MESSAGE =
  'This is taking longer than usual. Please keep this page open.'

export default function WaitingState({ title, message, illustration, hold = false }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (hold) return undefined
    const still = window.setTimeout(() => setStep(1), WAITING_STILL_AFTER_MS)
    const long = window.setTimeout(() => setStep(2), WAITING_LONG_AFTER_MS)
    return () => {
      window.clearTimeout(still)
      window.clearTimeout(long)
    }
  }, [hold])

  const stepped = hold
    ? message
    : step >= 2
      ? WAITING_LONG_MESSAGE
      : step >= 1
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
