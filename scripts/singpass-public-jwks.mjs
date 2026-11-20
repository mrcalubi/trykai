/**
 * Prints the public JWKS for the Singpass portal from the two private keys,
 * in the same shape as box 3 of /admin/singpass-keys (src/lib/singpassKeys.js).
 * For when box 3 was not saved: the private JWKs already hold the public half.
 *
 *   SINGPASS_SIGNING_KEY=... SINGPASS_ENCRYPTION_KEY=... node scripts/singpass-public-jwks.mjs
 *
 * Load the two keys as hidden input, never on the command line or in chat.
 * The output has public keys only (no "d"), so it is safe to paste.
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REQUIRED = ['kty', 'crv', 'x', 'y', 'kid', 'alg']

export function publicJwk(name, raw, use) {
  if (!raw) throw new Error(`Set ${name} first.`)
  let jwk
  try {
    jwk = JSON.parse(raw)
  } catch {
    throw new Error(`${name} is not JSON; is it the right key?`)
  }
  for (const field of REQUIRED) {
    if (!jwk[field]) throw new Error(`${name} has no "${field}"; is it the right key?`)
  }
  const { kty, crv, x, y, kid, alg } = jwk
  return { kty, crv, x, y, kid, alg, use }
}

export function publicJwks(env) {
  const jwks = {
    keys: [
      publicJwk('SINGPASS_SIGNING_KEY', env.SINGPASS_SIGNING_KEY, 'sig'),
      publicJwk('SINGPASS_ENCRYPTION_KEY', env.SINGPASS_ENCRYPTION_KEY, 'enc'),
    ],
  }
  const text = JSON.stringify(jwks, null, 2)
  if (text.includes('"d"')) throw new Error('Refusing to print: a private part slipped through.')
  return text
}

function invokedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  try {
    console.log(publicJwks(process.env))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
