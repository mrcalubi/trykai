import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { supabase } from './supabase'
import { disconnectTelegram, telegramConnectLink, telegramStatus } from './telegram'

vi.mock('./supabase')

describe('telegram client helpers', () => {
  beforeEach(() => {
    supabase.__reset?.()
    supabase.rpc.mockReset()
    supabase.functions.invoke.mockReset()
  })

  it('reads my_telegram, and null when it is missing', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await telegramStatus()).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('my_telegram')
    supabase.rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await telegramStatus()).toBe(false)
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    expect(await telegramStatus()).toBeNull()
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await telegramStatus()).toBeNull()
  })

  it('returns only a t.me link', async () => {
    supabase.functions.invoke.mockResolvedValueOnce({ data: { url: 'https://t.me/Bot?start=abcDEF123_-xyz7890' }, error: null })
    expect(await telegramConnectLink()).toBe('https://t.me/Bot?start=abcDEF123_-xyz7890')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('telegram-link', { body: { action: 'connect' } })
    supabase.functions.invoke.mockResolvedValueOnce({ data: { url: 'https://evil.example' }, error: null })
    expect(await telegramConnectLink()).toBeNull()
    supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('503') })
    expect(await telegramConnectLink()).toBeNull()
    supabase.functions.invoke.mockRejectedValueOnce(new Error('offline'))
    expect(await telegramConnectLink()).toBeNull()
  })

  it('disconnects', async () => {
    supabase.functions.invoke.mockResolvedValueOnce({ data: { connected: false }, error: null })
    expect(await disconnectTelegram()).toBe(true)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('telegram-link', { body: { action: 'disconnect' } })
    supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('500') })
    expect(await disconnectTelegram()).toBe(false)
    supabase.functions.invoke.mockRejectedValueOnce(new Error('offline'))
    expect(await disconnectTelegram()).toBe(false)
  })
})
