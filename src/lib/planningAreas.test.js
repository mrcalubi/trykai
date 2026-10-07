import { describe, expect, it } from 'vitest'
import {
  PLANNING_AREAS,
  PLANNING_AREA_NAMES,
  REGIONS,
  regionForPlanningArea,
} from './planningAreas'

describe('planningAreas', () => {
  it('is the 55 URA planning areas, each tagged with one of the five regions', () => {
    expect(PLANNING_AREAS).toHaveLength(55)
    expect(new Set(PLANNING_AREA_NAMES).size).toBe(55)
    expect(PLANNING_AREAS.every((area) => REGIONS.includes(area.region))).toBe(true)
    expect(new Set(PLANNING_AREAS.map((area) => area.region))).toEqual(new Set(REGIONS))
  })

  it('maps a planning area to its region, case-insensitively', () => {
    expect(regionForPlanningArea('Bedok')).toBe('East')
    expect(regionForPlanningArea('  tampines  ')).toBe('East')
    expect(regionForPlanningArea('Ang Mo Kio')).toBe('North-East')
    expect(regionForPlanningArea('Bukit Batok')).toBe('West')
    expect(regionForPlanningArea('Novena')).toBe('Central')
    expect(regionForPlanningArea('Woodlands')).toBe('North')
  })

  it('does not guess at neighbourhoods that are not planning areas', () => {
    expect(regionForPlanningArea('Tiong Bahru')).toBeNull()
    expect(regionForPlanningArea('Katong')).toBeNull()
    expect(regionForPlanningArea('')).toBeNull()
    expect(regionForPlanningArea(null)).toBeNull()
  })
})
