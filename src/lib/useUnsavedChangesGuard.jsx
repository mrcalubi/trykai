import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'

/**
 * Warn before leaving a dirty form. In-app navigation uses the shared confirm
 * dialog; tab close / refresh uses the browser's beforeunload wording.
 */
export function useUnsavedChangesGuard(isDirty) {
  const dirty = Boolean(isDirty)
  const blocker = useBlocker(dirty)

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
