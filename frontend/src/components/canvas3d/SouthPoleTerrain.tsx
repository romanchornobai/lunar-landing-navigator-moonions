import { Suspense, useCallback, useMemo, useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Html, OrbitControls, Stars } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { BarChart3, ChevronLeft, Crosshair } from 'lucide-react'
import { SITES_IN_3D, getSite3DPosition, scenePointToLunarCoords } from '../../data/sites'
import { GRID, MEAN_Z, SCALE_Y, TERRAIN_SIZE, getTerrainHeight, latLonToScene } from '../../lib/southPoleGrid'
import { SiteMarker } from './SiteMarker'
import { AreaHighlight, BestPointBeacon, clampAreaCenter } from './AreaHighlight'
import { SiteComparisonPanel } from '../ui/SiteComparisonPanel'
import { AreaHoloPanel, type AreaComputeState } from '../ui/AreaHoloPanel'
import { AreaComputeLoader } from '../ui/AreaComputeLoader'
import { startAreaSearch } from '../../services/areaSearch'
import SouthPolarMap, { type MapViewInfo } from '../map2d/SouthPolarMap'
import MiniSouthPoleTerrain from './MiniSouthPoleTerrain'

// Regional South Pole terrain: NASA Moon Trek (LRO LOLA) 1200x1200 Float32 grid, ~212 x 212 km around Shackleton.
// Georeference, mirroring and height units: lib/southPoleGrid.ts (registered against LRO LOLA GDR, see DATA_SOURCES.md).
const BASE = '/models/south_pole'

/** Selected 15 x 15 km area: scene centre and its lat / lon (sent to the local backend). */
interface SelectedArea {
  center: [number, number]
  latitude: number
  longitude: number
  elevation_m: number | null
}

