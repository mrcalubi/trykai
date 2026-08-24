export default function Card({
  image,
  imageAlt = '',
  title,
  meta,
  footer,
  className = '',
  children,
  ...props
}) {
  const classes = ['ui-card', className].filter(Boolean).join(' ')
  const metaLines = Array.isArray(meta) ? meta.filter(Boolean) : meta ? [meta] : []

  return (
    <article className={classes} {...props}>
      <div className="ui-card__image-wrap">
        {image ? (
          <img src={image} alt={imageAlt} className="ui-card__image" />
        ) : (
          <div className="ui-card__placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="ui-card__body">
        {title ? <h3 className="ui-card__title">{title}</h3> : null}
        {metaLines.map((line) => (
          <p key={line} className="ui-card__meta">
            {line}
          </p>
        ))}
        {children}
        {footer ? <div className="ui-card__footer">{footer}</div> : null}
      </div>
    </article>
  )
}
