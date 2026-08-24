import { useId, useState } from 'react'

export default function Input({
  id,
  label,
  error,
  type = 'text',
  className = '',
  floatingLabel = false,
  placeholder,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  ...props
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const isControlled = value !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '')
  const [focused, setFocused] = useState(false)
  const currentValue = isControlled ? value : uncontrolledValue
  const floated = floatingLabel && (focused || String(currentValue ?? '').length > 0)
  const fieldClasses = [
    'ui-field',
    floatingLabel ? 'ui-field--floating' : '',
    floated ? 'ui-field--floated' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const classes = ['ui-input', error ? 'ui-input--error' : '', className]
    .filter(Boolean)
    .join(' ')
  const inputPlaceholder = floatingLabel ? placeholder || ' ' : placeholder
  const labelEl = label ? (
    <label htmlFor={inputId} className="ui-field__label">
      {label}
    </label>
  ) : null
  const inputEl = (
    <input
      id={inputId}
      type={type}
      className={classes}
      placeholder={inputPlaceholder}
      {...(isControlled ? { value } : { defaultValue })}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onChange={(event) => {
        if (!isControlled) setUncontrolledValue(event.target.value)
        onChange?.(event)
      }}
      onFocus={(event) => {
        setFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        onBlur?.(event)
      }}
      {...props}
    />
  )

  return (
    <div className={fieldClasses}>
      {floatingLabel ? (
        <div className="ui-field__control">
          {inputEl}
          {labelEl}
        </div>
      ) : (
        <>
          {labelEl}
          {inputEl}
        </>
      )}
      {error ? (
        <p id={errorId} className="error-message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
