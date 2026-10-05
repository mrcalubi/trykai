import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SessionCalendar from './SessionCalendar'

function renderCalendar(props = {}) {
  const handlers = {
    onSelectDate: vi.fn(),
    onPrevMonth: vi.fn(),
    onNextMonth: vi.fn(),
  }
  render(
    <SessionCalendar
      monthKey="2026-10"
      countsByDay={{ '2026-10-09': 2, '2026-10-27': 1 }}
      selectedDateKey="2026-10-09"
      todayKey="2026-10-05"
      canGoPrev={false}
      canGoNext
      {...handlers}
      {...props}
    />
  )
  return { user: userEvent.setup(), ...handlers }
}

function dayButtons() {
  return within(screen.getByRole('group', { name: 'October 2026' })).getAllByRole('button')
}

describe('SessionCalendar', () => {
  it('titles the month and lays out one button per day', () => {
    renderCalendar()

    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(dayButtons()).toHaveLength(31)
  })

  it('shows the session count on each date that has sessions', () => {
    renderCalendar()

    const ninth = screen.getByRole('button', { name: 'Friday, 9 October, 2 sessions' })
    expect(ninth).toHaveTextContent('92')
    expect(ninth).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tuesday, 27 October, 1 session' })).toBeEnabled()
  })

  it('greys out dates with no sessions', () => {
    renderCalendar()

    const tenth = screen.getByRole('button', { name: 'Saturday, 10 October, no sessions' })
    expect(tenth).toBeDisabled()
    expect(tenth).toHaveTextContent(/^10$/)
    expect(dayButtons().filter((button) => !button.disabled)).toHaveLength(2)
  })

  it('marks the selected date as pressed and today with its own style', () => {
    renderCalendar()

    expect(screen.getByRole('button', { name: /, 9 October/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: /, 27 October/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('button', { name: /^Monday, 5 October/ })).toHaveClass(
      'session-calendar__day--today'
    )
  })

  it('reports the date a guest picks', async () => {
    const { user, onSelectDate } = renderCalendar()

    await user.click(screen.getByRole('button', { name: /, 27 October/ }))

    expect(onSelectDate).toHaveBeenCalledExactlyOnceWith('2026-10-27')
  })

  it('only steps to months the parent allows', async () => {
    const { user, onPrevMonth, onNextMonth } = renderCalendar()

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next month' }))

    expect(onNextMonth).toHaveBeenCalledOnce()
    expect(onPrevMonth).not.toHaveBeenCalled()
  })

  it('disables Next month at the last month with sessions', () => {
    renderCalendar({ canGoPrev: true, canGoNext: false })

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
  })

  it('flags itself busy while a month is loading', () => {
    renderCalendar({ loading: true, countsByDay: {} })

    expect(document.querySelector('.session-calendar')).toHaveAttribute('aria-busy', 'true')
    expect(dayButtons().every((button) => button.disabled)).toBe(true)
  })

  it('uses buttons that do not submit a surrounding form', () => {
    renderCalendar()

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button')
    }
  })
})
