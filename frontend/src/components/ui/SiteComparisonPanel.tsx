import React, { useEffect, useState } from 'react'
import { SciFiHudPanel } from './SciFiHudPanel'
import { CELESTIAL_MODELS, SpinningModelCanvas } from './CelestialReadout'

// Columns follow the candidate site order of data/landing_sites.json.
const COLUMNS = [
  { id: 'shackleton-connecting-ridge', label: 'SHACKLETON' },
  { id: 'malapert-massif', label: 'MALAPERT' },
  { id: 'nobile-rim-1', label: 'NOBILE' },
  { id: 'de-gerlache-rim', label: 'DE GERLACHE' },
]

// Rows: Earth and Sun. The comparison data (access time per site) is not filled in yet.
const ROWS = [
  { key: 'earth', url: CELESTIAL_MODELS.earth, earthLight: true },
  { key: 'sun', url: CELESTIAL_MODELS.sun, earthLight: false },
]

interface SiteComparisonPanelProps {
  onClose: () => void
}

// Range covered by the baked JPL Horizons ephemerides (see utils/ephemerisClient.ts), as YYYY-MM-DD (UTC).
const MIN_DAY = '2026-11-14'
const MAX_DAY = '2029-11-14'

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min: string
  max: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="text-[11px] tracking-[0.26em] text-neutral-400">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="bg-black/40 border border-white/30 hover:border-white/70 focus:border-white focus:outline-none focus:shadow-[0_0_14px_rgba(255,255,255,0.3)] text-white text-[13px] tracking-[0.12em] font-bold px-3 h-[34px] rounded-sm transition-all cursor-pointer"
        style={{ colorScheme: 'dark', fontFamily: 'inherit' }}
      />
    </label>
  )
}

/** Full-screen dimmed/blurred overlay with an empty site comparison grid (4 sites x Earth/Sun). */
export const SiteComparisonPanel: React.FC<SiteComparisonPanelProps> = ({ onClose }) => {
  const [startDay, setStartDay] = useState(MIN_DAY)
  const [endDay, setEndDay] = useState(MAX_DAY)

  // Keep start <= end: moving one bound past the other drags the other along.
  const changeStart = (v: string) => {
    setStartDay(v)
    if (v > endDay) setEndDay(v)
  }
  const changeEnd = (v: string) => {
    setEndDay(v)
    if (v < startDay) setStartDay(v)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-md"
      style={{ backdropFilter: 'blur(10px) brightness(0.55)', WebkitBackdropFilter: 'blur(10px) brightness(0.55)' }}
      onClick={onClose}
    >
      {/* Date range + start button, top center of the page (the button does nothing yet) */}
      <div
        className="absolute top-6 left-1/2 -translate-x-1/2 w-max max-w-[calc(100vw-260px)] flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <DateField label="INICIO" value={startDay} min={MIN_DAY} max={MAX_DAY} onChange={changeStart} />
        <span className="text-neutral-500 text-lg select-none">→</span>
        <DateField label="FIN" value={endDay} min={MIN_DAY} max={MAX_DAY} onChange={changeEnd} />
        <button
          type="button"
          className="h-[34px] px-6 bg-white text-black text-[12px] font-black tracking-[0.3em] uppercase cursor-pointer transition-all hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] active:scale-95"
          style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
        >
          EMPEZAR
        </button>
      </div>

      <div className="w-[min(1000px,92vw)]" onClick={(e) => e.stopPropagation()}>
        <SciFiHudPanel badgeTitle="COMPARATIVA">
          <div
            className="grid font-mono text-white select-none"
            style={{ gridTemplateColumns: '88px repeat(4, minmax(0, 1fr))' }}
          >
            {/* Header row: empty corner + site names */}
            <div />
            {COLUMNS.map((c) => (
              <div
                key={c.id}
                className="py-3 text-center text-[12px] sm:text-[13px] font-bold tracking-[0.22em] border-b border-white/25"
              >
                {c.label}
              </div>
            ))}

            {/* Earth / Sun rows */}
            {ROWS.map((row) => (
              <React.Fragment key={row.key}>
                <div className="h-36 flex items-center justify-center">
                  <div className="w-16 h-16">
                    <SpinningModelCanvas url={row.url} earthLight={row.earthLight} />
                  </div>
                </div>
                {COLUMNS.map((c) => (
                  <div key={`${row.key}-${c.id}`} className="h-36 border-l border-b border-white/10" />
                ))}
              </React.Fragment>
            ))}
          </div>
        </SciFiHudPanel>
      </div>
    </div>
  )
}
