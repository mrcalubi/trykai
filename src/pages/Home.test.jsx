import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import { supabase } from '../lib/supabase'
import { PAGE_LOAD_ERROR } from '../lib/pageLoad'
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

// The location filter only appears from 8 listings across 2+ regions. These
// fillers sit in the West, so East and Central filters never show them.
const WEST_FILLERS = Array.from({ length: 6 }, (_, i) =>
  makeListing({
    id: `w-${i}`,
    title: `West filler ${i}`,
    category: 'Other',
    area: 'Jurong West',
    price_per_person: 9000,
    created_at: '2026-01-01T00:00:00Z',
  })
)

function withFillers(listings) {
  return [...listings, ...WEST_FILLERS]
}

async function openLocationAgain(user, name) {
  await user.click(screen.getByRole('button', { name }))
}

async function openLocation(user) {
  await user.click(screen.getByRole('button', { name: /Anywhere/ }))
}

function realTitles() {
  return listingTitles().filter((title) => !title.startsWith('West filler'))
}

function listingTitles() {
  return within(document.querySelector('.listings-grid'))
    .getAllByRole('heading', { level: 3 })
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

  it('surfaces a fetch failure to the user without the raw error', async () => {
    supabase.__on('listings', 'select', { data: null, error: { message: 'network down' } })
    renderWithRouter(<Home />)

    expect(await screen.findByText(PAGE_LOAD_ERROR)).toBeInTheDocument()
    expect(screen.queryByText('network down')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading listings…')).not.toBeInTheDocument()
  })

  it('retries a JWT issued-at-future error once after a second', async () => {
    supabase.__once('listings', 'select', {
      data: null,
      error: { message: 'JWT issued at future' },
    })
    givenListings([LATTE])
    renderWithRouter(<Home />)

    expect(screen.getByText('Loading listings…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Latte art' }, { timeout: 2500 })).toBeInTheDocument()
    expect(screen.queryByText(/issued at future/i)).not.toBeInTheDocument()
  })

  it('shows the friendly message when the JWT retry still fails', async () => {
    supabase.__on('listings', 'select', {
      data: null,
      error: { message: 'JWT issued at future' },
    })
    renderWithRouter(<Home />)

    expect(await screen.findByText(PAGE_LOAD_ERROR, {}, { timeout: 2500 })).toBeInTheDocument()
    expect(screen.queryByText(/issued at future/i)).not.toBeInTheDocument()
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
    expect(within(card).getByRole('heading', { level: 3, name: 'Latte art' })).toBeInTheDocument()
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

    const ratingCalls = supabase.rpc.mock.calls.filter(([name]) => name === 'listing_ratings')
    expect(ratingCalls).toEqual([['listing_ratings', { listing_ids: ['l-1', 'l-2'] }]])
  })

  it('leaves the date off cards without sessions, and shows the keen pill from 2', async () => {
    givenListings([LATTE, BOXING])
    supabase.rpc.mockImplementation(async (name) =>
      name === 'listing_keen_counts'
        ? { data: [{ listing_id: 'l-1', keen_count: 4 }, { listing_id: 'l-2', keen_count: 1 }], error: null }
        : { data: [], error: null }
    )
    renderWithRouter(<Home />)
    expect(await screen.findByText('4 keen')).toBeInTheDocument()
    expect(screen.queryByText('No dates yet')).not.toBeInTheDocument()
    expect(screen.getAllByText('Tiong Bahru').length).toBeGreaterThan(0)
    expect(screen.queryByText('1 keen')).not.toBeInTheDocument()
    const keenCall = supabase.rpc.mock.calls.find(([name]) => name === 'listing_keen_counts')
    expect(keenCall[1].p_listing_ids.sort()).toEqual(['l-1', 'l-2'])
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
    expect(call.filters).toContainEqual({ method: 'eq', column: 'review_status', value: 'approved' })
    expect(call.chain).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    })
    const select = call.chain.find((step) => step.method === 'select')?.args[0]
    expect(select).not.toMatch(/full_name/)
    expect(select).not.toMatch(/full_address/)
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
    givenListings(withFillers(NEWEST_FIRST))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await openLocation(user)
    await user.selectOptions(screen.getByLabelText('Filter by region'), 'East')

    expect(listingTitles()).toEqual(['Pottery hour', 'Boxing basics', 'Knife skills'])
  })
})

