# Mi Nutrición · Privado

App personal y privada de seguimiento nutricional de Ronald Borges.

- **URL:** https://ronbo-store.github.io/ronbo-nutricion/
- **Acceso:** solo el dueño (login con Firebase Authentication). Sin registro público.
- **Datos:** Firestore del proyecto `ronbo-store-admin`, colecciones `nutrition_meals` y
  `nutrition_weight`, con reglas que solo permiten leer/escribir al dueño (`isOwner == true`).
- **Privacidad:** el repositorio es público (requisito de GitHub Pages gratuito), pero la app
  no muestra nada sin iniciar sesión y las reglas de Firestore niegan todo acceso no autorizado.
  No hay datos personales en el código.

## Estructura de datos

`nutrition_meals/{autoId}`: `{ date, meal, food, qty, kcal, prot, carb, sugar, fat, notes, createdAt }`
`nutrition_weight/{YYYY-MM-DD}`: `{ date, weight, fat, muscle, notes, updatedAt }`

## Importar historial

El botón "⤓ Importar CSV" (una sola vez) carga el `registro.csv` de la hoja anterior.
Formato esperado: `Fecha,Comida,Alimento,Cantidad,Kcal,Proteína (g),Carbos (g),Grasa (g),Notas,Azúcares (g)`.
