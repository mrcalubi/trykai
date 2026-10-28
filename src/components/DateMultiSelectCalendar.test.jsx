import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DateMultiSelectCalendar from './DateMultiSelectCalendar'

function renderCalendar(props = {}) {
  const handlers = {
    onToggleDate: vi.fn(),
    onPrevMonth: vi.fn(),
    onNextMonth: vi.fn(),
  }
  render(
    <DateMultiSelectCalendar
      monthKey="2026-10"
      selectedDateKeys={['2026-10-18']}
      minDateKey="2026-10-18"
      maxDateKey="2027-01-05"
      todayKey="2026-10-17"
      canGoPrev={false}
      canGoNext
      {...handlers}
      {...props}
    />
  )
  return { user: userEvent.setup(), ...handlers }
}

describe('DateMultiSelectCalendar', () => {
  it('lets the host toggle a date inside the window', async () => {
    const { user, onToggleDate } = renderCalendar()

    await user.click(screen.getByRole('button', { name: /18 October/ }))

    expect(onToggleDate).toHaveBeenCalledExactlyOnceWith('2026-10-18')
    expect(screen.getByRole('button', { name: /18 October/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('disables today and dates before the window', () => {
    renderCalendar()

    expect(screen.getByRole('button', { name: /17 October/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /16 October/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /18 October/ })).toBeEnabled()
  })

  it('marks every selected date as pressed', () => {
    renderCalendar({ selectedDateKeys: ['2026-10-18', '2026-10-24'] })

    expect(screen.getByRole('button', { name: /18 October, selected/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /24 October, selected/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      within(screen.getByRole('group', { name: 'October 2026' }))
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
    ).toHaveLength(2)
  })
})

describe('selected day contrast', () => {
  it('keeps picked days cream on navy even though the day buttons are enabled', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const rule = css.match(
      /\.session-calendar__day--selected,\s*\n\.session-calendar__day--selected:enabled,\s*\n\.session-calendar__day--selected:hover \{[\s\S]*?\n\}/,
    )?.[0]
    expect(rule).toBeTruthy()
    expect(rule).toMatch(/color:\s*var\(--cream\)/)
    expect(rule).toMatch(/background:\s*var\(--primary\)/)
    expect(css.indexOf(rule)).toBeGreaterThan(css.indexOf('.session-calendar__day:enabled {'))
  })
})
