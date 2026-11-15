import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { LedButton } from '../ui/LedButton'

// NASA SVS CGI Moon Kit (https://svs.gsfc.nasa.gov/4720/): LROC WAC color + LOLA DEM.
// Browser-native 8-bit derivatives of the 16-bit TIFFs (same resolution; see DATA_SOURCES.md),
// decoded off the main thread with GPU mipmaps. Sphere radius 2.0 scene units; relief params from ASSETS.md.
const COLOR_URL = '/textures/moon_color_8k.jpg' // 8192x4096 sRGB
const ELEVATION_URL = '/textures/moon_elevation_8bit.png' // 5760x2880 grey, LOLA DEM

const CAMERA_POS: [number, number, number] = [0, -1.2, 4.0]
const MOON_ROTATION_Y = -Math.PI / 2

/**
 * Decorative title engraved on the globe (team name, not lunar data): it is drawn on top of copies of the colour
 * and elevation rasters, at the point of the sphere facing the camera, so the relief shading carves it in.
 */
const ENGRAVING = 'Moonions'
/** How far above the facing point the engraving sits [deg of latitude]. */
const ENGRAVING_LIFT_DEG = 9

/** Texture UV (u, v) of the sphere point facing the camera (three.js SphereGeometry mapping, mesh rotated in Y). */
function facingUv(): [number, number] {
  const d = new THREE.Vector3(...CAMERA_POS).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -MOON_ROTATION_Y)
  // SphereGeometry: x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta); u = phi / 2pi, v = 1 - theta / pi
  const theta = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1))
  let phi = Math.atan2(d.z, -d.x)
  if (phi < 0) phi += 2 * Math.PI
  return [phi / (2 * Math.PI), 1 - theta / Math.PI]
}

/**
 * Copy of `source` with ENGRAVING darkened into it (soft edges). `strength` 0..1 = how much the letters are darkened.
 * Equirectangular stretch at that latitude is compensated so the letters keep their proportions on the sphere.
 */
