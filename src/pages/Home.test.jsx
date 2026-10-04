import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeListing, makeSession } from '../test/fixtures'

vi.mock('../lib/supabase')

const LATTE = makeListing({
  id: 'l-1',
  title: 'Latte art',
  category: 'Food',
  area: 'Tiong Bahru',
  price_per_person: 4500,
})
const BOXING = makeListing({
  id: 'l-2',
  title: 'Boxing basics',
  category: 'Fitness',
  area: 'Bedok',
  price_per_person: 3000,
})
const POTTERY = makeListing({
  id: 'l-3',
  title: 'Pottery hour',
  category: 'Arts',
  area: 'Bedok',
  price_per_person: 6000,
})

function givenListings(listings) {
  supabase.__on('listings', 'select', { data: listings, error: null })
}

function listingTitles() {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

beforeEach(() => {
  supabase.__reset()
})

describe('Home loading and error states', () => {
  it('shows a loading message until the listings arrive', () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    expect(screen.getByText('Loading listings…')).toBeInTheDocument()
  })

  it('surfaces a fetch failure to the user', async () => {
    supabase.__on('listings', 'select', { data: null, error: { message: 'network down' } })
    renderWithRouter(<Home />)

    expect(await screen.findByText('network down')).toBeInTheDocument()
    expect(screen.queryByText('Loading listings…')).not.toBeInTheDocument()
  })

  it('invites the user back when there is nothing to browse', async () => {
    givenListings([])
    renderWithRouter(<Home />)

    expect(await screen.findByText('No listings yet. Check back soon.')).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "Singapore's not boring. You just haven't found your thing yet.",
      })
    ).toBeInTheDocument()
  })
})

