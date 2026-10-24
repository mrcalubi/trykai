import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PageLoader, { PAGE_LOADER_DELAY_MS } from './PageLoader'

describe('PageLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exposes a status immediately and hides the spinner before 400ms', () => {
    render(<PageLoader />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(document.querySelector('.tk-spinner')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(PAGE_LOADER_DELAY_MS - 1)
    })
    expect(document.querySelector('.tk-spinner')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(document.querySelector('.tk-spinner')).toBeInTheDocument()
  })
})
