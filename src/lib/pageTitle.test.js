import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pageTitle, SITE_TITLE, useNoIndex, usePageTitle } from './pageTitle'

afterEach(() => {
  document.title = ''
})

describe('pageTitle', () => {
  it('names the page, or falls back to the site title', () => {
    expect(pageTitle('Terms of Service')).toBe('Terms of Service · TryKai')
    expect(pageTitle('  Mei  ')).toBe('Mei · TryKai')
    expect(pageTitle('')).toBe(SITE_TITLE)
    expect(pageTitle(null)).toBe(SITE_TITLE)
    expect(pageTitle(undefined)).toBe(SITE_TITLE)
  })
})

describe('usePageTitle', () => {
  it('shows the site title until the name loads, then the name', () => {
    const { rerender } = renderHook(({ name }) => usePageTitle(name), { initialProps: { name: null } })
    expect(document.title).toBe(SITE_TITLE)
    rerender({ name: 'Latte art for beginners' })
    expect(document.title).toBe('Latte art for beginners · TryKai')
  })
})

describe('useNoIndex', () => {
  it('adds a robots noindex tag while mounted', () => {
    const { unmount } = renderHook(() => useNoIndex())
    expect(document.head.querySelector('meta[name="robots"]')?.content).toBe('noindex')
    unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
