import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Footer from './Footer'
import { renderWithRouter } from '../test/render'

describe('Footer', () => {
  it.each([
    ['Refund Policy', '/refund-policy'],
    ['Cancellation Policy', '/cancellation-policy'],
    ['Dispute Policy', '/dispute-policy'],
  ])('links to the %s page', (name, href) => {
    renderWithRouter(<Footer />)
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
  })

  it('exposes the policy links every listing page is required to carry', () => {
    renderWithRouter(<Footer />)
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})