describe('Home listing grid', () => {
  it('renders a card per active listing', async () => {
    givenListings([LATTE, BOXING])
    renderWithRouter(<Home />)

    expect(await screen.findByText('Latte art')).toBeInTheDocument()
    expect(screen.getByText(/\$51\/person/)).toBeInTheDocument()
    expect(screen.getByText('Boxing basics')).toBeInTheDocument()
    expect(listingTitles()).toEqual(['Latte art', 'Boxing basics'])
  })

  it('makes the whole card a link to the listing, badged with its category', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)

    const card = await screen.findByRole('link', { name: /Latte art/ })
    expect(card).toHaveAttribute('href', '/listings/l-1')
    expect(within(card).getByRole('heading', { level: 2, name: 'Latte art' })).toBeInTheDocument()
    expect(within(card).getByText('Food')).toBeInTheDocument()
  })

  it('shows the price alone while a listing has no rating', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)

    const card = await screen.findByRole('link', { name: /Latte art/ })
    expect(within(card).getByText('$51/person')).toBeInTheDocument()
    expect(card.textContent).not.toContain('★')
    expect(card.textContent).not.toContain('·')
  })

  it('shows the rating only when listing_ratings returns reviews', async () => {
    givenListings([LATTE, BOXING])
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'listing_ratings') {
        return { data: [{ listing_id: 'l-1', average: 4.8, review_count: 12 }], error: null }
      }
      return { data: null, error: null }
    })
    renderWithRouter(<Home />)

    const latte = await screen.findByRole('link', { name: /Latte art/ })
    expect(latte.textContent).toContain('$51/person')
    expect(latte.textContent).toContain('★ 4.8 (12)')
    expect(latte.textContent).not.toContain('·')
    const boxing = screen.getByRole('link', { name: /Boxing basics/ })
    expect(boxing.textContent).not.toContain('★')
    expect(within(boxing).getByText('$34/person')).toBeInTheDocument()
  })

  it('asks listing_ratings once for every listing on the page', async () => {
    givenListings([LATTE, BOXING])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('listing_ratings', {
      listing_ids: ['l-1', 'l-2'],
    })
  })

  it('shows the landing headline above the grid', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "Singapore's not boring. You just haven't found your thing yet.",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Solo, with friends, or on a date/)
    ).toBeInTheDocument()
  })

  it('only asks the database for active listings, newest first', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const call = supabase.__lastCall('listings', 'select')
    expect(call.filters).toContainEqual({ method: 'eq', column: 'is_active', value: true })
    expect(call.chain).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    })
    const select = call.chain.find((step) => step.method === 'select')?.args[0]
    expect(select).not.toMatch(/full_name/)
    expect(select).not.toMatch(/host:users/)
  })

  it('embeds only open sessions that have not started yet', async () => {
    const before = Date.now()
    givenListings([LATTE])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const call = supabase.__lastCall('listings', 'select')
    const select = call.chain.find((step) => step.method === 'select')?.args[0]
    expect(select).toMatch(/sessions\s*\(\s*starts_at,\s*status\s*\)/)
    expect(call.filters).toContainEqual({ method: 'eq', column: 'sessions.status', value: 'open' })
    const startsAfter = call.filters.find(
      (filter) => filter.method === 'gt' && filter.column === 'sessions.starts_at'
    )
    expect(new Date(startsAfter.value).getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe('Home listing order', () => {
  const KNIFE_SKILLS = makeListing({
    id: 'l-4',
    title: 'Knife skills',
    category: 'Food',
    area: 'Bedok',
    sessions: [],
  })
  const LATTE_NEXT_WEEK = {
    ...LATTE,
    sessions: [makeSession({ starts_at: '2099-03-17T02:00:00.000Z' })],
  }
  const BOXING_TUESDAY_MORNING = {
    ...BOXING,
    sessions: [makeSession({ starts_at: '2099-03-10T01:00:00.000Z' })],
  }
  const POTTERY_TUESDAY_EVENING_WEEKLY = {
    ...POTTERY,
    sessions: [
      makeSession({ starts_at: '2099-03-10T11:00:00.000Z' }),
      makeSession({ starts_at: '2099-03-17T11:00:00.000Z' }),
      makeSession({ starts_at: '2099-03-24T11:00:00.000Z' }),
    ],
  }
  const NEWEST_FIRST = [
    KNIFE_SKILLS,
    LATTE_NEXT_WEEK,
    BOXING_TUESDAY_MORNING,
    POTTERY_TUESDAY_EVENING_WEEKLY,
  ]

  it('leads with the soonest session date, then the most sessions, then listings with none', async () => {
    givenListings(NEWEST_FIRST)
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    expect(listingTitles()).toEqual(['Pottery hour', 'Boxing basics', 'Latte art', 'Knife skills'])
  })

  it('keeps that order inside a filtered grid', async () => {
    givenListings(NEWEST_FIRST)
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.selectOptions(screen.getByLabelText('Filter by area'), 'Bedok')

    expect(listingTitles()).toEqual(['Pottery hour', 'Boxing basics', 'Knife skills'])
  })
})

describe('Home filters', () => {
  it('offers an All pill plus one per category, alphabetically', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const pills = within(document.querySelector('.filter-pills'))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(pills).toEqual(['All', 'Arts', 'Fitness', 'Food'])
  })

  it('narrows the grid to the chosen category', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Fitness' }))

    expect(listingTitles()).toEqual(['Boxing basics'])
  })

  it('narrows the grid to the chosen area', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.selectOptions(screen.getByLabelText('Filter by area'), 'Bedok')

    expect(listingTitles()).toEqual(['Boxing basics', 'Pottery hour'])
  })

  it('combines the category and area filters', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Arts' }))
    await user.selectOptions(screen.getByLabelText('Filter by area'), 'Bedok')

    expect(listingTitles()).toEqual(['Pottery hour'])
  })

  it('explains when a filter combination matches nothing', async () => {
    givenListings([LATTE, BOXING])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Food' }))
    await user.selectOptions(screen.getByLabelText('Filter by area'), 'Bedok')

    expect(screen.getByText('No listings match your filters.')).toBeInTheDocument()
  })

  it('restores the full grid when All is selected again', async () => {
    givenListings([LATTE, BOXING])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Fitness' }))
    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(listingTitles()).toEqual(['Latte art', 'Boxing basics'])
  })

  it('lists each area once even when several listings share it', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const options = within(screen.getByLabelText('Filter by area'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['All areas', 'Bedok', 'Tiong Bahru'])
  })

  it('ignores listings with no category when building the pills', async () => {
    givenListings([LATTE, makeListing({ id: 'l-9', title: 'Uncategorised', category: null })])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const pills = within(document.querySelector('.filter-pills'))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(pills).toEqual(['All', 'Food'])
  })
})
