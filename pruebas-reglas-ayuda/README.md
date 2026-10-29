# Batería CI — delta «Ayuda pública sin iniciar sesión — Opción B» (candidato)

Suite AYUDA (15 casos P1–P15) contra el CANDIDATO de reglas:
texto vivo `f91e6f97…` (ruleset f5352f7c) + SOLO la pieza del
diseño DISENO-AYUDA-SIN-LOGIN-2026-10-28 §2 Opción B
(candidato SHA-256 `98379d34…`):

- En el match `/app_settings/{docId}`: el `get` admite SIN
  sesión únicamente el documento `faq_public` (la copia pública
  de la Ayuda que alimenta la página /ayuda), y la lista de
  escritura del propietario gana `'faq_public'` (la
  sincronización del editor la escribe con su sesión).
- Nada más: `list` sigue prohibido, la FAQ interna `faq` y el
  resto de ajustes siguen tras sesión.

La suite gemela (`../pruebas-reglas-ayuda-vivo/`) corre los
MISMOS 15 casos contra el texto vivo con las expectativas del
delta invertidas: P1/P6/P9/P10/P13 pasan a denegados.

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
