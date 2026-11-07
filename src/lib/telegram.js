import { supabase } from './supabase'

/**
 * Telegram host updates (00052).
 * null: not available here (00052 not applied, or Telegram not set up), so
 * Settings shows nothing.
 */
export async function telegramStatus() {
  try {
    const { data, error } = await supabase.rpc('my_telegram')
    if (error) return null
    return data === true
  } catch {
    return null
  }
}

/** A fresh t.me link (30 minutes), or null when Telegram is not set up. */
export async function telegramConnectLink() {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-link', {
      body: { action: 'connect' },
    })
    if (error || typeof data?.url !== 'string' || !data.url.startsWith('https://t.me/')) return null
    return data.url
  } catch {
    return null
  }
}

export async function disconnectTelegram() {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-link', {
      body: { action: 'disconnect' },
    })
    return !error && data?.connected === false
  } catch {
    return false
  }
}

// A code lasts 30 minutes; refresh a little before so the button never holds
// an expired link.
export const LINK_REFRESH_MS = 25 * 60 * 1000
