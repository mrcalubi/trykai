import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AddSessionsForm from './AddSessionsForm'
import { formatDayLabel, formatDayTitle } from '../lib/sessionCalendar'
import {
  addSingaporeDays,
  singaporeDateKey,
  singaporeDateTime,
} from '../lib/sessionBatch'
import { formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import { renderWithRouter } from '../test/render'

const listing = {
  id: 'listing-1',
  title: 'Latte art',
  duration_mins: 90,
  max_guests: 4,
}

function dateKeyFromToday(daysAhead) {
  return addSingaporeDays(singaporeDateKey(Date.now()), daysAhead)
}

async function selectCalendarDate(user, dateKey) {
  const name = new RegExp(formatDayLabel(dateKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!screen.queryByRole('button', { name })) {
    await user.click(screen.getByRole('button', { name: 'Next month' }))
  }
  if (!screen.queryByRole('button', { name })) {
    await user.click(screen.getByRole('button', { name: 'Next month' }))
  }
  await user.click(screen.getByRole('button', { name }))
}

function dateRow(dateKey) {
  return screen.getByRole('group', { name: formatDayTitle(dateKey) })
}

async function removeLastTime(user, row) {
  const buttons = within(row).getAllByRole('button', { name: 'Remove' })
  await user.click(buttons[buttons.length - 1])
}

function renderForm(props = {}) {
  const onCreated = vi.fn().mockResolvedValue({})
  const onCancel = vi.fn()
  const utils = renderWithRouter(
    <AddSessionsForm
      listing={listing}
      existingSessions={[]}
      onCancel={onCancel}
      onCreated={onCreated}
      {...props}
    />,
    { route: '/hosting', path: '/hosting' },
  )
  return { ...utils, onCreated, onCancel }
}

describe('AddSessionsForm per-date times', () => {
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    scrollIntoView.mockReset()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    delete HTMLElement.prototype.scrollIntoView
  })

  it('defaults to the same times for every date', () => {
    renderForm()

    expect(screen.getByRole('checkbox', { name: /Set times per date/ })).not.toBeChecked()
    expect(screen.getByText('Same times for every date.')).toBeInTheDocument()
    expect(screen.getByLabelText('Time')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove date' })).not.toBeInTheDocument()
  })

  it('copies shared times onto each date when the toggle turns on, and uses the first date when it turns off', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await selectCalendarDate(user, first)
    await selectCalendarDate(user, second)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } })
    await user.click(screen.getByRole('button', { name: '+ add time' }))
    fireEvent.change(screen.getByLabelText('Time 2'), { target: { value: '14:00' } })

    await user.click(screen.getByRole('checkbox', { name: /Set times per date/ }))

    expect(screen.getByRole('checkbox', { name: /Set times per date/ })).toBeChecked()
    expect(within(dateRow(first)).getByLabelText('Time')).toHaveValue('10:00')
    expect(within(dateRow(first)).getByLabelText('Time 2')).toHaveValue('14:00')
    expect(within(dateRow(second)).getByLabelText('Time')).toHaveValue('10:00')
    expect(within(dateRow(second)).getByLabelText('Time 2')).toHaveValue('14:00')

    fireEvent.change(within(dateRow(second)).getByLabelText('Time'), { target: { value: '15:00' } })
    await removeLastTime(user, dateRow(second))

    await user.click(screen.getByRole('checkbox', { name: /Set times per date/ }))

    expect(screen.getByRole('checkbox', { name: /Set times per date/ })).not.toBeChecked()
    expect(screen.getByLabelText('Time')).toHaveValue('10:00')
    expect(screen.getByLabelText('Time 2')).toHaveValue('14:00')
    expect(screen.queryByRole('group', { name: formatDayTitle(first) })).not.toBeInTheDocument()
  })

  it('adds and removes a time on one date without changing the other', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await selectCalendarDate(user, first)
    await selectCalendarDate(user, second)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } })
    await user.click(screen.getByRole('checkbox', { name: /Set times per date/ }))

    await user.click(within(dateRow(first)).getByRole('button', { name: '+ add time' }))
    fireEvent.change(within(dateRow(first)).getByLabelText('Time 2'), { target: { value: '14:00' } })

    expect(within(dateRow(first)).getByLabelText('Time 2')).toHaveValue('14:00')
    expect(within(dateRow(second)).queryByLabelText('Time 2')).not.toBeInTheDocument()

    await removeLastTime(user, dateRow(first))

    expect(within(dateRow(first)).queryByLabelText('Time 2')).not.toBeInTheDocument()
    expect(within(dateRow(first)).getByLabelText('Time')).toHaveValue('10:00')
    expect(within(dateRow(second)).getByLabelText('Time')).toHaveValue('10:00')
  })

  it('removes the row when a date is unpicked', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await selectCalendarDate(user, first)
    await selectCalendarDate(user, second)
    await user.click(screen.getByRole('checkbox', { name: /Set times per date/ }))

    expect(dateRow(second)).toBeInTheDocument()
    await user.click(within(dateRow(second)).getByRole('button', { name: 'Remove date' }))

    expect(screen.queryByRole('group', { name: formatDayTitle(second) })).not.toBeInTheDocument()
    expect(dateRow(first)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(formatDayLabel(second)) })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('scrolls to and focuses a picked date\'s row in per-date mode', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    await user.click(screen.getByRole('checkbox', { name: /Set times per date/ }))
    await selectCalendarDate(user, first)

    expect(within(dateRow(first)).getByLabelText('Time')).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalled()

    scrollIntoView.mockClear()
    await selectCalendarDate(user, first)

    expect(within(dateRow(first)).getByLabelText('Time')).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalled()
    expect(dateRow(first)).toBeInTheDocument()
  })

  it('reviews every session grouped by date', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await selectCalendarDate(user, first)
    await selectCalendarDate(user, second)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } })
    await user.click(screen.getByRole('button', { name: '+ add time' }))
    fireEvent.change(screen.getByLabelText('Time 2'), { target: { value: '14:00' } })
    await user.click(screen.getByRole('checkbox', { name: /Set times per date/ }))
    fireEvent.change(within(dateRow(second)).getByLabelText('Time'), { target: { value: '15:00' } })
    await removeLastTime(user, dateRow(second))

    await user.click(screen.getByRole('button', { name: 'Review sessions' }))

    expect(screen.getByText('This creates 3 sessions.')).toBeInTheDocument()
    const preview = screen.getByRole('status')
    const firstGroup = within(preview)
      .getByText(formatSessionDay(singaporeDateTime(first, '10:00')))
      .closest('.add-sessions__preview-group')
    const secondGroup = within(preview)
      .getByText(formatSessionDay(singaporeDateTime(second, '15:00')))
      .closest('.add-sessions__preview-group')
    expect(within(firstGroup).getByText(formatSessionTime(singaporeDateTime(first, '10:00')))).toBeInTheDocument()
    expect(within(firstGroup).getByText(formatSessionTime(singaporeDateTime(first, '14:00')))).toBeInTheDocument()
    expect(within(secondGroup).getByText(formatSessionTime(singaporeDateTime(second, '15:00')))).toBeInTheDocument()
    expect(within(secondGroup).queryByText(formatSessionTime(singaporeDateTime(second, '14:00')))).not.toBeInTheDocument()
  })

  it('shows a calendar count on dates with more than one time', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    await selectCalendarDate(user, first)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } })
    await user.click(screen.getByRole('button', { name: '+ add time' }))
    fireEvent.change(screen.getByLabelText('Time 2'), { target: { value: '14:00' } })

    expect(
      screen.getByRole('button', { name: new RegExp(`${formatDayLabel(first)}, selected, 2 times`) }),
    ).toBeInTheDocument()
  })

  it('still offers the same starts on another listing', async () => {
    const { user } = renderForm({
      otherListings: [{ id: 'listing-2', title: 'Pottery' }],
    })
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await selectCalendarDate(user, first)
    await selectCalendarDate(user, second)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } })
    await user.click(screen.getByRole('checkbox', { name: /Set times per date/ }))
    fireEvent.change(within(dateRow(second)).getByLabelText('Time'), { target: { value: '15:00' } })
    await user.click(screen.getByRole('checkbox', { name: 'Pottery' }))
    await user.click(screen.getByRole('button', { name: 'Review sessions' }))

    expect(screen.getByText(/on each of 2 listings/)).toBeInTheDocument()
    expect(screen.getByText('This creates 2 sessions on each of 2 listings.')).toBeInTheDocument()
  })
})
