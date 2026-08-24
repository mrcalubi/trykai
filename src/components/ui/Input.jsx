import { useId, useState } from 'react'

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a16.8 16.8 0 0 1-3.2 3.9" />
      <path d="M6.1 6.1A16.9 16.9 0 0 0 2 12s3.5 6 10 6a10.4 10.4 0 0 0 4.2-.9" />
    </svg>
  )
}

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
  const isPassword = type === 'password'
  const isControlled = value !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '')
  const [focused, setFocused] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const currentValue = isControlled ? value : uncontrolledValue
  const floated = floatingLabel && (focused || String(currentValue ?? '').length > 0)
  const fieldClasses = [
    'ui-field',
    floatingLabel ? 'ui-field--floating' : '',
    floated ? 'ui-field--floated' : '',
    error ? 'ui-field--error' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const classes = [
    'ui-input',
    error ? 'ui-input--error' : '',
    isPassword ? 'ui-input--with-toggle' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const inputPlaceholder = floatingLabel ? placeholder || ' ' : placeholder
  const inputType = isPassword && passwordVisible ? 'text' : type
  const labelEl = label ? (
    <label htmlFor={inputId} className="ui-field__label">
      {label}
    </label>
  ) : null
  const inputEl = (
    <input
      id={inputId}
      type={inputType}
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
  const passwordToggle = isPassword ? (
    <button
      type="button"
      className="ui-field__toggle"
      aria-label={passwordVisible ? 'Hide password' : 'Show password'}
      aria-pressed={passwordVisible}
      aria-controls={inputId}
      onClick={() => setPasswordVisible((visible) => !visible)}
    >
      {passwordVisible ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  ) : null
  const inputWithToggle = isPassword ? (
    <div className="ui-field__input-wrap">
      {inputEl}
      {passwordToggle}
    </div>
  ) : (
    inputEl
  )

  return (
    <div className={fieldClasses}>
      {floatingLabel ? (
        <div className="ui-field__control">
          {inputWithToggle}
          {labelEl}
        </div>
      ) : (
        <>
          {labelEl}
          {inputWithToggle}
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
