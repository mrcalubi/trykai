import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asRecord, hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'
import { isPayoutDue, transferCreateParams } from '../_shared/payouts.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  const secret = Deno.env.get('PAYOUT_CRON_SECRET') ?? Deno.env.get('CRON_SECRET')
  if (!hasValidSecret(req, secret)) {
    return textResponse('Unauthorized', 401)
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: rows, error } = await admin
      .from('bookings')
      .select(
        `
        id,
        status,
        payout_released_at,
        stripe_refund_id,
        host_payout_amount,
        stripe_charge_id,
        sessions!inner (
          starts_at,
          listings!inner (
            host_id,
            users:host_id (
              stripe_account_id,
              stripe_payouts_enabled
            )
          )
        )
      `,
      )
      .eq('status', 'confirmed')
      .is('payout_released_at', null)
      .is('stripe_refund_id', null)

    if (error) return jsonResponse({ error: error.message }, 500)

    const due = (rows ?? [])
      .map((row) => {
        const session = asRecord(row.sessions)
        const listing = asRecord(session?.listings)
        const host = asRecord(listing?.users)
        return {
          id: row.id,
          status: row.status,
          payout_released_at: row.payout_released_at,
          stripe_refund_id: row.stripe_refund_id,
          host_payout_amount: row.host_payout_amount,
          stripe_charge_id: row.stripe_charge_id,
          starts_at: session?.starts_at,
          stripe_account_id: host?.stripe_account_id ?? null,
          stripe_payouts_enabled: host?.stripe_payouts_enabled ?? false,
        }
      })
      .filter((booking) => booking.starts_at && isPayoutDue(booking))

    if (!due.length) return textResponse('No payouts due')

    const released = []
    const failed = []

    for (const booking of due) {
      try {
        const transfer = await stripe.transfers.create(transferCreateParams(booking), {
          idempotencyKey: booking.id,
        })
        const { error: updateError } = await admin
          .from('bookings')
          .update({
            stripe_transfer_id: transfer.id,
            payout_released_at: new Date().toISOString(),
          })
          .eq('id', booking.id)
          .is('payout_released_at', null)

        if (updateError) {
          failed.push({ id: booking.id, error: updateError.message })
        } else {
          released.push(booking.id)
        }
      } catch (err) {
        failed.push({ id: booking.id, error: err.message })
      }
    }

    return jsonResponse({ released: released.length, failed })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
