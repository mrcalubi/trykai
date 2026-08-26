import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SelectableCard from './SelectableCard'

describe('SelectableCard', () => {
  it('renders image, description, and title', () => {
    render(
      <SelectableCard
        image="/food.png"
        imageAlt="Food"
        title="Food"
        description="Cook, bake, and taste"
      />
    )

    expect(screen.getByRole('img', { name: 'Food' })).toHaveAttribute('src', '/food.png')
    expect(screen.getByText('Cook, bake, and taste')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('shows an artwork-pending placeholder when there is no image', () => {
    render(
      <SelectableCard title="Music" description="Sing, play, listen" placeholder />
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('artwork pending')).toBeInTheDocument()
  })

  it('marks the card as selected and calls onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <SelectableCard
        title="Fitness"
        description="Move and train"
        selected
        onSelect={onSelect}
      />
    )

    const card = screen.getByRole('button', { name: /Fitness/ })
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(card.className).toContain('ui-selectable-card--selected')

    await user.click(card)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
