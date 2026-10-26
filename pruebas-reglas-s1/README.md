# Batería S-1 — mitigación del hallazgo S-1 (RONBO NUTRI)

**Estado:** preparada en desarrollo (2026-10-23). **No ejecutada en CI todavía** y **nada publicado**: Ronald autorizó implementar la mitigación (correo memphis, 2026-10-23 19:58 CDT); la publicación de reglas requiere su autorización expresa y separada. Informe: `../INFORME-S1-MITIGACION-DEV-2026-10-23.md`.

## Qué valida

El candidato `../preparacion-local/firestore.rules.candidato-s1-2026-10-23.rules` — copia byte-idéntica en `./firestore.rules` (SHA-256 `a292011ac23d2c20c211f41025ae4834cef67858e46fc71fb1ba769ef110477a`) = texto vivo verificado **e5efaef2** (SHA-256 `008444f1…f059`) + el delta S-1 SOLO: la rama de actualización de contenido de `users/{uid}/healthDeclarations/{declId}` exige además `get(users/{uid}).data.healthConsent.status == 'accepted'` leído en vivo en la misma operación.

## Casos (17)

| Caso | Escenario | Esperado |
|---|---|---|
| S1-01 | Actualizar contenido, consentimiento vigente | ✔ permite |
| S1-02 | Actualizar contenido, consentimiento **retirado** | ✘ deniega — **el hallazgo S-1** |
| S1-03 | Actualizar contenido, consentimiento **ausente** | ✘ deniega (fallo cerrado) |
| S1-04 | Actualizar contenido de otro cliente | ✘ deniega |
| S1-05 | Actualizar tocando clave prohibida (`version`) | ✘ deniega |
| S1-06 | Actualización mixta (contenido + `state`) | ✘ deniega |
| S1-07 | Actualizar contenido de declaración bloqueada | ✘ deniega |
| S1-08 | Entrenador lee la vigente, consentimiento aceptado | ✔ permite (sin cambio) |
| S1-09 | Entrenador lee la vigente, consentimiento retirado | ✘ deniega (sin cambio) |
| S1-10 | Crear declaración, consentimiento aceptado | ✔ permite (sin cambio) |
| S1-11 | Crear declaración, consentimiento retirado | ✘ deniega (sin cambio) |
| S1-12 | Crear declaración, sin consentimiento | ✘ deniega (sin cambio) |
| S1-13 | Cliente lee SU declaración con consentimiento retirado | ✔ permite (no afectado) |
| S1-14 | Cliente lista SUS declaraciones, consentimiento retirado | ✔ permite (no afectado) |
| S1-15 | **Bloquear** la vigente con el consentimiento retirado | ✔ permite (la rama de bloqueo NO gana la condición) |
| S1-16 | Actualizar contenido sin sesión | ✘ deniega |
| S1-17 | Cliente borra su declaración, consentimiento retirado | ✔ permite (borrado = derecho) |

**Control de la batería:** contra el texto vivo e5efaef2 (sustituyendo `./firestore.rules` por el texto vivo), S1-02 debe marcar FAIL (la escritura pasa: ese es el hallazgo). Si contra el candidato no da 17/17, el candidato no está listo.

## Cómo se ejecuta

Vía oficial del proyecto: **GitHub Actions** (el emulador local de esta VM tiene el transporte roto, verificado en varias piezas). Cuando la coordinación cree la rama `ci/s1-bateria` con esta carpeta en la raíz del repo y `s1-bateria.yml` en `.github/workflows/`, la batería corre con `workflow_dispatch` o al empujar la rama, y el resultado queda en el resumen del job (`RESULTADO S-1: 17/17 PASS · 0 FAIL`).

Equivalente local (donde el emulador funcione): `npm ci` en esta carpeta y `firebase emulators:exec --only firestore --project ronbo-nutri-test "node test-s1.mjs"` con firebase-tools 15.34.0 y Java 21.

**Intento local registrado (2026-10-23, único y acotado):** con el emulador standalone de esta VM (`cloud-firestore-emulator-v1.19.8.jar`, Java 21) levantado y respondiendo HTTP 200, la carga de reglas de `@firebase/rules-unit-testing` falló con `500 INTERNAL "http2 exception"` (el propio log del emulador registra `INTERNAL: http2 exception` al atender la petición) — el transporte local roto ya verificado en piezas anteriores, reconfirmado de primera mano para esta batería. Ningún caso llegó a ejecutarse en local; la vía válida es GitHub Actions. La sintaxis de la batería sí quedó verificada (`node --check`) y el `package-lock.json` generado permite `npm ci` en el runner.
