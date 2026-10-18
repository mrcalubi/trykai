import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  checkHold,
  parseDisputeAction,
  partialRefundPatch,
  planPartialRefund,
  type DisputeBooking,
} from '../_shared/disputes.ts'
import {
  bookingReference,
  formatSessionDate,
  publicDisplayName,
  sendDisputeRefundEmail,
} from '../_shared/email.ts'
import { asRecord, hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'

// Guest dispute tooling for ops (OPERATIONS.md, Guest dispute refund).
//   { action: 'hold', booking_id, reason }
//   { action: 'release_hold', booking_id }
//   { action: 'partial_refund', booking_id, refund_amount_cents, new_host_payout_cents }
// A full refund that cancels the booking is admin-cancel-booking with
// reason 'dispute'.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const BOOKING_COLUMNS = `
  id,
  status,
  total_amount,
  refund_amount,
  host_payout_amount,
  stripe_payment_id,
  stripe_refund_id,
  payout_released_at,
  payout_hold_reason,
  payout_held_at,
  stripe_partial_refund_ids,
  guest_id,
  payment_rail,
  sessions ( starts_at, listings ( title ) )
`

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  const secret = Deno.env.get('ADMIN_FUNCTION_SECRET')
  if (!hasValidSecret(req, secret, ['x-admin-secret'])) {
    return textResponse('Unauthorized', 401)
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'JSON body is required' }, 400)
    }
    const action = parseDisputeAction(body.action)
    if (!action) {
      return jsonResponse({ error: 'action must be hold, release_hold, or partial_refund' }, 400)
    }
    const bookingId = body.booking_id
    if (!bookingId || typeof bookingId !== 'string') {
      return jsonResponse({ error: 'booking_id is required' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: booking, error } = await admin
      .from('bookings')
      .select(BOOKING_COLUMNS)
      .eq('id', bookingId)
      .single()
    if (error || !booking) return jsonResponse({ error: 'Booking not found' }, 404)
    const row = booking as unknown as DisputeBooking & Record<string, unknown>

    if (action === 'hold') {
      const check = checkHold(row, body.reason)
      if (!check.ok) return jsonResponse({ error: check.error }, check.status)
      const heldAt = new Date().toISOString()
      // Guarded so a payout that went out since the read above is reported,
      // not silently "held".
      const { data: updated, error: updateError } = await admin
        .from('bookings')
        .update({ payout_hold_reason: check.reason, payout_held_at: heldAt })
        .eq('id', row.id)
        .is('payout_released_at', null)
        .select('id')
      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      if (!updated || updated.length === 0) {
        return jsonResponse({ error: 'Payout was released while placing the hold' }, 409)
      }
      return jsonResponse({
        ok: true,
        booking_id: row.id,
        payout_hold_reason: check.reason,
        payout_held_at: heldAt,
      })
    }

    if (action === 'release_hold') {
      if (!row.payout_hold_reason) return jsonResponse({ ok: true, already_released: true })
      const { error: updateError } = await admin
        .from('bookings')
        .update({ payout_hold_reason: null, payout_held_at: null })
        .eq('id', row.id)
      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      return jsonResponse({ ok: true, booking_id: row.id })
    }

    const plan = planPartialRefund(row, {
      refundCents: body.refund_amount_cents,
      newHostPayoutCents: body.new_host_payout_cents,
    })
    if (!plan.ok) return jsonResponse({ error: plan.error }, plan.status)

    // Platform charge (separate charges and transfers): the refund comes out
    // of the platform balance. Never reverse_transfer here.
    const refund = await stripe.refunds.create(
      {
        payment_intent: row.stripe_payment_id as string,
        amount: plan.refundCents,
        metadata: { booking_id: row.id, kind: 'dispute_partial' },
      },
      { idempotencyKey: plan.idempotencyKey },
    )

    // Optimistic lock on the refund total read above so two concurrent calls
    // cannot both write.
    let update = admin
      .from('bookings')
      .update(partialRefundPatch(row, plan, refund.id))
      .eq('id', row.id)
    update = row.refund_amount == null
      ? update.is('refund_amount', null)
      : update.eq('refund_amount', row.refund_amount)
    const { data: updated, error: updateError } = await update.select('id')
    if (updateError || !updated || updated.length === 0) {
      const detail = updateError?.message ?? 'booking changed since it was read'
      console.error('admin-dispute-booking: refund made but row not updated', row.id, refund.id, detail)
      return jsonResponse(
        {
          error: `Stripe refund ${refund.id} was created but the booking was not updated (${detail}). If refund_amount on the booking is unchanged, retry the same request: the idempotency key returns this refund instead of a new one. If it changed, another refund won the race; record ${refund.id} by hand.`,
          stripe_refund_id: refund.id,
        },
        500,
      )
    }

    const session = asRecord(row.sessions as { starts_at?: string; listings?: unknown } | null)
    const listing = asRecord(session?.listings as { title?: string } | null)
    try {
      const { data: guestProfile } = row.guest_id
        ? await admin
            .from('users')
            .select('email, full_name, display_name')
            .eq('id', row.guest_id)
            .maybeSingle()
        : { data: null }
      await sendDisputeRefundEmail({
        apiKey: Deno.env.get('RESEND_API_KEY'),
        guestEmail: guestProfile?.email,
        guestName: publicDisplayName(guestProfile),
        bookingReference: bookingReference(row.id),
        listingTitle: listing?.title || 'your session',
        sessionDate: session?.starts_at ? formatSessionDate(session.starts_at) : '',
        refundAmountCents: plan.refundCents,
        fullRefund: false,
        paymentRail: row.payment_rail as string | null,
        siteUrl: Deno.env.get('SITE_URL'),
      })
    } catch (emailErr) {
      console.error('admin-dispute-booking: email failed', emailErr)
    }

    return jsonResponse({
      ok: true,
      booking_id: row.id,
      stripe_refund_id: refund.id,
      refund_amount_cents: plan.refundCents,
      total_refunded_cents: plan.totalRefundedCents,
      host_payout_cents: plan.newHostPayoutCents,
      platform_keeps_cents: plan.platformKeepsCents,
      payout_released: plan.payoutReleased,
    })
  } catch (err) {
    const message = errorMessage(err)
    console.error('admin-dispute-booking failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
