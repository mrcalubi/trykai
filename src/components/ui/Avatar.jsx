function avatarInitial(displayName) {
  if (typeof displayName !== 'string') return '?'
  const trimmed = displayName.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

export default function Avatar({ avatarUrl, displayName, size, className = '' }) {
  const photo = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : ''
  const style =
    typeof size === 'number'
      ? { width: size, height: size }
      : undefined

  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        className={className}
        style={style}
      />
    )
  }

  return (
    <span className={className} style={style} aria-hidden="true">
      {avatarInitial(displayName)}
    </span>
  )
}
