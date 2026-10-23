#!/usr/bin/env bash
# Runs test.ts against a throwaway HTTPS mock of Singpass on localhost:8443.
# Needs deno and openssl. Exits non-zero if any check fails.
set -euo pipefail
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "$tmp/key.pem" -out "$tmp/cert.pem" -days 1 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost" 2>/dev/null
CERT="$tmp/cert.pem" KEY="$tmp/key.pem" deno run -A --node-modules-dir=none \
  --unsafely-ignore-certificate-errors=localhost test.ts
