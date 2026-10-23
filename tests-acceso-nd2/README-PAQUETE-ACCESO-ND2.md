# Paquete 8 «Comparador + ND-2» — batería CI del candidato de reglas (2026-10-22)

**Qué valida:** el candidato `firestore.rules.candidato-comparador-nd2-2026-10-22.rules`
(texto vivo verificado 2026-10-22, ruleset `2a1e98c1`, + UN bloque `access_log`
antes del catch-all: 31 líneas añadidas, 0 modificadas, 0 borradas).

**La suite:** 170 casos = 151 heredados de la batería Reglas C SIN MODIFICAR
(110 regresión r4/F-A1 + 10 Hallazgo C + 19 Entrenamiento + 12 Reglas C)
+ bloque nuevo **ACCESO ND-2 (ND1–ND19)**:

- ND1–ND8: creación de la bitácora — solo el propietario, solo de sí mismo,
  campos exactos (`hasOnly`), zona `evaluations` (v1), sin auto-accesos,
  hora del servidor (`at == request.time`).
- ND9–ND13: lectura solo del propietario (auditoría); la cliente mirada y
  terceros no leen nada.
- ND14–ND17: `update` denegado a TODOS (append-only, ni el autor reescribe);
  `delete` solo del propietario (purga de retención; precedente `consent_receipts`).
- ND18–ND19: la base SIN reglas nuevas de la Pregunta 9 contra el texto vivo —
  el entrenador actualiza la evaluación existente de un cliente (nota de fase)
  pero no puede crearla.

**Cómo se corre:** GitHub Actions, workflow `acceso-nd2-bateria.yml`
(push a `ci/comparador-nd2-bateria` o `workflow_dispatch`), emulador oficial
de Firestore, proyecto ficticio `demo-entrenamiento`. Evidencia: artefacto
`evidencia-bateria-acceso-nd2` (7 días) + resumen del job.

**Qué NO hace:** no publica reglas ni toca producción. La publicación del
candidato es un punto de control aparte (autorización expresa de Ronald,
vía CLI probada, con relectura íntegra del texto vivo tras publicar).
