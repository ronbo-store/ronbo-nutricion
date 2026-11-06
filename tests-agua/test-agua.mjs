// RONBO FIT — Batería gemela del delta de reglas «EL AGUA DE LOS
// ALUMNOS SE GUARDA» (AUTH-2026-11-06-277) contra el emulador oficial
// de Firestore (proyecto ficticio ronbo-nutri-test, sin secretos ni
// datos reales). El delta: en nutrition_water, las ramas de alumno
// aceptan también el campo studentUid — el que la app escribe — junto
// al alumnoUid de siempre (create, get/list, update y delete).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (326e414e + delta): los 4 casos del
//                        ciclo de vida con studentUid pasan.
//   ESPERA_NUEVO=false → VIVO 326e414e: esos 4 casos se deniegan (el
//                        defecto) y todo lo demás queda idéntico.
// Salida: fallos.txt solo si hay fallos.
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
async function caso(nombre, promesa, debePasar) {
  try {
    if (debePasar) await assertSucceeds(promesa);
    else await assertFails(promesa);
    console.log(`OK    ${nombre} → ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
  } catch (e) {
    fallos.push(`${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
    console.log(`FALLO ${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', ALU = 'alumnaS', OTRA = 'alumnaT', NOAP = 'noAprobada';
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, deleteDoc, serverTimestamp } = F;

// La carga útil EXACTA de la app (app.js: setDoc con merge):
const cargaApp = (uid, ml) => ({
  studentUid: uid, date: '2026-11-06', ml, byUid: uid,
  byRole: 'alumno', updatedAt: serverTimestamp(),
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: false, isOwner: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', OTRA), { name: 'Otra', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', NOAP), { name: 'Pendiente', role: 'usuario', approved: false });
  // Semilla con la forma studentUid (en el mundo vivo es un dato que no
  // pudo nacer desde la app: la siembra salta las reglas, como en la
  // batería de la fibra; sirve para aislar get/update/delete).
  await setDoc(doc(db, 'nutrition_water', ALU + '_2026-11-06'),
    { studentUid: ALU, date: '2026-11-06', ml: 250, byUid: ALU, byRole: 'alumno' });
  await setDoc(doc(db, 'nutrition_water', OTRA + '_2026-11-06'),
    { studentUid: OTRA, date: '2026-11-06', ml: 300, byUid: OTRA, byRole: 'alumno' });
  // Semilla legada con alumnoUid (la forma que la regla siempre aceptó).
  await setDoc(doc(db, 'nutrition_water', ALU + '_2026-11-05'),
    { alumnoUid: ALU, date: '2026-11-05', ml: 500, byUid: ALU, byRole: 'alumno' });
});

const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();
const dbAnon = () => testEnv.unauthenticatedContext().firestore();

// — Los 4 casos del delta (ciclo de vida completo con studentUid) —
await caso('W1 crear propio con studentUid (carga de la app)',
  setDoc(doc(dbDe(ALU), 'nutrition_water', ALU + '_2026-11-02'), cargaApp(ALU, 250), { merge: true }),
  ESPERA_NUEVO);
await caso('W2 leer propio con studentUid',
  getDoc(doc(dbDe(ALU), 'nutrition_water', ALU + '_2026-11-06')),
  ESPERA_NUEVO);
await caso('W3 actualizar propio con studentUid (merge, total sumado)',
  setDoc(doc(dbDe(ALU), 'nutrition_water', ALU + '_2026-11-06'), cargaApp(ALU, 500), { merge: true }),
  ESPERA_NUEVO);
await caso('W4 borrar propio con studentUid',
  deleteDoc(doc(dbDe(ALU), 'nutrition_water', ALU + '_2026-11-06')),
  ESPERA_NUEVO);

// — Invariables: idénticas en ambos mundos —
await caso('W5 crear con studentUid AJENO se deniega',
  setDoc(doc(dbDe(ALU), 'nutrition_water', OTRA + '_2026-11-02'), cargaApp(OTRA, 250), { merge: true }),
  false);
await caso('W6 no aprobada con su propio studentUid se deniega',
  setDoc(doc(dbDe(NOAP), 'nutrition_water', NOAP + '_2026-11-06'), cargaApp(NOAP, 250), { merge: true }),
  false);
await caso('W7 leer el agua de OTRA se deniega',
  getDoc(doc(dbDe(ALU), 'nutrition_water', OTRA + '_2026-11-06')),
  false);
await caso('W8 actualizar el agua de OTRA se deniega',
  setDoc(doc(dbDe(ALU), 'nutrition_water', OTRA + '_2026-11-06'), cargaApp(OTRA, 999), { merge: true }),
  false);
await caso('W9 el dueño crea por su rama (sin mirar campos)',
  setDoc(doc(dbDe(DUENO), 'nutrition_water', DUENO + '_2026-11-06'), cargaApp(DUENO, 250), { merge: true }),
  true);
await caso('W10 crear propio con alumnoUid (legado) sigue permitido',
  setDoc(doc(dbDe(ALU), 'nutrition_water', ALU + '_2026-11-04'),
    { alumnoUid: ALU, date: '2026-11-04', ml: 250, byUid: ALU, byRole: 'alumno', updatedAt: serverTimestamp() }, { merge: true }),
  true);
await caso('W11 leer propio con alumnoUid (legado) sigue permitido',
  getDoc(doc(dbDe(ALU), 'nutrition_water', ALU + '_2026-11-05')),
  true);
await caso('W12 sin sesión crear se deniega',
  setDoc(doc(dbAnon(), 'nutrition_water', ALU + '_2026-11-01'), cargaApp(ALU, 250), { merge: true }),
  false);

try { rmSync(new URL('./fallos.txt', import.meta.url)); } catch {}
if (fallos.length) {
  writeFileSync(new URL('./fallos.txt', import.meta.url), fallos.join('\n') + '\n');
  console.log(`\n${fallos.length} FALLOS`);
  process.exitCode = 1;
} else {
  console.log('\nSIN FALLOS (12 casos)');
}
await testEnv.cleanup();
