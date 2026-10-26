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
    renderMenu({ open: true, isLoggedIn: true, userId: 'user-77' })

    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Become a host' })).toHaveAttribute(
      'href',
      '/verify-identity'
    )
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/u/user-77')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Log out' })).toHaveAttribute('href', '/logout')
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create listing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in or sign up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Verification review' })).not.toBeInTheDocument()
    const labels = [...document.querySelectorAll('.ui-hamburger__link')].map((el) => el.textContent)
    expect(labels.at(-1)).toBe('Log out')
    expect(document.querySelector('.ui-hamburger__item--logout')).toHaveTextContent('Log out')
  })

  it('labels Host a session for a verified host and does not add Hosting', () => {
    renderMenu({
      open: true,
      isLoggedIn: true,
      verificationStatus: 'approved',
      userId: 'user-77',
    })

    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Host a session' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/u/user-77')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Log out' })).toHaveAttribute('href', '/logout')
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Become a host' })).not.toBeInTheDocument()
  })

  it('sends a pending host to the verification status page', () => {
    renderMenu({ open: true, isLoggedIn: true, verificationStatus: 'pending' })

    expect(screen.getByRole('link', { name: 'Become a host' })).toHaveAttribute(
      'href',
      '/verify-identity'
    )
    expect(screen.queryByRole('link', { name: 'Host a session' })).not.toBeInTheDocument()
  })

  it('offers verification review only to an admin', () => {
    renderMenu({ open: true, isLoggedIn: true, isAdmin: true })

    expect(screen.getByRole('link', { name: 'Verification review' })).toHaveAttribute(
      'href',
      '/admin/verifications'
    )
    expect(screen.getByRole('link', { name: 'Listing review' })).toHaveAttribute(
      'href',
      '/admin/listings'
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

  it('closes when Log out is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderMenu({ open: true, isLoggedIn: true, userId: 'user-77', onClose })

    await user.click(screen.getByRole('link', { name: 'Log out' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
