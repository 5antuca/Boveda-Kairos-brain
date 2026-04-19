---
tags: [infra, snapshot, backup, recovery, docker, cleanup]
fecha: 2026-04-19
estado: vigente
---

# VPS — snapshots de workflows y recovery

Cómo sacar un "screenshot" del estado mutable del VPS (workflows n8n de test+prod) al repo git, y cómo restaurar si algo se rompe.

## Qué se snapshottea y qué no

**Sí va al repo:**
- Workflows n8n (test + prod) → exportados vía API a `workflows/snapshots/{test,prod}/`.
- Código del bot (`bot-service/`) — siempre en git.
- Configs Docker (`environments/`) — siempre en git.

**NO va al repo:**
- Credenciales n8n → encriptadas en Postgres del container, reactivar manualmente tras restaurar.
- Ejecuciones históricas (`execution_entity` de n8n) → no son recuperables, tampoco son críticas.
- `.env` files → ignorados por `.gitignore` (contienen secrets). Viven en el VPS.
- Redis data (chat histories, flags) → efímera.

## Cómo sacar un snapshot

Hay un comando reutilizable que genera todos los JSON:

```bash
cd /root/kairos-infrastructure

# Variables
TEST_KEY="$(docker exec trebol-test-postgres psql -U postgres -d n8n -t -A \
  -c "SELECT \"apiKey\" FROM user_api_keys WHERE label='claude' LIMIT 1")"
PROD_KEY="$(docker exec trebol-prod-postgres psql -U postgres -d n8n -t -A \
  -c "SELECT \"apiKey\" FROM user_api_keys WHERE label='prod' LIMIT 1")"

mkdir -p workflows/snapshots/test workflows/snapshots/prod

# Export test
docker exec trebol-test-n8n node -e "
const http=require('http'); const fs=require('fs');
const list_opts={hostname:'localhost',port:5678,path:'/api/v1/workflows?limit=200',method:'GET',headers:{'X-N8N-API-KEY':'$TEST_KEY'}};
function slug(s){return s.replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/_+/g,'_').slice(0,60);}
http.request(list_opts,(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{
  const wfs=JSON.parse(d).data||[];
  let done=0;
  wfs.forEach(wf=>{
    const opts={hostname:'localhost',port:5678,path:'/api/v1/workflows/'+wf.id,method:'GET',headers:{'X-N8N-API-KEY':'$TEST_KEY'}};
    http.request(opts,(r)=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{
      fs.writeFileSync('/tmp/snap_'+wf.id+'_'+slug(wf.name)+'.json',b);
      if (++done===wfs.length) console.log('DONE');
    });}).end();
  });
});}).end();
"
# Copiar al host
for f in $(docker exec trebol-test-n8n sh -c 'ls /tmp/snap_*.json'); do
  docker cp "trebol-test-n8n:$f" "workflows/snapshots/test/$(basename "$f" | sed 's|snap_||')"
done

# Repetir el bloque para prod cambiando n8n container, KEY, y dir de snapshots.

git add workflows/snapshots/
git commit -m "chore(snapshot): backup workflows n8n (YYYY-MM-DD)"
git push origin main
```

## Cómo restaurar un workflow

### Un solo workflow

```bash
# 1. Pull si estás en una máquina recién clonada
git pull origin main

# 2. Identificar el snapshot
ls workflows/snapshots/test/<id>_*.json

# 3. Ver si el workflow aún existe en n8n
docker exec trebol-test-n8n node -e "
  const http=require('http');
  http.request({hostname:'localhost',port:5678,path:'/api/v1/workflows/<ID>',method:'GET',
    headers:{'X-N8N-API-KEY':'<KEY>'}},
    r=>{let d=''; r.on('data',c=>d+=c); r.on('end',()=>console.log(r.statusCode,d.substring(0,80)));}).end();
"

# 4a. Si existe (HTTP 200) → PUT para actualizarlo (conserva mismo ID):
bash scripts/deploy-workflow-test.sh workflows/snapshots/test/<file>.json <ID>

# 4b. Si NO existe (HTTP 404) → POST para crearlo (ID nuevo, hay que actualizar referencias):
# Usar la n8n UI → Import from file → seleccionar el JSON.
# O vía API con POST /api/v1/workflows.
```

