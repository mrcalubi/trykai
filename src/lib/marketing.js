import { supabase } from './supabase'

/** Your own marketing email choice, or null when 00054 is not applied. */
export async function marketingOptIn() {
  try {
    const { data, error } = await supabase.rpc('my_marketing_opt_in')
    if (error) return null
    return data === true
  } catch {
    return null
  }
}

/** Saves the choice. Returns the saved value, or null on failure. */
export async function setMarketingOptIn(optIn) {
  try {
    const { data, error } = await supabase.rpc('set_marketing_opt_in', { p_opt_in: Boolean(optIn) })
    if (error) return null
    return data === true
  } catch {
    return null
  }
}

const TOKEN_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 'done' | 'invalid' | 'error' for the link in a marketing email. */
export async function unsubscribeByToken(token) {
  if (!TOKEN_SHAPE.test(String(token ?? ''))) return 'invalid'
  try {
    const { data, error } = await supabase.rpc('unsubscribe_marketing', { p_token: token })
    if (error) return 'error'
    return data === true ? 'done' : 'invalid'
  } catch {
    return 'error'
  }
}
