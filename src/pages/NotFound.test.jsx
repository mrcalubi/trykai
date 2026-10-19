import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NotFound from './NotFound'
import { renderWithRouter } from '../test/render'

describe('NotFound', () => {
  it('says the page is missing and links back to browse', () => {
    renderWithRouter(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to browse/ })).toHaveAttribute('href', '/')
  })
})
