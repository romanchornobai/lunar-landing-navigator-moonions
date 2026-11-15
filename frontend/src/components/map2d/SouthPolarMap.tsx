import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import {
  CAP_EDGE_LAT,
  CAP_RADIUS_M,
  MOON_SOUTH_POLAR_CRS,
  TREK_LAYERS,
  loadLocalTileManifest,
  localTileUrl,
  trekTileUrl,
  tileIntersectsExtent,
  metersPerPixel,
  type Extent,
  lunarToPolarXY,
  zoomToFitRadius,
} from '../../lib/moonSouthPolarCrs'
import { useSouthPoleElevation } from '../../lib/southPoleElevation'
import { LANDING_SITES, elevationAtLatLon } from '../../data/sites'
import { terrainFootprintLatLon } from '../../lib/southPoleGrid'
import { ProbeHoloPanel, type ProbeCoords } from '../ui/ProbeHoloPanel'

const TRANSPARENT_TILE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
const ANCHOR_ICON = L.divIcon({ className: 'probe-anchor', html: '', iconSize: [1, 1], iconAnchor: [0, 0] })

// Footprint of the regional 3D terrain (georeferenced square, lib/southPoleGrid.ts). Straight edges in the polar plane.
const TERRAIN_FOOTPRINT = (() => {
  const c = terrainFootprintLatLon()
  return [...c, c[0]]
})()

/** Leaflet tile layer that serves pre-downloaded tiles from /public and streams the rest from Trek. */
class HybridTileLayer extends L.TileLayer {
  constructor(
    private layerId: string,
    private local: Set<string>,
    private extent: Extent | undefined,
    options: L.TileLayerOptions,
  ) {
    super(trekTileUrl(layerId), options)
  }
  getTileUrl(coords: L.Coords): string {
    const z = (this as unknown as { _getZoomForUrl(): number })._getZoomForUrl()
    const tpl = this.local.has(`${z}/${coords.y}/${coords.x}`) ? localTileUrl(this.layerId) : trekTileUrl(this.layerId)
    return L.Util.template(tpl, { z, x: coords.x, y: coords.y })
  }
  // Skip tiles outside the layer extent (they would only 404 on Trek).
  _isValidTile(coords: L.Coords): boolean {
    const base = (L.TileLayer.prototype as unknown as { _isValidTile(c: L.Coords): boolean })._isValidTile
    if (!base.call(this, coords)) return false
    return !this.extent || tileIntersectsExtent(coords.z, coords.y, coords.x, this.extent)
  }
}

function TrekLayer({ layerId, extent, ...options }: { layerId: string; extent?: Extent } & L.TileLayerOptions) {
  const map = useMap()
  useEffect(() => {
    let layer: L.TileLayer | null = null
    let alive = true
    loadLocalTileManifest().then((m) => {
      if (!alive) return
      layer = new HybridTileLayer(layerId, m[layerId] ?? new Set(), extent, options).addTo(map)
    })
    return () => {
      alive = false
      layer?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, layerId])
  return null
}

/** Opens the view centered on the pole with the whole -90..-84 cap in frame. */
function FitCap({ margin }: { margin: number }) {
  const map = useMap()
  useEffect(() => {
    const fit = () => {
      const size = map.getSize()
      const z = zoomToFitRadius(CAP_RADIUS_M * margin, Math.min(size.x, size.y))
      map.setView([-90, 0], Math.floor(z * 4) / 4, { animate: false })
    }
    fit()
  }, [map, margin])
  return null
}

function ProbeClick({ onPick }: { onPick: (lat: number, lon: number, xPx: number, widthPx: number) => void }) {
  const map = useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng, e.containerPoint.x, map.getSize().x),
  })
  return null
}

interface Probe2D {
  lat: number
  lon: number
  coords: ProbeCoords
  direction: 'left' | 'right'
}

function ProbeMarker({ probe, onClose }: { probe: Probe2D; onClose: () => void }) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
  }, [el])
  const p = lunarToPolarXY(probe.lat, probe.lon)
  return (
    <>
      <CircleMarker
        center={[probe.lat, probe.lon]}
        radius={5}
        interactive={false}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#ffffff', fillOpacity: 0.9 }}
      />
      <Marker
        position={[probe.lat, probe.lon]}
        icon={ANCHOR_ICON}
        interactive={false}
        eventHandlers={{ add: (e) => setEl((e.target as L.Marker).getElement() ?? null) }}
      />
      {el &&
        createPortal(
          <ProbeHoloPanel
            key={`${probe.lat},${probe.lon}`}
            coords={probe.coords}
            direction={probe.direction}
            extra={{
              label: 'POLAR X / Y',
              value: `${(p.x / 1000).toFixed(1)}, ${(p.y / 1000).toFixed(1)} km`,
            }}
            onClose={onClose}
          />,
          el,
        )}
    </>
  )
}

export interface MapViewInfo {
  zoom: number
  layer: string // imagery layer on top at the view center
  mPerPx: number
}

