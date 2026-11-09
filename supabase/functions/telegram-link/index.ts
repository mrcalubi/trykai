// POST { action: 'connect' | 'disconnect' } from the signed-in user (Settings).
// connect: one-time code (30 minutes) and a t.me deep link to the bot.
// disconnect: clears the user's Telegram chat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'
import { createTelegramLink, disconnectTelegram } from '../_shared/telegramLink.ts'

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

    const body = asRecord(await req.json().catch(() => null))
    const action = body?.action === 'disconnect' ? 'disconnect' : body?.action === 'connect' ? 'connect' : ''
    if (!action) return jsonResponse({ error: 'action must be connect or disconnect' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (action === 'disconnect') {
      await disconnectTelegram(admin, user.id)
      return jsonResponse({ connected: false })
    }

    const botUsername = Deno.env.get('TELEGRAM_BOT_USERNAME') ?? ''
    if (!botUsername || !Deno.env.get('TELEGRAM_BOT_TOKEN')) {
      return jsonResponse({ error: 'Telegram is not set up yet' }, 503)
    }
    const url = await createTelegramLink(admin, { userId: user.id, botUsername })
    return jsonResponse({ url })
  } catch (err) {
    console.error('telegram-link failed', err instanceof Error ? err.message : err)
    return jsonResponse({ error: 'Could not connect Telegram' }, 500)
  }
})
