import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import TopNav from './TopNav'

function renderTopNav(props = {}) {
  return render(
    <MemoryRouter>
      <TopNav {...props} />
    </MemoryRouter>
  )
}

describe('TopNav', () => {
  it('shows the brand mark, wordmark, menu control, and Log in when logged out', () => {
    renderTopNav()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TryKai home' })).toHaveAttribute('href', '/')
    expect(screen.getByText('TryKai')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })

  it('shows a person icon instead of Log in when logged in', () => {
    renderTopNav({ isLoggedIn: true })

    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Account')).toBeInTheDocument()
  })

  it('opens and closes the hamburger menu from the icon', async () => {
    const user = userEvent.setup()
    const onMenuClick = vi.fn()
    renderTopNav({ onMenuClick })

    const toggle = screen.getByRole('button', { name: 'Open menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(onMenuClick).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAccessibleName('Close menu')
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).toHaveClass(
      'ui-hamburger--open'
    )
    expect(screen.getByRole('link', { name: 'Log in or sign up' })).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('Open menu')
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).not.toHaveClass(
      'ui-hamburger--open'
    )
  })

  it('closes the menu when the backdrop is pressed', async () => {
    const user = userEvent.setup()
    renderTopNav()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = screen.getByLabelText('Main menu').closest('.ui-hamburger')
    expect(menu).toHaveClass('ui-hamburger--open')

    await user.click(within(menu).getByRole('button', { name: 'Close menu' }))
    expect(menu).not.toHaveClass('ui-hamburger--open')
  })

  it('compacts after scrolling past the threshold and expands again at the top', () => {
    renderTopNav()
    const bar = screen.getByRole('banner')

    expect(bar).not.toHaveClass('ui-topnav--compact')

    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 80 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(bar).toHaveClass('ui-topnav--compact')

    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(bar).not.toHaveClass('ui-topnav--compact')
  })
})
