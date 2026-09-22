import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import HamburgerMenu from './HamburgerMenu'

function renderMenu(props = {}) {
  return render(
    <MemoryRouter>
      <HamburgerMenu onClose={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

describe('HamburgerMenu', () => {
  it('shows logged-out links when closed or open', () => {
    renderMenu({ open: true, isLoggedIn: false })

    expect(screen.getByRole('link', { name: 'Log in or sign up' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Cancellation policy' })).toHaveAttribute(
      'href',
      '/cancellation-policy'
    )
    expect(screen.getByRole('link', { name: 'Refund policy' })).toHaveAttribute(
      'href',
      '/refund-policy'
    )
    expect(screen.getByRole('link', { name: 'Dispute policy' })).toHaveAttribute(
      'href',
      '/dispute-policy'
    )
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create listing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Become a host' })).not.toBeInTheDocument()
  })

  it('shows navigation-only links for a signed-in guest', () => {
    renderMenu({ open: true, isLoggedIn: true })

    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/bookings')
    expect(screen.getByRole('link', { name: 'Become a host' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create listing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log out' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in or sign up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Verification review' })).not.toBeInTheDocument()
  })

  it('adds Hosting and labels Create listing for a host', () => {
    renderMenu({ open: true, isLoggedIn: true, isHost: true })

    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/bookings')
    expect(screen.getByRole('link', { name: 'Hosting' })).toHaveAttribute('href', '/hosting')
    expect(screen.getByRole('link', { name: 'Create listing' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.queryByRole('link', { name: 'Become a host' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('offers verification review only to an admin', () => {
    renderMenu({ open: true, isLoggedIn: true, isAdmin: true })

    expect(screen.getByRole('link', { name: 'Verification review' })).toHaveAttribute(
      'href',
      '/admin/verifications'
    )
  })

  it('keeps links out of the tab order while closed', () => {
    renderMenu({ open: false, isLoggedIn: false })

    expect(screen.getByRole('link', { name: 'Browse', hidden: true })).toHaveAttribute(
      'tabIndex',
      '-1'
    )
    expect(screen.getByRole('button', { name: 'Close menu', hidden: true })).toHaveAttribute(
      'tabIndex',
      '-1'
    )
  })

  it('closes when the dimmed backdrop is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderMenu({ open: true, onClose })

    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when a link is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderMenu({ open: true, onClose })

    await user.click(screen.getByRole('link', { name: 'Browse' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