/** Reports zoom, active imagery layer and screen resolution after every zoom/pan. */
function ViewReporter({ onChange }: { onChange: (info: MapViewInfo) => void }) {
  const map = useMapEvents({
    zoomend: () => report(),
    moveend: () => report(),
  })
  const report = () => {
    const zoom = map.getZoom()
    const c = map.getCenter()
    const p = lunarToPolarXY(c.lat, c.lng)
    const inside = (e: Extent) => p.x > e[0] && p.x < e[2] && p.y > e[1] && p.y < e[3]
    let layer = 'LRO WAC'
    if (zoom >= 10 && inside(TREK_LAYERS.malapert.extentM)) layer = 'LRO NAC · MALAPERT'
    else if (zoom >= 6 && inside(TREK_LAYERS.nac.extentM)) layer = 'LRO NAC'
    onChange({ zoom, layer, mPerPx: metersPerPixel(zoom) })
  }
  useEffect(report, [map])
  return null
}

interface SouthPolarMapProps {
  /** false: static preview (used inside the round view toggle). */
  interactive?: boolean
  isPickerActive?: boolean
  onViewChange?: (info: MapViewInfo) => void
}

/**
 * 2D South Pole map: NASA Moon Trek WMTS tiles in South Polar Stereographic (IAU2000:30120).
 * LROC WAC mosaic as base, LROC NAC mosaic on top when zoomed in (inside 85.5 S).
 */
export default function SouthPolarMap({
  interactive = true,
  isPickerActive = false,
  onViewChange,
}: SouthPolarMapProps) {
  const elevations = useSouthPoleElevation()
  const [probe, setProbe] = useState<Probe2D | null>(null)

  useEffect(() => {
    if (!isPickerActive) setProbe(null)
  }, [isPickerActive])

  const handlePick = (lat: number, lon: number, xPx: number, widthPx: number) => {
    if (!isPickerActive || !elevations || lat > CAP_EDGE_LAT) return
    // Approximate LOLA height from the same regional grid as the 3D probe (null outside the 3D terrain).
    const elevation_m = elevationAtLatLon(elevations, lat, lon)
    setProbe({
      lat,
      lon,
      coords: { latitude: Number(lat.toFixed(3)), longitude: Number(lon.toFixed(3)), elevation_m },
      direction: xPx > widthPx - 470 ? 'left' : 'right',
    })
  }

  const sites = useMemo(
    () =>
      LANDING_SITES.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.coordinates.latitude, s.coordinates.longitude]}
          radius={interactive ? 6 : 3}
          interactive={interactive}
          bubblingMouseEvents
          pathOptions={
            s.kind === 'science'
              ? { color: '#38bdf8', weight: 1, fillColor: '#38bdf8', fillOpacity: 1 }
              : s.kind === 'mission'
                ? { color: '#fcd34d', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }
                : { color: '#ff2a2a', weight: 1, fillColor: '#ff2a2a', fillOpacity: 1 }
          }
        >
          {interactive && (
            <Tooltip direction="right" offset={[8, 0]} className="polar-site-tooltip">
              {s.kind === 'mission' ? `${s.name} · MISSION` : s.name}
            </Tooltip>
          )}
        </CircleMarker>
      )),
    [interactive],
  )

  return (
    <MapContainer
      crs={MOON_SOUTH_POLAR_CRS}
      center={[-90, 0]}
      zoom={3}
      minZoom={1}
      maxZoom={14}
      zoomSnap={0.25}
      zoomDelta={0.5}
      zoomControl={false}
      attributionControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      boxZoom={false}
      keyboard={interactive}
      className={`south-polar-map ${isPickerActive ? 'probe-mode' : ''}`}
      style={{ width: '100%', height: '100%', background: '#020408' }}
    >
      <FitCap margin={interactive ? 1.08 : 0.8} />
      <TrekLayer
        layerId={TREK_LAYERS.wac.id}
        zIndex={1}
        maxNativeZoom={TREK_LAYERS.wac.maxNativeZoom}
        maxZoom={14}
        errorTileUrl={TRANSPARENT_TILE}
        attribution="NASA Moon Trek · LRO LROC WAC / NAC"
      />
      {interactive && (
        <TrekLayer
          layerId={TREK_LAYERS.nac.id}
          extent={TREK_LAYERS.nac.extentM}
          zIndex={2}
          minZoom={6}
          maxNativeZoom={TREK_LAYERS.nac.maxNativeZoom}
          maxZoom={14}
          errorTileUrl={TRANSPARENT_TILE}
        />
      )}
      {interactive && (
        <TrekLayer
          layerId={TREK_LAYERS.malapert.id}
          extent={TREK_LAYERS.malapert.extentM}
          zIndex={3}
          minZoom={10}
          maxNativeZoom={TREK_LAYERS.malapert.maxNativeZoom}
          maxZoom={14}
          errorTileUrl={TRANSPARENT_TILE}
        />
      )}
      <Polyline
        positions={TERRAIN_FOOTPRINT}
        interactive={false}
        pathOptions={{ color: '#ffffff', weight: 1, opacity: 0.35, dashArray: '4 6' }}
      />
      {sites}
      {interactive && <ProbeClick onPick={handlePick} />}
      {onViewChange && <ViewReporter onChange={onViewChange} />}
      {probe && <ProbeMarker probe={probe} onClose={() => setProbe(null)} />}
    </MapContainer>
  )
}
