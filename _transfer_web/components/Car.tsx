'use client'

/*
  Porsche Singer (modelo propio Gerstner) — loader genérico.
  El modelo viene de 3ds Max en pulgadas y con nombres de material reales
  (Paint_ext, Fuchs_*, Leather_*, etc.). En vez de hardcodear cada mesh
  (gltfjsx), renderizamos la escena entera con <primitive> y overrideamos
  los materiales por nombre. Cambiar de modelo (ej. v5 con fenders smooth)
  = cambiar MODEL_URL y nada más.
*/

import * as THREE from 'three'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader, DRACOLoader, KTX2Loader, GLTF } from 'three-stdlib'
import { useConfiguratorStore } from '@/store/useConfiguratorStore'

const MODEL_URL = '/models/SingerClean.glb'
const SCALE = 1.0 // pack Singer original ya viene en metros (~4.9m de largo)

// Nombres de material reales del GLB del Singer.
// PAINT_MAT desactivado a propósito: renderizamos la pintura TAL CUAL viene del
// .blend (azul glossy autoreado en Blender) en vez de reemplazarla por un
// material dinámico. Así la web respeta el look de Blender. (Para reactivar el
// selector de color, volver a poner 'Paint ext'.)
const PAINT_MAT = '__paint_disabled__'
const RIM_MATS = ['Fuchs_1', 'Fuchs_2', 'Fuchs_cap']
// El piso lo definen las ruedas de calle. Material Tire_base = meshes de
// neumático limpios y separados por rueda. (Tire_extrude/Tire_rough están
// soldados en mega-meshes de la optimización en Max → su bbox es inservible,
// llega a -27in y hacía flotar el auto ~0.6m.)
const FLOOR_MATS = ['Tire base', 'Tire_base']

// Materiales metálicos. El GLB los exportó todos con metalness=0 (SketchUp no
// autorea PBR) → se veían claros y planos. Acá les damos metalness real y un
// roughness por tipo (cromo casi espejo, aluminio satinado, escape matt).
// color opcional = neutralizar tintes placeholder obviamente mal autoreados.
// roughness más altos que antes: el environment "city" es brillante y los
// metales se veían como cromo blanco. Subiendo roughness leen como acero/alu
// cepillado (gris), no espejo. color gris neutro donde el GLB traía base blanca.
const METAL_MATS: Record<string, { metalness: number; roughness: number; color?: string }> = {
  // cromados / espejo (se mantienen brillantes, son cromo)
  Chrome: { metalness: 1, roughness: 0.14, color: '#d8d8d8' },
  Mirror: { metalness: 1, roughness: 0.08, color: '#dcdcdc' },
  Fuel_oil_caps: { metalness: 1, roughness: 0.25, color: '#cccccc' }, // tapas oil/fuel en metal
  // aluminio / acero satinado (más mate → gris, no blanco)
  Alu_ext: { metalness: 1, roughness: 0.52, color: '#9a9a9a' },
  Alu_int: { metalness: 1, roughness: 0.52, color: '#9a9a9a' },
  Metal_ext_rough: { metalness: 1, roughness: 0.55, color: '#a0a0a0' },
  Wiper_metal: { metalness: 1, roughness: 0.5, color: '#8f8f8f' },
  Bolt_wheel: { metalness: 1, roughness: 0.45 },
  // disco de freno: metal OPACO/mate oscuro (parte interna de la rueda) → da el
  // contraste sin pintar la llanta de negro. La pinza (Brake_caliper) sigue roja.
  Brake_disc: { metalness: 0.45, roughness: 0.8, color: '#525252' },
  Valve_metal: { metalness: 1, roughness: 0.45 },
  Momo_silver: { metalness: 1, roughness: 0.45 },
  Momo_bolts: { metalness: 1, roughness: 0.5 },
  Momo_black_metal: { metalness: 1, roughness: 0.5 },
  Speaker_mesh: { metalness: 1, roughness: 0.6 },
  Footwell_plate: { metalness: 0.3, roughness: 0.6, color: '#1c1c1c' },
  // oro (emblemas)
  Emblem_gold: { metalness: 1, roughness: 0.28 },
  Emblem_gold_bump: { metalness: 1, roughness: 0.35 },
  Emblem_gold_normal: { metalness: 1, roughness: 0.35 },
  // salidas de escape: acero cepillado (pulido se quemaba a blanco con el env)
  Exhaust_matt: { metalness: 1, roughness: 0.42, color: '#8f8f8f' },
  // pinza de freno: PINTURA roja (no metal). El material nonodes exportaba con
  // metalness=1 → quedaba rojo metálico oscuro. Forzamos metalness 0.
  Brake_caliper: { metalness: 0, roughness: 0.4, color: '#b81818' },
  // cromos de las luces: venían en roughness 0 (espejo perfecto) → de lejos
  // aliasing especular = cuadrados negros en los marcos. Subimos roughness.
  Lamp_chrome: { metalness: 1, roughness: 0.16, color: '#d6d6d6' }, // reflector cromado (refleja, no mate)
  Headlamp_bulb: { metalness: 1, roughness: 0.22, color: '#cfcfcf' },
}

