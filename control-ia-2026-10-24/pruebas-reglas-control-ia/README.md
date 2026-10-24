# Batería de reglas — Control de IA (`app_settings/ai_control`)

18 casos (AIC-01…AIC-18) contra el emulador oficial de Firestore
(proyecto ficticio `ronbo-nutri-test`, usuarios ficticios; nunca toca
producción). Valida la extensión del bloque `match /app_settings/{docId}`
del texto final compuesto para el despliegue del Control de IA
(AUTH-2026-10-24-012): lectura de `ai_control` con sesión (cliente,
entrenador y usuario aún no aprobado — la regla exige `signedIn()`, no
aprobación), anónimos denegados, `list` denegado, escritura
(create/update/delete) SOLO del propietario/administrador
(`isOwnerUser()`), docIds fuera de la lista cerrada `['approvals',
'ai_control']` denegados incluso al propietario, y `approvals` intacto
(lectura con sesión, escritura solo administrador).

Ejecución: vía CI de GitHub Actions (workflow «Batería control-ia»),
la misma ruta que validó P8, S-1, el somatotipo y la actividad.
