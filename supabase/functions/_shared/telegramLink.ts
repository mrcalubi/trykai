// Connecting and disconnecting Telegram (00052). Used by telegram-link (the
// signed-in user, from Settings) and telegram-webhook (updates from
// Telegram). Kept here so the logic is testable without Deno.serve.

import {
  isCommand,
  LINK_CODE_TTL_MINUTES,
  newLinkCode,
  parseStartCode,
  sendTelegram,
  TELEGRAM_REPLIES,
  telegramDeepLink,
} from './telegram.ts'

type Result<T> = PromiseLike<{ data: T | null; error: { message?: string } | null }>

// deno-lint-ignore no-explicit-any
type AdminLike = { from: (table: string) => any }

export async function createTelegramLink(
  admin: AdminLike,
  options: { userId: string; botUsername: string; now?: Date; code?: string },
): Promise<string> {
  const now = options.now ?? new Date()
  const code = options.code ?? newLinkCode()
  // One live code per user: an older link stops working.
  await (admin.from('telegram_link_codes').delete().eq('user_id', options.userId) as Result<unknown>)
  const { error } = await (admin.from('telegram_link_codes').insert({
    code,
    user_id: options.userId,
    expires_at: new Date(now.getTime() + LINK_CODE_TTL_MINUTES * 60_000).toISOString(),
  }) as Result<unknown>)
  if (error) throw new Error(`telegram link code: ${error.message ?? 'insert failed'}`)
  return telegramDeepLink(options.botUsername, code)
}

export async function disconnectTelegram(admin: AdminLike, userId: string): Promise<void> {
  const { error } = await (admin
    .from('users')
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq('id', userId) as Result<unknown>)
  if (error) throw new Error(`telegram disconnect: ${error.message ?? 'update failed'}`)
  await (admin.from('telegram_link_codes').delete().eq('user_id', userId) as Result<unknown>)
}

type TelegramUpdate = {
  message?: {
    text?: string
    chat?: { id?: number; type?: string }
  }
}

export type UpdateOutcome = 'linked' | 'bad_code' | 'stopped' | 'help' | 'ignored'

/**
 * Handle one Telegram update. Only private chats; only /start CODE and /stop
 * change anything. Replies are best effort.
 */
export async function handleTelegramUpdate(
  admin: AdminLike,
  update: TelegramUpdate,
  options: { token: string | undefined; now?: Date; send?: typeof sendTelegram },
): Promise<UpdateOutcome> {
  const message = update?.message
  const chatId = message?.chat?.id
  if (!message || typeof chatId !== 'number' || message.chat?.type !== 'private') return 'ignored'
  const text = message.text ?? ''
  const send = options.send ?? sendTelegram
  const reply = (body: string) => send({ token: options.token, chatId, message: { text: body } })
  const now = options.now ?? new Date()

  if (isCommand(text, 'stop')) {
    await (admin
      .from('users')
      .update({ telegram_chat_id: null, telegram_linked_at: null })
      .eq('telegram_chat_id', chatId) as Result<unknown>)
    await reply(TELEGRAM_REPLIES.stopped)
    return 'stopped'
  }

  if (isCommand(text, 'start')) {
    const code = parseStartCode(text)
    if (!code) {
      await reply(TELEGRAM_REPLIES.help)
      return 'help'
    }
    const { data } = await (admin
      .from('telegram_link_codes')
      .select('code, user_id, expires_at')
      .eq('code', code)
      .maybeSingle() as Result<{ code: string; user_id: string; expires_at: string }>)
    if (!data || new Date(data.expires_at).getTime() <= now.getTime()) {
      await reply(TELEGRAM_REPLIES.badCode)
      return 'bad_code'
    }
    const { error } = await (admin
      .from('users')
      .update({ telegram_chat_id: chatId, telegram_linked_at: now.toISOString() })
      .eq('id', data.user_id) as Result<unknown>)
    if (error) throw new Error(`telegram link: ${error.message ?? 'update failed'}`)
    await (admin.from('telegram_link_codes').delete().eq('code', code) as Result<unknown>)
    await reply(TELEGRAM_REPLIES.connected)
    return 'linked'
  }

  await reply(TELEGRAM_REPLIES.help)
  return 'help'
}
