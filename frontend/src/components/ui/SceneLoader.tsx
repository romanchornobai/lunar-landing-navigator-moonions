import React, { useMemo } from 'react';

interface SceneLoaderProps {
  /** Minimum time (ms) the bar takes to fill up to 99%. */
  durationMs: number;
  /** Loading finished: the bar completes to 100%. */
  done?: boolean;
  title?: string;
  /** Fades the overlay out (it stays mounted until the fade ends). */
  hidden?: boolean;
}

/** One digit column: a vertical strip 0-9 inside a 1-digit window, slid by a CSS (compositor) animation. */
const DigitStrip: React.FC<{ animation: string }> = ({ animation }) => (
  <span className="inline-block overflow-hidden align-middle" style={{ height: '1em', lineHeight: '1em', width: '1ch' }}>
    <span className="flex flex-col" style={{ animation, willChange: 'transform' }}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <span key={d} style={{ height: '1em', lineHeight: '1em' }}>
          {d}
        </span>
      ))}
    </span>
  </span>
);

/**
 * Full-screen white sci-fi loading screen: concentric rotating reactor rings, technical progress bar
 * and "SYSTEM LOADING... [X%]" text over an isometric grid. Plain DOM overlay (rendered outside the Canvas).
 *
 * Smoothness: every moving part (rings, bar) is a CSS transform/transition on an HTML element, which the
 * browser runs on the compositor thread, so it keeps moving even while the main thread is busy decoding the
 * next scene's assets. Only the percentage text is driven by JS.
 */
export const SceneLoader: React.FC<SceneLoaderProps> = ({ durationMs, done = false, title, hidden = false }) => {
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

  // All of the following are CSS animations that start when the loader mounts, so they stay in sync:
  //  - bar: translateX -100% -> -1% over durationMs (linear)
  //  - percentage digits: sliding digit strips (tens steps every durationMs*10/99, ones every durationMs/99)
  // `done` swaps them for the finished state (bar to 100% in 250 ms, text "100%").
  const ones = durationMs / 99; // ms per 1%
  const barAnimation = done
    ? 'loaderBarFinish 250ms ease-out forwards'
    : `loaderBarFill ${durationMs}ms linear forwards`;

  const ring: React.CSSProperties = { willChange: 'transform' };

  return (
    <div
      className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center bg-black/30 select-none overflow-hidden transition-opacity duration-500 ease-out"
      style={{
        zIndex: 9999,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        // Blurred, dimmed view behind the loader instead of a solid black background
        backdropFilter: 'blur(12px) brightness(0.6)',
        WebkitBackdropFilter: 'blur(12px) brightness(0.6)',
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
        @keyframes loaderBarFill {
          from { transform: translateX(-100%); }
          to { transform: translateX(-1%); }
        }
        @keyframes loaderBarFinish {
          from { transform: translateX(-1%); }
          to { transform: translateX(0%); }
        }
        @keyframes loaderDigitsTens {
          from { transform: translateY(0); }
          to { transform: translateY(-90%); }
        }
        @keyframes loaderDigitsOnes {
          from { transform: translateY(0); }
          to { transform: translateY(-100%); }
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
        {/* 1. Concentric holographic reactor ring: one HTML layer per ring so each rotates on the compositor */}
        <div
          className="relative w-44 h-44 sm:w-48 sm:h-48 mb-6"
          style={{ filter: 'drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 16px rgba(255,255,255,0.65))' }}
        >
          {/* Ring 1: fragmented outer arcs (clockwise) */}
          <div className="absolute inset-0" style={{ ...ring, animation: 'loaderSpinClockwise 9s linear infinite' }}>
            <svg className="w-full h-full overflow-visible" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="71" fill="none" stroke="#ffffff" strokeWidth="1.5"
                strokeDasharray="90 32 180 45 60 45" strokeLinecap="round" />
              <line x1="80" y1="6" x2="80" y2="11" stroke="#ffffff" strokeWidth="1.5" />
              <line x1="80" y1="149" x2="80" y2="154" stroke="#ffffff" strokeWidth="1.5" />
              <line x1="6" y1="80" x2="11" y2="80" stroke="#ffffff" strokeWidth="1.5" />
              <line x1="149" y1="80" x2="154" y2="80" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Ring 2: broken middle ring (counter-clockwise) */}
          <div className="absolute inset-0" style={{ ...ring, animation: 'loaderSpinCounter 6.5s linear infinite' }}>
            <svg className="w-full h-full overflow-visible" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="58" fill="none" stroke="#ffffff" strokeWidth="1.2"
                strokeDasharray="140 28 110 38 25 15" strokeLinecap="round" strokeOpacity="0.85" />
            </svg>
          </div>

          {/* Ring 3: dense radial tick dial (slow clockwise) */}
          <div className="absolute inset-0" style={{ ...ring, animation: 'loaderSpinClockwise 18s linear infinite' }}>
            <svg className="w-full h-full overflow-visible" viewBox="0 0 160 160">
              {radialTicks.map((tick) => (
                <line key={tick.id} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
                  stroke="#ffffff" strokeWidth="1.3" strokeOpacity="0.9" />
              ))}
            </svg>
          </div>

          {/* Ring 4: dotted inner circle (counter-clockwise) */}
          <div className="absolute inset-0" style={{ ...ring, animation: 'loaderSpinCounter 11s linear infinite' }}>
            <svg className="w-full h-full overflow-visible" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="33" fill="none" stroke="#ffffff" strokeWidth="1.5"
                strokeDasharray="3 5" strokeLinecap="round" strokeOpacity="0.95" />
            </svg>
          </div>

          {/* Ring 5: pulsing core */}
          <div className="absolute inset-0" style={{ ...ring, animation: 'loaderPulseCore 2.5s ease-in-out infinite' }}>
            <svg className="w-full h-full overflow-visible" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="25" fill="none" stroke="#ffffff" strokeWidth="0.9" strokeOpacity="0.5" />
            </svg>
          </div>
        </div>

        {/* 2. Technical horizontal progress bar (fill = translateX of a full-width bar, clipped by the frame) */}
        <div className="w-[300px] sm:w-[380px] mb-3">
          <div
            className="w-full h-3.5 sm:h-4 p-[2px] bg-black/80 border border-white/80 rounded-[1px]"
            style={{ boxShadow: '0 0 10px rgba(255,255,255,0.4), inset 0 0 8px rgba(255,255,255,0.15)' }}
          >
            <div className="w-full h-full overflow-hidden">
              <div
                className="w-full h-full bg-white relative"
                style={{
                  transform: 'translateX(-100%)',
                  animation: barAnimation,
                  willChange: 'transform',
                  boxShadow: '0 0 10px #ffffff, 0 0 20px rgba(255,255,255,0.85)',
                }}
              >
                <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_#ffffff]" />
              </div>
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
            <span className="text-[11px] opacity-75 font-normal ml-1 inline-flex items-center">
              [
              {done ? (
                <span>100</span>
              ) : (
                <>
                  <DigitStrip animation={`loaderDigitsTens ${ones * 9 * 10}ms steps(9, end) forwards`} />
                  <DigitStrip animation={`loaderDigitsOnes ${ones * 10}ms steps(10, end) infinite`} />
                </>
              )}
              %]
            </span>
          </h2>

          {title && <p className="text-[10px] text-neutral-400 tracking-[0.2em] mt-1.5 opacity-80">{title}</p>}
        </div>
      </div>
    </div>
  );
};
