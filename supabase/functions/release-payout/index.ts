import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asRecord, hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'
import {
  payoutSkipReason,
  resolveChargeId,
  summarisePayoutRun,
  transferCreateParams,
  type PayoutCandidate,
  type PayoutSkipReason,
} from '../_shared/payouts.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

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
        stripe_payment_id,
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

    const candidates: PayoutCandidate[] = (rows ?? []).map((row) => {
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
        stripe_payment_id: row.stripe_payment_id,
        starts_at: typeof session?.starts_at === 'string' ? session.starts_at : '',
        stripe_account_id: host?.stripe_account_id ?? null,
        stripe_payouts_enabled: host?.stripe_payouts_enabled ?? false,
      }
    })

    for (const booking of candidates) {
      if (booking.stripe_charge_id || !booking.stripe_payment_id) continue
      try {
        const chargeId = await resolveChargeId(booking, (id) => stripe.paymentIntents.retrieve(id))
        if (!chargeId) continue
        const { error: chargeError } = await admin
          .from('bookings')
          .update({ stripe_charge_id: chargeId })
          .eq('id', booking.id)
          .is('stripe_charge_id', null)
        if (chargeError) {
          console.error('release-payout: could not store charge id', booking.id, chargeError.message)
        }
        booking.stripe_charge_id = chargeId
      } catch (err) {
        console.error('release-payout: could not load charge id', booking.id, errorMessage(err))
      }
    }

    const due: PayoutCandidate[] = []
    const skipped: { id: string; reason: PayoutSkipReason }[] = []
    for (const booking of candidates) {
      const reason = payoutSkipReason(booking)
      if (reason) skipped.push({ id: booking.id, reason })
      else due.push(booking)
    }

    const released: string[] = []
    const failed: { id: string; error: string }[] = []

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
        failed.push({ id: booking.id, error: errorMessage(err) })
      }
    }

    const summary = summarisePayoutRun({
      scanned: candidates.length,
      dueIds: due.map((booking) => booking.id),
      released,
      failed,
      skipped,
    })
    console.log('release-payout', JSON.stringify(summary))
    return jsonResponse(summary)
  } catch (err) {
    const message = errorMessage(err)
    console.error('release-payout failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
