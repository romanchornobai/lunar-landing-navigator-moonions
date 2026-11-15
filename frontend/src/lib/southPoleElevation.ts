import { useEffect, useState } from 'react'

// LOLA-derived 1200x1200 elevation grid of the -90..-84 cap (scene units, see southPoleGrid.ts and ASSETS.md),
// quantized for download size: header float32 [min, step], then 1200 x 1200 little-endian uint16 q, value = min + q * step
// (max error 0.0003 units ~ 0.07 m, far below the grid's +-261 m height accuracy).
export const SOUTH_POLE_ELEVATION_URL = '/models/south_pole/lunar_elevation_1200_u16.bin'

/** Decodes the quantized grid file into the Float32 values (row-major, 1200 x 1200). */
export function decodeSouthPoleElevation(buffer: ArrayBuffer): Float32Array {
  const [min, step] = new Float32Array(buffer, 0, 2)
  const q = new Uint16Array(buffer, 8)
  const out = new Float32Array(q.length)
  for (let i = 0; i < q.length; i++) out[i] = min + q[i] * step
  return out
}

let pending: Promise<Float32Array> | null = null

/** Loads the regional elevation grid once per page and shares it between views. */
export function loadSouthPoleElevation(): Promise<Float32Array> {
  if (!pending) {
    pending = fetch(SOUTH_POLE_ELEVATION_URL)
      .then((r) => r.arrayBuffer())
      .then(decodeSouthPoleElevation)
  }
  return pending
}

export function useSouthPoleElevation(): Float32Array | null {
  const [elevations, setElevations] = useState<Float32Array | null>(null)
  useEffect(() => {
    let alive = true
    loadSouthPoleElevation().then((e) => alive && setElevations(e))
    return () => {
      alive = false
    }
  }, [])
  return elevations
}
