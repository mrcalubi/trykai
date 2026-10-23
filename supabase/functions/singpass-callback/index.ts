// POST { query } from /verify-identity/singpass, where Singpass sends the
// host back. `query` is that page's query string (code, state, iss, or error).
//
// Looks up the attempt by state, for this signed-in user only, then exchanges
// the code (DPoP, private_key_jwt, PKCE), decrypts and checks the ID token,
// and records the Singpass identifier and name with
// record_singpass_verification. The host lands in the review queue with what
// they want to teach; no documents are stored on this route.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import {
  isSessionFresh,
  parseSingpassCallback,
  readSingpassConfig,
  recordErrorResponse,
  SINGPASS_ERRORS,
  singpassIdentity,
} from '../_shared/singpass.ts'
import { finishSingpassLogin } from '../_shared/singpass-oidc.ts'

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
      console.error('singpass-callback not configured', settings.missing.join(', '))
      return jsonResponse({ error: SINGPASS_ERRORS.notConfigured }, 503)
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const callback = parseSingpassCallback(body.query)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (!callback.ok) {
      if (callback.state) {
        await admin.from('singpass_auth_sessions').delete().eq('state', callback.state).eq('user_id', user.id)
      }
      const error = callback.reason === 'singpass_error' ? SINGPASS_ERRORS.cancelled : SINGPASS_ERRORS.failed
      return jsonResponse({ error }, 400)
    }

    const { data: session } = await admin
      .from('singpass_auth_sessions')
      .select('id, nonce, code_verifier, dpop_private_jwk, dpop_public_jwk, teaching_plan, created_at')
      .eq('state', callback.state)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!session) return jsonResponse({ error: SINGPASS_ERRORS.expired }, 400)

    // One use only, whatever happens next.
    await admin.from('singpass_auth_sessions').delete().eq('id', session.id)

    if (!isSessionFresh(session.created_at)) return jsonResponse({ error: SINGPASS_ERRORS.expired }, 400)

    let claims: Record<string, unknown>
    try {
      claims = await finishSingpassLogin(settings.config, {
        search: callback.search,
        state: callback.state,
        nonce: session.nonce,
        codeVerifier: session.code_verifier,
        dpop: { privateKey: session.dpop_private_jwk, publicKey: session.dpop_public_jwk },
      })
    } catch (err) {
      console.error('singpass token exchange failed', err instanceof Error ? err.message : err)
      return jsonResponse({ error: SINGPASS_ERRORS.failed }, 502)
    }

    const identity = singpassIdentity(claims)
    if (!identity.ok) {
      console.error('singpass id token unusable', identity.error)
      return jsonResponse({ error: SINGPASS_ERRORS.failed }, 502)
    }

    const { error: recordError } = await admin.rpc('record_singpass_verification', {
      p_user_id: user.id,
      p_sub: identity.sub,
      p_name: identity.name,
      p_teaching_plan: session.teaching_plan,
    })
    if (recordError) {
      const mapped = recordErrorResponse(recordError.message)
      if (mapped.status >= 500) console.error('record_singpass_verification failed', recordError.message)
      return jsonResponse({ error: mapped.error }, mapped.status)
    }

    return jsonResponse({ ok: true, status: 'pending' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('singpass-callback failed', message)
    return jsonResponse({ error: SINGPASS_ERRORS.failed }, 500)
  }
})
