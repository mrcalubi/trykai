
const corsHeaders = {

  'Access-Control-Allow-Origin': '*',

  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',

}

Deno.serve(async (req) => {

  if (req.method === 'OPTIONS') {

    return new Response('ok', { headers: corsHeaders })

  }

  try {

    const payload = await req.json()

    const record = payload.record

    const oldRecord = payload.old_record

    // Only notify when verification_status changes TO 'pending'

    if (record?.verification_status === 'pending' && oldRecord?.verification_status !== 'pending') {

      await fetch('https://api.resend.com/emails', {

        method: 'POST',

        headers: {

          'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          from: 'TryKai <onboarding@resend.dev>',

          to: 'calebong2002@gmail.com',

          subject: 'New host verification pending review',

          html: `

            <h2>New verification submission</h2>

            <p><strong>${record.full_name}</strong> (${record.email}) has submitted ID verification documents.</p>

            <p>Review in <a href="https://supabase.com/dashboard/project/dqqlwofluvhikebtjune/editor">Supabase Table Editor</a>.</p>

          `,

        }),

      })

    }

    return new Response(JSON.stringify({ ok: true }), {

      headers: { ...corsHeaders, 'Content-Type': 'application/json' },

    })

  } catch (err) {

    return new Response(JSON.stringify({ error: err.message }), {

      status: 500,

      headers: { ...corsHeaders, 'Content-Type': 'application/json' },

    })

  }

})

