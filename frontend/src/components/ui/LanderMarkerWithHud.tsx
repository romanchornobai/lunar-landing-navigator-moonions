import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { SciFiHudPanel } from './SciFiHudPanel';
import { TerminalCardContent } from './TerminalCardContent';

interface LanderMarkerWithHudProps {
  site: {
    id: string;
    name: string;
    shortName: string;
    description?: string;
    coordinates: {
      latitude: number;
      longitude: number;
      elevation_m?: number;
    };
    groundPos: THREE.Vector3;
    direction?: 'left' | 'right'; // Hacia qué lado se despliega el panel
  };
  onLandOnSite?: (siteId: string) => void;
  lineHeight?: number;
}

export const LanderMarkerWithHud: React.FC<LanderMarkerWithHudProps> = ({
  site,
  onLandOnSite,
  lineHeight = 4.0,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const landerHoverRef = useRef(false);
  const cardHoverRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landerMeshRef = useRef<THREE.Group>(null);

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
    if (landerMeshRef.current && isHovered) {
      landerMeshRef.current.rotation.y += delta * 1.5;
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

  const { groundPos, direction = groundPos.x > 25 ? 'left' : 'right' } = site;

  return (
    <group position={[groundPos.x, groundPos.y, groundPos.z]}>
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
            <primitive object={clonedScene} />
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
                  top: '-45px',
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
                <SciFiHudPanel badgeTitle="TELEMETRÍA">
                  <TerminalCardContent
                    site={site}
                    actionLabel="ALUNIZAR // 15 KM"
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
