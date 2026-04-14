---
tags: [contexto-claude, git, sync, workflow, regla]
---

# 🔄 Sincronización Dual: kairos-infrastructure + Boveda-Kairos-brain

> **Regla obligatoria**: cada vez que Claude (o el usuario) edita la bóveda, **hay que pushear los DOS repos**, no solo uno. Si lo olvidás, el VPS y la Mac quedan desincronizados y los próximos `git pull` traen confusión.

## Arquitectura

Hay dos repos GitHub independientes que viven juntos en disco:

| Repo | Path en VPS | Path en Mac | Qué versiona |
|---|---|---|---|
| `kairos-infrastructure` | `/root/kairos-infrastructure/` | `~/Documents/.../kairos-infrastructure/` (nombre que le hayas puesto) | Código, workflows, scripts, specs, `.claude/` |
| `Boveda-Kairos-brain` | `/root/kairos-infrastructure/Kairos_Brain/` | `~/Documents/Kairos_Brain/` | Toda la bóveda Obsidian (esta misma) |

En el VPS la bóveda está **clonada adentro** del repo principal como nested checkout, e ignorada vía `.gitignore` del repo principal (`/Kairos_Brain/`). Esto permite que Claude lea los archivos del vault desde la misma ruta de siempre (`Kairos_Brain/...`) sin que el repo principal se enrede con ellos.

## Regla para Claude (yo)

**Después de editar cualquier archivo dentro de `Kairos_Brain/` en el VPS, antes de cerrar la tarea**:

1. `cd Kairos_Brain && git status` para revisar
2. `cd Kairos_Brain && git add ... && git commit -m "..."` para commitear el vault
3. `cd Kairos_Brain && git push` al repo `Boveda-Kairos-brain`
4. Si también edité algo afuera (en `kairos-infrastructure`), commitear y pushear el repo principal por separado
5. **O** correr `bash scripts/sync-vault.sh` que hace los dos commits + push en una pasada

**Nunca** asumir que un push a `kairos-infrastructure` arrastra los cambios del vault. Son repos distintos.

## Script `scripts/sync-vault.sh`

Wrapper que automatiza el sync dual. Vive en `kairos-infrastructure/scripts/sync-vault.sh`.

```bash
# Modo interactivo: te pide mensaje de commit por cada repo si hay cambios
bash scripts/sync-vault.sh

# Modo batch: pasás los mensajes como argumentos
bash scripts/sync-vault.sh "vault: nuevo postmortem Jeep" "infra: update prime-v4 path"
```

Lo que hace:
1. Entra a `Kairos_Brain/`, muestra `git status`, pide msg si hay cambios, commitea, pushea
2. Sale a `kairos-infrastructure/`, muestra `git status`, pide msg si hay cambios, commitea, pushea

Si un repo está limpio o ya sincronizado, lo saltea silenciosamente.

## Pull desde la Mac

Cuando estés en la Mac y quieras traer cambios del VPS, son **dos `git pull`**:

```bash
# Repo principal
cd ~/Documents/.../kairos-infrastructure
git pull

# Bóveda (vive en otra ubicación en tu Mac)
cd ~/Documents/Kairos_Brain
git pull
```

> Si querés, podés crear un alias en `~/.zshrc` de la Mac:
> ```bash
> alias kairos-pull='cd ~/Documents/Kairos_Brain && git pull && cd ~/Documents/path/to/kairos-infrastructure && git pull'
> ```

## Por qué este setup y no submódulo

Submódulo de git fue descartado porque:
- Requiere `git pull --recurse-submodules` siempre, fácil de olvidar
- Los commits referencian un SHA específico del submódulo → cada edit del vault genera un commit "bump submodule" en el repo padre, ruidoso
- Conflictos al mergear son confusos

Nested checkout + `.gitignore` es más simple: cada repo opera independiente, y el sync se resuelve con un script de 50 líneas.

## Riesgos conocidos

- **Olvidarse un push**: si pusheás solo uno, el otro queda atrás. Mitigación: usar `sync-vault.sh` o commitear esta regla en memoria.
- **Conflictos cruzados**: si Claude edita una path en VPS y vos editás la misma en Mac al mismo tiempo, el `git pull` va a marcar conflicto en el vault. Resolverlo es git normal.
- **`.obsidian/workspace.json`**: cambia con cada apertura de Obsidian. Conviene gitignorearlo en el repo del vault. Ver `.gitignore` de la bóveda.
