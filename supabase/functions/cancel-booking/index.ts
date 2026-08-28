import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refundAmountForCancel, spotsToRestore } from '../_shared/booking.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

async function reversePayment(
  booking: {
    status: string
    stripe_payment_id: string | null
    total_amount: number
  },
  refundAmount: number,
): Promise<string | null> {
  if (!booking.stripe_payment_id) return null

  if (booking.status === 'pending') {
    try {
      await stripe.paymentIntents.cancel(booking.stripe_payment_id)
      return null
    } catch {
      if (booking.total_amount > 0) {
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_id,
        })
        return refund.id
      }
      return null
    }
  }

  if (refundAmount > 0) {
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_id,
      amount: refundAmount,
    })
    return refund.id
  }

  return null
}

async function cancelOneBooking(
  admin: ReturnType<typeof adminClient>,
  booking: {
    id: string
    status: string
    guests_count: number
    total_amount: number
    platform_fee: number | null
    stripe_payment_id: string | null
    session_id: string
    sessions?: { starts_at: string; spots_remaining: number }
  },
  cancelledBy: 'guest' | 'host',
  refundAmount: number,
) {
  if (booking.status !== 'pending' && booking.status !== 'confirmed') {
    return { error: 'Booking cannot be cancelled' }
  }

  const stripeRefundId = await reversePayment(booking, refundAmount)
  const restore = spotsToRestore(booking.status, booking.guests_count)

  const { error: bookingError } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_by: cancelledBy,
      cancelled_at: new Date().toISOString(),
      refund_amount: stripeRefundId && booking.status === 'pending' ? booking.total_amount : refundAmount,
      stripe_refund_id: stripeRefundId,
    })
    .eq('id', booking.id)
    .in('status', ['pending', 'confirmed'])

  if (bookingError) return { error: bookingError.message }

  if (restore > 0) {
    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .select('spots_remaining, spots_total, status')
      .eq('id', booking.session_id)
      .single()

    if (sessionError) return { error: sessionError.message }

    const nextSpots = session.spots_remaining + restore
    await admin
      .from('sessions')
      .update({
        spots_remaining: nextSpots,
        status: session.status === 'full' ? 'open' : session.status,
      })
      .eq('id', booking.session_id)
  }

  return { ok: true, refund_amount: refundAmount }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  try {
    const authHeader = req.headers.get('Authorization')
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } },
    )
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) return textResponse('Unauthorized', 401)

    const body = await req.json()
    const admin = adminClient()

    if (body?.session_id) {
      const { data: session, error } = await admin
        .from('sessions')
        .select(
          `
          id,
          listing_id,
          starts_at,
          listings!inner ( host_id ),
          bookings ( id, status, guests_count, total_amount, platform_fee, stripe_payment_id, session_id, guest_id )
        `,
        )
        .eq('id', body.session_id)
        .single()

      if (error || !session) return jsonResponse({ error: 'Session not found' }, 404)
      const listing = asRecord(session.listings)
      if (listing?.host_id !== user.id) return textResponse('Forbidden', 403)

      const active = (session.bookings ?? []).filter(
        (booking: { status: string }) => booking.status === 'pending' || booking.status === 'confirmed',
      )

      const results = []
      for (const booking of active) {
        const refundAmount = refundAmountForCancel({
          status: booking.status,
          cancelledBy: 'host',
          totalAmount: booking.total_amount,
          platformFee: booking.platform_fee,
          sessionStartsAt: session.starts_at,
        })
        const result = await cancelOneBooking(admin, { ...booking, sessions: { starts_at: session.starts_at, spots_remaining: 0 } }, 'host', refundAmount)
        if (result.error) return jsonResponse({ error: result.error }, 500)
        results.push(result)
      }

      if (results.length > 0) {
        await admin.rpc('apply_host_strike', { p_host_id: user.id })
      }
      return jsonResponse({ cancelled: results.length })
    }

    if (!body?.booking_id) {
      return jsonResponse({ error: 'booking_id or session_id is required' }, 400)
    }

    const { data: booking, error } = await admin
      .from('bookings')
      .select(
        `
        id,
        status,
        guests_count,
        total_amount,
        platform_fee,
        stripe_payment_id,
        session_id,
        guest_id,
        sessions ( starts_at, spots_remaining )
      `,
      )
      .eq('id', body.booking_id)
      .single()

    if (error || !booking) return jsonResponse({ error: 'Booking not found' }, 404)
    if (booking.guest_id !== user.id) return textResponse('Forbidden', 403)

    const session = asRecord(booking.sessions)
    if (!session?.starts_at || new Date(session.starts_at) <= new Date()) {
      return jsonResponse({ error: 'This booking can no longer be cancelled' }, 400)
    }

    const refundAmount = refundAmountForCancel({
      status: booking.status,
      cancelledBy: 'guest',
      totalAmount: booking.total_amount,
      platformFee: booking.platform_fee,
      sessionStartsAt: session.starts_at,
    })

    const result = await cancelOneBooking(admin, { ...booking, sessions: session }, 'guest', refundAmount)
    if (result.error) return jsonResponse({ error: result.error }, 500)
    return jsonResponse(result)
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
