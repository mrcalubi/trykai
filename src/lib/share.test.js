import { afterEach, describe, expect, it, vi } from 'vitest'
import { SHARE_NOTES, shareOrCopy } from './share'

const link = { url: 'https://trykai.sg/listings/abc', title: 'Latte art' }

function abortError() {
  const error = new Error('cancelled')
  error.name = 'AbortError'
  return error
}

afterEach(() => {
  vi.restoreAllMocks()
  delete document.execCommand
})

describe('shareOrCopy', () => {
  it('uses the share sheet when it works', async () => {
    const nav = { share: vi.fn().mockResolvedValue(undefined), clipboard: { writeText: vi.fn() } }
    await expect(shareOrCopy(link, nav)).resolves.toBe('shared')
    expect(nav.share).toHaveBeenCalledWith({ title: 'Latte art', url: link.url })
    expect(nav.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('does nothing when the user closes the share sheet', async () => {
    const nav = { share: vi.fn().mockRejectedValue(abortError()), clipboard: { writeText: vi.fn() } }
    await expect(shareOrCopy(link, nav)).resolves.toBe('cancelled')
    expect(nav.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('copies the link when share throws anything else', async () => {
    const notAllowed = Object.assign(new Error('no'), { name: 'NotAllowedError' })
    const nav = {
      share: vi.fn().mockRejectedValue(notAllowed),
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    }
    await expect(shareOrCopy(link, nav)).resolves.toBe('copied')
    expect(nav.clipboard.writeText).toHaveBeenCalledWith(link.url)
  })

  it('copies the link when there is no share sheet', async () => {
    const nav = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }
    await expect(shareOrCopy(link, nav)).resolves.toBe('copied')
  })

  it('falls back to execCommand when the clipboard refuses', async () => {
    document.execCommand = vi.fn().mockReturnValue(true)
    const nav = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } }
    await expect(shareOrCopy(link, nav)).resolves.toBe('copied')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back to execCommand when there is no clipboard API', async () => {
    document.execCommand = vi.fn().mockReturnValue(true)
    await expect(shareOrCopy(link, {})).resolves.toBe('copied')
  })

  it('reports failure when every copy path fails', async () => {
    document.execCommand = vi.fn().mockReturnValue(false)
    await expect(shareOrCopy(link, {})).resolves.toBe('failed')
  })

  it('reports failure when execCommand throws', async () => {
    document.execCommand = vi.fn(() => {
      throw new Error('blocked')
    })
    await expect(shareOrCopy(link, undefined)).resolves.toBe('failed')
  })

  it('reports failure when execCommand is unavailable', async () => {
    await expect(shareOrCopy(link, {})).resolves.toBe('failed')
  })

  it('has a note for copied and failed, none for shared or cancelled', () => {
    expect(SHARE_NOTES.copied).toBe('Link copied')
    expect(SHARE_NOTES.failed).toMatch(/address bar/)
    expect(SHARE_NOTES.shared).toBeUndefined()
    expect(SHARE_NOTES.cancelled).toBeUndefined()
  })
})
