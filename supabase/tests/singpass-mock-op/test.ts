// Manual end-to-end check of _shared/singpass-oidc.ts against a mock Singpass
// that enforces the FAPI 2.0 rules Singpass documents: PAR, PKCE (S256),
// private_key_jwt client assertions, DPoP with one key per login, and an ID
// token and Myinfo userinfo that are ES256-signed then ECDH-ES+A256KW /
// A256CBC-HS512 encrypted, with the userinfo DPoP proof bound to the token (ath).
// Not a substitute for Singpass staging; it catches key, crypto and wiring
// mistakes before then. Run: ./run.sh
import * as jose from 'npm:jose@6.2.13'
import { beginSingpassLogin, finishSingpassLogin } from '../../functions/_shared/singpass-oidc.ts'
import { isAdult, myinfoPerson, SINGPASS_SCOPE } from '../../functions/_shared/singpass.ts'

const PORT = 8443
const ISSUER = `https://localhost:${PORT}/fapi`
const CLIENT_ID = 'A'.repeat(32)
const REDIRECT = 'https://trykai.vercel.app/verify-identity/singpass'

// RP keys, made the way the admin page makes them.
async function makeKey(kind: 'sig' | 'enc') {
  const pair = kind === 'sig'
    ? await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    : await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const { kty, crv, x, y, d } = priv
  const kid = `trykai-${kind}-test`
  const alg = kind === 'sig' ? 'ES256' : 'ECDH-ES+A256KW'
  return { private: { kty, crv, x, y, d, kid, alg }, public: { kty, crv, x, y, kid, alg, use: kind } }
}
const rpSig = await makeKey('sig')
const rpEnc = await makeKey('enc')
const op = await jose.generateKeyPair('ES256', { extractable: true })
const opPublic = { ...(await jose.exportJWK(op.publicKey)), kid: 'op-sig', alg: 'ES256', use: 'sig' }
const rpSigPublic = await jose.importJWK(rpSig.public, 'ES256')
const rpEncPublic = await jose.importJWK(rpEnc.public, 'ECDH-ES+A256KW')

const pars = new Map<string, Record<string, string>>()
const codes = new Map<string, Record<string, string>>()
const tokens = new Map<string, string>()
const seen: Record<string, unknown> = {}

async function checkAssertion(form: URLSearchParams, where: string) {
  if (form.get('client_assertion_type') !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') throw new Error(`${where}: assertion type`)
  const { payload, protectedHeader } = await jose.jwtVerify(form.get('client_assertion')!, rpSigPublic, { audience: ISSUER, issuer: CLIENT_ID, subject: CLIENT_ID })
  if (!payload.jti || !payload.exp || payload.exp - payload.iat! > 120) throw new Error(`${where}: assertion claims`)
  seen[`${where}_assertion_alg`] = protectedHeader.alg
}

async function checkDpop(req: Request, htu: string, method = 'POST', accessToken?: string) {
  const proof = req.headers.get('dpop')
  if (!proof) throw new Error('no DPoP header')
  const header = jose.decodeProtectedHeader(proof)
  if (header.typ !== 'dpop+jwt') throw new Error('dpop typ')
  const key = await jose.importJWK(header.jwk as jose.JWK, 'ES256')
  const { payload } = await jose.jwtVerify(proof, key, { typ: 'dpop+jwt' })
  if (payload.htm !== method || payload.htu !== htu) throw new Error(`dpop htm/htu ${payload.htm} ${payload.htu}`)
  if (accessToken) {
    const ath = jose.base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))))
    if (payload.ath !== ath) throw new Error('dpop ath does not match the access token')
  }
  if (!payload.exp || payload.exp - payload.iat! > 120) throw new Error('dpop exp')
  return jose.calculateJwkThumbprint(header.jwk as jose.JWK)
}

