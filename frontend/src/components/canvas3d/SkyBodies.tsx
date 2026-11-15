/**
 * Sun, Earth, far LOLA horizon and lighting of the site 3D view, driven by the JPL Horizons buffer.
 *
 * - Directions: (azimuth, elevation) of the site's own Horizons track, turned into scene axes by lib/skyGeometry.ts.
 * - Sizes: true angular sizes (Sun radius 0.266 deg, Earth 0.95 deg), drawn far away (Sun 30 km, Earth 25 km).
 * - Far horizon: the 15 km terrain mesh ends at 7.5 km, but terrain up to 200 km sets the horizon. A ring at 20 km is
 *   raised to the LOLA horizon H(theta) of the site (data/horizonProfiles.json, 2 m mast), so a body hides behind it
 *   exactly when the visibility model says so.
 * - Light: the Sun's directional light is scaled by the visible fraction of its disc; a soft ambient fill keeps
 *   shadows readable (artistic, not physical); earthshine comes from the Earth's direction, scaled by its phase.
 * - Earth: lit by the Sun direction only (its phase is right even when the Sun is hidden at the site). Its north pole
 *   points roughly down because the lunar spin axis does at the South Pole; its rotation angle is not modelled.
 */
import { useLayoutEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { azElToScene, EARTH_RADIUS_DEG, earthIlluminatedFraction, SUN_RADIUS_DEG } from '@/lib/skyGeometry'

const DEG = Math.PI / 180
const SUN_DIST = 30000 // m
const EARTH_DIST = 25000 // m
const RING_DIST = 20000 // m, beyond the 7.5 km half-width of the terrain mesh
const RING_BOTTOM = -4500 // m below the site centre (lower than any terrain of the 4 meshes)
const MAST_M = 2 // m, observer height of the horizon profiles
const EARTH_URL = '/models/celestial/Earth.glb'
const SHADOW_HALF = 500 // m, shadow window around the lander (a 13 m lander at 1.5 deg casts a ~500 m shadow)

export interface BodyState {
  azimuth: number
  elevation: number
  /** LOLA terrain horizon at this azimuth, deg. */
  horizon: number
  /** Visible above the terrain (Sun: any part of the disc; Earth: centre, DTE). */
  visible: boolean
  /** Hours until the visibility changes (1 h resolution), null if not within the scan window. */
  hoursToChange: number | null
}

interface SkyBodiesProps {
  siteLonDeg: number
  horizonDeg: number[] | null
  sun: BodyState & { discFraction: number }
  earth: BodyState
}

/** Radial glow; rgb = 'r,g,b' (default warm white for the Sun). */
function glowTexture(rgb = '255,236,200'): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, `rgba(${rgb},1)`)
  grad.addColorStop(0.15, `rgba(${rgb},0.55)`)
  grad.addColorStop(0.45, `rgba(${rgb},0.12)`)
  grad.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function HorizonRing({ horizonDeg, siteLonDeg }: { horizonDeg: number[]; siteLonDeg: number }) {
  const geometry = useMemo(() => {
    const n = horizonDeg.length
    const pos: number[] = []
    const nrm: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= n; i++) {
      const az = (i * 360) / n
      const d = azElToScene(az, 0, siteLonDeg)
      const top = MAST_M + RING_DIST * Math.tan(horizonDeg[i % n] * DEG)
      pos.push(d.x * RING_DIST, top, d.z * RING_DIST, d.x * RING_DIST, RING_BOTTOM, d.z * RING_DIST)
      nrm.push(-d.x, 0, -d.z, -d.x, 0, -d.z) // faces the site
      if (i < n) {
        const k = 2 * i
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    g.setIndex(idx)
    return g
  }, [horizonDeg, siteLonDeg])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#4b5059" roughness={1} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Sun({ dir, fraction }: { dir: THREE.Vector3; fraction: number }) {
  const glow = useMemo(glowTexture, [])
  const r = SUN_DIST * Math.tan(SUN_RADIUS_DEG * DEG)
  const p = dir.clone().multiplyScalar(SUN_DIST)
  return (
    <group position={p}>
      <mesh>
        <sphereGeometry args={[r, 32, 16]} />
        <meshBasicMaterial color="#fff7e6" toneMapped={false} />
      </mesh>
      <sprite scale={[r * 9, r * 9, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.9 * fraction} blending={THREE.AdditiveBlending}
          depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite scale={[r * 30, r * 30, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.35 * fraction} blending={THREE.AdditiveBlending}
          depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vViewW = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const earthFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDir;
  uniform float rim;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    float lambert = max(dot(normalize(vNormalW), sunDir), 0.0);
    vec3 c = texture2D(map, vUv).rgb * (1.25 * lambert + 0.015);
    // Limb rim: a thin bluish glow on the edge of the disc.
    float limb = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewW)), 0.0), 4.0);
    c += rim * limb * vec3(0.55, 0.75, 1.0);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`

function Earth({ dir, sunDir, night }: { dir: THREE.Vector3; sunDir: THREE.Vector3; night: boolean }) {
  const { scene } = useGLTF(EARTH_URL)
  const uniforms = useMemo(() => ({ sunDir: { value: new THREE.Vector3() }, rim: { value: 0 } }), [])
  const model = useMemo(() => {
    const m = scene.clone(true)
    m.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as THREE.MeshStandardMaterial
      mesh.material = new THREE.ShaderMaterial({
        uniforms: { map: { value: src.map }, sunDir: uniforms.sunDir, rim: uniforms.rim },
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
      })
    })
    return m
  }, [scene, uniforms])
  const [norm, setNorm] = useState<{ center: THREE.Vector3; radius: number } | null>(null)
  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(model)
    setNorm({ center: box.getCenter(new THREE.Vector3()), radius: box.getSize(new THREE.Vector3()).x / 2 })
  }, [model])
  uniforms.sunDir.value.copy(sunDir)
  // A thin lit contour makes the Earth easy to find (legibility, not physical): strong in night vision,
  // subtle (but present) while the Sun is up.
  uniforms.rim.value = night ? 1.6 : 0.7

  const r = EARTH_DIST * Math.tan(EARTH_RADIUS_DEG * DEG)
  const s = norm ? r / norm.radius : 0
  return (
    <group position={dir.clone().multiplyScalar(EARTH_DIST)} rotation={[Math.PI, 0, 0]}>
      {norm && (
        <group scale={s}>
          <primitive object={model} position={norm.center.clone().negate()} />
        </group>
      )}
    </group>
  )
}

function Lights({ sunDir, sunFraction, earthDir, earthVisible, earthPhase }: {
  sunDir: THREE.Vector3
  sunFraction: number
  earthDir: THREE.Vector3
  earthVisible: boolean
  earthPhase: number
}) {
  const sunPos = sunDir.clone().multiplyScalar(1500)
  const earthPos = earthDir.clone().multiplyScalar(1500)
  // Sun fully hidden: the scene is brightened (and tinted green by the night-vision filter in LandingSceneClean).
  const night = sunFraction <= 0
  return (
    <>
      {/* Soft fill so shadowed terrain stays readable (the Moon has no sky light: this is for legibility). */}
      <ambientLight color="#c9d1dc" intensity={night ? 0.95 : 0.42} />
      <hemisphereLight args={['#aab4c3', '#3a3d44', night ? 0.6 : 0.25]} />
      {/* Night vision: a soft light over the lander's surroundings makes the nearby relief glow and read. */}
      {night && <pointLight position={[0, 8, 0]} color="#d6e4ff" intensity={60} distance={180} decay={1.2} />}
      <directionalLight
        position={sunPos}
        color="#fff4e2"
        intensity={3.2 * sunFraction}
        castShadow={sunFraction > 0}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
        shadow-camera-near={10}
        shadow-camera-far={3000}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
      />
      {/* Earthshine: sunlight reflected by the Earth, proportional to its lit fraction. */}
      <directionalLight position={earthPos} color="#a9bfe3" intensity={earthVisible ? (night ? 1.0 : 0.45) * earthPhase : 0} />
    </>
  )
}

const fmtDeg = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`
function fmtHours(h: number | null): string {
  if (h === null) return 'more than 60 days'
  if (h < 1) return 'less than 1 h'
  const d = Math.floor(h / 24)
  const hh = Math.round(h - d * 24)
  return d > 0 ? `${d} d ${hh} h` : `${hh} h`
}

/** Hover target at the body's true direction; a dashed "ghost" circle when the body is hidden. */
function BodyMarker({ dir, radiusDeg, name, lines, hidden }: {
  dir: THREE.Vector3
  radiusDeg: number
  name: string
  lines: string[]
  hidden: boolean
}) {
  const [hover, setHover] = useState(false)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const height = useThree((s) => s.size.height)
  const px = Math.max(22, ((2 * radiusDeg) / camera.fov) * height)
  return (
    <Html position={dir.clone().multiplyScalar(EARTH_DIST)} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        style={{
          width: px,
          height: px,
          borderRadius: '50%',
          border: hidden ? '1.5px dashed rgba(255,255,255,0.55)' : '1px solid transparent',
          pointerEvents: 'auto',
          cursor: 'help',
          position: 'relative',
        }}
      >
        {hover && (
          <div
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/85 border border-white/25 px-3 py-2 text-white"
            style={{
              bottom: px / 2 + 14,
              fontFamily: "'IBM EGA 8x8', 'VT323', monospace",
              fontSize: 13,
              lineHeight: 1.5,
              letterSpacing: '0.05em',
            }}
          >
            <div className="font-bold mb-0.5">{name}</div>
            {lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        )}
      </div>
    </Html>
  )
}

export function SkyBodies({ siteLonDeg, horizonDeg, sun, earth }: SkyBodiesProps) {
  const sunDir = useMemo(() => azElToScene(sun.azimuth, sun.elevation, siteLonDeg), [sun.azimuth, sun.elevation, siteLonDeg])
  const earthDir = useMemo(
    () => azElToScene(earth.azimuth, earth.elevation, siteLonDeg),
    [earth.azimuth, earth.elevation, siteLonDeg],
  )
  const phase = earthIlluminatedFraction(sunDir, earthDir)

  const below = (b: BodyState, r: number) => b.elevation + r <= 0
  const sunLines = [
    `AZ ${sun.azimuth.toFixed(1)}°  EL ${fmtDeg(sun.elevation)}`,
    `Terrain in that direction: ${fmtDeg(sun.horizon)}`,
    sun.visible
      ? `Visible: ${Math.round(sun.discFraction * 100)} % of the disc`
      : below(sun, SUN_RADIUS_DEG)
        ? 'Below the horizon'
        : 'Blocked by terrain',
    `${sun.visible ? 'Sets' : 'Returns'} in ${fmtHours(sun.hoursToChange)}`,
  ]
  const earthLines = [
    `AZ ${earth.azimuth.toFixed(1)}°  EL ${fmtDeg(earth.elevation)}`,
    `Terrain in that direction: ${fmtDeg(earth.horizon)}`,
    earth.visible ? 'Direct-to-Earth (DTE) link possible' : `No DTE link: ${below(earth, 0) ? 'below the horizon' : 'blocked by terrain'}`,
    `${earth.visible ? 'Lost' : 'Returns'} in ${fmtHours(earth.hoursToChange)}`,
    `Phase: ${Math.round(phase * 100)} % illuminated`,
  ]

  return (
    <>
      <Lights sunDir={sunDir} sunFraction={sun.discFraction} earthDir={earthDir} earthVisible={earth.visible}
        earthPhase={phase} />
      {horizonDeg && <HorizonRing horizonDeg={horizonDeg} siteLonDeg={siteLonDeg} />}
      <Sun dir={sunDir} fraction={sun.discFraction} />
      <Earth dir={earthDir} sunDir={sunDir} night={sun.discFraction <= 0} />
      <BodyMarker dir={sunDir} radiusDeg={SUN_RADIUS_DEG} name="SUN" lines={sunLines} hidden={!sun.visible} />
      <BodyMarker dir={earthDir} radiusDeg={EARTH_RADIUS_DEG} name="EARTH" lines={earthLines} hidden={!earth.visible} />
    </>
  )
}

// Preloaded in the background by lib/prefetchAssets.ts once the first view has loaded.
