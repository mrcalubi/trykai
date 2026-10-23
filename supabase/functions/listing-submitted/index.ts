// POST {} from a signed-in host, right after CreateListing or EditListing saves.
//
// Emails the TryKai team (ADMIN_NOTIFY_EMAIL) about each of the caller's
// listings that is waiting for review and that nobody has been told about
// since it last entered the queue (00036). The page does not wait on it, and
// it takes no listing id: it finds the host's own pending listings, so a
// missed call is caught by the next save, and a repeated one sends nothing.
//
// Each row is claimed (review_notified_at) before its email goes out, on the
// exact value read, so two calls at once cannot email twice.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  listingSubmittedOpsHtml,
  listingSubmittedSubject,
  sendResendEmail,
} from '../_shared/email.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'
import {
  isResubmission,
  MAX_SUBMITTED_NOTICES,
  needsSubmittedNotice,
} from '../_shared/listingReview.ts'

type HostRow = {
  full_name?: string | null
  display_name?: string | null
  email?: string | null
  verification_method?: string | null
  verified_name?: string | null
}

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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: rows, error } = await admin
      .from('listings')
      .select(
        'id, title, description, category, area, price_per_person, photo_urls, review_status, review_requested_at, review_notified_at, users!host_id (full_name, display_name, email, verification_method, verified_name)',
      )
      .eq('host_id', user.id)
      .eq('review_status', 'pending')
      .order('review_requested_at', { ascending: true })
      .limit(20)
    if (error) {
      console.error('listing-submitted lookup failed', error.message)
      return jsonResponse({ error: 'Could not read your listings' }, 500)
    }

    const due = (rows ?? []).filter(needsSubmittedNotice).slice(0, MAX_SUBMITTED_NOTICES)
    if (due.length === 0) return jsonResponse({ ok: true, notified: 0 })

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://trykai.sg'
    const to = Deno.env.get('ADMIN_NOTIFY_EMAIL') ?? 'calebong2002@gmail.com'
    const apiKey = Deno.env.get('RESEND_API_KEY')

    let notified = 0
    for (const row of due) {
      let claim = admin
        .from('listings')
        .update({ review_notified_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('review_status', 'pending')
      claim = row.review_notified_at
        ? claim.eq('review_notified_at', row.review_notified_at)
        : claim.is('review_notified_at', null)
      const { data: claimed } = await claim.select('id')
      if (!claimed?.length) continue

      const host = (asRecord(row.users) ?? {}) as HostRow
      const resubmitted = isResubmission(row)
      await sendResendEmail({
        apiKey,
        to,
        subject: listingSubmittedSubject(row.title, resubmitted),
        html: listingSubmittedOpsHtml({
          siteUrl,
          listingId: row.id,
          title: row.title,
          description: row.description,
          category: row.category,
          area: row.area,
          priceCents: row.price_per_person,
          photoCount: Array.isArray(row.photo_urls) ? row.photo_urls.length : 0,
          hostName: host.full_name || host.display_name || 'A host',
          hostEmail: host.email || user.email || '',
          verifiedName: host.verified_name ?? null,
          verificationMethod: host.verification_method ?? null,
          resubmitted,
        }),
      })
      notified++
    }

    return jsonResponse({ ok: true, notified })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('listing-submitted failed', message)
    return jsonResponse({ error: 'Unexpected error' }, 500)
  }
})
