'use client'

import { Canvas } from '@react-three/fiber'
import {
  Environment,
  OrbitControls,
  ContactShadows,
  PerformanceMonitor,
} from '@react-three/drei'
import { Suspense, useState } from 'react'
import { Model as Car } from './Car'
import * as THREE from 'three'

// Escena model-agnostic. Look calcado del Material Preview de Blender:
// HDRI = forest.exr (el studiolight por defecto de Blender), iluminación SOLO
// por HDRI (sin luces extra), tone mapping Standard (sin Filmic) y fondo gris
// neutro como el viewport. Así la web respeta los colores/reflejos del .blend.
export function Scene() {
  // DPR adaptativo para fluidez en web: arranca en 1.25, baja a 1 si caen FPS.
  const [dpr, setDpr] = useState(1.25)

  return (
    <Canvas
      // Cámara fotográfica: focal larga (fov 18 ≈ tele), poca distorsión.
      camera={{ position: [6.45, 1.54, -7.52], fov: 18 }}
      dpr={dpr}
      gl={{
        antialias: true,
        // Blender usa view transform "Standard" → sin curva filmic.
        // NoToneMapping = solo linear→sRGB, igual que Standard.
        toneMapping: THREE.NoToneMapping,
        powerPreference: 'high-performance',
      }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />

      {/* Fondo gris neutro como el viewport de Blender (no se usa el HDRI de
          fondo; el HDRI va solo para reflejos/iluminación). */}
      <color attach="background" args={['#3c3c3c']} />

      <Suspense fallback={null}>
        <Car />

        {/* Sombra de contacto con el piso (el auto está quieto → frames=1). */}
        <ContactShadows
          resolution={1024}
          frames={1}
          scale={16}
          blur={2.4}
          opacity={0.75}
          far={2.2}
          color="#000000"
          position={[0, 0.002, 0]}
        />

        {/* HDRI forest.exr (studiolight de Blender) SOLO para iluminación y
            reflejos. environmentIntensity 1.0 = strength 1.0 del World. */}
        <Environment
          files="/env/forest.exr"
          environmentIntensity={1.0}
        />
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        enableDamping
        dampingFactor={0.04}
        rotateSpeed={0.4}
        autoRotate
        autoRotateSpeed={0.3}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={2.4}
        maxDistance={16}
        target={[0, 0.55, 0]}
        makeDefault
      />
    </Canvas>
  )
}
