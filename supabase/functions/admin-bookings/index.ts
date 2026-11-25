// Every booking, for the team, behind /admin/bookings. Admin JWT only, checked
// against users.is_admin the same way admin-listings does. Read only.
//
//   { action: 'list' }   { upcoming, recent }: confirmed and cancelled bookings
//                        with guest, friends, class, host and session time.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import {
  ADMIN_BOOKING_STATUSES,
  ADMIN_BOOKINGS_LIMIT,
  ADMIN_BOOKINGS_SELECT,
  splitAdminBookings,
} from '../_shared/adminBookings.ts'

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
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
  return { ok: true }
}

async function listBookings() {
  const { data, error } = await adminClient()
    .from('bookings')
    .select(ADMIN_BOOKINGS_SELECT)
    .in('status', [...ADMIN_BOOKING_STATUSES])
    .order('created_at', { ascending: false })
    .limit(ADMIN_BOOKINGS_LIMIT)
  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse(splitAdminBookings(data ?? [], Date.now()))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (body.action === 'list') return await listBookings()
    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('admin-bookings failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