const server = Deno.serve({ port: PORT, cert: Deno.readTextFileSync(Deno.env.get('CERT')!), key: Deno.readTextFileSync(Deno.env.get('KEY')!), onListen() {} }, async (req) => {
  const url = new URL(req.url)
  try {
    if (url.pathname === '/fapi/.well-known/openid-configuration') {
      return Response.json({
        issuer: ISSUER,
        pushed_authorization_request_endpoint: `${ISSUER}/par`,
        authorization_endpoint: `https://localhost:${PORT}/auth`,
        token_endpoint: `${ISSUER}/token`,
        userinfo_endpoint: `${ISSUER}/userinfo`,
        userinfo_signing_alg_values_supported: ['ES256'],
        userinfo_encryption_alg_values_supported: ['ECDH-ES+A256KW'],
        userinfo_encryption_enc_values_supported: ['A256CBC-HS512'],
        jwks_uri: `${ISSUER}/jwks`,
        response_types_supported: ['code'],
        id_token_signing_alg_values_supported: ['ES256'],
        id_token_encryption_alg_values_supported: ['ECDH-ES+A256KW'],
        id_token_encryption_enc_values_supported: ['A256CBC-HS512'],
        dpop_signing_alg_values_supported: ['ES256'],
        token_endpoint_auth_methods_supported: ['private_key_jwt'],
        token_endpoint_auth_signing_alg_values_supported: ['ES256'],
        code_challenge_methods_supported: ['S256'],
        authorization_response_iss_parameter_supported: true,
        require_pushed_authorization_requests: true,
      })
    }
    if (url.pathname === '/fapi/jwks') return Response.json({ keys: [opPublic] })
    if (url.pathname === '/fapi/par' && req.method === 'POST') {
      const jkt = await checkDpop(req, `${ISSUER}/par`)
      const form = new URLSearchParams(await req.text())
      await checkAssertion(form, 'par')
      for (const k of ['response_type', 'scope', 'state', 'nonce', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method']) {
        if (!form.get(k)) throw new Error(`par missing ${k}`)
      }
      seen.scope = form.get('scope')
      const id = `urn:ietf:params:oauth:request_uri:${crypto.randomUUID()}`
      pars.set(id, { ...Object.fromEntries(form), jkt })
      return Response.json({ request_uri: id, expires_in: 60 }, { status: 201 })
    }
    if (url.pathname === '/fapi/token' && req.method === 'POST') {
      const jkt = await checkDpop(req, `${ISSUER}/token`)
      const form = new URLSearchParams(await req.text())
      await checkAssertion(form, 'token')
      const entry = codes.get(form.get('code')!)
      if (!entry) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      codes.delete(form.get('code')!)
      if (entry.jkt !== jkt) throw new Error('dpop key changed between PAR and token')
      if (form.get('redirect_uri') !== entry.redirect_uri) throw new Error('redirect mismatch')
      const challenge = jose.base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.get('code_verifier')!))))
      if (challenge !== entry.code_challenge) throw new Error('pkce mismatch')
      const now = Math.floor(Date.now() / 1000)
      const jws = await new jose.SignJWT({ nonce: entry.nonce, sub_type: 'user', sub_attributes: { name: 'TAN MEI LING' }, acr: 'urn:singpass:authentication:loa:2', amr: ['pwd', 'otp-sms'] })
        .setProtectedHeader({ alg: 'ES256', kid: 'op-sig', typ: 'JWT' })
        .setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject('6f0b7a2e-0000-4000-8000-000000000001').setIssuedAt(now).setExpirationTime(now + 600)
        .sign(op.privateKey)
      const jwe = await new jose.CompactEncrypt(new TextEncoder().encode(jws))
        .setProtectedHeader({ alg: 'ECDH-ES+A256KW', enc: 'A256CBC-HS512', kid: rpEnc.public.kid, cty: 'JWT' })
        .encrypt(rpEncPublic)
      const accessToken = 'at-' + crypto.randomUUID()
      tokens.set(accessToken, jkt)
      return Response.json({ access_token: accessToken, token_type: 'DPoP', id_token: jwe, expires_in: 1800 })
    }
    if (url.pathname === '/fapi/userinfo' && req.method === 'GET') {
      const auth = req.headers.get('authorization') ?? ''
      if (!auth.startsWith('DPoP ')) throw new Error('userinfo needs Authorization: DPoP <token>')
      const accessToken = auth.slice(5)
      const jkt = await checkDpop(req, `${ISSUER}/userinfo`, 'GET', accessToken)
      if (tokens.get(accessToken) !== jkt) throw new Error('userinfo DPoP key differs from the token request')
      const now = Math.floor(Date.now() / 1000)
      const jws = await new jose.SignJWT({
        person_info: {
          name: { lastupdated: '2026-01-01', source: '1', classification: 'C', value: 'TAN MEI LING' },
          dob: { lastupdated: '2026-01-01', source: '1', classification: 'C', value: '1998-05-17' },
          mobileno: { lastupdated: '2026-01-01', source: '4', classification: 'C', prefix: { value: '+' }, areacode: { value: '65' }, nbr: { value: '97399245' } },
        },
      })
        .setProtectedHeader({ alg: 'ES256', kid: 'op-sig', typ: 'JWT' })
        .setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject('6f0b7a2e-0000-4000-8000-000000000001').setIssuedAt(now)
        .sign(op.privateKey)
      const jwe = await new jose.CompactEncrypt(new TextEncoder().encode(jws))
        .setProtectedHeader({ alg: 'ECDH-ES+A256KW', enc: 'A256CBC-HS512', kid: rpEnc.public.kid, cty: 'JWT' })
        .encrypt(rpEncPublic)
      seen.userinfo = true
      return new Response(jwe, { headers: { 'content-type': 'application/jwt' } })
    }
    return new Response('not found', { status: 404 })
  } catch (err) {
    console.error('MOCK OP ERROR', err instanceof Error ? err.message : err)
    return Response.json({ error: 'invalid_request', error_description: String(err) }, { status: 400 })
  }
})

