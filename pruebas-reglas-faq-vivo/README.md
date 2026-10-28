# Batería CI — delta FAQ / Ayuda (CONTRASTE contra el texto vivo)

Los mismos 14 casos + 2 verificaciones de datos de
`../pruebas-reglas-faq/`, corridos contra el texto VIVO verificado
`13c0a457` (SHA-256 `c7d039bb…`), SIN el delta: la lectura de
`app_settings/faq` por usuarios con sesión (F2/F3/F4), su escritura
por el propietario (F8/F9/F10) y el flujo del dato (D1/D2) deben
salir DENEGADOS. El contraste prueba que el delta de 2 líneas es
justo lo que desbloquea el paquete FAQ, ni más ni menos.

Este directorio SOLO valida el texto; no publica reglas ni despliega
nada. Sin secretos ni credenciales de producción.