// Acabado de materiales NO metálicos (no necesita UV ni texturas): solo
// roughness para que cuero/alfombra/plástico dejen de verse como plástico
// brillante. El color de cada uno se ajusta después contra las fotos de ref.
const FINISH_MATS: Record<string, number> = {
  // interiores: subidos para matar el brillo de cuero/plástico bajo el env
  Leather_BK_rough: 0.82,
  Leather_BR_rough: 0.82,
  Leather_BG_rough: 0.82,
  Leather_BK_glossy: 0.55,
  Leather_BR_glossy: 0.55,
  Leather_WH_glossy: 0.55,
  Carpet_in: 0.97,
  Headlining: 0.95,
  Plastic_int_matt: 0.9,
  Plastic_button_matt: 0.85,
  Recaro_paint: 0.6,
  Momo_leather: 0.78,
  Momo_rubber: 0.92,
  Int_glossy: 0.3, // piano black: menos espejo
  Pedal_top: 0.65,
  Seatbelt: 0.88,
  // gomas de neumático: roughness alto pero NO total (la goma real refleja algo).
  Rubber: 0.82,
  Tire_rough: 0.8,
  Tire_base: 0.85,
  Tire_extrude: 0.85,
  Wiper_rubber: 0.92,
  Plastic_ext_matt: 0.9,
}

// Color forzado (además del roughness). Las alfombras del pack venían claras
// (Carpet_out casi blanco, Carpet_in gris) → las llevamos a negro.
// Vidrios de FAROS (no las ventanas): se les saca la transmission para que no
// desaparezcan a distancia. Glass_ext (ventanas) se deja como está.
const LENS_GLASS = new Set(['Headlamp_glass', 'Glass_red', 'Glass_orange', 'Glass_parking_light'])

const COLOR_MATS: Record<string, string> = {
  Carpet_in: '#141414',
  Carpet_out: '#141414',
  // gomas: charcoal (no negro puro) → la goma real no es negro absoluto, refleja
  // un poco. Con el normal map del neumático da micro-bump/realismo.
  Rubber: '#1b1b1b',
  Tire_rough: '#1b1b1b',
  Tire_base: '#1b1b1b',
  Tire_extrude: '#1b1b1b',
  // materiales DIFFUSE del pack que salen BLANCOS al exportar a glTF (el exporter
  // pierde el color de los BSDF_DIFFUSE). Les forzamos su color oscuro real.
  // Plastic_int_matt = PISO interno bajo butacas/pedaleras (era el blanco).
  Plastic_int_matt: '#161616',
  Plastic_gauge_bck: '#0e0e0e',
  Plastic_button_matt: '#121212',
  Radio_screen: '#0a0a0a',
  Headlining: '#3a3a3a',
  Carpet: '#141414',
}

