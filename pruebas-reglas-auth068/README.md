# Batería CI — delta AUTH-2026-10-28-068 «Registro y aprobación en un clic» (candidato)

Suite de reglas del delta que abre `users/{uid}.emailConfirmedAt`
en la rama de perfil inofensivo (solo el propio usuario, solo con
la hora del servidor) y lo prohíbe en el `create` del registro,
para el paquete AUTH-2026-10-28-068 de RONBO FIT (diseño
2026-10-28, §4 y §8.1).

- `firestore.rules` = candidato de publicación: texto vivo
  verificado `ec2963ec` (SHA-256 `4237d9cc…`) + SOLO ese delta de
  2 ediciones (candidato SHA-256 `9d7dd0b3…`).
- `test-auth068.mjs` = 10 casos (A1–A10) contra el emulador
  oficial (proyecto ficticio `ronbo-nutri-test`).
- La suite gemela `../pruebas-reglas-auth068-vivo/` corre los
  mismos casos contra el texto vivo con las expectativas del
  delta invertidas (A1/A2/A9 y A6).

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
