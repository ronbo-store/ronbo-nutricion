# Paquete CI — Batería del cuestionario v1 (autorización S2, 16/10/2026)

Rama técnica: `ci/cuestionario-bateria` (base: `5f27ede`, main).
Contenido: SOLO el workflow de validación y la carpeta
`tests-cuestionario/` (batería de 35 casos, reglas candidatas r2
SHA-256 6cba78ef…, firebase.json de emulador y dependencias
fijadas). No toca el código funcional (rama dev/cuestionario-v1,
commit 2649909). Diferencia con la batería original de 32 casos:
un único caso integral añadido al final (ciclo completo de la
Opción II), autorizado expresamente en S2; los 32 casos
originales se conservan íntegros y sin cambios.
El workflow se dispara con push a esta rama (GitHub no registra
workflow_dispatch desde ramas no predeterminadas — lección de
la Opción J de H-C1) y conserva la evidencia como artefacto.

Corrección S4 (16/10/2026, tras la auditoría S3): la batería
corrige los casos P1–P4 (retirada que elimina acceptedAt,
retirada positiva aislada en «sofia», flujo retirar→renovar de
H-C1 y escalada real P4 con ficticia no aprobada). Las reglas
del paquete no cambian (SHA-256 cb24c9af…). En la rama r2 (Paso A S7) el paquete lleva el candidato r2 (SHA-256 6cba78ef…) y los casos 34–35; conteo previsto: 35.
