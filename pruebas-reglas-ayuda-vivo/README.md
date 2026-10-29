# Batería CI — delta «Ayuda pública sin iniciar sesión — Opción B» (contraste vivo)

La MISMA suite AYUDA (15 casos P1–P15) contra el texto VIVO
de las reglas (ruleset 8def2007, SHA-256 `ff4691cd…` —
texto vivo al desplegar, 2026-10-29), con
las expectativas del delta INVERTIDAS: en el texto vivo
`faq_public` no está en ninguna lista, así que los casos que
el delta abre (P1/P6 lectura pública, P9/P10/P13 escritura y
borrado del propietario) se esperan DENEGADOS. Todos los
demás casos se comportan igual en ambos textos: el contraste
prueba que el delta es justo lo que cambia, ni más ni menos.

Este directorio SOLO valida el texto; no publica reglas ni
despliega nada. Sin secretos ni credenciales de producción.
