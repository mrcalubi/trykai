import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReportLink from './ReportLink'

describe('ReportLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is muted text, not a button, and opens the report mailto', () => {
    vi.stubGlobal('location', { href: 'https://trykai.sg/listings/listing-1' })
    const { container } = render(
      <ReportLink subject="Report: listing Latte art" itemId="listing-1" />
    )

    const link = screen.getByRole('link', { name: 'Report' })
    expect(link).toHaveClass('report-link')
    expect(link.getAttribute('href')).toContain('mailto:hello@trykai.sg')
    expect(link.getAttribute('href')).toContain(encodeURIComponent('Report: listing Latte art'))
    expect(link.getAttribute('href')).toContain(encodeURIComponent('listing-1'))
    expect(container.querySelector('button')).not.toBeInTheDocument()
  })
})
