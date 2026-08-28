import { vi } from 'vitest'

/**
 * A stand-in for the `@supabase/supabase-js` client.
 *
 * The real client exposes a chainable, thenable query builder. This mock mirrors
 * that shape closely enough that page code can run unmodified, while letting a
 * test declare what each `table.operation` pair should return and then assert on
 * the payloads and filters that were sent.
 *
 * Usage:
 *   supabase.__on('listings', 'select', { data: [listing], error: null })
 *   supabase.__on('bookings', 'update', ({ payload }) => ...)
 *   supabase.__calls('bookings', 'update') // -> [{ payload, filters, ... }]
 */

const FILTER_METHODS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'is',
  'in',
  'like',
  'ilike',
  'contains',
  'match',
  'not',
  'or',
  'filter',
]

const MODIFIER_METHODS = ['select', 'order', 'limit', 'range', 'abortSignal', 'throwOnError']

const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete']

function normalizeResult(result, single) {
  if (result === undefined || result === null) {
    return { data: single ? null : [], error: null, count: null, status: 200 }
  }
  return {
    data: 'data' in result ? result.data : null,
    error: 'error' in result ? result.error : null,
    count: 'count' in result ? result.count : null,
    status: 'status' in result ? result.status : result.error ? 400 : 200,
  }
}

export function createSupabaseMock() {
  const handlers = new Map()
  const queues = new Map()
  const calls = []
  const buckets = new Map()

  function keyOf(table, operation) {
    return `${table}.${operation}`
  }

  function takeHandler(table, operation) {
    const key = keyOf(table, operation)
    const queue = queues.get(key)
    if (queue?.length) return { found: true, handler: queue.shift() }
    if (handlers.has(key)) return { found: true, handler: handlers.get(key) }
    if (handlers.has(`${table}.*`)) return { found: true, handler: handlers.get(`${table}.*`) }
    return { found: false, handler: undefined }
  }

  function resolveQuery(ctx) {
    const record = {
      table: ctx.table,
      operation: ctx.operation,
      payload: ctx.payload,
      filters: ctx.filters,
      chain: ctx.chain,
      single: ctx.single,
    }
    calls.push(record)

    const { found, handler } = takeHandler(ctx.table, ctx.operation)
    if (!found) return normalizeResult(undefined, ctx.single)

    const value = typeof handler === 'function' ? handler(record) : handler
    return normalizeResult(value, ctx.single)
  }

  function createBuilder(table, operation, payload) {
    const ctx = {
      table,
      operation,
      payload,
      filters: [],
      chain: [],
      single: false,
    }

    const builder = {}

    for (const method of [...FILTER_METHODS, ...MODIFIER_METHODS]) {
      builder[method] = (...args) => {
        ctx.chain.push({ method, args })
        if (FILTER_METHODS.includes(method)) {
          ctx.filters.push({ method, column: args[0], value: args[1] })
        }
        return builder
      }
    }

    for (const method of ['single', 'maybeSingle']) {
      builder[method] = () => {
        ctx.single = true
        ctx.chain.push({ method, args: [] })
        return builder
      }
    }

    builder.then = (onFulfilled, onRejected) =>
      Promise.resolve()
        .then(() => resolveQuery(ctx))
        .then(onFulfilled, onRejected)
    builder.catch = (onRejected) => builder.then(undefined, onRejected)
    builder.finally = (onFinally) => builder.then().finally(onFinally)

    return builder
  }

  function from(table) {
    const entry = {}
    for (const method of WRITE_METHODS) {
      entry[method] = (payload) => createBuilder(table, method, payload)
    }
    entry.select = (...args) => {
      const builder = createBuilder(table, 'select')
      return builder.select(...args)
    }
    return entry
  }

  function bucket(name) {
    if (!buckets.has(name)) {
      buckets.set(name, {
        upload: vi.fn(async (path) => ({ data: { path }, error: null })),
        remove: vi.fn(async () => ({ data: null, error: null })),
        download: vi.fn(async () => ({ data: null, error: null })),
        getPublicUrl: vi.fn((path) => ({
          data: { publicUrl: `https://cdn.test/${name}/${path}` },
        })),
        createSignedUrl: vi.fn(async (path) => ({
          data: { signedUrl: `https://cdn.test/${name}/${path}?token=test` },
          error: null,
        })),
      })
    }
    return buckets.get(name)
  }

  const authDefaults = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
    signUp: async () => ({ data: { user: null, session: null }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
  }

  const auth = {}
  for (const [name, impl] of Object.entries(authDefaults)) {
    auth[name] = vi.fn(impl)
  }

  const functions = {
    invoke: vi.fn(async () => ({ data: null, error: null })),
  }

  const rpc = vi.fn(async () => ({ data: null, error: null }))

  const supabase = {
    from: vi.fn(from),
    auth,
    functions,
    rpc,
    storage: { from: vi.fn(bucket) },

    /** Register a persistent response for a table + operation. */
    __on(table, operation, handler) {
      handlers.set(keyOf(table, operation), handler)
      return supabase
    },

    /** Queue a one-shot response, consumed before any persistent handler. */
    __once(table, operation, handler) {
      const key = keyOf(table, operation)
      if (!queues.has(key)) queues.set(key, [])
      queues.get(key).push(handler)
      return supabase
    },

    /** Every query recorded so far, optionally narrowed by table/operation. */
    __calls(table, operation) {
      return calls.filter(
        (call) =>
          (table === undefined || call.table === table) &&
          (operation === undefined || call.operation === operation)
      )
    },

    /** The single most recent matching query, or undefined. */
    __lastCall(table, operation) {
      const matching = supabase.__calls(table, operation)
      return matching[matching.length - 1]
    },

    __bucket: bucket,

    __reset() {
      handlers.clear()
      queues.clear()
      calls.length = 0
      buckets.clear()
      supabase.from.mockClear()
      supabase.storage.from.mockClear()
      functions.invoke.mockReset()
      functions.invoke.mockImplementation(async () => ({ data: null, error: null }))
      rpc.mockReset()
      rpc.mockImplementation(async () => ({ data: null, error: null }))
      for (const [name, impl] of Object.entries(authDefaults)) {
        auth[name].mockReset()
        auth[name].mockImplementation(impl)
      }
    },
  }

  return supabase
}
