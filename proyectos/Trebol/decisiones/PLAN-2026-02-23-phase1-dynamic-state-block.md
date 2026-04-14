# PLAN: Phase 1 — Dynamic State Block trebol22

> **Spec**: `specs/2026-02-23-phase1-dynamic-state-block-trebol22.md`
> **Fecha**: 2026-02-23
> **Estado**: 🔄 En ejecución

## Pasos de Ejecución

- [x] 1. Backup del workflow test actual en VPS → `/tmp/trebol22_backup_pre_phase1.json` (232,708 bytes)
- [x] 2. Modificar JSON localmente (107 nodos, nodo nuevo + conexiones + system prompt)
- [x] 3. Push del JSON modificado a n8n Test via API → HTTP 200 OK
- [x] 4. Verificar via API: Switch1[3]→ConstruirEstadoCRM, CRM→AIAgent, prompt dinámico ✅
- [ ] 5. Tests manuales (5 casos de la spec) — **PENDIENTE USUARIO**
- [ ] 6. Commit al repo
- [ ] 7. Deploy a Prod
- [ ] 8. Documentar en architecture.md

## Rollback

```bash
ssh root@46.62.235.162
# Restaurar desde backup
curl -X PUT "http://172.18.0.9:5678/api/v1/workflows/vGGBdvFL-Q_mLHzDiGk2I" \
  -H "X-N8N-API-KEY: $(grep N8N_API_KEY /root/kairos-infrastructure/trebol/test/.env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d @/tmp/trebol22_backup_pre_phase1.json
```

## Log

| Paso | Acción | Resultado | Timestamp |
|------|--------|-----------|-----------|
