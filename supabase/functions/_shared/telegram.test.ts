import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  envValue,
  isCommand,
  newLinkCode,
  notifyUserTelegram,
  parseStartCode,
  secretMatches,
  sendTelegram,
  TELEGRAM_REPLIES,
  telegramBookingMoved,
  telegramDeepLink,
  telegramGuestCancelled,
  telegramGuestReviewed,
  telegramNewBooking,
  telegramReviewPrompt,
  telegramSessionReminder,
} from './telegram.ts'
import { createTelegramLink, disconnectTelegram, handleTelegramUpdate } from './telegramLink.ts'

type Call = { table: string; op: string; values?: unknown; filters: Array<[string, unknown]> }

/** Chainable stand-in for the service-role client. */
function fakeAdmin(results: Record<string, { data?: unknown; error?: { message: string } | null }> = {}) {
  const calls: Call[] = []
  const admin = {
    from(table: string) {
      const call: Call = { table, op: '', filters: [] }
      calls.push(call)
      const builder = {
        select(columns: string) {
          if (!call.op) call.op = 'select'
          call.values ??= columns
          return builder
        },
        insert(values: unknown) {
          call.op = 'insert'
          call.values = values
          return builder
        },
        update(values: unknown) {
          call.op = 'update'
          call.values = values
          return builder
        },
        delete() {
          call.op = 'delete'
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value])
          return builder
        },
        maybeSingle() {
          return builder
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const result = results[`${table}.${call.op}`] ?? {}
          return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { admin, calls }
}

function okFetch(status = 200, body = '{"ok":true}') {
  return vi.fn(async () => new Response(body, { status }))
}

describe('telegram helpers', () => {
  it('makes url-safe one-time codes the database accepts', () => {
    const code = newLinkCode()
    expect(code).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
    expect(newLinkCode()).not.toBe(code)
  })

  it('builds a deep link without the @', () => {
    expect(telegramDeepLink('@TryKaiBot', 'abcDEF123_-xyz7890')).toBe('https://t.me/TryKaiBot?start=abcDEF123_-xyz7890')
  })

  it('reads the code from /start, with or without the bot name', () => {
    expect(parseStartCode('/start abcDEF123_-xyz7890')).toBe('abcDEF123_-xyz7890')
    expect(parseStartCode('/start@TryKaiBot abcDEF123_-xyz7890 ')).toBe('abcDEF123_-xyz7890')
    expect(parseStartCode('/start')).toBe('')
    expect(parseStartCode('/start short')).toBe('')
    expect(parseStartCode(null)).toBe('')
  })

  it('recognises commands', () => {
    expect(isCommand('/stop', 'stop')).toBe(true)
    expect(isCommand('/stop@TryKaiBot', 'stop')).toBe(true)
    expect(isCommand('/stopnow', 'stop')).toBe(false)
    expect(isCommand(undefined, 'stop')).toBe(false)
  })

  it('compares the webhook secret exactly', () => {
    expect(secretMatches('s3cret', 's3cret')).toBe(true)
    expect(secretMatches('s3creT', 's3cret')).toBe(false)
    expect(secretMatches('s3cre', 's3cret')).toBe(false)
    expect(secretMatches(null, 's3cret')).toBe(false)
    expect(secretMatches('s3cret', undefined)).toBe(false)
  })

  it('has no Deno.env under Node', () => {
    expect(envValue('TELEGRAM_BOT_TOKEN')).toBeUndefined()
  })
})

describe('sendTelegram', () => {
  it('posts plain text with a button and no link preview', async () => {
    const fetchImpl = okFetch()
    const result = await sendTelegram({
      token: 'TOKEN',
      chatId: 42,
      message: { text: 'Hi', url: 'https://trykai.sg/hosting', label: 'Open Hosting' },
      fetchImpl,
    })
    expect(result).toBe('sent')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      chat_id: 42,
      text: 'Hi',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: 'Open Hosting', url: 'https://trykai.sg/hosting' }]] },
    })
    expect(body.parse_mode).toBeUndefined()
  })

  it('drops a button that is not https', async () => {
    const fetchImpl = okFetch()
    await sendTelegram({ token: 'T', chatId: 1, message: { text: 'Hi', url: 'http://x', label: 'X' }, fetchImpl })
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.reply_markup).toBeUndefined()
  })

  it('skips without a token, chat or text', async () => {
    const fetchImpl = okFetch()
    expect(await sendTelegram({ token: undefined, chatId: 1, message: { text: 'x' }, fetchImpl })).toBe('skipped')
    expect(await sendTelegram({ token: 'T', chatId: null, message: { text: 'x' }, fetchImpl })).toBe('skipped')
    expect(await sendTelegram({ token: 'T', chatId: '', message: { text: 'x' }, fetchImpl })).toBe('skipped')
    expect(await sendTelegram({ token: 'T', chatId: 1, message: { text: '' }, fetchImpl })).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports a blocked bot or a missing chat', async () => {
    expect(await sendTelegram({ token: 'T', chatId: 1, message: { text: 'x' }, fetchImpl: okFetch(403, 'Forbidden: bot was blocked by the user') })).toBe('blocked')
    expect(await sendTelegram({ token: 'T', chatId: 1, message: { text: 'x' }, fetchImpl: okFetch(400, 'Bad Request: chat not found') })).toBe('blocked')
  })

  it('reports other failures without throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await sendTelegram({ token: 'T', chatId: 1, message: { text: 'x' }, fetchImpl: okFetch(500, 'oops') })).toBe('failed')
    expect(await sendTelegram({ token: 'T', chatId: 1, message: { text: 'x' }, fetchImpl: okFetch(400, 'Bad Request: message is too long') })).toBe('failed')
    const thrower = vi.fn(async () => {
      throw new Error('network')
    })
    expect(await sendTelegram({ token: 'T', chatId: 1, message: { text: 'x' }, fetchImpl: thrower })).toBe('failed')
    spy.mockRestore()
  })
})

