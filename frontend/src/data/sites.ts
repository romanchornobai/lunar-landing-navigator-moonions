import rawLandingSites from './landingSites.json'
import rawSiteScenes from './siteScenes.json'

export interface LandingSiteCoordinates {
  latitude: number
  longitude: number
  elevation_m: number
}

export interface LandingSite {
  id: string
  name: string
  coordinates: LandingSiteCoordinates
  description: string
  scientific_interest?: string
  horizon_max_elevation_deg: number
}

export interface SiteScene3D {
  id: string
  key: string
  name: string
  shortName: string
  lat: number
  lon: number
  centerElevationM: number
  reliefSpanM: number
  glbPath: string
  description: string
  groundNormal: [number, number, number]
}

export const LANDING_SITES: LandingSite[] = rawLandingSites as LandingSite[]
export const SITE_SCENES_15KM: Record<string, SiteScene3D> = rawSiteScenes as unknown as Record<string, SiteScene3D>

// Calibrated 2D (X, Z) positions in the South Pole 3D scene (see ASSETS.md / CONFIG_HACKATHON.txt)
// X, Z are horizontal plane coordinates (-75 to +75 scene units).
// Y is sampled dynamically from the Float32Array elevation grid.
export const CALIBRATED_SITE_XZ: Record<string, [number, number]> = {
  'shackleton-connecting-ridge': [2.5, 1.2],
  'shackleton-center-psr': [-3.32, 1.31], // Center floor of Shackleton crater (PSR)
  'malapert-massif': [45.0, 52.0],
  'nobile-rim-1': [15.0, 62.0],
  'de-gerlache-rim': [-22.0, -15.0],
}

export const MEAN_Z = 24.97 // meters
export const SCALE_Y = (150 / 1200) * 1.3 * 1.5 // 0.24375 scene units per meter

/**
 * Samples the exact terrain height Y for given scene X and Z.
 */
export function getTerrainHeight(elevations: Float32Array, x: number, z: number): number {
  const gx = Math.max(0, Math.min(1199, Math.round(((x + 75.0) / 150.0) * 1199)))
  const gy = Math.max(0, Math.min(1199, Math.round(((z + 75.0) / 150.0) * 1199)))
  const rawElev = elevations[gy * 1200 + gx]
  return (rawElev - MEAN_Z) * SCALE_Y
}

/**
 * Computes the exact [X, Y, Z] 3D coordinates for a candidate landing site.
 */
export function getSite3DPosition(
  site: LandingSite,
  elevations?: Float32Array,
): [number, number, number] {
  const calibrated = CALIBRATED_SITE_XZ[site.id]
  let x: number
  let z: number

  if (calibrated) {
    ;[x, z] = calibrated
  } else {
    // Polar stereographic projection formula from CONFIG_HACKATHON.txt
    const polarDist = 90.0 - Math.abs(site.coordinates.latitude)
    const r = (polarDist / 6.0) * (150.0 / 2.0)
    const angRad = (-site.coordinates.longitude - 60.0) * (Math.PI / 180.0)
    x = r * Math.cos(angRad)
    z = r * Math.sin(angRad)
  }

  const y = elevations ? getTerrainHeight(elevations, x, z) : 0
  return [x, y, z]
}
