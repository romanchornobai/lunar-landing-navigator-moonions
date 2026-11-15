import { useState } from 'react'
import { X } from 'lucide-react'
import { LedButton } from './LedButton'

/**
 * GO TO COORDINATES: planetocentric latitude / longitude (deg, east positive) of any point of the regional 3D terrain
 * (about -84 to -90 deg). The point is evaluated by the backend (GET /api/point) and its 15 x 15 km surroundings can be
 * searched with COMPUTE.
 */
interface CoordinateFormProps {
  onGo: (lat: number, lon: number) => string | null // returns an error message or null
  onClose: () => void
}

export function CoordinateForm({ onGo, onClose }: CoordinateFormProps) {
  const [lat, setLat] = useState('-89.44')
  const [lon, setLon] = useState('-137.19')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const la = Number(lat.replace(',', '.'))
    const lo = Number(lon.replace(',', '.'))
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return setError('Enter numbers, e.g. -89.44 and -137.19')
    if (la > -84 || la < -90) return setError('Latitude must be between -84 and -90 (South Pole terrain)')
    if (lo < -180 || lo > 360) return setError('Longitude must be between -180 and 360')
    setError(onGo(la, lo > 180 ? lo - 360 : lo))
  }

  const field =
    'w-full bg-black/60 border border-white/25 focus:border-white/80 outline-none px-2 py-1.5 text-white text-sm tracking-wider'

  return (
    <form
      onSubmit={submit}
      className="w-64 p-3 bg-black/80 backdrop-blur-md border border-white/25 shadow-[0_6px_25px_rgba(0,0,0,0.9)] font-mono text-[10px] tracking-widest text-neutral-300 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-white font-bold text-[11px] tracking-[0.25em]">GO TO COORDINATES</span>
        <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <label className="block space-y-1">
        <span>LATITUDE (°, −84 TO −90)</span>
        <input className={field} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
      </label>
      <label className="block space-y-1">
        <span>LONGITUDE (°, EAST +)</span>
        <input className={field} value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" />
      </label>
      {error && <p className="text-red-300 normal-case tracking-normal text-[11px] leading-snug">{error}</p>}
      <LedButton className="w-full h-8 text-xs">
        GO
      </LedButton>
    </form>
  )
}
