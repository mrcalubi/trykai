import { useId, useState } from 'react'
import Button from './ui/Button'
import { publicName } from '../lib/publicName'
import {
  checkReplyBody,
  deleteReviewReply,
  REPLY_MAX_LENGTH,
  saveReviewReply,
} from '../lib/reviewReplies'

/**
 * The host's public reply under a guest review. Everyone sees the reply; the
 * host of the session (canReply) also gets Reply, Edit and Delete.
 */
export default function ReviewReply({ review, canReply = false, hostName, onChange }) {
  const fieldId = useId()
  const reply = review.reply ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')

  if (!reply && !canReply) return null

  const author = publicName({ display_name: reply?.host_display_name }) || hostName || 'the host'

  function startEditing() {
    setDraft(reply?.body ?? '')
    setError('')
    setEditing(true)
  }

  async function handleSave(event) {
    event.preventDefault()
    const { error: invalid } = checkReplyBody(draft)
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)
    setError('')
    const result = await saveReviewReply(review.id, draft)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditing(false)
    onChange?.(review.id, { host_display_name: reply?.host_display_name ?? hostName, ...result.reply })
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const removed = await deleteReviewReply(review.id)
    setDeleting(false)
    setConfirmingDelete(false)
    if (!removed) {
      setError("Couldn't delete your reply. Try again.")
      return
    }
    onChange?.(review.id, null)
  }

  if (editing) {
    const left = REPLY_MAX_LENGTH - draft.length
    return (
      <form className="review-reply review-reply--form" onSubmit={handleSave}>
        <label className="review-reply__label" htmlFor={fieldId}>
          {reply ? 'Edit your reply' : 'Your public reply'}
        </label>
        <textarea
          id={fieldId}
          className="input input--textarea"
          rows={3}
          value={draft}
          maxLength={REPLY_MAX_LENGTH}
          placeholder="Thank them, or add something the next guest should know."
          onChange={(event) => setDraft(event.target.value.slice(0, REPLY_MAX_LENGTH))}
          autoFocus
        />
        <p className="hint review-reply__hint">
          Shown under the review for everyone.{left <= 100 ? ` ${left} characters left.` : ''}
        </p>
        {error ? <p className="error-message">{error}</p> : null}
        <div className="review-reply__actions">
          <Button type="submit" loading={saving} loadingLabel="Saving">
            {reply ? 'Save' : 'Post reply'}
          </Button>
          <button type="button" className="link-button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    )
  }

  if (!reply) {
    return (
      <div className="review-reply__start">
        <button type="button" className="link-button" onClick={startEditing}>
          Reply publicly
        </button>
      </div>
    )
  }

  return (
    <div className="review-reply">
      <p className="review-reply__label">Reply from {author}</p>
      <p className="review-reply__body">{reply.body}</p>
      {canReply && confirmingDelete ? (
        <div className="review-reply__actions">
          <span className="review-reply__confirm">Delete your reply?</span>
          <button
            type="button"
            className="link-button"
            onClick={handleDelete}
            disabled={deleting}
            aria-busy={deleting || undefined}
          >
            {deleting ? 'Deleting' : 'Yes, delete'}
          </button>
          <button type="button" className="link-button" onClick={() => setConfirmingDelete(false)}>
            Keep it
          </button>
        </div>
      ) : canReply ? (
        <div className="review-reply__actions">
          <button type="button" className="link-button" onClick={startEditing}>
            Edit
          </button>
          <button type="button" className="link-button" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </div>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
    </div>
  )
}
