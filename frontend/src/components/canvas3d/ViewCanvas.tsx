import { Suspense, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

interface Props {
  children: ReactNode
  camera?: { position: [number, number, number]; fov?: number; near?: number; far?: number }
  minDistance?: number
  maxDistance?: number
}

/** Full-screen canvas with orbit controls and no UI. Shared by every view. */
export default function ViewCanvas({ children, camera, minDistance, maxDistance }: Props) {
  return (
    <div className="h-full w-full bg-black">
      <Canvas camera={{ fov: 45, near: 0.1, far: 2000, ...camera }}>
        <Suspense fallback={null}>{children}</Suspense>
        <OrbitControls makeDefault minDistance={minDistance} maxDistance={maxDistance} />
      </Canvas>
    </div>
  )
}
