import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import PostalAddressFields from './PostalAddressFields'

vi.mock('../lib/supabase')

beforeEach(() => {
  supabase.__reset()
})

function Harness({
  value: initialValue = '',
  area: initialArea = '',
  onChange,
  onAreaChange,
  allowChangeAddress,
}) {
  const [value, setValue] = useState(initialValue)
  const [area, setArea] = useState(initialArea)
  return (
    <PostalAddressFields
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      area={area}
      onAreaChange={(next) => {
        setArea(next)
        onAreaChange(next)
      }}
      allowChangeAddress={allowChangeAddress}
    />
  )
}

function renderFields(props = {}) {
  const onChange = props.onChange ?? vi.fn()
  const onAreaChange = props.onAreaChange ?? vi.fn()
  render(
    <Harness
      value={props.value}
      area={props.area}
      onChange={onChange}
      onAreaChange={onAreaChange}
      allowChangeAddress={props.allowChangeAddress}
    />,
  )
  return { onChange, onAreaChange }
}

describe('PostalAddressFields', () => {
  it('does not look up until six digits are entered', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFields()

    await user.type(screen.getByLabelText('Postal code'), '123')

    expect(screen.queryByRole('button', { name: 'Find addresses' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unit number (optional)')).not.toBeInTheDocument()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByText('Hidden from guests until they book.')).not.toBeInTheDocument()
  })

  it('shows a non-interactive lookup status under the postal field', async () => {
    const user = userEvent.setup()
    let finishLookup
    supabase.functions.invoke.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve
      }),
    )
    renderFields()

    await user.type(screen.getByLabelText('Postal code'), '470012')

    const looking = await screen.findByRole('status')
    expect(looking).toHaveTextContent('Looking up your address…')
    expect(looking.querySelector('.tk-spinner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Looking up/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()

    finishLookup({
      data: {
        results: [{ address: '12 COFFEE ROAD SINGAPORE 470012', postal: '470012' }],
        planning_area: 'BEDOK',
      },
      error: null,
    })
    expect(await screen.findByText('12 COFFEE ROAD SINGAPORE 470012')).toBeInTheDocument()
    expect(screen.getByLabelText('Unit number (optional)')).toBeInTheDocument()
  })

  it('looks up once six digits are entered and shows a confirmed card', async () => {
    const user = userEvent.setup()
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [{ address: '12 COFFEE ROAD SINGAPORE 470012', postal: '470012' }],
        planning_area: 'BEDOK',
      },
      error: null,
    })
    const { onChange, onAreaChange } = renderFields()

    await user.type(screen.getByLabelText('Postal code'), '470012')

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('12 COFFEE ROAD SINGAPORE 470012'),
    )
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('lookup-postal-code', {
      body: { postal: '470012' },
    })
    expect(onAreaChange).toHaveBeenCalledWith('Bedok')
    expect(screen.getByText('12 COFFEE ROAD SINGAPORE 470012')).toBeInTheDocument()
    expect(screen.getByText('Hidden from guests until they book.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Full address/)).not.toBeInTheDocument()
  })

  it('does not look up the same code twice in a row', async () => {
    const user = userEvent.setup()
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [{ address: '12 COFFEE ROAD SINGAPORE 470012', postal: '470012' }],
        planning_area: 'BEDOK',
      },
      error: null,
    })
    renderFields()

    await user.type(screen.getByLabelText('Postal code'), '470012')
    await screen.findByText('12 COFFEE ROAD SINGAPORE 470012')
    await user.click(screen.getByLabelText('Unit number (optional)'))
    await user.tab()

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
  })

  it('clears the picked address when the postal code changes', async () => {
    const user = userEvent.setup()
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [{ address: '12 COFFEE ROAD SINGAPORE 470012', postal: '470012' }],
        planning_area: 'BEDOK',
      },
      error: null,
    })
    const { onChange } = renderFields()

    await user.type(screen.getByLabelText('Postal code'), '470012')
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('12 COFFEE ROAD SINGAPORE 470012'),
    )
    await user.type(screen.getByLabelText('Postal code'), '{backspace}')

    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('lets the host pick among several matches and add a unit', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFields()
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [
          { address: '10 CLAY ROAD SINGAPORE 470010', postal: '470010' },
          { address: '12 CLAY ROAD SINGAPORE 470012', postal: '470012' },
        ],
        planning_area: 'BEDOK',
      },
      error: null,
    })

    await user.type(screen.getByLabelText('Postal code'), '470012')
    expect(screen.queryByLabelText('Unit number (optional)')).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: '12 CLAY ROAD SINGAPORE 470012' }))
    await user.type(screen.getByLabelText('Unit number (optional)'), '#05-12')

    expect(onChange).toHaveBeenCalledWith('12 CLAY ROAD SINGAPORE 470012')
    expect(onChange).toHaveBeenLastCalledWith('12 CLAY ROAD #05-12 SINGAPORE 470012')
    expect(screen.getByText('12 CLAY ROAD #05-12 SINGAPORE 470012')).toBeInTheDocument()
  })

  it('shows the existing error and Try again when OneMap finds nothing', async () => {
    const user = userEvent.setup()
    supabase.functions.invoke.mockResolvedValue({
      data: { error: 'No address matches that postal code.', results: [] },
      error: { message: 'Edge Function returned a non-2xx status code' },
    })
    const { onChange } = renderFields({ value: '12 Coffee Road' })

    await user.type(screen.getByLabelText('Postal code'), '000000')

    expect(await screen.findByText('No address matches that postal code.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.queryByText('12 Coffee Road')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
  })

  it('keeps a saved edit address until a new one is picked', async () => {
    const user = userEvent.setup()
    const { onChange, onAreaChange } = renderFields({
      value: '12 Coffee Road',
      area: 'Bedok',
      allowChangeAddress: true,
    })

    expect(screen.getByText('12 Coffee Road')).toBeInTheDocument()
    expect(screen.queryByLabelText('Postal code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unit number (optional)')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change address' }))
    expect(screen.getByText('12 Coffee Road')).toBeInTheDocument()

    let finishLookup
    supabase.functions.invoke.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve
      }),
    )
    await user.type(screen.getByLabelText('Postal code'), '520123')

    expect(onChange).not.toHaveBeenCalledWith('')
    expect(screen.getByText('12 Coffee Road')).toBeInTheDocument()
    finishLookup({
      data: {
        results: [{ address: '5 ESPRESSO LANE SINGAPORE 520123', postal: '520123' }],
        planning_area: 'TAMPINES',
      },
      error: null,
    })
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('5 ESPRESSO LANE SINGAPORE 520123'),
    )
    expect(onAreaChange).toHaveBeenCalledWith('Tampines')
    expect(screen.getByText('5 ESPRESSO LANE SINGAPORE 520123')).toBeInTheDocument()
  })

  it('leaves Area alone when the planning area is missing or unmapped', async () => {
    const user = userEvent.setup()
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [{ address: '12 COFFEE ROAD SINGAPORE 470012', postal: '470012' }],
        planning_area: 'WESTERN ISLANDS',
      },
      error: null,
    })
    const { onAreaChange } = renderFields({ area: 'Bedok' })

    await user.type(screen.getByLabelText('Postal code'), '470012')
    await screen.findByText('12 COFFEE ROAD SINGAPORE 470012')

    expect(onAreaChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Area guests see')).toHaveValue('Bedok')
    expect(
      screen.getByText(
        'Filled from your postal code. Change it if guests know your spot by another name.',
      ),
    ).toBeInTheDocument()
  })
})