describe('notifyUserTelegram', () => {
  it('sends to the saved chat', async () => {
    const { admin } = fakeAdmin({ 'users.select': { data: { telegram_chat_id: 99 } } })
    const fetchImpl = okFetch()
    expect(await notifyUserTelegram(admin, 'host-1', { text: 'Hi' }, { token: 'T', fetchImpl })).toBe('sent')
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).chat_id).toBe(99)
  })

  it('does nothing for a host without Telegram, a missing user or a missing token', async () => {
    const { admin } = fakeAdmin({ 'users.select': { data: { telegram_chat_id: null } } })
    const fetchImpl = okFetch()
    expect(await notifyUserTelegram(admin, 'host-1', { text: 'Hi' }, { token: 'T', fetchImpl })).toBe('skipped')
    expect(await notifyUserTelegram(admin, null, { text: 'Hi' }, { token: 'T', fetchImpl })).toBe('skipped')
    expect(await notifyUserTelegram(admin, 'host-1', { text: 'Hi' }, { fetchImpl })).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('forgets the chat when the host blocked the bot', async () => {
    const { admin, calls } = fakeAdmin({ 'users.select': { data: { telegram_chat_id: 99 } } })
    const result = await notifyUserTelegram(admin, 'host-1', { text: 'Hi' }, { token: 'T', fetchImpl: okFetch(403, 'blocked') })
    expect(result).toBe('blocked')
    expect(calls.at(-1)).toMatchObject({
      table: 'users',
      op: 'update',
      values: { telegram_chat_id: null, telegram_linked_at: null },
      filters: [['id', 'host-1']],
    })
  })

  it('never throws when the lookup fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = {
      from() {
        throw new Error('db down')
      },
    }
    expect(await notifyUserTelegram(admin, 'host-1', { text: 'Hi' }, { token: 'T' })).toBe('failed')
    spy.mockRestore()
  })
})

