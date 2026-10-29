import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react'
import RouteError from './RouteError'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

function Boom() {
  throw new Error('listing failed')
}

describe('RouteError', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear()
  })

  it('reports a thrown route error and links back to browse', async () => {
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <RouteError /> },
    ])

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to browse/ })).toHaveAttribute('href', '/')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(Sentry.captureException.mock.calls[0][0].message).toBe('listing failed')
  })

  it('does not report a Response thrown for an HTTP result', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => {
          throw new Response(null, { status: 404 })
        },
        element: <div>ok</div>,
        errorElement: <RouteError />,
      },
    ])

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})
