import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { AREA_SIZE_SCENE, TERRAIN_SIZE, getTerrainHeight } from '../../lib/southPoleGrid'

const SEGMENTS = 32 // samples per side (~0.47 km each)
const LIFT = 0.12 // scene units above the terrain, avoids z-fighting
const HALF = AREA_SIZE_SCENE / 2

/** Keeps the whole 15 x 15 km square inside the regional terrain. */
export function clampAreaCenter(x: number, z: number): [number, number] {
  const lim = TERRAIN_SIZE / 2 - HALF
  return [Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z))]
}

interface AreaHighlightProps {
  elevations: Float32Array
  center: [number, number] // scene x, z
  opacity?: number
}

/** Translucent blue 15 x 15 km square draped on the terrain, with a bright outline. */
export function AreaHighlight({ elevations, center, opacity = 0.32 }: AreaHighlightProps) {
  const surface = useMemo(() => {
    const g = new THREE.PlaneGeometry(AREA_SIZE_SCENE, AREA_SIZE_SCENE, SEGMENTS, SEGMENTS)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const outline = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGMENTS * 4 * 3), 3))
    return g
  }, [])

  // Drape both geometries on the terrain around the current centre (positions are world XZ).
  useLayoutEffect(() => {
    const [cx, cz] = center
    const pos = surface.attributes.position
    const n = SEGMENTS + 1
    for (let i = 0; i < pos.count; i++) {
      const col = i % n
      const row = Math.floor(i / n)
      const x = cx - HALF + (col / SEGMENTS) * AREA_SIZE_SCENE
      const z = cz - HALF + (row / SEGMENTS) * AREA_SIZE_SCENE
      pos.setXYZ(i, x, getTerrainHeight(elevations, x, z) + LIFT, z)
    }
    pos.needsUpdate = true
    surface.computeBoundingSphere()

    // Border: walk the 4 edges of the vertex grid
    const border: [number, number][] = []
    for (let k = 0; k < SEGMENTS; k++) border.push([k, 0])
    for (let k = 0; k < SEGMENTS; k++) border.push([SEGMENTS, k])
    for (let k = SEGMENTS; k > 0; k--) border.push([k, SEGMENTS])
    for (let k = SEGMENTS; k > 0; k--) border.push([0, k])
    const line = outline.attributes.position
    border.forEach(([c, r], j) => {
      const v = r * n + c
      line.setXYZ(j, pos.getX(v), pos.getY(v) + 0.05, pos.getZ(v))
    })
    line.needsUpdate = true
    outline.computeBoundingSphere()
  }, [center, elevations, surface, outline])

  return (
    <group>
      <mesh geometry={surface} raycast={() => null} renderOrder={2}>
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <lineLoop geometry={outline} raycast={() => null} renderOrder={3}>
        <lineBasicMaterial color="#7dd3fc" transparent opacity={0.95} toneMapped={false} />
      </lineLoop>
    </group>
  )
}

/** Beacon on the best point found inside the area. */
export function BestPointBeacon({ position, height = 9 }: { position: [number, number, number]; height?: number }) {
  return (
    <group position={position}>
      {/* Ground ring */}
      <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={4}>
        <ringGeometry args={[0.55, 0.95, 40]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} depthTest={false} toneMapped={false} />
      </mesh>
      {/* Mast (thin cylinder: lines are 1 px wide in WebGL) */}
      <mesh position={[0, height / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.07, 0.07, height, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      {/* Head */}
      <mesh position={[0, height, 0]} raycast={() => null}>
        <sphereGeometry args={[0.75, 20, 20]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[0, height, 0]} raycast={() => null}>
        <sphereGeometry args={[1.25, 20, 20]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
