# Batería CI — delta AUTH-2026-10-28-071 (contraste, texto vivo)

La MISMA suite que `../pruebas-reglas-fdcam/` contra el texto
VIVO vigente: el candidato AUTH-068 tal como se publicó
(SHA-256 `9d7dd0b3…`), SIN el delta `fdCamAt`.

- Expectativas invertidas solo donde el delta manda: F1/F2/F9
  pasan a denegadas (la rama de perfil no conoce el campo) y
  F6 a admitida (el `create` vivo no prohíbe `fdCamAt`: sin la
  línea nueva, un lote de registro completo CON el campo
  pasaba). El resto, idéntico.
- `test-fdcam.mjs` = 10 casos (F1–F10) contra el emulador
  oficial (proyecto ficticio `ronbo-nutri-test`).

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
