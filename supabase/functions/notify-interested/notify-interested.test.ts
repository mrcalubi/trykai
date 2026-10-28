import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8')

describe('notify-interested payouts gate', () => {
  it('returns payouts_not_enabled before marking anyone notified', () => {
    const skipAt = source.indexOf('keenNotifySkip')
    const markAt = source.indexOf('update({ notified_at:')
    expect(source).toContain("select('stripe_payouts_enabled')")
    expect(skipAt).toBeGreaterThan(-1)
    expect(markAt).toBeGreaterThan(skipAt)
  })
})
