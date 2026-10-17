/**
 * URA Master Plan planning areas, grouped into the five regions used on browse.
 * Names and region tags must match the seed in
 * supabase/migrations/00016_planning_areas.sql.
 */

export const REGIONS = ['Central', 'North', 'North-East', 'East', 'West']

export const PLANNING_AREAS = [
  { name: 'Ang Mo Kio', region: 'North-East' },
  { name: 'Bedok', region: 'East' },
  { name: 'Bishan', region: 'Central' },
  { name: 'Boon Lay', region: 'West' },
  { name: 'Bukit Batok', region: 'West' },
  { name: 'Bukit Merah', region: 'Central' },
  { name: 'Bukit Panjang', region: 'West' },
  { name: 'Bukit Timah', region: 'Central' },
  { name: 'Central Water Catchment', region: 'North' },
  { name: 'Changi', region: 'East' },
  { name: 'Changi Bay', region: 'East' },
  { name: 'Choa Chu Kang', region: 'West' },
  { name: 'Clementi', region: 'West' },
  { name: 'Downtown Core', region: 'Central' },
  { name: 'Geylang', region: 'Central' },
  { name: 'Hougang', region: 'North-East' },
  { name: 'Jurong East', region: 'West' },
  { name: 'Jurong West', region: 'West' },
  { name: 'Kallang', region: 'Central' },
  { name: 'Lim Chu Kang', region: 'North' },
  { name: 'Mandai', region: 'North' },
  { name: 'Marina East', region: 'Central' },
  { name: 'Marina South', region: 'Central' },
  { name: 'Marine Parade', region: 'Central' },
  { name: 'Museum', region: 'Central' },
  { name: 'Newton', region: 'Central' },
  { name: 'North-Eastern Islands', region: 'North-East' },
  { name: 'Novena', region: 'Central' },
  { name: 'Orchard', region: 'Central' },
  { name: 'Outram', region: 'Central' },
  { name: 'Pasir Ris', region: 'East' },
  { name: 'Paya Lebar', region: 'East' },
  { name: 'Pioneer', region: 'West' },
  { name: 'Punggol', region: 'North-East' },
  { name: 'Queenstown', region: 'Central' },
  { name: 'River Valley', region: 'Central' },
  { name: 'Rochor', region: 'Central' },
  { name: 'Seletar', region: 'North-East' },
  { name: 'Sembawang', region: 'North' },
  { name: 'Sengkang', region: 'North-East' },
  { name: 'Serangoon', region: 'North-East' },
  { name: 'Simpang', region: 'North' },
  { name: 'Singapore River', region: 'Central' },
  { name: 'Southern Islands', region: 'Central' },
  { name: 'Straits View', region: 'Central' },
  { name: 'Sungei Kadut', region: 'North' },
  { name: 'Tampines', region: 'East' },
  { name: 'Tanglin', region: 'Central' },
  { name: 'Tengah', region: 'West' },
  { name: 'Toa Payoh', region: 'Central' },
  { name: 'Tuas', region: 'West' },
  { name: 'Western Islands', region: 'West' },
  { name: 'Western Water Catchment', region: 'West' },
  { name: 'Woodlands', region: 'North' },
  { name: 'Yishun', region: 'North' },
]

export const PLANNING_AREA_NAMES = PLANNING_AREAS.map((area) => area.name)

const REGION_BY_LOWER_NAME = new Map(
  PLANNING_AREAS.map((area) => [area.name.toLowerCase(), area.region])
)

export function regionForPlanningArea(name) {
  if (!name) return null
  return REGION_BY_LOWER_NAME.get(String(name).trim().toLowerCase()) ?? null
}
