import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom does not implement the object URL APIs that the photo pickers rely on.
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url')
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = vi.fn()
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
