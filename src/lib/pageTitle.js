import { useEffect } from 'react'

/**
 * Browser tab and search result titles. Static pages name theirs with a route
 * `handle: { title }` in App.jsx; pages whose title comes from data (a listing,
 * a profile) call usePageTitle once it has loaded.
 */

export const SITE_TITLE = 'TryKai — find your thing in Singapore'

/** "Terms of Service · TryKai", or the site title when there is no name. */
export function pageTitle(name) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  return trimmed ? `${trimmed} · TryKai` : SITE_TITLE
}

export function usePageTitle(name) {
  useEffect(() => {
    document.title = pageTitle(name)
  }, [name])
}

/** Ask search engines not to index this page while it is shown (Not found). */
export function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex'
    document.head.appendChild(tag)
    return () => tag.remove()
  }, [])
}
