import { useEffect, useRef } from 'react'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNavigate } from 'react-router-dom'
import { renderWithRouter } from './render'

/** Stands in for a page that redirects as soon as it mounts, like an auth guard. */
function RedirectsOnMount({ to }) {
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    navigate(to, { replace: true })
  }, [navigate, to])

  return null
}

describe('renderWithRouter route pinning', () => {
  it('rejects a redirecting element left on the catch-all route', () => {
    // React logs the render failure itself, which is noise next to the assertion.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      renderWithRouter(<RedirectsOnMount to="/login" />, { route: '/dashboard' })
    ).toThrow(/mounted at the catch-all route/)

    consoleError.mockRestore()
  })

  it('accepts a pinned route, where the redirect unmounts the element', () => {
    const { currentPath } = renderWithRouter(<RedirectsOnMount to="/login" />, {
      route: '/dashboard',
      path: '/dashboard',
    })

    expect(currentPath()).toBe('/login')
  })

  it('accepts chrome that is meant to span routes', () => {
    const { currentPath } = renderWithRouter(<RedirectsOnMount to="/login" />, {
      route: '/dashboard',
      outlivesNavigation: true,
    })

    expect(currentPath()).toBe('/login')
    expect(screen.getByTestId('location-probe')).toBeInTheDocument()
  })
})
