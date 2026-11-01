import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rescheduleErrorMessage } from '../_shared/booking.ts'
import {
  addonPrepareLine,
  formatSessionDate,
  publicDisplayName,
  sendRescheduleEmails,
} from '../_shared/email.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

function guestFirstName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean)[0] || 'A guest'
}

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

    const body = await req.json()
    if (!body?.booking_id || !body?.session_id) {
      return jsonResponse({ error: 'booking_id and session_id are required' }, 400)
    }

    const admin = adminClient()
    const { data: booking, error } = await admin
      .from('bookings')
      .select(
        `
        id,
        guest_id,
        session_id,
        sessions ( starts_at, listings ( id, title, host_id ) )
      `,
      )
      .eq('id', body.booking_id)
      .maybeSingle()

    if (error || !booking) return jsonResponse({ error: 'Booking not found' }, 404)
    if (booking.guest_id !== user.id) return textResponse('Forbidden', 403)

    const oldSession = asRecord(booking.sessions)
    const listing = asRecord(oldSession?.listings)
    const oldStartsAt = typeof oldSession?.starts_at === 'string' ? oldSession.starts_at : ''

    const { data: newSession } = await admin
      .from('sessions')
      .select('id, starts_at')
      .eq('id', body.session_id)
      .maybeSingle()

    const { error: rpcError } = await admin.rpc('reschedule_booking', {
      p_booking_id: booking.id,
      p_new_session_id: body.session_id,
    })

    if (rpcError) {
      const message = rescheduleErrorMessage(rpcError.message)
      const status =
        /not allowed/i.test(rpcError.message) ? 403 : /booking not found/i.test(rpcError.message) ? 404 : 400
      return jsonResponse({ error: message }, status)
    }

    const { data: addons } = await admin
      .from('booking_addons')
      .select('name, quantity')
      .eq('booking_id', booking.id)

    const [guestResult, hostResult] = await Promise.all([
      admin.from('users').select('email, display_name, full_name').eq('id', booking.guest_id).maybeSingle(),
      listing?.host_id
        ? admin.from('users').select('email, display_name, full_name').eq('id', listing.host_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const guestName = publicDisplayName(guestResult.data)
    const newStartsAt = typeof newSession?.starts_at === 'string' ? newSession.starts_at : ''

    await sendRescheduleEmails({
      apiKey: Deno.env.get('RESEND_API_KEY'),
      guestEmail: guestResult.data?.email,
      hostEmail: hostResult.data?.email,
      guestName,
      hostName: publicDisplayName(hostResult.data),
      guestFirstName: guestFirstName(guestName),
      listingTitle: typeof listing?.title === 'string' ? listing.title : 'your session',
      oldSessionDate: oldStartsAt ? formatSessionDate(oldStartsAt) : '',
      newSessionDate: newStartsAt ? formatSessionDate(newStartsAt) : '',
      bookingId: booking.id,
      addons: addons ?? [],
      siteUrl: Deno.env.get('SITE_URL'),
    })

    return jsonResponse({
      ok: true,
      session_id: body.session_id,
      prepare: addonPrepareLine(addons ?? []),
    })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
