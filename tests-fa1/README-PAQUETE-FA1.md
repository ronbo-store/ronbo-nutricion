# Paquete de batería — CANDIDATO F-A1 v2 (Etapa 2, 2026-10-20)

- **Candidato:** `firestore.rules.candidato-f-a1-v2-2026-10-20.rules`
  = texto r4 publicado íntegro (SHA-256 de r4: `323ef2d9…`) + bloque
  nuevo `energyPrivate` + `assessment` dentro de `match /users/{uid}`,
  ajustado con la señal «dato aportado: sí/no» aprobada por Ronald
  (2026-10-20 01:49). Copia canónica en
  `~/workspace/ronbo-nutri/preparacion-local/`.
- **Batería:** `bateria.mjs` — 110 casos: regresión r4 íntegra de 70
  casos sin modificar (= R13) + bloque F-A1 (R1–R12, R14) + señal
  (S1–S8). Proyecto ficticio `demo-fa1`, emulador oficial vía
  GitHub Actions (workflow `fa1-bateria.yml`, rama `ci/fa1-bateria`).
- **Estado:** la PUBLICACIÓN de estas reglas NO está autorizada.
  La publicará Ronald, como hizo con r4, con autorización expresa
  posterior a ver el resultado de esta batería.
