import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars, useGLTF } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { LandingTerrainModel } from './LandingTerrainModel'
import { SkyBodies, type BodyState } from './SkyBodies'
import { ChevronLeft } from 'lucide-react'
import { CockpitTelemetryHud, type LandingSiteData } from '../ui/CockpitTelemetryHud'
import { FlightDateSelector } from '../ui/FlightDateSelector'
import {
  EPHEMERIS_SITES,
  EPHEMERIS_SITE_LATLON,
  EPHEMERIS_START_MS,
  getEphemerisAt,
  loadEphemeridesBuffer,
  type EphemerisSiteKey,
} from '@/utils/ephemerisClient'
import { horizonAt, horizonProfile, hoursUntilVisibilityChange, sunDiscFraction, SUN_RADIUS_DEG } from '@/lib/visibility'

type Vec3 = [number, number, number]

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
  const siteKey: EphemerisSiteKey = (EPHEMERIS_SITES as readonly string[]).includes(siteId)
    ? (siteId as EphemerisSiteKey)
    : 'shackleton'
  const siteLonDeg = EPHEMERIS_SITE_LATLON[siteKey][1]
  const profile = useMemo(() => horizonProfile(siteKey), [siteKey])

  // Mission date (UTC) and Sun/Earth directions from the baked JPL Horizons buffer.
  const [missionDate, setMissionDate] = useState(() => new Date(EPHEMERIS_START_MS))
  const [ephemerisReady, setEphemerisReady] = useState(false)
  useEffect(() => {
    loadEphemeridesBuffer()
      .then(() => setEphemerisReady(true))
      .catch((e) => console.error(e))
  }, [])
  const ephemeris = useMemo(
    () => (ephemerisReady ? getEphemerisAt(siteKey, missionDate) : null),
    [ephemerisReady, siteKey, missionDate],
  )

  // Visibility against the LOLA horizon of the site (same model as the comparison table and the backend).
  const sky = useMemo(() => {
    if (!ephemeris || !profile) return null
    const hour = (missionDate.getTime() - EPHEMERIS_START_MS) / 3.6e6
    const sunH = horizonAt(profile, ephemeris.sun.azimuth)
    const earthH = horizonAt(profile, ephemeris.earth.azimuth)
    const sunVisible = ephemeris.sun.elevation + SUN_RADIUS_DEG > sunH // any part of the disc
    const earthVisible = ephemeris.earth.elevation > earthH // Earth centre (DTE)
    const sun: BodyState & { discFraction: number } = {
      ...ephemeris.sun,
      horizon: sunH,
      visible: sunVisible,
      discFraction: sunDiscFraction(ephemeris.sun.elevation, sunH),
      // Next rise / set from the hourly samples (1 h resolution, up to 60 days ahead).
      hoursToChange: hoursUntilVisibilityChange(siteKey, 'sun', hour, sunVisible),
    }
    const earth: BodyState = {
      ...ephemeris.earth,
      horizon: earthH,
      visible: earthVisible,
      hoursToChange: hoursUntilVisibilityChange(siteKey, 'earth', hour, earthVisible),
    }
    return { sun, earth }
  }, [ephemeris, profile, missionDate, siteKey])

  // HUD check marks follow the terrain-aware visibility.
  const hudEphemeris = useMemo(
    () =>
      ephemeris && sky
        ? {
            sun: { ...ephemeris.sun, isAbove: sky.sun.visible },
            earth: { ...ephemeris.earth, isAbove: sky.earth.visible },
          }
        : ephemeris,
    [ephemeris, sky],
  )

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

        {/* Sun, Earth, far LOLA horizon and lighting from the JPL Horizons directions */}
        <Suspense fallback={null}>
          {sky ? (
            <SkyBodies siteLonDeg={siteLonDeg} horizonDeg={profile} sun={sky.sun} earth={sky.earth} />
          ) : (
            <ambientLight intensity={0.6} />
          )}
        </Suspense>

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
        <button
          onClick={() => navigate('/vista-polar')}
          title="Volver al polo sur"
          aria-label="Volver al polo sur"
          className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-all hover:-translate-x-0.5 active:scale-90 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]"
        >
          <ChevronLeft size={34} strokeWidth={1.5} />
        </button>
      </div>

      {/* Mission date selector, top center */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50">
        <FlightDateSelector siteId={siteId} currentDate={missionDate} onDateChange={setMissionDate} />
      </div>

      {/* Retro Sci-Fi Cockpit Telemetry HUD driven by the JPL Horizons ephemerides */}
      <CockpitTelemetryHud site={siteData} ephemeris={hudEphemeris} />
    </div>
  )
}

useGLTF.preload('/models/lander/lander.glb')
