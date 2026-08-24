import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('toggles a password field between masked and plain text', async () => {
    const user = userEvent.setup()
    render(<Input id="password" label="Password" type="password" />)

    const field = screen.getByLabelText('Password')
    const toggle = screen.getByRole('button', { name: 'Show password' })

    await user.click(toggle)
    expect(field).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(field).toHaveAttribute('type', 'password')
  })

  it('does not show a visibility toggle on text fields', () => {
    render(<Input id="full-name" label="Full name" />)

    expect(screen.queryByRole('button', { name: 'Show password' })).not.toBeInTheDocument()
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

  it('keeps the default label above the field', () => {
    const { container } = render(<Input id="full-name" label="Full name" />)

    expect(container.querySelector('.ui-field')).not.toHaveClass('ui-field--floating')
    expect(container.querySelector('.ui-field__control')).not.toBeInTheDocument()
  })

  it('renders an optional floating label inside the field', () => {
    const { container } = render(
      <Input id="full-name-floating" label="Full name" floatingLabel />
    )

    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(container.querySelector('.ui-field')).toHaveClass('ui-field--floating')
    expect(container.querySelector('.ui-field__control')).toBeInTheDocument()
  })

  it('floats the label on focus and keeps it up when the field has a value', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Input id="full-name-floating" label="Full name" floatingLabel />
    )
    const field = screen.getByLabelText('Full name')

    expect(container.querySelector('.ui-field')).not.toHaveClass('ui-field--floated')

    await user.click(field)
    expect(container.querySelector('.ui-field')).toHaveClass('ui-field--floated')

    await user.type(field, 'Mei Ling')
    await user.tab()
    expect(container.querySelector('.ui-field')).toHaveClass('ui-field--floated')
  })
})
