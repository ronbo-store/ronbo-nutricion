# Batería CI — delta AUTH-2026-10-28-072 (candidato)

Suite AUTH072 (19 casos: N1–N13 + A1–A6) contra el CANDIDATO
de reglas: texto vivo `b71d4fd4…` (ruleset 8c3c6e40) + SOLO
las dos piezas del diseño §4 (candidato SHA-256 `f91e6f97…`):

- Pieza 1: colección nueva `trainer_notify/{trainerUid}`
  `{email, mailLang, updatedAt}` — la escribe solo el propio
  entrenador (correo atado al de su cuenta); la lee el propio,
  el propietario y un registrante pendiente que eligió a ese
  entrenador. Sin lista.
- Pieza 2: cláusula en `users/{uid}` — el entrenador que
  aprobó a un alumno anota solo `notices.welcome`
  `{at: hora del servidor, by: él, template: 'welcome'}`.

La suite gemela (`../pruebas-reglas-auth072-vivo/`) corre los
MISMOS 19 casos contra el texto vivo con las expectativas
del delta invertidas: N1/N6/N7/N8/N9/A1 pasan a denegadas.

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
