import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import PostalAddressFields from './PostalAddressFields'

vi.mock('../lib/supabase')

beforeEach(() => {
  supabase.__reset()
})

describe('PostalAddressFields', () => {
  it('refuses a postal code that is not six digits', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PostalAddressFields value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Postal code'), '123')
    await user.click(screen.getByRole('button', { name: 'Find addresses' }))

    expect(screen.getByText('Enter a 6-digit postal code.')).toBeInTheDocument()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fills the composed address from a single OneMap hit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    supabase.functions.invoke.mockResolvedValue({
      data: { results: [{ address: '12 COFFEE ROAD SINGAPORE 470012', postal: '470012' }] },
      error: null,
    })
    render(<PostalAddressFields value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Postal code'), '470012')
    await user.click(screen.getByRole('button', { name: 'Find addresses' }))

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('12 COFFEE ROAD SINGAPORE 470012'),
    )
    expect(supabase.functions.invoke).toHaveBeenCalledWith('lookup-postal-code', {
      body: { postal: '470012' },
    })
  })

  it('lets the host pick among several matches and add a unit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [
          { address: '10 CLAY ROAD SINGAPORE 470010', postal: '470010' },
          { address: '12 CLAY ROAD SINGAPORE 470012', postal: '470012' },
        ],
      },
      error: null,
    })
    render(<PostalAddressFields value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Postal code'), '470012')
    await user.click(screen.getByRole('button', { name: 'Find addresses' }))
    await user.click(screen.getByRole('option', { name: '12 CLAY ROAD SINGAPORE 470012' }))
    await user.type(screen.getByLabelText('Unit number (optional)'), '#05-12')

    expect(onChange).toHaveBeenCalledWith('12 CLAY ROAD SINGAPORE 470012')
    expect(onChange).toHaveBeenLastCalledWith('12 CLAY ROAD #05-12 SINGAPORE 470012')
  })

  it('does not save when OneMap finds nothing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    supabase.functions.invoke.mockResolvedValue({
      data: { error: 'No address matches that postal code.', results: [] },
      error: { message: 'Edge Function returned a non-2xx status code' },
    })
    render(<PostalAddressFields value="12 Coffee Road" onChange={onChange} />)

    await user.type(screen.getByLabelText('Postal code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Find addresses' }))

    expect(await screen.findByText('No address matches that postal code.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^Full address/)).toHaveValue('12 Coffee Road')
  })
})
