import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authenticateAdmin } from '../_shared/admin-auth.ts'
import { spotsToRestore } from '../_shared/booking.ts'
import {
  bookingReference,
  formatSessionDate,
  publicDisplayName,
  resolvePaymentMethod,
  sendCancellationEmails,
  sendDisputeRefundEmail,
} from '../_shared/email.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'
import { adminCancelEvent, cleanNote, recordMoneyEvent } from '../_shared/money-events.ts'

// reason 'host_cancelled' (default): the host could not run the session.
// reason 'dispute': ops upheld a guest dispute (OPERATIONS.md, Guest dispute
// refund). Same full refund and cancel; the guest gets a refund receipt
// instead of "your host had to cancel".
//
// Caller: an admin's own JWT (users.is_admin re-checked), or the
// x-admin-secret break-glass with x-admin-operator (_shared/admin-auth.ts).
// Each cancel writes a booking_money_events row naming who did it, with the
// optional free-text `note`.
type CancelReason = 'host_cancelled' | 'dispute'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const auth = await authenticateAdmin(req, {
      breakGlassSecret: Deno.env.get('ADMIN_FUNCTION_SECRET'),
      getUserId: async (authorization) => {
        const supabaseAuth = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authorization } } },
        )
        const {
          data: { user },
        } = await supabaseAuth.auth.getUser()
        return user?.id ?? null
      },
      isAdmin: async (userId) => {
        const { data } = await admin.from('users').select('is_admin').eq('id', userId).maybeSingle()
        return data?.is_admin === true
      },
    })
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status)

    const { booking_id, reason: rawReason, note: rawNote } = await req.json()
    if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400)
    if (rawReason != null && rawReason !== 'host_cancelled' && rawReason !== 'dispute') {
      return jsonResponse({ error: "reason must be 'host_cancelled' or 'dispute'" }, 400)
    }
    const reason: CancelReason = rawReason ?? 'host_cancelled'
    const note = cleanNote(rawNote)
    if (!note.ok) return jsonResponse({ error: note.error }, note.status)

    const { data: booking, error } = await admin
      .from('bookings')
      .select(
        `
        id,
        status,
        guests_count,
        total_amount,
        refund_amount,
        host_payout_amount,
        payout_released_at,
        stripe_payment_id,
        session_id,
        guest_id,
        payment_rail,
        sessions ( starts_at, listings ( id, title, host_id, category ) )
      `,
      )
      .eq('id', booking_id)
      .single()

    if (error || !booking) return jsonResponse({ error: 'Booking not found' }, 404)
    if (booking.status === 'cancelled') {
      return jsonResponse({ ok: true, already_cancelled: true })
    }

    let stripeRefundId = null
    if (booking.stripe_payment_id && booking.status === 'confirmed' && booking.total_amount > 0) {
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_id,
      })
      stripeRefundId = refund.id
    } else if (booking.stripe_payment_id && booking.status === 'pending') {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_id)
      } catch {
        if (booking.total_amount > 0) {
          const refund = await stripe.refunds.create({
            payment_intent: booking.stripe_payment_id,
          })
          stripeRefundId = refund.id
        }
      }
    }

    const restore = spotsToRestore(booking.status, booking.guests_count)
    // refund_amount is cumulative. A Stripe refund with no amount returns
    // whatever an earlier partial dispute refund left, so the guest is told
    // only the amount refunded now.
    const refundAmount = booking.status === 'confirmed' || stripeRefundId ? booking.total_amount : 0
    const refundedNow = Math.max(0, refundAmount - (booking.refund_amount ?? 0))

    const { error: cancelError } = await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_by: 'host',
        cancelled_at: new Date().toISOString(),
        refund_amount: refundAmount,
        stripe_refund_id: stripeRefundId,
        payout_hold_reason: null,
        payout_held_at: null,
      })
      .eq('id', booking.id)
    if (cancelError) {
      console.error('admin-cancel-booking: booking not updated', booking.id, stripeRefundId, cancelError.message)
    }

    // Logged even if the row write failed: the Stripe refund already happened.
    const audit = await recordMoneyEvent(
      (r) => admin.from('booking_money_events').insert(r),
      adminCancelEvent(booking, auth.actor, {
        reason,
        refundedNowCents: refundedNow,
        stripeRefundId,
        note: note.note,
      }),
    )

    if (restore > 0) {
      const { data: session } = await admin
        .from('sessions')
        .select('spots_remaining, status')
        .eq('id', booking.session_id)
        .single()

      if (session) {
        await admin
          .from('sessions')
          .update({
            spots_remaining: session.spots_remaining + restore,
            status: session.status === 'full' ? 'open' : session.status,
          })
          .eq('id', booking.session_id)
      }
    }

    const session = asRecord(booking.sessions)
    const listing = asRecord(session?.listings)

    try {
      const { data: guestProfile } = booking.guest_id
        ? await admin
            .from('users')
            .select('email, full_name, display_name')
            .eq('id', booking.guest_id)
            .maybeSingle()
        : { data: null }

      if (reason === 'dispute') {
        await sendDisputeRefundEmail({
          apiKey: Deno.env.get('RESEND_API_KEY'),
          guestEmail: guestProfile?.email,
          guestName: publicDisplayName(guestProfile),
          bookingReference: bookingReference(booking.id),
          listingTitle: listing?.title || 'your session',
          sessionDate: session?.starts_at ? formatSessionDate(session.starts_at) : '',
          refundAmountCents: refundedNow,
          fullRefund: true,
          paymentRail: booking.payment_rail,
          siteUrl: Deno.env.get('SITE_URL'),
        })
        return jsonResponse({ ...cancelResult(booking, refundAmount, refundedNow, reason), ...audit })
      }

      const { data: hostProfile } = listing?.host_id
        ? await admin
            .from('users')
            .select('full_name, display_name')
            .eq('id', listing.host_id)
            .maybeSingle()
        : { data: null }

      const { data: otherSessions } = listing?.id
        ? await admin
            .from('sessions')
            .select('id')
            .eq('listing_id', listing.id)
            .eq('status', 'open')
            .gt('starts_at', new Date().toISOString())
            .limit(1)
        : { data: [] }

      const paymentMethod = await resolvePaymentMethod({
        paymentRail: booking.payment_rail,
        retrieveIntent: booking.stripe_payment_id
          ? () =>
              stripe.paymentIntents.retrieve(booking.stripe_payment_id, {
                expand: ['latest_charge'],
              })
          : undefined,
      })

      await sendCancellationEmails({
        apiKey: Deno.env.get('RESEND_API_KEY'),
        cancelledBy: 'host',
        refundAmountCents: refundedNow,
        bookingReference: bookingReference(booking.id),
        listingTitle: listing?.title || 'your session',
        sessionDate: session?.starts_at ? formatSessionDate(session.starts_at) : '',
        guestEmail: guestProfile?.email,
        hostEmail: null,
        guestName: publicDisplayName(guestProfile),
        hostName: publicDisplayName(hostProfile) || 'your host',
        listingId: listing?.id,
        listingCategory: listing?.category,
        hasOtherSessions: (otherSessions ?? []).length > 0,
        paymentRail: booking.payment_rail,
        guestsCount: booking.guests_count,
        paymentMethod,
        siteUrl: Deno.env.get('SITE_URL'),
      })
    } catch (emailErr) {
      console.error('admin-cancel-booking: email failed', emailErr)
    }

    return jsonResponse({ ...cancelResult(booking, refundAmount, refundedNow, reason), ...audit })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})

function cancelResult(
  booking: { payout_released_at: string | null },
  refundAmount: number,
  refundedNow: number,
  reason: CancelReason,
) {
  return {
    ok: true,
    reason,
    refund_amount: refundAmount,
    refunded_now: refundedNow,
    // The host was already paid; this refund came out of TryKai's balance.
    // Recover it from the host by hand (OPERATIONS.md, Guest dispute refund).
    payout_already_released: Boolean(booking.payout_released_at),
  }
}
