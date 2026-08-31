function messageFromBody(body) {
  if (body == null) return ''
  if (typeof body === 'string') return body.trim()
  if (typeof body === 'object') {
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  }
  return ''
}

/**
 * supabase.functions.invoke hides non-2xx JSON behind
 * "Edge Function returned a non-2xx status code". Read the response body so
 * hosts see Stripe's actual sentence.
 */
export async function edgeFunctionErrorMessage(error, data) {
  const fromData = messageFromBody(data)
  if (fromData) return fromData
  if (!error) return ''

  const ctx = error.context
  if (ctx) {
    try {
      const source = typeof ctx.clone === 'function' ? ctx.clone() : ctx
      if (typeof source.text === 'function') {
        const text = (await source.text()).trim()
        if (text) {
          try {
            const fromJson = messageFromBody(JSON.parse(text))
            if (fromJson) return fromJson
          } catch {
            return text
          }
          return text
        }
      } else if (typeof source.json === 'function') {
        const fromJson = messageFromBody(await source.json())
        if (fromJson) return fromJson
      }
    } catch {
      // Body already consumed or not parseable; fall through.
    }
  }

  return error.message || 'Something went wrong'
}
