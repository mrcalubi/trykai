function avatarInitial(displayName) {
  if (typeof displayName !== 'string') return '?'
  const trimmed = displayName.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

function avatarClassName(className) {
  return ['ui-avatar', className].filter(Boolean).join(' ')
}

export default function Avatar({ avatarUrl, displayName, size, fill = false, className = '' }) {
  const photo = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : ''
  const sized = !fill && typeof size === 'number'
  const style = fill
    ? { width: '100%', height: '100%' }
    : sized
      ? {
          width: size,
          height: size,
          ...(photo ? {} : { fontSize: Math.round(size * 0.4) }),
        }
      : undefined

  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        width={fill ? undefined : size}
        height={fill ? undefined : size}
        className={avatarClassName(className)}
        style={style}
      />
    )
  }

  return (
    <span className={avatarClassName(className)} style={style} aria-hidden="true">
      {avatarInitial(displayName)}
    </span>
  )
}
