import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/compressImage'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { REPORT_EMAIL } from '../lib/reportMailto'
import { formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import {
  COMPLAINT_MAX_CHARS,
  COMPLAINT_MAX_PHOTOS,
  canReportProblem,
  complaintWindow,
  validateComplaint,
} from '../../supabase/functions/_shared/complaints.ts'
import { bookingReference } from '../../supabase/functions/_shared/email.ts'
import Button from './ui/Button'

function dayAndTime(ms) {
  const iso = new Date(ms).toISOString()
  return `${formatSessionDay(iso)}, ${formatSessionTime(iso)}`
}

function safetyMailto(bookingId) {
  const subject = `Safety report: booking ${bookingReference(bookingId)}`
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
}

/**
 * Guest quality complaint (Dispute Policy): open from the session start until
 * 3 days after it ends. Safety reports stay on email with no time limit.
 */
export default function ReportProblem({ booking }) {
  const [reportedAt, setReportedAt] = useState(null)
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [photoNote, setPhotoNote] = useState('')

  const confirmed = booking?.status === 'confirmed'

  useEffect(() => {
    if (!confirmed) return undefined
    let cancelled = false
    void Promise.resolve().then(async () => {
      const { data } = await supabase
        .from('booking_complaints')
        .select('created_at')
        .eq('booking_id', booking.id)
        .maybeSingle()
      if (!cancelled && data?.created_at) setReportedAt(data.created_at)
    })
    return () => {
      cancelled = true
    }
  }, [booking.id, confirmed])

  if (!confirmed) return null

  const reportable = canReportProblem(booking)
  const reportWindow = complaintWindow(booking.sessions)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const check = validateComplaint({
      description,
      photos: photos.map((photo) => ({ type: photo.type, size: 0 })),
    })
    if (!check.ok) {
      setError(check.error)
      return
    }
    setSending(true)
    const compressed = await Promise.all(photos.map((photo) => compressImage(photo)))
    const sized = validateComplaint({ description, photos: compressed })
    if (!sized.ok) {
      setSending(false)
      setError(sized.error)
      return
    }
    const form = new FormData()
    form.append('booking_id', booking.id)
    form.append('description', sized.description)
    for (const photo of compressed) form.append('photos', photo)

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const { data, error: invokeError } = await supabase.functions.invoke('report-booking-problem', {
      body: form,
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    setSending(false)
    if (invokeError || data?.error) {
      setError(await edgeFunctionErrorMessage(invokeError, data))
      return
    }
    setReportedAt(data?.created_at || new Date().toISOString())
    setPhotoNote(
      data?.photos_failed > 0
        ? "Some photos didn't upload. Reply to our email with them."
        : '',
    )
    setOpen(false)
  }

  return (
    <section className="booking-detail__section report-problem">
      {reportedAt ? (
        <>
          <p className="booking-detail__row">
            You reported a problem on {formatSessionDay(reportedAt)}. We&apos;ll reply by email
            within 2 business days.
          </p>
          {photoNote ? <p className="hint">{photoNote}</p> : null}
        </>
      ) : null}

      {!reportedAt && reportable && !open ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setError('')
            setOpen(true)
          }}
        >
          Report a problem
        </Button>
      ) : null}

      {!reportedAt && reportable && open ? (
        <form onSubmit={handleSubmit} className="form report-problem__form">
          <label className="label">
            What happened?
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="For example, the host arrived 40 minutes late and the session was cut short."
              rows={5}
              maxLength={COMPLAINT_MAX_CHARS}
              className="input input--textarea"
            />
          </label>
          <label className="label">
            Photos (optional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
              className="input input--file"
            />
            <span className="hint">Up to {COMPLAINT_MAX_PHOTOS} photos.</span>
          </label>
          {reportWindow ? (
            <p className="hint">
              Reports close {dayAndTime(reportWindow.closesAt)}, 3 days after the session ends.
            </p>
          ) : null}
          {error ? <p className="error-message">{error}</p> : null}
          <div className="booking-detail__actions">
            <button type="submit" disabled={sending} className="btn btn--primary">
              {sending ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn--ghost">
              Never mind
            </button>
          </div>
        </form>
      ) : null}

      <p className="hint">
        Safety concern? <a href={safetyMailto(booking.id)}>Email {REPORT_EMAIL}</a> at any time.
      </p>
    </section>
  )
}
