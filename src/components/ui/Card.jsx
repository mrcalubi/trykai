import { Link } from 'react-router-dom'

function hasRating(rating) {
  return typeof rating === 'number' && !Number.isNaN(rating) && rating > 0
}

function formatRating(rating) {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1)
}

export default function Card({
  mode = 'booking',
  image,
  imageAlt = '',
  badge,
  title,
  meta,
  rating,
  price,
  to,
  footer,
  className = '',
  children,
  ...props
}) {
  const isBrowse = mode === 'browse'
  const showMedia = isBrowse || Boolean(image) || Boolean(badge)
  const classes = [
    'ui-card',
    isBrowse ? 'ui-card--browse' : 'ui-card--booking',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const metaLines = Array.isArray(meta) ? meta.filter(Boolean) : meta ? [meta] : []
  const showRating = hasRating(rating)
  const Wrapper = isBrowse && to ? Link : 'article'
  const wrapperProps =
    isBrowse && to
      ? { to, className: classes, ...props }
      : { className: classes, ...props }

  const metaBlock =
    metaLines.length > 0 || showRating ? (
      <div className="ui-card__meta-row">
        {metaLines.length > 0 ? (
          <div className="ui-card__meta-lines">
            {metaLines.map((line) => (
              <p key={line} className="ui-card__meta">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {showRating ? (
          <p className="ui-card__rating">
            <span aria-hidden="true">★</span> {formatRating(rating)}
          </p>
        ) : null}
      </div>
    ) : null

  return (
    <Wrapper {...wrapperProps}>
      {showMedia ? (
        <div className="ui-card__image-wrap">
          {badge ? <span className="ui-card__badge">{badge}</span> : null}
          {image ? (
            <img src={image} alt={imageAlt} className="ui-card__image" />
          ) : (
            <div className="ui-card__placeholder" aria-hidden="true" />
          )}
        </div>
      ) : null}
      <div className="ui-card__body">
        {title ? <h3 className="ui-card__title">{title}</h3> : null}
        {metaBlock}
        {children}
        {isBrowse && price ? (
          <p className="ui-card__price">{price}</p>
        ) : null}
        {!isBrowse && footer ? <div className="ui-card__footer">{footer}</div> : null}
      </div>
    </Wrapper>
  )
}
