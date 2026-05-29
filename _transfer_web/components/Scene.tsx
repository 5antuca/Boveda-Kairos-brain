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

// Escena cinematográfica (Fase 3) — 100% model-agnostic: cualquier modelo que
// se cargue hereda esta iluminación de estudio, cámara fotográfica y piso.
export function Scene() {
  // DPR adaptativo para fluidez en web: arranca en 1.25 y el PerformanceMonitor
  // lo baja a 1 si caen los FPS o lo sube a 1.5 si sobra. En retina, dpr 2
  // renderiza 4× píxeles → es lo que más traba; capar acá da 60fps.
  const [dpr, setDpr] = useState(1.25)

  return (
    <Canvas
      // Cámara fotográfica: focal larga (~fov 24 ≈ 85mm), ángulo bajo, poca
      // distorsión. Menos "orbital 3D", más foto automotriz.
      camera={{ position: [6.45, 1.54, -7.52], fov: 18 }}
      dpr={dpr}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        powerPreference: 'high-performance',
      }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />

      <color attach="background" args={['#15171a']} />

      {/* Iluminación cinematográfica: key fuerte y definida + relleno bajo +
          ambient mínimo → contraste agresivo y zonas oscuras reales, como la
          fotografía automotriz. */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[6, 9, 3]} intensity={1.5} />
      <directionalLight position={[-7, 3.5, -4]} intensity={0.22} />
      <spotLight position={[-2, 7, -7]} angle={0.6} penumbra={1} intensity={0.6} />

      <Suspense fallback={null}>
        <Car />

        {/* Piso: contacto físico. El auto está QUIETO (solo orbita la cámara),
            así que la sombra se calcula UNA sola vez (frames=1) → no recomputa por
            frame = gran ahorro de performance. */}
        <ContactShadows
          resolution={1024}
          frames={1}
          scale={16}
          blur={2.6}
          opacity={0.9}
          far={2.2}
          color="#000000"
          position={[0, 0.002, 0]}
        />

        {/* Estudio automotriz: HDRI real (white-neons softbox) → reflejos
            largos/suaves + FONDO de estudio (desenfocado y atenuado) visible
            360°. backgroundIntensity bajo → ambiente, no se quema. */}
        <Environment
          files="/env/MR_INT-005_WhiteNeons_NAD1K.hdr"
          environmentIntensity={0.95}
          background
          backgroundBlurriness={0.6}
          backgroundIntensity={0.28}
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
