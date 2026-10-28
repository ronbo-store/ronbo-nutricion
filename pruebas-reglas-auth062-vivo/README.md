# Batería CI — contraste AUTH-062 / mailLang (contra el TEXTO VIVO)

Los MISMOS 14 casos de `pruebas-reglas-auth062/` contra el texto vivo
verificado `41eac78d` (SHA-256 `c01fc199…`), con las expectativas del
delta invertidas (A1/A2/A5 y D1 deben DENEGARSE aquí): el contraste
prueba que es el delta — y solo el delta — lo que abre el guardado de
`mailLang` por la rama del perfil inofensivo.

- Este directorio SOLO valida el texto; no publica reglas ni toca
  producción.
