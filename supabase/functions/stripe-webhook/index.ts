import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  calculateHostFee,
  calculateHostPayout,
  confirmRpcErrorKind,
} from '../_shared/booking.ts'
import {
  bookingConfirmedGuestHtml,
  bookingConfirmedHostHtml,
  formatSessionDate,
  sendResendEmail,
  verificationApprovedHtml,
  verificationRejectedHtml,
} from '../_shared/email.ts'
import { identityEventOutcome } from '../_shared/verification.ts'
import {
  asRecord,
  chargeIdFromPaymentIntent,
  jsonResponse,
  stripeEventAction,
  textResponse,
} from '../_shared/http.ts'
import { payoutsEnabledFromAccount } from '../_shared/connect.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

async function confirmSucceededPayment(paymentIntent: {
  id: string
  metadata?: Record<string, string>
  latest_charge?: string | { id?: string } | null
}) {
  const admin = adminClient()
  const bookingId = paymentIntent.metadata?.booking_id

  let bookingQuery = admin
    .from('bookings')
    .select(
      `
      id,
      status,
      guests_count,
      total_amount,
      platform_fee,
      guest_id,
      session_id,
      sessions (
        starts_at,
        listings (
          title,
          host_id,
          users:host_id (
            email,
            full_name,
            is_founding_host
          )
        )
      )
    `,
    )

  if (bookingId) {
    bookingQuery = bookingQuery.eq('id', bookingId)
  } else {
    bookingQuery = bookingQuery.eq('stripe_payment_id', paymentIntent.id)
  }

  const { data: booking, error } = await bookingQuery.maybeSingle()
  if (error || !booking) {
    console.error('webhook: booking not found for payment intent', paymentIntent.id, error)
    return
  }

  if (booking.status === 'confirmed') return
  if (booking.status !== 'pending') return

  const session = asRecord(booking.sessions)
  const listing = asRecord(session?.listings)
  const host = asRecord(listing?.users)
  const hostId = listing?.host_id
  const lessonAmount = booking.total_amount - booking.platform_fee

  let priorConfirmedCount = 0
  if (hostId) {
    const { count } = await admin
      .from('bookings')
      .select('id, sessions!inner(listings!inner(host_id))', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .eq('sessions.listings.host_id', hostId)
    priorConfirmedCount = count ?? 0
  }

  const hostFee = calculateHostFee({
    isFoundingHost: Boolean(host?.is_founding_host),
    priorConfirmedCount,
    lessonAmount,
  })
  const hostPayout = calculateHostPayout(lessonAmount, hostFee)
  let chargeId = chargeIdFromPaymentIntent(paymentIntent)
  if (!chargeId) {
    try {
      const fresh = await stripe.paymentIntents.retrieve(paymentIntent.id)
      chargeId = chargeIdFromPaymentIntent(fresh)
    } catch (err) {
      console.error('webhook: could not load charge id', paymentIntent.id, err)
    }
  }

  const { error: confirmError } = await admin.rpc('confirm_paid_booking', {
    p_booking_id: booking.id,
    p_stripe_charge_id: chargeId,
    p_host_fee: hostFee,
    p_host_payout_amount: hostPayout,
  })

  if (confirmError) {
    if (confirmRpcErrorKind(confirmError.message) === 'oversell') {
      if (booking.total_amount > 0) {
        await stripe.refunds.create({ payment_intent: paymentIntent.id })
      }
      await admin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_by: 'guest',
          cancelled_at: new Date().toISOString(),
          refund_amount: booking.total_amount,
        })
        .eq('id', booking.id)
        .eq('status', 'pending')
      return
    }
    throw confirmError
  }

  const sessionDate = session?.starts_at ? formatSessionDate(session.starts_at) : ''
  const listingTitle = listing?.title ?? 'your session'
  const apiKey = Deno.env.get('RESEND_API_KEY')

  const { data: guestProfile } = await admin
    .from('users')
    .select('full_name, email')
    .eq('id', booking.guest_id)
    .single()

  await sendResendEmail({
    apiKey,
    to: guestProfile?.email,
    subject: `Booking confirmed: ${listingTitle}`,
    html: bookingConfirmedGuestHtml({
      listingTitle,
      sessionDate,
      guestsCount: booking.guests_count,
    }),
  })

  await sendResendEmail({
    apiKey,
    to: host?.email,
    subject: `New booking for "${listingTitle}"`,
    html: bookingConfirmedHostHtml({
      guestName: guestProfile?.full_name || 'A guest',
      listingTitle,
      sessionDate,
      guestsCount: booking.guests_count,
    }),
  })
}

