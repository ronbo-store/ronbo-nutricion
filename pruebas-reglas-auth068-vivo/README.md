# Batería CI — delta AUTH-2026-10-28-068 (contraste, texto vivo)

La MISMA suite que `../pruebas-reglas-auth068/` contra el texto
VIVO verificado `ec2963ec` (SHA-256 `4237d9cc…`), sin el delta.

- Expectativas invertidas solo donde el delta manda: A1/A2/A9
  pasan a denegadas (la rama de perfil no conocía el campo) y A6
  a admitida (el `create` vivo no tiene lista cerrada de campos:
  sin la línea nueva, un lote de registro completo CON
  `emailConfirmedAt` pasaba). El resto, idéntico.
- `test-auth068-vivo.mjs` = 10 casos (A1–A10) contra el emulador
  oficial (proyecto ficticio `ronbo-nutri-test`).

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
