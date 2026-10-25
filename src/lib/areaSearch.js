import {
  EXTRA_AREA_ALIASES,
  OFFICIAL_SUBZONE_ALIASES,
} from '../data/areaAliases'
import { PLANNING_AREA_NAMES, hostPlanningAreaNames } from './planningAreas'

function expandAliasRows(rows) {
  const out = []
  for (const row of rows) {
    const areas = Array.isArray(row.areas) ? row.areas : [row.area]
    for (const area of areas) {
      if (area) out.push({ alias: row.alias, area })
    }
  }
  return out
}

const ALIASES = expandAliasRows([...OFFICIAL_SUBZONE_ALIASES, ...EXTRA_AREA_ALIASES])

const AREAS_BY_ALIAS = new Map()
for (const row of ALIASES) {
  const key = row.alias.trim().toLowerCase()
  const list = AREAS_BY_ALIAS.get(key) ?? []
  if (!list.includes(row.area)) list.push(row.area)
  AREAS_BY_ALIAS.set(key, list)
}

const ALIASES_BY_AREA = new Map()
for (const row of ALIASES) {
  const list = ALIASES_BY_AREA.get(row.area) ?? []
  if (!list.includes(row.alias)) list.push(row.alias)
  ALIASES_BY_AREA.set(row.area, list)
}

/** Exact planning-area name, or a single-area alias. Multi-area aliases return null. */
export function planningAreaForAlias(query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return null
  const exactArea = PLANNING_AREA_NAMES.find((name) => name.toLowerCase() === q)
  if (exactArea) return exactArea
  const areas = AREAS_BY_ALIAS.get(q) ?? []
  return areas.length === 1 ? areas[0] : null
}

/** OneMap names are uppercase; only keep values the host picker accepts. */
export function acceptedPlanningAreaFromLookup(raw, current = '') {
  const mapped = planningAreaForAlias(raw)
  if (!mapped) return null
  return hostPlanningAreaNames(current).includes(mapped) ? mapped : null
}

export function searchAreaOptions(query, names = PLANNING_AREA_NAMES) {
  const q = String(query ?? '').trim().toLowerCase()
  const options = []
  for (const name of names) {
    if (!q || name.toLowerCase().includes(q)) {
      options.push({ name, label: name })
      continue
    }
    const alias = (ALIASES_BY_AREA.get(name) ?? []).find((item) =>
      item.toLowerCase().includes(q),
    )
    if (alias) options.push({ name, label: `${name} (${alias})` })
  }
  return options
}