export function Model(props: any) {
  const gl = useThree((state) => state.gl)
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/')
    loader.setDRACOLoader(dracoLoader)

    const ktx2Loader = new KTX2Loader()
    ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/')
    ktx2Loader.detectSupport(gl)
    loader.setKTX2Loader(ktx2Loader)
  }) as unknown as GLTF

  const scene = gltf.scene
  const rigRef = useRef<THREE.Group>(null)
  const capTexRef = useRef<THREE.CanvasTexture | null>(null)
  const paintColor = useConfiguratorStore((s) => s.paintColor)
  const rimStyle = useConfiguratorStore((s) => s.rimStyle)

  // Pintura propia: MeshPhysicalMaterial con clearcoat → refleja el environment
  // como pintura de auto. Reemplaza al Paint_ext original, que venía sin
  // clearcoat (plano, sin reflejo) y con una baseColorTexture horneada que
  // apagaba el color elegido. Sin map → el color del selector se ve puro.
  const paintMaterial = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0a1c3a'),
      metalness: 0.85, // pintura METÁLICA (flake) — como el auto real: profundo
      roughness: 0.42, // brillo del flake bajo la laca
      clearcoat: 1.0, // laca
      clearcoatRoughness: 0.035, // laca profunda → reflejos largos/nítidos (wet look)
      envMapIntensity: 1.7, // reflejos de estudio marcados (deep gloss)
    })
    m.name = 'Paint_ext_dynamic'
    return m
  }, [])

  // El GLB tiene materiales DUPLICADOS por nombre (varias instancias del mismo
  // material en distintos meshes). Por eso no alcanza con indexar uno por nombre:
  // hay que recorrer TODOS los slots y aplicar el override a cada instancia, si
  // no quedan piezas sin tocar (gomas/alfombras/relojes blancos).
  const applyToMaterials = useCallback(
    (fn: (m: THREE.MeshStandardMaterial) => void) => {
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) if (m) fn(m as THREE.MeshStandardMaterial)
      })
    },
    [scene]
  )

  // Reemplazar el material de pintura en todos los meshes que lo usan
  // (incluye meshes multi-material: se reemplaza solo el slot Paint_ext).
  useLayoutEffect(() => {
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      if (Array.isArray(o.material)) {
        o.material = o.material.map((m) => (m && m.name === PAINT_MAT ? paintMaterial : m))
      } else if (o.material && o.material.name === PAINT_MAT) {
        o.material = paintMaterial
      }
    })
  }, [scene, paintMaterial])

  // Filtrado de texturas: anisotrópico + trilineal. Sin esto, de lejos el motor
  // usa mipmaps de baja resolución y las superficies con normal map / detalle
  // (faros, acrílico, metales) se ven en "cuadrados" / glitchean. Esto lo arregla.
  useLayoutEffect(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy()
    const seen = new Set<THREE.Texture>()
    const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        for (const k of keys) {
          const tex = (m as Record<string, unknown>)[k] as THREE.Texture | null
          if (tex && !seen.has(tex)) {
            seen.add(tex)
            tex.anisotropy = maxAniso
            tex.minFilter = THREE.LinearMipmapLinearFilter
            tex.magFilter = THREE.LinearFilter
            tex.generateMipmaps = true
            tex.needsUpdate = true
          }
        }
      }
    })
  }, [scene, gl])

  // Centrar + apoyar el auto en el piso DESPUÉS de montar, con las matrices
  // de mundo ya finales. El piso se define por las RUEDAS (no por el bbox
  // completo) para ignorar planos de sombra horneados u otra geometría que
  // cuelgue por debajo de los neumáticos y haga flotar el auto.
  useLayoutEffect(() => {
    const rig = rigRef.current
    if (!rig) return
    rig.position.set(0, 0, 0)
    rig.updateWorldMatrix(true, true)

    // bbox completo → centrado horizontal (X/Z)
    const full = new THREE.Box3().setFromObject(rig)
    const center = full.getCenter(new THREE.Vector3())

    // Fondo de cada rueda de calle (un valor por mesh Tire_base). Usamos la
    // MEDIANA para ignorar outliers: la rueda de auxilio interna (al centro,
    // más baja) y cualquier mesh raro. Las 4 ruedas de calle están niveladas.
    const wheelBottoms: number[] = []
    rig.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        if (mats.some((m) => m && FLOOR_MATS.includes(m.name))) {
          wheelBottoms.push(new THREE.Box3().setFromObject(o).min.y)
        }
      }
    })
    let floorY = full.min.y // fallback
    if (wheelBottoms.length) {
      wheelBottoms.sort((a, b) => a - b)
      floorY = wheelBottoms[Math.floor(wheelBottoms.length / 2)] // mediana
    }

    rig.position.x = -center.x // centrar en X
    rig.position.y = -floorY // apoyar ruedas sobre y=0
    rig.position.z = -center.z // centrar en Z
  }, [scene])

  // Color de pintura + llantas dinámicas desde el store
  useLayoutEffect(() => {
    paintMaterial.color.set(paintColor)

    // Fuchs estilo Singer (ref real): las CARAS de los radios + el LABIO/aro
    // exterior (Fuchs_1) van en aluminio satinado = color del selector. Los
    // VALLES/recovecos (Fuchs_2) van en NEGRO satinado fijo. El CENTRO (cap) en
    // aluminio satinado. Acabado satinado (roughness alto) → sin cromo.
    applyToMaterials((m) => {
      if (m.name === 'Fuchs_1') {
        m.color.set(rimStyle.hex) // caras de radios + labio/aro exterior
        m.metalness = rimStyle.metalness
        m.roughness = rimStyle.roughness
        m.envMapIntensity = 0.8 // un poco menos iluminada (sin recolorear)
      } else if (m.name === 'Fuchs_2') {
        m.color.set('#9a9da0') // valles = aluminio satinado (mismo tono, NO oscuro)
        m.metalness = 1
        m.roughness = 0.55
        m.envMapIntensity = 0.8
      } else if (m.name === 'Fuchs_cap') {
        m.color.set('#aeb1b4') // tapacubos central = aluminio satinado
        m.metalness = 1
        m.roughness = 0.5
        m.envMapIntensity = 0.8
      }
    })
  }, [paintColor, rimStyle, applyToMaterials, paintMaterial])

  // Overrides estáticos de material (una vez, al cargar). Recorre TODAS las
  // instancias para cubrir los materiales duplicados por nombre del GLB.
  useLayoutEffect(() => {
    applyToMaterials((m) => {
      const cfg = METAL_MATS[m.name]
      if (cfg) {
        m.metalness = cfg.metalness
        m.roughness = cfg.roughness
        if (cfg.color) m.color.set(cfg.color)
        m.envMapIntensity = 1.3 // reflejos de estudio más largos en metales/chrome
      }
      if (m.name in FINISH_MATS) m.roughness = FINISH_MATS[m.name]
      if (m.name in COLOR_MATS) m.color.set(COLOR_MATS[m.name])
      // Vidrio de relojes: venía blanco opaco (base 0.8) tapando el dial.
      // Lo hacemos vidrio oscuro casi transparente → se ve el reloj negro debajo.
      if (m.name === 'Gauge_glass') {
        m.color.set('#0a0a0a')
        m.metalness = 0
        m.roughness = 0.08
        m.transparent = true
        m.opacity = 0.2
        m.needsUpdate = true
      }
      // Espejo retrovisor: reflejo. Con el env atenuado (0.65) reflejaba oscuro
      // → se veía negro. Le subimos envMapIntensity para que espeje brillante.
      if (m.name === 'Mirror') {
        m.color.set('#eaeaea')
        m.metalness = 1
        m.roughness = 0.05
        m.envMapIntensity = 3.0
      }
      // Aro/reflector del faro: z-fighting con el parachoques en la esquina. Lo
      // tiramos hacia la cámara para que el faro quede por encima del paragolpe.
      if (m.name === 'Lamp_chrome') {
        m.polygonOffset = true
        m.polygonOffsetFactor = -8
        m.polygonOffsetUnits = -8
        m.needsUpdate = true
      }
      // Vidrios de faros: usaban transmission (refracción) + alpha baja → de lejos
      // la transmission no se renderiza y los cristales DESAPARECEN. Les sacamos
      // la transmission (transparencia simple estable) y subimos piso de opacidad.
      if (LENS_GLASS.has(m.name)) {
        const pm = m as THREE.MeshPhysicalMaterial
        if ('transmission' in pm) pm.transmission = 0
        pm.metalness = 0
        pm.roughness = 0.06
        pm.transparent = true
        // más transparentes: el cristal de óptica casi clear, los guiños/lentes
        // de color un poco más presentes para que el tinte se lea.
        if (m.name === 'Headlamp_glass') {
          // óptica: vidrio CLEAR (no oscuro) → se ve el reflector cromado adentro
          pm.color.set('#1e2228')
          pm.opacity = 0.16
          pm.envMapIntensity = 1.7 // reflejo nítido en la curvatura
        } else if (m.name === 'Glass_orange') {
          // guiño delantero: ámbar más translúcido y reflejante
          pm.opacity = 0.3
          pm.envMapIntensity = 1.7
        } else {
          pm.opacity = 0.4
          pm.envMapIntensity = 1.0
        }
        pm.depthWrite = false
        // las lentes comparten mesh con el panel pintado/parachoques → z-fighting.
        // polygonOffset fuerte las tira hacia la cámara → quedan como capa superior.
        pm.polygonOffset = true
        pm.polygonOffsetFactor = -8
        pm.polygonOffsetUnits = -8
        pm.needsUpdate = true
      }
      // Ventanas (Glass_ext): vidrio con tinte leve + reflejos fuertes del estudio
      // + oscurece el interior (vende realismo). Sin transmission pesada (estable).
      if (m.name === 'Glass_ext') {
        const pm = m as THREE.MeshPhysicalMaterial
        if ('transmission' in pm) pm.transmission = 0
        pm.color.set('#2c333b') // tinte más claro (menos oscuro)
        pm.metalness = 0
        pm.roughness = 0.03
        pm.envMapIntensity = 2.2 // reflejos de estudio marcados en el vidrio
        pm.transparent = true
        pm.opacity = 0.42 // más transparente → se ve mejor el interior
        pm.depthWrite = false
        pm.needsUpdate = true
      }
      // Acrílico del spoiler (Plexi_bubbles): material procedural transparente con
      // textura de huecos → de lejos glitchea (verde en cuadrados). Lo limpiamos a
      // un plexi ahumado translúcido liso (sin textura) → deja de buguear.
      if (m.name === 'Plexi_bubbles') {
        m.map = null
        m.normalMap = null
        m.roughnessMap = null
        m.metalnessMap = null
        if (m.emissive) m.emissive.set('#000000')
        m.color.set('#1c1f1c')
        m.metalness = 0
        m.roughness = 0.12
        m.transparent = true
        m.opacity = 0.6
        m.depthWrite = false
        m.needsUpdate = true
      }
      // Tapas oil/fuel: metal con letras CALADAS en relieve. Sacamos la textura de
      // color (tapón negro) y la metallicRoughness, pero potenciamos el normalMap
      // (que trae el relieve de las letras) para que se vean grabadas en el metal.
      if (m.name === 'Fuel_oil_caps') {
        // La textura del pack es fondo NEGRO con letras BLANCAS → usada directa
        // el tapón sale negro. La INVERTIMOS (fondo→claro=metal, letras→gris) y
        // la usamos de color: tapón metal con letras apenas más oscuras + relieve.
        if (!capTexRef.current && m.map && (m.map as THREE.Texture).image) {
          const img = (m.map as THREE.Texture).image as HTMLImageElement
          const cv = document.createElement('canvas')
          cv.width = img.width
          cv.height = img.height
          const cx = cv.getContext('2d')!
          cx.drawImage(img, 0, 0)
          const data = cx.getImageData(0, 0, cv.width, cv.height)
          const px = data.data
          for (let i = 0; i < px.length; i += 4) {
            // fondo negro(0)→~235 (metal claro); letras blancas(255)→~120 (gris)
            const out = 235 - px[i] * 0.45
            px[i] = px[i + 1] = px[i + 2] = out
          }
          cx.putImageData(data, 0, 0)
          const t = new THREE.CanvasTexture(cv)
          t.flipY = (m.map as THREE.Texture).flipY
          t.colorSpace = (m.map as THREE.Texture).colorSpace
          t.needsUpdate = true
          capTexRef.current = t
        }
        if (capTexRef.current) m.map = capTexRef.current
        m.metalnessMap = null
        m.roughnessMap = null
        m.color.set('#ffffff') // el tono lo da la textura invertida
        m.metalness = 1
        m.roughness = 0.42
        if (m.normalMap) m.normalScale = new THREE.Vector2(2.5, 2.5)
        m.needsUpdate = true
      }
    })
  }, [applyToMaterials])

  return (
    <group {...props} dispose={null}>
      <group ref={rigRef} scale={SCALE}>
        <primitive object={scene} />
      </group>
    </group>
  )
}
