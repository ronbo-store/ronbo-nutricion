# Paquete r4 — batería oficial del candidato r4

- Reglas evaluadas: `firestore.rules.propuesta-r4` (copia exacta del
  candidato r4 de `preparacion-local/`; verificar SHA-256 antes de
  cualquier corrida — r4: 323ef2d994cb6e309607e14adffa935e71b7f252629acead63e86cba95fbdd2d;
  base r3 intacta: a32a908c0c2a8bce81601dfebcc00b7c536b620c614672f98461aa85b15154f8).
- Casos: 70 contados — los 62 del candidato r3 SIN MODIFICAR
  (regresión íntegra) + 8 casos nuevos N63–N70 de la renovación del
  consentimiento general con el consentimiento ACTIVO
  (acceptedTerms true→true), la ruta que r3 hacía imposible.
  Cualquier FAIL => exit 1.
- Proyecto ficticio: demo-recibos-r4 (emulador oficial).
- r4 corrige SOLO dos candados de r3: (a) la rama de renovación ya
  no exige 'acceptedTerms' en affectedKeys().hasAll(...) — exige
  'termsAcceptedAt'; (b) receiptType deriva 'general-renewed'
  también cuando acceptedTerms permanece true y termsAcceptedAt
  cambia. El diff completo r3→r4 está en el encabezado del propio
  archivo de reglas.
- r4 NO se declara validado sin una corrida oficial 100% PASS con
  artefacto preservado. La PUBLICACIÓN de r4 NO está autorizada
  por este paquete: requiere autorización expresa posterior de
  Ronald.
