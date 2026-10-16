# Paquete B2 — batería oficial del candidato r3

- Reglas evaluadas: `firestore.rules.propuesta-r3` (copia exacta del
  candidato r3 de `preparacion-local/`; verificar SHA-256 antes de
  cualquier corrida).
- Casos: 62 contados — regresión de los 35 de r2 con las escrituras
  de consentimiento en su forma acoplada A2 + 27 casos R de recibos,
  cierre de cuenta y purga. Cualquier FAIL => exit 1.
- Proyecto ficticio: demo-recibos-r3 (emulador oficial).
- r3 NO se declara validado sin una corrida oficial 100% PASS con
  artefacto preservado.
