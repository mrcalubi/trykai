import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('00040 host_sessions_held', () => {
  const sql = readFileSync(
    resolve(import.meta.dirname, '../../supabase/migrations/00040_host_sessions_held.sql'),
    'utf8',
  )

  it('counts only ended sessions with a confirmed booking', () => {
    expect(sql).toMatch(/create or replace function public\.host_sessions_held\(p_host_id uuid\)/)
    expect(sql).toMatch(/returns integer/)
    expect(sql).toMatch(
      /s\.starts_at \+ make_interval\(mins => coalesce\(s\.duration_mins, 60\)\) < now\(\)/,
    )
    expect(sql).toMatch(/b\.status = 'confirmed'/)
    expect(sql).not.toMatch(/b\.status = 'pending'/)
  })

  it('is security definer with a fixed search path', () => {
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = public/)
  })

  it('lets anon and authenticated execute it and returns only the number', () => {
    expect(sql).toMatch(/grant execute on function public\.host_sessions_held\(uuid\) to anon, authenticated/)
    expect(sql).not.toMatch(/select \*/)
    expect(sql).toMatch(/count\(\*\)::integer/)
  })
})