function engrave(
  source: THREE.Texture,
  strength: number,
  colorSpace: THREE.ColorSpace,
  /** Edge softness relative to the font size (small = crisp walls in the relief). */
  blurRel: number,
  /** Colour layer only: inner wall shadow and grain. */
  shaded = false,
): THREE.CanvasTexture {
  const img = source.image as HTMLImageElement | ImageBitmap
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const [u, v0] = facingUv()
  const v = v0 + ENGRAVING_LIFT_DEG / 180 // a bit above the centre of the visible disc
  const lat = (v - 0.5) * Math.PI
  const fontPx = Math.round(h * 0.032)
  const sx = 1 / Math.max(0.2, Math.cos(lat))

  // Letters are drawn in an offscreen layer (mask), so the shading and grain stay inside them
  const lw = Math.ceil(fontPx * (ENGRAVING.length * 1.2 + 1.5) * sx)
  const lh = Math.ceil(fontPx * 1.8)
  const layer = document.createElement('canvas')
  layer.width = lw
  layer.height = lh
  const lc = layer.getContext('2d')!
  const drawText = (c: CanvasRenderingContext2D, dx = 0, dy = 0) => {
    c.save()
    c.translate(lw / 2 + dx, lh / 2 + dy)
    c.scale(sx, 1)
    c.font = `900 ${fontPx}px "Arial Black", "Helvetica Neue", Arial, sans-serif`
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    ;(c as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(fontPx * 0.18)}px`
    // Word + crescent Moon icon, centred together
    const tw = c.measureText(ENGRAVING).width
    const r = fontPx * 0.4
    const gap = fontPx * 0.3
    const x0 = -(tw + gap + 2 * r) / 2
    c.fillText(ENGRAVING, x0, 0)
    // Crescent: outer circle minus the same circle shifted right by d (two arcs between their intersections)
    const cx = x0 + tw + gap + r
    const cy = -fontPx * 0.04
    const d = r * 0.85
    const hh = Math.sqrt(r * r - (d * d) / 4)
    const a = Math.atan2(hh, d / 2)
    c.beginPath()
    c.arc(cx, cy, r, a, 2 * Math.PI - a)
    c.arc(cx + d, cy, r, -(Math.PI - a), Math.PI - a, true)
    c.closePath()
    c.fill()
    c.restore()
  }
  // 1. Base fill of the carved floor
  lc.fillStyle = `rgba(0, 0, 0, ${strength})`
  drawText(lc)
  if (shaded) {
    // 2. Inner shadow on the upper-right walls (light comes from the upper right): letters minus a shifted copy
    const o = Math.max(1, fontPx * 0.06)
    const sh = document.createElement('canvas')
    sh.width = lw
    sh.height = lh
    const sc = sh.getContext('2d')!
    sc.fillStyle = 'rgba(0, 0, 0, 0.55)'
    drawText(sc)
    sc.globalCompositeOperation = 'destination-out'
    sc.fillStyle = '#000'
    drawText(sc, -o, o)
    lc.drawImage(sh, 0, 0)
    // 3. Fine grain inside the letters (rough carved floor)
    lc.globalCompositeOperation = 'source-atop'
    for (let i = 0; i < lw * lh * 0.04; i++) {
      lc.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.12)'
      lc.fillRect(Math.random() * lw, Math.random() * lh, 1.5, 1.5)
    }
    lc.globalCompositeOperation = 'source-over'
  }

  ctx.filter = `blur(${Math.max(0.6, fontPx * blurRel).toFixed(1)}px)`
  ctx.drawImage(layer, u * w - lw / 2, (1 - v) * h - lh / 2)
  ctx.filter = 'none'

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = colorSpace
  tex.anisotropy = source.anisotropy
  return tex
}

/** EMPEZAR exit: the globe spins fast (ease-in) so the engraving turns away, then the next view opens. */
const SPIN_S = 0.9
const SPIN_RAD = Math.PI * 1.25

function Moon({ spinning = false, onSpinDone }: { spinning?: boolean; onSpinDone?: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const spinT = useRef(0)
  const spinDone = useRef(false)
  useFrame((_, delta) => {
    const m = meshRef.current
    if (!m || !spinning || spinDone.current) return
    spinT.current = Math.min(1, spinT.current + Math.min(delta, 1 / 30) / SPIN_S)
    const k = spinT.current * spinT.current * spinT.current // ease-in: accelerates
    m.rotation.y = MOON_ROTATION_Y - SPIN_RAD * k
    if (spinT.current >= 1) {
      spinDone.current = true
      onSpinDone?.()
    }
  })

  const [colorMap, elevationMap] = useLoader(THREE.TextureLoader, [COLOR_URL, ELEVATION_URL])
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  colorMap.anisotropy = Math.min(8, maxAniso)

  // Engraved copies: letters sunk into the relief (elevation) and slightly darker in colour
  const engravedColor = useMemo(() => engrave(colorMap, 0.3, THREE.SRGBColorSpace, 0.012, true), [colorMap])
  const engravedElevation = useMemo(() => engrave(elevationMap, 0.6, THREE.NoColorSpace, 0.012), [elevationMap])
  useEffect(
    () => () => {
      engravedColor.dispose()
      engravedElevation.dispose()
    },
    [engravedColor, engravedElevation],
  )

  return (
    <mesh ref={meshRef} rotation={[0, MOON_ROTATION_Y, 0]}>
      <sphereGeometry args={[2, 384, 384]} />
      <meshStandardMaterial
        map={engravedColor}
        displacementMap={engravedElevation}
        displacementScale={0.05}
        displacementBias={-0.015}
        bumpMap={engravedElevation}
        bumpScale={0.03}
        roughness={0.92}
        metalness={0.02}
      />
    </mesh>
  )
}

export default function LunarGlobe() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* Fixed view: no orbit controls, the Moon cannot be rotated or zoomed */}
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: CAMERA_POS, fov: 45 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[8, 4, 6]} intensity={2.8} />
        <directionalLight position={[-8, -2, -6]} intensity={0.3} />
        <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />
        <Suspense fallback={null}>
          <Moon spinning={leaving} onSpinDone={() => navigate('/vista-polar')} />
        </Suspense>
      </Canvas>
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
        <LedButton variant="compact" className="min-w-[190px]" onClick={() => setLeaving(true)}>
          EMPEZAR
        </LedButton>
      </div>
    </div>
  )
}
