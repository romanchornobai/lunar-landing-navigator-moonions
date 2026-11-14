import React, { useEffect } from 'react'
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

/** Full-screen dimmed/blurred overlay with an empty site comparison grid (4 sites x Earth/Sun). */
export const SiteComparisonPanel: React.FC<SiteComparisonPanelProps> = ({ onClose }) => {
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
