import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * Opening camera flight over the South Pole terrain (scene units, target at the origin):
 * starts far and high, orbits ~150 deg while descending and closing in, and stops at the default view.
 * OrbitControls (makeDefault) are disabled while it plays. `onProgress` gets 0..1 every frame.
 */
const DURATION_S = 6.5
const START = { radius: 270, polar: THREE.MathUtils.degToRad(14), azimuth: THREE.MathUtils.degToRad(-150) }

/** Azimuth where the flight starts (rad, atan2(x, z) convention): used to order the marker reveal. */
export const INTRO_START_AZIMUTH = START.azimuth

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function IntroCameraFlight({
  end,
  onProgress,
  onDone,
}: {
  /** Final camera position (the page default view). */
  end: [number, number, number]
  onProgress: (t: number) => void
  onDone: () => void
}) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera
    controls: { enabled: boolean; target: THREE.Vector3; update: () => void } | null
  }
  const elapsed = useRef(0)
  const finished = useRef(false)
  const endSph = useRef(new THREE.Spherical().setFromVector3(new THREE.Vector3(...end)))
  const sph = useRef(new THREE.Spherical())

  useEffect(() => {
    if (controls) controls.enabled = false
    return () => {
      if (controls) controls.enabled = true
    }
  }, [controls])

  useFrame((_, delta) => {
    if (finished.current) return
    // Clamp delta so a slow first frame (shader compile) does not skip the start of the flight
    elapsed.current += Math.min(delta, 1 / 30)
    const t = Math.min(1, elapsed.current / DURATION_S)
    const k = easeInOutCubic(t)
    const e = endSph.current
    sph.current.set(
      THREE.MathUtils.lerp(START.radius, e.radius, k),
      THREE.MathUtils.lerp(START.polar, e.phi, k),
      THREE.MathUtils.lerp(START.azimuth, e.theta, k),
    )
    camera.position.setFromSpherical(sph.current)
    camera.lookAt(0, 0, 0)
    onProgress(t)
    if (t >= 1) {
      finished.current = true
      if (controls) {
        controls.target.set(0, 0, 0)
        controls.enabled = true
        controls.update()
      }
      onDone()
    }
  })

  return null
}
