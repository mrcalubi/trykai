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
    expect(screen.getByRole('link', { name: 'Cancellation policy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Refund policy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dispute policy' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
  })

  it('shows logged-in links including Log out', () => {
    renderMenu({ open: true, isLoggedIn: true })

    expect(screen.getByRole('link', { name: 'Browse' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Create listing' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in or sign up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Verification review' })).not.toBeInTheDocument()
  })

  it('offers verification review only to an admin', () => {
    renderMenu({ open: true, isLoggedIn: true, isAdmin: true })

    expect(screen.getByRole('link', { name: 'Verification review' })).toHaveAttribute(
      'href',
      '/admin/verifications'
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
