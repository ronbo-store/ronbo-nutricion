# Paquete — batería del CANDIDATO ENTRENAMIENTO (reglas)

**Estado: ESCRITA para validación en CI (22/10/2026).** Valida el
candidato de reglas del Paquete 2 de la integración del módulo de
entrenamiento. **Publicar el candidato NO está autorizado por esta
batería**: la publicación es un punto de control separado que
requiere la autorización expresa de Ronald y se hará por la vía
CLI ya probada (2026-10-21), con relectura íntegra del texto vivo
tras publicar.

## Qué valida

El candidato `firestore.rules.candidato-entrenamiento-2026-10-22.rules`
(copia byte-idéntica del canónico en
`~/workspace/ronbo-nutri/preparacion-local/`, SHA-256
`1b8657c58edaf87743faa904005fd7405deb43b2cbdbb4da1cdb51600bdc7ecc`),
derivado del texto VIVO verificado del 2026-10-21 (ruleset
`a47f9679`, SHA-256 base
`1ee9f99301cd7c4a2d980d851241a9dd10ad0a1e66683e54031c4d14bc8c57bc`).
Único cambio: dos bloques `match` nuevos — `exercise_library` y
`routine_templates` — insertados antes del catch-all, con el
diseño aprobado en `PROPUESTA-ENTRENAMIENTO-V1.1-2026-10-22.md`
§4.7: lectura solo para usuarios aprobados (`isApprovedUser()`)
y escritura de cliente denegada siempre (`write: if false`; la
carga de datos será operación Admin versionada, fuera de las
reglas). El diff contra el texto vivo es exactamente esos dos
bloques (18 líneas añadidas, 0 modificadas, 0 borradas).

## Contenido de la batería (139 casos)

- **120 casos heredados SIN MODIFICAR** de la batería del
  candidato Hallazgo C (run 39640419130, 120 PASS): regresión r4
  íntegra de 70 (= R13) + bloque F-A1 (R1–R14) + señal S1–S8 +
  bloque Hallazgo C (HC1–HC9b). Verificado mecánicamente: el diff
  de `bateria.mjs` contra el archivo Hallazgo C muestra SOLO
  adiciones (cabecera, bloque ENT) y las diferencias mecánicas
  declaradas (nombre del archivo de reglas, proyecto ficticio
  `demo-entrenamiento`, líneas RESULTADO/DESGLOSE).
- **19 casos nuevos ENTRENAMIENTO (ENT1–ENT19)**: lectura
  permitida a aprobada (get+list en ambas colecciones) y al
  propietario; lectura denegada a no aprobada (get+list) y a
  anónimo (get en ambas); escritura denegada a aprobada
  (crear/actualizar/borrar en ambas) y al propietario por vía
  cliente (crear en plantillas, borrar en biblioteca). Fixtures
  propias del bloque: usuarias FRESCAS «ent» (aprobada) y
  «entno» (no aprobada), sembradas en el propio bloque — lección
  del bloque HC (run 39636010660): jamás reutilizar una usuaria
  que la regresión heredada deje contaminada.

## Cómo se ejecuta

Empujar la rama `ci/entrenamiento-bateria` (o lanzar el workflow
`entrenamiento-bateria.yml` por workflow_dispatch). El workflow
instala Node 22 + Java 21 + firebase-tools 15.34.0, hace
`npm ci` en esta carpeta y corre el emulador oficial con
`node bateria.mjs`. Resultado esperado si el candidato es
correcto: `RESULTADO ... 139 PASS · 0 FAIL`, con subtotales
r4 70/0, F-A1+señal 40/0, Hallazgo C 10/0 y Entrenamiento 19/0.
Cualquier FAIL => exit 1.
