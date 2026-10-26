import { describe, expect, it, vi } from 'vitest'
import { ACCOUNT_UPDATED_EVENT, firstAccountRow, notifyAccountUpdated } from './myAccount'

describe('firstAccountRow', () => {
  it('takes the first row of a table-valued RPC', () => {
    expect(firstAccountRow([{ email: 'mei@example.com' }])).toEqual({ email: 'mei@example.com' })
    expect(firstAccountRow({ email: 'mei@example.com' })).toEqual({ email: 'mei@example.com' })
    expect(firstAccountRow([])).toBeNull()
    expect(firstAccountRow(null)).toBeNull()
  })
})

describe('notifyAccountUpdated', () => {
  it('dispatches trykai:account-updated on window', () => {
    const heard = vi.fn()
    window.addEventListener(ACCOUNT_UPDATED_EVENT, heard)
    notifyAccountUpdated()
    expect(heard).toHaveBeenCalledOnce()
    expect(heard.mock.calls[0][0]).toBeInstanceOf(CustomEvent)
    expect(heard.mock.calls[0][0].type).toBe('trykai:account-updated')
    window.removeEventListener(ACCOUNT_UPDATED_EVENT, heard)
  })
})
