import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { formatCents } from '../lib/cancellationPolicy'
import { formatDuration } from '../lib/duration'
import { listingCategoryAreaLine } from '../lib/listingCategories'
import { MAX_LISTING_REVIEW_NOTE_LENGTH } from '../../supabase/functions/_shared/listingReview.ts'
import Button from '../components/ui/Button'
import PageLoader from '../components/PageLoader'

function formatRequestedAt(iso) {
  if (!iso) return 'Submitted date unknown'
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
}

function factsLine(listing) {
  return [
    listingCategoryAreaLine(listing.category, listing.area),
    Number(listing.price_per_person) > 0 ? `S${formatCents(listing.price_per_person)} per person` : '',
    formatDuration(listing.duration_mins),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The listing review queue (00036). Every new listing waits here, hidden from
 * guests, until someone approves it or asks the host for a change. The host
 * is emailed either way. Hosts verified with Singpass are approved on the
 * spot, so this is where the TryKai team sees what each host will teach.
 */
export default function AdminListings() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')

  const callFunction = useCallback(async (body) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return supabase.functions.invoke('admin-listings', {
      body,
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: fnError } = await callFunction({ action: 'list' })
    setLoading(false)
    if (fnError || data?.error) {
      setError(await edgeFunctionErrorMessage(fnError, data))
      return
    }
    setListings(data?.listings ?? [])
  }, [callFunction])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  async function decide(listing, decision) {
    setError('')
    setNotice('')
    const note = (notes[listing.id] ?? '').trim()
    if (decision === 'changes_requested' && !note) {
      setError(`Write the change you need before sending "${listing.title}" back.`)
      return
    }

    setBusyId(listing.id)
    const { data, error: fnError } = await callFunction({
      action: 'review',
      listing_id: listing.id,
      decision,
      note: decision === 'changes_requested' ? note : undefined,
    })
    setBusyId(null)

    if (fnError || data?.error) {
      setError(await edgeFunctionErrorMessage(fnError, data))
      return
    }

    if (decision === 'approved') {
      setNotice(`"${listing.title}" is live. ${listing.host.name} has been emailed.`)
      setListings((prev) => prev.filter((row) => row.id !== listing.id))
    } else {
      setNotice(`Sent "${listing.title}" back to ${listing.host.name} with your note.`)
      setListings((prev) =>
        prev.map((row) =>
          row.id === listing.id ? { ...row, review_status: 'changes_requested', review_note: note } : row
        )
      )
      setNotes((prev) => ({ ...prev, [listing.id]: '' }))
    }
  }

  const waiting = listings.filter((row) => row.review_status === 'pending')
  const withHost = listings.filter((row) => row.review_status === 'changes_requested')

  function renderCard(listing) {
    const busy = busyId === listing.id
    const host = listing.host ?? {}
    return (
      <article key={listing.id} className="dashboard-card listing-review">
        {listing.photo_urls.length > 0 ? (
          <div className="listing-review__photos">
            {listing.photo_urls.slice(0, 5).map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`Photo ${index + 1}`} />
              </a>
            ))}
          </div>
        ) : (
          <p className="hint">No photos</p>
        )}

        <p className="dashboard-card__title">{listing.title}</p>
        <p className="dashboard-card__meta">{factsLine(listing)}</p>
        <p className="listing-review__description">{listing.description}</p>
        {listing.whats_provided.length > 0 ? (
          <p className="dashboard-card__meta">Provided: {listing.whats_provided.join(', ')}</p>
        ) : null}

        <p className="listing-review__host">
          <strong>{host.name}</strong>
          {host.email ? ` · ${host.email}` : ''}
          <br />
          {host.verification_method === 'singpass'
            ? `Singpass: ${host.verified_name || 'name not returned'}`
            : 'Verified by ID upload'}
          {' · '}
          {formatRequestedAt(listing.review_requested_at)}
        </p>
        {host.teaching_plan ? (
          <p className="verification-review__plan">
            <span className="verification-review__plan-label">Said they want to teach</span>
            {host.teaching_plan}
          </p>
        ) : null}

        {listing.review_status === 'changes_requested' ? (
          <p className="listing-review__sent">
            <span className="verification-review__plan-label">Waiting on the host. You asked</span>
            {listing.review_note}
          </p>
        ) : (
          <>
            <label className="label">
              Change needed
              <textarea
                className="input input--textarea"
                rows={3}
                maxLength={MAX_LISTING_REVIEW_NOTE_LENGTH}
                value={notes[listing.id] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [listing.id]: e.target.value }))}
                placeholder="e.g. Add a photo of what guests will make, and say what level this is for."
              />
              <span className="hint">
                Only to ask for a change. It is emailed to the host, and the listing comes back
                here when they save an edit.
              </span>
            </label>
            <div className="listing-review__actions">
              <Button
                variant="primary"
                loading={busy}
                loadingLabel="Saving"
                onClick={() => decide(listing, 'approved')}
              >
                Approve and go live
              </Button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => decide(listing, 'changes_requested')}
              >
                Ask for a change
              </button>
            </div>
          </>
        )}
      </article>
    )
  }

  return (
    <div className="page page--narrow">
      <h1 className="dashboard-heading">Listing review</h1>
      <p className="form-card__subtitle">
        New listings stay hidden from guests until you approve them. Check it is a real, safe,
        in-person session the host can plausibly teach, the photos are theirs, and the price and
        details make sense. Hosts who uploaded an ID are on{' '}
        <Link to="/admin/verifications">Verification review</Link>.
      </p>

      {notice && <p className="success-message">{notice}</p>}
      {error && <p className="error-message">{error}</p>}

      {loading ? (
        <PageLoader />
      ) : listings.length === 0 ? (
        <p className="empty-state">Nothing waiting for review.</p>
      ) : (
        <>
          {waiting.length > 0 ? (
            <div className="dashboard-list">{waiting.map(renderCard)}</div>
          ) : (
            <p className="empty-state">Nothing new to review.</p>
          )}
          {withHost.length > 0 ? (
            <>
              <h2 className="listing-review__heading">Waiting on the host</h2>
              <div className="dashboard-list">{withHost.map(renderCard)}</div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
