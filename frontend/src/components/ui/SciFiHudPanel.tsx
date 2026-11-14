import React, { useState, useRef, useLayoutEffect } from 'react';

interface SciFiHudPanelProps {
  badgeTitle?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const SciFiHudPanel: React.FC<SciFiHudPanelProps> = ({
  badgeTitle = 'TELEMETRÍA',
  children,
  className = '',
  style = {},
  onMouseEnter,
  onMouseLeave,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 360, height: 270 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        if (offsetWidth > 0 && offsetHeight > 0) {
          setSize({ width: offsetWidth, height: offsetHeight });
        }
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const w = size.width;
  const h = size.height;
  const c = 18; // Biselado diagonal de las esquinas
  const stroke = 1.6;
  const halfStroke = stroke / 2;

  // Pestaña trapezoidal superior
  const tabW = Math.min(160, Math.max(120, Math.round(w * 0.42)));
  const tabX1 = Math.round((w - tabW) / 2);
  const tabX2 = tabX1 + tabW;
  const tabH = 22;
  const tabSlant = 9;

  // Polígono exterior principal
  const outerPath = `
    M ${c} ${halfStroke}
    L ${w - c} ${halfStroke}
    L ${w - halfStroke} ${c}
    L ${w - halfStroke} ${h - c}
    L ${w - c} ${h - halfStroke}
    L ${c} ${h - halfStroke}
    L ${halfStroke} ${h - c}
    L ${halfStroke} ${c}
    Z
  `.replace(/\s+/g, ' ').trim();

  // Marco interior concéntrico
  const inset = 5;
  const ic = c - 2;
  const innerPath = `
    M ${ic} ${inset}
    L ${w - ic} ${inset}
    L ${w - inset} ${ic}
    L ${w - inset} ${h - ic}
    L ${w - ic} ${h - inset}
    L ${ic} ${h - inset}
    L ${inset} ${h - ic}
    L ${inset} ${ic}
    Z
  `.replace(/\s+/g, ' ').trim();

  // Pestaña trapezoidal superior
  const tabPath = `
    M ${tabX1} ${halfStroke}
    L ${tabX2} ${halfStroke}
    L ${tabX2 - tabSlant} ${tabH}
    L ${tabX1 + tabSlant} ${tabH}
    Z
  `.replace(/\s+/g, ' ').trim();

  // Pestañas laterales
  const leftTabY1 = Math.round(h * 0.3);
  const leftTabY2 = Math.round(h * 0.44);
  const rightTabY1 = Math.round(h * 0.62);
  const rightTabY2 = Math.round(h * 0.76);

  // Corchetes inferiores
  const botTab1_X1 = Math.round(w * 0.22);
  const botTab1_X2 = Math.round(w * 0.42);
  const botTab2_X1 = Math.round(w * 0.58);
  const botTab2_X2 = Math.round(w * 0.78);

  const slotX1 = tabX2 + 8;
  const slotX2 = tabX2 + 18;
  const slot2X1 = tabX2 + 22;
  const slot2X2 = Math.min(w - c - 4, tabX2 + 40);

  return (
    <div
      ref={containerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className={`relative select-none text-white pointer-events-auto backdrop-blur-md ${className}`}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        viewBox={`0 0 ${w} ${h}`}
      >
        <defs>
          <linearGradient id="sciFiHudGlass" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0e131d" stopOpacity="0.68" />
            <stop offset="40%" stopColor="#060910" stopOpacity="0.74" />
            <stop offset="100%" stopColor="#020306" stopOpacity="0.80" />
          </linearGradient>
          <linearGradient id="topGlassReflection" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
          </linearGradient>
          <filter id="whiteGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#ffffff" floodOpacity="0.85" />
            <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#ffffff" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Resplandor exterior neón */}
        <path d={outerPath} fill="none" stroke="#ffffff" strokeWidth={stroke} filter="url(#whiteGlow)" opacity={0.8} />

        {/* Cristal oscuro */}
        <path d={outerPath} fill="url(#sciFiHudGlass)" stroke="#ffffff" strokeWidth={stroke} />
        <path d={outerPath} fill="url(#topGlassReflection)" stroke="none" />

        {/* Doble línea interior */}
        <path d={innerPath} fill="none" stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.3" />

        {/* Acentos de esquinas */}
        <line x1={c} y1={halfStroke} x2={c} y2={halfStroke + 4} stroke="#ffffff" strokeWidth="1" strokeOpacity="0.6" />
        <line x1={w - c} y1={halfStroke} x2={w - c} y2={halfStroke + 4} stroke="#ffffff" strokeWidth="1" strokeOpacity="0.6" />
        <line x1={c} y1={h - halfStroke} x2={c} y2={h - halfStroke - 4} stroke="#ffffff" strokeWidth="1" strokeOpacity="0.6" />
        <line x1={w - c} y1={h - halfStroke} x2={w - c} y2={h - halfStroke - 4} stroke="#ffffff" strokeWidth="1" strokeOpacity="0.6" />

        {/* Pestaña superior con badge */}
        <path d={tabPath} fill="#ffffff" stroke="#ffffff" strokeWidth={stroke} style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.8))' }} />
        <text
          x={(tabX1 + tabX2) / 2}
          y={tabH - 7}
          textAnchor="middle"
          fill="#000000"
          className="font-black text-[10px] tracking-[0.26em] uppercase select-none pointer-events-none"
        >
          {badgeTitle}
        </text>

        {/* Pips de esquina */}
        {slotX2 < w - c && (
          <line x1={slotX1} y1={halfStroke + 1} x2={slotX2} y2={halfStroke + 1} stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        )}
        {slot2X2 < w - c && (
          <line x1={slot2X1} y1={halfStroke + 1} x2={slot2X2} y2={halfStroke + 1} stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.65" />
        )}

        {/* Pestañas laterales */}
        <rect x={-4} y={leftTabY1} width={2.5} height={leftTabY2 - leftTabY1} rx={0.5} fill="#ffffff" stroke="#ffffff" strokeWidth="0.5" style={{ filter: 'drop-shadow(0 0 4px #ffffff)' }} />
        <rect x={w + 1.5} y={rightTabY1} width={2.5} height={rightTabY2 - rightTabY1} rx={0.5} fill="#ffffff" stroke="#ffffff" strokeWidth="0.5" style={{ filter: 'drop-shadow(0 0 4px #ffffff)' }} />

        {/* Corchetes inferiores */}
        <rect x={botTab1_X1} y={h + 1.5} width={botTab1_X2 - botTab1_X1} height={2} rx={0.5} fill="#ffffff" stroke="#ffffff" strokeWidth="0.5" style={{ filter: 'drop-shadow(0 0 4px #ffffff)' }} />
        <rect x={botTab2_X1} y={h + 1.5} width={botTab2_X2 - botTab2_X1} height={2} rx={0.5} fill="#ffffff" stroke="#ffffff" strokeWidth="0.5" style={{ filter: 'drop-shadow(0 0 4px #ffffff)' }} />
      </svg>

      {/* Líneas de barrido holográfico */}
      <div
        className="absolute inset-0 pointer-events-none rounded opacity-40 overflow-hidden"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255, 255, 255, 0.02) 3px, rgba(255, 255, 255, 0.02) 4px)',
        }}
      />

      {/* Contenido interior */}
      <div className="relative z-10 pt-7 pb-4 px-6">{children}</div>
    </div>
  );
};
