interface AreaComputeLoaderProps {
  done: number
  /** 0 while the backend is still choosing the candidates. */
  total: number
}

/** Top-centre progress bar of the area search (same visual language as SceneLoader). */
export function AreaComputeLoader({ done, total }: AreaComputeLoaderProps) {
  const ratio = total > 0 ? done / total : 0
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 w-[320px] sm:w-[420px] font-mono select-none pointer-events-none">
      <style>{`
        @keyframes areaLoaderSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      `}</style>
      <div
        className="text-center text-white text-[11px] sm:text-xs font-bold tracking-[0.3em] mb-2"
        style={{ textShadow: '0 0 8px rgba(255,255,255,0.9), 0 0 18px rgba(255,255,255,0.5)' }}
      >
        CALCULANDO MEJOR PUNTO
      </div>
      <div
        className="w-full h-3.5 p-[2px] bg-black/80 border border-white/80 rounded-[1px]"
        style={{ boxShadow: '0 0 10px rgba(255,255,255,0.4), inset 0 0 8px rgba(255,255,255,0.15)' }}
      >
        <div className="w-full h-full overflow-hidden relative">
          {total > 0 ? (
            <div
              className="h-full bg-white relative transition-[width] duration-200 ease-out"
              style={{ width: `${ratio * 100}%`, boxShadow: '0 0 10px #ffffff' }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_#ffffff]" />
            </div>
          ) : (
            <div className="h-full w-2/5 bg-white/80" style={{ animation: 'areaLoaderSweep 1.1s linear infinite' }} />
          )}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tracking-[0.2em] text-neutral-300">
        <span>{total > 0 ? `${done} / ${total} CANDIDATOS` : 'BUSCANDO CANDIDATOS…'}</span>
        <span>{total > 0 ? `${Math.round(ratio * 100)} %` : ''}</span>
      </div>
      <div className="mt-0.5 text-center text-[9px] tracking-[0.18em] text-neutral-500">
        HORIZONTE LOLA 100 KM · SOL Y TIERRA JPL HORIZONS 2026–2029
      </div>
    </div>
  )
}
