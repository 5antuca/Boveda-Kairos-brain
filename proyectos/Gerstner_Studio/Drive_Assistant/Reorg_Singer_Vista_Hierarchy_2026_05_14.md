---
tags: [gerstner-studio, drive-assistant, presentacion, reorganizacion, doc-vivo]
fecha-creacion: 2026-05-14
estado: EN CURSO — Marketing reorganizado, Procesos pendiente, fotos siendo redistribuidas
relacionado: [[Reorg_Singer_2026_05_14]], [[Drive_Assistant]], [[Funcionamiento]]
---

# Reorg Drive Singer — Jerarquía por Vista (2026-05-14, segunda fase)

Segunda reorganización del mismo día. La primera ([[Reorg_Singer_2026_05_14]]) dejó el árbol PLANO con 60+ carpetas mirror en Procesos y Marketing. Ahora el usuario está pasando Marketing a una **jerarquía por Vista**, pensando en mejorar el matching de embeddings y la navegación humana.

> **Estado**: el árbol principal de Marketing ya está armado. Quedan por mover fotos entre carpetas y por replicar la estructura en Procesos. **Procesos sigue siendo plano por ahora.**

---

## 🗂️ Estructura nueva (Marketing)

```
Porsche 964 Gerstner Singer/
├── Marketing y Publicidad Singer/
│   ├── Desarme completo/                ← wrapper, NO es pieza
│   │   ├── Bulonería                    ← pieza (depth 3)
│   │   └── Burletes                     ← pieza (depth 3)
│   ├── Vista Exterior/                  ← wrapper
│   │   ├── Vista Frente/                ← wrapper
│   │   │   ├── Baúl/                    ← pieza (depth 4) Y wrapper de hijas
│   │   │   │   ├── Baúl perforado       ← pieza (depth 5)
│   │   │   │   ├── Tanque de combustible ← pieza (depth 5)
│   │   │   │   └── ...
│   │   │   ├── Paragolpes/              ← pieza Y wrapper
│   │   │   │   ├── Faldones de paragolpes delantero
│   │   │   │   └── Rejilla de paragolpe delantero
│   │   │   ├── Faros y guiños/
│   │   │   ├── Parabrisas, etc.
│   │   ├── Vista Trasera/
│   │   ├── Vista Derecha/
│   │   │   ├── Puerta/                  ← pieza Y wrapper
│   │   │   │   ├── Apertura de puerta
│   │   │   │   ├── Manija de puertas externa
│   │   │   │   └── Marco de vidrios
│   │   │   └── ...
│   │   ├── Vista Izquierda/             (espejo de Vista Derecha)
│   │   └── Vista de Abajo/
│   └── Vista Interior/                  ← wrapper
│       ├── Butacas/                     ← pieza Y wrapper
│       │   ├── Apoyacabezas
│       │   ├── Comandos de butaca
│       │   └── Comandos manuales de butacas
│       ├── Tablero Dashboard/
│       │   ├── Climatizador dashboard
│       │   ├── Encausadores de aire
│       │   └── difusores de aire interiores tablero
│       ├── Volante y accesorios/
│       │   └── Comandos de volante
│       └── ...
└── Procesos Singer/                     ← AÚN PLANO (no tocado en esta reorg)
    ├── Adhesivos laterales
    ├── Bisagras de baul
    └── ... (~95 piezas, depth 2)
```

## 🚫 Carpetas wrapper (no son piezas)

Marketing tiene niveles intermedios que NO deben aparecer como piezas:

- `Marketing y Publicidad Singer` (raíz)
- `Vista Exterior`
- `Vista Interior`
- `Vista Frente`
- `Vista Trasera`
- `Vista Derecha`
- `Vista Izquierda`
- `Vista de Abajo`
- `Desarme completo` ⚠️ ojo: en **Procesos** esta MISMA carpeta SÍ es una pieza (depth 2). Solo en Marketing es wrapper.

## ✅ Carpetas que son pieza Y wrapper a la vez

Algunas piezas tienen sub-piezas más específicas adentro. El usuario decidió que se **mergeen por nombre** — si nombrás "Baúl" mostrás todas; si nombrás "Tanque de combustible" entrás solo a esa.

