import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Avatar from './Avatar'

describe('Avatar', () => {
  it('shows the photo when avatarUrl is set', () => {
    const { container } = render(
      <Avatar avatarUrl="https://cdn.test/face.jpg" displayName="Mei Ling" />,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/face.jpg')
    expect(screen.queryByText('M')).not.toBeInTheDocument()
  })

  it('shows the first letter of display_name when there is no photo', () => {
    render(<Avatar displayName="Latte Queen" className="face" size={36} />)
    const face = screen.getByText('L')
    expect(face).toHaveClass('face')
    expect(face).toHaveStyle({ width: '36px', height: '36px' })
    expect(screen.queryByText('LQ')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('uppercases a single-word display name', () => {
    render(<Avatar displayName="  kai  " />)
    expect(screen.getByText('K')).toBeInTheDocument()
  })

  it('is ? when display_name is empty', () => {
    const { rerender } = render(<Avatar displayName="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
    rerender(<Avatar displayName="   " />)
    expect(screen.getByText('?')).toBeInTheDocument()
    rerender(<Avatar />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('does not treat a blank avatarUrl as a photo', () => {
    render(<Avatar avatarUrl="  " displayName="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
