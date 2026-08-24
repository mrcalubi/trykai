import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Input from './Input'

describe('Input', () => {
  it('renders a labelled text field', () => {
    render(<Input id="full-name" label="Full name" placeholder="Your name" />)

    const field = screen.getByLabelText('Full name')
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveAttribute('placeholder', 'Your name')
    expect(field.className).toContain('ui-input')
  })

  it('renders a password field', () => {
    render(<Input id="password" label="Password" type="password" />)

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('shows an error message below the field', () => {
    render(
      <Input
        id="email"
        label="Email"
        error="Email rate limit exceeded"
      />
    )

    const field = screen.getByLabelText('Email')
    const message = screen.getByRole('alert')

    expect(message).toHaveTextContent('Email rate limit exceeded')
    expect(message.className).toContain('error-message')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAttribute('aria-describedby', 'email-error')
    expect(field.className).toContain('ui-input--error')
  })

  it('passes through standard input props', () => {
    render(<Input id="email" label="Email" required autoComplete="email" />)

    const field = screen.getByLabelText('Email')
    expect(field).toBeRequired()
    expect(field).toHaveAttribute('autoComplete', 'email')
  })
})
