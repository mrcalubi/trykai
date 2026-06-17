import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async () => {
  try {
    const now = new Date().toISOString()

    // Find sessions that ended 24hrs ago and haven't been paid out
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'completed')
      .is('payout_released_at', null)
      .lt('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (!sessions?.length) return new Response('No payouts due', { status: 200 })

    for (const session of sessions) {
      // Mark payout released
      await supabase
        .from('sessions')
        .update({ payout_released_at: now })
        .eq('id', session.id)

      // Update bookings to confirmed
      await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('session_id', session.id)
        .eq('status', 'pending')
    }

    return new Response(JSON.stringify({ released: sessions.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})