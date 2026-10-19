import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00031_booking_complaints.sql'),
  'utf8',
)

describe('00031 booking complaints', () => {
  it('lets clients read only their own complaint date, never write', () => {
    expect(migration).toMatch(/alter table public\.booking_complaints enable row level security/)
    expect(migration).toMatch(
      /revoke all on table public\.booking_complaints from public, anon, authenticated/,
    )
    expect(migration).toMatch(
      /grant select \(id, booking_id, created_at\) on table public\.booking_complaints to authenticated/,
    )
    expect(migration).not.toMatch(/grant (insert|update|delete)[^;]*booking_complaints[^;]*authenticated/)
    expect(migration).not.toMatch(/grant select \([^)]*description/)
    expect(migration).toMatch(/using \(guest_id = auth\.uid\(\)\)/)
  })

  it('keeps one complaint per booking and a private evidence bucket', () => {
    expect(migration).toMatch(/unique index if not exists booking_complaints_booking_id_key/)
    expect(migration).toMatch(/values \('complaint-evidence', 'complaint-evidence', false\)/)
    expect(migration).not.toMatch(/create policy[^;]*storage\.objects/)
  })
})
