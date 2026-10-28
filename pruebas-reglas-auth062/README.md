# Batería CI — delta AUTH-062 / mailLang (contra el CANDIDATO)

Suite del delta mínimo de reglas de AUTH-062: añade `'mailLang'` a la lista
cerrada de la rama de perfil inofensivo de `match /users/{uid}`, con el valor
cerrado a `['en','es']` cuando el campo cambia.

- `firestore.rules` = candidato de publicación: texto vivo verificado
  `41eac78d` (SHA-256 `c01fc199…`) + SOLO ese delta (candidato SHA-256
  `4237d9cc…`).
- 14 comprobaciones (A1–A12 + D1/D2) contra el emulador oficial de
  Firestore (proyecto ficticio `ronbo-nutri-test`, usuarios ficticios).
- La suite gemela `pruebas-reglas-auth062-vivo/` corre los mismos casos
  contra el texto vivo con las expectativas del delta invertidas
  (A1/A2/A5/D1): el contraste prueba que el delta abre justo el guardado
  de la preferencia de idioma de correo, ni más ni menos.
- Este directorio SOLO valida el texto; no publica reglas ni toca
  producción.
