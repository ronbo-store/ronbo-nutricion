# Batería de reglas — delta APP INSTALADA VISIBLE (2026-10-26)

Serie AI (18 comprobaciones) contra el candidato de publicación:
texto vivo verificado `0c2ce641` (SHA-256 `e5e9452f…`) + SOLO el
delta `appInstall` (candidato SHA-256 `7900d3bb…`).

El delta admite en la rama `isSelf` del dueño (la del motor de
metas) el campo `appInstall` con forma cerrada
`{everInstalled: true, lastStandaloneAt == request.time}`: la señal
que el propio usuario escribe al abrir la app instalada. Nadie
puede escribirla por otro ni en falso; el entrenador no tiene rama;
el administrador conserva su rama de propietario.

Se ejecuta en GitHub Actions con el emulador oficial de Firestore
(proyecto ficticio `ronbo-nutri-test`), junto a las regresiones
Metas-L §L (45), Metas A/G (45), Biblioteca Comunitaria (45),
Línea Completa (49) y S-1 (17), todas contra el MISMO candidato.
