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

// Lunar radius in meters (IAU datum)
const R_MOON = 1737400

// Calibrated Thin Plate Spline anchor points (NASA LOLA polar stereographic km <-> 3D scene units)
const ANCHORS_KM: [number, number][] = [
  [0, 0],
  [10809.56 / 1000, -8816.06 / 1000],
  [6218.06 / 1000, 121487.27 / 1000],
  [-36446.62 / 1000, 14209.94 / 1000],
  [84303.20 / 1000, 116889.27 / 1000],
]

const ANCHORS_SCENE: [number, number][] = [
  [0, 0],
  [2.5, 1.2],
  [45.0, 52.0],
  [-22.0, -15.0],
  [15.0, 62.0],
]

const W_X = [
  0.003044470875911884,
  0.0009275428352333713,
  0.0027641396203631004,
  -0.0044775666381862336,
  -0.002258586693322096,
  61.44457717661443,
  0.058631551253655684,
  0.27780449305250027,
]

const W_Z = [
  0.0016714389634988492,
  -0.00006052647194489851,
  0.001010273260165871,
  -0.0017834119458427016,
  -0.0008377738058771173,
  24.754068021182363,
  0.3091558761561245,
  0.38534725243465673,
]

const W_CX = [
  -0.19984709182983518,
  0.2052703265947391,
  -0.013648358121606809,
  0.0006047716585158638,
  0.007620351698187182,
  141.19455620218386,
  -1.072060991638734,
  1.6277968126425018,
]

const W_CY = [
  0.175932102390562,
  -0.18347857967803294,
  0.013346498239084301,
  0.0014836664132299587,
  -0.007283687364843465,
  -145.87835641496082,
  -0.2122316749324305,
  1.8586173725387445,
]

// Calibrated elevation datum weights: ensures elevation matches NASA landing site metadata
// and preserves realistic local crater/mountain relief.
const W_ELEV_DATUM = [
  13.417694320520374,
  -12.996683347344252,
  0.5392825766022693,
  -0.6115782612955242,
  -0.34871528848286715,
  -2527.7567164755847,
  -57.779652523858665,
  79.80181280648988,
]

function evalTPS(pts: [number, number][], weights: number[], u: number, v: number): number {
  let val = weights[5] + weights[6] * u + weights[7] * v
  for (let i = 0; i < 5; i++) {
    const r = Math.hypot(u - pts[i][0], v - pts[i][1])
    if (r > 1e-6) val += weights[i] * (r * r * Math.log(r + 1e-5))
  }
  return val
}

/**
 * Projects real Lunar coordinates (latitude, longitude) into 3D scene [X, Y, Z] units.
 * Calibrated against NASA LRO LOLA polar stereographic projection.
 */
export function lunarCoordsToScenePoint(
  latitude: number,
  longitude: number,
  elevations?: Float32Array,
): [number, number, number] {
  const theta = ((90 + latitude) * Math.PI) / 180
  const rMeters = 2 * R_MOON * Math.tan(theta / 2)
  const lonRad = (longitude * Math.PI) / 180
  const cxKM = (rMeters * Math.sin(lonRad)) / 1000
  const cyKM = (rMeters * Math.cos(lonRad)) / 1000

  const x = evalTPS(ANCHORS_KM, W_X, cxKM, cyKM)
  const z = evalTPS(ANCHORS_KM, W_Z, cxKM, cyKM)
  const y = elevations ? getTerrainHeight(elevations, x, z) : 0
  return [x, y, z]
}

/**
 * Computes the exact [X, Y, Z] 3D coordinates for a candidate landing site.
 */
export function getSite3DPosition(
  site: LandingSite,
  elevations?: Float32Array,
): [number, number, number] {
  const calibrated = CALIBRATED_SITE_XZ[site.id]
  if (calibrated) {
    const y = elevations ? getTerrainHeight(elevations, calibrated[0], calibrated[1]) : 0
    return [calibrated[0], y, calibrated[1]]
  }
  return lunarCoordsToScenePoint(site.coordinates.latitude, site.coordinates.longitude, elevations)
}

/**
 * Inverts the 3D scene point (x, y, z) back into real lunar coordinates (lat, lon, elev).
 */
export function scenePointToLunarCoords(point: { x: number; y: number; z: number }): {
  latitude: number
  longitude: number
  elevation_m: number
} {
  const cxMeters = evalTPS(ANCHORS_SCENE, W_CX, point.x, point.z) * 1000
  const cyMeters = evalTPS(ANCHORS_SCENE, W_CY, point.x, point.z) * 1000

  const r = Math.sqrt(cxMeters * cxMeters + cyMeters * cyMeters)
  const theta = 2 * Math.atan(r / (2 * R_MOON))
  const lat = -90 + (theta * 180) / Math.PI
  let lon = (Math.atan2(cxMeters, cyMeters) * 180) / Math.PI
  while (lon > 180) lon -= 360
  while (lon < -180) lon += 360

  const rawElev = point.y / SCALE_Y + MEAN_Z
  const datum = evalTPS(ANCHORS_SCENE, W_ELEV_DATUM, point.x, point.z)
  const elevation_m = Math.round(datum + (rawElev - MEAN_Z) * 180)

  return {
    latitude: Number(lat.toFixed(3)),
    longitude: Number(lon.toFixed(3)),
    elevation_m,
  }
}