describe('telegram messages', () => {
  it('keeps each update to one short line with a Hosting button', () => {
    const booking = telegramNewBooking({ guestName: 'Kai', listingTitle: 'DJ Basics', when: 'Sat 14 Nov 2026, 3:00 pm', guestsCount: 2 })
    expect(booking).toEqual({
      text: 'New booking: Kai booked DJ Basics for Sat 14 Nov 2026, 3:00 pm (2 guests).',
      url: 'https://trykai.sg/hosting',
      label: 'Open Hosting',
    })
    expect(telegramNewBooking({ guestName: 'Kai', listingTitle: 'DJ', when: 'x', guestsCount: 0, siteUrl: 'https://trykai.vercel.app/' }))
      .toMatchObject({ text: expect.stringContaining('(1 guest)'), url: 'https://trykai.vercel.app/hosting' })
    expect(telegramGuestCancelled({ guestName: 'Kai', listingTitle: 'DJ Basics', when: 'Sat 14 Nov' }).text)
      .toBe('Cancelled: Kai cancelled DJ Basics on Sat 14 Nov.')
    expect(telegramBookingMoved({ guestName: 'Kai', listingTitle: 'DJ Basics', newWhen: 'Sun 15 Nov' }).text)
      .toBe('Moved: Kai moved DJ Basics to Sun 15 Nov.')
    expect(telegramSessionReminder({ dayWord: 'Tomorrow', listingTitle: 'DJ Basics', time: '3:00 pm', guestsCount: 3 }).text)
      .toBe('Tomorrow: 3 guests coming to DJ Basics at 3:00 pm.')
  })

  it('asks the host to review, and nudges near the deadline', () => {
    const base = { listingTitle: 'DJ Basics', names: ['Kai', 'Aakash', ''], deadline: 'Fri, 13 Nov' }
    expect(telegramReviewPrompt({ ...base, reminder: false })).toMatchObject({
      text: 'How were your guests? Review Kai, Aakash from DJ Basics by Fri, 13 Nov.',
      label: 'Review guests',
    })
    expect(telegramReviewPrompt({ ...base, reminder: true }).text)
      .toBe('2 days left to review your guests from DJ Basics: Kai, Aakash. Reviews close Fri, 13 Nov.')
    expect(telegramGuestReviewed({ guestName: 'Kai', listingTitle: 'DJ Basics', deadline: 'Fri, 13 Nov' }).text)
      .toBe('Kai reviewed DJ Basics. Review Kai by Fri, 13 Nov to see it.')
  })

  it('uses no em dashes', () => {
    const all = [
      ...Object.values(TELEGRAM_REPLIES),
      telegramNewBooking({ guestName: 'a', listingTitle: 'b', when: 'c', guestsCount: 1 }).text,
      telegramReviewPrompt({ listingTitle: 'b', names: ['a'], deadline: 'c', reminder: true }).text,
    ]
    for (const text of all) expect(text).not.toContain('—')
  })
})

