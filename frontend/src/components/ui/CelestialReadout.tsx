import React, { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'

export const CELESTIAL_MODELS = {
  sun: '/models/icons/sun_model.glb',
  earth: '/models/icons/earth.glb',
} as const

interface CelestialReadoutProps {
  body: keyof typeof CELESTIAL_MODELS
  /** Degrees, clockwise from north. undefined while there is no ephemeris data. */
  azimuth?: number
  /** Degrees above the local horizon. undefined while there is no ephemeris data. */
  elevation?: number
  /** Direct light (Sun) / visible (Earth). Elevation > 0 deg, terrain not included. */
  isAbove?: boolean
}

/** Small transparent canvas with a slowly spinning model (used for Sun, Earth and the lander). */
export const SpinningModelCanvas: React.FC<{ url: string; earthLight?: boolean }> = ({ url, earthLight }) => (
  <Canvas camera={{ position: [0, 0, 3.1], fov: 30 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
    <ambientLight intensity={earthLight ? 0.9 : 1} />
    <directionalLight position={[3, 2, 4]} intensity={earthLight ? 2.2 : 1} />
    <Suspense fallback={null}>
      <SpinningBody url={url} />
    </Suspense>
  </Canvas>
)

// Slowly spinning model, normalized to a unit-radius sphere (source GLBs use very different scales).
function SpinningBody({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const group = useRef<THREE.Group>(null)
  const model = useMemo(() => scene.clone(true), [scene])

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    model.position.sub(center)
    model.scale.setScalar(1 / radius)
    model.position.multiplyScalar(1 / radius)
  }, [model])

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.5
  })

  return (
    <group ref={group} rotation={[0.35, 0, 0]}>
      <primitive object={model} />
    </group>
  )
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#4ade80" strokeWidth="3.2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ filter: 'drop-shadow(0 0 4px #4ade80) drop-shadow(0 0 9px rgba(74,222,128,0.7))' }}>
    <path d="M4 12.5l5.5 5.5L20 6.5" />
  </svg>
)

const CrossIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ef4444" strokeWidth="3.2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const fmt = (v?: number) => (v === undefined ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(1)}°`)

/** Minimal readout: spinning model | AZ / EL in white | green check (lit) or red cross (not). */
export const CelestialReadout: React.FC<CelestialReadoutProps> = ({ body, azimuth, elevation, isAbove }) => (
  <div className="flex items-center gap-3">
    <div className="w-16 h-16 shrink-0">
      <SpinningModelCanvas url={CELESTIAL_MODELS[body]} earthLight={body === 'earth'} />
    </div>
    <div className="text-[15px] leading-tight text-white">
      <div>AZ: {azimuth === undefined ? '--' : `${azimuth.toFixed(1)}°`}</div>
      <div>EL: {fmt(elevation)}</div>
    </div>
    <div className="w-7 flex justify-center">
      {isAbove === undefined ? null : isAbove ? <CheckIcon /> : <CrossIcon />}
    </div>
  </div>
)

useGLTF.preload(CELESTIAL_MODELS.sun)
useGLTF.preload(CELESTIAL_MODELS.earth)
useGLTF.preload('/models/lander/lander.glb')
