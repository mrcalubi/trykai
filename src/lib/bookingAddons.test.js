import { describe, expect, it } from 'vitest'
import {
  addonLineLabel,
  clampAddonQuantities,
  guestAddonPriceLabel,
  guestFirstName,
  maxAddonQuantity,
  pickedAddonLines,
  prepareAddonsSentence,
  sessionPrepareBoxes,
  sumAddonLines,
} from './bookingAddons'

const blooms = {
  id: 'blooms',
  name: 'Premium blooms',
  price_cents: 1500,
  unit: 'person',
  session_limit: 4,
}

const wrap = {
  id: 'wrap',
  name: 'Gift wrap',
  price_cents: 800,
  unit: 'booking',
  session_limit: null,
}

describe('booking addon helpers', () => {
  it('labels guest prices and prepare lines', () => {
    expect(guestAddonPriceLabel(blooms)).toBe('+$17 per person')
    expect(guestAddonPriceLabel(wrap)).toBe('+$9 per booking')
    expect(addonLineLabel('Premium blooms', 1)).toBe('Premium blooms × 1')
    expect(prepareAddonsSentence([{ name: 'Premium blooms', quantity: 1 }, { name: 'Gift wrap', quantity: 2 }])).toBe(
      'Add-ons to prepare: Premium blooms × 1, Gift wrap × 2.',
    )
    expect(guestFirstName('Alex Tan')).toBe('Alex')
  })

  it('clamps per-person quantities when guests drop', () => {
    expect(maxAddonQuantity(blooms, 2, 4)).toBe(2)
    expect(maxAddonQuantity(wrap, 2, null)).toBe(1)
    expect(
      clampAddonQuantities({ blooms: 3, wrap: 1 }, [blooms, wrap], 1, { blooms: 4 }),
    ).toEqual({ blooms: 1, wrap: 1 })
  })

  it('picks only selected lines and sums names across bookings', () => {
    expect(pickedAddonLines([blooms, wrap], { blooms: 2, wrap: 0 })).toEqual([
      { ...blooms, quantity: 2, hostUnitCents: 1500 },
    ])
    expect(
      sumAddonLines([
        { name: 'Premium blooms', quantity: 1 },
        { name: 'Gift wrap', quantity: 1 },
        { name: 'Premium blooms', quantity: 1 },
      ]),
    ).toEqual([
      { name: 'Premium blooms', quantity: 2 },
      { name: 'Gift wrap', quantity: 1 },
    ])
  })

  it('builds a Prepare box per upcoming session', () => {
    const sessions = [
      {
        id: 's1',
        bookings: [
          { id: 'b1', status: 'confirmed', guest_id: 'g1' },
          { id: 'b2', status: 'pending', guest_id: 'g2' },
        ],
      },
    ]
    const boxes = sessionPrepareBoxes(
      sessions,
      [
        { booking_id: 'b1', name: 'Premium blooms', quantity: 1 },
        { booking_id: 'b1', name: 'Gift wrap', quantity: 2 },
      ],
      { b1: { guestId: 'g1', note: 'For Alex' } },
      { g1: 'Mei Ling' },
    )
    expect(boxes.s1).toEqual({
      lines: [
        { name: 'Premium blooms', quantity: 1 },
        { name: 'Gift wrap', quantity: 2 },
      ],
      notes: [{ name: 'Mei', note: 'For Alex' }],
    })
  })

  it('still builds a box when the only thing to show is a guest note', () => {
    const boxes = sessionPrepareBoxes(
      [{ id: 's1', bookings: [{ id: 'b1', status: 'confirmed', guest_id: 'g1' }] }],
      [],
      { b1: { guestId: 'g1', note: 'Allergic to nuts' } },
      { g1: 'Sam Chen' },
    )
    expect(boxes.s1).toEqual({
      lines: [],
      notes: [{ name: 'Sam', note: 'Allergic to nuts' }],
    })
  })
})
