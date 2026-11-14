import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'

/**
 * Warn before leaving a dirty form. In-app navigation uses the shared confirm
 * dialog; tab close / refresh uses the browser's beforeunload wording.
 *
 * `samePageOk`: moving within the same page (only the ?query changes, like
 * Edit listing's sections) keeps the edits in memory, so it is not a leave.
 */
export function useUnsavedChangesGuard(isDirty, { samePageOk = false } = {}) {
  const dirty = Boolean(isDirty)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!dirty) return false
    if (samePageOk && currentLocation.pathname === nextLocation.pathname) return false
    return true
  })

  useEffect(() => {
    if (!dirty) return undefined

    function onBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  if (blocker.state !== 'blocked') return null

  return (
    <UnsavedChangesDialog
      onKeepEditing={() => blocker.reset?.()}
      onDiscard={() => blocker.proceed?.()}
    />
  )
}
