import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  calculateHostFee,
  calculateHostPayout,
  confirmRpcErrorKind,
} from '../_shared/booking.ts'
import {
  bookingConfirmedGuestHtml,
  bookingConfirmedGuestSubject,
  bookingConfirmedHostHtml,
  bookingReference,
  cardDetailsFromCharge,
  formatDuration,
  formatSessionDate,
  GUEST_REPLY_TO,
  paymentMethodFromIntent,
  publicDisplayName,
  sendResendEmail,
  verificationApprovedHtml,
  verificationRejectedHtml,
} from '../_shared/email.ts'
import { identityEventOutcome } from '../_shared/verification.ts'
import {
  asRecord,
  chargeIdFromPaymentIntent,
  constructStripeWebhookEvent,
  jsonResponse,
  stripeEventAction,
  stripeWebhookSecrets,
  textResponse,
} from '../_shared/http.ts'
import {
  applyConnectedAccountPayouts,
  connectedAccountFromEvent,
} from '../_shared/connect.ts'
import {
  chargebackClosedEmail,
  chargebackHoldEvent,
  chargebackOpenedEmail,
  planChargebackHold,
  refundReconcilePatch,
  stripeObjectId,
  type ChargebackBooking,
  type ChargebackHoldOutcome,
  type StripeDisputeLike,
} from '../_shared/chargebacks.ts'
import { recordMoneyEvent } from '../_shared/money-events.ts'

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
      payment_rail,
      guest_id,
      session_id,
      sessions (
        starts_at,
        duration_mins,
        listings (
          id,
          title,
          host_id,
          full_address,
          duration_mins,
          price_per_person,
          group_pricing,
          category,
          whats_provided,
          users:host_id (
            email,
            full_name,
            display_name,
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
  let intentForReceipt: { latest_charge?: unknown } = paymentIntent
  const chargeCard = cardDetailsFromCharge(
    typeof paymentIntent.latest_charge === 'object' ? paymentIntent.latest_charge : null,
  )
  const needsCardDetails = booking.payment_rail !== 'paynow' && !chargeCard.last4
  if (!chargeId || needsCardDetails) {
    try {
      const fresh = await stripe.paymentIntents.retrieve(paymentIntent.id, {
        expand: ['latest_charge'],
      })
      chargeId = chargeId || chargeIdFromPaymentIntent(fresh)
      intentForReceipt = fresh
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
  const siteUrl = Deno.env.get('SITE_URL')
  const reference = bookingReference(booking.id)
  const duration = formatDuration(session?.duration_mins ?? listing?.duration_mins)
  const paymentMethod = paymentMethodFromIntent(booking.payment_rail, intentForReceipt)

  const { data: guestProfile } = await admin
    .from('users')
    .select('full_name, display_name, email')
    .eq('id', booking.guest_id)
    .single()

  const guestName = publicDisplayName(guestProfile)
  const hostName = publicDisplayName(host) || 'your host'
  const durationMins = session?.duration_mins ?? listing?.duration_mins

  await sendResendEmail({
    apiKey,
    to: guestProfile?.email,
    subject: bookingConfirmedGuestSubject(listingTitle, session?.starts_at ?? ''),
    replyTo: GUEST_REPLY_TO,
    html: bookingConfirmedGuestHtml({
      bookingReference: reference,
      listingTitle,
      hostName,
      guestName,
      sessionDate,
      duration,
      fullAddress: listing?.full_address ?? '',
      guestsCount: booking.guests_count,
      pricePerPersonCents: listing?.price_per_person ?? 0,
      groupPricing: listing?.group_pricing !== false,
      paymentRail: booking.payment_rail,
      totalPaidCents: booking.total_amount,
      paymentMethod,
      sessionStartsAt: session?.starts_at ?? '',
      durationMins,
      whatsProvided: listing?.whats_provided,
      bookingId: booking.id,
      siteUrl,
    }),
  })

  await sendResendEmail({
    apiKey,
    to: host?.email,
    subject: `New booking for "${listingTitle}"`,
    html: bookingConfirmedHostHtml({
      bookingReference: reference,
      hostName: publicDisplayName(host),
      guestName: guestName || 'A guest',
      listingTitle,
      sessionDate,
      guestsCount: booking.guests_count,
      hostPayoutCents: hostPayout,
      siteUrl,
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

async function syncConnectedAccount(event: {
  account?: string | null
  data?: { object?: { id?: string | null; payouts_enabled?: boolean | null } | null }
}) {
  await applyConnectedAccountPayouts(adminClient(), connectedAccountFromEvent(event))
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

const CHARGEBACK_BOOKING_COLUMNS =
  'id, payout_released_at, payout_hold_reason, stripe_refund_id, refund_amount, stripe_partial_refund_ids, host_payout_amount'

/** The booking a charge paid for: by charge id, then by PaymentIntent. */
async function findBookingForCharge(
  admin: ReturnType<typeof adminClient>,
  chargeId: string | null,
  paymentIntentId: string | null,
): Promise<ChargebackBooking | null> {
  for (const [column, value] of [
    ['stripe_charge_id', chargeId],
    ['stripe_payment_id', paymentIntentId],
  ] as const) {
    if (!value) continue
    const { data, error } = await admin
      .from('bookings')
      .select(CHARGEBACK_BOOKING_COLUMNS)
      .eq(column, value)
      .maybeSingle()
    if (error) throw error
    if (data) return data as ChargebackBooking
  }
  return null
}

function opsEmail(): string {
  return Deno.env.get('ADMIN_NOTIFY_EMAIL') ?? 'calebong2002@gmail.com'
}

/**
 * A chargeback debits the platform plus a dispute fee at once, so the host
 * payout is held before the next hourly release-payout run can send it.
 */
async function openChargeback(dispute: StripeDisputeLike, livemode: boolean) {
  const admin = adminClient()
  const chargeId = stripeObjectId(dispute.charge)
  const booking = await findBookingForCharge(
    admin,
    chargeId,
    stripeObjectId(dispute.payment_intent),
  )

  let outcome: ChargebackHoldOutcome = 'no_booking'
  let auditError: string | null = null
  if (booking) {
    const plan = planChargebackHold(booking, new Date().toISOString())
    if (plan.kind === 'hold') {
      // Guarded like admin-dispute-booking: a payout that went out since the
      // read is reported, not silently "held".
      const { data: updated, error } = await admin
        .from('bookings')
        .update(plan.patch)
        .eq('id', booking.id)
        .is('payout_released_at', null)
        .select('id')
      if (error) throw error
      outcome = updated && updated.length > 0 ? 'held' : 'payout_released'
      if (outcome === 'held') {
        const audit = await recordMoneyEvent(
          (row) => admin.from('booking_money_events').insert(row),
          chargebackHoldEvent(booking, dispute),
        )
        if (!audit.audit_logged) auditError = audit.audit_error
      }
    } else {
      outcome = plan.kind
    }
  }

  console.log('webhook: chargeback opened', {
    dispute: dispute.id,
    charge: chargeId,
    booking: booking?.id ?? null,
    outcome,
  })

  const email = chargebackOpenedEmail({
    dispute,
    bookingId: booking?.id ?? null,
    outcome,
    previousHoldReason: booking?.payout_hold_reason,
    auditError,
    livemode,
  })
  await sendResendEmail({ apiKey: Deno.env.get('RESEND_API_KEY'), to: opsEmail(), ...email })
}

/** Reported only. Ops decide what the host is owed, so the hold stays. */
async function closeChargeback(dispute: StripeDisputeLike, livemode: boolean) {
  const chargeId = stripeObjectId(dispute.charge)
  const booking = await findBookingForCharge(
    adminClient(),
    chargeId,
    stripeObjectId(dispute.payment_intent),
  )

  console.log('webhook: chargeback closed', {
    dispute: dispute.id,
    charge: chargeId,
    booking: booking?.id ?? null,
    status: dispute.status,
    payout_hold_reason: booking?.payout_hold_reason ?? null,
  })

  const email = chargebackClosedEmail({
    dispute,
    bookingId: booking?.id ?? null,
    payoutHoldReason: booking?.payout_hold_reason ?? null,
    livemode,
  })
  await sendResendEmail({ apiKey: Deno.env.get('RESEND_API_KEY'), to: opsEmail(), ...email })
}

/**
 * Brings refund_amount and the refund ids in line with refunds made in the
 * Stripe Dashboard. Refunds are listed from the API because newer API
 * versions leave charge.refunds out of the event.
 */
async function reconcileRefunds(charge: {
  id: string
  payment_intent?: string | { id?: string } | null
  amount_refunded?: number | null
}) {
  const admin = adminClient()
  const booking = await findBookingForCharge(admin, charge.id, stripeObjectId(charge.payment_intent))
  if (!booking) {
    console.error('webhook: no booking for refunded charge', charge.id)
    return
  }

  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 })
  const patch = refundReconcilePatch(booking, charge, refunds.data)
  if (!patch) return

  // Optimistic lock on the refund total, as in admin-dispute-booking. Losing
  // the race throws, so Stripe redelivers and the next attempt re-reads.
  let update = admin.from('bookings').update(patch).eq('id', booking.id)
  update = booking.refund_amount == null
    ? update.is('refund_amount', null)
    : update.eq('refund_amount', booking.refund_amount)
  const { data: updated, error } = await update.select('id')
  if (error) throw error
  if (!updated || updated.length === 0) {
    throw new Error(`booking ${booking.id} changed while reconciling refunds on ${charge.id}`)
  }
  console.log('webhook: reconciled refunds', { booking: booking.id, charge: charge.id, ...patch })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return textResponse('ok')
  }

  const signature = req.headers.get('Stripe-Signature')
  const secrets = stripeWebhookSecrets({
    STRIPE_WEBHOOK_SECRET: Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    STRIPE_CONNECT_WEBHOOK_SECRET: Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET'),
  })
  const body = await req.text()
  const verified = await constructStripeWebhookEvent({
    constructEvent: (payload, sig, secret) =>
      stripe.webhooks.constructEventAsync(payload, sig, secret, undefined, cryptoProvider),
    body,
    signature,
    secrets,
  })
  if (!verified.ok) {
    console.error('webhook signature failed', verified.error)
    return jsonResponse({ error: verified.error }, 400)
  }
  const event = verified.event

  try {
    const action = stripeEventAction(event.type)
    if (action === 'confirm') {
      await confirmSucceededPayment(event.data.object)
    } else if (action === 'cancel_pending') {
      await cancelPendingPayment(event.data.object)
    } else if (action === 'sync_account') {
      await syncConnectedAccount(event)
    } else if (action === 'review_identity') {
      await reviewIdentitySession(event.type, event.data.object)
    } else if (action === 'chargeback_opened') {
      await openChargeback(event.data.object, event.livemode)
    } else if (action === 'chargeback_closed') {
      await closeChargeback(event.data.object, event.livemode)
    } else if (action === 'reconcile_refund') {
      await reconcileRefunds(event.data.object)
    }

    return jsonResponse({ received: true })
  } catch (err) {
    console.error('webhook handler failed', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
