import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Avatar from './Avatar'

describe('Avatar', () => {
  it('shows the photo when avatarUrl is set', () => {
    const { container } = render(
      <Avatar avatarUrl="https://cdn.test/face.jpg" displayName="Mei Ling" />,
    )
    const photo = container.querySelector('img')
    expect(photo).toHaveAttribute('src', 'https://cdn.test/face.jpg')
    expect(photo).toHaveClass('ui-avatar')
    expect(screen.queryByText('M')).not.toBeInTheDocument()
  })

  it('shows the first letter of display_name when there is no photo', () => {
    render(<Avatar displayName="Latte Queen" className="face" size={36} />)
    const face = screen.getByText('L')
    expect(face).toHaveClass('ui-avatar', 'face')
    expect(face).toHaveStyle({ width: '36px', height: '36px' })
    expect(screen.queryByText('LQ')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('centres the initial in ui-avatar and sizes the letter from size', () => {
    render(<Avatar displayName="Mei" size={72} />)
    const face = screen.getByText('M')
    expect(face.tagName).toBe('SPAN')
    expect(face).toHaveClass('ui-avatar')
    expect(parseFloat(face.style.fontSize)).toBeCloseTo(29, 0)
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

  it('fills the wrapper instead of a fixed pixel size', () => {
    render(<Avatar displayName="Mei" fill />)
    const face = screen.getByText('M')
    expect(face).toHaveStyle({ width: '100%', height: '100%' })
    expect(face.style.fontSize).toBe('')
  })
})
