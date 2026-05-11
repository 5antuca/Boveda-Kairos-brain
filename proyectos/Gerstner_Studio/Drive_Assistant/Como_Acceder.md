---
tags: [gerstner-studio, drive-assistant, acceso, uso, mobile]
fecha: 2026-05-09
relacionado: [[Drive_Assistant]]
---

# Cómo acceder al Drive Assistant

## URL

**https://ai.kairosaisolutions.com**

Sin token, la página muestra "Acceso restringido". Hay que entrar con un **magic link** personal que incluye tu token en la URL.

---

## Tu magic link (Santi)

```
https://ai.kairosaisolutions.com/?t=hUdoEtLUP0ift0EuktQ4g_xIdGB-2K1h
```

> ⚠️ Este link es **personal e intransferible**. Si lo compartís, esa persona usa tu identidad. Si querés que alguien más entre, generale su propio link (sección "Crear acceso para otra persona" más abajo).

Funciona en cualquier dispositivo que abra la URL: PC, Mac, iPad, Android, iPhone.

---

## Cómo usarlo en mobile (iPhone / iPad / Android)

### Primera vez

1. Abrí el magic link en el browser del teléfono (Safari en iOS, Chrome en Android).
2. La app guarda automáticamente tu token en `localStorage` y limpia el `?t=...` de la URL.
3. Ya estás logueado — **no hace falta volver a usar el magic link**.

### A partir de la segunda vez

Solo entrás a `https://ai.kairosaisolutions.com` (sin `?t=`) y la sesión sigue activa, hasta que:
- Borres datos del browser, o
- Le des "Salir" (menú **"..."** en la esquina superior derecha).

### Agregar a la pantalla de inicio (estilo app)

Para que se sienta una app nativa:

**iOS (Safari)**:
1. Tocá el botón compartir (⬆️ cuadrado con flecha).
2. Bajá → "Add to Home Screen".
3. Nombre: "Gerstner Drive" (o el que quieras).
4. Tocá Add.

Aparece como ícono en tu home screen, abre fullscreen sin barra del browser.

**Android (Chrome)**:
1. Menú "..." arriba a la derecha.
2. "Install app" o "Add to Home screen".
3. Confirmar.

---

## Cómo usarla

1. Empty state te recibe con sugerencias clickeables ("Interior del Singer", etc).
2. Escribís lo que buscás en lenguaje natural — ej. *"motor del jaguar e-type"* — y le das ↑.
3. La respuesta llega con:
   - Texto explicativo arriba.
   - Grid de hasta 12 thumbnails debajo.
4. Click en cualquier imagen → **lightbox a pantalla completa**:
   - Flechas izq/der para navegar (← → con teclado).
   - **ESC** para cerrar (o tap afuera de la imagen).
   - Botón ↗ arriba-derecha para abrir el archivo en Drive.
5. **Videos** se reproducen inline en el lightbox via Drive preview.
6. Para salir: menú **"..."** → **Salir**.

---

## Performance esperada

- **Primera query** (cache miss): 2-4 segundos.
- **Mismo proyecto en queries siguientes**: <1 segundo (cache 45 min — limitado por la validez del thumbnailLink firmado de Drive, ~1h).
- **Imágenes**: aparecen con skeleton shimmer y fade-in suave; las primeras 6 cargan inmediato, el resto al ir scrolleando.

---

## Crear acceso para otra persona

Desde el VPS:

```bash
curl -X POST https://ai.kairosaisolutions.com/api/admin/users \
  -H "Authorization: Bearer FcLN84JyP8X1HR6a9sfuJw-LB9SeywZ-bbN_fFi2cDc" \
  -H "Content-Type: application/json" \
  -d '{"email": "joaquin@gerstnerwerks.com", "name": "Joaquín"}'
```

Te devuelve:
```json
{
  "email": "...",
  "name": "...",
  "token": "...",
  "magic_link": "https://ai.kairosaisolutions.com/?t=..."
}
```

Mandale **el `magic_link`** por WhatsApp/mail. La persona lo abre en su teléfono y ya está logueada.

> ⚠️ El `ADMIN_TOKEN` es secreto: vive en `/root/apps/ai-gerstner/.env` (gitignored). El que aparece arriba es el actual — si lo rotás, regenerar magic links para todos.

---

## Revocar acceso

```bash
curl -X DELETE https://ai.kairosaisolutions.com/api/admin/users/joaquin@gerstnerwerks.com \
  -H "Authorization: Bearer FcLN84JyP8X1HR6a9sfuJw-LB9SeywZ-bbN_fFi2cDc"
```

El próximo request de esa persona devuelve 403 y la app le muestra "Tu token no es válido o fue revocado".

---

## Listar usuarios activos

```bash
curl https://ai.kairosaisolutions.com/api/admin/users \
  -H "Authorization: Bearer FcLN84JyP8X1HR6a9sfuJw-LB9SeywZ-bbN_fFi2cDc" \
  | python3 -m json.tool
```

Devuelve emails, fecha de creación, último uso y si está revocado.

---

## Compatibilidad

| Plataforma | Estado |
|---|---|
| Chrome / Edge / Brave (desktop) | ✅ |
| Safari macOS | ✅ |
| Firefox (desktop) | ✅ |
| Safari iOS (iPhone / iPad) | ✅ — viewport 100dvh, sin zoom al focusear input |
| Chrome Android | ✅ |
| Add to Home Screen | ✅ (PWA-like, sin manifest todavía) |

---

## Troubleshooting

**"Acceso restringido"**: no tenés token. Volvé a usar el magic link.

**"Tu token no es válido o fue revocado"**: admin lo revocó o nunca fue válido. Pedile uno nuevo.

**Imágenes no cargan, solo se ven skeletons**: probablemente token caducado o revocado. Revisá la consola del browser (Network → 401/403). Pedí magic link nuevo.

**Videos en lightbox tiran "request access"**: la cuenta Google con la que estás logueado en el browser no tiene acceso al Drive del taller. Loggeate con la cuenta correcta o abrí el archivo desde el botón ↗.

**Latencia alta primera query**: normal — cache vacío + Drive API. La segunda query del mismo proyecto va <1s.

---

## Referencias

- [[Drive_Assistant]] — dashboard del proyecto.
- [[Decisiones_Pendientes]] — todas las decisiones de diseño cerradas.
- Repo: https://github.com/5antuca/ai.gerstner
- Código local en VPS: `/root/apps/ai-gerstner/`
