import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Migrations are applied by hand in number order. Two PRs once both shipped
// an 00045, which would have left one of them unapplied or applied twice.
describe('supabase migrations', () => {
  const names = readdirSync(resolve(import.meta.dirname, '../../supabase/migrations')).filter((name) =>
    name.endsWith('.sql'),
  )

  it('use a five-digit number and a name', () => {
    for (const name of names) expect(name).toMatch(/^\d{5}_[a-z0-9_]+\.sql$/)
  })

  it('never share a number', () => {
    const numbers = names.map((name) => name.slice(0, 5))
    const duplicates = numbers.filter((number, index) => numbers.indexOf(number) !== index)
    expect(duplicates).toEqual([])
  })
})
