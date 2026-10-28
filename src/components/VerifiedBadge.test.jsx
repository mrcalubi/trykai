import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import VerifiedBadge, { VERIFIED_BADGE_LABEL } from './VerifiedBadge'

describe('VerifiedBadge', () => {
  it('shows the shield-with-tick before ID verified', () => {
    const { container } = render(<VerifiedBadge />)
    expect(screen.getByText(VERIFIED_BADGE_LABEL)).toBeInTheDocument()
    expect(container.querySelector('.ui-icon')).toBeInTheDocument()
    expect(VERIFIED_BADGE_LABEL).toBe('ID verified')
  })

  it('uses the homepage trust-pill icon colour', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/\.trust-list__item \.ui-icon \{[\s\S]*?color:\s*var\(--coral-ink\)/)
    expect(css).toMatch(/\.verified-badge \.ui-icon \{[\s\S]*?color:\s*var\(--coral-ink\)/)
  })
})