async function cancelPendingPayment(paymentIntent: { id: string; metadata?: Record<string, string> }) {
  const admin = adminClient()
  const bookingId = paymentIntent.metadata?.booking_id
  let query = admin.from('bookings').update({
    status: 'cancelled',
    cancelled_by: 'guest',
    cancelled_at: new Date().toISOString(),
    refund_amount: 0,
  }).eq('status', 'pending')

  if (bookingId) {
    query = query.eq('id', bookingId)
  } else {
    query = query.eq('stripe_payment_id', paymentIntent.id)
  }

  await query
}

async function syncConnectedAccount(account: { id: string; payouts_enabled?: boolean }) {
  const admin = adminClient()
  await admin
    .from('users')
    .update({ stripe_payouts_enabled: payoutsEnabledFromAccount(account) })
    .eq('stripe_account_id', account.id)
}

/**
 * Stripe holds the documents; this only records the outcome. The host is
 * emailed from here for the same reason the review UI emails from its own
 * action: the decision and the reason exist at this point and nowhere else.
 */
async function reviewIdentitySession(
  eventType: string,
  session: {
    id: string
    metadata?: Record<string, string>
    last_error?: { code?: unknown; reason?: unknown } | null
  },
) {
  const outcome = identityEventOutcome(eventType, session)
  if (outcome.action === 'ignore') return

  const admin = adminClient()
  const userId = session.metadata?.user_id

  let profileQuery = admin.from('users').select('id, full_name, email')
  profileQuery = userId
    ? profileQuery.eq('id', userId)
    : profileQuery.eq('stripe_identity_session_id', session.id)

  const { data: profile, error } = await profileQuery.maybeSingle()
  if (error || !profile) {
    console.error('identity: no host for verification session', session.id, error)
    return
  }

  const decision = outcome.action === 'approve' ? 'approved' : 'rejected'
  const reason = outcome.action === 'reject' ? outcome.reason : null

  const { error: reviewError } = await admin.rpc('review_verification', {
    p_user_id: profile.id,
    p_decision: decision,
    p_reason: reason,
    p_method: 'stripe_identity',
    p_reviewer_id: null,
  })

  if (reviewError) {
    console.error('identity: review_verification failed', profile.id, reviewError.message)
    return
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (decision === 'approved') {
    await sendResendEmail({
      apiKey,
      to: profile.email,
      subject: "You're verified! Start hosting on TryKai",
      html: verificationApprovedHtml({ hostName: profile.full_name }),
    })
  } else {
    await sendResendEmail({
      apiKey,
      to: profile.email,
      subject: 'Update on your TryKai verification',
      html: verificationRejectedHtml({
        hostName: profile.full_name,
        reason: reason as string,
      }),
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return textResponse('ok')
  }

  const signature = req.headers.get('Stripe-Signature')
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!signature || !secret) {
    return jsonResponse({ error: 'Missing webhook signature' }, 400)
  }

  const body = await req.text()
  let event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      secret,
      undefined,
      cryptoProvider,
    )
  } catch (err) {
    console.error('webhook signature failed', err instanceof Error ? err.message : err)
    return jsonResponse({ error: 'Invalid signature' }, 400)
  }

  try {
    const action = stripeEventAction(event.type)
    if (action === 'confirm') {
      await confirmSucceededPayment(event.data.object)
    } else if (action === 'cancel_pending') {
      await cancelPendingPayment(event.data.object)
    } else if (action === 'sync_account') {
      await syncConnectedAccount(event.data.object)
    } else if (action === 'review_identity') {
      await reviewIdentitySession(event.type, event.data.object)
    }

    return jsonResponse({ received: true })
  } catch (err) {
    console.error('webhook handler failed', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
