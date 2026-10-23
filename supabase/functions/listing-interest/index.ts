// POST { listing_id, days?, times?, group_size? } from a signed-in guest who
// taps "I'm keen" on a listing with no upcoming sessions (00032).
//
// Upserts the guest's row (refreshing it if they tap again), then emails the
// host a count and tallies at most once a day per listing. The host never
// learns who is keen. A failed email never fails the request.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import { keenHostHtml, keenHostSubject, publicDisplayName, sendResendEmail } from '../_shared/email.ts'
import {
  INTEREST_OPEN_DAYS,
  interestDecision,
  parseInterestRequest,
  shouldEmailHost,
  summarizeInterest,
} from '../_shared/interest.ts'

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

    const parsed = parseInterestRequest(await req.json().catch(() => null))
    if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400)
    const request = parsed.value

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: listing } = await admin
      .from('listings')
      .select('id, title, host_id, is_active, review_status, users!host_id (email, full_name, display_name, is_suspended)')
      .eq('id', request.listingId)
      .maybeSingle()

    const host = (listing?.users ?? null) as {
      email?: string | null
      full_name?: string | null
      display_name?: string | null
      is_suspended?: boolean | null
    } | null

    const decision = interestDecision({
      callerId: user?.id,
      listing,
      hostSuspended: Boolean(host?.is_suspended),
    })
    if (!decision.ok) return jsonResponse({ error: decision.error }, decision.httpStatus)

    const { error: upsertError } = await admin.from('listing_interests').upsert(
      {
        listing_id: request.listingId,
        guest_id: user!.id,
        days: request.days,
        times: request.times,
        group_size: request.groupSize,
        updated_at: new Date().toISOString(),
        notified_at: null,
      },
      { onConflict: 'listing_id,guest_id' },
    )
    if (upsertError) return jsonResponse({ error: upsertError.message }, 500)

    let emailedHost = false
    try {
      const { data: notice } = await admin
        .from('listing_interest_host_notices')
        .select('notified_at')
        .eq('listing_id', request.listingId)
        .maybeSingle()

      if (shouldEmailHost(notice?.notified_at) && host?.email) {
        const since = new Date(Date.now() - INTEREST_OPEN_DAYS * 24 * 60 * 60 * 1000).toISOString()
        const { data: openRows } = await admin
          .from('listing_interests')
          .select('days, times, group_size')
          .eq('listing_id', request.listingId)
          .is('notified_at', null)
          .gt('updated_at', since)
        const summary = summarizeInterest(openRows ?? [])

        // Claim the slot before sending, so two taps at once send one email.
        const now = new Date().toISOString()
        const { error: claimError } = await admin
          .from('listing_interest_host_notices')
          .upsert({ listing_id: request.listingId, notified_at: now }, { onConflict: 'listing_id' })

        if (!claimError && summary.keen_count > 0) {
          await sendResendEmail({
            apiKey: Deno.env.get('RESEND_API_KEY'),
            to: host.email,
            subject: keenHostSubject(listing!.title, summary.keen_count),
            html: keenHostHtml({
              hostName: publicDisplayName(host),
              listingTitle: listing!.title,
              summary,
              siteUrl: Deno.env.get('SITE_URL'),
            }),
          })
          emailedHost = true
        }
      }
    } catch (err) {
      console.error('listing-interest: host email failed', err)
    }

    return jsonResponse({ keen: true, emailed_host: emailedHost })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
