import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PhotoTips from './PhotoTips'

describe('PhotoTips', () => {
  it('lists the five shots an experience needs', () => {
    render(<PhotoTips />)

    expect(screen.getByText('Five shots an experience needs')).toBeInTheDocument()
    expect(
      screen.getByText('The result — the finished latte, bowl, or piece.'),
    ).toBeInTheDocument()
    expect(screen.getByText('You teaching — hands in, showing how.')).toBeInTheDocument()
    expect(screen.getByText('The setup or space.')).toBeInTheDocument()
    expect(screen.getByText('Guests doing it.')).toBeInTheDocument()
    expect(screen.getByText('A close-up of the detail.')).toBeInTheDocument()
  })
})