describe('Home filters', () => {
  it('offers All plus only the categories that have listings', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const pills = within(document.querySelector('.filter-pills'))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(pills).toEqual(['All', 'Food', 'Fitness', 'Arts'])
  })

  it('narrows the grid to the chosen category', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Fitness' }))

    expect(listingTitles()).toEqual(['Boxing basics'])
  })

  it('honours a category query so an email can land on a filtered browse', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    renderWithRouter(<Home />, { route: '/?category=Fitness' })
    await screen.findByText('Boxing basics')

    expect(listingTitles()).toEqual(['Boxing basics'])
    expect(screen.queryByText('Latte art')).not.toBeInTheDocument()
  })

  it('narrows the grid to the chosen region', async () => {
    givenListings(withFillers([LATTE, BOXING, POTTERY]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await openLocation(user)
    await user.selectOptions(screen.getByLabelText('Filter by region'), 'East')

    expect(listingTitles()).toEqual(['Boxing basics', 'Pottery hour'])
    expect(screen.getByRole('button', { name: /East/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps a neighbourhood that is not a planning area off every region filter', async () => {
    givenListings(withFillers([LATTE, BOXING]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await openLocation(user)
    await user.selectOptions(screen.getByLabelText('Filter by region'), 'Central')

    expect(screen.getByText('No listings match your filters.')).toBeInTheDocument()
  })

  it('combines the category and region filters', async () => {
    givenListings(withFillers([LATTE, BOXING, POTTERY]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Arts' }))
    await openLocation(user)
    await user.selectOptions(screen.getByLabelText('Filter by region'), 'East')

    expect(listingTitles()).toEqual(['Pottery hour'])
  })

  it('explains when a filter combination matches nothing', async () => {
    givenListings(withFillers([LATTE, BOXING]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Food' }))
    await openLocation(user)
    await user.selectOptions(screen.getByLabelText('Filter by region'), 'East')

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

  it('resolves a neighbourhood alias to the planning area', async () => {
    givenListings(withFillers([LATTE, BOXING, POTTERY]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await openLocation(user)
    await user.click(screen.getByLabelText('Filter by area'))
    await user.type(screen.getByLabelText('Filter by area'), 'Kembangan')
    await user.click(screen.getByRole('option', { name: 'Bedok (Kembangan)' }))

    expect(listingTitles()).toEqual(['Boxing basics', 'Pottery hour'])
    // Picking an area closes the panel and names it on the chip.
    expect(screen.getByRole('button', { name: /Bedok/ })).toHaveAttribute('aria-expanded', 'false')
    await openLocationAgain(user, /Bedok/)
    expect(screen.getByLabelText('Filter by area')).toHaveValue('Bedok')
  })

  it('always offers All plus the five regions', async () => {
    givenListings(withFillers([LATTE, BOXING, POTTERY]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')
    await openLocation(user)

    const options = within(screen.getByLabelText('Filter by region'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['All regions', 'Central', 'North', 'North-East', 'East', 'West'])
  })

  it('hides categories nobody lists yet, but keeps one a link asked for', async () => {
    givenListings([LATTE, makeListing({ id: 'l-9', title: 'Uncategorised', category: null })])
    renderWithRouter(<Home />, { route: '/?category=Music' })
    await screen.findByText('No listings match your filters.')

    const pills = within(document.querySelector('.filter-pills'))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(pills).toEqual(['All', 'Food', 'Music'])
    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the location filter only from 8 listings across 2 regions', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')
    expect(screen.queryByRole('button', { name: /Anywhere/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by region')).not.toBeInTheDocument()
  })

  it('opens and closes the location panel, and Anywhere clears it', async () => {
    givenListings(withFillers([LATTE, BOXING, POTTERY]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    expect(screen.queryByLabelText('Filter by region')).not.toBeInTheDocument()
    await openLocation(user)
    await user.selectOptions(screen.getByLabelText('Filter by region'), 'East')
    expect(realTitles()).toEqual(['Boxing basics', 'Pottery hour'])
    await user.click(screen.getByRole('button', { name: 'Anywhere' }))
    expect(screen.queryByLabelText('Filter by region')).not.toBeInTheDocument()
    expect(realTitles()).toEqual(['Latte art', 'Boxing basics', 'Pottery hour'])
  })

  it('shows the listing count only while a filter is on', async () => {
    givenListings([LATTE, BOXING])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')
    expect(screen.queryByText('2 of 2 listings')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByText('1 of 2 listings')).toBeInTheDocument()
  })
})

describe('Home hero', () => {
  it('states a typical price instead of the payment rails', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const chips = document.querySelector('.trust-list')
    expect(within(chips).getByText('Most sessions under S$30')).toBeInTheDocument()
    expect(within(chips).queryByText('Pay by PayNow or Card')).not.toBeInTheDocument()
  })

  it('keeps the desktop hero short enough for the first cards', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{[\s\S]*?\.home-hero__copy \{[\s\S]*?padding:\s*24px 0 28px/,
    )
    expect(css).toMatch(/\.home-hero__art \{[^}]*width:\s*min\(100%, 260px\)/)
  })

  it('centres the mascot between the nav and the category divider', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/\.home-hero__art \{\s*display:\s*none/)
    expect(css).toMatch(
      /@media \(min-width: 768px\) \{\s*\.home-hero__art \{\s*justify-self:\s*center/,
    )
    expect(css).toMatch(/\.home-hero \{\s*display:\s*contents/)
    expect(css).toMatch(/\.home-hero__art \{[^}]*grid-row:\s*1 \/ 3/)
    expect(css).toMatch(/\.home-hero__art \{[^}]*align-self:\s*center/)
    expect(css).toMatch(
      /@media \(min-width: 1280px\) \{\s*\.home-hero__art \{\s*width:\s*min\(100%, 320px\)/,
    )
    expect(css).toMatch(/\.home-hero__badge--1 \{[^}]*width:\s*24%/)
    expect(css).toMatch(/\.home-hero__badge--2 \{[^}]*width:\s*24%/)
    expect(css).toMatch(/\.home-hero__badge--3 \{[^}]*width:\s*24%/)
    expect(css).toMatch(/\.home-hero__badge--4 \{[^}]*width:\s*24%/)
    expect(css).toMatch(/\.home-hero__badge--1 \{[^}]*--badge-img-scale:\s*190%/)
    expect(css).toMatch(/\.home-hero__badge--2 \{[^}]*--badge-img-scale:\s*172%/)
    expect(css).toMatch(/\.home-hero__badge--3 \{[^}]*--badge-img-scale:\s*170%/)
    expect(css).toMatch(/\.home-hero__badge--4 \{[^}]*--badge-img-scale:\s*170%/)
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.home-hero__badge,/,
    )
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.home-hero__badge-inner,/,
    )
  })

  it('wraps each floating badge so a poke can move the outer element', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const art = document.querySelector('.home-hero__art')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    const badges = art.querySelectorAll('.home-hero__badge')
    expect(badges).toHaveLength(4)
    badges.forEach((badge) => {
      expect(badge.querySelector('.home-hero__badge-inner img')).not.toBeNull()
      expect(badge).not.toHaveAttribute('tabindex')
    })
  })
})

describe('Home card details', () => {
  it('shows the host initials and the area on each card', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)

    const card = await screen.findByRole('link', { name: /Latte art/ })
    expect(card.querySelector('.ui-card__host')).toHaveTextContent('M')
    expect(within(card).getByText('Tiong Bahru')).toBeInTheDocument()
  })

  it('asks for the host name and photo but nothing private', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const select = supabase.__lastCall('listings', 'select').chain.find(
      (step) => step.method === 'select'
    )?.args[0]
    expect(select).toMatch(/users!host_id\s*\(\s*display_name,\s*avatar_url\s*\)/)
    expect(select).not.toMatch(/email|phone/)
  })
})

describe('Home quick filters', () => {
  it('offers Under $30 only when a listing qualifies, and narrows the grid', async () => {
    const CHEAP = makeListing({ id: 'l-5', title: 'Cheap chess', category: 'Other', price_per_person: 2000 })
    givenListings([LATTE, CHEAP])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Under $30' }))

    expect(listingTitles()).toEqual(['Cheap chess'])
    expect(screen.getByRole('button', { name: 'Under $30' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides a quick filter that every listing would match', async () => {
    const CHEAP = makeListing({ id: 'l-5', title: 'Cheap chess', category: 'Other', price_per_person: 2000 })
    const CHEAPER = makeListing({ id: 'l-6', title: 'Cheap cards', category: 'Other', price_per_person: 1500 })
    givenListings([CHEAP, CHEAPER])
    renderWithRouter(<Home />)
    await screen.findByText('Cheap chess')

    expect(screen.queryByRole('button', { name: 'Under $30' })).not.toBeInTheDocument()
  })

  it('hides a quick filter nothing would match', async () => {
    givenListings([LATTE, BOXING])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    expect(screen.queryByRole('button', { name: 'Under $30' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'This weekend' })).not.toBeInTheDocument()
  })

  it('clears every filter from the empty state', async () => {
    givenListings(withFillers([LATTE, BOXING]))
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Food' }))
    await openLocation(user)
    await user.selectOptions(screen.getByLabelText('Filter by region'), 'East')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(realTitles()).toEqual(['Latte art', 'Boxing basics'])
  })
})

describe('Home New label', () => {
  it('stays off while most listings are new, and shows once they are not', async () => {
    const fresh = new Date().toISOString()
    const FRESH = makeListing({ id: 'n-1', title: 'Fresh one', created_at: fresh })
    givenListings([FRESH, makeListing({ id: 'n-2', title: 'Fresh two', created_at: fresh })])
    const { unmount } = renderWithRouter(<Home />)
    await screen.findByText('Fresh one')
    expect(screen.queryByText('New')).not.toBeInTheDocument()
    unmount()

    givenListings([FRESH, ...WEST_FILLERS.slice(0, 2)])
    renderWithRouter(<Home />)
    await screen.findByText('Fresh one')
    expect(screen.getAllByText('New')).toHaveLength(1)
  })
})
