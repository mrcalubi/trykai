import { describe, expect, it } from 'vitest'
import { firstAccountRow } from './myAccount'

describe('firstAccountRow', () => {
  it('takes the first row of a table-valued RPC', () => {
    expect(firstAccountRow([{ email: 'mei@example.com' }])).toEqual({ email: 'mei@example.com' })
    expect(firstAccountRow({ email: 'mei@example.com' })).toEqual({ email: 'mei@example.com' })
    expect(firstAccountRow([])).toBeNull()
    expect(firstAccountRow(null)).toBeNull()
  })
})
