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
import { EPHEMERIS_SITES, EPHEMERIS_SITE_LATLON, getRawTrack, type EphemerisSiteKey } from '../utils/ephemerisClient'

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

function horizonAt(profile: number[], azDeg: number): number {
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
  const src = nearestEphemerisSite(site.lat, site.lon)
  const sunRaw = getRawTrack(src, 'sun', h0, h1)
  const earthRaw = getRawTrack(src, 'earth', h0, h1)
  if (!sunRaw || !earthRaw) return null

  const a = enu(...EPHEMERIS_SITE_LATLON[src])
  const b = enu(site.lat, site.lon)
  const n = h1 - h0
  const out: VisibilitySeries = { sun: new Uint8Array(n), earth: new Uint8Array(n) }

  // Re-project (az, el) from the ephemeris site to this site and test against its horizon.
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
    return [Math.atan2(dot(v, b.e), dot(v, b.n)) / DEG, Math.asin(Math.max(-1, Math.min(1, dot(v, b.u)))) / DEG]
  }

  for (let i = 0; i < n; i++) {
    const [sAz, sEl] = toLocal(sunRaw[2 * i], sunRaw[2 * i + 1])
    out.sun[i] = sEl + SUN_RADIUS_DEG - horizonAt(profile, sAz) > 0 ? 1 : 0 // f > 0
    const [eAz, eEl] = toLocal(earthRaw[2 * i], earthRaw[2 * i + 1])
    out.earth[i] = eEl > horizonAt(profile, eAz) ? 1 : 0
  }
  return out
}
