# Batería de reglas — preferencias de hobbies de actividad (users/{uid}/preferences/activities)

14 casos (PREF-01…PREF-14) contra el emulador oficial de Firestore
(proyecto ficticio `ronbo-nutri-test`), ESCRITOS para el paquete
«rediseño flotante de actividad» (2026-10-24). **NO ejecutados**:
su corrida pertenece al checkpoint de despliegue del paquete y
requiere la autorización por separado de Ronald, igual que la
publicación del candidato
`preparacion-local/firestore.rules.candidato-actividad-flotante-2026-10-24.rules`.

Durante la futura corrida CI, el `firestore.rules` de esta carpeta
será ese texto candidato (vivo verificado tras Control de IA,
ruleset `0ee08b7e`, + el único bloque `preferences`).

Casos: creación y actualización válidas del propio titular con la
forma exacta ({favorites, updatedAt} y nada más), lista cerrada
del catálogo de 11 tipos (un favorito ajeno deniega), tope de
tamaño, updatedAt de servidor obligatorio, lectura solo del
titular y solo del documento 'activities', listado denegado,
entrenador/administrador/tercero/anónimo denegados en lectura y
escritura, y borrado solo del titular.
