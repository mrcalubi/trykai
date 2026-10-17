import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import { firstAccountRow, loadOwnAccount } from './myAccount'

vi.mock('./supabase')

describe('loadOwnAccount', () => {
  beforeEach(() => {
    supabase.__reset()
  })

  it('uses my_account when that function returns a row', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ display_name: 'Mei', email: 'mei@example.com' }],
      error: null,
    })

    await expect(loadOwnAccount('user-1')).resolves.toEqual({
      data: { display_name: 'Mei', email: 'mei@example.com' },
      error: null,
    })
    expect(supabase.__calls('users', 'select')).toHaveLength(0)
  })

  it('reads users when my_account is not deployed yet', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.my_account without parameters in the schema cache',
      },
    })
    supabase.__on('users', 'select', {
      data: { display_name: 'Mei', full_name: 'Mei Ling', email: 'mei@example.com' },
      error: null,
    })

    const result = await loadOwnAccount('user-1')

    expect(result.error).toBeNull()
    expect(result.data).toMatchObject({ display_name: 'Mei', full_name: 'Mei Ling' })
    expect(supabase.__lastCall('users', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'id',
      value: 'user-1',
    })
  })
})

describe('firstAccountRow', () => {
  it('takes the first row of a table-valued RPC', () => {
    expect(firstAccountRow([{ email: 'mei@example.com' }])).toEqual({ email: 'mei@example.com' })
    expect(firstAccountRow({ email: 'mei@example.com' })).toEqual({ email: 'mei@example.com' })
    expect(firstAccountRow([])).toBeNull()
    expect(firstAccountRow(null)).toBeNull()
  })
})
