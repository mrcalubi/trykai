/**
 * The Singpass OIDC client: FAPI 2.0 with PAR, PKCE, DPoP, private_key_jwt and
 * an encrypted ID token. Built on openid-client, the library Singpass's own
 * demo app uses (github.com/singpass/demo-app, examples/nodejs/src/router.ts),
 * and kept the same shape so the two can be compared line by line.
 *
 * Network only, so it is excluded from unit-test coverage; the rules it relies
 * on live in singpass.ts. Exercised against Singpass staging (OPERATIONS.md).
 */
import * as oidc from 'npm:openid-client@6.8.1'
import type { SingpassConfig } from './singpass.ts'
import {
  SINGPASS_AUTH_CONTEXT_MESSAGE,
  SINGPASS_AUTH_CONTEXT_TYPE,
  SINGPASS_SCOPE,
} from './singpass.ts'

export type DpopKeyPair = { privateKey: JsonWebKey; publicKey: JsonWebKey }

const DPOP_KEY_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ONE_HOUR_MS = 60 * 60 * 1000

let cached: { key: string; at: number; config: oidc.Configuration } | null = null

/** Discovery is cached for an hour, as Singpass asks. */
async function singpassClient(config: SingpassConfig): Promise<oidc.Configuration> {
  const cacheKey = `${config.issuer}|${config.clientId}|${config.signingKey.kid}|${config.encryptionKey.kid}`
  if (cached && cached.key === cacheKey && Date.now() - cached.at < ONE_HOUR_MS) return cached.config

  const signingKey = {
    kid: config.signingKey.kid,
    alg: config.signingKey.alg,
    key: await crypto.subtle.importKey(
      'jwk',
      stripJwkMeta(config.signingKey),
      { name: 'ECDSA', namedCurve: String(config.signingKey.crv) },
      false,
      ['sign'],
    ),
  }
  const encryptionKey = {
    kid: config.encryptionKey.kid,
    alg: config.encryptionKey.alg,
    key: await crypto.subtle.importKey(
      'jwk',
      stripJwkMeta(config.encryptionKey),
      { name: 'ECDH', namedCurve: String(config.encryptionKey.crv) },
      false,
      ['deriveKey', 'deriveBits'],
    ),
  }

  const client = await oidc.discovery(
    new URL(config.issuer),
    config.clientId,
    undefined,
    // deno-lint-ignore no-explicit-any
    oidc.PrivateKeyJwt(signingKey as any),
  )
  oidc.enableDecryptingResponses(
    client,
    ['A256GCM', 'A256CBC-HS512'],
    // deno-lint-ignore no-explicit-any
    encryptionKey as any,
  )
  cached = { key: cacheKey, at: Date.now(), config: client }
  return client
}

/** WebCrypto rejects a JWK whose alg or use disagrees with the import; Singpass does not need them here. */
function stripJwkMeta(jwk: JsonWebKey): JsonWebKey {
  const { kty, crv, x, y, d } = jwk
  return { kty, crv, x, y, d } as JsonWebKey
}

async function dpopOptions(client: oidc.Configuration, keys: DpopKeyPair) {
  return {
    DPoP: oidc.getDPoPHandle(
      client,
      {
        privateKey: await crypto.subtle.importKey('jwk', keys.privateKey, DPOP_KEY_PARAMS, false, ['sign']),
        publicKey: await crypto.subtle.importKey('jwk', keys.publicKey, DPOP_KEY_PARAMS, true, ['verify']),
      },
      {
        // Singpass accepts DPoP proofs for at most 2 minutes.
        [oidc.modifyAssertion]: (_header: Record<string, unknown>, payload: Record<string, unknown>) => {
          if (typeof payload.iat === 'number') payload.exp = payload.iat + 120
        },
      },
    ),
  }
}

export type SingpassStart = {
  url: string
  state: string
  nonce: string
  codeVerifier: string
  dpop: DpopKeyPair
}

/** Pushed authorization request; returns where to send the host. */
export async function beginSingpassLogin(config: SingpassConfig): Promise<SingpassStart> {
  const client = await singpassClient(config)
  const codeVerifier = oidc.randomPKCECodeVerifier()
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier)
  const nonce = oidc.randomNonce()
  const state = oidc.randomState()

  const pair = await oidc.randomDPoPKeyPair('ES256', { extractable: true })
  const dpop = {
    privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
  }

  const url = await oidc.buildAuthorizationUrlWithPAR(
    client,
    {
      redirect_uri: config.redirectUri,
      scope: SINGPASS_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      nonce,
      state,
      authentication_context_type: SINGPASS_AUTH_CONTEXT_TYPE,
      authentication_context_message: SINGPASS_AUTH_CONTEXT_MESSAGE,
    },
    await dpopOptions(client, dpop),
  )

  return { url: url.href, state, nonce, codeVerifier, dpop }
}

/** Token exchange; checks state, nonce, issuer and the ID token, then returns its claims. */
export async function finishSingpassLogin(
  config: SingpassConfig,
  session: { search: string; state: string; nonce: string; codeVerifier: string; dpop: DpopKeyPair },
): Promise<Record<string, unknown>> {
  const client = await singpassClient(config)
  const currentUrl = new URL(`${config.redirectUri}${session.search}`)
  const tokens = await oidc.authorizationCodeGrant(
    client,
    currentUrl,
    {
      pkceCodeVerifier: session.codeVerifier,
      expectedNonce: session.nonce,
      expectedState: session.state,
      idTokenExpected: true,
    },
    undefined,
    await dpopOptions(client, session.dpop),
  )
  const claims = tokens.claims()
  if (!claims) throw new Error('ID token claims are missing')
  return claims as Record<string, unknown>
}
