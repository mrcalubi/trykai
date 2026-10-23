// POST from /verify-identity/singpass, where Singpass sends the host back.
//
//   { query }                      the redirect's query string (code, state,
//                                  iss, or error). Exchanges the code (DPoP,
//                                  private_key_jwt, PKCE), checks the ID token,
//                                  fetches Myinfo (name, date of birth, mobile),
//                                  refuses anyone under 18, stores the details
//                                  on the attempt and returns them for the host
//                                  to check. Nothing is recorded on the account yet.
//   { action: 'confirm', state, mobile }
//                                  records the stored details, with the
//                                  mobile number as the host confirmed or
//                                  changed it (Myinfo's mobile is self-declared,
//                                  so Singpass lets the host edit it), with
//                                  record_singpass_verification and deletes the
//                                  attempt. Singpass approves the host at once
//                                  (00036); their first listing is what the
//                                  TryKai team reviews.
//   { action: 'cancel', state }    deletes the attempt and its details.
//
// Attempts are found by state for the signed-in user only, and expire after
// 30 minutes, so Myinfo data the host never submits does not linger.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import {
  isAdult,
  isSessionFresh,
  myinfoPerson,
  normalizeHostMobile,
  parseSingpassCallback,
  readSingpassConfig,
  recordErrorResponse,
  SINGPASS_ERRORS,
  singpassPreview,
} from '../_shared/singpass.ts'
import { finishSingpassLogin } from '../_shared/singpass-oidc.ts'

const STATE_PATTERN = /^[A-Za-z0-9/+_\-=.]{1,255}$/

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
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ---- confirm or cancel what the host has just reviewed ----
    if (body.action === 'confirm' || body.action === 'cancel') {
      const state = typeof body.state === 'string' ? body.state : ''
      if (!STATE_PATTERN.test(state)) return jsonResponse({ error: SINGPASS_ERRORS.nothingToConfirm }, 400)

      // Checked before the attempt is used up, so a typo can be fixed and resent.
      const mobile = body.action === 'confirm' ? normalizeHostMobile(body.mobile) : null
      if (mobile && !mobile.ok) return jsonResponse({ error: mobile.error, field: 'mobile' }, 400)

      const { data: attempt } = await admin
        .from('singpass_auth_sessions')
        .select('id, created_at, retrieved_sub, retrieved_name, retrieved_dob, retrieved_mobile')
        .eq('state', state)
        .eq('user_id', user.id)
        .maybeSingle()

      if (attempt) await admin.from('singpass_auth_sessions').delete().eq('id', attempt.id)
      if (body.action === 'cancel') return jsonResponse({ ok: true, cancelled: true })

      if (!attempt?.retrieved_sub || !isSessionFresh(attempt.created_at)) {
        return jsonResponse({ error: SINGPASS_ERRORS.nothingToConfirm }, 400)
      }

      const { data: recorded, error: recordError } = await admin.rpc('record_singpass_verification', {
        p_user_id: user.id,
        p_sub: attempt.retrieved_sub,
        p_name: attempt.retrieved_name,
        p_dob: attempt.retrieved_dob,
        p_mobile: mobile?.ok ? mobile.mobile : attempt.retrieved_mobile,
      })
      if (recordError) {
        const mapped = recordErrorResponse(recordError.message)
        if (mapped.status >= 500) console.error('record_singpass_verification failed', recordError.message)
        return jsonResponse({ error: mapped.error }, mapped.status)
      }
      return jsonResponse({ ok: true, status: recorded === 'approved' ? 'approved' : 'pending' })
    }

    // ---- the redirect back from Singpass ----
    const callback = parseSingpassCallback(body.query)
    if (!callback.ok) {
      if (callback.state) {
        await admin.from('singpass_auth_sessions').delete().eq('state', callback.state).eq('user_id', user.id)
      }
      const error = callback.reason === 'singpass_error' ? SINGPASS_ERRORS.cancelled : SINGPASS_ERRORS.failed
      return jsonResponse({ error }, 400)
    }

    const { data: session } = await admin
      .from('singpass_auth_sessions')
      .select('id, nonce, code_verifier, dpop_private_jwk, dpop_public_jwk, created_at, retrieved_at')
      .eq('state', callback.state)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!session || session.retrieved_at) return jsonResponse({ error: SINGPASS_ERRORS.expired }, 400)
    if (!isSessionFresh(session.created_at)) {
      await admin.from('singpass_auth_sessions').delete().eq('id', session.id)
      return jsonResponse({ error: SINGPASS_ERRORS.expired }, 400)
    }

    let result: { claims: Record<string, unknown>; userinfo: Record<string, unknown> }
    try {
      result = await finishSingpassLogin(settings.config, {
        search: callback.search,
        state: callback.state,
        nonce: session.nonce,
        codeVerifier: session.code_verifier,
        dpop: { privateKey: session.dpop_private_jwk, publicKey: session.dpop_public_jwk },
      })
    } catch (err) {
      await admin.from('singpass_auth_sessions').delete().eq('id', session.id)
      console.error('singpass exchange failed', err instanceof Error ? err.message : err)
      return jsonResponse({ error: SINGPASS_ERRORS.failed }, 502)
    }

    const parsed = myinfoPerson(result.claims, result.userinfo)
    if (!parsed.ok) {
      await admin.from('singpass_auth_sessions').delete().eq('id', session.id)
      console.error('singpass myinfo unusable', parsed.error)
      return jsonResponse({ error: SINGPASS_ERRORS.failed }, 502)
    }

    if (!isAdult(parsed.person.dob)) {
      await admin.from('singpass_auth_sessions').delete().eq('id', session.id)
      return jsonResponse({ error: SINGPASS_ERRORS.underAge }, 403)
    }

    // The DPoP key and verifier are spent; keep only what the host is about to confirm.
    const { error: updateError } = await admin
      .from('singpass_auth_sessions')
      .update({
        retrieved_sub: parsed.person.sub,
        retrieved_name: parsed.person.name,
        retrieved_dob: parsed.person.dob,
        retrieved_mobile: parsed.person.mobile,
        retrieved_at: new Date().toISOString(),
        dpop_private_jwk: {},
        code_verifier: '',
      })
      .eq('id', session.id)
    if (updateError) {
      console.error('singpass attempt update failed', updateError.message)
      return jsonResponse({ error: SINGPASS_ERRORS.failed }, 500)
    }

    return jsonResponse({ ok: true, review: singpassPreview(parsed.person), state: callback.state })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('singpass-callback failed', message)
    return jsonResponse({ error: SINGPASS_ERRORS.failed }, 500)
  }
})
