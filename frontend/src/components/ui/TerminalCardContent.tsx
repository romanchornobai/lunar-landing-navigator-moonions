import React, { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { LedButton } from './LedButton';

interface TerminalCardContentProps {
  site: {
    id: string;
    name: string;
    shortName: string;
    description?: string;
    /** Publications the point comes from (each one gets a link icon). */
    sources?: { label: string; url: string }[];
    coordinates: {
      latitude: number;
      longitude: number;
      elevation_m?: number;
    };
  };
  onAction?: () => void;
  actionLabel?: string;
  delayStartMs?: number;
}

function formatCoords(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;
  return `${latStr} · ${lonStr}`;
}

export const TerminalCardContent: React.FC<TerminalCardContentProps> = ({
  site,
  onAction,
  actionLabel = 'LAND',
  delayStartMs = 240,
}) => {
  const [typedTitle, setTypedTitle] = useState('');
  const [typedCoords, setTypedCoords] = useState('');
  const [typedElev, setTypedElev] = useState('');
  const [typedDesc, setTypedDesc] = useState('');
  const [isDone, setIsDone] = useState(false);

  const fullTitle = site.name.toUpperCase();
  const fullCoords = formatCoords(site.coordinates.latitude, site.coordinates.longitude);
  const elev = site.coordinates.elevation_m;
  const fullElev = elev !== undefined ? `${elev >= 0 ? '+' : ''}${elev.toLocaleString()} m` : 'N/A';
  const fullDesc = site.description || '';

  useEffect(() => {
    let isCancelled = false;

    async function streamTelemetry() {
      // 1. Wait for the holographic frame to finish projecting
      await new Promise((r) => setTimeout(r, delayStartMs));
      if (isCancelled) return;

      // 2. Site name
      for (let i = 1; i <= fullTitle.length; i++) {
        if (isCancelled) return;
        setTypedTitle(fullTitle.slice(0, i));
        await new Promise((r) => setTimeout(r, 8));
      }

      // 3. Coordinates
      for (let i = 1; i <= fullCoords.length; i++) {
        if (isCancelled) return;
        setTypedCoords(fullCoords.slice(0, i));
        await new Promise((r) => setTimeout(r, 6));
      }

      // 4. Elevation
      for (let i = 1; i <= fullElev.length; i++) {
        if (isCancelled) return;
        setTypedElev(fullElev.slice(0, i));
        await new Promise((r) => setTimeout(r, 6));
      }

      // 5. Description
      if (fullDesc) {
        const step = Math.max(1, Math.floor(fullDesc.length / 16));
        for (let i = 1; i <= fullDesc.length; i += step) {
          if (isCancelled) return;
          setTypedDesc(fullDesc.slice(0, i));
          await new Promise((r) => setTimeout(r, 10));
        }
        setTypedDesc(fullDesc);
      }

      if (!isCancelled) setIsDone(true);
    }

    streamTelemetry();

    return () => {
      isCancelled = true;
    };
  }, [fullTitle, fullCoords, fullElev, fullDesc, delayStartMs]);

  return (
    <div className="font-mono text-xs select-none tracking-wide text-neutral-100">
      {/* Title */}
      <div className="mb-2.5">
        <h3 className="text-sm sm:text-[15px] font-bold text-white tracking-wider flex items-center min-h-[22px]">
          <span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">
            {typedTitle}
          </span>
          {!isDone && (
            <span className="inline-block w-2 h-4 bg-white ml-1.5 shadow-[0_0_8px_#ffffff] animate-pulse" />
          )}
        </h3>
      </div>

      {/* Coordinates and elevation grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-2.5 p-2.5 rounded bg-white/[0.04] border border-white/15 backdrop-blur-sm">
        <div>
          <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
            COORDINATES
          </span>
          <span className="text-white font-semibold text-xs tracking-tight">
            {typedCoords || '—'}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
            ALTITUDE
          </span>
          <span className="text-white font-bold text-xs tracking-tight">
            {typedElev || '—'}
          </span>
        </div>
      </div>

      {/* Technical description */}
      {typedDesc && (
        <div className="mb-3 text-[11px] leading-relaxed text-neutral-300">
          <p>{typedDesc}</p>
        </div>
      )}

      {/* Source: name of each publication, linked to its official page */}
      {isDone && site.sources && site.sources.length > 0 && (
        <div className="mb-3 p-2.5 rounded bg-white/[0.04] border border-white/15">
          <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">SOURCE</span>
          <ul className="space-y-1">
            {site.sources.map((src) => (
              <li key={src.url} className="flex items-center justify-between gap-2">
                <span className="text-[11px] leading-snug text-white">{src.label}</span>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open publication: ${src.label}`}
                  aria-label={`Open publication: ${src.label}`}
                  className="shrink-0 text-white/75 hover:text-white hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] transition-all"
                >
                  <ExternalLink size={14} strokeWidth={1.8} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action button (only if the point has 15 km 3D terrain) */}
      {onAction && (
        <div className={`mt-2 transition-all duration-300 ${isDone ? 'opacity-100 translate-y-0' : 'opacity-80 translate-y-0.5'}`}>
          <LedButton className="w-full h-9 text-xs" onClick={onAction}>
            {actionLabel}
          </LedButton>
        </div>
      )}
    </div>
  );
};
