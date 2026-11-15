/**
 * Frontend reader for the baked JPL Horizons ephemeris buffer.
 *
 * File: /data/ephemerides/ephemerides_3yr.bin (see DATA_SOURCES.md / ASSETS.md).
 * Content: hourly topocentric apparent Sun (Horizons id 10) and Earth (id 399) directions
 * from each candidate site, 2026-11-14T00:00Z to 2029-11-14T00:00Z inclusive (26,305 hours).
 * Encoding: little-endian Float32, one record = [azimuth_deg, elevation_deg].
 *   - azimuth: degrees, clockwise from local north (N -> E), 0..360
 *   - elevation: degrees above the local (spherical, terrain-free) horizon
 * 26,305 hours x 4 sites x 2 bodies = 210,440 records = 1,683,520 bytes.
 *
 * Record order is [site][body][hour] (see recordIndex). The generator script is not in the repo; the order
 * was verified from the data: hour-to-hour steps are smooth (Sun azimuth ~0.51 deg/h = 360 deg / synodic month).
 */

export const EPHEMERIS_URL = '/data/ephemerides/ephemerides_3yr.bin'
export const EPHEMERIS_START_MS = Date.UTC(2026, 10, 14, 0, 0, 0) // 2026-11-14T00:00Z
export const EPHEMERIS_HOURS = 26305
const HOUR_MS = 3600 * 1000

/**
 * Site order inside the buffer (same order as data/landing_sites.json). Keys match the /vista-sitio/:siteKey routes.
 * Verified against geometry: max Sun elevation ~ colatitude + 1.54 deg (lunar obliquity) and
 * Earth azimuth ~ 360 - site longitude (sub-Earth point near lon 0), for all 4 sites.
 */
export const EPHEMERIS_SITES = ['shackleton', 'malapert', 'nobile', 'degerlache'] as const
export type EphemerisSiteKey = (typeof EPHEMERIS_SITES)[number]

const BODIES = ['sun', 'earth'] as const
type Body = (typeof BODIES)[number]

export interface BodyDirection {
  azimuth: number
  elevation: number
  /** Above the geometric horizon (elevation > 0). Terrain blocking is NOT included. */
  isAbove: boolean
}

export interface EphemerisSample {
  sun: BodyDirection
  earth: BodyDirection
}

let buffer: Float32Array | null = null
let loading: Promise<Float32Array> | null = null

/** Loads the buffer once and caches it in memory. Safe to call repeatedly. */
export function loadEphemeridesBuffer(): Promise<Float32Array> {
  if (buffer) return Promise.resolve(buffer)
  if (!loading) {
    loading = fetch(EPHEMERIS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Ephemeris fetch failed: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((ab) => {
        const arr = new Float32Array(ab)
        const expected = EPHEMERIS_HOURS * EPHEMERIS_SITES.length * BODIES.length * 2
        if (arr.length !== expected) {
          console.warn(`Ephemeris buffer has ${arr.length} floats, expected ${expected}`)
        }
        buffer = arr
        return arr
      })
      .catch((e) => {
        loading = null
        throw e
      })
  }
  return loading
}

export function isEphemeridesLoaded(): boolean {
  return buffer !== null
}

/** Float offset of the [azimuth, elevation] pair. Layout assumption: [site][body][hour]. */
function recordIndex(site: number, body: number, hour: number): number {
  return ((site * BODIES.length + body) * EPHEMERIS_HOURS + hour) * 2
}

function sampleBody(buf: Float32Array, site: number, body: number, h0: number, t: number): BodyDirection {
  const i0 = recordIndex(site, body, h0)
  const i1 = recordIndex(site, body, Math.min(h0 + 1, EPHEMERIS_HOURS - 1))
  // Azimuth: interpolate along the shortest arc to handle the 360 -> 0 wrap.
  const az0 = buf[i0]
  let dAz = buf[i1] - az0
  if (dAz > 180) dAz -= 360
  if (dAz < -180) dAz += 360
  const azimuth = (((az0 + dAz * t) % 360) + 360) % 360
  const elevation = buf[i0 + 1] + (buf[i1 + 1] - buf[i0 + 1]) * t
  return { azimuth, elevation, isAbove: elevation > 0 }
}

/**
 * Linear interpolation between the two bracketing hourly samples.
 * Returns null if the buffer is not loaded, the site is unknown or the date is out of range.
 */
export function getEphemerisAt(siteKey: string, date: Date): EphemerisSample | null {
  if (!buffer) return null
  const site = EPHEMERIS_SITES.indexOf(siteKey as EphemerisSiteKey)
  if (site < 0) return null
  const hours = (date.getTime() - EPHEMERIS_START_MS) / HOUR_MS
  if (!(hours >= 0 && hours <= EPHEMERIS_HOURS - 1)) return null
  const h0 = Math.floor(hours)
  const t = hours - h0
  const out = {} as Record<Body, BodyDirection>
  BODIES.forEach((b, bi) => {
    out[b] = sampleBody(buffer!, site, bi, h0, t)
  })
  return out
}

/** Planetocentric lat / lon (deg) of the 4 sites the buffer was computed for (same order as EPHEMERIS_SITES). */
export const EPHEMERIS_SITE_LATLON: Record<EphemerisSiteKey, [number, number]> = {
  shackleton: [-89.54, 129.2],
  malapert: [-85.99, 2.93],
  nobile: [-85.25, 35.8],
  degerlache: [-88.71, -68.7],
}

/**
 * Raw hourly [azimuth, elevation] pairs of one body seen from one buffer site, hours [h0, h1).
 * Returns null if the buffer is not loaded.
 */
export function getRawTrack(
  siteKey: EphemerisSiteKey,
  body: 'sun' | 'earth',
  h0: number,
  h1: number,
): Float32Array | null {
  if (!buffer) return null
  const site = EPHEMERIS_SITES.indexOf(siteKey)
  const bi = BODIES.indexOf(body)
  const start = recordIndex(site, bi, h0)
  return buffer.subarray(start, start + (h1 - h0) * 2)
}
