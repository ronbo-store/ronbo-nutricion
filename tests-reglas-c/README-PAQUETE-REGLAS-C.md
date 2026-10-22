# Paquete Reglas C — batería del candidato (2026-10-22)

Copia extendida de `tests-entrenamiento/` (que validó el candidato hoy vigente,
ruleset 1911f450, con 139 PASS): la MISMA batería byte a byte en los 139 casos
heredados, más el **bloque REGLAS C (RC1–RC12)** para la colección nueva
`body_type_ratings` — destino de los datos C decidido por Ronald el
2026-10-22 02:49 CDT (opción (b): colección propia de solo lectura).

- Candidato bajo prueba: `firestore.rules.candidato-reglas-c-2026-10-22.rules`
  = texto vivo verificado de 1911f450 + UN bloque `match` antes del catch-all.
- Casos RC: aprobada y propietario leen; no aprobada y sin sesión no leen;
  nadie escribe desde cliente (create/update/delete denegados, incluida la
  cuenta propietaria vía cliente). Usuarias frescas propias: «rc» / «rcno».
- Total esperado: **151 PASS · 0 FAIL**.

Validar ≠ publicar: la publicación de este candidato es un punto de control
separado que exige la autorización expresa de Ronald.
