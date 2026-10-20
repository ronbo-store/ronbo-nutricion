# Paquete — batería del candidato aislado CONFIRMACIONES

**Estado: ESCRITA, NO EJECUTADA (19/10/2026).** Nadie ha corrido esta
batería: ni en local, ni en GitHub Actions. No se ha creado ninguna
rama, no se ha empujado nada y no se ha publicado ninguna regla.
Ejecutarla requiere autorización expresa de Ronald; publicar el
candidato, otra autorización posterior y separada.

## Qué valida

El candidato aislado derivado de r4:

- Original: `../preparacion-local/firestore.rules.candidato-confirmaciones-aislado-2026-10-19.rules`
  — SHA-256 `30f71a20803593d3d39402b538297aae4100024e4ed3d50d8cc70bd2eae1dc9f` (586 líneas).
- Copia exacta en esta carpeta: `firestore.rules.candidato-confirmaciones`
  (mismo SHA-256; verificar ambos antes de cualquier corrida).
- Base intacta: r4 en producción,
  `../preparacion-local/firestore.rules.propuesta-r4`
  — SHA-256 `323ef2d994cb6e309607e14adffa935e71b7f252629acead63e86cba95fbdd2d` (468 líneas).

El candidato cambia SOLO dos cosas respecto a r4 (ver el análisis
`../ANALISIS-INTEGRIDAD-CONFIRMACION-2026-10-19.md`):

- **[CONF-1]** `nutrition_progress`: ningún documento puede nacer ni
  quedar con `confirmedBy` / `confirmedAt` / `adjustments` ni con un
  status que afirme confirmación.
- **[CONF-2]** Colección nueva `progress_confirmations/{ownerUid}_{date}`:
  la confirmación del entrenador vive solo ahí; escribir (crear /
  ajustar / borrar) es solo de `isOwnerUser()`; leer, el propietario
  y el dueño del análisis.

## Casos: 35 contados (cualquier FAIL ⇒ exit 1)

Mismo patrón técnico que las baterías r3/r4: `@firebase/rules-unit-testing`
contra el emulador oficial de Firestore, proyecto ficticio
`demo-confirmaciones-v1`, fixtures sembrados con las reglas
desactivadas y casos secuenciales numerados C01–C35 en `bateria.mjs`.

| Requisito del encargo | Casos |
|---|---|
| 1 · Aprobado crea su análisis SIN campos de confirmación → permitido | C01 |
| 2 · Aprobado intenta crearlo CON `confirmedBy` ajeno → denegado | C02 (+ C03 solo `adjustments`, C04 solo status «confirmada») |
| 3 · Aprobado intenta actualizar su análisis añadiendo/modificando la confirmación → denegado | C05 (updateDoc), C06 (setDoc, ruta de la app), C07 (borrar el campo con `deleteField` en doc legado), C22 (actualizar la confirmación real) |
| 3c · Borrar la confirmación → denegado | C07, C23, C35 |
| 4 · Aprobado edita su análisis sin tocar confirmaciones → permitido | C09 |
| 5 · El propietario (`isOwnerUser`) crea la confirmación → permitido | C11 (+ C12 ajustar; C13–C15: atribución a otro, fecha literal e id incoherente, denegados) |
| 6 · Un tercer aprobado lee/escribe la confirmación de otro → denegado | C18, C19, C20 (+ C21 ni para sí mismo; C16/C17 lecturas propias permitidas; C24/C25 anónimo denegado; C26 propietario lee) |
| 7 · Regresión fotos de progreso desplegadas | C28–C34 (+ C10 puerta de aprobación intacta) |
| Integral final | C35: la usuaria borra su análisis (su derecho) y la confirmación sobrevive, sigue legible por el propietario e imborrable por ella |
| Purga del propietario | C27, C08 (ni el propietario escribe confirmaciones dentro de `nutrition_progress`) |

Nota sobre C07: comprueba en el emulador real la semántica de
`diff().affectedKeys()` frente a `deleteField()` — es una de las
cosas que esta batería existe para demostrar, no un supuesto.

## Contenido de esta carpeta

- `bateria.mjs` — los 35 casos.
- `firestore.rules.candidato-confirmaciones` — copia exacta del candidato.
- `firebase.json` — emulador en 127.0.0.1:8799, reglas = el candidato.
- `package.json` / `package-lock.json` — mismas dependencias fijadas
  que la batería r3 (`@firebase/rules-unit-testing` ^6, `firebase` ^13,
  `firebase-admin` ^14.5); en el lock solo cambia el nombre del paquete.
- `workflow-confirmaciones-bateria.yml.draft` — plantilla del workflow
  de Actions (copia adaptada del de r4). Es una PLANTILLA local: no
  está en ningún `.github/workflows/` ni en ninguna rama.

## Plan de ejecución (para el día que Ronald lo autorice)

1. **Autorización expresa de Ronald** para validar el candidato
   (esta batería) — sin ella, nada de lo siguiente.
2. Verificar SHA-256 del candidato y de su copia en esta carpeta
   (deben coincidir con los de arriba).
3. Ruta habitual del proyecto (la de r3/r4): crear la rama técnica
   `ci/confirmaciones-bateria` desde el repo, con SOLO el paquete de
   validación — carpeta `tests-confirmaciones/` (el contenido de esta
   carpeta, con el candidato renombrado si se sigue el nombre de esta
   carpeta) y el workflow de la plantilla colocado en
   `.github/workflows/confirmaciones-bateria.yml` (su `push` a esa
   rama dispara la corrida; GitHub no registra `workflow_dispatch`
   desde ramas no predeterminadas — lección ya aprendida en H-C1).
4. La corrida usa el emulador oficial con el proyecto ficticio
   `demo-confirmaciones-v1`: sin secretos, sin credenciales de
   producción, sin despliegue. Node 22, Java 21 (temurin),
   `npm ci`, `firebase-tools@15.34.0`, igual que r4.
5. Evidencia: el workflow conserva `resultado-bateria.txt` y
   `firestore-debug.log` como artefacto. El candidato solo se declara
   validado con una corrida oficial **35 PASS · 0 FAIL** y artefacto
   preservado en esta carpeta (p. ej. `evidencia-actions-AAAA-MM-DD/`).
6. **Publicar las reglas es un checkpoint aparte**, posterior y con su
   propia autorización expresa de Ronald — como fue r4. Esta batería
   no lo autoriza ni lo prepara.

Alternativa local (si Ronald la prefiere a Actions): con el emulador
corriendo en 127.0.0.1:8799, `node bateria.mjs` en esta carpeta
reproduce la misma batería; la ruta oficial del proyecto, no
obstante, ha sido siempre la de Actions.
