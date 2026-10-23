import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00034_verification_teaching_plan.sql'),
  'utf8',
)

describe('00034 teaching plan', () => {
  it('keeps the new column away from every client role', () => {
    expect(migration).toMatch(/add column if not exists teaching_plan text/)
    expect(migration).toMatch(
      /revoke select \(teaching_plan\), insert \(teaching_plan\), update \(teaching_plan\)\s+on public\.users from anon, authenticated/,
    )
    expect(migration).not.toMatch(/grant [^;]*teaching_plan/)
    expect(migration).toMatch(/char_length\(teaching_plan\) <= 600/)
  })

  it('replaces submit_verification with a fourth argument that old pages can leave out', () => {
    expect(migration).toMatch(/drop function if exists public\.submit_verification\(text, text, boolean\)/)
    expect(migration).toMatch(/p_teaching_plan text default null/)
    expect(migration).toMatch(
      /grant execute on function public\.submit_verification\(text, text, boolean, text\) to authenticated/,
    )
    expect(migration).not.toMatch(/grant execute on function public\.submit_verification[^;]*anon/)
    expect(migration).toMatch(/v_status not in \('unverified', 'rejected'\)/)
  })
})
