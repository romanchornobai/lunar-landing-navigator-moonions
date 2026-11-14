import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars, useGLTF } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { LandingTerrainModel } from './LandingTerrainModel'
import { LedButton } from '../ui/LedButton'
import { CockpitTelemetryHud, type EphemerisSnapshot, type LandingSiteData } from '../ui/CockpitTelemetryHud'

type Vec3 = [number, number, number]

// Static simulated ephemeris snapshot (Sun & Earth topocentric directions)
const MOCK_EPHEMERIS: EphemerisSnapshot = {
  sun: {
    azimuth: 116.6,
    elevation: 3.3,
    isAbove: true,
  },
  earth: {
    azimuth: 24.8,
    elevation: 1.8,
    isAbove: true,
  },
}

const SITE_INFO_MAP: Record<string, { name: string; shortName: string }> = {
  shackleton: { name: 'Cráter Shackleton - Borde Iluminado', shortName: 'Shackleton' },
  malapert: { name: 'Macizo de Malapert (Peak A)', shortName: 'Malapert' },
  degerlache: { name: 'Borde de Faustini / De Gerlache', shortName: 'De Gerlache' },
  nobile: { name: 'Cresta del Cráter Nobile', shortName: 'Nobile' },
}

// Artemis lunar lander centered on the ground at [0,0,0]
function ArtemisLander({ groundNormal = [-0.2871, 0.9229, -0.2567] }: { groundNormal?: Vec3 }) {
  const { scene } = useGLTF('/models/lander/lander.glb')

  // Align with the terrain slope
  const slopeQuaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const normal = new THREE.Vector3(...groundNormal).normalize()
    q.setFromUnitVectors(up, normal)
    return q
  }, [groundNormal])

  const cloned = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    // Exact pivot compensation so the legs sit at Y = 0
    clone.position.set(0.0, 67.037, -67.037)
    return clone
  }, [scene])

  return (
    <group position={[0, 0, 0]} quaternion={slopeQuaternion}>
      <group scale={0.1} rotation={[0, 0.35, 0]}>
        <primitive object={cloned} />
      </group>
      {/* Beacon on the top antenna */}
      <group position={[0, 14.5, 0]}>
        <mesh>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshBasicMaterial color="#38bdf8" toneMapped={false} />
        </mesh>
        <pointLight color="#38bdf8" intensity={2.5} distance={150} />
      </group>
    </group>
  )
}

interface LandingSceneCleanProps {
  /** Site identifier key. Defaults to 'shackleton'. */
  siteId?: string
  /** Terrain GLB. Defaults to Shackleton Connecting Ridge. */
  modelPath?: string
  /** Ground normal at the site center (scene axes, Y up). Defaults to Shackleton's. */
  groundNormal?: Vec3
}

export function LandingSceneClean({
  siteId = 'shackleton',
  modelPath = '/models/shackleton_rim/shackleton_rim_15km.glb',
  groundNormal = [-0.2871, 0.9229, -0.2567],
}: LandingSceneCleanProps) {
  const navigate = useNavigate()
  const info = SITE_INFO_MAP[siteId] || { name: 'Cráter Shackleton - Borde Iluminado', shortName: 'Shackleton' }
  const siteData: LandingSiteData = {
    id: siteId,
    name: info.name,
    shortName: info.shortName,
    groundNormal: groundNormal,
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000000', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [0, 6.0, 22.0], fov: 50, near: 0.5, far: 35000.0 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#010306']} />

        {/* Starfield */}
        <Stars radius={28000} depth={4000} count={6000} factor={6} saturation={0} fade speed={0.1} />

        {/* 1. Base ambient light */}
        <ambientLight intensity={0.38} color="#ffffff" />

        {/* 2. Main sun light with a wide orthographic shadow box to avoid black cut-offs */}
        <directionalLight
          position={[280, 80, 140]}
          intensity={2.8}
          color="#ffffff"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.00015}
          shadow-camera-near={5}
          shadow-camera-far={12000}
          shadow-camera-left={-4000}
          shadow-camera-right={4000}
          shadow-camera-top={4000}
          shadow-camera-bottom={-4000}
        />

        {/* 3. Secondary fill light (removes the black horizon shadows) */}
        <directionalLight position={[-3000, 1000, -2500]} intensity={0.42} color="#94a3b8" />

        {/* 3D content */}
        <Suspense fallback={null}>
          <LandingTerrainModel key={modelPath} modelPath={modelPath} />
          <ArtemisLander groundNormal={groundNormal} />
        </Suspense>

        {/* Orbital camera controls */}
        <OrbitControls
          target={[0, 1.5, 0]}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2 - 0.01}
          minDistance={2.0}
          maxDistance={350.0}
        />
      </Canvas>
      <div className="absolute top-6 left-6 z-10">
        <LedButton variant="compact" onClick={() => navigate('/vista-polar')}>
          POLO SUR
        </LedButton>
      </div>

      {/* Retro Sci-Fi Cockpit Telemetry HUD with simulated ephemeris */}
      <CockpitTelemetryHud site={siteData} ephemeris={MOCK_EPHEMERIS} />
    </div>
  )
}

useGLTF.preload('/models/lander/lander.glb')
