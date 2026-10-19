import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('shared select chevron', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')

  it('uses one SVG chevron 16px from the right on every select', () => {
    expect(css).toMatch(/--select-chevron:\s*url\("data:image\/svg\+xml/)
    expect(css).toMatch(
      /select,\s*select\.input \{[^}]*appearance:\s*none;[^}]*background-position:\s*right 16px center;[^}]*padding-right:\s*42px;/,
    )
    expect(css).toMatch(/\.filter-area \{[^}]*background-position:\s*right 16px center;/)
  })
})
