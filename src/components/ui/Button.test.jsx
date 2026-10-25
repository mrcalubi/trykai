import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it('keeps the idle label in the tree, shows the loading label, and disables clicks', () => {
    const onClick = vi.fn()
    render(
      <Button loading loadingLabel="Saving" onClick={onClick}>
        Save changes
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveTextContent('Save changes')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
