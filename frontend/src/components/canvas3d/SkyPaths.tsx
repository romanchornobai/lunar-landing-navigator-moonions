import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { azElToScene } from '@/lib/skyGeometry'

/**
 * Sun and Earth tracks over the next days in the site sky (hourly JPL Horizons directions, lib/visibility.ts
 * localTracks). Each track is drawn twice: solid, hidden by the LOLA horizon ring like the bodies themselves, and as a
 * faint dashed line through the terrain so the hidden part of the track stays readable. The small loop of the Earth
 * is the Moon's optical libration.
 */
const SUN_PATH_DIST = 29000 // m, just inside the Sun sprite distance (SkyBodies SUN_DIST 30 km)
const EARTH_PATH_DIST = 24000 // m, just inside the Earth model distance (SkyBodies EARTH_DIST 25 km)

interface SkyPathsProps {
  siteLonDeg: number
  sun: Float32Array // [az, el] deg per hour
  earth: Float32Array
  days: number
}

function points(track: Float32Array, siteLonDeg: number, dist: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i < track.length; i += 2) out.push(azElToScene(track[i], track[i + 1], siteLonDeg).multiplyScalar(dist))
  return out
}

/** Scene point of the highest sample of a track (label anchor). */
function highest(track: Float32Array, siteLonDeg: number, dist: number): THREE.Vector3 {
  let best = 1
  for (let i = 3; i < track.length; i += 2) if (track[i] > track[best]) best = i
  return azElToScene(track[best - 1], track[best], siteLonDeg).multiplyScalar(dist)
}

function Track({ pts, color, label, at }: { pts: THREE.Vector3[]; color: string; label: string; at: THREE.Vector3 }) {
  if (pts.length < 2) return null
  return (
    <group>
      <Line points={pts} color={color} lineWidth={2} transparent opacity={0.95} toneMapped={false} />
      <Line
        points={pts}
        color={color}
        lineWidth={1}
        dashed
        dashSize={300}
        gapSize={300}
        transparent
        opacity={0.35}
        depthTest={false}
        toneMapped={false}
      />
      <Html position={at} center style={{ pointerEvents: 'none' }}>
        <div
          className="font-mono text-[10px] tracking-[0.2em] whitespace-nowrap -translate-y-4"
          style={{ color, textShadow: '0 0 6px #000, 0 0 2px #000' }}
        >
          {label}
        </div>
      </Html>
    </group>
  )
}

export function SkyPaths({ siteLonDeg, sun, earth, days }: SkyPathsProps) {
  const sunPts = useMemo(() => points(sun, siteLonDeg, SUN_PATH_DIST), [sun, siteLonDeg])
  const earthPts = useMemo(() => points(earth, siteLonDeg, EARTH_PATH_DIST), [earth, siteLonDeg])
  const sunTop = useMemo(() => highest(sun, siteLonDeg, SUN_PATH_DIST), [sun, siteLonDeg])
  const earthTop = useMemo(() => highest(earth, siteLonDeg, EARTH_PATH_DIST), [earth, siteLonDeg])
  return (
    <>
      <Track pts={sunPts} color="#fcd34d" label={`SUN · NEXT ${days} DAYS`} at={sunTop} />
      <Track pts={earthPts} color="#7dd3fc" label={`EARTH · NEXT ${days} DAYS · LIBRATION`} at={earthTop} />
    </>
  )
}
