import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'

function LocationProbe() {
  const location = useLocation()
  return (
    <div
      data-testid="location-probe"
      data-pathname={location.pathname}
      data-search={location.search}
      data-state={JSON.stringify(location.state ?? null)}
    />
  )
}

/**
 * Renders a page inside a MemoryRouter and exposes helpers for asserting on
 * navigation, which most of these pages perform as their success path.
 *
 * @param ui             element under test
 * @param route          initial URL, including any query string
 * @param path           route pattern the element is mounted at (defaults to a catch-all)
 * @param withFakeTimers wires userEvent to Vitest's fake timers
 */
export function renderWithRouter(
  ui,
  { route = '/', path = '*', withFakeTimers = false } = {}
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
      <LocationProbe />
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
