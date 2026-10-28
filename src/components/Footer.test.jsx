import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Footer from './Footer'
import { TRYKAI_SOCIALS } from '../lib/socials'
import { renderWithRouter } from '../test/render'

const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')

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

  it.each([
    ['TryKai on Instagram', TRYKAI_SOCIALS.instagram],
    ['TryKai on TikTok', TRYKAI_SOCIALS.tiktok],
  ])('opens %s in a new tab', (name, href) => {
    renderWithRouter(<Footer />)
    const link = screen.getByRole('link', { name })
    expect(link).toHaveAttribute('href', href)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('uses 36px round cream icons with a cream ring on hover and focus', () => {
    expect(css).toMatch(
      /\.site-footer__social \{[\s\S]*?width: 36px;[\s\S]*?height: 36px;[\s\S]*?color: var\(--cream\);[\s\S]*?border-radius: 50%/,
    )
    expect(css).toMatch(
      /\.site-footer__social:hover,\s*\.site-footer__social:focus-visible \{[\s\S]*?box-shadow: 0 0 0 1\.5px var\(--cream\)/,
    )
  })
})
