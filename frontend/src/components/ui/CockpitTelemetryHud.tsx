import React, { useState, useEffect } from 'react';

// Tipos requeridos para los datos astronómicos y de terreno
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

const fmtAz = (v?: number) => (v === undefined ? '--' : `${v.toFixed(1)}°`);
const fmtEl = (v?: number) => (v === undefined ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(1)}°`);

export const CockpitTelemetryHud: React.FC<CockpitTelemetryHudProps> = ({
  site,
  ephemeris,
}) => {
  // 1. Inclinación física real calculada a partir del vector normal de LOLA
  const [nx, ny, nz] = site.groundNormal || [0, 1, 0];
  const slopeDeg = Math.acos(Math.max(-1, Math.min(1, ny))) * (180 / Math.PI);
  const pitchDeg = Math.asin(Math.max(-1, Math.min(1, -nz))) * (180 / Math.PI);
  const rollDeg = Math.atan2(nx, ny) * (180 / Math.PI);

  // 2. Temperatura superficial calculada según la elevación solar real
  const hasData = ephemeris !== null;
  const sunElev = ephemeris?.sun.elevation ?? 0;
  const isSunDay = ephemeris?.sun.isAbove ?? false;
  const surfaceTempC = isSunDay
    ? Math.round(-35 + sunElev * 18)
    : Math.round(-135 + sunElev * 6);

  // 3. Estado del enlace terrestre DTE
  const isEarthVisible = ephemeris?.earth.isAbove ?? false;

  // Animación progresiva de terminal (Línea por línea con cursor █)
  const [revealedLinesLeft, setRevealedLinesLeft] = useState(0);
  const [revealedLinesRight, setRevealedLinesRight] = useState(0);
  const [cursorBlink, setCursorBlink] = useState(true);

  // Parpadeo del cursor
  useEffect(() => {
    const blinkTimer = setInterval(() => {
      setCursorBlink((prev) => !prev);
    }, 450);
    return () => clearInterval(blinkTimer);
  }, []);

  // Animación de arranque línea a línea al cambiar de sitio
  useEffect(() => {
    setRevealedLinesLeft(0);
    setRevealedLinesRight(0);

    const timerLeft = setInterval(() => {
      setRevealedLinesLeft((prev) => {
        if (prev >= 6) {
          clearInterval(timerLeft);
          return 6;
        }
        return prev + 1;
      });
    }, 140);

    const timerRight = setInterval(() => {
      setRevealedLinesRight((prev) => {
        if (prev >= 6) {
          clearInterval(timerRight);
          return 6;
        }
        return prev + 1;
      });
    }, 160);

    return () => {
      clearInterval(timerLeft);
      clearInterval(timerRight);
    };
  }, [site.id]);

  // Estilo de terminal IBM EGA 8x8 con fósforo verde estilizado y fino
  const egaTerminalStyle: React.CSSProperties = {
    fontFamily: "'IBM EGA 8x8', 'IBM Plus EGA 8x8', 'VT323', monospace",
    fontSize: '15px',
    fontWeight: '300',
    lineHeight: '1.45',
    letterSpacing: '0.07em',
    transform: 'scale(1.0, 0.94)',
    transformOrigin: 'left center',
    textShadow: '0 0 1.5px rgba(56, 239, 125, 0.45)',
    imageRendering: 'pixelated',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  };

  const egaTerminalStyleRight: React.CSSProperties = {
    ...egaTerminalStyle,
    transform: 'scale(1.0, 0.94)',
    transformOrigin: 'right center',
  };

  return (
    <>
      {/* ========================================================= */}
      {/* COLUMNA IZQUIERDA: CELESTE & ENLACE TERRESTRE (TOP-[38%]) */}
      {/* ========================================================= */}
      <div
        style={egaTerminalStyle}
        className="group absolute left-6 top-[38%] -translate-y-1/2 z-40 select-none text-[#38ef7d] pointer-events-auto transition-all duration-300 rounded-lg p-3.5 border border-transparent hover:border-[#38ef7d]/35 hover:bg-black/65 hover:backdrop-blur-md hover:shadow-[0_0_25px_rgba(56,239,125,0.15)] space-y-4"
      >
        <div className="text-[10px] text-[#38ef7d]/40 uppercase tracking-widest border-b border-[#38ef7d]/20 pb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          SYS.TELEMETRY // CH-01 [ASTRONOMY & COMMS]
        </div>

        {/* BLOQUE 1: SOL (Azimut, Elevación y Luz Directa) */}
        {revealedLinesLeft >= 1 && (
          <div className="relative pl-3 border-l-2 border-[#38ef7d]/70 group-hover:border-[#38ef7d]">
            <div className="text-[#a7f3d0] font-normal tracking-wider text-[15px]">
              ┌ // SOL
            </div>
            {revealedLinesLeft >= 2 ? (
              <div className="text-[14px]">
                AZ: <span className="text-white font-normal">{fmtAz(ephemeris?.sun.azimuth)}</span> |
                EL: <span className="text-white font-normal">{fmtEl(ephemeris?.sun.elevation)}</span>
                <div className="text-[13px] mt-0.5">
                  {!hasData ? (
                    <span className="text-neutral-400">[SIN DATOS]</span>
                  ) : isSunDay ? (
                    <span className="text-[#a7f3d0]">[LUZ DIRECTA]</span>
                  ) : (
                    <span className="text-neutral-400">[EN SOMBRA]</span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-white">{cursorBlink ? '█' : ' '}</span>
            )}
            <div className="text-[12px] text-[#38ef7d]/70 leading-none">└</div>
          </div>
        )}

        {/* BLOQUE 2: TIERRA (Azimut, Elevación y Visibilidad) */}
        {revealedLinesLeft >= 3 && (
          <div className="relative pl-3 border-l-2 border-[#38ef7d]/70 group-hover:border-[#38ef7d]">
            <div className="text-[#a7f3d0] font-normal tracking-wider text-[15px]">
              ┌ // TIERRA
            </div>
            {revealedLinesLeft >= 4 ? (
              <div className="text-[14px]">
                AZ: <span className="text-white font-normal">{fmtAz(ephemeris?.earth.azimuth)}</span> |
                EL: <span className="text-white font-normal">{fmtEl(ephemeris?.earth.elevation)}</span>
                <div className="text-[13px] mt-0.5">
                  {!hasData ? (
                    <span className="text-neutral-400">[SIN DATOS]</span>
                  ) : isEarthVisible ? (
                    <span className="text-[#a7f3d0]">[VISIBLE EN HORIZONTE]</span>
                  ) : (
                    <span className="text-red-400">[BAJO HORIZONTE]</span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-white">{cursorBlink ? '█' : ' '}</span>
            )}
            <div className="text-[12px] text-[#38ef7d]/70 leading-none">└</div>
          </div>
        )}

        {/* BLOQUE 3: ENLACE DTE (Conectado / Blackout) */}
        {revealedLinesLeft >= 5 && (
          <div className="relative pl-3 border-l-2 border-[#38ef7d]/70 group-hover:border-[#38ef7d]">
            <div className="text-[#a7f3d0] font-normal tracking-wider text-[15px]">
              ┌ // ENLACE DTE
            </div>
            {revealedLinesLeft >= 6 ? (
              <div className="text-[14px]">
                ESTADO: <span className={`font-normal ${isEarthVisible ? 'text-white' : 'text-neutral-400'}`}>
                  {!hasData ? '--' : isEarthVisible ? 'CONECTADO' : 'BLACKOUT'}
                </span>
                <div className="text-[13px] text-[#a7f3d0]/90 mt-0.5">
                  RED DSN: <span className="text-white font-normal">{!hasData ? '--' : isEarthVisible ? 'ROBLEDO (DSN-63)' : 'SIN SEÑAL (0.0 dB)'}</span>
                </div>
              </div>
            ) : (
              <span className="text-white">{cursorBlink ? '█' : ' '}</span>
            )}
            <div className="text-[12px] text-[#38ef7d]/70 leading-none">└</div>
          </div>
        )}

        {/* CURSOR FINAL DE TERMINAL */}
        {revealedLinesLeft >= 6 && (
          <div className="text-[13px] text-[#38ef7d]/80 pl-3">
            SYS.STATUS // OK {cursorBlink ? '█' : ' '}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* COLUMNA DERECHA: SISTEMAS & ACTITUD DE LA NAVE (TOP-[38%])*/}
      {/* ========================================================= */}
      <div
        style={egaTerminalStyleRight}
        className="group absolute right-6 top-[38%] -translate-y-1/2 z-40 select-none text-[#38ef7d] pointer-events-auto transition-all duration-300 rounded-lg p-3.5 border border-transparent hover:border-[#38ef7d]/35 hover:bg-black/65 hover:backdrop-blur-md hover:shadow-[0_0_25px_rgba(56,239,125,0.15)] space-y-4 text-right"
      >
        <div className="text-[10px] text-[#38ef7d]/40 uppercase tracking-widest border-b border-[#38ef7d]/20 pb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          [LANDER ATTITUDE & PROPULSION] // CH-02
        </div>

        {/* BLOQUE 1: INCLINACIÓN (Pendiente, Pitch y Roll) */}
        {revealedLinesRight >= 1 && (
          <div className="relative pr-3 border-r-2 border-[#38ef7d]/70 group-hover:border-[#38ef7d]">
            <div className="text-[#a7f3d0] font-normal tracking-wider text-[15px]">
              INCLINACIÓN // ┐
            </div>
            {revealedLinesRight >= 2 ? (
              <div className="text-[14px]">
                PENDIENTE: <span className="text-white font-normal">{slopeDeg.toFixed(1)}°</span>
                <div className="text-[13px] mt-0.5">
                  PITCH: <span className="text-white font-normal">{pitchDeg > 0 ? '+' : ''}{pitchDeg.toFixed(1)}°</span> | 
                  ROLL: <span className="text-white font-normal">{rollDeg > 0 ? '+' : ''}{rollDeg.toFixed(1)}°</span>
                </div>
              </div>
            ) : (
              <span className="text-white">{cursorBlink ? '█' : ' '}</span>
            )}
            <div className="text-[12px] text-[#38ef7d]/70 leading-none">┘</div>
          </div>
        )}

        {/* BLOQUE 2: TEMPERATURA (Superficie y Cabina) */}
        {revealedLinesRight >= 3 && (
          <div className="relative pr-3 border-r-2 border-[#38ef7d]/70 group-hover:border-[#38ef7d]">
            <div className="text-[#a7f3d0] font-normal tracking-wider text-[15px]">
              TEMPERATURA // ┐
            </div>
            {revealedLinesRight >= 4 ? (
              <div className="text-[14px]">
                SUPERFICIE: <span className="text-white font-normal">{hasData ? `${surfaceTempC}°C` : '--'}</span>
                <div className="text-[13px] mt-0.5">
                  CABINA: <span className="text-white font-normal">+21.0°C</span>
                </div>
              </div>
            ) : (
              <span className="text-white">{cursorBlink ? '█' : ' '}</span>
            )}
            <div className="text-[12px] text-[#38ef7d]/70 leading-none">┘</div>
          </div>
        )}

        {/* BLOQUE 3: CINEMÁTICA NOMINAL (En reposo en superficie) */}
        {revealedLinesRight >= 5 && (
          <div className="relative pr-3 border-r-2 border-[#38ef7d]/70 group-hover:border-[#38ef7d]">
            <div className="text-[#a7f3d0] font-normal tracking-wider text-[15px]">
              CINEMÁTICA // ┐
            </div>
            {revealedLinesRight >= 6 ? (
              <div className="text-[14px]">
                VELOCIDAD: <span className="text-white font-normal">0.0 m/s</span>
                <div className="text-[13px] text-[#a7f3d0]/90 mt-0.5">
                  PRESIÓN: <span className="text-white font-normal">0.0 kPa</span> | THRUST: <span className="text-white font-normal">0%</span>
                </div>
              </div>
            ) : (
              <span className="text-white">{cursorBlink ? '█' : ' '}</span>
            )}
            <div className="text-[12px] text-[#38ef7d]/70 leading-none">┘</div>
          </div>
        )}

        {/* CURSOR FINAL DE TERMINAL */}
        {revealedLinesRight >= 6 && (
          <div className="text-[13px] text-[#38ef7d]/80 pr-3">
            {cursorBlink ? '█' : ' '} BUS.NOMINAL //
          </div>
        )}
      </div>
    </>
  );
};
