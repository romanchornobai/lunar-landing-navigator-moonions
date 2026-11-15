/**
 * Step 4 of the visibility model in the browser (same formulas as backend/app/services/visibility.py):
 *   Sun visible           any part of the disc above the terrain: El_sun + R_sun > H(Az_sun), R_sun = 0.266 deg
 *                         (the backend also computes the exact visible area fraction; this file only needs f > 0)
 *   DTE link active       El_earth > H(Az_earth)
 * H(theta): LOLA horizon of each site (data/horizonProfiles.json, backend/app/scripts/compute_horizon.py).
 * Sun / Earth directions: hourly JPL Horizons buffer (utils/ephemerisClient.ts) of the nearest of its 4 sites,
 * re-projected on the local horizon of the point (exact for a direction fixed in the Moon frame; Earth parallax
 * error < distance / 356,000 km, e.g. 0.004 deg at 25 km). Angles in degrees, azimuth clockwise from local north.
 */
import horizonProfiles from '../data/horizonProfiles.json'
import {
  EPHEMERIS_HOURS,
  EPHEMERIS_SITES,
  EPHEMERIS_SITE_LATLON,
  getEphemerisAt,
  getRawTrack,
  type EphemerisSample,
  type EphemerisSiteKey,
} from '../utils/ephemerisClient'

export const SUN_RADIUS_DEG = 0.266
export const DEFAULT_MAST_M = '2'
const DEG = Math.PI / 180

type ProfileFile = {
  az_step_deg: number
  sites: Record<string, { lat: number; lon: number; profiles: Record<string, { horizon_deg: number[] }> }>
}
const PROFILES = horizonProfiles as unknown as ProfileFile

