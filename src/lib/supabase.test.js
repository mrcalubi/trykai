import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ marker: 'client' })),
}))

// Deliberately imports the real module rather than the manual mock: this is the
// one place where a renamed or missing VITE_ variable should be caught.
describe('supabase client', () => {
  it('is built from the Vite environment variables', async () => {
    const { supabase } = await import('./supabase')

    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    )
    expect(supabase).toEqual({ marker: 'client' })
  })

  it('reads a url and an anon key that are both present', () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBeTruthy()
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBeTruthy()
  })
})
