const DEFAULT_LINES = 2
const DEFAULT_CHARS = 160

export function previewBio(bio, { lines = DEFAULT_LINES, maxChars = DEFAULT_CHARS } = {}) {
  const text = String(bio ?? '').trim()
  const parts = text.split('\n')
  let preview = parts.slice(0, lines).join('\n')
  let truncated = parts.length > lines
  if (preview.length > maxChars) {
    const cut = preview.slice(0, maxChars)
    preview = cut.replace(/\s+\S*$/, '').trimEnd() || cut.trimEnd()
    truncated = true
  }
  return { preview, truncated }
}
