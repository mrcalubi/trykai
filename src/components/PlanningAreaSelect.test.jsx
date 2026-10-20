import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PlanningAreaSelect from './PlanningAreaSelect'

describe('PlanningAreaSelect', () => {
  it('opens the full list on focus and filters as the host types', async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'Bedok' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tampines' })).toBeInTheDocument()

    await user.type(screen.getByRole('combobox'), 'tamp')

    expect(screen.getByRole('option', { name: 'Tampines' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Bedok' })).not.toBeInTheDocument()
  })

  it('saves the official planning area name when an option is chosen', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderSelect({ onChange })

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'Bedok')
    await user.click(screen.getByRole('option', { name: 'Bedok' }))

    expect(onChange).toHaveBeenCalledWith('Bedok')
    expect(screen.getByRole('combobox')).toHaveValue('Bedok')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('accepts an exact typed name on blur without a click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderSelect({ onChange })

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'bedok')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith('Bedok')
    expect(screen.getByRole('combobox')).toHaveValue('Bedok')
  })

  it('says when the query matches no planning area', async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.type(screen.getByRole('combobox'), 'zzzz')

    expect(screen.getByText('No matching planning areas')).toBeInTheDocument()
  })

  it('offers one row per planning area for a multi-area neighbourhood', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderSelect({ onChange })

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'Joo Chiat')

    expect(screen.getByRole('option', { name: 'Geylang (Joo Chiat)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Marine Parade (Joo Chiat)' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Geylang (Joo Chiat)' }))

    expect(onChange).toHaveBeenCalledWith('Geylang')
    expect(screen.getByRole('combobox')).toHaveValue('Geylang')
  })

  it('keeps a multi-area typed name invalid until the host picks a row', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderSelect({ value: 'Changi', onChange })

    await user.click(screen.getByRole('combobox'))
    await user.clear(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'Jalan Besar')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveValue('Jalan Besar')
    expect(screen.getByRole('combobox')).toBeInvalid()
    expect(screen.getByText('Pick an area from the list.')).toBeInTheDocument()
  })

  it('resolves a neighbourhood alias to the planning area', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderSelect({ onChange })

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'Kembangan')

    expect(screen.getByRole('option', { name: 'Bedok (Kembangan)' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Bedok (Kembangan)' }))

    expect(onChange).toHaveBeenCalledWith('Bedok')
    expect(screen.getByRole('combobox')).toHaveValue('Bedok')
  })

  it('hides uninhabited planning areas unless they are the current value', async () => {
    const user = userEvent.setup()
    renderSelect({ hideUninhabited: true })

    await user.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('option', { name: 'Central Water Catchment' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bedok' })).toBeInTheDocument()
  })

  it('keeps a hidden current value so existing listings can still be saved', async () => {
    const user = userEvent.setup()
    renderSelect({ value: 'Simpang', hideUninhabited: true })

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'Simpang' })).toBeInTheDocument()
  })
})

function renderSelect({ value = '', onChange, hideUninhabited = false } = {}) {
  function Harness() {
    const [area, setArea] = useState(value)
    return (
      <label>
        Area
        <PlanningAreaSelect
          value={area}
          hideUninhabited={hideUninhabited}
          onChange={(name) => {
            onChange?.(name)
            setArea(name)
          }}
        />
      </label>
    )
  }

  return render(<Harness />)
}
