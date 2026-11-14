import { useEffect, useState } from 'react'

// LOLA-derived 1200x1200 Float32 elevation grid of the -90..-84 cap (meters). See ASSETS.md.
export const SOUTH_POLE_ELEVATION_URL = '/models/south_pole/lunar_elevation_1200.bin'

let pending: Promise<Float32Array> | null = null

/** Loads the regional elevation grid once per page and shares it between views. */
export function loadSouthPoleElevation(): Promise<Float32Array> {
  if (!pending) {
    pending = fetch(SOUTH_POLE_ELEVATION_URL)
      .then((r) => r.arrayBuffer())
      .then((b) => new Float32Array(b))
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
