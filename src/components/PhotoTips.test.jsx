import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PhotoTips from './PhotoTips'

describe('PhotoTips', () => {
  it('lists the four agreed tips', () => {
    render(<PhotoTips />)

    expect(screen.getByText('A few tips for great photos')).toBeInTheDocument()
    expect(
      screen.getByText('Natural light is your best friend. A window beats any flash.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Lead with the good stuff: the latte, the bowl, the finished piece.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Hands in action beat an empty room.')).toBeInTheDocument()
    expect(
      screen.getByText('Tidy the background so your skill takes centre stage.'),
    ).toBeInTheDocument()
  })
})
