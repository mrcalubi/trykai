export default function SelectableCard({
  image,
  imageAlt = '',
  title,
  description,
  selected = false,
  onSelect,
  placeholder = false,
  className = '',
  ...props
}) {
  const classes = [
    'ui-selectable-card',
    selected ? 'ui-selectable-card--selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={selected}
      onClick={onSelect}
      {...props}
    >
      <span
        className={`ui-selectable-card__media${placeholder ? ' ui-selectable-card__media--pending' : ''}`}
      >
        {image ? (
          <img src={image} alt={imageAlt} className="ui-selectable-card__image" />
        ) : (
          <span className="ui-selectable-card__pending-circle" aria-hidden="true" />
        )}
      </span>
      <span className="ui-selectable-card__body">
        {placeholder ? (
          <span className="ui-selectable-card__pending-label">artwork pending</span>
        ) : description ? (
          <span className="ui-selectable-card__description">{description}</span>
        ) : null}
        {title ? <span className="ui-selectable-card__title">{title}</span> : null}
      </span>
      <span
        className={`ui-selectable-card__indicator${selected ? ' ui-selectable-card__indicator--on' : ''}`}
        aria-hidden="true"
      >
        {selected ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : null}
      </span>
    </button>
  )
}
