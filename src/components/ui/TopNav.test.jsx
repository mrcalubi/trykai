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

function profileLink() {
  return screen.getByRole('link', { name: 'Your profile' })
}

function accountFace() {
  return profileLink().querySelector('.ui-topnav__account')
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

  it('links the avatar to the own profile when logged in with avatarUrl', () => {
    renderTopNav({
      isLoggedIn: true,
      userId: 'user-77',
      avatarUrl: '/trykai.png',
      name: 'Mei Ling',
    })

    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
    expect(profileLink()).toHaveAttribute('href', '/u/user-77')
    expect(accountFace()).toHaveClass('ui-topnav__account--photo')
    const photo = profileLink().querySelector('img')
    expect(photo).toHaveAttribute('src', '/trykai.png')
    expect(photo).toHaveStyle({ width: '100%', height: '100%' })
    expect(photo.getAttribute('style') ?? '').not.toMatch(/36px/)
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows initials when logged in with a name but no avatarUrl', () => {
    renderTopNav({ isLoggedIn: true, userId: 'user-77', name: 'Mei Ling' })

    expect(accountFace()).toHaveClass('ui-topnav__account--initials')
    expect(profileLink()).toHaveTextContent('M')
    const face = accountFace().querySelector('.ui-avatar')
    expect(face).toHaveStyle({ width: '100%', height: '100%' })
    expect(face.getAttribute('style') ?? '').not.toMatch(/36px/)
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
    expect(toggle).toHaveTextContent('✕')
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).toHaveClass(
      'ui-hamburger--open'
    )
    expect(screen.getByRole('link', { name: 'Log in or sign up' })).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('Open menu')
    expect(toggle).not.toHaveTextContent('✕')
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

  it('closes the hamburger when the route changes', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <TopNav />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).toHaveClass(
      'ui-hamburger--open'
    )

    await user.click(screen.getByRole('link', { name: 'TryKai home' }))
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).not.toHaveClass(
      'ui-hamburger--open'
    )
  })

  it('closes the hamburger when the avatar is pressed', async () => {
    const user = userEvent.setup()
    renderTopNav({ isLoggedIn: true, userId: 'user-77', name: 'Mei Ling' })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByLabelText('Main menu').closest('.ui-hamburger')).toHaveClass(
      'ui-hamburger--open'
    )

    await user.click(profileLink())
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

  describe('on phones', () => {
    function scrollTo(y) {
      act(() => {
        Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
        window.dispatchEvent(new Event('scroll'))
      })
    }

    function withPhone(matches = true) {
      const original = window.matchMedia
      window.matchMedia = vi.fn(() => ({ matches }))
      return () => {
        window.matchMedia = original
      }
    }

    it('slides away while scrolling down and comes back on any scroll up', () => {
      const restore = withPhone()
      scrollTo(0)
      renderTopNav()
      const shell = screen.getByRole('banner').parentElement

      scrollTo(100)
      expect(shell).not.toHaveClass('ui-topnav-shell--hidden')
      scrollTo(400)
      expect(shell).toHaveClass('ui-topnav-shell--hidden')
      scrollTo(403)
      expect(shell).toHaveClass('ui-topnav-shell--hidden')
      scrollTo(380)
      expect(shell).not.toHaveClass('ui-topnav-shell--hidden')
      scrollTo(600)
      expect(shell).toHaveClass('ui-topnav-shell--hidden')
      scrollTo(60)
      expect(shell).not.toHaveClass('ui-topnav-shell--hidden')
      restore()
      scrollTo(0)
    })

    it('stays put while the menu is open or the keyboard is in the bar', async () => {
      const restore = withPhone()
      scrollTo(0)
      renderTopNav()
      const shell = screen.getByRole('banner').parentElement
      scrollTo(500)
      expect(shell).toHaveClass('ui-topnav-shell--hidden')

      act(() => {
        screen.getByRole('button', { name: 'Open menu' }).focus()
      })
      expect(shell).not.toHaveClass('ui-topnav-shell--hidden')
      act(() => {
        screen.getByRole('button', { name: 'Open menu' }).blur()
      })
      expect(shell).toHaveClass('ui-topnav-shell--hidden')

      await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
      act(() => {
        document.activeElement.blur()
      })
      expect(shell).not.toHaveClass('ui-topnav-shell--hidden')
      restore()
      scrollTo(0)
    })

    it('never hides on wider screens', () => {
      const restore = withPhone(false)
      scrollTo(0)
      renderTopNav()
      const shell = screen.getByRole('banner').parentElement
      scrollTo(500)
      scrollTo(900)
      expect(shell).not.toHaveClass('ui-topnav-shell--hidden')
      restore()
      scrollTo(0)
    })
  })
})
