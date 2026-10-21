# Paquete — batería del CANDIDATO HALLAZGO C

**Estado: ESCRITA, NO EJECUTADA (21/10/2026).** Nadie ha corrido
esta batería: ni en local (el emulador oficial no corre en la
sandbox de Jett: no hay Java) ni en GitHub Actions. La rama
`ci/hallazgo-c-bateria` existe SOLO en el clon local
`repo-ci-hallazgo-c`: no se ha empujado nada, no se ha creado
ninguna rama remota y no se ha publicado ninguna regla.
Ejecutarla en CI requiere autorización expresa de Ronald;
publicar el candidato, otra autorización posterior y separada.

## Qué valida

El candidato `firestore.rules.candidato-hallazgo-c-2026-10-21.rules`
(copia byte-idéntica del canónico en
`~/workspace/ronbo-nutri/preparacion-local/`, SHA-256
`1ee9f99301cd7c4a2d980d851241a9dd10ad0a1e66683e54031c4d14bc8c57bc`),
derivado del texto VIVO verificado del 2026-10-21 (ruleset
`cfe28b3f`, SHA-256 base
`eaf782251189d9b606dc30411953bca7c720f093c7f331428dee742dd0a41cc0`).
Único cambio: dentro de `match /nutrition_progress/{docId}`, la
lectura conjunta `allow get, list` se separa en `list` (sin
cambios) y `get` con guarda `resource == null` primero: un
usuario aprobado puede leer un documento inexistente cuyo
docId siga su patrón propio `{su uid}_…` (la lectura responde
«no existe» en vez de ser denegada). Diagnóstico en
`~/workspace/ronbo-nutri/INFORME-CANDIDATO-HALLAZGO-C-2026-10-21.md`
y en ESTADO.md (addendum 2026-10-21 «HALLAZGO C»).

## Contenido de la batería (120 casos)

- **110 casos heredados SIN MODIFICAR** de la batería oficial
  del candidato F-A1 v2 (run 39384261726, 110 PASS): regresión
  r4 íntegra de 70 (= R13) + bloque F-A1 (R1–R14) + señal
  S1–S8. Verificado mecánicamente: el diff de la lista de
  casos contra el archivo oficial muestra SOLO adiciones.
- **10 casos nuevos HALLAZGO C (HC1–HC9b)**: get de
  pendconfig/pendstate inexistentes propios (permitido), get
  de inexistente con prefijo ajeno (denegado), get de
  existente ajeno (denegado), get de existente propio
  (permitido), sin sesión (denegado), no aprobada (denegado),
  propietario (permitido, sin cambio) y equivalencia de list
  propio/ajeno (permitido/denegado).

Las únicas diferencias mecánicas de `bateria.mjs` respecto del
archivo oficial: el párrafo de cabecera del paquete, el nombre
del archivo de reglas, el proyecto ficticio
(`demo-hallazgo-c`), el bloque HC con su línea `SUBTOTAL
HALLAZGO C` y la línea `DESGLOSE` (que gana el tercer segmento;
`RESULTADO` suma los 120 casos).

## Cómo se ejecutaría (con autorización)

Empujar la rama `ci/hallazgo-c-bateria` (o lanzar el workflow
`hallazgo-c-bateria.yml` por workflow_dispatch). El workflow
instala Node 22 + Java 21 + firebase-tools 15.34.0, hace
`npm ci` en esta carpeta y corre el emulador oficial con
`node bateria.mjs`. Resultado esperado si el candidato es
correcto: `RESULTADO ... 120 PASS · 0 FAIL`, con subtotales
r4 70/0, F-A1 40/0 y Hallazgo C 10/0. Cualquier FAIL => exit 1.

---
CORRECCIÓN 2026-10-21 (tras la CI run 39636010660, 116 PASS · 4 FAIL): el bloque HALLAZGO C usa ahora la usuaria fresca «hcu» (aprobada, sembrada en seedHc). La primera versión usaba a «ana», a quien la regresión heredada deja approved:false (retirada del general, línea ~140; la renovación no restaura approved, como en la app). Los 4 FAIL (HC1/HC2/HC5/HC9a) eran ese artefacto de la batería, no el candidato. 110 casos heredados intactos; candidato intacto. Pendiente: autorización de Ronald para re-ejecutar la CI.
