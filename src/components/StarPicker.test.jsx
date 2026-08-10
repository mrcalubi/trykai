import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StarPicker from './StarPicker'

describe('StarPicker', () => {
  it('renders five rating buttons inside a labelled group', () => {
    render(<StarPicker value={0} onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Rating' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('labels the first star in the singular and the rest in the plural', () => {
    render(<StarPicker value={0} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '1 star' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5 stars' })).toBeInTheDocument()
  })

  it('reports the selected rating', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<StarPicker value={0} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '4 stars' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(4)
  })

  it('highlights every star up to the current value', () => {
    render(<StarPicker value={3} onChange={vi.fn()} />)
    const active = screen
      .getAllByRole('button')
      .filter((button) => button.className.includes('star-picker__btn--active'))
    expect(active).toHaveLength(3)
  })

  it('highlights nothing when no rating has been chosen', () => {
    render(<StarPicker value={0} onChange={vi.fn()} />)
    const active = screen
      .getAllByRole('button')
      .filter((button) => button.className.includes('star-picker__btn--active'))
    expect(active).toHaveLength(0)
  })

  it('uses buttons that do not submit the surrounding form', () => {
    render(<StarPicker value={0} onChange={vi.fn()} />)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button')
    }
  })
})
