import React, { useMemo } from 'react';

interface SceneLoaderProps {
  /** 0-100 */
  progress: number;
  title?: string;
  /** Fades the overlay out (it stays mounted until the fade ends). */
  hidden?: boolean;
}

/**
 * Full-screen white sci-fi loading screen: concentric rotating reactor rings, technical progress bar
 * and "SYSTEM LOADING... [X%]" text over an isometric grid. Plain DOM overlay (rendered outside the Canvas).
 */
export const SceneLoader: React.FC<SceneLoaderProps> = ({ progress, title, hidden = false }) => {
  // 54 radial ticks of the inner dial
  const radialTicks = useMemo(() => {
    const ticks = [];
    const count = 54;
    for (let i = 0; i < count; i++) {
      const angle = ((i * 360) / count) * (Math.PI / 180);
      ticks.push({
        id: i,
        x1: 80 + 39 * Math.cos(angle),
        y1: 80 + 39 * Math.sin(angle),
        x2: 80 + 46 * Math.cos(angle),
        y2: 80 + 46 * Math.sin(angle),
      });
    }
    return ticks;
  }, []);

  const displayProgress = Math.max(3, Math.min(100, progress));

  return (
    <div
      className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center bg-black/30 select-none overflow-hidden transition-opacity duration-500 ease-out"
      style={{
        zIndex: 9999,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        // Blurred, dimmed view behind the loader instead of a solid black background
        backdropFilter: 'blur(14px) brightness(0.6)',
        WebkitBackdropFilter: 'blur(14px) brightness(0.6)',
      }}
    >
      <style>{`
        @keyframes loaderSpinClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loaderSpinCounter {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes loaderPulseCore {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.02); opacity: 1; }
        }
      `}</style>

      {/* Isometric background grid */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="loaderIsoGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 40 M 0 0 L 40 40 M 0 20 L 40 20 M 20 0 L 20 40"
              fill="none"
              stroke="#ffffff"
              strokeWidth="0.5"
              strokeOpacity="0.4"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#loaderIsoGrid)" />
      </svg>

      {/* Dark radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 35%, rgba(2, 4, 7, 0.35) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* 1. Concentric holographic reactor ring */}
        <div
          className="relative w-44 h-44 sm:w-48 sm:h-48 flex items-center justify-center mb-6"
          style={{ filter: 'drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 16px rgba(255,255,255,0.65))' }}
        >
          <svg className="w-full h-full overflow-visible" viewBox="0 0 160 160">
            {/* Ring 1: fragmented outer arcs (clockwise) */}
            <g style={{ transformOrigin: '80px 80px', animation: 'loaderSpinClockwise 9s linear infinite' }}>
              <circle cx="80" cy="80" r="71" fill="none" stroke="#ffffff" strokeWidth="1.5"
                strokeDasharray="90 32 180 45 60 45" strokeLinecap="round" />
              <line x1="80" y1="6" x2="80" y2="11" stroke="#ffffff" strokeWidth="1.5" />
              <line x1="80" y1="149" x2="80" y2="154" stroke="#ffffff" strokeWidth="1.5" />
              <line x1="6" y1="80" x2="11" y2="80" stroke="#ffffff" strokeWidth="1.5" />
              <line x1="149" y1="80" x2="154" y2="80" stroke="#ffffff" strokeWidth="1.5" />
            </g>

            {/* Ring 2: broken middle ring (counter-clockwise) */}
            <g style={{ transformOrigin: '80px 80px', animation: 'loaderSpinCounter 6.5s linear infinite' }}>
              <circle cx="80" cy="80" r="58" fill="none" stroke="#ffffff" strokeWidth="1.2"
                strokeDasharray="140 28 110 38 25 15" strokeLinecap="round" strokeOpacity="0.85" />
            </g>

            {/* Ring 3: dense radial tick dial (slow clockwise) */}
            <g style={{ transformOrigin: '80px 80px', animation: 'loaderSpinClockwise 18s linear infinite' }}>
              {radialTicks.map((tick) => (
                <line key={tick.id} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
                  stroke="#ffffff" strokeWidth="1.3" strokeOpacity="0.9" />
              ))}
            </g>

            {/* Ring 4: dotted inner circle (counter-clockwise) */}
            <g style={{ transformOrigin: '80px 80px', animation: 'loaderSpinCounter 11s linear infinite' }}>
              <circle cx="80" cy="80" r="33" fill="none" stroke="#ffffff" strokeWidth="1.5"
                strokeDasharray="3 5" strokeLinecap="round" strokeOpacity="0.95" />
            </g>

            {/* Ring 5: pulsing core */}
            <circle cx="80" cy="80" r="25" fill="none" stroke="#ffffff" strokeWidth="0.9" strokeOpacity="0.5"
              style={{ transformOrigin: '80px 80px', animation: 'loaderPulseCore 2.5s ease-in-out infinite' }} />
          </svg>
        </div>

        {/* 2. Technical horizontal progress bar */}
        <div className="w-[300px] sm:w-[380px] mb-3">
          <div
            className="w-full h-3.5 sm:h-4 p-[2px] bg-black/80 border border-white/80 rounded-[1px]"
            style={{ boxShadow: '0 0 10px rgba(255,255,255,0.4), inset 0 0 8px rgba(255,255,255,0.15)' }}
          >
            <div
              className="h-full bg-white transition-all duration-150 ease-out relative"
              style={{ width: `${displayProgress}%`, boxShadow: '0 0 10px #ffffff, 0 0 20px rgba(255,255,255,0.85)' }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_#ffffff]" />
            </div>
          </div>
        </div>

        {/* 3. "SYSTEM LOADING..." terminal text */}
        <div className="text-center font-mono tracking-[0.32em] uppercase">
          <h2
            className="text-white text-xs sm:text-sm font-bold tracking-[0.32em] flex items-center justify-center gap-1"
            style={{ textShadow: '0 0 8px rgba(255,255,255,0.9), 0 0 18px rgba(255,255,255,0.5)' }}
          >
            <span>SYSTEM LOADING...</span>
            <span className="text-[11px] opacity-75 font-normal ml-1">[{displayProgress.toFixed(0)}%]</span>
          </h2>

          {title && <p className="text-[10px] text-neutral-400 tracking-[0.2em] mt-1.5 opacity-80">{title}</p>}
        </div>
      </div>
    </div>
  );
};
