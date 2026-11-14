import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import {
  CAP_EDGE_LAT,
  CAP_RADIUS_M,
  MOON_SOUTH_POLAR_CRS,
  TREK_LAYERS,
  lunarToPolarXY,
  zoomToFitRadius,
} from '../../lib/moonSouthPolarCrs'
import { useSouthPoleElevation } from '../../lib/southPoleElevation'
import { LANDING_SITES, lunarCoordsToScenePoint, scenePointToLunarCoords } from '../../data/sites'
import { ProbeHoloPanel, type ProbeCoords } from '../ui/ProbeHoloPanel'

const TRANSPARENT_TILE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
const ANCHOR_ICON = L.divIcon({ className: 'probe-anchor', html: '', iconSize: [1, 1], iconAnchor: [0, 0] })

// -84 deg parallel: edge of the regional cap used by the 3D view.
const CAP_RING: [number, number][] = Array.from({ length: 181 }, (_, i) => [CAP_EDGE_LAT, -180 + i * 2])

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

interface SouthPolarMapProps {
  /** false: static preview (used inside the round view toggle). */
  interactive?: boolean
  isPickerActive?: boolean
}

/**
 * 2D South Pole map: NASA Moon Trek WMTS tiles in South Polar Stereographic (IAU2000:30120).
 * LROC WAC mosaic as base, LROC NAC mosaic on top when zoomed in (inside 85.5 S).
 */
export default function SouthPolarMap({ interactive = true, isPickerActive = false }: SouthPolarMapProps) {
  const elevations = useSouthPoleElevation()
  const [probe, setProbe] = useState<Probe2D | null>(null)

  useEffect(() => {
    if (!isPickerActive) setProbe(null)
  }, [isPickerActive])

  const handlePick = (lat: number, lon: number, xPx: number, widthPx: number) => {
    if (!isPickerActive || !elevations || lat > CAP_EDGE_LAT) return
    // Elevation from the same LOLA grid and calibration as the 3D probe, so both views agree.
    const [x, y, z] = lunarCoordsToScenePoint(lat, lon, elevations)
    const { elevation_m } = scenePointToLunarCoords({ x, y, z })
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
          pathOptions={{ color: '#ff2a2a', weight: 1, fillColor: '#ff2a2a', fillOpacity: 1 }}
        >
          {interactive && (
            <Tooltip direction="right" offset={[8, 0]} className="polar-site-tooltip">
              {s.name}
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
      maxZoom={12}
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
      <TileLayer
        url={TREK_LAYERS.wac.url}
        maxNativeZoom={TREK_LAYERS.wac.maxNativeZoom}
        maxZoom={12}
        errorTileUrl={TRANSPARENT_TILE}
        attribution="NASA Moon Trek · LRO LROC WAC / NAC"
      />
      {interactive && (
        <TileLayer
          url={TREK_LAYERS.nac.url}
          minZoom={6}
          maxNativeZoom={TREK_LAYERS.nac.maxNativeZoom}
          maxZoom={12}
          errorTileUrl={TRANSPARENT_TILE}
        />
      )}
      <Polyline
        positions={CAP_RING}
        interactive={false}
        pathOptions={{ color: '#ffffff', weight: 1, opacity: 0.35, dashArray: '4 6' }}
      />
      {sites}
      {interactive && <ProbeClick onPick={handlePick} />}
      {probe && <ProbeMarker probe={probe} onClose={() => setProbe(null)} />}
    </MapContainer>
  )
}
