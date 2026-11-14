/**
 * Georeference of the regional South Pole 3D terrain (public/models/south_pole/lunar_elevation_1200.bin).
 *
 * The 1200x1200 Float32 grid comes from NASA Moon Trek (LRO LOLA). Its export metadata was lost, so the grid was
 * registered against the official LRO LOLA GDR polar DEMs (LDEM_85S_20M + LDEM_80S_40M, NASA PDS) by maximising the
 * correlation of the heights over the whole grid (Pearson r = 0.979). Result (see DATA_SOURCES.md):
 *   - square of 2 x 105.95 km side (not the -84 deg cap of the original notes),
 *   - centred at polar stereographic (14.50, -7.15) km  = 89.467 S, 116.25 E (near Shackleton, not on the pole),
 *   - rotated 359.62 deg, and stored mirrored: row index grows towards polar +Y.
 *   - values are not metres: LOLA height [m] ~= 208.0 * value - 6339 (residual std 261 m).
 *
 * Scene frame used by the 3D view: PlaneGeometry of TERRAIN_SIZE units, rotated to the XZ plane, then mirrored in Z
 * (mirrorGeometryZ) so the terrain shows the real, non-mirrored geography seen from above. In that frame:
 *   column = (x + 75) / 150 * 1199,   row = (-z + 75) / 150 * 1199.
 * Polar stereographic frame (IAU2000:30120, R = 1737.4 km, lon 0 towards +Y, lon 90 E towards +X): see moonSouthPolarCrs.
 * Horizontal accuracy of the registration ~1 km (grid pixel ~177 m).
 */
import * as THREE from 'three'
import { lunarToPolarXY, polarXYToLunar } from './moonSouthPolarCrs'

export const GRID = 1200
export const TERRAIN_SIZE = 150 // scene units
export const MEAN_Z = 24.97 // grid value at scene height 0
export const SCALE_Y = (TERRAIN_SIZE / GRID) * 1.3 * 1.5 // 0.24375 scene units per grid unit (visual exaggeration)

// Registration against LOLA (backend scratch analysis, documented in DATA_SOURCES.md)
const HALF_WIDTH_M = 105_950
const ROT = (359.62 * Math.PI) / 180
const CENTER_X_M = 14_500
const CENTER_Y_M = -7_150
const HEIGHT_PER_UNIT_M = 208.0
const HEIGHT_OFFSET_M = -6339
export const ELEVATION_UNCERTAINTY_M = 261

const half = TERRAIN_SIZE / 2

function sceneToGrid(x: number, z: number): { col: number; row: number } {
  return { col: ((x + half) / TERRAIN_SIZE) * (GRID - 1), row: ((-z + half) / TERRAIN_SIZE) * (GRID - 1) }
}

function gridToScene(col: number, row: number): { x: number; z: number } {
  return { x: (col / (GRID - 1)) * TERRAIN_SIZE - half, z: -((row / (GRID - 1)) * TERRAIN_SIZE - half) }
}

/** Scene (x, z) -> polar stereographic (x, y) in metres. */
export function sceneToPolar(x: number, z: number): { x: number; y: number } {
  const { col, row } = sceneToGrid(x, z)
  const uc = (col + 0.5) / (GRID / 2) - 1
  const ur = (row + 0.5) / (GRID / 2) - 1
  return {
    x: HALF_WIDTH_M * (uc * Math.cos(ROT) - ur * Math.sin(ROT)) + CENTER_X_M,
    y: HALF_WIDTH_M * (uc * Math.sin(ROT) + ur * Math.cos(ROT)) + CENTER_Y_M,
  }
}

/** Polar stereographic (x, y) in metres -> scene (x, z) (may fall outside the terrain). */
export function polarToScene(px: number, py: number): { x: number; z: number } {
  const dx = (px - CENTER_X_M) / HALF_WIDTH_M
  const dy = (py - CENTER_Y_M) / HALF_WIDTH_M
  const uc = dx * Math.cos(ROT) + dy * Math.sin(ROT)
  const ur = -dx * Math.sin(ROT) + dy * Math.cos(ROT)
  return gridToScene((uc + 1) * (GRID / 2) - 0.5, (ur + 1) * (GRID / 2) - 0.5)
}

export function isInsideTerrain(x: number, z: number): boolean {
  return Math.abs(x) <= half && Math.abs(z) <= half
}

function gridValue(elevations: Float32Array, x: number, z: number): number {
  const { col, row } = sceneToGrid(x, z)
  const c = Math.max(0, Math.min(GRID - 1, Math.round(col)))
  const r = Math.max(0, Math.min(GRID - 1, Math.round(row)))
  return elevations[r * GRID + c]
}

/** Scene height (Y) of the rendered terrain at scene (x, z). */
export function getTerrainHeight(elevations: Float32Array, x: number, z: number): number {
  return (gridValue(elevations, x, z) - MEAN_Z) * SCALE_Y
}

/** Approximate LOLA height [m, relative to R = 1737.4 km] at scene (x, z): +-261 m (1 sigma). */
export function terrainElevationM(elevations: Float32Array, x: number, z: number): number {
  return Math.round(HEIGHT_PER_UNIT_M * gridValue(elevations, x, z) + HEIGHT_OFFSET_M)
}

/** (lat, lon) deg -> scene [x, y, z]; y on the terrain when elevations are given. */
export function latLonToScene(lat: number, lon: number, elevations?: Float32Array): [number, number, number] {
  const p = lunarToPolarXY(lat, lon)
  const { x, z } = polarToScene(p.x, p.y)
  return [x, elevations ? getTerrainHeight(elevations, x, z) : 0, z]
}

/** Scene (x, z) -> (lat, lon) deg, lon in -180..180. */
export function sceneToLatLon(x: number, z: number): { lat: number; lon: number } {
  const p = sceneToPolar(x, z)
  return polarXYToLunar(p.x, p.y)
}

/** Corners of the terrain footprint as (lat, lon), for drawing it on the 2D map. */
export function terrainFootprintLatLon(): [number, number][] {
  return ([[-half, -half], [half, -half], [half, half], [-half, half]] as const).map(([x, z]) => {
    const { lat, lon } = sceneToLatLon(x, z)
    return [lat, lon] as [number, number]
  })
}

/**
 * Mirrors a PlaneGeometry (already rotated to XZ) in Z so the stored, mirrored grid displays the real geography.
 * Triangle winding is reversed to keep the faces pointing up; UVs stay attached, so textures follow the terrain.
 */
export function mirrorGeometryZ(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geom.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -pos.getZ(i))
  pos.needsUpdate = true
  const index = geom.index
  if (index) {
    const arr = index.array as Uint16Array | Uint32Array
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1]
      arr[i + 1] = arr[i + 2]
      arr[i + 2] = t
    }
    index.needsUpdate = true
  }
  return geom
}
