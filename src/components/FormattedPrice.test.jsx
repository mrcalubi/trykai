import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FormattedPrice from './FormattedPrice'

describe('FormattedPrice', () => {
  it('leaves a dollar amount without a thousands separator as plain text', () => {
    const { container } = render(<FormattedPrice cents={800} />)
    expect(container.textContent).toBe('$8')
    expect(container.querySelector('.price__group')).toBeNull()
  })

  it('renders the thousands comma in the body-font separator', () => {
    const { container } = render(<FormattedPrice cents={999900} />)
    expect(container.textContent).toBe('$9,999')
    expect(container.querySelector('.price__group')).toHaveTextContent(',')
  })
})
