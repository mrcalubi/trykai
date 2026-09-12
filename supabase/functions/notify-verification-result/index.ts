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

    const statusChanged = record?.verification_status !== oldRecord?.verification_status

    if (statusChanged && record.verification_status === 'approved') {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'TryKai <onboarding@resend.dev>',
          to: record.email,
          subject: "You're verified! Start hosting on TryKai",
          html: `
            <h2>You're verified, ${record.full_name}!</h2>
            <p>Your identity verification has been approved. You can now create listings on TryKai.</p>
            <p><a href="https://trykai.sg/create-listing">Create your first listing</a></p>
          `,
        }),
      })
    }

    if (statusChanged && record.verification_status === 'rejected') {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'TryKai <onboarding@resend.dev>',
          to: record.email,
          subject: 'Update on your TryKai verification',
          html: `
            <h2>Hi ${record.full_name},</h2>
            <p>We were unable to verify your identity with the documents provided. Please resubmit clear photos of your NRIC/passport and a selfie.</p>
            <p><a href="https://trykai.sg/verify-identity">Resubmit verification</a></p>
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
