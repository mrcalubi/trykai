/**
 * `my_is_founding_host` is a scalar. Anything other than a definite
 * true/false (error, null, missing row) means the fee line must stay
 * hidden — never show the 10% cut to a host whose status is unknown.
 */
export function foundingHostFromRpc(data, error) {
  if (error) return null
  if (data === true || data === false) return data
  return null
}
