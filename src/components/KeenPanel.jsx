import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  INTEREST_DAY_LABELS,
  INTEREST_DAYS,
  INTEREST_MAX_GROUP,
  INTEREST_TIME_LABELS,
  INTEREST_TIMES,
  KEEN_ERROR,
  keenBadge,
  keenCountsById,
  toggleChoice,
} from '../lib/keen'

/**
 * Shown in the booking card when a listing has no upcoming sessions. A guest
 * taps "I'm keen" (chips optional), the host is nudged by email, and the guest
 * is emailed once when a date opens. Signed-out guests go to login first.
 */
export default function KeenPanel({ listingId, hostName, viewerId }) {
  const navigate = useNavigate()
  const location = useLocation()
  const host = hostName || 'the host'
  const [days, setDays] = useState([])
  const [times, setTimes] = useState([])
  const [groupSize, setGroupSize] = useState(1)
  const [keen, setKeen] = useState(false)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.rpc('listing_keen_counts', { p_listing_ids: [listingId] }).then(({ data }) => {
      if (!cancelled) setCount(keenCountsById(data)[listingId] ?? 0)
    })
    return () => {
      cancelled = true
    }
  }, [listingId])

  useEffect(() => {
    if (!viewerId) return undefined
    let cancelled = false
    supabase.rpc('my_listing_interest', { p_listing_id: listingId }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : null
      if (cancelled || !row) return
      setDays(row.days ?? [])
      setTimes(row.times ?? [])
      setGroupSize(row.group_size ?? 1)
      setKeen(true)
    })
    return () => {
      cancelled = true
    }
  }, [listingId, viewerId])

  async function submit() {
    setError('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      navigate('/login', { state: { from: location } })
      return
    }
    setBusy(true)
    const { error: fnError } = await supabase.functions.invoke('listing-interest', {
      body: { listing_id: listingId, days, times, group_size: groupSize },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setBusy(false)
    if (fnError) {
      setError(KEEN_ERROR)
      return
    }
    if (!keen) setCount((value) => value + 1)
    setKeen(true)
  }

  async function withdraw() {
    setError('')
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('clear_my_listing_interest', {
      p_listing_id: listingId,
    })
    setBusy(false)
    if (rpcError) {
      setError(KEEN_ERROR)
      return
    }
    setKeen(false)
    setCount((value) => Math.max(0, value - 1))
  }

  const badge = keenBadge(count)

  if (keen) {
    return (
      <div className="keen-panel keen-panel--done" aria-live="polite">
        <p className="keen-panel__title">{host}&apos;s been nudged</p>
        <p className="keen-panel__text">We&apos;ll email you when a date opens.</p>
        {badge ? <p className="keen-panel__count">{badge}</p> : null}
        <button type="button" className="keen-panel__link" onClick={withdraw} disabled={busy}>
          Not keen anymore
        </button>
        {error ? <p className="error-message">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="keen-panel">
      <p className="keen-panel__title">No dates yet</p>
      <p className="keen-panel__text">Keen? We&apos;ll nudge {host} to open one.</p>
      {badge ? <p className="keen-panel__count">{badge}</p> : null}

      <p className="keen-panel__label">When suits you? <span>Optional</span></p>
      <div className="choice-chips keen-panel__chips keen-panel__chips--days" role="group" aria-label="Days">
        {INTEREST_DAYS.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={days.includes(day)}
            className={`choice-chip${days.includes(day) ? ' choice-chip--on' : ''}`}
            onClick={() => setDays((list) => toggleChoice(list, day))}
          >
            {INTEREST_DAY_LABELS[day]}
          </button>
        ))}
      </div>
      <div className="choice-chips keen-panel__chips" role="group" aria-label="Times">
        {INTEREST_TIMES.map((time) => (
          <button
            key={time}
            type="button"
            aria-pressed={times.includes(time)}
            className={`choice-chip${times.includes(time) ? ' choice-chip--on' : ''}`}
            onClick={() => setTimes((list) => toggleChoice(list, time))}
          >
            {INTEREST_TIME_LABELS[time]}
          </button>
        ))}
      </div>

      <div className="guest-stepper keen-panel__stepper">
        <div className="guest-stepper__row">
          <p className="guest-stepper__label">How many of you?</p>
          <div className="guest-stepper__controls">
            <button
              type="button"
              className="guest-stepper__btn"
              aria-label="Fewer people"
              disabled={groupSize <= 1}
              onClick={() => setGroupSize((n) => n - 1)}
            >
              −
            </button>
            <span className="guest-stepper__count" aria-live="polite">
              {groupSize}
            </span>
            <button
              type="button"
              className="guest-stepper__btn"
              aria-label="More people"
              disabled={groupSize >= INTEREST_MAX_GROUP}
              onClick={() => setGroupSize((n) => n + 1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <button type="button" className="btn btn--primary keen-panel__button" onClick={submit} disabled={busy}>
        {busy ? 'Sending…' : "I'm keen"}
      </button>
      {error ? <p className="error-message">{error}</p> : null}
    </div>
  )
}
