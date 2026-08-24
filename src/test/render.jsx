import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'

function LocationProbe({ pinnedPathname }) {
  const location = useLocation()

  // A page mounted at the catch-all survives its own redirects, which App.jsx
  // never allows, and that hides bugs in whatever the page does on the way out.
  if (pinnedPathname && location.pathname !== pinnedPathname) {
    throw new Error(
      `renderWithRouter: the element is mounted at the catch-all route but the app ` +
        `navigated from "${pinnedPathname}" to "${location.pathname}", so it stayed ` +
        `mounted where the real router would have unmounted it. Pass \`path\` to match ` +
        `the route in App.jsx, or \`outlivesNavigation: true\` if the element really is ` +
        `chrome that spans routes.`
    )
  }

  return (
    <div
      data-testid="location-probe"
      data-pathname={location.pathname}
      data-search={location.search}
      data-state={JSON.stringify(location.state ?? null)}
    />
  )
}

function pathnameOf(route) {
  const pathname = typeof route === 'string' ? route : route.pathname
  return pathname.split(/[?#]/)[0]
}

/**
 * Renders a page inside a MemoryRouter and exposes helpers for asserting on
 * navigation, which most of these pages perform as their success path.
 *
 * @param ui                 element under test
 * @param route              initial URL, including any query string
 * @param path               route pattern the element is mounted at (defaults to a catch-all)
 * @param outlivesNavigation element is chrome that stays mounted across routes
 * @param withFakeTimers     wires userEvent to Vitest's fake timers
 */
export function renderWithRouter(
  ui,
  { route = '/', path = '*', outlivesNavigation = false, withFakeTimers = false } = {}
) {
  const user = userEvent.setup({
    // Typing character-by-character in real time dominates the suite's runtime
    // and buys nothing here, since none of these forms debounce input.
    delay: null,
    ...(withFakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {}),
  })

  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
      <LocationProbe
        pinnedPathname={path === '*' && !outlivesNavigation ? pathnameOf(route) : null}
      />
    </MemoryRouter>
  )

  return {
    user,
    ...utils,
    currentPath: () => screen.getByTestId('location-probe').dataset.pathname,
    currentSearch: () => screen.getByTestId('location-probe').dataset.search,
    currentState: () => JSON.parse(screen.getByTestId('location-probe').dataset.state),
  }
}
