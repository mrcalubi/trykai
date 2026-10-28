import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRYKAI_SOCIALS } from './socials'

const email = readFileSync(
  resolve(import.meta.dirname, '../../supabase/functions/_shared/email.ts'),
  'utf8',
)

describe('TRYKAI_SOCIALS', () => {
  it('matches the Edge Function copy', () => {
    expect(email).toContain(`instagram: '${TRYKAI_SOCIALS.instagram}'`)
    expect(email).toContain(`tiktok: '${TRYKAI_SOCIALS.tiktok}'`)
  })
})
