# Batería CI — delta FAQ / Ayuda (candidato)

Suite de reglas del delta que añade el docId `faq` a las dos listas
cerradas de `app_settings` (lectura con sesión; escritura solo del
propietario), para el paquete FAQ de RONBO FIT (despliegue autorizado
por Ronald, correo 2026-10-28 01:13 CDT).

- `firestore.rules` = candidato de publicación: texto vivo verificado
  `13c0a457` (SHA-256 `c7d039bb…`) + SOLO ese delta de 2 líneas
  (candidato SHA-256 `c01fc199…`).
- `test-faq.mjs` = 14 casos + 2 verificaciones de datos contra el
  emulador oficial (proyecto ficticio `ronbo-nutri-test`).
- La suite gemela `../pruebas-reglas-faq-vivo/` corre los mismos casos
  contra el texto vivo con las expectativas del delta invertidas.

Este directorio SOLO valida el texto; no publica reglas ni despliega
nada. Sin secretos ni credenciales de producción.