### Todo el stack de workflows desde cero (disaster recovery)

Si el Postgres de n8n se corrompe y perdés todos los workflows:

```bash
# 1. Recuperar Postgres (otro tema — backup diario separado)
# 2. Luego reimportar workflows uno x uno desde snapshots/
cd workflows/snapshots/test
for f in *.json; do
  # Para cada archivo: POST al API → crea workflow nuevo con mismo nombre/estructura pero ID NUEVO
  # Requiere actualizar cualquier referencia cruzada (ej: sub-workflows que llaman por ID).
  echo "TODO: import $f"
done
```

**OJO: los IDs cambian tras un POST.** Los sub-workflows que llaman a otros por ID (ej: `Execute Workflow` node) hay que reapuntarlos a los IDs nuevos. Esto es un problema si tenés muchos workflows encadenados — por eso es preferible restaurar con PUT en el mismo ID cuando el workflow existe.

## Cleanup de VPS — aprendizajes 2026-04-19

Durante una sesión de limpieza recuperamos 2 GB de disco y 1 GB de RAM. Las tres categorías de limpieza de mayor impacto:

### 1. Imágenes Docker huérfanas (`<none>`)
Vienen de rebuilds acumulados del bot. Sin riesgo.
```bash
docker image prune -f
docker builder prune -f
```

### 2. Volúmenes Docker huérfanos
Hay un pasado de containers migrados con nombres distintos que dejaron volumes sin montar. **Investigar siempre 1x1 antes de borrar**:

```bash
# Listar huérfanos con tamaño y fecha
for v in $(docker volume ls -q -f dangling=true); do
  size=$(du -sh /var/lib/docker/volumes/$v/_data 2>/dev/null | awk '{print $1}')
  mtime=$(stat -c %y /var/lib/docker/volumes/$v/_data 2>/dev/null | cut -d. -f1)
  echo "$size  $mtime  $v"
done

# Inspeccionar contenido de uno específico
docker run --rm -v <nombre>:/d alpine sh -c 'ls -la /d/ && du -sh /d'

# Eliminar
docker volume rm <nombre>
```

### 3. Observabilidad apagada
El stack `prometheus` + `loki` (grafana, loki, promtail, prometheus, alertmanager, cadvisor, 3 exporters) consume ~1 GB RAM. Si no se usa activamente, tirarlo libera recursos:

```bash
cd environments/production/shared/monitoring/loki && docker compose down
cd environments/production/shared/monitoring/prometheus && docker compose down
# Después: docker volume rm loki-data prometheus-data grafana-data alertmanager-data
```

> **OJO — telegram-bot** vive en el compose de `prometheus` por herencia. Si bajás ese stack, se baja también.

## Política a futuro (pendiente de implementar)

- Snapshot automático semanal vía cron:
  ```
  0 3 * * 0 cd /root/kairos-infrastructure && bash scripts/snapshot-workflows.sh
  ```
- Backup diario de Postgres de ambos entornos (ni hablar si Fangio entra a prod):
  ```
  0 4 * * * pg_dump ... > /root/backups/n8n-prod-$(date +%F).sql.gz
  ```
- Log rotation por `/etc/docker/daemon.json`:
  ```json
  { "log-opts": { "max-size": "10m", "max-file": "3" } }
  ```
- Script `scripts/audit-docker.sh` que liste anomalías (volumes huérfanos, containers unhealthy, ram alta, etc.) y alerte vía WhatsApp al grupo.

## Referencias

- Commit del primer snapshot: `7a60968 chore(snapshot): backup completo de workflows n8n test+prod (2026-04-19)`
- Cleanup sesión: commits `927003d` (test) y `aec77bb` (prod) — eliminación de Trebol v4 Test + MV autos Test + SheetsToMongo viejo.
- [[VPS_Architecture]] — qué containers existen y dónde viven
- [[VPS_Stack]] — mapa completo de servicios
