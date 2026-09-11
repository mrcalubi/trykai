export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature, x-admin-secret, x-cron-secret',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: corsHeaders })
}

export function hasValidSecret(
  req: Request,
  secret: string | undefined,
  headerNames: string[] = ['x-cron-secret', 'x-admin-secret'],
): boolean {
  if (!secret) return false
  for (const name of headerNames) {
    if (req.headers.get(name) === secret) return true
  }
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  return false
}

export type StripeEventAction =
  | 'confirm'
  | 'cancel_pending'
  | 'sync_account'
  | 'review_identity'
  | 'ignore'

export function stripeEventAction(eventType: string): StripeEventAction {
  if (eventType === 'payment_intent.succeeded') return 'confirm'
  if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
    return 'cancel_pending'
  }
  if (eventType === 'account.updated') return 'sync_account'
  if (
    eventType === 'identity.verification_session.verified' ||
    eventType === 'identity.verification_session.requires_input'
  ) {
    return 'review_identity'
  }
  return 'ignore'
}

/** PostgREST may return a many-to-one embed as an object or a one-element array. */
export function asRecord<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export function chargeIdFromPaymentIntent(paymentIntent: {
  latest_charge?: string | { id?: string } | null
}): string | null {
  const charge = paymentIntent.latest_charge
  if (typeof charge === 'string' && charge.length > 0) return charge
  if (charge && typeof charge === 'object' && typeof charge.id === 'string') return charge.id
  return null
}
