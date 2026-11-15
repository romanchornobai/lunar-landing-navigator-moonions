import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { SciFiHudPanel } from './SciFiHudPanel';
import { TerminalCardContent } from './TerminalCardContent';

interface LanderMarkerWithHudProps {
  site: {
    id: string;
    name: string;
    shortName: string;
    /** 'science': permanently shadowed region (drawn as a beacon, not a lander). */
    kind?: 'landing' | 'science';
    description?: string;
    sources?: { label: string; url: string }[];
    coordinates: {
      latitude: number;
      longitude: number;
      elevation_m?: number;
    };
    groundPos: THREE.Vector3;
    direction?: 'left' | 'right'; // Hacia qué lado se despliega el panel
  };
  /** Undefined hides the ALUNIZAR button (no first-person terrain for this point yet). */
  onLandOnSite?: (siteId: string) => void;
  lineHeight?: number;
  /** False keeps the marker hidden; switching to true plays a short pop-in (line grows, lander scales up). */
  revealed?: boolean;
}

const POP_S = 0.7;
/** Ease-out with a small overshoot, so the marker "pops" into place. */
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export const LanderMarkerWithHud: React.FC<LanderMarkerWithHudProps> = ({
  site,
  onLandOnSite,
  lineHeight = 4.0,
  revealed = true,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const popT = useRef(revealed ? 1 : 0); // 0..1 progress of the pop-in
  const [isHovered, setIsHovered] = useState(false);
  const landerHoverRef = useRef(false);
  const cardHoverRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landerMeshRef = useRef<THREE.Group>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { camera, size } = useThree();
  // Side the card opens to: towards the screen centre, so the card (and its source links) stays on screen.
  const [screenSide, setScreenSide] = useState<'left' | 'right' | null>(null);

  const { scene } = useGLTF('/models/lander/lander.glb');

  // Nivelar patas exactamente en el suelo Y = 0
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.position.set(0.0, 67.037, -67.037);
    return clone;
  }, [scene]);

  // Línea minimalista vertical desde el suelo hasta el módulo
  const lineObject = useMemo(() => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, lineHeight, 0)];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    return new THREE.Line(geom, mat);
  }, [lineHeight]);

  // Rotación suave del lander cuando está en hover
  useFrame((_, delta) => {
    // Pop-in: vertical stretch first (line grows from the ground), width follows with a little overshoot
    const root = rootRef.current;
    if (root) {
      if (revealed && popT.current < 1) popT.current = Math.min(1, popT.current + delta / POP_S);
      const t = popT.current;
      root.visible = revealed && t > 0;
      const y = easeOutBack(Math.min(1, t * 1.4));
      const xz = easeOutBack(Math.max(0, (t - 0.15) / 0.85));
      root.scale.set(Math.max(1e-3, xz), Math.max(1e-3, y), Math.max(1e-3, xz));
    }
    if (landerMeshRef.current && isHovered) {
      landerMeshRef.current.rotation.y += delta * 1.5;
    }
    // Keep the card fully inside the viewport: shift it vertically when it would overflow.
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (isHovered && anchor && panel) {
      const margin = 8;
      const baseTop = -22; // px relative to the anchor (matches the `top` style below)
      const h = panel.offsetHeight;
      const anchorY = anchor.getBoundingClientRect().top;
      const top = anchorY + baseTop - h / 2; // panel is centred on baseTop (translateY(-50%))
      let dy = 0;
      if (top < margin) dy = margin - top;
      else if (top + h > window.innerHeight - margin) dy = window.innerHeight - margin - (top + h);
      panel.style.top = `${baseTop + dy}px`;
    }
  });

  const updateHover = () => {
    const shouldHover = landerHoverRef.current || cardHoverRef.current;
    setIsHovered(shouldHover);
    document.body.style.cursor = shouldHover ? 'pointer' : 'auto';
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleLanderEnter = (e: any) => {
    e.stopPropagation();
    const p = site.groundPos.clone().project(camera);
    setScreenSide(((p.x + 1) / 2) * size.width > size.width / 2 ? 'left' : 'right');
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    landerHoverRef.current = true;
    updateHover();
  };

  const handleLanderLeave = (e: any) => {
    e.stopPropagation();
    landerHoverRef.current = false;
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => updateHover(), 90);
  };

  const handleCardEnter = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    cardHoverRef.current = true;
    updateHover();
  };

  const handleCardLeave = () => {
    cardHoverRef.current = false;
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => updateHover(), 90);
  };

  const { groundPos } = site;
  const direction = screenSide ?? site.direction ?? (groundPos.x > 25 ? 'left' : 'right');

  return (
    <group ref={rootRef} position={[groundPos.x, groundPos.y, groundPos.z]} visible={revealed}>
      {/* 0. Punto de anclaje en el suelo y línea blanca minimalista */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.42, 32]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
      <primitive object={lineObject} />

      {/* 1. Módulo Lunar con su Hitbox */}
      <group position={[0, lineHeight, 0]}>
        <group
          scale={0.018}
          onPointerEnter={handleLanderEnter}
          onPointerLeave={handleLanderLeave}
        >
          <group ref={landerMeshRef}>
            {site.kind === 'science' ? (
              // Permanently shadowed region: ice-blue beacon instead of a lander (not a landing site)
              <mesh position={[0, 67, 0]}>
                <octahedronGeometry args={[55, 0]} />
                <meshBasicMaterial color="#38bdf8" wireframe toneMapped={false} />
              </mesh>
            ) : (
              <primitive object={clonedScene} />
            )}
          </group>
          {/* Hitbox transparente para facilitar pasar el ratón */}
          <mesh position={[0, 67, 0]}>
            <cylinderGeometry args={[110, 110, 150, 16]} />
            <meshBasicMaterial transparent opacity={0.0} depthWrite={false} />
          </mesh>
        </group>

        {/* 2. Tarjeta Holográfica proyectada al hacer Hover */}
        {isHovered && (
          <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
            <div
              ref={anchorRef}
              onMouseEnter={handleCardEnter}
              onMouseLeave={handleCardLeave}
              style={{
                position: 'relative',
                width: '1px',
                height: '1px',
                pointerEvents: 'auto',
              }}
            >
              {/* TODAS LAS ANIMACIONES KEYFRAMES DE APERTURA HOLOGRÁFICA */}
              <style>{`
                @keyframes hudLineDrawRight {
                  0% { stroke-dashoffset: 140; opacity: 0; }
                  100% { stroke-dashoffset: 0; opacity: 1; }
                }
                @keyframes hudLineDrawLeft {
                  0% { stroke-dashoffset: 140; opacity: 0; }
                  100% { stroke-dashoffset: 0; opacity: 1; }
                }
                @keyframes emitterPing {
                  0% { r: 2; opacity: 1; stroke-width: 2; }
                  100% { r: 12; opacity: 0; stroke-width: 0.5; }
                }
                @keyframes hudHoloProjectRight {
                  0% {
                    opacity: 0;
                    transform: translateY(-50%) scale(0.04, 0.02);
                    filter: brightness(4) drop-shadow(0 0 25px #ffffff) blur(2px);
                  }
                  35% {
                    opacity: 0.95;
                    transform: translateY(-50%) scale(1.03, 0.05);
                    filter: brightness(3) drop-shadow(0 0 18px #ffffff) blur(1px);
                  }
                  68% {
                    opacity: 1;
                    transform: translateY(-50%) scale(0.98, 1.04);
                    filter: brightness(1.5) drop-shadow(0 0 12px #ffffff) blur(0px);
                  }
                  86% {
                    transform: translateY(-50%) scale(1.01, 0.99);
                    filter: brightness(1.2);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(-50%) scale(1, 1);
                    filter: brightness(1) drop-shadow(0 0 6px rgba(255,255,255,0.4));
                  }
                }
                @keyframes hudHoloProjectLeft {
                  0% {
                    opacity: 0;
                    transform: translateY(-50%) scale(0.04, 0.02);
                    filter: brightness(4) drop-shadow(0 0 25px #ffffff) blur(2px);
                  }
                  35% {
                    opacity: 0.95;
                    transform: translateY(-50%) scale(1.03, 0.05);
                    filter: brightness(3) drop-shadow(0 0 18px #ffffff) blur(1px);
                  }
                  68% {
                    opacity: 1;
                    transform: translateY(-50%) scale(0.98, 1.04);
                    filter: brightness(1.5) drop-shadow(0 0 12px #ffffff) blur(0px);
                  }
                  86% {
                    transform: translateY(-50%) scale(1.01, 0.99);
                    filter: brightness(1.2);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(-50%) scale(1, 1);
                    filter: brightness(1) drop-shadow(0 0 6px rgba(255,255,255,0.4));
                  }
                }
              `}</style>

              {/* LÍNEA GUÍA LÁSER VECTORIAL (Se dibuja desde la nave hasta el panel) */}
              <svg
                style={{
                  position: 'absolute',
                  top: '0px',
                  left: direction === 'right' ? '0px' : '-85px',
                  width: '85px',
                  height: '50px',
                  overflow: 'visible',
                  pointerEvents: 'none',
                }}
              >
                {direction === 'right' ? (
                  <path
                    d="M 0 0 L 25 -22 L 78 -22"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: '140',
                      animation: 'hudLineDrawRight 0.16s ease-out forwards',
                      filter: 'drop-shadow(0 0 6px #ffffff)',
                    }}
                  />
                ) : (
                  <path
                    d="M 85 0 L 60 -22 L 7 -22"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: '140',
                      animation: 'hudLineDrawLeft 0.16s ease-out forwards',
                      filter: 'drop-shadow(0 0 6px #ffffff)',
                    }}
                  />
                )}

                {/* Punto luminoso de anclaje */}
                <circle
                  cx={direction === 'right' ? 78 : 7}
                  cy="-22"
                  r="3"
                  fill="#ffffff"
                  style={{ filter: 'drop-shadow(0 0 8px #ffffff)' }}
                />

                {/* Onda expansiva de proyección holográfica */}
                <circle
                  cx={direction === 'right' ? 78 : 7}
                  cy="-22"
                  r="3"
                  fill="none"
                  stroke="#ffffff"
                  style={{
                    animation: 'emitterPing 0.5s cubic-bezier(0.1, 0.8, 0.2, 1) 0.12s both',
                  }}
                />
              </svg>

              {/* CONTENEDOR CON LA ANIMACIÓN HOLOGRÁFICA EXPANSIVA */}
              <div
                ref={panelRef}
                style={{
                  position: 'absolute',
                  ...(direction === 'right'
                    ? { left: '88px', transformOrigin: 'left center' }
                    : { right: '88px', transformOrigin: 'right center' }),
                  top: '-22px',
                  animation:
                    direction === 'right'
                      ? 'hudHoloProjectRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both'
                      : 'hudHoloProjectLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
                }}
                className="w-[350px] sm:w-[390px]"
              >
                <SciFiHudPanel badgeTitle={site.kind === 'science' ? 'INTERÉS CIENTÍFICO' : 'TELEMETRÍA'}>
                  <TerminalCardContent
                    site={site}
                    actionLabel="ALUNIZAR"
                    delayStartMs={220}
                    onAction={onLandOnSite ? () => onLandOnSite(site.id) : undefined}
                  />
                </SciFiHudPanel>
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
};

useGLTF.preload('/models/lander/lander.glb');
