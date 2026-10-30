import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { clearBrowseCache } from '../lib/browseCache'

// jsdom does not implement the object URL APIs that the photo pickers rely on.
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url')
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = vi.fn()
}

// ScrollRestoration calls window.scrollTo; jsdom only logs "Not implemented".
window.scrollTo = () => {}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  clearBrowseCache()
  // Per-tab drafts (e.g. Add sessions) must not leak from one test into the next.
  window.sessionStorage.clear()
})
