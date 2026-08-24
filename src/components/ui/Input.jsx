import { useId } from 'react'

export default function Input({
  id,
  label,
  error,
  type = 'text',
  className = '',
  ...props
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const classes = ['ui-input', error ? 'ui-input--error' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="ui-field">
      {label ? (
        <label htmlFor={inputId} className="ui-field__label">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        type={type}
        className={classes}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} className="error-message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
