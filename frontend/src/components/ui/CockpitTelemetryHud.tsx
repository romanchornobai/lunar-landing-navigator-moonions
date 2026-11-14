import React from 'react';
import { Thermometer } from 'lucide-react';
import { CelestialReadout, SpinningModelCanvas } from './CelestialReadout';

// Types for the astronomical data and site info
export interface EphemerisSnapshot {
  sun: {
    azimuth: number;
    elevation: number;
    isAbove: boolean;
  };
  earth: {
    azimuth: number;
    elevation: number;
    isAbove: boolean;
  };
}

export interface LandingSiteData {
  id: string;
  name: string;
  shortName: string;
  groundNormal?: [number, number, number];
}

interface CockpitTelemetryHudProps {
  site: LandingSiteData;
  /** null while the ephemeris buffer is loading or the date is out of range: values show as "--". */
  ephemeris: EphemerisSnapshot | null;
}

const LANDER_URL = '/models/lander/lander.glb';

// IBM EGA 8x8 terminal font, shared by both panels
const egaTerminalStyle: React.CSSProperties = {
  fontFamily: "'IBM EGA 8x8', 'IBM Plus EGA 8x8', 'VT323', monospace",
  fontSize: '15px',
  fontWeight: '300',
  lineHeight: '1.45',
  letterSpacing: '0.07em',
  imageRendering: 'pixelated',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
};

export const CockpitTelemetryHud: React.FC<CockpitTelemetryHudProps> = ({
  site,
  ephemeris,
}) => {
  // Slope from the LOLA ground normal (angle between the normal and local vertical)
  const [, ny] = site.groundNormal || [0, 1, 0];
  const slopeDeg = Math.acos(Math.max(-1, Math.min(1, ny))) * (180 / Math.PI);

  // SIMULATED surface temperature from the Sun elevation (not a thermal model)
  const hasData = ephemeris !== null;
  const sunElev = ephemeris?.sun.elevation ?? 0;
  const surfaceTempC = ephemeris?.sun.isAbove
    ? Math.round(-35 + sunElev * 18)
    : Math.round(-135 + sunElev * 6);

  return (
    <>
      {/* LEFT: Sun and Earth readouts */}
      <div
        style={egaTerminalStyle}
        className="absolute left-6 bottom-6 z-40 select-none text-white pointer-events-none space-y-4"
      >
        <CelestialReadout
          body="sun"
          azimuth={ephemeris?.sun.azimuth}
          elevation={ephemeris?.sun.elevation}
          isAbove={ephemeris?.sun.isAbove}
        />
        <CelestialReadout
          body="earth"
          azimuth={ephemeris?.earth.azimuth}
          elevation={ephemeris?.earth.elevation}
          isAbove={ephemeris?.earth.isAbove}
        />
      </div>

      {/* RIGHT: spinning lander and its (simulated) data */}
      <div
        style={egaTerminalStyle}
        className="absolute right-6 bottom-6 z-40 select-none text-white pointer-events-none flex flex-col items-center gap-2"
      >
        <div className="w-40 h-40">
          <SpinningModelCanvas url={LANDER_URL} />
        </div>
        <div className="text-[15px] leading-tight space-y-1">
          <div>PENDIENTE: {slopeDeg.toFixed(1)}°</div>
          <div className="flex items-center gap-1.5">
            <Thermometer size={16} strokeWidth={2.2} />
            <span>SUPERFICIE: {hasData ? `${surfaceTempC}°C` : '--'}</span>
          </div>
          <div className="pl-[22px]">CABINA: +21.0°C</div>
        </div>
      </div>
    </>
  );
};
