/**
 * Client of the local area-search backend (backend/app/api/area.py, FastAPI on :8000, proxied by Vite at /api).
 * GET /api/area-search/stream?lat=&lon=  ->  Server-Sent Events 'start', 'candidate' (progress), 'result', 'error'.
 * The backend evaluates the highest LOLA pixel of every 250 m cell of a 15 x 15 km square centred at (lat, lon):
 * 200 km horizon, hourly Sun / Earth from JPL Horizons 2026-11-14..2029-11-14, 2 m mast (see DATA_SOURCES.md).
 */

export interface AreaCandidateStats {
  lat: number
  lon: number
  ground_height_m: number // LOLA, m relative to R = 1737.4 km
  slope_deg: number // local terrain slope (20 m)
  sun_any: number // share of hours with any part of the solar disc above the terrain (0..1)
  sun_full: number
  sun_mean_fraction: number
  dte: number // share of hours with the Earth centre above the terrain (0..1)
  sun_and_dte: number // share of hours with both at once (0..1)
  longest_dark_h: number
  longest_dte_blackout_h: number
  samples: number
}

export interface AreaSearchStart {
  area: { center: [number, number]; size_km: number; corners_latlon: [number, number][] }
  period_utc: [string, string]
  total: number
}

export interface AreaSearchResult {
  rank_by: string
  best: (AreaCandidateStats & { horizon_deg: number[] }) | null
  top: AreaCandidateStats[]
  model: { mast_m: number; sun_radius_deg: number; azimuth_step_deg: number; ray_max_m: number; time_step_h: number }
  elapsed_s: number
}

export interface AreaSearchHandlers {
  onStart?: (data: AreaSearchStart) => void
  onProgress?: (done: number, total: number) => void
  onResult: (data: AreaSearchResult) => void
  onError: (message: string) => void
}

/** Starts a streamed area search. Returns a function that cancels it. */
export function startAreaSearch(lat: number, lon: number, handlers: AreaSearchHandlers): () => void {
  const params = new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5) })
  const es = new EventSource(`/api/area-search/stream?${params}`)
  let finished = false
  const finish = () => {
    finished = true
    es.close()
  }

  es.addEventListener('start', (e) => handlers.onStart?.(JSON.parse((e as MessageEvent).data)))
  es.addEventListener('candidate', (e) => {
    const d = JSON.parse((e as MessageEvent).data)
    handlers.onProgress?.(d.done, d.total)
  })
  es.addEventListener('result', (e) => {
    finish() // the server closes the stream after the result; do not let EventSource reconnect
    handlers.onResult(JSON.parse((e as MessageEvent).data))
  })
  // 'error' is both the server's own event (MessageEvent with data) and the native connection error.
  es.addEventListener('error', (e) => {
    if (finished) return
    finish()
    const data = (e as MessageEvent).data
    handlers.onError(
      data
        ? JSON.parse(data).detail ?? 'Computation error'
        : 'Computation server unavailable. Start the local backend (port 8000).',
    )
  })

  return () => {
    if (!finished) finish()
  }
}
