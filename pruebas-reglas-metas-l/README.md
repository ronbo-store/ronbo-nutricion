# Batería de reglas — Metas-L (§L, 2026-10-26)

Serie L (45 casos) contra el candidato compuesto sobre el texto
vivo verificado `cd47f337` (SHA-256 `dd25a14f…`) + SOLO el delta
§L (candidato SHA-256 `e5e9452f…`): el dueño crea su
`goalsProposal` solo en `pending` y sin decisión (la real: nulos),
el entrenador asignado la decide con el contenido byte-idéntico y
al aprobar aplica `goals`/`goalsDayOverrides`/`goalObjective` +
`goalsProvenance` en la misma escritura (al rechazar, solo
propuesta + procedencia), el dueño escribe `goalsDayOverrides` y
solo él `goalsAgreement`; `approved`, rol, asignación y
consentimientos siguen cerrados.

Se ejecuta en GitHub Actions (workflow `metas-l-bateria.yml`)
junto a las regresiones vigentes — Metas A/G (45), Biblioteca
Comunitaria (45), Línea Completa (49) y S-1 (17) —, las cinco
suites contra el MISMO candidato (SHA-256 `e5e9452f…`).
