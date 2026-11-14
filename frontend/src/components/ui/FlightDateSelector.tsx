import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loadEphemeridesBuffer } from '@/utils/ephemerisClient';

interface FlightDateSelectorProps {
  siteId?: string;
  currentDate: Date;
  onDateChange: (newDate: Date) => void;
  className?: string;
}

type StepMode = '1h' | '4h' | '1d' | '3d';

const STEP_HOURS: Record<StepMode, number> = {
  '1h': 1,
  '4h': 4,
  '1d': 24,
  '3d': 72,
};

const STEP_INTERVAL_MS: Record<StepMode, number> = {
  '1h': 260,
  '4h': 320,
  '1d': 400,
  '3d': 500,
};

const MONTH_NAMES = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'
];

// Range covered by the baked JPL Horizons ephemerides (see utils/ephemerisClient.ts).
const MIN_DATE = new Date('2026-11-14T00:00:00Z');
const MAX_DATE = new Date('2029-11-14T00:00:00Z');

export const FlightDateSelector: React.FC<FlightDateSelectorProps> = ({
  currentDate,
  onDateChange,
  className = '',
}) => {
  const [stepMode, setStepMode] = useState<StepMode>('1h');
  const [playDirection, setPlayDirection] = useState<'idle' | 'forward' | 'backward'>('idle');
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEphemeridesBuffer().catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsSpeedMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const stepTime = useCallback(
    (hoursDelta: number) => {
      const nextMs = currentDate.getTime() + hoursDelta * 3600 * 1000;
      if (nextMs <= MIN_DATE.getTime()) {
        onDateChange(new Date(MIN_DATE.getTime()));
        setPlayDirection('idle');
      } else if (nextMs >= MAX_DATE.getTime()) {
        onDateChange(new Date(MAX_DATE.getTime()));
        setPlayDirection('idle');
      } else {
        onDateChange(new Date(nextMs));
      }
    },
    [currentDate, onDateChange]
  );

  useEffect(() => {
    if (playDirection === 'idle') return;

    const hours = STEP_HOURS[stepMode];
    const intervalMs = STEP_INTERVAL_MS[stepMode];
    const delta = playDirection === 'forward' ? hours : -hours;

    const timer = setInterval(() => {
      stepTime(delta);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playDirection, stepMode, stepTime]);

  const togglePlayForward = () => {
    setPlayDirection((prev) => (prev === 'forward' ? 'idle' : 'forward'));
  };

  const togglePlayBackward = () => {
    setPlayDirection((prev) => (prev === 'backward' ? 'idle' : 'backward'));
  };

  const selectSpeed = (mode: StepMode) => {
    setStepMode(mode);
    setIsSpeedMenuOpen(false);
  };

  // Clean terminal-style date (UTC)
  const day = String(currentDate.getUTCDate()).padStart(2, '0');
  const month = MONTH_NAMES[currentDate.getUTCMonth()];
  const year = currentDate.getUTCFullYear();
  const hours = String(currentDate.getUTCHours()).padStart(2, '0');
  const minutes = String(currentDate.getUTCMinutes()).padStart(2, '0');

  return (
    <div
      className={`relative select-none font-mono text-white pointer-events-auto ${className}`}
    >
      {/* Single clean line: no background, no borders */}
      <div className="flex items-center gap-5 sm:gap-6 px-4 py-2 bg-transparent drop-shadow-[0_3px_12px_rgba(0,0,0,0.98)]">

        {/* Left arrow: play time backward */}
        <button
          onClick={togglePlayBackward}
          title={playDirection === 'backward' ? 'Pausar' : `Retroceder tiempo (${stepMode})`}
          className={`w-9 h-9 flex items-center justify-center text-lg sm:text-xl transition-all cursor-pointer active:scale-90 ${
            playDirection === 'backward'
              ? 'text-white font-bold drop-shadow-[0_0_12px_#ffffff] scale-110'
              : 'text-neutral-400 hover:text-white hover:drop-shadow-[0_0_8px_#ffffff] hover:scale-110'
          }`}
        >
          {playDirection === 'backward' ? (
            <span className="text-sm tracking-tighter">❚❚</span>
          ) : (
            <span>◀</span>
          )}
        </button>

        {/* Large centered date */}
        <div className="flex items-center gap-2.5 text-base sm:text-xl md:text-2xl font-black tracking-[0.16em] text-white whitespace-nowrap">
          <span>
            {day} {month} {year}
          </span>
          <span className="text-white ml-2">
            {hours}:{minutes}
          </span>
          <span className="text-xs sm:text-sm text-neutral-400 font-semibold tracking-wider ml-1">
            UTC
          </span>
        </div>

        {/* Right arrow: play time forward */}
        <button
          onClick={togglePlayForward}
          title={playDirection === 'forward' ? 'Pausar' : `Avanzar tiempo (${stepMode})`}
          className={`w-9 h-9 flex items-center justify-center text-lg sm:text-xl transition-all cursor-pointer active:scale-90 ${
            playDirection === 'forward'
              ? 'text-white font-bold drop-shadow-[0_0_12px_#ffffff] scale-110'
              : 'text-neutral-400 hover:text-white hover:drop-shadow-[0_0_8px_#ffffff] hover:scale-110'
          }`}
        >
          {playDirection === 'forward' ? (
            <span className="text-sm tracking-tighter">❚❚</span>
          ) : (
            <span>▶</span>
          )}
        </button>

        {/* Step selector (1h / 4h / 1d / 3d) */}
        <div
          ref={containerRef}
          className="relative group py-1"
          onMouseEnter={() => setIsSpeedMenuOpen(true)}
          onMouseLeave={() => setIsSpeedMenuOpen(false)}
        >
          <button
            onClick={() => setIsSpeedMenuOpen((prev) => !prev)}
            className="flex items-center gap-1 text-sm sm:text-base tracking-wider text-neutral-300 hover:text-white cursor-pointer transition-colors p-1"
            title="Cambiar intervalo de tiempo"
          >
            <span className="font-black underline underline-offset-4 decoration-white/40 group-hover:decoration-white">
              {stepMode}
            </span>
            <span
              className={`text-xs text-neutral-400 transition-transform duration-150 ${
                isSpeedMenuOpen ? 'rotate-180 text-white' : ''
              }`}
            >
              ▾
            </span>
          </button>

          {/* Dropdown on hover and click */}
          <div
            className={`absolute top-full right-0 pt-2 z-50 ${
              isSpeedMenuOpen ? 'block' : 'hidden group-hover:block'
            }`}
          >
            <div className="bg-black/85 backdrop-blur-md p-1.5 flex flex-col gap-1 min-w-[64px] shadow-[0_6px_25px_rgba(0,0,0,0.9)] border border-white/20">
              {(['1h', '4h', '1d', '3d'] as StepMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => selectSpeed(mode)}
                  className={`w-full py-1.5 px-2.5 text-xs sm:text-sm text-center font-bold tracking-wider transition-colors cursor-pointer ${
                    stepMode === mode
                      ? 'bg-white text-black font-black'
                      : 'text-neutral-300 hover:text-white hover:bg-white/15'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
