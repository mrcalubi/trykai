import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeSiteUrl } from '../_shared/connect.ts'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import { canSubmitVerification, identitySessionCreateParams } from '../_shared/verification.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

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
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: profile, error } = await admin
      .from('users')
      .select('id, verification_status')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    if (profile.verification_status === 'approved') {
      return jsonResponse({ already_verified: true, url: null })
    }

    if (!canSubmitVerification(profile.verification_status)) {
      return jsonResponse({ error: 'A verification is already under review.' }, 409)
    }

    const siteUrl = normalizeSiteUrl(Deno.env.get('SITE_URL'))
    const session = await stripe.identity.verificationSessions.create(
      identitySessionCreateParams({ userId: user.id, siteUrl }),
    )

    // The status deliberately stays as it is. A session is created in
    // `requires_input` and emits no event until the host actually submits, so
    // moving them to `pending` here would strand anyone who abandons the flow.
    await admin
      .from('users')
      .update({
        stripe_identity_session_id: session.id,
        verification_method: 'stripe_identity',
      })
      .eq('id', user.id)

    if (!session.url) {
      return jsonResponse({ error: 'Stripe did not return a verification link' }, 500)
    }

    return jsonResponse({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('create-identity-session failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
