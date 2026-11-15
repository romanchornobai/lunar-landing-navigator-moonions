import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
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
): THREE.CanvasTexture {
  const img = source.image as HTMLImageElement | ImageBitmap
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const [u, v] = facingUv()
  const lat = (v - 0.5) * Math.PI
  const fontPx = Math.round(h * 0.032)
  ctx.save()
  ctx.translate(u * w, (1 - v) * h)
  ctx.scale(1 / Math.max(0.2, Math.cos(lat)), 1)
  ctx.font = `900 ${fontPx}px "Arial Black", "Helvetica Neue", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(fontPx * 0.18)}px`
  ctx.filter = `blur(${Math.max(0.6, fontPx * blurRel).toFixed(1)}px)`
  ctx.fillStyle = `rgba(0, 0, 0, ${strength})`
  ctx.fillText(ENGRAVING, 0, 0)
  // Thin dark outline: sharper letter edges
  ctx.lineWidth = Math.max(1, fontPx * 0.03)
  ctx.strokeStyle = `rgba(0, 0, 0, ${strength * 0.6})`
  ctx.strokeText(ENGRAVING, 0, 0)
  ctx.restore()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = colorSpace
  tex.anisotropy = source.anisotropy
  return tex
}

function Moon() {
  const [colorMap, elevationMap] = useLoader(THREE.TextureLoader, [COLOR_URL, ELEVATION_URL])
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  colorMap.anisotropy = Math.min(8, maxAniso)

  // Engraved copies: letters sunk into the relief (elevation) and slightly darker in colour
  const engravedColor = useMemo(() => engrave(colorMap, 0.3, THREE.SRGBColorSpace, 0.02), [colorMap])
  const engravedElevation = useMemo(() => engrave(elevationMap, 0.6, THREE.NoColorSpace, 0.012), [elevationMap])
  useEffect(
    () => () => {
      engravedColor.dispose()
      engravedElevation.dispose()
    },
    [engravedColor, engravedElevation],
  )

  return (
    <mesh rotation={[0, MOON_ROTATION_Y, 0]}>
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
          <Moon />
        </Suspense>
      </Canvas>
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
        <LedButton variant="compact" className="min-w-[190px]" onClick={() => navigate('/vista-polar')}>
          EMPEZAR
        </LedButton>
      </div>
    </div>
  )
}
