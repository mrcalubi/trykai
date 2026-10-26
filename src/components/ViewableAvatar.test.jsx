import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ViewableAvatar from './ViewableAvatar'

describe('ViewableAvatar', () => {
  it('opens a photo viewer when the avatar has a photo', async () => {
    const user = userEvent.setup()
    render(
      <ViewableAvatar
        avatarUrl="https://cdn.test/face.jpg"
        displayName="Mei"
        name="Mei"
        className="face"
      />,
    )

    await user.click(screen.getByRole('button', { name: "View Mei's photo" }))

    const dialog = screen.getByRole('dialog', { name: "Mei's photo" })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('img', { name: "Mei's photo 1" })).toHaveAttribute(
      'src',
      'https://cdn.test/face.jpg',
    )
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument()
  })

  it('does not open anything when there are only initials', () => {
    render(<ViewableAvatar displayName="Mei" className="face" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.face')).toHaveTextContent('M')
  })

  it('closes on Escape and returns focus to the avatar', async () => {
    const user = userEvent.setup()
    render(
      <ViewableAvatar avatarUrl="https://cdn.test/face.jpg" displayName="Mei" name="Mei" />,
    )

    const trigger = screen.getByRole('button', { name: "View Mei's photo" })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
