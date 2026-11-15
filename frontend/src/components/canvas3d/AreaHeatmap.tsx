import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { latLonToScene } from '../../lib/southPoleGrid'
import type { AreaCandidateStats } from '../../services/areaSearch'

/**
 * Score of every evaluated point of a computed area (backend area search, 150 highest LOLA pixels of 250 m cells):
 * one thin column per point, height and colour from the ranking value (share of hours with Sun AND Earth visible,
 * 2026-11-14..2029-11-14). Red = lowest value in this area, white = highest; shows how much the result changes over
 * a few hundred metres. Positions: lat / lon -> regional 3D terrain (lib/southPoleGrid.ts, +-0.9 km georeference).
 */
const RADIUS = 0.06 // scene units (~85 m)
const MIN_H = 0.35
const MAX_H = 3.2
const GROW_S = 0.9 // grow-in animation
const LOW = new THREE.Color('#ef4444')
const HIGH = new THREE.Color('#ffffff')

export type HeatmapKey = 'sun_and_dte' | 'sun_mean_fraction' | 'dte'

interface AreaHeatmapProps {
  points: AreaCandidateStats[]
  valueKey: HeatmapKey
  elevations: Float32Array
}

export function AreaHeatmap({ points, valueKey, elevations }: AreaHeatmapProps) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const grow = useRef(0)
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 6)
    g.translate(0, 0.5, 0) // base on the ground
    return g
  }, [])

  const items = useMemo(() => {
    const values = points.map((p) => p[valueKey])
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    return points.map((p) => {
      const t = hi > lo ? (p[valueKey] - lo) / (hi - lo) : 1
      return { pos: latLonToScene(p.lat, p.lon, elevations), t }
    })
  }, [points, valueKey, elevations])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const c = new THREE.Color()
    items.forEach((it, i) => m.setColorAt(i, c.copy(LOW).lerp(HIGH, it.t)))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    grow.current = 0
  }, [items])

  const tmp = useMemo(() => new THREE.Object3D(), [])
  useFrame((_, dt) => {
    const m = mesh.current
    if (!m || grow.current >= 1) return
    grow.current = Math.min(1, grow.current + dt / GROW_S)
    const k = 1 - Math.pow(1 - grow.current, 3) // ease-out
    items.forEach((it, i) => {
      tmp.position.set(it.pos[0], it.pos[1], it.pos[2])
      tmp.scale.set(1, (MIN_H + (MAX_H - MIN_H) * it.t) * k + 1e-3, 1)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      key={items.length}
      ref={mesh}
      args={[geometry, undefined, items.length]}
      raycast={() => null}
      renderOrder={4}
    >
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
