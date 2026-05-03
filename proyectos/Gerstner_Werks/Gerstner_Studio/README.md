# GerstnerWerks 911 Configurator

Herramienta SaaS interna para GerstnerWerks, diseñada para la visualización y personalización en tiempo real de un Porsche 964 (tipo Singer) frente al cliente, con calidad fotorrealista (PBR).

## Stack Técnico

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **3D Engine**: [Three.js](https://threejs.org/) a través de [React Three Fiber](https://r3f.docs.pmnd.rs/) y [@react-three/drei](https://github.com/pmndrs/drei).
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/)
- **Gestión de Estado**: [Zustand](https://github.com/pmndrs/zustand)
- **Animaciones**: [GSAP](https://gsap.com/) y Framer Motion (opcional).
- **Formatos 3D**: `glTF` comprimidos con Draco/Meshopt.

## Propósito Comercial

Proporcionar a los vendedores de GerstnerWerks una herramienta de ventas inmersiva. El cliente puede elegir colores de pintura exterior (con parámetros avanzados como clearcoat, metallic flakes), tipos de llantas y materiales interiores en tiempo real, ayudando a cerrar ventas y visualizar el producto final.

## Integración con el Ecosistema GerstnerWerks

- **Despliegue**: Configurado para funcionar en el **VPS Kairos** usando Docker (vía el archivo `Dockerfile` incluido en el repositorio).
- **Persistencia (Fase 4)**: Preparado para integrarse con MongoDB mediante Server Actions/API Routes de Next.js, permitiendo guardar la configuración de cada cliente bajo su perfil o número de cotización.

## Uso y Ubicación

> [!NOTE]
> **El código fuente de esta aplicación se encuentra fuera de la bóveda de Obsidian:**
> **Ruta del código:** `/Users/5an/Documents/gerstnersinger911`

1. Navegar al directorio del código: `cd /Users/5an/Documents/gerstnersinger911`
2. Instalar dependencias si no están instaladas: `npm install`
3. Añadir el modelo `Porsche911.glb` en `public/models/` y el archivo HDR en `public/env/`.
4. Iniciar el servidor de desarrollo: `npm run dev`
