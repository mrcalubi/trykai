// POST { listing_id } from the listing's host, called by the Hosting tab right
// after sessions are added (00032).
//
// Emails every guest whose interest is still open that a date has opened, with
// the next few dates, and marks them notified so each guest hears once. Safe to
// call more than once: a second call finds nobody left to notify.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import {
  dateOpenedGuestHtml,
  dateOpenedGuestSubject,
  formatSessionDate,
  GUEST_REPLY_TO,
  publicDisplayName,
  sendResendEmail,
} from '../_shared/email.ts'
import { INTEREST_OPEN_DAYS } from '../_shared/interest.ts'

const MAX_PER_CALL = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    if (!user) return jsonResponse({ error: 'Not signed in' }, 401)

    const body = await req.json().catch(() => null)
    const listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
    if (!UUID.test(listingId)) return jsonResponse({ error: 'listing_id is required' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: listing } = await admin
      .from('listings')
      .select('id, title, host_id, is_active, users!host_id (full_name, display_name)')
      .eq('id', listingId)
      .maybeSingle()
    if (!listing || listing.host_id !== user.id) {
      return jsonResponse({ error: 'Listing not found' }, 404)
    }
    if (!listing.is_active) return jsonResponse({ notified: 0, reason: 'inactive' })

    const { data: sessions } = await admin
      .from('sessions')
      .select('starts_at')
      .eq('listing_id', listingId)
      .eq('status', 'open')
      .gt('spots_remaining', 0)
      .gt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(4)
    if (!sessions?.length) return jsonResponse({ notified: 0, reason: 'no_open_sessions' })

    const since = new Date(Date.now() - INTEREST_OPEN_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: interests } = await admin
      .from('listing_interests')
      .select('id, guest_id')
      .eq('listing_id', listingId)
      .is('notified_at', null)
      .gt('updated_at', since)
      .limit(MAX_PER_CALL)
    if (!interests?.length) return jsonResponse({ notified: 0 })

    // Claim the rows first so a double tap cannot email anyone twice.
    const { data: claimed } = await admin
      .from('listing_interests')
      .update({ notified_at: new Date().toISOString() })
      .in('id', interests.map((row) => row.id))
      .is('notified_at', null)
      .select('guest_id')
    if (!claimed?.length) return jsonResponse({ notified: 0 })

    const { data: guests } = await admin
      .from('users')
      .select('id, email, full_name, display_name')
      .in('id', claimed.map((row) => row.guest_id))

    const hostName = publicDisplayName(listing.users as { full_name?: string; display_name?: string })
    const sessionDates = sessions.map((session) => formatSessionDate(session.starts_at))
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const siteUrl = Deno.env.get('SITE_URL')

    let sent = 0
    for (const guest of guests ?? []) {
      if (!guest.email) continue
      await sendResendEmail({
        apiKey,
        to: guest.email,
        subject: dateOpenedGuestSubject(hostName, listing.title),
        replyTo: GUEST_REPLY_TO,
        html: dateOpenedGuestHtml({
          guestName: publicDisplayName(guest),
          hostName,
          listingTitle: listing.title,
          listingId,
          sessionDates,
          siteUrl,
        }),
      })
      sent += 1
    }

    return jsonResponse({ notified: sent })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
