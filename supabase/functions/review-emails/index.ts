// POST { review_id } from the person who just posted that review.
//
// Emails the other party (if they have not reviewed and the window is still
// open) and hello@ when there is a private note. The page does not wait on
// it; a failure never rolls back the review. Claim columns
// (other_party_emailed_at, review_notes.emailed_at) before send so a repeat
// call sends nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'
import {
  callerOwnsReview,
  sendReviewFollowUpEmails,
  type ReviewEmailRow,
  type ReviewNoteRow,
  type ReviewPerson,
} from '../_shared/reviewEmails.ts'
import { notifyUserTelegram } from '../_shared/telegram.ts'

type UserRow = ReviewPerson

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = asRecord(await req.json().catch(() => null))
    const reviewId = typeof body?.review_id === 'string' ? body.review_id : ''
    if (!reviewId) return jsonResponse({ error: 'review_id required' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: reviewRow, error: reviewError } = await admin
      .from('reviews')
      .select(
        'id, reviewer_id, reviewee_id, role, booking_id, other_party_emailed_at, reveal_after',
      )
      .eq('id', reviewId)
      .maybeSingle()
    if (reviewError) {
      console.error('review-emails lookup failed', reviewError.message)
      return jsonResponse({ error: 'Could not read that review' }, 500)
    }
    if (!callerOwnsReview(reviewRow, user.id)) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }
    const review = reviewRow as ReviewEmailRow

    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select(
        'id, guest_id, sessions ( listing_id, listings ( id, title, host_id, users:host_id ( id, full_name, display_name, email ) ) )',
      )
      .eq('id', review.booking_id)
      .maybeSingle()
    if (bookingError || !booking) {
      console.error('review-emails booking lookup failed', bookingError?.message)
      return jsonResponse({ error: 'Could not read that booking' }, 500)
    }

    const session = asRecord(booking.sessions)
    const listing = asRecord(session?.listings)
    const hostProfile = (asRecord(listing?.users) ?? {}) as UserRow
    const hostId = typeof listing?.host_id === 'string' ? listing.host_id : ''
    const guestId = typeof booking.guest_id === 'string' ? booking.guest_id : ''
    const listingTitle = typeof listing?.title === 'string' ? listing.title : 'a session'

    const { data: guestRow } = await admin
      .from('users')
      .select('id, full_name, display_name, email')
      .eq('id', guestId)
      .maybeSingle()
    const guest = (guestRow ?? { id: guestId }) as UserRow
    const host = { id: hostId, ...hostProfile } as UserRow

    const otherRole = review.role === 'guest' ? 'host' : 'guest'
    const otherReviewee = review.role === 'guest' ? guestId : hostId
    const { data: other } = await admin
      .from('reviews')
      .select('id')
      .eq('booking_id', review.booking_id)
      .eq('role', otherRole)
      .eq('reviewee_id', otherReviewee)
      .maybeSingle()

    const { data: notes } = await admin
      .from('review_notes')
      .select('id, note, emailed_at')
      .eq('review_id', review.id)
      .order('created_at', { ascending: true })
      .limit(1)
    const privateNote = ((notes ?? [])[0] ?? null) as ReviewNoteRow | null

    const result = await sendReviewFollowUpEmails({
      callerId: user.id,
      review,
      otherReviewed: Boolean(other?.id),
      privateNote,
      guest,
      host,
      listingTitle,
      siteUrl: Deno.env.get('SITE_URL') ?? 'https://trykai.sg',
      apiKey: Deno.env.get('RESEND_API_KEY'),
      opsEmail: Deno.env.get('ADMIN_NOTIFY_EMAIL') || 'hello@trykai.sg',
      notifyHost: (message) => notifyUserTelegram(admin, hostId, message),
      claimOtherParty: async () => {
        const { data: claimed } = await admin
          .from('reviews')
          .update({ other_party_emailed_at: new Date().toISOString() })
          .eq('id', review.id)
          .is('other_party_emailed_at', null)
          .select('id')
        return Boolean(claimed?.length)
      },
      claimNote: async (noteId) => {
        const { data: claimed } = await admin
          .from('review_notes')
          .update({ emailed_at: new Date().toISOString() })
          .eq('id', noteId)
          .is('emailed_at', null)
          .select('id')
        return Boolean(claimed?.length)
      },
    })

    if (result.error === 'forbidden') return jsonResponse({ error: 'Forbidden' }, 403)
    return jsonResponse({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('review-emails failed', message)
    return jsonResponse({ error: 'Unexpected error' }, 500)
  }
})
