import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { spotsToRestore } from '../_shared/booking.ts'
import {
  bookingReference,
  formatSessionDate,
  publicDisplayName,
  resolvePaymentMethod,
  sendCancellationEmails,
} from '../_shared/email.ts'
import { asRecord, hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  const secret = Deno.env.get('ADMIN_FUNCTION_SECRET')
  if (!hasValidSecret(req, secret, ['x-admin-secret'])) {
    return textResponse('Unauthorized', 401)
  }

  try {
    const { booking_id } = await req.json()
    if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: booking, error } = await admin
      .from('bookings')
      .select(
        `
        id,
        status,
        guests_count,
        total_amount,
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
    const refundAmount = booking.status === 'confirmed' || stripeRefundId ? booking.total_amount : 0

    await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_by: 'host',
        cancelled_at: new Date().toISOString(),
        refund_amount: refundAmount,
        stripe_refund_id: stripeRefundId,
      })
      .eq('id', booking.id)

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
        refundAmountCents: refundAmount,
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

    return jsonResponse({ ok: true, refund_amount: refundAmount })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