| Padre (es pieza) | Hijas (también piezas) |
|---|---|
| Baúl (Vista Frente) | Baúl perforado, Cerradura de tapa de baúl, Fusilera, Garganta de combustible, Sunchos y tanque de combustible, Tanque de combustible, Tapa de baúl, Tapizado de baul |
| Paragolpes (Vista Frente) | Burletes de paragolpes, Faldones de paragolpes delantero, Rejilla de paragolpe delantero |
| Puerta (Vista Derecha/Izquierda) | Apertura de puerta, Manija de puertas externa, Marco de vidrios, Modificación de puertas |
| Caño de escape (Vista Trasera) | Aislación de escape, Cobertor de escape, Salida doble de escape |
| Capot (Vista Trasera) | Bisagra de aluminio de capot |
| Faros y guiños (Vista Frente) | Intermitentes delanteros, Opticas |
| Motor Singer (Vista Trasera) | Piezas y accesorios de motor, Pintura de piezas de motor, Plenum del motor, Tapizado motor |
| Ruedas llantas (Vista Derecha) | Válvulas de neumáticos |
| Zócalo (Vista Derecha/Izquierda) | Embellecedores de zócalo |
| Butacas (Vista Interior) | Apoyacabezas, Comandos de butaca, Comandos manuales de butacas |
| Tablero Dashboard (Vista Interior) | Climatizador dashboard, Encausadores de aire, difusores de aire interiores tablero |
| Volante y accesorios (Vista Interior) | Comandos de volante |
| Paneles Interiores (Vista Interior) | Guanteras de puertas, Tapizado de paneles puerta |

## 🎯 Política de matching (decisión 2026-05-14 con el usuario)

1. **Default — merge multi-vista por nombre.** Si decís "carrocería pelada" mostrás todas las apariciones (`Vista Frente/Carrocería (pelada)` + `Vista Derecha/...` + `Vista Izquierda/...` + `Vista Trasera/...`).
2. **Filtro on-demand por Vista.** Si decís "carrocería pelada lado trasero" filtrás SOLO el bucket de Vista Trasera. Equivale a un sub-modificador del speech, similar a cómo `bucket=procesos|marketing` ya funcionaba.
3. **Metadata persistente.** Cada folder en `folder_ids_by_slug` guarda:
   - `folder_id` (Drive)
   - `vista` (frente / derecha / izquierda / trasera / abajo / interior / desarme_completo / None)
   - `bucket_path` (path completo: `Marketing/Vista Exterior/Vista Frente/...`)

## 🔁 Cambios en el código del backend

Archivo único impactado: `bot-service/.../presentation_warmup.py` + `presentation_pieces.py` + router WS.

### Antes
```python
mkt_re = re.compile(f"^{re.escape(project_root_path)}/Marketing[^/]*/")
marketing = db.folder_tree.find({"path": {"$regex": mkt_re}, "depth": {"$gte": 2}})
# Tomaba el `name` directo de la carpeta como pieza — sin importar profundidad
```

Si lo dejábamos así, las nuevas wrappers ("Vista Exterior", "Vista Frente"…) iban a aparecer en `piezas_list` y se enviarían como slides falsas.

### Ahora
- Recorrer todo el subárbol de `Marketing y Publicidad Singer/`.
- Filtrar nombres de carpeta que estén en `_MARKETING_WRAPPERS` (definida en `presentation_warmup.py`).
- Por cada carpeta restante, computar `vista` a partir del path (segundo segmento bajo Vista Exterior, primer segmento si es Vista Interior o Desarme completo).
- Almacenar `vista` + `bucket_path` en `folder_ids_by_slug[slug]["marketing"]` (ahora list[dict] en vez de list[str]).
- `_decorate` propaga `vista` a cada imagen para que el frontend pueda filtrar/pintar.

### Detección de Vista en el speech
`detect_vista(window_text)` busca en las últimas 25 palabras frases tipo:
- "lado trasero" / "trasera" / "atrás" → `trasera`
- "lado derecho" / "vista derecha" → `derecha`
- "lado izquierdo" / "vista izquierda" → `izquierda`
- "vista de abajo" / "fondo" → `abajo`
- "vista de adelante" / "frente" / "delantero" → `frente` (si conflicta con piezas como "frenos delanteros" tiene baja prioridad)
- "vista interior" / "adentro" → `interior` (cuidado: conflicta con muchísimas piezas; solo cuenta si es explícito "vista interior")

Si `detect_vista` devuelve algo y la pieza está en multiple vistas → filtrar `ev.images["marketing"]` por `vista`. Si la pieza no tiene esa vista → no filtrar (sería empty state innecesario).

## 📦 Backup del estado anterior

- Backup de árbol pre-1ª reorg: `/root/apps/ai-gerstner/backups/drive_2026-05-13_235928.json` (132 carpetas, IDs + paths) — primera fase ya documentada.
- Sin backup formal entre 1ª y 2ª reorg porque la 2ª se hizo desde el UI manualmente. La estructura final post-1ª-reorg vive en `git log` y en este documento.

## 🚧 Pendiente

- [ ] Replicar la estructura jerárquica en Procesos (el usuario lo va a hacer manualmente, copiando carpetas y reasignando fotos).
- [ ] Subir / mover fotos a los lugares correctos dentro de la nueva jerarquía Marketing (en curso).
- [ ] Validar que el backend re-indexe correctamente con `_MARKETING_WRAPPERS` aplicado.
- [ ] Probar el filtro por Vista con frases tipo "muéstrame la trasera del paragolpes".
