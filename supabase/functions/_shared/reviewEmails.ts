import {
  bookingReference,
  formatSessionDay,
  GUEST_REPLY_TO,
  publicDisplayName,
  reviewNudgeGuestHtml,
  reviewNudgeGuestSubject,
  reviewNudgeHostHtml,
  reviewNudgeHostSubject,
  reviewPrivateNoteOpsHtml,
  reviewPrivateNoteOpsSubject,
  sendResendEmail,
} from './email.ts'

export type ReviewEmailRow = {
  id: string
  reviewer_id: string
  reviewee_id: string
  role: string
  booking_id: string
  other_party_emailed_at: string | null
  reveal_after: string | null
}

export type ReviewNoteRow = {
  id: string
  note: string
  emailed_at: string | null
}

export type ReviewPerson = {
  id: string
  full_name?: string | null
  display_name?: string | null
  email?: string | null
}

export function callerOwnsReview(
  review: { reviewer_id?: string | null } | null,
  callerId: string | null,
): boolean {
  return Boolean(review && callerId && review.reviewer_id === callerId)
}

export function reviewWindowOpen(revealAfter: string | null | undefined, now = Date.now()): boolean {
  if (!revealAfter) return false
  const at = new Date(revealAfter).getTime()
  return Number.isFinite(at) && at > now
}

export function shouldEmailOtherParty(options: {
  otherReviewed: boolean
  windowOpen: boolean
  alreadyEmailed: boolean
}): boolean {
  return !options.otherReviewed && options.windowOpen && !options.alreadyEmailed
}

export async function sendReviewFollowUpEmails(options: {
  callerId: string
  review: ReviewEmailRow | null
  otherReviewed: boolean
  privateNote: ReviewNoteRow | null
  guest: ReviewPerson
  host: ReviewPerson
  listingTitle: string
  claimOtherParty: () => Promise<boolean>
  claimNote: (noteId: string) => Promise<boolean>
  sendEmail?: typeof sendResendEmail
  siteUrl: string
  apiKey: string | undefined
  opsEmail?: string
  now?: number
}): Promise<{ otherParty: boolean; privateNote: boolean; error?: string }> {
  if (!callerOwnsReview(options.review, options.callerId)) {
    return { otherParty: false, privateNote: false, error: 'forbidden' }
  }

  const review = options.review as ReviewEmailRow
  const send = options.sendEmail ?? sendResendEmail
  const now = options.now ?? Date.now()
  const guestName = publicDisplayName(options.guest) || 'A guest'
  const hostName = publicDisplayName(options.host) || 'your host'
  const deadline = review.reveal_after ? formatSessionDay(review.reveal_after) : ''
  const windowOpen = reviewWindowOpen(review.reveal_after, now)

  let otherParty = false
  if (
    shouldEmailOtherParty({
      otherReviewed: options.otherReviewed,
      windowOpen,
      alreadyEmailed: Boolean(review.other_party_emailed_at),
    })
  ) {
    const claimed = await options.claimOtherParty()
    if (claimed) {
      if (review.role === 'guest') {
        await send({
          apiKey: options.apiKey,
          to: options.host.email,
          subject: reviewNudgeHostSubject(guestName, options.listingTitle),
          html: reviewNudgeHostHtml({
            siteUrl: options.siteUrl,
            hostName: publicDisplayName(options.host) || null,
            hostId: options.host.id,
            guestName,
            listingTitle: options.listingTitle,
            deadline,
          }),
        })
      } else {
        await send({
          apiKey: options.apiKey,
          to: options.guest.email,
          subject: reviewNudgeGuestSubject(hostName),
          html: reviewNudgeGuestHtml({
            siteUrl: options.siteUrl,
            guestName: publicDisplayName(options.guest) || null,
            hostName,
            bookingId: review.booking_id,
            deadline,
          }),
        })
      }
      otherParty = true
    }
  }

  let privateNote = false
  const note = options.privateNote
  if (note && !note.emailed_at) {
    const claimed = await options.claimNote(note.id)
    if (claimed) {
      const authorIsGuest = review.role === 'guest'
      const author = authorIsGuest ? options.guest : options.host
      const authorName = publicDisplayName(author) || (authorIsGuest ? 'A guest' : 'A host')
      await send({
        apiKey: options.apiKey,
        to: options.opsEmail || GUEST_REPLY_TO,
        subject: reviewPrivateNoteOpsSubject(),
        html: reviewPrivateNoteOpsHtml({
          siteUrl: options.siteUrl,
          bookingReference: bookingReference(review.booking_id),
          listingTitle: options.listingTitle,
          authorName,
          authorRole: authorIsGuest ? 'guest' : 'host',
          note: note.note,
        }),
        replyTo: author.email || undefined,
      })
      privateNote = true
    }
  }

  return { otherParty, privateNote }
}
