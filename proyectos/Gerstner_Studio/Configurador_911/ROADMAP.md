# ROADMAP - GerstnerWerks 911 Configurator

Este documento define las fases de desarrollo e implementación del configurador de GerstnerWerks.

> [!info] Ver también
> - [[ROADMAP_Modelo_Singer_3D]] — roadmap específico para reemplazar el modelo 911 gratuito por el Porsche Singer propio (AutoCAD → web, fotorrealista, interior + aperturas) + auditoría del estado real del código.
> - [[Optimizacion_3D]] — sesión 2026-05-28 con artista 3D: pipeline ProOptimizer en Max + Draco/WebP en VPS. PENDIENTE: TurboSmooth en body para fix de fenders, re-export v5.

## Fase 1: Setup de escena 3D y carga del modelo base
- [ ] Procesar `Porsche911.glb` a través de `gltfjsx` para extraer la jerarquía de componentes React.
- [ ] Configurar el `<Canvas>` de React Three Fiber y establecer las cámaras (`PerspectiveCamera`).
- [ ] Implementar la iluminación base usando el Environment HDRI (`MR_INT-005_WhiteNeons_NAD1K.hdr`).
- [ ] Implementar un loader visual (Suspense, `useProgress` de Drei) para la carga inicial de los assets 3D.
- [ ] Añadir controles de órbita (`OrbitControls`) ajustados para evitar atravesar el plano del suelo y limitar los ángulos de visión.

## Fase 2: Implementación de lógica de materiales
- [ ] Separar los materiales lógicos en un archivo de configuración o Utils (`materials.ts`).
- [ ] **Pintura Exterior**: Sustituir el material por defecto por un `MeshPhysicalMaterial` con control dinámico de `color`, `clearcoat`, `roughness`, y `metalness`.
- [ ] **Llantas**: Implementar la lógica para cambiar el nodo activo o intercambiar texturas en las llantas seleccionadas.
- [ ] **Interiores**: Cargar dinámicamente diferentes sets de texturas PBR (cuero negro, cuero camel, alcántara, etc.) y aplicarlos a los nodos de tapicería.
- [ ] Configurar el store global (Zustand) para almacenar las selecciones activas.

## Fase 3: UI de selección de configuración
- [ ] Diseñar el panel UI siguiendo un estilo "boutique" premium (vidrio esmerilado, transiciones suaves, tipografía elegante).
- [ ] Crear componentes desacoplados para: 
  - Selector de Color de Pintura (paleta predefinida).
  - Selector de Llantas (iconos o miniaturas).
  - Selector de Tapicería (muestras de texturas).
- [ ] Sincronizar los cambios de UI con el Store de Zustand y reflejar los cambios instantáneamente en el Canvas 3D.
- [ ] Añadir animaciones de cámara (GSAP) para hacer focus en las áreas modificadas (ej. acercarse a la rueda al cambiar de llanta).

## Fase 4: Persistencia de datos
- [ ] Modelar la estructura de la base de datos (MongoDB) para guardar `Configuration`: `{ userId, paint, wheels, interior, createdAt }`.
- [ ] Crear API Routes / Server Actions en Next.js para gestionar el guardado y recuperación de configuraciones.
- [ ] Implementar un panel simple de "Mis Configuraciones" para los vendedores/clientes de GerstnerWerks.
- [ ] Generar un código único (ej. `GW-964-XYZ`) para compartir la configuración generada a través de una URL dinámica.
