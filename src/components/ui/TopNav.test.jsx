import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import TopNav from './TopNav'
import { getInitials } from './getInitials'

function renderTopNav(props = {}) {
  return render(
    <MemoryRouter>
      <TopNav {...props} />
    </MemoryRouter>
  )
}

function accountButton() {
  return screen.getByRole('button', { name: 'Account' })
}

function accountFace() {
  return accountButton().querySelector('.ui-topnav__account')
}

describe('getInitials', () => {
  it('uses the first letter of the first and last words', () => {
    expect(getInitials('Mei Ling')).toBe('ML')
    expect(getInitials('  Ada  Lovelace  ')).toBe('AL')
    expect(getInitials('Kai')).toBe('K')
    expect(getInitials('')).toBe('')
  })
})

describe('TopNav', () => {
  it('shows the brand mark, wordmark, menu control, and Log in when logged out', () => {
    renderTopNav()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TryKai home' })).toHaveAttribute('href', '/')
    expect(screen.getByText('TryKai')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })

  it('shows a circular photo when logged in with avatarUrl', () => {
    renderTopNav({ isLoggedIn: true, avatarUrl: '/trykai.png', name: 'Mei Ling' })

    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
    const account = accountButton()
    expect(account).toHaveAttribute('aria-haspopup', 'menu')
    expect(account).toHaveAttribute('aria-expanded', 'false')
    expect(accountFace()).toHaveClass('ui-topnav__account--photo')
    expect(account.querySelector('img')).toHaveAttribute('src', '/trykai.png')
  })

  it('shows initials when logged in with a name but no avatarUrl', () => {
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    expect(accountFace()).toHaveClass('ui-topnav__account--initials')
    expect(accountButton()).toHaveTextContent('ML')
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

  it('closes the hamburger when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderTopNav()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).toHaveClass(
      'ui-hamburger--open'
    )

    await user.keyboard('{Escape}')
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).not.toHaveClass(
      'ui-hamburger--open'
    )
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

describe('TopNav account menu', () => {
  it('opens Settings and Log out from the avatar, with no Profile', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling', onLogout })

    const account = accountButton()
    await user.click(account)

    expect(account).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    expect(menu).toHaveAttribute('aria-labelledby', account.id)

    const settings = screen.getByRole('menuitem', { name: 'Settings' })
    expect(settings).toHaveAttribute('href', '/settings')
    expect(settings).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens on Enter and Space', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    accountButton().focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(accountButton()).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    accountButton().focus()
    await user.keyboard(' ')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('opens on ArrowDown from the avatar', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    accountButton().focus()
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus()
  })

  it('moves between items with the arrow keys', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    await user.click(accountButton())
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus()
  })

  it('closes on Tab so the next tab stop is after the avatar', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    await user.click(accountButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the avatar', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    await user.click(accountButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(accountButton()).toHaveFocus()
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on an outside click', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    await user.click(accountButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'TryKai home' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('returns focus to the avatar when the outside click is not on another control', async () => {
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    accountButton().focus()
    fireEvent.click(accountButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(accountButton()).toHaveFocus()
  })

  it('closes the hamburger when the account menu opens', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).toHaveClass(
      'ui-hamburger--open'
    )

    await user.click(accountButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).not.toHaveClass(
      'ui-hamburger--open'
    )
  })

  it('closes the account menu when the hamburger opens', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, name: 'Mei Ling' })

    await user.click(accountButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).toHaveClass(
      'ui-hamburger--open'
    )
  })
})
