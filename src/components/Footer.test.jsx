import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Footer from './Footer'
import { renderWithRouter } from '../test/render'

describe('Footer', () => {
  it.each([
    ['Refund Policy', '/refund-policy'],
    ['Cancellation Policy', '/cancellation-policy'],
    ['Dispute Policy', '/dispute-policy'],
    ['Terms', '/terms'],
    ['Privacy', '/privacy'],
  ])('links to the %s page', (name, href) => {
    renderWithRouter(<Footer />)
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
  })

  it('shows the UEN and DPO contact', () => {
    renderWithRouter(<Footer />)
    expect(screen.getByText('UEN 53526159D')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'privacy@trykai.sg' })).toHaveAttribute(
      'href',
      'mailto:privacy@trykai.sg'
    )
  })
})
