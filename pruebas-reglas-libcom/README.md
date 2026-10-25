# Batería CI del delta «Biblioteca comunitaria con aprobación»

**Estado: ESCRITA — se ejecuta en GitHub Actions** (rama
`ci/libcom-bateria`). El emulador de Firestore no corre en esta VM
(transporte gRPC roto, reconfirmado por las baterías anteriores); la
vía de ejecución es Actions, como en N-09 (62/62, run 40150023997).
No se afirma ningún resultado hasta leer la corrida allí.

## Contenido
- `firestore.rules` — el CANDIDATO de publicación del paquete,
  byte-idéntico a `preparacion-local/firestore.rules.candidato-biblioteca-comunitaria-2026-10-24.rules`
  (SHA-256 `75c2033f…`): texto vivo verificado `b135f2f8` + SOLO el
  delta de biblioteca comunitaria (bloque `exercise_library`).
- `firebase.json` — emulador en 127.0.0.1:8080.
- `test-libcom.mjs` — 45 casos: GET por documento y estado
  (fábrica/aprobado/pendiente/rechazado × admin/autor/otro
  entrenador/cliente/sin aprobar/anónimo), las consultas reales de la
  app (`libFetchClassDocs`) con conjuntos exactos, altas con la forma
  exacta (entrenador en pendiente sin firma; administrador aprobado
  con su firma) y sus abusos, edición del autor y reenvío tras
  rechazo, aprobación solo con firma, autoría inmutable, rastro
  obligatorio y borrados por rol y estado.

## Ejecución (en un entorno con emulador sano, p. ej. Actions)
```bash
cd pruebas-reglas-libcom
npm ci
firebase emulators:exec --only firestore --project ronbo-nutri-test 'node test-libcom.mjs'
```
