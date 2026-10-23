// POST { teaching_plan } from a signed-in host on /verify-identity.
//
// Starts Singpass Myinfo (00035): a pushed authorization request with PKCE and
// a fresh DPoP key, stored in singpass_auth_sessions for the callback. Returns
// { url } for the page to send the host to. Singpass is optional per project:
// without its five secrets this answers 503 and the page offers upload.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import { canSubmitVerification } from '../_shared/verification.ts'
import {
  normalizeTeachingPlan,
  readSingpassConfig,
  SINGPASS_ERRORS,
  SINGPASS_SESSION_MAX_AGE_MINUTES,
} from '../_shared/singpass.ts'
import { beginSingpassLogin } from '../_shared/singpass-oidc.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const settings = readSingpassConfig((name) => Deno.env.get(name))
    if (!settings.ok) {
      console.error('singpass-start not configured', settings.missing.join(', '))
      return jsonResponse({ error: SINGPASS_ERRORS.notConfigured }, 503)
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const plan = normalizeTeachingPlan(body.teaching_plan)
    if (!plan.ok) return jsonResponse({ error: plan.error }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: profile } = await admin
      .from('users')
      .select('verification_status')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile) return jsonResponse({ error: 'Profile not found' }, 404)
    if (profile.verification_status === 'approved') {
      return jsonResponse({ error: SINGPASS_ERRORS.alreadyVerified }, 409)
    }
    if (!canSubmitVerification(profile.verification_status)) {
      return jsonResponse({ error: SINGPASS_ERRORS.underReview }, 409)
    }

    // Abandoned attempts: this host's earlier ones, and anyone's that are stale.
    const cutoff = new Date(Date.now() - SINGPASS_SESSION_MAX_AGE_MINUTES * 60 * 1000).toISOString()
    await admin.from('singpass_auth_sessions').delete().eq('user_id', user.id)
    await admin.from('singpass_auth_sessions').delete().lt('created_at', cutoff)

    const start = await beginSingpassLogin(settings.config)

    const { error: insertError } = await admin.from('singpass_auth_sessions').insert({
      user_id: user.id,
      state: start.state,
      nonce: start.nonce,
      code_verifier: start.codeVerifier,
      dpop_private_jwk: start.dpop.privateKey,
      dpop_public_jwk: start.dpop.publicKey,
      teaching_plan: plan.plan,
    })
    if (insertError) {
      console.error('singpass-start session insert failed', insertError.message)
      return jsonResponse({ error: SINGPASS_ERRORS.failed }, 500)
    }

    return jsonResponse({ url: start.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('singpass-start failed', message)
    return jsonResponse({ error: SINGPASS_ERRORS.failed }, 502)
  }
})
