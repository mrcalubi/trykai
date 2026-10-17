import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import BackButton, { BackRowActions, BackSlotProvider } from './BackButton'

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
      <BackSlotProvider>
        <BackButton />
        <Routes>
        <Route path="/" element={<Pathname />} />
        <Route path="/login" element={<Pathname />} />
        <Route path="/listings/:id" element={<Pathname />} />
        </Routes>
      </BackSlotProvider>
    </MemoryRouter>
  )
}

describe('BackButton', () => {
  it('is hidden on Home', () => {
    renderApp('/')
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('is a compact circled SVG chevron aligned to the listing column', () => {
    renderApp('/listings/listing-1')
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.querySelector('svg')).toBeInTheDocument()
    expect(back).not.toHaveTextContent('‹')
    expect(back.closest('.page-back')).toHaveClass('page-back--detail')
  })

  it('centres a 36px circled chevron with space under the nav', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/\.page-back \{[\s\S]*?padding:\s*20px var\(--gutter\) 0/)
    expect(css).toMatch(
      /\.page-back__button \{[\s\S]*?display:\s*inline-flex[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center[\s\S]*?width:\s*36px[\s\S]*?height:\s*36px/
    )
  })

  it('puts optional actions on the right of the back row', () => {
    render(
      <MemoryRouter initialEntries={['/listings/listing-1']}>
        <BackSlotProvider>
          <BackButton />
          <BackRowActions>
            <span>Slot action</span>
          </BackRowActions>
        </BackSlotProvider>
      </MemoryRouter>
    )
    expect(document.querySelector('.page-back__actions')).toHaveTextContent('Slot action')
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
