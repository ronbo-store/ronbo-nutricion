# Batería de reglas — registro de actividad (activity_logs)

32 casos contra el emulador oficial de Firestore (proyecto ficticio
`ronbo-nutri-test`), escritos para el despliegue del paquete de
actividad (AUTH-2026-10-24-011). El `firestore.rules` de esta carpeta
es, durante la corrida CI, el texto final compuesto (vivo tras el
somatotipo + adiciones de actividad, SHA-256 `d94931bc…`).

Casos: creación válida del propietario, docId atado al contenido,
lista cerrada de claves y cotas (pasos/km/kcal/actividades/fecha),
createdAt de servidor, usuario no aprobado y anónimo denegados,
actualización idempotente con createdAt preservado, lecturas del
propio/entrenador asignado/administrador, terceros denegados en
lectura, lista y borrado.
