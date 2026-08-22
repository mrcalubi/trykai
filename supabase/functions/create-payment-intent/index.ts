import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Must match src/lib/staging.js — gate payment bypass to the staging project only. */
const STAGING_PROJECT_REF = 'hzgybclfvpuxkmytdoos'

function isStagingEnvironment() {
  return (Deno.env.get('SUPABASE_URL') ?? '').includes(STAGING_PROJECT_REF)
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { session_id, guests_count } = await req.json()

    const authHeader = req.headers.get('Authorization')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: session } = await supabase
      .from('sessions')
      .select('*, listings(*, users(*))')
      .eq('id', session_id)
      .single()

    if (!session) return new Response('Session not found', { status: 404, headers: corsHeaders })
    if (session.spots_remaining < guests_count) return new Response('Not enough spots', { status: 400, headers: corsHeaders })

    const total_amount = session.listings.price_per_person * guests_count
    const platform_fee = Math.round(total_amount * 0.15)

    if (isStagingEnvironment()) {
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          session_id,
          guest_id: user.id,
          guests_count,
          total_amount,
          platform_fee,
          status: 'pending',
        })
        .select('id')
        .single()

      if (bookingError || !booking) {
        return new Response(JSON.stringify({ error: 'Failed to create booking' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        staging_bypass: true,
        booking_id: booking.id,
        total_amount,
        platform_fee,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total_amount,
      currency: 'sgd',
      metadata: {
        session_id,
        guest_id: user.id,
        guests_count,
        platform_fee,
      },
    })

    await supabase.from('bookings').insert({
      session_id,
      guest_id: user.id,
      guests_count,
      total_amount,
      platform_fee,
      stripe_payment_id: paymentIntent.id,
      status: 'pending',
    })

    // Get guest's name for the email
    const { data: guestProfile } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single()

    // Send email notification to host
    const host = session.listings.users
    const sessionDate = new Date(session.starts_at).toLocaleString('en-SG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Singapore',
    })

    if (host?.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'TryKai <onboarding@resend.dev>',
            to: host.email,
            subject: `New booking for "${session.listings.title}"`,
            html: `
              <h2>You've got a new booking!</h2>
              <p><strong>${guestProfile?.full_name || 'A guest'}</strong> just booked your session.</p>
              <p><strong>Listing:</strong> ${session.listings.title}</p>
              <p><strong>Session:</strong> ${sessionDate}</p>
              <p><strong>Guests:</strong> ${guests_count}</p>
              <p>Log in to your <a href="https://trykai.sg/dashboard">TryKai dashboard</a> to view details.</p>
            `,
          }),
        })
      } catch (emailErr) {
        console.error('Email send failed:', emailErr)
        // Don't fail the booking if email fails
      }
    }

    return new Response(JSON.stringify({
      clientSecret: paymentIntent.client_secret,
      total_amount,
      platform_fee,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
