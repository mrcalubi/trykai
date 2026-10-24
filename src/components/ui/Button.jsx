export default function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}) {
  const classes = ['ui-button', `ui-button--${variant}`, loading && 'ui-button--loading', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="ui-button__idle" aria-hidden={loading || undefined}>
        {children}
      </span>
      {loading ? (
        <span className="ui-button__busy">
          <span className="tk-spinner" aria-hidden="true" />
          <span>{loadingLabel || children}</span>
        </span>
      ) : null}
    </button>
  )
}
