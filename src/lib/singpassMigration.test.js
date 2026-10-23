import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00035_singpass_verification.sql'),
  'utf8',
)

describe('00035 Singpass verification', () => {
  it('keeps the Singpass identifier and name away from every client role', () => {
    expect(migration).toMatch(/add column if not exists singpass_sub text/)
    expect(migration).toMatch(/create unique index if not exists users_singpass_sub_key/)
    expect(migration).toMatch(
      /revoke select \(singpass_sub, verified_name, verified_dob, verified_mobile\),\s+insert \(singpass_sub, verified_name, verified_dob, verified_mobile\),\s+update \(singpass_sub, verified_name, verified_dob, verified_mobile\)\s+on public\.users from anon, authenticated/,
    )
    expect(migration).not.toMatch(/grant [^;]*(singpass_sub|verified_name|verified_dob|verified_mobile)[^;]*(anon|authenticated)/)
  })

  it('locks the sign-in attempts table to the service role', () => {
    expect(migration).toMatch(/alter table public\.singpass_auth_sessions enable row level security/)
    expect(migration).toMatch(/revoke all on table public\.singpass_auth_sessions from public, anon, authenticated/)
    expect(migration).toMatch(/grant select, insert, update, delete on table public\.singpass_auth_sessions to service_role/)
    expect(migration).toMatch(/add column if not exists retrieved_sub text/)
    expect(migration).toMatch(/singpass_auth_sessions_state_key/)
  })

  it('records a Singpass result only from the service role, one Singpass per account', () => {
    expect(migration).toMatch(/grant execute on function public\.record_singpass_verification\(uuid, text, text, text, text, text\) to service_role/)
    expect(migration).toMatch(/drop function if exists public\.record_singpass_verification\(uuid, text, text, text\)/)
    expect(migration).toMatch(/raise exception 'under 18'/)
    expect(migration).toMatch(/interval '18 years'/)
    expect(migration).not.toMatch(/grant execute on function public\.record_singpass_verification[^;]*authenticated/)
    expect(migration).toMatch(/raise exception 'singpass already linked'/)
    expect(migration).toMatch(/verification_method = 'singpass'/)
    expect(migration).toMatch(/verification_status = 'pending'/)
  })

  it('lets review_verification keep the singpass method', () => {
    expect(migration).toMatch(/p_method not in \('manual', 'stripe_identity', 'singpass'\)/)
    expect(migration).toMatch(/check \(method in \('manual', 'stripe_identity', 'singpass'\)\)/)
  })
})
