import { escapeHtml, sendResendEmail } from '../_shared/email.ts'
import { asRecord, hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'

/**
 * Called by a Supabase database webhook on `public.users`, because a manual
 * submission goes through the `submit_verification` RPC and so has no Edge
 * Function in its path. Set the shared secret as a header on that webhook.
 *
 * Verification *results* are not sent from here. Whichever function made the
 * decision emails the host, so it has the rejection reason to hand.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  const secret = Deno.env.get('NOTIFY_FUNCTION_SECRET')
  if (!hasValidSecret(req, secret, ['x-notify-secret'])) {
    return textResponse('Unauthorized', 401)
  }

  try {
    const payload = await req.json()
    const record = asRecord(payload?.record) as Record<string, unknown> | null
    const oldRecord = asRecord(payload?.old_record) as Record<string, unknown> | null

    const becamePending =
      record?.verification_status === 'pending' && oldRecord?.verification_status !== 'pending'

    if (!becamePending) return jsonResponse({ ok: true, notified: false })

    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://trykai.sg').replace(/\/$/, '')
    const fullName = typeof record?.full_name === 'string' ? record.full_name : 'A host'
    const email = typeof record?.email === 'string' ? record.email : 'unknown email'

    await sendResendEmail({
      apiKey: Deno.env.get('RESEND_API_KEY'),
      to: Deno.env.get('ADMIN_NOTIFY_EMAIL') ?? 'calebong2002@gmail.com',
      subject: 'New host verification pending review',
      html: `
        <h2>New verification submission</h2>
        <p><strong>${escapeHtml(fullName)}</strong> (${escapeHtml(email)}) uploaded identity
        documents for manual review.</p>
        <p><a href="${siteUrl}/admin/verifications">Review it on TryKai</a></p>
      `,
    })

    return jsonResponse({ ok: true, notified: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('notify-verification-pending failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
