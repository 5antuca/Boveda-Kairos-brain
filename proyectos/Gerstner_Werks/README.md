# Proyecto: Gerstner Werks

Taller especializado en la **restauración y modificación de autos clásicos**. 
Su mayor fuente de ingresos proviene de estas restauraciones y trabajos personalizados generales. Además, desarrollan **modificaciones de Porsche 911 clásicos (tipo Singer) y modelos similares (964, etc.)**, aunque esta división aún no es pública y está reservada exclusivamente para clientes muy selectos.

## Estructura del Proyecto

El ecosistema digital de Gerstner Werks se divide en dos componentes principales:

### 1. Gerstner Werks (Landing Page)
Sitio institucional principal que presenta la marca, los servicios de restauración y el portafolio de proyectos terminados.
- **Dominio**: [gerstnerwerks.com](https://gerstnerwerks.com/)
- **Repositorio**: [5antuca/gerstnerwerks5](https://github.com/5antuca/gerstnerwerks5.git)

### 2. Gerstner Studio (Configurador 3D)
Aplicación interactiva de alta fidelidad para la personalización técnica y estética de Porsche 911/964.
- **Dominio**: [studio.gerstnerwerks.com](https://studio.gerstnerwerks.com/)
- **Repositorio**: [5antuca/gerstnersinger911](https://github.com/5antuca/gerstnersinger911.git)

---

## Roadmap y Estado Actual (Studio)

Actualmente en **Fase de Refinamiento Visual y UX**.

### Logros Recientes
- **Visuales**: Implementación de ACESFilmic Tone Mapping y sistema de iluminación de estudio profesional (4 puntos de luz).
- **Layout**: Diseño basado en pestañas (General, Interior, Llantas, Escape) con transiciones suaves y desenfoque dinámico del fondo.
- **Interiores**: Sistema de galería 2D de alta resolución con efecto de crossfade sincronizado.
- **Performance**: Optimización de carga con Loading Screen minimalista vinculada al progreso real del modelo 3D (Drei `useProgress`).

### Próximos Pasos
- [ ] **Persistencia**: Implementar guardado de configuraciones (Fase 4 - MongoDB/Supabase).
- [ ] **Escape**: Finalizar la sección de configuración de sistemas de escape.
- [ ] **Mobile**: Optimizar los targets táctiles de la barra de navegación en resoluciones pequeñas.

## Referencias Técnicas
- Configuración actual en [[Gerstner_Studio/ROADMAP]]
- Documentación del modelo en [[Gerstner_Studio/README]]
