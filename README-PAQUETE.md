# Paquete CI de H-C1 — batería oficial de reglas (GitHub Actions)

Estado: PREPARADO EN LOCAL. Sin commits, sin push, sin ejecutar.
Su publicación requiere una autorización expresa posterior (Etapa 2)
y su ejecución un clic manual de Ronald en GitHub (Etapa 3).

## Qué contiene
- `.github/workflows/hc1-bateria.yml` — el workflow (solo
  `workflow_dispatch`, permisos `contents: read`).
- `tests-hc1/bateria.mjs` — la batería oficial de 31 casos
  (@firebase/rules-unit-testing), sin modificar.
- `tests-hc1/firestore.rules.propuesta-renovacion` — las reglas
  PROPUESTAS corregidas (B3-1 + B1 + B2), copia exacta del archivo del
  proyecto. NUNCA las reglas de producción.
- `tests-hc1/firebase.json` — emulador local en 127.0.0.1:8799.
- `tests-hc1/package.json` + `package-lock.json` — dependencias fijadas.

## Seguridad por construcción
- Proyecto ficticio `demo-fase1-hc1` en el único comando de Firebase.
- Sin credenciales, secretos, cuentas de servicio ni tokens.
- Sin pasos de despliegue ni de publicación de reglas.
- GitHub Pages sigue sirviendo solo `main`; esta rama no se despliega.

## Cómo se ejecutaría (cuando se autorice)
1. Etapa 2: commit único con estos archivos en la rama
   `ci/hc1-bateria` y push con la deploy key.
2. Etapa 3: Ronald pulsa «Run workflow» en la pestaña Actions.
3. El resultado por caso queda en el log y en el artefacto
   `evidencia-bateria-hc1` (7 días).
