import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, useGLTF } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { LandingTerrainModel } from './LandingTerrainModel'
import { SkyBodies, type BodyState } from './SkyBodies'
import { ChevronLeft } from 'lucide-react'
import { CockpitTelemetryHud, type LandingSiteData } from '../ui/CockpitTelemetryHud'
import { FlightDateSelector } from '../ui/FlightDateSelector'
import { SITES, type SiteKey } from './LandingSite'
import { EPHEMERIS_START_MS, loadEphemeridesBuffer } from '@/utils/ephemerisClient'
import {
  horizonAt,
  horizonProfile,
  hoursUntilVisibilityChange,
  localDirectionsAt,
  sunDiscFraction,
  SUN_RADIUS_DEG,
} from '@/lib/visibility'

type Vec3 = [number, number, number]

// Green image-intensifier look: luminance -> green tint, brighter and a bit more contrast.
const NIGHT_VISION_FILTER = 'grayscale(1) sepia(1) hue-rotate(78deg) saturate(3.2) brightness(1.2) contrast(1.15)'

const SITE_INFO_MAP: Record<SiteKey, { name: string; shortName: string }> = {
  cr1: { name: 'Connecting Ridge (CR1)', shortName: 'CR1' },
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

/** Resting camera (scene units, metres) and orbit target next to the lander. */
const CAMERA_END: Vec3 = [-42.9, 23.4, -74.3] // azimuth 210 deg (atan2(x, z)), same distance and height
const CAMERA_TARGET: Vec3 = [0, 1.5, 0]
const INTRO_S = 1.6

/**
 * Short opening move once the terrain and lander are loaded: the camera comes in from 1.6x farther and a bit higher,
 * swinging ~40 deg around the lander, and settles at CAMERA_END. OrbitControls are disabled meanwhile.
 */
function SiteIntroCamera() {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera
    controls: { enabled: boolean; target: THREE.Vector3; update: () => void } | null
  }
  const t = useRef(0)
  const done = useRef(false)
  const target = useMemo(() => new THREE.Vector3(...CAMERA_TARGET), [])
  const end = useMemo(() => new THREE.Spherical().setFromVector3(new THREE.Vector3(...CAMERA_END).sub(target)), [target])
  const start = useMemo(
    () => new THREE.Spherical(end.radius * 1.6, Math.max(0.15, end.phi - 0.35), end.theta - THREE.MathUtils.degToRad(40)),
    [end],
  )
  const s = useMemo(() => new THREE.Spherical(), [])

  useEffect(() => {
    if (controls) controls.enabled = false
    return () => {
      if (controls) controls.enabled = true
    }
  }, [controls])

  useFrame((_, delta) => {
    if (done.current) return
    t.current = Math.min(1, t.current + Math.min(delta, 1 / 30) / INTRO_S)
    const k = 1 - Math.pow(1 - t.current, 3) // ease-out
    s.set(
      THREE.MathUtils.lerp(start.radius, end.radius, k),
      THREE.MathUtils.lerp(start.phi, end.phi, k),
      THREE.MathUtils.lerp(start.theta, end.theta, k),
    )
    camera.position.setFromSpherical(s).add(target)
    camera.lookAt(target)
    if (t.current >= 1) {
      done.current = true
      if (controls) {
        controls.enabled = true
        controls.update()
      }
    }
  })
  return null
}

interface LandingSceneCleanProps {
  /** Route key of the site (see SITES in LandingSite.tsx). */
  siteId?: SiteKey
}

export function LandingSceneClean({ siteId = 'cr1' }: LandingSceneCleanProps) {
  const navigate = useNavigate()
  const site = SITES[siteId]
  const modelPath = site.glb
  const groundNormal = site.normal as unknown as Vec3
  const info = SITE_INFO_MAP[siteId]
  const siteData: LandingSiteData = {
    id: siteId,
    name: info.name,
    shortName: info.shortName,
    groundNormal: groundNormal,
  }
  const siteLonDeg = site.lon
  const profile = useMemo(() => horizonProfile(site.profile), [site.profile])

  // Mission date (UTC) and Sun/Earth directions from the baked JPL Horizons buffer.
  const [missionDate, setMissionDate] = useState(() => new Date(EPHEMERIS_START_MS))
  const [ephemerisReady, setEphemerisReady] = useState(false)
  useEffect(() => {
    loadEphemeridesBuffer()
      .then(() => setEphemerisReady(true))
      .catch((e) => console.error(e))
  }, [])
  // Exact Horizons track for the 4 buffer sites; CR1 is re-projected from Shackleton's (22.6 km, Earth parallax
  // < 0.004 deg).
  const ephemeris = useMemo(
    () => (ephemerisReady ? localDirectionsAt(site.lat, site.lon, missionDate) : null),
    [ephemerisReady, site.lat, site.lon, missionDate],
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
      hoursToChange: hoursUntilVisibilityChange(site.profile, 'sun', hour, sunVisible),
    }
    const earth: BodyState = {
      ...ephemeris.earth,
      horizon: earthH,
      visible: earthVisible,
      hoursToChange: hoursUntilVisibilityChange(site.profile, 'earth', hour, earthVisible),
    }
    return { sun, earth }
  }, [ephemeris, profile, missionDate, site.profile])

  const nightVision = !!sky && !sky.sun.visible // no part of the solar disc above the terrain

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
      {/* Night vision: when the Sun is fully hidden by the terrain (no direct light) the whole 3D view (terrain, lander,
          Earth, labels) gets a green intensifier look; the HUD stays untouched. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: nightVision ? NIGHT_VISION_FILTER : 'none',
          transition: 'filter 0.6s ease',
        }}
      >
      <Canvas
        shadows
        // initial position = start of SiteIntroCamera (no jump when the scene finishes loading)
        camera={{ position: [20.3, 81.5, -115.1], fov: 50, near: 0.5, far: 35000.0 }}
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
          <SiteIntroCamera key={siteId} />
        </Suspense>

        {/* Orbital camera controls */}
        <OrbitControls
          target={CAMERA_TARGET}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2 - 0.01}
          minDistance={2.0}
          maxDistance={350.0}
        />
      </Canvas>
      </div>
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
