/**
 * TryKai's Singpass keys: one ES256 signing key and one ECDH-ES+A256KW
 * encryption key, both P-256 (Singpass JWKS requirements). Made with the
 * browser's own WebCrypto on /admin/singpass-keys, so the private halves never
 * leave the device of the person setting Singpass up.
 */

function compactDate(now) {
  return now.toISOString().slice(0, 10).replaceAll('-', '')
}

function jwkCore(jwk) {
  const { kty, crv, x, y, d } = jwk
  return d ? { kty, crv, x, y, d } : { kty, crv, x, y }
}

export async function generateSingpassKeys({ subtle = globalThis.crypto?.subtle, now = new Date() } = {}) {
  if (!subtle) throw new Error('This browser cannot generate keys. Use a recent Chrome, Safari or Firefox.')
  const stamp = `${compactDate(now)}-${Math.random().toString(36).slice(2, 8)}`
  const sigKid = `trykai-sig-${stamp}`
  const encKid = `trykai-enc-${stamp}`

  const sig = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const enc = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])

  const sigPrivate = jwkCore(await subtle.exportKey('jwk', sig.privateKey))
  const encPrivate = jwkCore(await subtle.exportKey('jwk', enc.privateKey))

  const signingKey = { ...sigPrivate, kid: sigKid, alg: 'ES256' }
  const encryptionKey = { ...encPrivate, kid: encKid, alg: 'ECDH-ES+A256KW' }

  const jwks = {
    keys: [
      { ...jwkCore({ ...signingKey, d: undefined }), kid: sigKid, alg: 'ES256', use: 'sig' },
      { ...jwkCore({ ...encryptionKey, d: undefined }), kid: encKid, alg: 'ECDH-ES+A256KW', use: 'enc' },
    ],
  }

  return {
    signingKey: JSON.stringify(signingKey),
    encryptionKey: JSON.stringify(encryptionKey),
    jwks: JSON.stringify(jwks, null, 2),
  }
}
