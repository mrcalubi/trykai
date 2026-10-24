import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { MAX_REJECTION_REASON_LENGTH } from '../../supabase/functions/_shared/verification.ts'
import { ageFromDob, formatSingpassDob } from '../lib/singpass'
import Button from '../components/ui/Button'
import PageLoader from '../components/PageLoader'

function formatSubmittedAt(iso) {
  if (!iso) return 'Submitted date unknown'
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
}

export default function AdminVerifications() {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reasons, setReasons] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')

  const callFunction = useCallback(async (body) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    return supabase.functions.invoke('admin-verifications', {
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

    setPending(data?.pending ?? [])
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

  async function decide(host, decision) {
    setError('')
    setNotice('')

    const reason = (reasons[host.id] ?? '').trim()
    if (decision === 'reject' && !reason) {
      setError(`Add a reason before rejecting ${host.full_name || 'this host'}.`)
      return
    }

    setBusyId(host.id)

    const { data, error: fnError } = await callFunction({
      action: 'review',
      user_id: host.id,
      decision,
      reason: decision === 'reject' ? reason : undefined,
    })

    setBusyId(null)

    if (fnError || data?.error) {
      setError(await edgeFunctionErrorMessage(fnError, data))
      return
    }

    setNotice(
      decision === 'approve'
        ? `${host.full_name || 'Host'} approved. They can create listings now.`
        : `${host.full_name || 'Host'} rejected, and the reason has been emailed to them.`
    )
    setPending((prev) => prev.filter((row) => row.id !== host.id))
  }

  return (
    <div className="page page--narrow">
      <h1 className="dashboard-heading">Verification review</h1>
      <p className="form-card__subtitle">
        Hosts who upload an ID instead of using Singpass wait here. Check that the selfie is the
        same person as the ID, and that the ID is readable. Document links expire after a few
        minutes, so reload if an image stops loading. New listings are reviewed on{' '}
        <Link to="/admin/listings">Listing review</Link>.
      </p>

      {notice && <p className="success-message">{notice}</p>}
      {error && <p className="error-message">{error}</p>}

      {loading ? (
        <PageLoader />
      ) : pending.length === 0 ? (
        <p className="empty-state">Nothing waiting for review.</p>
      ) : (
        <div className="dashboard-list">
          {pending.map((host) => (
            <div key={host.id} className="dashboard-card">
              <p className="dashboard-card__title">{host.full_name || 'Unnamed host'}</p>
              <p className="dashboard-card__meta">
                {host.email} · {formatSubmittedAt(host.submitted_at)}
              </p>

              {host.teaching_plan ? (
                <p className="verification-review__plan">
                  <span className="verification-review__plan-label">Wants to teach</span>
                  {host.teaching_plan}
                </p>
              ) : null}

              {host.method === 'singpass' ? (
                <p className="verification-review__singpass">
                  Verified with Singpass as <strong>{host.verified_name || 'unknown name'}</strong>
                  {host.verified_name &&
                  host.full_name &&
                  host.verified_name.trim().toLowerCase() !== host.full_name.trim().toLowerCase()
                    ? `. Their account says ${host.full_name}.`
                    : '.'}
                  {host.verified_dob ? (
                    <>
                      <br />
                      Born {formatSingpassDob(host.verified_dob)} (age {ageFromDob(host.verified_dob)}) ·{' '}
                      {host.verified_mobile || 'no mobile on Singpass'}
                    </>
                  ) : null}
                </p>
              ) : (
                <div className="verification-review__docs">
                  {['id_photo_url', 'selfie_url'].map((key) => (
                    <figure key={key} className="verification-review__doc">
                      <figcaption>{key === 'id_photo_url' ? 'ID document' : 'Selfie'}</figcaption>
                      {host[key] ? (
                        <a href={host[key]} target="_blank" rel="noreferrer">
                          <img
                            src={host[key]}
                            alt={key === 'id_photo_url' ? 'ID document' : 'Selfie'}
                          />
                        </a>
                      ) : (
                        <p className="hint">Not uploaded</p>
                      )}
                    </figure>
                  ))}
                </div>
              )}

              <label className="label">
                Rejection reason
                <input
                  type="text"
                  className="input"
                  maxLength={MAX_REJECTION_REASON_LENGTH}
                  value={reasons[host.id] ?? ''}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [host.id]: e.target.value }))
                  }
                  placeholder="e.g. the ID photo is too blurry to read"
                />
                <span className="hint">
                  Required to reject, and sent to the host so they know what to fix.
                </span>
              </label>

              <div className="booking-card__actions">
                <Button
                  variant="primary"
                  loading={busyId === host.id}
                  loadingLabel="Saving"
                  onClick={() => decide(host, 'approve')}
                >
                  Approve
                </Button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busyId === host.id}
                  onClick={() => decide(host, 'reject')}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
