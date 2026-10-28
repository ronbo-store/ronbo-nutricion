# Batería CI — delta AUTH-2026-10-28-071 (candidato)

Suite FDCAM (10 casos F1–F10) contra el CANDIDATO de reglas:
texto AUTH-068 ya publicado (SHA-256 `9d7dd0b3…`) + SOLO el
delta `fdCamAt` de AUTH-071 (candidato SHA-256 `b71d4fd4…`):

- `fdCamAt` entra en la lista cerrada de la rama de perfil
  inofensivo del propio documento, con guarda de tipo cadena.
- El create del registro lo prohíbe: nadie nace interesado.

El paquete añade el campo `users/{uid}.fdCamAt`: la marca de
interés del propio alumno en la puerta falsa «Camera Coach»
(tarjeta en su vista de entrenamiento; diseño aprobado por
Ronald el 2026-10-28). La suite gemela
(`../pruebas-reglas-fdcam-vivo/`) corre los MISMOS 10 casos
contra el texto vivo con las expectativas del delta
invertidas: F1/F2/F9 pasan a denegadas y F6 a admitida.

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
