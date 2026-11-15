import rawLandingSites from './landingSites.json'
import rawSiteScenes from './siteScenes.json'
import {
  isInsideTerrain,
  latLonToScene,
  sceneToLatLon,
  terrainElevationM,
} from '../lib/southPoleGrid'

export interface LandingSiteCoordinates {
  latitude: number // deg, planetocentric
  longitude: number // deg east, -180..180
  elevation_m: number // m relative to R = 1737.4 km, from LRO LOLA LDEM_85S_20M (bilinear)
}

export interface SiteSource {
  label: string // short citation
  url: string // official publication page (DOI / publisher / NASA)
}

/** Candidate points (see DATA_SOURCES.md > Candidate points). Every coordinate comes from the cited publication. */
export interface LandingSite {
  id: string
  name: string
  shortName: string
  /**
   * 'landing': illuminated landing candidate; 'science': permanently shadowed region (water ice target);
   * 'mission': actual landing site of a flown mission (e.g. CLPS IM-2).
   */
  kind: 'landing' | 'science' | 'mission'
  coordinates: LandingSiteCoordinates
  description: string
  /** Values as published by the source (conditions included). */
  published: string
  nasa_region: string | null
  /** Route key of the 15 km first-person terrain (/vista-sitio/:key), null when it does not exist yet. */
  scene_key: string | null
  sources: SiteSource[]
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

/** Scene position of a site on the regional 3D terrain, or null if it lies outside the terrain. */
export function getSite3DPosition(site: LandingSite, elevations?: Float32Array): [number, number, number] | null {
  const p = latLonToScene(site.coordinates.latitude, site.coordinates.longitude, elevations)
  return isInsideTerrain(p[0], p[2]) ? p : null
}

/** Sites of the comparison table: the ones on the 3D terrain plus flown missions (they have a LOLA horizon too). */
export const COMPARISON_SITES: LandingSite[] = LANDING_SITES.filter(
  (s) => getSite3DPosition(s) !== null || s.kind === 'mission',
)

/** Sites drawn on the regional 3D terrain. */
export const SITES_IN_3D: LandingSite[] = LANDING_SITES.filter((s) => getSite3DPosition(s) !== null)

/** Scene point of the regional terrain -> lat / lon and approximate LOLA height (+-261 m). */
export function scenePointToLunarCoords(
  point: { x: number; y: number; z: number },
  elevations: Float32Array,
): { latitude: number; longitude: number; elevation_m: number } {
  const { lat, lon } = sceneToLatLon(point.x, point.z)
  return {
    latitude: Number(lat.toFixed(3)),
    longitude: Number(lon.toFixed(3)),
    elevation_m: terrainElevationM(elevations, point.x, point.z),
  }
}

/** Approximate LOLA height [m] at (lat, lon) from the regional grid, or null outside it. */
export function elevationAtLatLon(elevations: Float32Array, lat: number, lon: number): number | null {
  const [x, , z] = latLonToScene(lat, lon)
  return isInsideTerrain(x, z) ? terrainElevationM(elevations, x, z) : null
}
