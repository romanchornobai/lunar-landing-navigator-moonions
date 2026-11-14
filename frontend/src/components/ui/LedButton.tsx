import React, { useState, useRef, useLayoutEffect } from 'react'

interface LedButtonProps {
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void
  children?: React.ReactNode
  className?: string
  cutSize?: number
  active?: boolean
  variant?: 'default' | 'compact'
}

export const LedButton: React.FC<LedButtonProps> = ({
  onClick,
  children = 'POLO SUR',
  className = '',
  cutSize,
  active = false,
  variant = 'default',
}) => {
  const isCompact = variant === 'compact'
  const resolvedCut = cutSize ?? (isCompact ? 9 : 12)
  const containerRef = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState({
    width: isCompact ? 130 : 220,
    height: isCompact ? 38 : 46,
  })

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current
        if (offsetWidth > 0 && offsetHeight > 0) {
          setSize({ width: offsetWidth, height: offsetHeight })
        }
      }
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isCompact])

  const w = size.width
  const h = size.height
  const c = Math.min(resolvedCut, Math.min(w, h) / 3)
  const stroke = 1.5
  const halfStroke = stroke / 2

  // Path with cut corners at top-left and bottom-right (military / sci-fi style)
  const pathD = `
    M ${c} ${halfStroke}
    L ${w - halfStroke} ${halfStroke}
    L ${w - halfStroke} ${h - c}
    L ${w - c} ${h - halfStroke}
    L ${halfStroke} ${h - halfStroke}
    L ${halfStroke} ${c}
    Z
  `
    .replace(/\s+/g, ' ')
    .trim()

  // CSS clip-path polygon so click/hover respect the bevel
  const clipPolygon = `polygon(${c}px 0%, 100% 0%, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0% 100%, 0% ${c}px)`

  const baseClasses = isCompact
    ? 'min-w-[110px] h-[38px] pl-7 pr-5 text-xs'
    : 'min-w-[210px] sm:min-w-[240px] h-[46px] pl-9 pr-7 text-xs sm:text-sm'

  return (
    <button
      ref={containerRef}
      onClick={onClick}
      style={{ clipPath: clipPolygon }}
      className={`group relative flex items-center justify-center cursor-pointer select-none transition-transform duration-150 active:scale-[0.98] focus:outline-none backdrop-blur-sm bg-black/60 ${baseClasses} ${className}`}
    >
      {/* SVG layer: beveled background + pure white LED border + glow */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-300 overflow-visible"
        viewBox={`0 0 ${w} ${h}`}
      >
        <defs>
          <linearGradient id="ledNormalBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#080a10" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#020305" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {/* Outer glow halo (bright on hover or active) */}
        <path
          d={pathD}
          fill="none"
          stroke="#ffffff"
          strokeWidth={stroke}
          className={`${
            active ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
          } transition-opacity duration-300`}
          style={{
            filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.85)) drop-shadow(0 0 22px rgba(255,255,255,0.65))',
          }}
        />

        {/* Base polygon: translucent space-glass */}
        <path
          d={pathD}
          className="transition-all duration-300"
          fill="url(#ledNormalBg)"
          stroke="#ffffff"
          strokeWidth={stroke}
        />

        {/* Solid white fill on hover or when active */}
        <path
          d={pathD}
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth={stroke}
          className={`${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity duration-300 ease-out`}
        />
      </svg>

      {/* Left vertical indicator bar */}
      <span
        className={`absolute ${
          isCompact ? 'left-3 w-[3px] h-[11px]' : 'left-4 sm:left-5 w-[3.5px] h-[13px]'
        } top-1/2 -translate-y-1/2 rounded-[0.5px] transition-all duration-300 z-20 ${
          active
            ? 'bg-black shadow-none'
            : 'bg-white group-hover:bg-black shadow-[0_0_8px_#ffffff] group-hover:shadow-none'
        }`}
      />

      {/* Centered text (white with glow -> pure black on hover or active) */}
      <span
        className={`relative z-20 font-bold tracking-[0.24em] uppercase transition-colors duration-300 ${
          active
            ? 'text-black drop-shadow-none'
            : 'text-white group-hover:text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.7)] group-hover:drop-shadow-none'
        }`}
      >
        {children}
      </span>
    </button>
  )
}
