import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import { marketingOptIn, setMarketingOptIn, unsubscribeByToken } from './marketing'

vi.mock('./supabase')

const TOKEN = '3f2b8a52-1c9d-4e7a-9b1f-0a2c4d6e8f10'

describe('marketing helpers', () => {
  beforeEach(() => {
    supabase.rpc.mockReset()
  })

  it('reads the choice, null when the migration is missing', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await marketingOptIn()).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('my_marketing_opt_in')
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    expect(await marketingOptIn()).toBeNull()
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await marketingOptIn()).toBeNull()
  })

  it('saves the choice', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await setMarketingOptIn(false)).toBe(false)
    expect(supabase.rpc).toHaveBeenCalledWith('set_marketing_opt_in', { p_opt_in: false })
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect(await setMarketingOptIn(true)).toBeNull()
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await setMarketingOptIn(true)).toBeNull()
  })

  it('unsubscribes by token without calling for a malformed one', async () => {
    expect(await unsubscribeByToken('not-a-token')).toBe('invalid')
    expect(await unsubscribeByToken(null)).toBe('invalid')
    expect(supabase.rpc).not.toHaveBeenCalled()
    supabase.rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await unsubscribeByToken(TOKEN)).toBe('done')
    expect(supabase.rpc).toHaveBeenCalledWith('unsubscribe_marketing', { p_token: TOKEN })
    supabase.rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await unsubscribeByToken(TOKEN)).toBe('invalid')
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect(await unsubscribeByToken(TOKEN)).toBe('error')
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await unsubscribeByToken(TOKEN)).toBe('error')
  })
})
