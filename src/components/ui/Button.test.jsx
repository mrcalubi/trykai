import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Button from './Button'

describe('Button', () => {
  it('defaults to a primary button element', () => {
    render(<Button>Book</Button>)

    const button = screen.getByRole('button', { name: 'Book' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.className).toContain('ui-button')
    expect(button.className).toContain('ui-button--primary')
  })

  it('supports secondary and destructive variants', () => {
    render(
      <>
        <Button variant="secondary">Keep booking</Button>
        <Button variant="destructive">Cancel booking</Button>
      </>
    )

    expect(screen.getByRole('button', { name: 'Keep booking' }).className).toContain(
      'ui-button--secondary'
    )
    expect(screen.getByRole('button', { name: 'Cancel booking' }).className).toContain(
      'ui-button--destructive'
    )
  })

  it('passes through standard button props', () => {
    render(
      <Button type="submit" disabled>
        Sign up
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Sign up' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toBeDisabled()
  })
})
