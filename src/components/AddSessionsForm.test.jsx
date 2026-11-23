import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AddSessionsForm from './AddSessionsForm'
import { formatDayLabel, formatDayTitle } from '../lib/sessionCalendar'
import {
  addSingaporeDays,
  generateRecurringDates,
  singaporeDateKey,
} from '../lib/sessionBatch'
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

function dayLabel(dateKey) {
  return formatDayTitle(dateKey).replace(',', '')
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

const addButton = () => screen.getByRole('button', { name: /^Add (\d+ sessions?|sessions)$/ })
const rows = () => [...document.querySelectorAll('.add-dates__row-day')].map((el) => el.textContent)

async function pickDates(user, ...dateKeys) {
  await user.click(screen.getByRole('button', { name: 'Pick dates' }))
  for (const dateKey of dateKeys) await selectCalendarDate(user, dateKey)
}

async function addOtherTime(user, time) {
  await user.click(screen.getByRole('button', { name: 'Other time' }))
  fireEvent.change(screen.getByLabelText('Other start time'), { target: { value: time } })
  await user.click(screen.getByRole('button', { name: 'Add', exact: true }))
}

function renderForm(props = {}) {
  const onCreated = vi.fn().mockResolvedValue({})
  const onCancel = vi.fn()
  const utils = renderWithRouter(
    <AddSessionsForm
      listing={listing}
      existingSessions={[]}
      subtitle="Latte art · 1 booked, no open dates"
      onCancel={onCancel}
      onCreated={onCreated}
      {...props}
    />,
    { route: '/hosting', path: '/hosting' },
  )
  return { ...utils, onCreated, onCancel }
}

beforeEach(() => {
  window.sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  delete HTMLElement.prototype.scrollIntoView
})

describe('Add dates sheet', () => {
  it('is one dialog with one way out and one main button', async () => {
    const { user, onCancel } = renderForm()
    const sheet = screen.getByRole('dialog', { name: 'Add dates' })

    expect(within(sheet).getByText('Latte art · 1 booked, no open dates')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus()
    expect(within(sheet).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(within(sheet).getByText('No sessions yet')).toBeInTheDocument()
    expect(addButton()).toHaveTextContent('Add sessions')
    // The batch limit stays out of sight until the host goes over it.
    expect(within(sheet).queryByText(/40/)).not.toBeInTheDocument()
    // The length is said once.
    expect(within(sheet).getAllByText(/1\.5 hr/)).toHaveLength(1)

    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('asks for a day and a time before adding', async () => {
    const { user, onCreated } = renderForm()
    await user.click(addButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one day and a start time.')
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('Every week', () => {
  it('repeats the picked days for the next weeks and counts what it adds', async () => {
    const { user, onCreated } = renderForm()
    expect(screen.getByRole('button', { name: 'Every week' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(`Starting ${dayLabel(dateKeyFromToday(1))}. You can remove single dates below.`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4 weeks' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Sat' }))
    await user.click(screen.getByRole('button', { name: 'Sun' }))
    await user.click(screen.getByRole('button', { name: '2 weeks' }))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))

    const dates = generateRecurringDates({ weekdays: [6, 7], everyWeeks: 1, forWeeks: 2 })
    expect(rows()).toEqual(dates.map(dayLabel))
    expect(screen.getByText('16 spots for guests to book')).toBeInTheDocument()
    expect(document.querySelector('.add-dates__count')).toHaveTextContent('4 sessions')
    expect(screen.getAllByText('10:00 am – 11:30 am')).toHaveLength(4)

    await user.click(addButton())
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ spots: 4, duration: 90, usesListingDuration: true, alsoListingIds: [] }),
    )
    expect(onCreated.mock.calls[0][0].accepted.map((item) => item.dateKey)).toEqual(dates)
  })

  it('drops a single session with its ×, keeping that date\'s other time', async () => {
    const { user, onCreated } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Sat' }))
    await user.click(screen.getByRole('button', { name: '2 weeks' }))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    await user.click(screen.getByRole('button', { name: '2:00 pm' }))
    const [first] = generateRecurringDates({ weekdays: [6], everyWeeks: 1, forWeeks: 2 })
    expect(addButton()).toHaveTextContent('Add 4 sessions')

    await user.click(screen.getByRole('button', { name: `Remove ${dayLabel(first)}, 10:00 am` }))

    expect(addButton()).toHaveTextContent('Add 3 sessions')
    expect(screen.queryByRole('button', { name: `Remove ${dayLabel(first)}, 10:00 am` })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Remove ${dayLabel(first)}, 2:00 pm` })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: `Remove ${dayLabel(first)}, 2:00 pm` }))
    expect(addButton()).toHaveTextContent('Add 2 sessions')
    await user.click(addButton())
    expect(onCreated.mock.calls[0][0].accepted.some((item) => item.dateKey === first)).toBe(false)
  })

  it('shows five sessions, then the rest on request', async () => {
    const { user } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Sat' }))
    await user.click(screen.getByRole('button', { name: 'Sun' }))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    expect(rows()).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'See all 8' }))
    expect(rows()).toHaveLength(8)
    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(rows()).toHaveLength(5)
  })

  it('says the batch limit only when the host goes over it', async () => {
    const { user, onCreated } = renderForm()
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      await user.click(screen.getByRole('button', { name: day }))
    }
    await user.click(screen.getByRole('button', { name: '8 weeks' }))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))

    expect(screen.getByText(/That's 56 sessions\. You can add up to 40 at a time/)).toBeInTheDocument()
    expect(screen.getByText('Up to 40 at a time')).toBeInTheDocument()
    await user.click(addButton())
    expect(screen.getByRole('alert')).toHaveTextContent('You can add up to 40 sessions at a time.')
    expect(onCreated).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '4 weeks' }))
    expect(addButton()).toHaveTextContent('Add 28 sessions')
  })
})

describe('Pick dates', () => {
  it('shows the calendar and the bookable window', async () => {
    const { user } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Pick dates' }))
    expect(screen.getByText(/^Tap dates to add them\. Bookable from tomorrow to \d+ \w+\.$/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Days of the week' })).not.toBeInTheDocument()

    const first = dateKeyFromToday(1)
    await selectCalendarDate(user, first)
    await user.click(screen.getByRole('button', { name: '9:00 am' }))
    expect(rows()).toEqual([dayLabel(first)])

    // Tapping a picked date takes it off again.
    await selectCalendarDate(user, first)
    expect(rows()).toEqual([])
  })
})

describe('What time', () => {
  it('toggles start times and adds another time as a picked chip', async () => {
    const { user } = renderForm()
    await pickDates(user, dateKeyFromToday(1))
    const ten = screen.getByRole('button', { name: '10:00 am' })
    await user.click(ten)
    expect(ten).toHaveAttribute('aria-pressed', 'true')
    await user.click(ten)
    expect(ten).toHaveAttribute('aria-pressed', 'false')

    await addOtherTime(user, '16:45')
    expect(screen.getByRole('button', { name: '4:45 pm' })).toHaveAttribute('aria-pressed', 'true')
    expect(addButton()).toHaveTextContent('Add 1 session')

    // Enter adds the time too, and never submits the sheet.
    await user.click(screen.getByRole('button', { name: 'Other time' }))
    const input = screen.getByLabelText('Other start time')
    fireEvent.change(input, { target: { value: '08:15' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button', { name: '8:15 am' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks for a length when the listing has none', async () => {
    const { user, onCreated } = renderForm({ listing: { ...listing, duration_mins: null } })
    await pickDates(user, dateKeyFromToday(1))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    expect(screen.getByText('Add how long each session runs to see them here.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/How long is each session/), { target: { value: '45' } })
    expect(screen.getByText('10:00 am – 10:45 am')).toBeInTheDocument()
    await user.click(addButton())
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ duration: 45, usesListingDuration: false }))
  })
})

describe('Different times on different days', () => {
  it('copies the picked times onto each date, and uses the first date when switched back', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await pickDates(user, first, second)
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    await user.click(screen.getByRole('button', { name: '2:00 pm' }))

    await user.click(screen.getByRole('button', { name: 'Different times on different days?' }))

    expect(within(dateRow(first)).getByLabelText('Time')).toHaveValue('10:00')
    expect(within(dateRow(first)).getByLabelText('Time 2')).toHaveValue('14:00')
    expect(within(dateRow(second)).getByLabelText('Time')).toHaveValue('10:00')

    fireEvent.change(within(dateRow(second)).getByLabelText('Time'), { target: { value: '15:00' } })
    const removes = within(dateRow(second)).getAllByRole('button', { name: 'Remove' })
    await user.click(removes[removes.length - 1])
    expect(addButton()).toHaveTextContent('Add 3 sessions')

    await user.click(screen.getByRole('button', { name: 'Use the same times every day' }))
    expect(screen.getByRole('button', { name: '10:00 am' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '2:00 pm' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: formatDayTitle(first) })).not.toBeInTheDocument()
    expect(addButton()).toHaveTextContent('Add 4 sessions')
  })

  it('removes a date, and focuses a picked date\'s row when tapped again', async () => {
    const { user } = renderForm()
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await user.click(screen.getByRole('button', { name: 'Different times on different days?' }))
    expect(screen.getByText('Pick some days first.')).toBeInTheDocument()
    await pickDates(user, first, second)

    expect(within(dateRow(second)).getByLabelText('Time')).toHaveFocus()
    await selectCalendarDate(user, first)
    expect(within(dateRow(first)).getByLabelText('Time')).toHaveFocus()
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()

    await user.click(within(dateRow(second)).getByRole('button', { name: 'Remove date' }))
    expect(screen.queryByRole('group', { name: formatDayTitle(second) })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: new RegExp(formatDayLabel(second)) }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('names a picked date that still has no time', async () => {
    const { user, onCreated } = renderForm()
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await pickDates(user, first, second)
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    await user.click(screen.getByRole('button', { name: 'Different times on different days?' }))
    fireEvent.change(within(dateRow(second)).getByLabelText('Time'), { target: { value: '' } })

    await user.click(addButton())

    expect(screen.getByRole('alert')).toHaveTextContent(
      `Add a time for ${dayLabel(second)}, or remove that date.`,
    )
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('Also offer on another listing', () => {
  it('is a switch with one sentence on how the slot is shared', async () => {
    const { user, onCreated } = renderForm({ otherListings: [{ id: 'listing-2', title: 'Pottery taster' }] })
    const toggle = screen.getByRole('switch', { name: 'Also offer these times on Pottery taster' })
    expect(toggle).not.toBeChecked()
    expect(
      screen.getByText(
        'Whichever gets booked first takes the slot. The other closes, and reopens if that booking is cancelled.',
      ),
    ).toBeInTheDocument()

    await user.click(toggle)
    await pickDates(user, dateKeyFromToday(1))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    expect(screen.getByText('4 spots for guests to book · on 2 listings')).toBeInTheDocument()
    await user.click(addButton())
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ alsoListingIds: ['listing-2'] }))
  })

  it('lists each listing when there are several', () => {
    renderForm({
      otherListings: [
        { id: 'listing-2', title: 'Pottery' },
        { id: 'listing-3', title: 'Boxing' },
      ],
    })
    expect(screen.getByText('Also offer these times on')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Pottery' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Boxing' })).toBeInTheDocument()
    expect(screen.getByText(/The others close, and reopen/)).toBeInTheDocument()
  })
})

describe('Add dates keeps its draft', () => {
  it('comes back with the same dates and times after leaving', async () => {
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    const { user, unmount } = renderForm()
    await pickDates(user, first, second)
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    await user.click(screen.getByRole('button', { name: 'Different times on different days?' }))
    fireEvent.change(within(dateRow(second)).getByLabelText('Time'), { target: { value: '14:15' } })

    unmount()
    renderForm()

    expect(screen.getByRole('button', { name: 'Pick dates' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dateRow(first)).getByLabelText('Time')).toHaveValue('10:00')
    expect(within(dateRow(second)).getByLabelText('Time')).toHaveValue('14:15')
  })

  it('keeps a dropped session dropped', async () => {
    const { user, unmount } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Sat' }))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    const [first] = generateRecurringDates({ weekdays: [6], everyWeeks: 1, forWeeks: 4 })
    await user.click(screen.getByRole('button', { name: `Remove ${dayLabel(first)}, 10:00 am` }))
    expect(addButton()).toHaveTextContent('Add 3 sessions')

    unmount()
    renderForm()
    expect(addButton()).toHaveTextContent('Add 3 sessions')
    expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('starts empty for a different listing', async () => {
    const { user, unmount } = renderForm()
    await pickDates(user, dateKeyFromToday(1))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    unmount()

    renderForm({ listing: { ...listing, id: 'listing-2' } })

    expect(screen.getByRole('button', { name: '10:00 am' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
  })
})

describe('Add dates session types', () => {
  const TYPES = [
    { id: 't1', name: 'Hand-tied bouquet' },
    { id: 't2', name: 'Table centrepiece' },
  ]

  async function fillOneDate(user) {
    await pickDates(user, dateKeyFromToday(1))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
  }

  it('shows no type picker for a listing without types', () => {
    renderForm()
    expect(screen.queryByRole('group', { name: 'Which class?' })).not.toBeInTheDocument()
  })

  it('asks for a type, then sends it with the batch', async () => {
    const { user, onCreated } = renderForm({ sessionTypes: TYPES })
    await fillOneDate(user)
    await user.click(addButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a class for these dates.')

    await user.click(screen.getByRole('radio', { name: 'Table centrepiece' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(addButton())
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ typeId: 't2' }))
  })

  it('picks the only type for the host', async () => {
    const { user, onCreated } = renderForm({ sessionTypes: [TYPES[0]] })
    expect(screen.getByRole('radio', { name: 'Hand-tied bouquet' })).toBeChecked()
    await fillOneDate(user)
    await user.click(addButton())
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ typeId: 't1' }))
  })

  it('sends no type for a listing without types', async () => {
    const { user, onCreated } = renderForm()
    await fillOneDate(user)
    await user.click(addButton())
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ typeId: null }))
  })
})
