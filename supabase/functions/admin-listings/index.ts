// The listing review queue behind /admin/listings (00036). Admin JWT only,
// checked against users.is_admin the same way admin-verifications does.
//
//   { action: 'list' }                                   listings waiting on the
//                                                        team or on the host's fix
//   { action: 'review', listing_id, decision, note }     approve, or ask for a
//                                                        change; emails the host

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  listingApprovedHtml,
  listingApprovedSubject,
  listingChangesHtml,
  listingChangesSubject,
  sendResendEmail,
} from '../_shared/email.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'
import { prepareListingReview } from '../_shared/listingReview.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

async function requireAdmin(req: Request): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) }

  const { data: profile } = await adminClient()
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) {
    return { ok: false, response: jsonResponse({ error: 'Not authorised' }, 403) }
  }
  return { ok: true, userId: user.id }
}

type HostRow = {
  id?: string
  full_name?: string | null
  display_name?: string | null
  email?: string | null
  verification_method?: string | null
  verified_name?: string | null
  teaching_plan?: string | null
}

async function listQueue() {
  const { data: rows, error } = await adminClient()
    .from('listings')
    .select(
      'id, title, description, category, area, price_per_person, duration_mins, photo_urls, whats_provided, review_status, review_note, review_requested_at, users!host_id (id, full_name, display_name, email, verification_method, verified_name, teaching_plan)',
    )
    .in('review_status', ['pending', 'changes_requested'])
    .order('review_requested_at', { ascending: true, nullsFirst: true })
    .limit(100)
  if (error) return jsonResponse({ error: error.message }, 500)

  const listings = (rows ?? []).map((row) => {
    const host = (asRecord(row.users) ?? {}) as HostRow
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      area: row.area,
      price_per_person: row.price_per_person,
      duration_mins: row.duration_mins,
      photo_urls: Array.isArray(row.photo_urls) ? row.photo_urls : [],
      whats_provided: Array.isArray(row.whats_provided) ? row.whats_provided : [],
      review_status: row.review_status,
      review_note: row.review_note,
      review_requested_at: row.review_requested_at,
      host: {
        id: host.id ?? null,
        name: host.full_name || host.display_name || 'Host',
        email: host.email ?? null,
        verification_method: host.verification_method ?? null,
        verified_name: host.verification_method === 'singpass' ? host.verified_name ?? null : null,
        teaching_plan: host.teaching_plan ?? null,
      },
    }
  })

  return jsonResponse({ listings })
}

async function review(reviewerId: string, body: Record<string, unknown>) {
  const listingId = typeof body.listing_id === 'string' ? body.listing_id : ''
  if (!UUID.test(listingId)) return jsonResponse({ error: 'listing_id is required' }, 400)

  const prepared = prepareListingReview({ decision: body.decision, note: body.note })
  if (!prepared.ok) return jsonResponse({ error: prepared.message }, prepared.status)

  const admin = adminClient()
  const { data: listing } = await admin
    .from('listings')
    .select('id, title, review_status, users!host_id (full_name, display_name, email)')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return jsonResponse({ error: 'Listing not found' }, 404)

  // A second click on the same decision is a no-op, and sends no second email.
  if (listing.review_status === prepared.decision && prepared.decision === 'approved') {
    return jsonResponse({ ok: true, decision: prepared.decision, unchanged: true })
  }

  const { error: reviewError } = await admin.rpc('review_listing', {
    p_listing_id: listingId,
    p_decision: prepared.decision,
    p_note: prepared.note,
    p_reviewer_id: reviewerId,
  })
  if (reviewError) return jsonResponse({ error: reviewError.message }, 400)

  const host = (asRecord(listing.users) ?? {}) as HostRow
  const hostName = host.display_name || host.full_name || null
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://trykai.sg'
  const apiKey = Deno.env.get('RESEND_API_KEY')

  if (prepared.decision === 'approved') {
    await sendResendEmail({
      apiKey,
      to: host.email,
      subject: listingApprovedSubject(listing.title),
      html: listingApprovedHtml({ siteUrl, hostName, listingId, title: listing.title }),
    })
  } else {
    await sendResendEmail({
      apiKey,
      to: host.email,
      subject: listingChangesSubject(listing.title),
      html: listingChangesHtml({
        siteUrl,
        hostName,
        listingId,
        title: listing.title,
        note: prepared.note as string,
      }),
    })
  }

  return jsonResponse({ ok: true, decision: prepared.decision })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (body.action === 'list') return await listQueue()
    if (body.action === 'review') return await review(auth.userId, body)
    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('admin-listings failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
