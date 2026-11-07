// Telegram calls this for every message to the bot (set with setWebhook and a
// secret_token; OPERATIONS.md, Telegram). Only requests carrying that secret
// in X-Telegram-Bot-Api-Secret-Token are handled. Always answers 200 to a
// genuine request so Telegram does not retry.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import { secretMatches } from '../_shared/telegram.ts'
import { handleTelegramUpdate } from '../_shared/telegramLink.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return textResponse('ok')

  if (!secretMatches(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), Deno.env.get('TELEGRAM_WEBHOOK_SECRET'))) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    const update = await req.json().catch(() => null)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const outcome = await handleTelegramUpdate(admin, update ?? {}, {
      token: Deno.env.get('TELEGRAM_BOT_TOKEN'),
    })
    console.log('telegram-webhook', outcome)
  } catch (err) {
    console.error('telegram-webhook failed', err instanceof Error ? err.message : err)
  }
  return jsonResponse({ ok: true })
})
