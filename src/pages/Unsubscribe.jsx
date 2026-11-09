import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { unsubscribeByToken } from '../lib/marketing'

const COPY = {
  working: { title: 'Unsubscribing…', body: '' },
  done: {
    title: "You're unsubscribed",
    body: "You won't get new sessions and offers by email any more. Booking emails and reminders still come as usual.",
  },
  invalid: {
    title: 'That link has expired',
    body: 'You can turn offer emails off in Settings instead.',
  },
  error: {
    title: 'Something went wrong',
    body: 'Try the link again in a moment, or turn offer emails off in Settings.',
  },
}

/** /unsubscribe?t=<token>: the one-tap link in every marketing email. No sign-in needed. */
export default function Unsubscribe() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t')
  const [state, setState] = useState('working')

  useEffect(() => {
    let cancelled = false
    unsubscribeByToken(token).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const copy = COPY[state]
  return (
    <div className="page page--narrow page--centered unsubscribe-page">
      <h1>{copy.title}</h1>
      {copy.body ? <p>{copy.body}</p> : null}
      {state === 'done' ? <p className="hint">Changed your mind? Turn it back on in Settings.</p> : null}
      {state !== 'working' ? (
        <p>
          <Link to="/settings" className="ui-button ui-button--secondary">
            Settings
          </Link>{' '}
          <Link to="/" className="ui-button ui-button--primary">
            Find a session
          </Link>
        </p>
      ) : null}
    </div>
  )
}
