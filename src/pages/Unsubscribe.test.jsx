import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Unsubscribe from './Unsubscribe'
import * as marketing from '../lib/marketing'

vi.mock('../lib/marketing', () => ({ unsubscribeByToken: vi.fn() }))

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/unsubscribe" element={<Unsubscribe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Unsubscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('unsubscribes with the token from the link', async () => {
    marketing.unsubscribeByToken.mockResolvedValue('done')
    renderAt('/unsubscribe?t=abc')
    expect(screen.getByRole('heading', { name: 'Unsubscribing…' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: "You're unsubscribed" })).toBeInTheDocument()
    expect(marketing.unsubscribeByToken).toHaveBeenCalledWith('abc')
    expect(screen.getByText(/Booking emails and reminders still come/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('explains an expired link and an error', async () => {
    marketing.unsubscribeByToken.mockResolvedValue('invalid')
    const { unmount } = renderAt('/unsubscribe')
    expect(await screen.findByRole('heading', { name: 'That link has expired' })).toBeInTheDocument()
    unmount()
    marketing.unsubscribeByToken.mockResolvedValue('error')
    renderAt('/unsubscribe?t=abc')
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  })
})
