# Batería de reglas — módulo de somatotipo (Nivel 2), 2026-10-23

**Estado: escrita, NO ejecutada contra producción; las reglas NO están publicadas.**
Candidato validado: `../firestore.rules.candidato-somatotipo-2026-10-23.rules`
(SHA-256 `8acc24852e929d4ab4520a10300bb12720a840d57e775c705b7c56675ad93127`),
delta propio y separado — nunca compuesto con el candidato de la línea en curso.
Copia byte-idéntica del candidato en `./firestore.rules` (la consume el emulador).

## Qué prueba (36 casos, `test-somatotipo.mjs`)

- **Consentimiento acoplado (BT-01…BT-06):** otorgar `bodyTypeConsent` exige su
  recibo `bodytype-granted` en el mismo lote (sin recibo o con tipo equivocado,
  denegado); re-otorgar estando aceptado, denegado; propietario y entrenador
  jamás fijan el consentimiento ajeno.
- **Creación (BT-07…BT-16):** solo entrenador asignado o propietario, solo con
  el consentimiento del cliente activo en ese momento; la estimación nace
  `shared=false`, con categoría válida (3), forma exacta de campos y
  `requestedBy` = quien escribe.
- **Lectura (BT-17…BT-25):** personal asignado/propietario con consentimiento
  activo; el cliente solo lo compartido con él (GET y LIST filtrado);
  entrenador no asignado, otro cliente y anónimo, denegados.
- **Inmutabilidad (BT-26…BT-29):** la única actualización posible es
  compartir/dejar de compartir por el personal; editar la categoría o borrar,
  denegado para todos.
- **★ Revocación entre el análisis y la lectura (BT-30…BT-36):** tras revocar
  con su recibo `bodytype-withdrawn`, se cierran lectura del entrenador,
  lectura del cliente, creación y compartir; al renovar
  (`bodytype-renewed`) el acceso vuelve — el documento nunca se borró
  (su supresión física o retención queda pendiente de D-06).

## Control

Contra el texto vivo `e5efaef2` (sin el delta), toda operación del módulo cae
en el catch-all: los casos «PERMITIDO» fallan y la batería sale roja — detecta
la ausencia del delta. Los casos de revocación pasan trivialmente en ese
control porque ya todo está denegado.

## Ejecución

Vía CI del proyecto (GitHub Actions), como las baterías P8/S-1: ver
`somatotipo-bateria.yml`. El transporte local del emulador en esta VM está
roto (precedente S-1), así que la corrida válida es la de Actions, en una
rama `ci/somatotipo-bateria` que la coordinación creará cuando Ronald
autorice la composición/publicación — **este paquete no se ha ejecutado
todavía en CI** y nada de él está publicado.
