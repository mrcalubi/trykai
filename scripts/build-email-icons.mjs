/**
 * Writes public/email/{instagram,tiktok}.png for wrapEmail.
 *
 * 48×48 retina, shown at 24×24. Official Simple Icons paths from SocialGlyph,
 * single colour EMAIL_COLORS.muted, transparent background. Email clients
 * strip SVG, so these stay PNG.
 *
 *   node scripts/build-email-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const SIZE = 48
const COLOR = '#4E586C'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BITS = readFileSync(resolve(ROOT, 'src/components/profile/ProfileBits.jsx'), 'utf8')
const OUT = resolve(ROOT, 'public/email')

function glyphPath(kind) {
  const match = BITS.match(new RegExp(`${kind}:\\s*'([^']+)'`))
  if (!match) throw new Error(`SocialGlyph path for ${kind} not found in ProfileBits.jsx`)
  return match[1]
}

function svgFor(path) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">
  <path fill="${COLOR}" d="${path}"/>
</svg>`
}

mkdirSync(OUT, { recursive: true })
for (const kind of ['instagram', 'tiktok']) {
  const png = new Resvg(svgFor(glyphPath(kind)), {
    fitTo: { mode: 'width', value: SIZE },
  })
    .render()
    .asPng()
  writeFileSync(resolve(OUT, `${kind}.png`), png)
}
