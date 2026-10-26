import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import BioPreview from './BioPreview'

describe('BioPreview', () => {
  it('clamps to three lines with … more and Less', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<BioPreview bio={'One.\nTwo.\nThree.\nFour.'} lines={3} />)
    const bio = container.querySelector('.detail-host__bio')

    expect(bio.textContent).toBe('One.\nTwo.\nThree.… more')
    const more = screen.getByRole('button', { name: '… more' })
    expect(more).toHaveAttribute('aria-expanded', 'false')

    await user.click(more)
    expect(bio.textContent).toBe('One.\nTwo.\nThree.\nFour.Less')
    expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Less' }))
    expect(bio.textContent).toBe('One.\nTwo.\nThree.… more')
  })

  it('renders nothing when the bio is empty', () => {
    const { container } = render(<BioPreview bio="   " />)
    expect(container).toBeEmptyDOMElement()
  })
})
