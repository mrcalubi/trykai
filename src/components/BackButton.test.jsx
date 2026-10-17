import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import BackButton from './BackButton'

function Pathname() {
  const location = useLocation()
  return (
    <div>
      <p>{location.pathname}</p>
      <Link to="/listings/listing-1">Open listing</Link>
    </div>
  )
}

function renderApp(route = '/login') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BackButton />
      <Routes>
        <Route path="/" element={<Pathname />} />
        <Route path="/login" element={<Pathname />} />
        <Route path="/listings/:id" element={<Pathname />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('BackButton', () => {
  it('is hidden on Home', () => {
    renderApp('/')
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('is a compact circled chevron aligned to the listing column', async () => {
    renderApp('/listings/listing-1')
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back).toHaveTextContent('‹')
    expect(back.closest('.page-back')).toHaveClass('page-back--detail')
  })

  it('narrows to the policy column on policy pages', () => {
    render(
      <MemoryRouter initialEntries={['/cancellation-policy']}>
        <BackButton />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: 'Back' }).closest('.page-back')).toHaveClass(
      'page-back--narrow'
    )
  })

  it('goes to Home when there is no in-app previous page', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('/')).toBeInTheDocument()
  })

  it('uses browser history when there is an in-app previous page', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.click(screen.getByRole('link', { name: 'Open listing' }))
    expect(screen.getByText('/listings/listing-1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('/login')).toBeInTheDocument()
  })
})