/** Area panel anchored above the area centre; opens towards the screen centre. */
function AreaPanelAnchor({
  anchor,
  area,
  state,
  onCompute,
  onClose,
}: {
  anchor: [number, number, number]
  area: SelectedArea
  state: AreaComputeState
  onCompute: () => void
  onClose: () => void
}) {
  const { camera, size } = useThree()
  const direction = useMemo(() => {
    const p = new THREE.Vector3(...anchor).project(camera)
    return ((p.x + 1) / 2) * size.width > size.width / 2 ? ('left' as const) : ('right' as const)
    // Decided once per selected area (camera moves do not flip the panel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor[0], anchor[2]])
  return (
    <Html position={anchor} center style={{ pointerEvents: 'none' }}>
      <AreaHoloPanel center={area} state={state} direction={direction} onCompute={onCompute} onClose={onClose} />
    </Html>
  )
}

interface TerrainProps {
  isPickerActive: boolean
  hoverCenter: [number, number] | null
  onHoverCenter: (c: [number, number] | null) => void
  area: SelectedArea | null
  onSelectArea: (area: SelectedArea) => void
  compute: AreaComputeState
  onCompute: () => void
  onCloseArea: () => void
}

function Terrain({
  isPickerActive,
  hoverCenter,
  onHoverCenter,
  area,
  onSelectArea,
  compute,
  onCompute,
  onCloseArea,
}: TerrainProps) {
  const buffer = useLoader(THREE.FileLoader, `${BASE}/lunar_elevation_1200.bin`, (loader) => {
    loader.setResponseType('arraybuffer')
  }) as unknown as ArrayBuffer
  const [albedo, normal, ao] = useLoader(THREE.TextureLoader, [
    `${BASE}/lunar_albedo_2k.png`,
    `${BASE}/lunar_normal_2k.png`,
    `${BASE}/lunar_ao_2k.png`,
  ])

  const elevations = useMemo(() => new Float32Array(buffer), [buffer])

  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, GRID - 1, GRID - 1)
    geom.rotateX(-Math.PI / 2)
    const pos = geom.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, (elevations[i] - MEAN_Z) * SCALE_Y)
    pos.needsUpdate = true
    geom.computeVertexNormals()
    return geom
  }, [elevations])

  // Low-resolution collision proxy (60x60) for instant, lag-free raycasting (~0.1ms vs ~150ms)
  const proxyGeometry = useMemo(() => {
    const SUB = 60
    const geom = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SUB - 1, SUB - 1)
    geom.rotateX(-Math.PI / 2)
    const pos = geom.attributes.position
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, getTerrainHeight(elevations, pos.getX(i), pos.getZ(i)))
    }
    pos.needsUpdate = true
    geom.computeVertexNormals()
    return geom
  }, [elevations])

  // Calculate the exact 3D positions of the candidate landing sites on the terrain
  const sitePositions = useMemo(() => {
    return SITES_IN_3D.map((site) => ({
      site,
      position: getSite3DPosition(site, elevations) as [number, number, number],
    }))
  }, [elevations])

  // Best point of the computed area (lat / lon from the backend -> scene)
  const best = compute.status === 'done' ? compute.result.best : null
  const bestPosition = useMemo(
    () => (best ? latLonToScene(best.lat, best.lon, elevations) : null),
    [best, elevations],
  )

  albedo.colorSpace = THREE.SRGBColorSpace
  normal.colorSpace = THREE.NoColorSpace
  ao.colorSpace = THREE.NoColorSpace

  const areaAnchor: [number, number, number] | null = area
    ? [area.center[0], getTerrainHeight(elevations, area.center[0], area.center[1]) + 2.5, area.center[1]]
    : null

  return (
    <group>
      {/* High-resolution visual mesh (2.88M triangles): raycast disabled to prevent CPU bottleneck on mouse move */}
      <mesh
        geometry={geometry}
        raycast={() => null}
      >
        <meshStandardMaterial
          map={albedo}
          normalMap={normal}
          normalScale={new THREE.Vector2(1.25, 1.25)}
          aoMap={ao}
          aoMapIntensity={1.2}
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>

      {/* Lightweight invisible collision proxy - only active when the area selector is on */}
      {isPickerActive && (
        <mesh
          geometry={proxyGeometry}
          onPointerMove={(e) => {
            e.stopPropagation()
            onHoverCenter(clampAreaCenter(e.point.x, e.point.z))
          }}
          onPointerLeave={() => onHoverCenter(null)}
          onClick={(e) => {
            e.stopPropagation()
            const [x, z] = clampAreaCenter(e.point.x, e.point.z)
            const y = getTerrainHeight(elevations, x, z)
            const c = scenePointToLunarCoords({ x, y, z }, elevations)
            onSelectArea({ center: [x, z], latitude: c.latitude, longitude: c.longitude, elevation_m: c.elevation_m })
          }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* 15 x 15 km square under the cursor (blue) and the selected one (stronger) */}
      {isPickerActive && hoverCenter && <AreaHighlight elevations={elevations} center={hoverCenter} opacity={0.22} />}
      {area && <AreaHighlight elevations={elevations} center={area.center} opacity={0.38} />}

      {sitePositions.map(({ site, position }) => (
        <SiteMarker key={site.id} site={site} position={position} />
      ))}

      {bestPosition && <BestPointBeacon position={bestPosition} />}

      {area && areaAnchor && (
        <AreaPanelAnchor anchor={areaAnchor} area={area} state={compute} onCompute={onCompute} onClose={onCloseArea} />
      )}
    </group>
  )
}

export default function SouthPoleTerrain() {
  const navigate = useNavigate()
  const [isPickerActive, setIsPickerActive] = useState(false)
  const [isComparisonOpen, setIsComparisonOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d')
  const [mapView, setMapView] = useState<MapViewInfo | null>(null)
  const [hoverCenter, setHoverCenter] = useState<[number, number] | null>(null)
  const [area, setArea] = useState<SelectedArea | null>(null)
  const [compute, setCompute] = useState<AreaComputeState>({ status: 'idle' })
  const cancelSearch = useRef<(() => void) | null>(null)
  const searchInfo = useRef<{ total: number; period: [string, string] | null }>({ total: 0, period: null })

  useEffect(() => {
    if (isPickerActive) {
      document.body.style.cursor = 'crosshair'
    } else {
      document.body.style.cursor = 'auto'
      setHoverCenter(null)
    }
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [isPickerActive])

  // Cancel a running search when leaving the page
  useEffect(() => () => cancelSearch.current?.(), [])

  const handleSelectArea = useCallback(
    (a: SelectedArea) => {
      if (compute.status === 'computing') return // the area stays fixed while it is being computed
      setArea(a)
      setCompute({ status: 'idle' })
    },
    [compute.status],
  )

  const handleCompute = useCallback(() => {
    if (!area) return
    cancelSearch.current?.()
    searchInfo.current = { total: 0, period: null }
    setCompute({ status: 'computing', done: 0, total: 0 })
    cancelSearch.current = startAreaSearch(area.latitude, area.longitude, {
      onStart: (d) => {
        searchInfo.current = { total: d.total, period: d.period_utc }
        setCompute({ status: 'computing', done: 0, total: d.total })
      },
      onProgress: (done, total) => setCompute({ status: 'computing', done, total }),
      onResult: (result) =>
        setCompute({ status: 'done', result, total: searchInfo.current.total, period: searchInfo.current.period }),
      onError: (message) => setCompute({ status: 'error', message }),
    })
  }, [area])

  const handleCloseArea = useCallback(() => {
    cancelSearch.current?.()
    cancelSearch.current = null
    setArea(null)
    setCompute({ status: 'idle' })
  }, [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#020408' }}>
      {/* 3D view stays mounted (no re-parse of the 1200x1200 mesh); it just stops rendering in 2D. */}
      <div className={`absolute inset-0 ${viewMode === '3d' ? '' : 'invisible'}`}>
      <Canvas
        frameloop={viewMode === '3d' ? 'always' : 'never'}
        dpr={[1, 1.5]}
        camera={{ position: [0, 80, 115], fov: 45, near: 0.1, far: 2000 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#020408']} />
        <ambientLight color="#ffffff" intensity={0.45} />
        <directionalLight position={[100, 80, 80]} intensity={2.8} color="#ffffff" />
        <directionalLight position={[-80, 50, -60]} intensity={0.65} color="#cbd5e1" />
        <Stars radius={180} depth={80} count={4000} factor={4} saturation={0} fade speed={0.3} />
        <Suspense fallback={null}>
          <Terrain
            isPickerActive={isPickerActive && viewMode === '3d'}
            hoverCenter={hoverCenter}
            onHoverCenter={setHoverCenter}
            area={area}
            onSelectArea={handleSelectArea}
            compute={compute}
            onCompute={handleCompute}
            onCloseArea={handleCloseArea}
          />
        </Suspense>
        <OrbitControls
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={15}
          maxDistance={280}
        />
      </Canvas>
      </div>

      {viewMode === '2d' && (
        <div className="absolute inset-0 z-10">
          <SouthPolarMap isPickerActive={isPickerActive} onViewChange={setMapView} />
        </div>
      )}

      {isComparisonOpen && <SiteComparisonPanel onClose={() => setIsComparisonOpen(false)} />}

      {/* Area search progress (top centre) */}
      {viewMode === '3d' && compute.status === 'computing' && (
        <AreaComputeLoader done={compute.done} total={compute.total} />
      )}

      {/* Top Left: Navigation back to Lunar Globe */}
      <div className="absolute top-6 left-6 z-20">
        <button
          onClick={() => navigate('/vista-lunar')}
          title="Volver al globo lunar"
          aria-label="Volver al globo lunar"
          className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-all hover:-translate-x-0.5 active:scale-90 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]"
        >
          <ChevronLeft size={34} strokeWidth={1.5} />
        </button>
      </div>

      {/* Top Right: Coordinate Probe Icon Button */}
      <div className="absolute top-6 right-6 z-40 flex items-center gap-3">
        {/* Site comparison panel toggle (icon only) */}
        <button
          onClick={() => setIsComparisonOpen((prev) => !prev)}
          className={`group relative flex items-center justify-center w-10 h-10 transition-all duration-300 select-none cursor-pointer active:scale-90 ${
            isComparisonOpen
              ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.95)]'
              : 'text-white/80 drop-shadow-[0_0_6px_rgba(255,255,255,0.6)] hover:text-white hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.95)]'
          }`}
          title={isComparisonOpen ? 'Cerrar comparativa' : 'Comparar puntos de aterrizaje'}
        >
          <BarChart3 className="w-7 h-7" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => {
            setIsPickerActive((prev) => !prev)
          }}
          className={`group relative flex items-center justify-center w-10 h-10 transition-all duration-300 select-none cursor-pointer active:scale-90 ${
            isPickerActive
              ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.95)]'
              : 'text-white/80 drop-shadow-[0_0_6px_rgba(255,255,255,0.6)] hover:text-white hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.95)]'
          }`}
          title={
            viewMode === '3d'
              ? isPickerActive
                ? 'Desactivar selector de área'
                : 'Seleccionar un área de 15 × 15 km'
              : isPickerActive
                ? 'Desactivar selector de coordenadas'
                : 'Activar selector de coordenadas'
          }
        >
          <Crosshair
            strokeWidth={1.5}
            className={`w-7 h-7 transition-transform duration-300 ${
              isPickerActive ? '' : 'group-hover:rotate-90'
            }`}
          />
        </button>

        {/* Round view toggle: shows a live preview of the other view (2D map in 3D, spinning terrain in 2D) */}
        <div className="relative">
        <button
          onClick={() => setViewMode((m) => (m === '3d' ? '2d' : '3d'))}
          className="relative w-24 h-24 rounded-full overflow-hidden border border-white/50 bg-[#020408] cursor-pointer transition-all duration-300 active:scale-95 shadow-[0_0_12px_rgba(255,255,255,0.35)] hover:border-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)]"
          title={viewMode === '3d' ? 'Ver mapa 2D' : 'Ver terreno 3D'}
          aria-label={viewMode === '3d' ? 'Ver mapa 2D' : 'Ver terreno 3D'}
        >
          <div className="absolute inset-0 pointer-events-none">
            {viewMode === '3d' ? <SouthPolarMap interactive={false} /> : <MiniSouthPoleTerrain />}
          </div>
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest text-white drop-shadow-[0_0_4px_rgba(0,0,0,1)] pointer-events-none">
            {viewMode === '3d' ? '2D' : '3D'}
          </span>
        </button>

        {/* 2D zoom readout: level, imagery layer on screen and ground resolution */}
        {viewMode === '2d' && mapView && (
          <div className="absolute top-full right-0 mt-2 whitespace-nowrap text-right font-mono text-[10px] leading-4 tracking-widest text-white/85 drop-shadow-[0_0_4px_rgba(0,0,0,1)] pointer-events-none select-none">
            <div>ZOOM {mapView.zoom.toFixed(2).replace(/\.?0+$/, '')}</div>
            <div>{mapView.layer}</div>
            <div>
              {mapView.mPerPx >= 1000
                ? `${(mapView.mPerPx / 1000).toFixed(1)} KM/PX`
                : `${mapView.mPerPx < 10 ? mapView.mPerPx.toFixed(1) : Math.round(mapView.mPerPx)} M/PX`}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
