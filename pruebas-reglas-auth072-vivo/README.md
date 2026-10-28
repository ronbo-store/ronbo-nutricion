# Batería CI — delta AUTH-2026-10-28-072 (contraste vivo)

Suite AUTH072 (19 casos: N1–N13 + A1–A6) contra el texto
VIVO de reglas (ruleset 8c3c6e40, SHA-256 `b71d4fd4…` =
texto AUTH-068 + bloque `fdCamAt` de AUTH-071), con las
expectativas del delta INVERTIDAS: sin el match
`trainer_notify` ni la cláusula de `notices`, los casos que
el delta abre (N1, N6, N7, N8, N9 y A1) pasan a DENEGADOS.
Todos los demás casos ya son denegados en ambos textos.

La suite gemela (`../pruebas-reglas-auth072/`) corre los
mismos casos contra el CANDIDATO (SHA-256 `f91e6f97…`).

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
