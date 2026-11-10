import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00055_review_replies.sql'),
  'utf8',
)
const checkSql = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/review_replies_check.sql'),
  'utf8',
)

describe('00055 review replies', () => {
  it('keeps the table server-only, one reply per review', () => {
    expect(migration).toMatch(/review_id uuid primary key references public\.reviews \(id\) on delete cascade/)
    expect(migration).toMatch(/char_length\(btrim\(body\)\) between 1 and 600/)
    expect(migration).toMatch(/alter table public\.review_replies enable row level security/)
    expect(migration).toMatch(/revoke all on table public\.review_replies from public, anon, authenticated/)
    expect(migration).not.toMatch(/grant [a-z, ]+ on table public\.review_replies to (anon|authenticated)/)
  })

  it('lets only the session host reply, once the review is public', () => {
    expect(migration).toMatch(/public\.review_host_id\(p_review_id\) is distinct from auth\.uid\(\)/)
    expect(migration).toMatch(/r\.role = 'guest'/)
    expect(migration).toMatch(/if not public\.review_is_public\(v_review\) then/)
  })

  it('grants writes to signed-in users and reads to everyone', () => {
    expect(migration).toMatch(
      /revoke all on function public\.reply_to_review\(uuid, text\) from public, anon;\s*grant execute on function public\.reply_to_review\(uuid, text\) to authenticated/,
    )
    expect(migration).toMatch(
      /revoke all on function public\.delete_review_reply\(uuid\) from public, anon;\s*grant execute on function public\.delete_review_reply\(uuid\) to authenticated/,
    )
    expect(migration).toMatch(
      /revoke all on function public\.review_replies\(uuid\[]\) from public;\s*grant execute on function public\.review_replies\(uuid\[]\) to anon, authenticated/,
    )
    expect(migration).toMatch(/revoke all on function public\.review_host_id\(uuid\) from public, anon, authenticated/)
  })

  it('has a rollback check covering the rules', () => {
    expect(checkSql).toMatch(/^begin;/m)
    expect(checkSql).toMatch(/^rollback;/m)
    for (const rule of [
      'no reply before the review is public',
      'another host must not reply',
      'the guest must not reply',
      'only the reply under the public review should come back',
      'clients must not touch review_replies directly',
    ]) {
      expect(checkSql).toContain(rule)
    }
  })
})
