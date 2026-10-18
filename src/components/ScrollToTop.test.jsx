import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import ScrollToTop from './ScrollToTop'

function Home() {
  const [params, setParams] = useSearchParams()
  return (
    <div>
      <h1>Find a session in Singapore</h1>
      <p>category {params.get('category') || 'All'}</p>
      <Link to="/login">Log in</Link>
      <button
        type="button"
        onClick={() => setParams({ category: 'Music' }, { replace: true })}
      >
        Music
      </button>
    </div>
  )
}

function Login() {
  const navigate = useNavigate()
  return (
    <div>
      <h1>Welcome back</h1>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  )
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScrollToTop', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('scrolls on a new route, not on back or a same-path filter', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(window.scrollTo).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'Log in' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)

    window.scrollTo.mockClear()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(
      await screen.findByRole('heading', { name: 'Find a session in Singapore' }),
    ).toBeInTheDocument()
    expect(window.scrollTo).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Music' }))
    expect(screen.getByText('category Music')).toBeInTheDocument()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
