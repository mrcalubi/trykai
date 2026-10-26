import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, createRoutesFromElements, Link, Route, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

function GuardedPage({ dirty }) {
  const guard = useUnsavedChangesGuard(dirty)
  return (
    <div>
      {guard}
      <h1>Form</h1>
      <Link to="/away">Leave</Link>
    </div>
  )
}

function renderGuard(dirty) {
  const user = userEvent.setup({ delay: null })
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/" element={<GuardedPage dirty={dirty} />} />
        <Route path="/away" element={<h1>Away</h1>} />
      </>,
    ),
    { initialEntries: ['/'] },
  )
  const utils = render(<RouterProvider router={router} />)
  return { user, router, ...utils }
}

describe('useUnsavedChangesGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers beforeunload only while dirty', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderGuard(true)

    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    unmount()
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    add.mockClear()
    renderGuard(false)
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('asks before leaving when dirty and Escape stays', async () => {
    const { user } = renderGuard(true)

    await user.click(screen.getByRole('link', { name: 'Leave' }))
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Form' })).toBeInTheDocument()
  })
})
