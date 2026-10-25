# Batería CI del delta N-09 — permisos de biblioteca y plantillas

**Estado: ESCRITA Y LISTA — NO EJECUTADA en esta VM** (2026-10-23).
El emulador de Firestore está roto a nivel de transporte en esta
máquina (gRPC RST_STREAM / commit REST → 500 http2, reconfirmado de
primera mano esta misma noche por las baterías de la línea y de S-1);
la vía de ejecución es GitHub Actions, como la batería del candidato
de la línea (49/49 en Actions). No se afirma ningún resultado de esta
batería hasta correrla allí.

## Contenido
- `build-fixture.py` — genera `firestore.rules` (banco de pruebas)
  desde el candidato de la línea N-07 + el delta N-09 aplicado
  mecánicamente. El fixture NO es un candidato de publicación.
- `firestore.rules` — el fixture generado (regenerar con el script).
- `firebase.json` — emulador en 127.0.0.1:8080.
- `test-n09.mjs` — 40 casos de la matriz: admin/entrenador/usuario ×
  biblioteca × tres clases de plantilla × leer/crear/modificar/
  borrar, autoría veraz e inmutable, legado sin `visibility` tratado
  como fábrica, y la lectura del cliente asignado sobre fábrica
  (resolución de Ronald 2026-10-23 23:15 CDT).

## Ejecución (en un entorno con emulador sano, p. ej. Actions)
```bash
cd pruebas-reglas-n09
python3 build-fixture.py
npm init -y && npm i -D @firebase/rules-unit-testing firebase
firebase emulators:exec --only firestore --project ronbo-nutri-test 'node test-n09.mjs'
```
(Con el firebase-tools del proyecto: `~/workspace/ronbo-nutri/tools/fbt/node_modules/.bin/firebase`.)
