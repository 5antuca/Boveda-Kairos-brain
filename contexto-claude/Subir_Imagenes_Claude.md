---
tags: [claude-code, scp, imagenes, herramientas]
fecha: 2026-04-19
estado: vigente
---

# Subir imágenes a Claude Code

Claude Code corre en el VPS y no puede leer archivos locales de la Mac directamente. Para que pueda ver una imagen (screenshot, foto, diagrama), hay que subirla al VPS con `scp`. Claude la lee con su tool `Read` (soporta PNG/JPG/PDF) y después la borra.

## Dónde se suben

Carpeta dedicada en el VPS: `/root/tmp-images/`

Es una carpeta **temporal**. Está fuera del repo git (no se commitea nada por error). Claude borra las imágenes después de leerlas.

## Comando

Desde la terminal de la Mac:

```bash
scp -i ~/.ssh/id_trebolvps '/ruta/local/a/la/imagen.png' root@46.62.235.162:/root/tmp-images/
```

Ejemplo real:

```bash
scp -i ~/.ssh/id_trebolvps '/Users/5an/Desktop/Captura de pantalla 2026-04-19 a la(s) 12.02.35.png' root@46.62.235.162:/root/tmp-images/
```

Comillas simples alrededor de la ruta local porque el nombre de archivo de macOS suele tener espacios y paréntesis.

## Alias para no escribir todo

Si querés usarlo seguido, agregá esto a tu `~/.ssh/config` en la Mac:

```
Host kairos-vps
    HostName 46.62.235.162
    User root
    IdentityFile ~/.ssh/id_trebolvps
```

Y el comando queda mucho más corto:

```bash
scp '/Users/5an/Desktop/captura.png' kairos-vps:/root/tmp-images/
```

Múltiples archivos de una:
```bash
scp /Users/5an/Desktop/*.png kairos-vps:/root/tmp-images/
```

## Flujo

1. Subís la imagen con `scp`.
2. En la conversación con Claude decís "ahí te subí la imagen" (o el nombre del archivo si hay ambigüedad).
3. Claude lista `/root/tmp-images/`, la lee con el tool `Read` (visualmente — es multimodal).
4. Te responde basándose en lo que ve.
5. Claude borra el archivo con `rm /root/tmp-images/<file>`.

## Troubleshooting

**`Permission denied (publickey)`** → el scp está usando la key SSH por default (`~/.ssh/id_ed25519`) pero la que está autorizada en el VPS es `~/.ssh/id_trebolvps`. Siempre pasale `-i ~/.ssh/id_trebolvps` o configurá el alias arriba.

**`scp: connect to host 46.62.235.162 port 22: Connection timed out`** → firewall / VPN / red caída. Verificá `ping 46.62.235.162`.

**Nombres con espacios se rompen sin comillas** → siempre usar comillas simples alrededor de la ruta local.

## Referencias

- IP pública VPS: `46.62.235.162`
- User SSH: `root`
- Key autorizada: `~/.ssh/id_trebolvps` (en el VPS figura como `trebol-vps-key` en `/root/.ssh/authorized_keys`)
- Carpeta temporal: `/root/tmp-images/`
