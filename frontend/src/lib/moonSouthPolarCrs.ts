import L from 'leaflet'

/**
 * Moon South Polar Stereographic (IAU2000:30120), as served by NASA Moon Trek WMTS.
 * Sphere R = 1737.4 km, latitude of origin -90, central meridian 0, true scale at the pole.
 * Projected frame (meters): longitude 0 points to +Y (map up), longitude +90 E points to +X (right).
 */
export const R_MOON_M = 1737400

const DEG = Math.PI / 180

/** (lat, lon) in degrees -> polar stereographic (x, y) in meters. */
export function lunarToPolarXY(lat: number, lon: number): { x: number; y: number } {
  const r = 2 * R_MOON_M * Math.tan(((90 + lat) * DEG) / 2)
  return { x: r * Math.sin(lon * DEG), y: r * Math.cos(lon * DEG) }
}

/** Polar stereographic (x, y) in meters -> (lat, lon) in degrees, lon in -180..180. */
export function polarXYToLunar(x: number, y: number): { lat: number; lon: number } {
  const r = Math.hypot(x, y)
  const lat = -90 + (2 * Math.atan(r / (2 * R_MOON_M))) / DEG
  const lon = Math.atan2(x, y) / DEG
  return { lat, lon }
}

// Trek "default028mm" tile matrix set (read from WMTSCapabilities.xml of the SP layers):
// top-left corner (-1095930, 1095930) m, 256 px tiles, level 0 pixel size = scaleDenominator * 0.28 mm.
const ORIGIN_M = 1095930
const RES0_M_PER_PX = 3.0578404017857101e7 * 0.00028 // ~8561.95 m/px at zoom 0, halves per level

export const MOON_SOUTH_POLAR_CRS: L.CRS = L.extend({}, L.CRS, {
  code: 'IAU2000:30120',
  projection: {
    project: (ll: L.LatLng) => {
      const p = lunarToPolarXY(ll.lat, ll.lng)
      return L.point(p.x, p.y)
    },
    unproject: (p: L.Point) => {
      const ll = polarXYToLunar(p.x, p.y)
      return L.latLng(ll.lat, ll.lon)
    },
    bounds: L.bounds([-ORIGIN_M, -ORIGIN_M], [ORIGIN_M, ORIGIN_M]),
  },
  // Projected meters -> pixel at zoom 0, so Leaflet tile (x, y) == WMTS (TileCol, TileRow).
  transformation: new L.Transformation(
    1 / RES0_M_PER_PX,
    ORIGIN_M / RES0_M_PER_PX,
    -1 / RES0_M_PER_PX,
    ORIGIN_M / RES0_M_PER_PX,
  ),
  scale: (zoom: number) => Math.pow(2, zoom),
  zoom: (scale: number) => Math.log(scale) / Math.LN2,
  distance: (a: L.LatLng, b: L.LatLng) => {
    const p = lunarToPolarXY(a.lat, a.lng)
    const q = lunarToPolarXY(b.lat, b.lng)
    return Math.hypot(p.x - q.x, p.y - q.y)
  },
  infinite: false,
}) as unknown as L.CRS // L.CRS is a plain object at runtime (Leaflet 1.x); typings declare a class

/** Zoom that fits a circle of `radiusM` meters (around the pole) into `sizePx` pixels. */
export function zoomToFitRadius(radiusM: number, sizePx: number): number {
  return Math.log2((sizePx * RES0_M_PER_PX) / (2 * radiusM))
}

/** Polar cap shown by the app: lat -90..-84 (r = 2R tan(3 deg) ~ 182.1 km). */
export const CAP_EDGE_LAT = -84
export const CAP_RADIUS_M = 2 * R_MOON_M * Math.tan(3 * DEG)

const TREK = 'https://trek.nasa.gov/tiles/Moon/SP'
const LOCAL = '/tiles/moon_sp'
/** NASA Moon Trek WMTS layers (South Polar Stereographic, REST, 256 px PNG tiles). */
export const TREK_LAYERS = {
  // LRO LROC WAC mosaic v2, ~100 m/px, to 60 S. Native levels 0-5.
  wac: { id: 'LRO_WAC_Mosaic_SPole60_100m_v02', maxNativeZoom: 5 },
  // LRO LROC NAC mosaic, 1 m/px source, to 85.5 S. Native levels 0-11.
  nac: { id: 'LRO_NAC_Mosaic_SPole85.5_1mp', maxNativeZoom: 11 },
}

export const trekTileUrl = (layerId: string) => `${TREK}/${layerId}/1.0.0/default/default028mm/{z}/{y}/{x}.png`
export const localTileUrl = (layerId: string) => `${LOCAL}/${layerId}/{z}/{y}/{x}.png`

// Tiles pre-downloaded around the landing sites (backend/app/scripts/download_trek_tiles.py).
// manifest.json: { layers: { <layerId>: ["z/row/col", ...] } }. Missing manifest -> all tiles from Trek.
let manifest: Promise<Record<string, Set<string>>> | null = null
export function loadLocalTileManifest(): Promise<Record<string, Set<string>>> {
  if (!manifest) {
    manifest = fetch(`${LOCAL}/manifest.json`)
      .then((r) => (r.ok ? r.json() : { layers: {} }))
      .then((m: { layers?: Record<string, string[]> }) =>
        Object.fromEntries(Object.entries(m.layers ?? {}).map(([k, v]) => [k, new Set(v)])),
      )
      .catch(() => ({}))
  }
  return manifest
}