describe('connecting Telegram', () => {
  const now = new Date('2026-11-07T10:00:00.000Z')

  it('replaces older codes and returns a deep link that expires in 30 minutes', async () => {
    const { admin, calls } = fakeAdmin()
    const url = await createTelegramLink(admin, { userId: 'host-1', botUsername: 'TryKaiBot', now, code: 'abcDEF123_-xyz7890' })
    expect(url).toBe('https://t.me/TryKaiBot?start=abcDEF123_-xyz7890')
    expect(calls[0]).toMatchObject({ table: 'telegram_link_codes', op: 'delete', filters: [['user_id', 'host-1']] })
    expect(calls[1]).toMatchObject({
      table: 'telegram_link_codes',
      op: 'insert',
      values: { code: 'abcDEF123_-xyz7890', user_id: 'host-1', expires_at: '2026-11-07T10:30:00.000Z' },
    })
  })

  it('makes its own code when none is given', async () => {
    const { admin } = fakeAdmin()
    expect(await createTelegramLink(admin, { userId: 'host-1', botUsername: 'TryKaiBot' })).toMatch(/^https:\/\/t\.me\/TryKaiBot\?start=[A-Za-z0-9_-]{16,64}$/)
  })

  it('throws when the code cannot be saved', async () => {
    const { admin } = fakeAdmin({ 'telegram_link_codes.insert': { error: { message: 'nope' } } })
    await expect(createTelegramLink(admin, { userId: 'host-1', botUsername: 'B' })).rejects.toThrow('telegram link code: nope')
  })

  it('disconnects by clearing the chat and any open code', async () => {
    const { admin, calls } = fakeAdmin()
    await disconnectTelegram(admin, 'host-1')
    expect(calls[0]).toMatchObject({ table: 'users', op: 'update', values: { telegram_chat_id: null, telegram_linked_at: null }, filters: [['id', 'host-1']] })
    expect(calls[1]).toMatchObject({ table: 'telegram_link_codes', op: 'delete', filters: [['user_id', 'host-1']] })
  })

  it('throws when disconnect fails', async () => {
    const { admin } = fakeAdmin({ 'users.update': { error: { message: 'nope' } } })
    await expect(disconnectTelegram(admin, 'host-1')).rejects.toThrow('telegram disconnect: nope')
  })
})

