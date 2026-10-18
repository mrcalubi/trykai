import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_PRICE_PER_PERSON_CENTS, parsePriceInputCents } from './pricing'

function read(path) {
  return readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8')
}

const suspension = read('supabase/migrations/00027_hide_suspended_hosts.sql')
const ceiling = read('supabase/migrations/00028_listing_price_ceiling.sql')
const checkout = read('supabase/functions/create-payment-intent/index.ts')

describe('00027 suspended hosts', () => {
  it('hides a suspended host from the public listings read', () => {
    expect(suspension).toMatch(/drop policy if exists "Anyone can view active listings" on public\.listings/)
    expect(suspension).toMatch(
      /create policy "Anyone can view active listings" on public\.listings\s+for select\s+using \(is_active = true and public\.listing_host_in_good_standing\(id\)\)/,
    )
  })

  it('asks by listing id through a security-definer function', () => {
    expect(suspension).toMatch(/create or replace function public\.listing_host_in_good_standing\(listing_id uuid\)/)
    expect(suspension).toMatch(/security definer/)
    expect(suspension).toMatch(/set search_path = public/)
    expect(suspension).toMatch(/not u\.is_suspended/)
    expect(suspension).not.toMatch(/grant select \([^)]*is_suspended/)
  })

  it('refuses checkout for a suspended host', () => {
    expect(checkout).toMatch(/if \(!host\?\.stripe_payouts_enabled \|\| host\?\.is_suspended\)/)
  })
})

describe('00028 price ceiling', () => {
  it('matches the client ceiling', () => {
    expect(ceiling).toMatch(
      new RegExp(`check \\(price_per_person <= ${MAX_PRICE_PER_PERSON_CENTS}\\) not valid`),
    )
  })

  it('accepts the ceiling and rejects anything above it', () => {
    expect(parsePriceInputCents(String(MAX_PRICE_PER_PERSON_CENTS / 100))).toBe(MAX_PRICE_PER_PERSON_CENTS)
    expect(parsePriceInputCents('500.01')).toBeNull()
    expect(parsePriceInputCents('7580')).toBeNull()
  })
})
