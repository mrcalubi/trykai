import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  isHostBookingOwnListing,
  paymentIntentCreateParams,
  prepareBooking,
  rejectPayNowIfTooFarAhead,
} from '../_shared/booking.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return textResponse('ok')
  }

  try {
    const body = await req.json()
    const { session_id, guests_count, payment_rail } = body ?? {}

    const authHeader = req.headers.get('Authorization')
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } },
    )

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .select('*, listings(*, users(*))')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return jsonResponse({ error: 'Session not found' }, 404)
    }

    if (session.status !== 'open' || new Date(session.starts_at).getTime() <= Date.now()) {
      return jsonResponse({ error: 'Session is not available' }, 400)
    }

    const payNowWindow = rejectPayNowIfTooFarAhead(payment_rail ?? 'card', session.starts_at)
    if (payNowWindow) {
      return jsonResponse(
        { error: payNowWindow.message, code: payNowWindow.code },
        payNowWindow.status,
      )
    }

    const listing = asRecord(session.listings)

    if (isHostBookingOwnListing({ spots_remaining: session.spots_remaining, listings: listing }, user.id)) {
      return jsonResponse({ error: 'You cannot book your own listing.' }, 403)
    }

    const host = asRecord(listing?.users)
    if (!host?.stripe_payouts_enabled || host?.is_suspended) {
      return jsonResponse({ error: 'This host cannot take bookings yet.' }, 400)
    }

    const bookingPrep = prepareBooking(
      {
        spots_remaining: session.spots_remaining,
        starts_at: session.starts_at,
        listings: listing,
      },
      guests_count,
      payment_rail ?? 'card',
      user.id,
    )
    if (!bookingPrep.ok) {
      return jsonResponse({ error: bookingPrep.message }, bookingPrep.status)
    }

    const { totalAmount, platformFee, paymentRail, guestsCount } = bookingPrep

    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .insert({
        session_id,
        guest_id: user.id,
        guests_count: guestsCount,
        total_amount: totalAmount,
        platform_fee: platformFee,
        payment_rail: paymentRail,
        status: 'pending',
      })
      .select('id')
      .single()

    if (bookingError || !booking) {
      return jsonResponse(
        { error: bookingError?.message || 'Failed to create booking' },
        500,
      )
    }

    // The insert trigger locked the session row. Re-read starts_at so an
    // edit that committed first is what we charge and what PayNow checks.
    const { data: freshSession, error: freshError } = await admin
      .from('sessions')
      .select('status, starts_at, spots_remaining')
      .eq('id', session_id)
      .single()

    if (freshError || !freshSession) {
      await admin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      return jsonResponse({ error: 'Session not found' }, 404)
    }

    if (freshSession.status !== 'open' || new Date(freshSession.starts_at).getTime() <= Date.now()) {
      await admin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      return jsonResponse({ error: 'Session is not available' }, 400)
    }

    const freshPayNow = rejectPayNowIfTooFarAhead(paymentRail, freshSession.starts_at)
    if (freshPayNow) {
      await admin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      return jsonResponse(
        { error: freshPayNow.message, code: freshPayNow.code },
        freshPayNow.status,
      )
    }

    let paymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create(
        paymentIntentCreateParams({
          amount: totalAmount,
          bookingId: booking.id,
          sessionId: session_id,
          guestId: user.id,
          guestsCount,
          paymentRail,
          platformFee,
        }),
      )
    } catch (stripeErr) {
      await admin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      throw stripeErr
    }

    const { error: updateError } = await admin
      .from('bookings')
      .update({ stripe_payment_id: paymentIntent.id })
      .eq('id', booking.id)

    if (updateError) {
      return jsonResponse({ error: 'Failed to save payment' }, 500)
    }

    return jsonResponse({
      clientSecret: paymentIntent.client_secret,
      booking_id: booking.id,
      total_amount: totalAmount,
      platform_fee: platformFee,
      payment_rail: paymentRail,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('create-payment-intent failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