const config = { clientId: CLIENT_ID, issuer: ISSUER, redirectUri: REDIRECT, signingKey: rpSig.private, encryptionKey: rpEnc.private }
// deno-lint-ignore no-explicit-any
const start = await beginSingpassLogin(config as any)
const authUrl = new URL(start.url)
console.log('authorize url host+params ok:', authUrl.origin, [...authUrl.searchParams.keys()].join(','))
const par = pars.get(authUrl.searchParams.get('request_uri')!)!
// The "user" signs in; the OP redirects back with a code.
const code = crypto.randomUUID()
codes.set(code, par)
const search = `?code=${code}&state=${encodeURIComponent(par.state)}&iss=${encodeURIComponent(ISSUER)}`
// Round-trip the session through JSON, as the database does.
const stored = JSON.parse(JSON.stringify({ nonce: start.nonce, codeVerifier: start.codeVerifier, dpop: start.dpop }))
// deno-lint-ignore no-explicit-any
const result = await finishSingpassLogin(config as any, { search, state: start.state, ...stored })
const person = myinfoPerson(result.claims, result.userinfo)
console.log('myinfo:', JSON.stringify(person), 'adult:', person.ok && isAdult(person.person.dob))
if (!person.ok || person.person.name !== 'TAN MEI LING' || person.person.dob !== '1998-05-17' || person.person.mobile !== '+6597399245') Deno.exitCode = 1
if (!seen.userinfo) Deno.exitCode = 1
if (seen.scope !== SINGPASS_SCOPE) Deno.exitCode = 1
console.log('seen:', JSON.stringify(seen), 'scope expected', SINGPASS_SCOPE)

// A replayed code must fail.
try {
  // deno-lint-ignore no-explicit-any
  await finishSingpassLogin(config as any, { search, state: start.state, ...stored })
  console.log('REPLAY ACCEPTED (bad)'); Deno.exitCode = 1
} catch (err) { console.log('replay refused:', (err as Error).message.slice(0, 80)) }

// A wrong state must fail before any request.
try {
  // deno-lint-ignore no-explicit-any
  await finishSingpassLogin(config as any, { search: search.replace(/state=[^&]+/, 'state=forged'), state: start.state, ...stored })
  console.log('FORGED STATE ACCEPTED (bad)'); Deno.exitCode = 1
} catch (err) { console.log('forged state refused:', (err as Error).message.slice(0, 80)) }

await server.shutdown()