describe('telegram webhook updates', () => {
  const now = new Date('2026-11-07T10:00:00.000Z')
  const code = 'abcDEF123_-xyz7890'
  const privateMessage = (text: string, chatId = 555) => ({ message: { text, chat: { id: chatId, type: 'private' } } })

  function setup(results: Parameters<typeof fakeAdmin>[0] = {}) {
    const { admin, calls } = fakeAdmin(results)
    const send = vi.fn(async () => 'sent' as const)
    return { admin, calls, send }
  }

  it('links the chat to the user for a live code, then spends the code', async () => {
    const { admin, calls, send } = setup({
      'telegram_link_codes.select': { data: { code, user_id: 'host-1', expires_at: '2026-11-07T10:20:00.000Z' } },
    })
    const outcome = await handleTelegramUpdate(admin, privateMessage(`/start ${code}`), { token: 'T', now, send })
    expect(outcome).toBe('linked')
    expect(calls[1]).toMatchObject({
      table: 'users',
      op: 'update',
      values: { telegram_chat_id: 555, telegram_linked_at: now.toISOString() },
      filters: [['id', 'host-1']],
    })
    expect(calls[2]).toMatchObject({ table: 'telegram_link_codes', op: 'delete', filters: [['code', code]] })
    expect(send).toHaveBeenCalledWith({ token: 'T', chatId: 555, message: { text: TELEGRAM_REPLIES.connected } })
  })

  it('refuses an expired or unknown code', async () => {
    const expired = setup({
      'telegram_link_codes.select': { data: { code, user_id: 'host-1', expires_at: '2026-11-07T09:59:00.000Z' } },
    })
    expect(await handleTelegramUpdate(expired.admin, privateMessage(`/start ${code}`), { token: 'T', now, send: expired.send })).toBe('bad_code')
    expect(expired.calls.some((c) => c.table === 'users')).toBe(false)
    expect(expired.send).toHaveBeenCalledWith(expect.objectContaining({ message: { text: TELEGRAM_REPLIES.badCode } }))

    const unknown = setup()
    expect(await handleTelegramUpdate(unknown.admin, privateMessage(`/start ${code}`), { token: 'T', now, send: unknown.send })).toBe('bad_code')
  })

  it('throws when saving the chat fails, so the code is kept', async () => {
    const { admin, calls, send } = setup({
      'telegram_link_codes.select': { data: { code, user_id: 'host-1', expires_at: '2026-11-07T10:20:00.000Z' } },
      'users.update': { error: { message: 'nope' } },
    })
    await expect(handleTelegramUpdate(admin, privateMessage(`/start ${code}`), { token: 'T', now, send })).rejects.toThrow('telegram link: nope')
    expect(calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('explains how to connect for a bare /start or any other message', async () => {
    const bare = setup()
    expect(await handleTelegramUpdate(bare.admin, privateMessage('/start'), { token: 'T', send: bare.send })).toBe('help')
    expect(bare.send).toHaveBeenCalledWith(expect.objectContaining({ message: { text: TELEGRAM_REPLIES.help } }))
    const chat = setup()
    expect(await handleTelegramUpdate(chat.admin, privateMessage('hello'), { token: 'T', send: chat.send })).toBe('help')
    expect(chat.calls).toHaveLength(0)
  })

  it('turns updates off on /stop for every user on that chat', async () => {
    const { admin, calls, send } = setup()
    expect(await handleTelegramUpdate(admin, privateMessage('/stop', 777), { token: 'T', send })).toBe('stopped')
    expect(calls[0]).toMatchObject({
      table: 'users',
      op: 'update',
      values: { telegram_chat_id: null, telegram_linked_at: null },
      filters: [['telegram_chat_id', 777]],
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ chatId: 777, message: { text: TELEGRAM_REPLIES.stopped } }))
  })

  it('ignores groups, channels and updates without a message', async () => {
    const { admin, calls, send } = setup()
    expect(await handleTelegramUpdate(admin, { message: { text: `/start ${code}`, chat: { id: -100, type: 'group' } } }, { token: 'T', send })).toBe('ignored')
    expect(await handleTelegramUpdate(admin, {}, { token: 'T', send })).toBe('ignored')
    expect(await handleTelegramUpdate(admin, { message: { text: 'x', chat: { type: 'private' } } }, { token: 'T', send })).toBe('ignored')
    expect(calls).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('telegram wiring', () => {
  const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), 'utf8')

  it('the webhook checks the secret header before touching anything', () => {
    const source = read('../telegram-webhook/index.ts')
    const check = source.indexOf("secretMatches(req.headers.get('X-Telegram-Bot-Api-Secret-Token')")
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(source.indexOf('createClient('))
    expect(source).toMatch(/return jsonResponse\(\{ error: 'Unauthorized' \}, 401\)/)
  })

  it('the link function needs a signed-in user and hides itself until the bot is set up', () => {
    const source = read('../telegram-link/index.ts')
    expect(source.indexOf('auth.getUser()')).toBeLessThan(source.indexOf('SUPABASE_SERVICE_ROLE_KEY'))
    expect(source).toMatch(/'Telegram is not set up yet' \}, 503/)
  })

  it('sends host updates after the host email in each flow', () => {
    const flows: Array<[string, string, string]> = [
      ['../stripe-webhook/index.ts', 'bookingConfirmedHostSubject(', 'telegramNewBooking({'],
      ['../cancel-booking/index.ts', 'await sendCancellationEmails({', 'telegramGuestCancelled({'],
      ['../reschedule-booking/index.ts', 'await sendRescheduleEmails({', 'telegramBookingMoved({'],
    ]
    for (const [path, email, telegram] of flows) {
      const source = read(path)
      expect(source.indexOf(email), path).toBeGreaterThan(-1)
      expect(source.indexOf(telegram, source.indexOf(email)), path).toBeGreaterThan(source.indexOf(email))
    }
    expect(read('../cancel-booking/index.ts')).toMatch(/if \(options\.cancelledBy === 'guest'\) \{\s*await notifyUserTelegram/)
    expect(read('../review-emails/index.ts')).toMatch(/notifyHost: \(message\) => notifyUserTelegram\(admin, hostId, message\)/)
  })
})
