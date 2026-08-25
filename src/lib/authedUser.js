import { createContext, useContext } from 'react'

/**
 * The id of the signed-in user, published by `RequireAuth`.
 *
 * This lives apart from the component so that `RequireAuth.jsx` exports nothing
 * but its component, which is what fast refresh needs to reload it cleanly.
 */
export const AuthedUserContext = createContext(null)

export function useAuthedUserId() {
  const userId = useContext(AuthedUserContext)

  if (!userId) {
    throw new Error('useAuthedUserId() requires an ancestor <RequireAuth>.')
  }

  return userId
}
