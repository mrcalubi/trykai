import { sessionDayLabel } from './hostSessions'
import { datesLabel } from './sessionTypes'

/**
 * The listing page's two pickers, "Where" and "What you'll make" (DECISIONS.md,
 * 26 November 2026). Every option says how many dates it has and when the next
 * one is; a class that doesn't run at the chosen place (or a place without the
 * chosen class) is greyed with where it does run, instead of showing a 0.
 *
 * `sessions` are every upcoming session of the listing ({ starts_at, type_id,
 * location_id }); `places` are public locations ({ id, label, area, name }).
 */

/** Sessions still to come, soonest first. */
export function upcoming(sessions, now = Date.now()) {
  return (sessions ?? [])
    .filter((session) => new Date(session.starts_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
}

/** Sessions at a place and of a class; a null id matches all. */
export function matching(sessions, { placeId = null, classId = null } = {}) {
  return (sessions ?? []).filter(
    (session) =>
      (!placeId || session.location_id === placeId) && (!classId || session.type_id === classId),
  )
}

/** "23 dates · next Sat 28 Nov", or "No dates yet". */
export function datesMeta(sessions, now = Date.now()) {
  const shown = upcoming(sessions, now)
  if (shown.length === 0) return 'No dates yet'
  return `${datesLabel(shown.length)} · next ${sessionDayLabel(shown[0].starts_at, now)}`
}

/** "Bedok", "Bishan or Bedok", "Bishan, Bedok or Tampines". */
export function joinWords(words, last = 'or') {
  const list = [...new Set((words ?? []).filter(Boolean))]
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} ${last} ${list[list.length - 1]}`
}

/** The short name of a place: its area, else its own name. */
export function placeShort(place) {
  return String(place?.area || place?.label || place?.name || '').trim()
}

/** "Thomson studio, Bishan" in the Where field; the area alone without a name. */
export function placeFieldValue(place) {
  const label = String(place?.label ?? '').trim()
  const area = String(place?.area ?? '').trim()
  if (label && area && label.toLowerCase() !== area.toLowerCase()) return `${label}, ${area}`
  return label || area || String(place?.name ?? '')
}

/** "Any place · Bishan or Bedok". */
export function anyPlaceValue(places) {
  const areas = joinWords((places ?? []).map(placeShort))
  return areas ? `Any place · ${areas}` : 'Any place'
}

/** "Any of 4 classes". */
export function anyClassValue(classes) {
  const count = classes?.length ?? 0
  return count === 1 ? 'Any class' : `Any of ${count} classes`
}

/** Places (in their order) with upcoming dates of a class. */
export function placesOfClass(sessions, classId, places, now = Date.now()) {
  const at = new Set(upcoming(matching(sessions, { classId }), now).map((session) => session.location_id))
  return (places ?? []).filter((place) => at.has(place.id))
}

/**
 * Where a class runs, on its card: "Bedok only", or "Bishan and Bedok". Empty
 * for a class with no dates.
 */
export function classPlacesLine(sessions, classId, places, now = Date.now()) {
  const at = placesOfClass(sessions, classId, places, now)
  if (at.length === 0) return ''
  if (at.length === 1 && (places?.length ?? 0) > 1) return `${placeShort(at[0])} only`
  return joinWords(at.map(placeShort), 'and')
}

/** "Same price at every place and class.", or '' with nothing to pick. */
export function samePriceLine({ places = false, classes = false } = {}) {
  if (places && classes) return 'Same price at every place and class.'
  if (places) return 'Same price at every place.'
  if (classes) return 'Same price for every class.'
  return ''
}

/**
 * The place options: "Any place" first, then each place with its dates. With a
 * class picked, counts are of that class, and a place without it is greyed.
 */
export function placeOptions({ sessions, places, classId = null, className = '', now = Date.now() }) {
  const any = matching(sessions, { classId })
  return [
    { id: null, name: 'Any place', meta: datesMeta(any, now), greyed: false },
    ...(places ?? []).map((place) => {
      const here = upcoming(matching(sessions, { placeId: place.id, classId }), now)
      const greyed = Boolean(classId) && here.length === 0
      return {
        id: place.id,
        name: place.label || placeShort(place),
        meta: greyed
          ? `No ${className || 'such class'} here`
          : [place.label && place.area ? place.area : '', datesMeta(here, now)].filter(Boolean).join(' · '),
        greyed,
      }
    }),
  ]
}

/**
 * The class options: "Any class" first, then each class with its dates. With a
 * place picked, counts are at that place, and a class that runs elsewhere is
 * greyed with "Only at Bedok".
 */
export function classOptions({ sessions, classes, places, placeId = null, now = Date.now() }) {
  const any = matching(sessions, { placeId })
  return [
    { id: null, name: 'Any class', meta: datesMeta(any, now), greyed: false },
    ...(classes ?? []).map((type) => {
      const here = upcoming(matching(sessions, { placeId, classId: type.id }), now)
      if (!placeId || here.length > 0) {
        return { id: type.id, name: type.name, photoUrl: type.photoUrl ?? null, meta: datesMeta(here, now), greyed: false }
      }
      const elsewhere = placesOfClass(sessions, type.id, places, now)
      return {
        id: type.id,
        name: type.name,
        photoUrl: type.photoUrl ?? null,
        meta: elsewhere.length ? `Only at ${joinWords(elsewhere.map(placeShort), 'and')}` : 'No dates yet',
        greyed: true,
      }
    }),
  ]
}
