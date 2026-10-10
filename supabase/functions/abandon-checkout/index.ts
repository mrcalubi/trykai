import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  decideAbandonCheckout,
  paymentIntentAlreadyCaptured,
  unpaidCheckoutCancelPatch,
} from '../_shared/booking.ts'
import { jsonResponse, textResponse } from '../_shared/http.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

async function intentStatusAfterCancel(paymentIntentId: string): Promise<string | null> {
  try {
    await stripe.paymentIntents.cancel(paymentIntentId)
    return 'canceled'
  } catch {
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
      return intent.status ?? null
    } catch {
      return null
    }
  }
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

    const body = await req.json()
    if (!body?.booking_id) {
      return jsonResponse({ error: 'booking_id is required' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: booking, error } = await admin
      .from('bookings')
      .select('id, status, guest_id, stripe_payment_id')
      .eq('id', body.booking_id)
      .single()

    if (error || !booking) return jsonResponse({ error: 'Booking not found' }, 404)

    const auth = decideAbandonCheckout({
      callerId: user?.id,
      guestId: booking.guest_id,
      bookingStatus: booking.status,
    })
    if ('httpStatus' in auth) {
      return jsonResponse({ error: auth.error }, auth.httpStatus)
    }
    if (!auth.abandon) {
      return jsonResponse({ abandoned: false, reason: auth.reason })
    }

    if (booking.stripe_payment_id) {
      const intentStatus = await intentStatusAfterCancel(booking.stripe_payment_id)
      if (intentStatus === null || paymentIntentAlreadyCaptured(intentStatus)) {
        return jsonResponse({ abandoned: false, reason: 'payment_succeeded' })
      }
    }

    const { data: updated, error: updateError } = await admin
      .from('bookings')
      .update(unpaidCheckoutCancelPatch('guest'))
      .eq('id', booking.id)
      .eq('status', 'pending')
      .select('id')

    if (updateError) return jsonResponse({ error: updateError.message }, 500)
    if (!updated?.length) {
      return jsonResponse({ abandoned: false, reason: 'not_pending' })
    }
    return jsonResponse({ abandoned: true })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
