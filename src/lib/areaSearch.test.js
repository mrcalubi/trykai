import { describe, expect, it } from 'vitest'
import { EXTRA_AREA_ALIASES } from '../data/areaAliases'
import { acceptedPlanningAreaFromLookup, planningAreaForAlias, searchAreaOptions } from './areaSearch'

describe('areaSearch', () => {
  it('maps official subzones and leaves the stored value as the planning area', () => {
    expect(planningAreaForAlias('Kembangan')).toBe('Bedok')
    expect(planningAreaForAlias('kembangan')).toBe('Bedok')
    expect(planningAreaForAlias('Bugis')).toBe('Downtown Core')
    expect(planningAreaForAlias('Katong')).toBe('Marine Parade')
    expect(planningAreaForAlias('Chinatown')).toBe('Outram')
    expect(planningAreaForAlias('Little India')).toBe('Rochor')
    expect(planningAreaForAlias('Tiong Bahru')).toBe('Bukit Merah')
    expect(planningAreaForAlias('Bedok')).toBe('Bedok')
  })

  it('does not pick one planning area when an alias maps to several', () => {
    expect(planningAreaForAlias('Jalan Besar')).toBeNull()
    expect(planningAreaForAlias('Joo Chiat')).toBeNull()
    expect(planningAreaForAlias('Holland Village')).toBeNull()
    expect(planningAreaForAlias('Tanah Merah')).toBeNull()
  })

  it('maps a single-area extra alias', () => {
    expect(planningAreaForAlias('Dempsey')).toBe('Tanglin')
  })

  it('labels an alias match as planning area (neighbourhood)', () => {
    expect(searchAreaOptions('Kembangan')).toEqual([{ name: 'Bedok', label: 'Bedok (Kembangan)' }])
    expect(searchAreaOptions('bedok').some((row) => row.label === 'Bedok')).toBe(true)
  })

  it('returns one row per planning area for a multi-area extra', () => {
    expect(searchAreaOptions('Joo Chiat')).toEqual([
      { name: 'Geylang', label: 'Geylang (Joo Chiat)' },
      { name: 'Marine Parade', label: 'Marine Parade (Joo Chiat)' },
    ])
    expect(EXTRA_AREA_ALIASES.every((row) => row.source === 'TryKai editorial, multi-area')).toBe(
      true,
    )
  })

  it('accepts a OneMap planning-area name the host picker can store', () => {
    expect(acceptedPlanningAreaFromLookup('QUEENSTOWN')).toBe('Queenstown')
    expect(acceptedPlanningAreaFromLookup('queenstown')).toBe('Queenstown')
    expect(acceptedPlanningAreaFromLookup('Kembangan')).toBe('Bedok')
  })

  it('rejects uninhabited or unknown OneMap names unless already stored', () => {
    expect(acceptedPlanningAreaFromLookup('WESTERN ISLANDS')).toBeNull()
    expect(acceptedPlanningAreaFromLookup('Western Islands', 'Western Islands')).toBe(
      'Western Islands',
    )
    expect(acceptedPlanningAreaFromLookup('Not a place')).toBeNull()
    expect(acceptedPlanningAreaFromLookup('')).toBeNull()
  })
})
