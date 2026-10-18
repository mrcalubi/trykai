import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import WhatsProvidedFields from './WhatsProvidedFields'

describe('WhatsProvidedFields', () => {
  it('adds a custom item and ignores a duplicate or a preset name', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<WhatsProvidedFields value={['Materials']} onChange={onChange} />)

    await user.type(screen.getByLabelText('Add your own'), 'Apron')
    await user.click(screen.getByRole('button', { name: '+ Add your own' }))
    expect(onChange).toHaveBeenCalledWith(['Materials', 'Apron'])

    rerender(<WhatsProvidedFields value={['Materials', 'Apron']} onChange={onChange} />)
    const input = screen.getByLabelText('Add your own')
    await user.clear(input)
    await user.type(input, 'Apron')
    await user.click(screen.getByRole('button', { name: '+ Add your own' }))
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.clear(input)
    await user.type(input, 'None')
    await user.click(screen.getByRole('button', { name: '+ Add your own' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('removes a custom chip', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WhatsProvidedFields value={['Apron']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Remove Apron' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
