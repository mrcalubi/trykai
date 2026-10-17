/** `my_account` returns a table, so PostgREST hands back an array. */
export function firstAccountRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}
