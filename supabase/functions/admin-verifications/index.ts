import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  sendResendEmail,
  verificationApprovedHtml,
  verificationRejectedHtml,
} from '../_shared/email.ts'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import { prepareVerificationReview, SIGNED_URL_TTL_SECONDS } from '../_shared/verification.ts'

const BUCKET = 'verification-docs'

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

/**
 * Authenticates the caller's own JWT rather than a shared secret. A secret
 * cannot be shipped to a browser, which is why this does not follow the
 * `ADMIN_FUNCTION_SECRET` pattern used by admin-cancel-booking.
 */
async function requireAdmin(req: Request): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization')
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader ?? '' } } },
  )

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) {
    return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) }
  }

  const { data: profile } = await adminClient()
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return { ok: false, response: jsonResponse({ error: 'Not authorised' }, 403) }
  }

  return { ok: true, userId: user.id }
}

async function listPending() {
  const admin = adminClient()

  const { data: rows, error } = await admin
    .from('users')
    .select('id, full_name, email, verification_submitted_at, id_photo_url, selfie_url')
    .eq('verification_status', 'pending')
    .order('verification_submitted_at', { ascending: true, nullsFirst: true })

  if (error) return jsonResponse({ error: error.message }, 500)

  // Signed URLs are minted here so the images are never reachable from any
  // public or authenticated non-admin route.
  const pending = []
  for (const row of rows ?? []) {
    const [idPhoto, selfie] = await Promise.all([
      signedUrl(admin, row.id_photo_url),
      signedUrl(admin, row.selfie_url),
    ])
    pending.push({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      submitted_at: row.verification_submitted_at,
      id_photo_url: idPhoto,
      selfie_url: selfie,
    })
  }

  return jsonResponse({ pending })
}

async function signedUrl(
  admin: ReturnType<typeof adminClient>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  return data?.signedUrl ?? null
}

async function review(reviewerId: string, body: Record<string, unknown>) {
  const userId = body.user_id
  if (typeof userId !== 'string' || !userId) {
    return jsonResponse({ error: 'user_id is required' }, 400)
  }

  const prepared = prepareVerificationReview({
    decision: body.decision,
    reason: body.reason,
    method: 'manual',
  })
  if (!prepared.ok) {
    return jsonResponse({ error: prepared.message }, prepared.status)
  }

  const admin = adminClient()

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('full_name, email')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    return jsonResponse({ error: 'Host not found' }, 404)
  }

  const { error: reviewError } = await admin.rpc('review_verification', {
    p_user_id: userId,
    p_decision: prepared.decision,
    p_reason: prepared.reason,
    p_method: prepared.method,
    p_reviewer_id: reviewerId,
  })

  if (reviewError) {
    return jsonResponse({ error: reviewError.message }, 400)
  }

  // Sent from the action rather than a database webhook, the same way booking
  // emails moved into stripe-webhook: the reviewer's click is what guarantees
  // the host hears about it, and the rejection reason is only available here.
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (prepared.decision === 'approved') {
    await sendResendEmail({
      apiKey,
      to: profile.email,
      subject: "You're verified! Start hosting on TryKai",
      html: verificationApprovedHtml({ hostName: profile.full_name }),
    })
  } else {
    await sendResendEmail({
      apiKey,
      to: profile.email,
      subject: 'Update on your TryKai verification',
      html: verificationRejectedHtml({
        hostName: profile.full_name,
        reason: prepared.reason as string,
      }),
    })
  }

  return jsonResponse({ ok: true, decision: prepared.decision })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    if (body.action === 'list') return await listPending()
    if (body.action === 'review') return await review(auth.userId, body)

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('admin-verifications failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