type Vec3 = [number, number, number]
function enu(lat: number, lon: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const p = lat * DEG
  const l = lon * DEG
  return {
    e: [-Math.sin(l), Math.cos(l), 0],
    n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
    u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
  }
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function nearestEphemerisSite(lat: number, lon: number): EphemerisSiteKey {
  const u = enu(lat, lon).u
  let best: EphemerisSiteKey = EPHEMERIS_SITES[0]
  let bestDot = -2
  for (const k of EPHEMERIS_SITES) {
    const d = dot(u, enu(...EPHEMERIS_SITE_LATLON[k]).u)
    if (d > bestDot) {
      bestDot = d
      best = k
    }
  }
  return best
}

/** LOLA horizon H(theta) [deg], 1 deg steps from local north, of a site id (landingSites.json id or route key). */
export function horizonProfile(siteId: string, mast = DEFAULT_MAST_M): number[] | null {
  return PROFILES.sites[siteId]?.profiles[mast]?.horizon_deg ?? null
}

/** Exact visible area fraction of the solar disc above a locally straight horizon (same as the backend). */
export function sunDiscFraction(sunElDeg: number, horizonDeg: number): number {
  const s = Math.max(-1, Math.min(1, (sunElDeg - horizonDeg) / SUN_RADIUS_DEG))
  return 1 - (Math.acos(s) - s * Math.sqrt(1 - s * s)) / Math.PI
}

/** Hourly [az, el] track is visible: Sun = any part of the disc above the terrain, Earth = centre above it. */
function isVisible(body: 'sun' | 'earth', az: number, el: number, profile: number[]): boolean {
  const h = horizonAt(profile, az)
  return body === 'sun' ? el + SUN_RADIUS_DEG > h : el > h
}

/**
 * Re-projection of the Horizons directions of the nearest of the 4 buffer sites onto the local horizon of (lat, lon):
 * exact for a direction fixed in the Moon frame; Earth parallax error < distance / 356,000 km (identity at the 4 sites).
 */
export function reprojector(lat: number, lon: number) {
  const src = nearestEphemerisSite(lat, lon)
  const a = enu(...EPHEMERIS_SITE_LATLON[src])
  const b = enu(lat, lon)
  const toLocal = (az: number, el: number): [number, number] => {
    const ca = Math.cos(el * DEG)
    const s = Math.sin(az * DEG) * ca
    const c = Math.cos(az * DEG) * ca
    const z = Math.sin(el * DEG)
    const v: Vec3 = [
      s * a.e[0] + c * a.n[0] + z * a.u[0],
      s * a.e[1] + c * a.n[1] + z * a.u[1],
      s * a.e[2] + c * a.n[2] + z * a.u[2],
    ]
    const az2 = Math.atan2(dot(v, b.e), dot(v, b.n)) / DEG
    return [(az2 + 360) % 360, Math.asin(Math.max(-1, Math.min(1, dot(v, b.u)))) / DEG]
  }
  return { src, toLocal }
}

/** Sun / Earth (azimuth, elevation) at any point of the cap at a date, from the nearest buffer site. */
export function localDirectionsAt(lat: number, lon: number, date: Date): EphemerisSample | null {
  const { src, toLocal } = reprojector(lat, lon)
  const raw = getEphemerisAt(src, date)
  if (!raw) return null
  const body = (d: { azimuth: number; elevation: number }) => {
    const [azimuth, elevation] = toLocal(d.azimuth, d.elevation)
    return { azimuth, elevation, isAbove: elevation > 0 }
  }
  return { sun: body(raw.sun), earth: body(raw.earth) }
}

/**
 * Hours from `hour` (fractional index into the ephemeris buffer) until the terrain visibility of a body changes at a
 * profile site (horizonProfiles.json id), scanning the hourly samples. null if no change within maxHours or the data
 * is missing. Resolution: 1 h.
 */
export function hoursUntilVisibilityChange(
  profileId: string,
  body: 'sun' | 'earth',
  hour: number,
  visibleNow: boolean,
  maxHours = 24 * 60,
): number | null {
  const site = PROFILES.sites[profileId]
  const profile = horizonProfile(profileId)
  const h0 = Math.ceil(hour)
  const h1 = Math.min(h0 + maxHours, EPHEMERIS_HOURS)
  if (!site || !profile || h1 <= h0) return null
  const { src, toLocal } = reprojector(site.lat, site.lon)
  const track = getRawTrack(src, body, h0, h1)
  if (!track) return null
  for (let i = 0; i < h1 - h0; i++) {
    const [az, el] = toLocal(track[2 * i], track[2 * i + 1])
    if (isVisible(body, az, el, profile) !== visibleNow) return h0 + i - hour
  }
  return null
}

export function horizonAt(profile: number[], azDeg: number): number {
  const n = profile.length
  const p = ((((azDeg % 360) + 360) % 360) * n) / 360
  const i0 = Math.floor(p) % n
  const t = p - Math.floor(p)
  return profile[i0] * (1 - t) + profile[(i0 + 1) % n] * t
}

export interface VisibilitySeries {
  /** 1 when any part of the solar disc is above the terrain, per hour. */
  sun: Uint8Array
  /** 1 when the Earth centre is above the terrain (DTE link possible), per hour. */
  earth: Uint8Array
}

/**
 * Hourly Sun / Earth visibility of a site over hours [h0, h1) of the ephemeris buffer.
 * Returns null if the buffer is not loaded or the site has no horizon profile.
 */
export function visibilitySeries(siteId: string, h0: number, h1: number, mast = DEFAULT_MAST_M): VisibilitySeries | null {
  const site = PROFILES.sites[siteId]
  const profile = site?.profiles[mast]?.horizon_deg
  if (!profile) return null
  // Re-project (az, el) from the ephemeris site to this site and test against its horizon.
  const { src, toLocal } = reprojector(site.lat, site.lon)
  const sunRaw = getRawTrack(src, 'sun', h0, h1)
  const earthRaw = getRawTrack(src, 'earth', h0, h1)
  if (!sunRaw || !earthRaw) return null
  const n = h1 - h0
  const out: VisibilitySeries = { sun: new Uint8Array(n), earth: new Uint8Array(n) }

  for (let i = 0; i < n; i++) {
    const [sAz, sEl] = toLocal(sunRaw[2 * i], sunRaw[2 * i + 1])
    out.sun[i] = sEl + SUN_RADIUS_DEG - horizonAt(profile, sAz) > 0 ? 1 : 0 // f > 0
    const [eAz, eEl] = toLocal(earthRaw[2 * i], earthRaw[2 * i + 1])
    out.earth[i] = eEl > horizonAt(profile, eAz) ? 1 : 0
  }
  return out
}
