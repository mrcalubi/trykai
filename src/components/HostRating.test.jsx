import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HostRating from './HostRating'

describe('HostRating', () => {
  it('puts a star in --star before the average and review count', () => {
    const { container } = render(
      <HostRating reviews={[{ rating: 5 }, { rating: 3 }, { rating: 1 }]} />
    )

    expect(container.querySelector('.detail-host__rating').textContent.replace(/\s+/g, ' ').trim()).toBe(
      '★ 3.0 · 3 reviews'
    )
    expect(container.querySelector('.detail-host__star')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.detail-host__star').textContent).toBe('★')
  })

  it('uses the singular when there is one review', () => {
    const { container } = render(<HostRating reviews={[{ rating: 5 }]} />)
    expect(container.querySelector('.detail-host__rating').textContent.replace(/\s+/g, ' ').trim()).toBe(
      '★ 5.0 · 1 review'
    )
  })

  it('renders nothing when the host has no reviews', () => {
    const { container, rerender } = render(<HostRating reviews={[]} />)
    expect(container.querySelector('.detail-host__rating')).not.toBeInTheDocument()
    rerender(<HostRating reviews={null} />)
    expect(container.querySelector('.detail-host__rating')).not.toBeInTheDocument()
  })

  it('colours only the star with --star', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/\.detail-host__star \{[\s\S]*?color:\s*var\(--star\)/)
  })
})
