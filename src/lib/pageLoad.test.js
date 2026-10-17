import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PAGE_LOAD_ERROR,
  isIssuedAtFutureError,
  pageLoadErrorMessage,
  withIssuedAtRetry,
} from './pageLoad'

describe('pageLoad', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('recognises the JWT clock-skew error', () => {
    expect(isIssuedAtFutureError({ message: 'JWT issued at future' })).toBe(true)
    expect(isIssuedAtFutureError({ message: 'network down' })).toBe(false)
    expect(isIssuedAtFutureError(null)).toBe(false)
  })

  it('never returns the raw error text', () => {
    expect(pageLoadErrorMessage({ message: 'JWT issued at future' })).toBe(PAGE_LOAD_ERROR)
    expect(pageLoadErrorMessage({ message: 'network down' })).toBe(PAGE_LOAD_ERROR)
    expect(pageLoadErrorMessage(null)).toBe('')
  })

  it('retries an issued-at-future error once after a second', async () => {
    vi.useFakeTimers()
    const load = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'JWT issued at future' } })
      .mockResolvedValueOnce({ data: [{ id: '1' }], error: null })

    const pending = withIssuedAtRetry(load)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(pending).resolves.toEqual({ data: [{ id: '1' }], error: null })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not retry other errors', async () => {
    const load = vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } })
    await expect(withIssuedAtRetry(load)).resolves.toEqual({
      data: null,
      error: { message: 'network down' },
    })
    expect(load).toHaveBeenCalledTimes(1)
  })
})
