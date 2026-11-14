import { Suspense, useMemo, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { Crosshair } from 'lucide-react'
import { LANDING_SITES, getSite3DPosition, getTerrainHeight, scenePointToLunarCoords } from '../../data/sites'
import { SiteMarker } from './SiteMarker'
import { TerrainProbeMarker } from './TerrainProbeMarker'
import { LedButton } from '../ui/LedButton'

// Regional South Pole cap (lat -90..-84, ~364 km): LOLA-derived 1200x1200 Float32 elevation grid
// (meters, NASA Moon Trek). Geometry params from ASSETS.md.
const BASE = '/models/south_pole'
const GRID = 1200
const TERRAIN_SIZE = 150 // scene units
const MEAN_Z = 24.97 // m, mean elevation subtracted
const SCALE_Y = (TERRAIN_SIZE / GRID) * 1.3 * 1.5 // 0.24375 scene units per m (exaggerated)

interface TerrainProps {
  isPickerActive: boolean
  onPickPoint: (point: THREE.Vector3) => void
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
    return LANDING_SITES.map((site) => ({
      site,
      position: getSite3DPosition(site, elevations),
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
            onPickPoint(new THREE.Vector3(e.point.x, exactY, e.point.z))
          }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Small white stick at cursor location while probe mode is active */}
      {isPickerActive && hoverPoint && (
        <mesh position={[hoverPoint[0], hoverPoint[1] + 1.25, hoverPoint[2]]}>
          <cylinderGeometry args={[0.1, 0.1, 2.5, 8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      )}

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

  const handlePickPoint = (point: THREE.Vector3) => {
    const coords = scenePointToLunarCoords({ x: point.x, y: point.y, z: point.z })
    setProbe({
      position: [point.x, point.y, point.z],
      coords,
    })
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#020408' }}>
      <Canvas
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

      {/* Top Left: Navigation back to Lunar Globe */}
      <div className="absolute top-6 left-6 z-20">
        <LedButton variant="compact" onClick={() => navigate('/vista-lunar')}>
          GLOBO LUNAR
        </LedButton>
      </div>

      {/* Top Right: Coordinate Probe Icon Button */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <button
          onClick={() => {
            setIsPickerActive((prev) => !prev)
          }}
          className={`group relative flex items-center justify-center w-[38px] h-[38px] rounded transition-all duration-300 backdrop-blur-md font-mono text-xs select-none cursor-pointer border ${
            isPickerActive
              ? 'bg-white/20 border-white text-white shadow-[0_0_18px_rgba(255,255,255,0.4)]'
              : 'bg-black/60 border-white/30 text-neutral-300 hover:text-white hover:border-white/70 hover:bg-black/80'
          }`}
          title={isPickerActive ? 'Desactivar selector de coordenadas' : 'Activar selector de coordenadas'}
        >
          <Crosshair
            className={`w-4 h-4 transition-transform duration-300 ${
              isPickerActive ? 'text-white' : 'group-hover:rotate-90'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
