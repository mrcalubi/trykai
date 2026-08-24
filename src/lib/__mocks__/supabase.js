import { createSupabaseMock } from '../../test/supabase-mock'

// Manual mock picked up by `vi.mock('.../lib/supabase')`. Every test file that
// mocks the module shares this instance, so call `supabase.__reset()` in a
// beforeEach to avoid leaking handlers between tests.
export const supabase = createSupabaseMock()
