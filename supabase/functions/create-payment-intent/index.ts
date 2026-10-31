import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  calculateBookingCharge,
  isHostBookingOwnListing,
  parseAddonNote,
  paymentIntentCreateParams,
  prepareBooking,
  prepareCheckoutAddons,
  rejectPayNowIfTooFarAhead,
} from '../_shared/booking.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? '')
  return code === 'PGRST205' || code === '42P01' || /PGRST205/.test(message) || /42P01/.test(message)
}

async function cancelBooking(
  admin: ReturnType<typeof createClient>,
  bookingId: string,
) {
  await admin.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return textResponse('ok')
  }

  try {
    const body = await req.json()
    const { session_id, guests_count, payment_rail, addons, addon_note } = body ?? {}

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

    // A listing waiting on the TryKai team's review (00036) cannot be booked.
    if (listing?.review_status !== 'approved') {
      return jsonResponse({ error: 'Session is not available' }, 400)
    }

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

    const { paymentRail, guestsCount, lessonAmount } = bookingPrep

    const { data: catalogRows, error: catalogError } = await admin
      .from('listing_addons')
      .select('id, name, unit, price_cents, session_limit, is_active')
      .eq('listing_id', listing?.id)
      .eq('is_active', true)

    if (catalogError && !isMissingRelation(catalogError)) {
      return jsonResponse({ error: catalogError.message || 'Failed to load add-ons' }, 500)
    }

    const catalog = isMissingRelation(catalogError) ? [] : (catalogRows ?? [])
    const requested = Array.isArray(addons) ? addons : []
    if (requested.some((row: { quantity?: unknown }) => Number(row?.quantity) > 0) && catalog.length === 0) {
      return jsonResponse(
        { error: 'That add-on is no longer available. Refresh and try again.' },
        400,
      )
    }

    let remainingByAddon: Record<string, number> = {}
    if (catalog.some((row) => row.session_limit != null)) {
      const { data: remainingRows, error: remainingError } = await admin.rpc(
        'session_addon_remaining',
        { p_session_id: session_id },
      )
      if (!remainingError && Array.isArray(remainingRows)) {
        remainingByAddon = Object.fromEntries(
          remainingRows.map((row: { addon_id: string; remaining: number }) => [
            row.addon_id,
            row.remaining,
          ]),
        )
      } else {
        remainingByAddon = Object.fromEntries(
          catalog
            .filter((row) => row.session_limit != null)
            .map((row) => [row.id, row.session_limit as number]),
        )
      }
    }

    const prepared = prepareCheckoutAddons({
      requested,
      catalog,
      guestsCount,
      remainingByAddon,
    })
    if (!prepared.ok) {
      return jsonResponse({ error: prepared.message }, prepared.status)
    }

    const charge = calculateBookingCharge({
      lessonCents: lessonAmount,
      addons: prepared.lines,
      rail: paymentRail,
    })
    const { totalAmount, platformFee, addonsAmount } = charge
    const addonNote = parseAddonNote(addon_note)

    const bookingRow = {
      session_id,
      guest_id: user.id,
      guests_count: guestsCount,
      total_amount: totalAmount,
      platform_fee: platformFee,
      payment_rail: paymentRail,
      status: 'pending',
      addons_amount: addonsAmount,
      addon_note: addonNote,
    }

    let { data: booking, error: bookingError } = await admin
      .from('bookings')
      .insert(bookingRow)
      .select('id')
      .single()

    if (bookingError && /addons_amount|addon_note/.test(bookingError.message ?? '')) {
      const { addons_amount: _ignoredAmount, addon_note: _ignoredNote, ...withoutAddons } = bookingRow
      ;({ data: booking, error: bookingError } = await admin
        .from('bookings')
        .insert(withoutAddons)
        .select('id')
        .single())
    }

    if (bookingError || !booking) {
      return jsonResponse(
        { error: bookingError?.message || 'Failed to create booking' },
        500,
      )
    }

    if (prepared.lines.length > 0) {
      const { error: snapshotError } = await admin.from('booking_addons').insert(
        prepared.lines.map((line) => ({
          booking_id: booking.id,
          addon_id: line.id,
          name: line.name,
          unit: line.unit,
          quantity: line.quantity,
          unit_host_cents: line.hostUnitCents,
          unit_guest_cents: line.guestUnitCents,
        })),
      )
      if (snapshotError) {
        await cancelBooking(admin, booking.id)
        return jsonResponse(
          { error: snapshotError.message || 'Failed to save add-ons' },
          500,
        )
      }
    }

    // The insert trigger locked the session row. Re-read starts_at so an
    // edit that committed first is what we charge and what PayNow checks.
    const { data: freshSession, error: freshError } = await admin
      .from('sessions')
      .select('status, starts_at, spots_remaining')
      .eq('id', session_id)
      .single()

    if (freshError || !freshSession) {
      await cancelBooking(admin, booking.id)
      return jsonResponse({ error: 'Session not found' }, 404)
    }

    if (freshSession.status !== 'open' || new Date(freshSession.starts_at).getTime() <= Date.now()) {
      await cancelBooking(admin, booking.id)
      return jsonResponse({ error: 'Session is not available' }, 400)
    }

    const freshPayNow = rejectPayNowIfTooFarAhead(paymentRail, freshSession.starts_at)
    if (freshPayNow) {
      await cancelBooking(admin, booking.id)
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
          addonsAmount,
        }),
      )
    } catch (stripeErr) {
      await cancelBooking(admin, booking.id)
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
