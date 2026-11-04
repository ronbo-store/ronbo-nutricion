// RONBO FIT — Batería del delta de reglas «ALERTA DE LA VÍSPERA»
// (eveAlert en users/{uid}) contra el emulador oficial de Firestore
// (proyecto ficticio, sin secretos ni datos reales). Suite GEMELA:
//   ESPERA_NUEVO=true  → contra la CANDIDATA: eveAlert se comporta
//                        como se diseñó (espejo de daySummary).
//   ESPERA_NUEVO=false → contra el texto VIVO 9d70b6c9: eveAlert NO
//                        está admitido (la lista cerrada lo rechaza)
//                        y los vecinos quedan idénticos.
// Salida: fallos.txt solo si hay fallos (anotaciones del workflow).
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

/* En CI (workflow) el emulador lo levanta firebase-tools con el
   firestore.rules copiado a su sitio y las reglas viajan en la
   inicialización. En local puede correrse contra un emulador ya
   levantado con --rules=<archivo> poniendo REGLAS_PRECARGADAS=1:
   entonces NO se reenvían las reglas (el emulador de esta VM
   responde 503 «io exception» al PUT de reglas; con las reglas
   precargadas la suite corre igual). */
const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    ...(process.env.REGLAS_PRECARGADAS === '1' ? {} : { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8') }),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'propietario', ALUMNO = 'alumnoS', ENTRENADOR = 'entrenadorT';
const dbD = testEnv.withSecurityRulesDisabled(async () => {});
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'propietario', approved: true, isOwner: true });
  await setDoc(doc(db, 'users', ALUMNO), { name: 'Alumna', role: 'alumno', approved: true, trainerUid: ENTRENADOR });
  await setDoc(doc(db, 'users', ENTRENADOR), { name: 'Entrenador', role: 'entrenador', approved: true });
});
const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();
const dbAnon = () => testEnv.unauthenticatedContext().firestore();
const { doc, updateDoc } = await import('firebase/firestore');
const eve = (db, extra = {}) => updateDoc(doc(db, 'users', ALUMNO), extra);

/* --- El interruptor: la propia persona sobre su documento --- */
await caso('P1 alumno guarda eveAlert { on: false } (apagar)', eve(dbDe(ALUMNO), { eveAlert: { on: false } }), ESPERA_NUEVO);
await caso('P2 alumno guarda eveAlert { on: true } (encender)', eve(dbDe(ALUMNO), { eveAlert: { on: true } }), ESPERA_NUEVO);
await caso('P3 alumno guarda eveAlert {} (mapa vacío: sin «on» no hay forma que violar)', eve(dbDe(ALUMNO), { eveAlert: {} }), ESPERA_NUEVO);
await caso('P4 alumno guarda eveAlert junto a otro campo inofensivo (name)', eve(dbDe(ALUMNO), { eveAlert: { on: true }, name: 'Alumna' }), ESPERA_NUEVO);
await caso('N1 eveAlert con «on» no booleano', eve(dbDe(ALUMNO), { eveAlert: { on: 'si' } }), false);
await caso('N2 eveAlert con clave extra en el mapa', eve(dbDe(ALUMNO), { eveAlert: { on: true, otro: 1 } }), false);
await caso('N3 eveAlert que no es un mapa', eve(dbDe(ALUMNO), { eveAlert: 'si' }), false);
await caso('N4 eveAlert mezclado con un campo vetado (approved)', eve(dbDe(ALUMNO), { eveAlert: { on: true }, approved: false }), false);
await caso('N5 el ENTRENADOR escribe el eveAlert de su alumna', eve(dbDe(ENTRENADOR), { eveAlert: { on: false } }), false);
await caso('N6 sin autenticar escribe eveAlert ajeno', eve(dbAnon(), { eveAlert: { on: false } }), false);

/* --- Vecinos intactos en AMBAS suites --- */
await caso('V1 (regresión) el resumen diario completo sigue admitido', eve(dbDe(ALUMNO), { daySummary: { on: true, time: '05:00', tz: 'America/Chicago' } }), true);
await caso('V2 (regresión) mailLang sigue admitido', eve(dbDe(ALUMNO), { mailLang: 'es' }), true);
await caso('V3 (sin cambios) el propietario escribe eveAlert en un alumno por su rama general', eve(dbDe(DUENO), { eveAlert: { on: false } }), true);

if (fallos.length) writeFileSync(new URL('./fallos.txt', import.meta.url), fallos.join('\n') + '\n');
else { try { rmSync(new URL('./fallos.txt', import.meta.url)); } catch {} }
console.log(`\n${fallos.length === 0 ? 'TODO OK' : 'FALLOS: ' + fallos.length} (ESPERA_NUEVO=${ESPERA_NUEVO})`);
await testEnv.cleanup();
process.exit(fallos.length ? 1 : 0);
