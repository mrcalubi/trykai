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
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { global: { fetch: expect.any(Function) } },
    )
    expect(supabase).toEqual({ marker: 'client' })
  })

  it('never lets the browser cache an API response', async () => {
    const { noStoreFetch } = await import('./supabase')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

    await noStoreFetch('https://example.supabase.co/rest/v1/sessions', {
      headers: { apikey: 'k' },
    })

    expect(fetchSpy).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/sessions', {
      headers: { apikey: 'k' },
      cache: 'no-store',
    })
    fetchSpy.mockRestore()
  })

  it('reads a url and an anon key that are both present', () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBeTruthy()
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBeTruthy()
  })
})
