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

  it('reverts a partial query that is not a planning area', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderSelect({ value: 'Changi', onChange })

    await user.click(screen.getByRole('combobox'))
    await user.clear(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'Katong')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveValue('Changi')
  })
})

function renderSelect({ value = '', onChange } = {}) {
  function Harness() {
    const [area, setArea] = useState(value)
    return (
      <label>
        Area
        <PlanningAreaSelect
          value={area}
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
