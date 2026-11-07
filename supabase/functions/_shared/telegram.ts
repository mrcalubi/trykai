// Telegram host updates (00052). Email stays the record; Telegram is a backup
// for hosts who live in Telegram. Every function here swallows its own
// errors: a Telegram failure must never change the outcome of the action
// that triggered it (a booking, a cancel, a reminder run).
//
// Plain text only (no parse_mode), so names and titles need no escaping.

export const TELEGRAM_API = 'https://api.telegram.org'
export const LINK_CODE_TTL_MINUTES = 30

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Deno.env in Edge Functions; undefined under Node (tests pass values in). */
export function envValue(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno
  return deno?.env.get(name)
}

export type TelegramMessage = {
  text: string
  /** Optional button under the message. */
  url?: string
  label?: string
}

export type TelegramSendResult = 'sent' | 'blocked' | 'failed' | 'skipped'

export function newLinkCode(bytes = 18): string {
  const raw = new Uint8Array(bytes)
  crypto.getRandomValues(raw)
  let text = ''
  for (const byte of raw) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function telegramDeepLink(botUsername: string, code: string): string {
  return `https://t.me/${encodeURIComponent(botUsername.replace(/^@/, ''))}?start=${encodeURIComponent(code)}`
}

/** "/start CODE" or "/start@BotName CODE" → CODE; anything else → ''. */
export function parseStartCode(text: string | null | undefined): string {
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})\s*$/.exec(String(text ?? '').trim())
  return match ? match[1] : ''
}

export function isCommand(text: string | null | undefined, command: string): boolean {
  return new RegExp(`^/${command}(?:@\\w+)?(?:\\s|$)`).test(String(text ?? '').trim())
}

/** Constant-time compare for the webhook secret header. */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export async function sendTelegram(options: {
  token: string | undefined
  chatId: number | string | null | undefined
  message: TelegramMessage
  fetchImpl?: FetchLike
}): Promise<TelegramSendResult> {
  const { token, chatId, message } = options
  if (!token || chatId === null || chatId === undefined || chatId === '' || !message.text) return 'skipped'
  const fetchImpl = options.fetchImpl ?? fetch
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message.text,
    link_preview_options: { is_disabled: true },
  }
  if (message.url && message.label && /^https:\/\//.test(message.url)) {
    body.reply_markup = { inline_keyboard: [[{ text: message.label, url: message.url }]] }
  }
  try {
    const res = await fetchImpl(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return 'sent'
    // 403: the user blocked the bot. 400 "chat not found": the chat is gone.
    const detail = await res.text().catch(() => '')
    if (res.status === 403 || (res.status === 400 && /chat not found/i.test(detail))) return 'blocked'
    console.error('telegram send failed', res.status)
    return 'failed'
  } catch (err) {
    console.error('telegram send failed', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

// Loose on purpose: the real client is the esm.sh SupabaseClient, tests pass a
// small fake.
// deno-lint-ignore no-explicit-any
type AdminLike = { from: (table: string) => any }

/**
 * Send a host update if this user connected Telegram. Clears the chat id when
 * Telegram says the bot was blocked, so we stop trying. Never throws.
 */
export async function notifyUserTelegram(
  admin: AdminLike,
  userId: string | null | undefined,
  message: TelegramMessage,
  options: { token?: string; fetchImpl?: FetchLike } = {},
): Promise<TelegramSendResult> {
  const token = options.token ?? envValue('TELEGRAM_BOT_TOKEN')
  if (!token || !userId) return 'skipped'
  try {
    const { data } = await admin.from('users').select('telegram_chat_id').eq('id', userId).maybeSingle()
    const chatId = (data as { telegram_chat_id?: number | string | null } | null)?.telegram_chat_id
    if (chatId === null || chatId === undefined) return 'skipped'
    const result = await sendTelegram({ token, chatId, message, fetchImpl: options.fetchImpl })
    if (result === 'blocked') {
      await admin.from('users').update({ telegram_chat_id: null, telegram_linked_at: null }).eq('id', userId)
    }
    return result
  } catch (err) {
    console.error('telegram notify failed', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

// ---------------------------------------------------------------------------
// Messages. Short: one line of news, one line of detail at most.
// ---------------------------------------------------------------------------

function siteBase(siteUrl?: string): string {
  return (siteUrl || 'https://trykai.sg').replace(/\/+$/, '')
}

function people(count: number): string {
  const n = Math.max(1, Number(count) || 1)
  return n === 1 ? '1 guest' : `${n} guests`
}

export function telegramNewBooking(o: {
  guestName: string
  listingTitle: string
  when: string
  guestsCount: number
  siteUrl?: string
}): TelegramMessage {
  return {
    text: `New booking: ${o.guestName} booked ${o.listingTitle} for ${o.when} (${people(o.guestsCount)}).`,
    url: `${siteBase(o.siteUrl)}/hosting`,
    label: 'Open Hosting',
  }
}

export function telegramGuestCancelled(o: {
  guestName: string
  listingTitle: string
  when: string
  siteUrl?: string
}): TelegramMessage {
  return {
    text: `Cancelled: ${o.guestName} cancelled ${o.listingTitle} on ${o.when}.`,
    url: `${siteBase(o.siteUrl)}/hosting`,
    label: 'Open Hosting',
  }
}

export function telegramBookingMoved(o: {
  guestName: string
  listingTitle: string
  newWhen: string
  siteUrl?: string
}): TelegramMessage {
  return {
    text: `Moved: ${o.guestName} moved ${o.listingTitle} to ${o.newWhen}.`,
    url: `${siteBase(o.siteUrl)}/hosting`,
    label: 'Open Hosting',
  }
}

export function telegramSessionReminder(o: {
  dayWord: string
  listingTitle: string
  time: string
  guestsCount: number
  siteUrl?: string
}): TelegramMessage {
  return {
    text: `${o.dayWord}: ${people(o.guestsCount)} coming to ${o.listingTitle} at ${o.time}.`,
    url: `${siteBase(o.siteUrl)}/hosting`,
    label: 'Open Hosting',
  }
}

export function telegramReviewPrompt(o: {
  listingTitle: string
  names: string[]
  deadline: string
  reminder: boolean
  siteUrl?: string
}): TelegramMessage {
  const who = o.names.filter(Boolean).join(', ')
  const text = o.reminder
    ? `2 days left to review your guests from ${o.listingTitle}: ${who}. Reviews close ${o.deadline}.`
    : `How were your guests? Review ${who} from ${o.listingTitle} by ${o.deadline}.`
  return { text, url: `${siteBase(o.siteUrl)}/hosting`, label: 'Review guests' }
}

export function telegramGuestReviewed(o: {
  guestName: string
  listingTitle: string
  deadline: string
  siteUrl?: string
}): TelegramMessage {
  return {
    text: `${o.guestName} reviewed ${o.listingTitle}. Review ${o.guestName} by ${o.deadline} to see it.`,
    url: `${siteBase(o.siteUrl)}/hosting`,
    label: 'Review guests',
  }
}

export const TELEGRAM_REPLIES = {
  connected:
    "Connected. You'll get TryKai host updates here: new bookings, cancellations, reminders and reviews. Send /stop to turn them off.",
  badCode: 'That link has expired. In TryKai, open Settings and tap Connect Telegram again.',
  help: 'To get TryKai host updates here, open Settings on trykai.sg and tap Connect Telegram.',
  stopped: 'Telegram updates are off. You can turn them back on in TryKai Settings.',
} as const
