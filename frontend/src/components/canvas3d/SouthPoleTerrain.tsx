import { Suspense, useMemo, useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { BarChart3, ChevronLeft, Crosshair } from 'lucide-react'
import { SITES_IN_3D, getSite3DPosition, scenePointToLunarCoords } from '../../data/sites'
import { GRID, MEAN_Z, SCALE_Y, TERRAIN_SIZE, getTerrainHeight, mirrorGeometryZ } from '../../lib/southPoleGrid'
import { SiteMarker } from './SiteMarker'
import { TerrainProbeMarker } from './TerrainProbeMarker'
import { SiteComparisonPanel } from '../ui/SiteComparisonPanel'
import SouthPolarMap, { type MapViewInfo } from '../map2d/SouthPolarMap'
import MiniSouthPoleTerrain from './MiniSouthPoleTerrain'

// Regional South Pole terrain: NASA Moon Trek (LRO LOLA) 1200x1200 Float32 grid, ~212 x 212 km around Shackleton.
// Georeference, mirroring and height units: lib/southPoleGrid.ts (registered against LRO LOLA GDR, see DATA_SOURCES.md).
const BASE = '/models/south_pole'

const STICK_HEIGHT = 1.2 // scene units
const STICK_REST_MS = 350 // cursor must rest this long before the stick grows

function HoverStick({ point }: { point: [number, number, number] }) {
  const stick = useRef<THREE.Mesh>(null)
  const grow = useRef({ value: 0, target: 0 })

  // Moving the cursor collapses the stick; resting on a point grows it.
  useEffect(() => {
    grow.current.value = 0
    grow.current.target = 0
    const timer = setTimeout(() => {
      grow.current.target = 1
    }, STICK_REST_MS)
    return () => clearTimeout(timer)
  }, [point[0], point[2]])

  useFrame((_, dt) => {
    const g = grow.current
    g.value += (g.target - g.value) * Math.min(1, dt * 9)
    if (stick.current) {
      const s = Math.max(g.value, 0.0001)
      stick.current.scale.y = s
      stick.current.position.y = (STICK_HEIGHT * s) / 2
      stick.current.visible = g.value > 0.01
    }
  })

  return (
    <group position={point}>
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh ref={stick} visible={false}>
        <cylinderGeometry args={[0.06, 0.06, STICK_HEIGHT, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  )
}

type ProbeLatLon = { latitude: number; longitude: number; elevation_m: number }

interface TerrainProps {
  isPickerActive: boolean
  onPickPoint: (point: THREE.Vector3, coords: ProbeLatLon) => void
  probe: {
    position: [number, number, number]
    coords: {
      latitude: number
      longitude: number
      elevation_m: number
    }
  } | null
  onCloseProbe: () => void
  hoverPoint: [number, number, number] | null
  onHoverPoint: (pt: [number, number, number] | null) => void
}

function Terrain({
  isPickerActive,
  onPickPoint,
  probe,
  onCloseProbe,
  hoverPoint,
  onHoverPoint,
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
    mirrorGeometryZ(geom) // the stored grid is mirrored: show the real geography
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
      pos.setY(i, getTerrainHeight(elevations, pos.getX(i), pos.getZ(i))) // already in the mirrored frame
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

  albedo.colorSpace = THREE.SRGBColorSpace
  normal.colorSpace = THREE.NoColorSpace
  ao.colorSpace = THREE.NoColorSpace

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

      {/* Lightweight invisible collision proxy - only active when probe mode is on */}
      {isPickerActive && (
        <mesh
          geometry={proxyGeometry}
          onPointerMove={(e) => {
            e.stopPropagation()
            const exactY = getTerrainHeight(elevations, e.point.x, e.point.z)
            onHoverPoint([e.point.x, exactY, e.point.z])
          }}
          onPointerLeave={() => {
            onHoverPoint(null)
          }}
          onClick={(e) => {
            e.stopPropagation()
            const exactY = getTerrainHeight(elevations, e.point.x, e.point.z)
            const picked = new THREE.Vector3(e.point.x, exactY, e.point.z)
            onPickPoint(picked, scenePointToLunarCoords(picked, elevations))
          }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* White dot at the cursor; a short stick grows from it once the cursor rests */}
      {isPickerActive && hoverPoint && <HoverStick point={hoverPoint} />}

      {sitePositions.map(({ site, position }) => (
        <SiteMarker key={site.id} site={site} position={position} />
      ))}

      {probe && (
        <TerrainProbeMarker
          position={probe.position}
          coords={probe.coords}
          onClose={onCloseProbe}
        />
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
  const [hoverPoint, setHoverPoint] = useState<[number, number, number] | null>(null)
  const [probe, setProbe] = useState<{
    position: [number, number, number]
    coords: {
      latitude: number
      longitude: number
      elevation_m: number
    }
  } | null>(null)

  useEffect(() => {
    if (isPickerActive) {
      document.body.style.cursor = 'crosshair'
    } else {
      document.body.style.cursor = 'auto'
      setHoverPoint(null)
    }
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [isPickerActive])

  const handlePickPoint = (point: THREE.Vector3, coords: ProbeLatLon) => {
    setProbe({
      position: [point.x, point.y, point.z],
      coords,
    })
  }

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
            isPickerActive={isPickerActive}
            onPickPoint={handlePickPoint}
            probe={probe}
            onCloseProbe={() => setProbe(null)}
            hoverPoint={hoverPoint}
            onHoverPoint={setHoverPoint}
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
          title={isPickerActive ? 'Desactivar selector de coordenadas' : 'Activar selector de coordenadas'}
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
