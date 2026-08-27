import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { connectAccountCreateParams, payoutsEnabledFromAccount } from '../_shared/connect.ts'
import { jsonResponse, textResponse } from '../_shared/http.ts'

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
    if (!user) return textResponse('Unauthorized', 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: profile, error } = await admin
      .from('users')
      .select('id, email, stripe_account_id, stripe_payouts_enabled')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    let accountId = profile.stripe_account_id
    if (!accountId) {
      const account = await stripe.accounts.create(connectAccountCreateParams(profile))
      accountId = account.id
      await admin
        .from('users')
        .update({
          stripe_account_id: accountId,
          stripe_payouts_enabled: payoutsEnabledFromAccount(account),
        })
        .eq('id', user.id)
    } else {
      const account = await stripe.accounts.retrieve(accountId)
      await admin
        .from('users')
        .update({ stripe_payouts_enabled: payoutsEnabledFromAccount(account) })
        .eq('id', user.id)
    }

    const { data: updated } = await admin
      .from('users')
      .select('stripe_account_id, stripe_payouts_enabled')
      .eq('id', user.id)
      .single()

    return jsonResponse({
      stripe_account_id: updated?.stripe_account_id ?? accountId,
      stripe_payouts_enabled: Boolean(updated?.stripe_payouts_enabled),
    })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
