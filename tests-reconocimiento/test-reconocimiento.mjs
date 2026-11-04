// RONBO FIT — Batería del delta de reglas «RECONOCIMIENTO POR
// AVANCE» (colección NUEVA milestones) contra el emulador oficial
// de Firestore (proyecto ficticio, sin secretos ni datos reales).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → contra la CANDIDATA: los hitos se
//                        comportan como se diseñaron.
//   ESPERA_NUEVO=false → contra el texto VIVO b9a9aeb3: la
//                        colección NO existe (todo denegado por
//                        el catch-all) y los vecinos quedan
//                        idénticos.
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

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    ...(process.env.REGLAS_PRECARGADAS === '1' ? {} : { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8') }),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', ENT = 'entrenadorT', ENT2 = 'entrenadorU';
const ALU = 'alumnaS', ALU2 = 'alumnoS2', AJENO = 'ajenoX';
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: true, isOwner: true });
  await setDoc(doc(db, 'users', ENT), { name: 'Entrenador', role: 'entrenador', approved: true });
  await setDoc(doc(db, 'users', ENT2), { name: 'Entrenador Dos', role: 'entrenador', approved: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true, trainerUid: ENT });
  await setDoc(doc(db, 'users', ALU2), { name: 'Alumno Dos', role: 'usuario', approved: true, trainerUid: ENT });
  await setDoc(doc(db, 'users', AJENO), { name: 'Ajeno', role: 'usuario', approved: true, trainerUid: ENT2 });
  /* Hitos semilla (para lecturas e inmutabilidad) */
  await setDoc(doc(db, 'milestones', ALU + '_firstWeek'), { uid: ALU, slug: 'firstWeek', k: 'firstWeek', at: '2026-10-12' });
  await setDoc(doc(db, 'milestones', ALU + '_pr:E012:kg:75'), { uid: ALU, slug: 'pr:E012:kg:75', k: 'pr', at: '2026-11-02', ex: 'E012', name: 'Aperturas con mancuernas', kg: 75, prevKg: 72.5, unit: 'kg' });
});
const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();
const dbAnon = () => testEnv.unauthenticatedContext().firestore();
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, collection, where, serverTimestamp, Timestamp } = F;

const msBase = (extra = {}) => ({ uid: ALU, slug: 'foodDay', k: 'foodDay', at: '2026-11-03', createdAt: serverTimestamp(), ...extra });
const mkMs = (db, id, data) => setDoc(doc(db, 'milestones', id), data);

/* --- milestones: creación --- */
await caso('M1 la alumna crea su hito foodDay válido', mkMs(dbDe(ALU), ALU + '_foodDay', msBase()), ESPERA_NUEVO);
await caso('M2 la alumna crea su marca personal válida', mkMs(dbDe(ALU), ALU + '_pr:E013:kg:80',
  { uid: ALU, slug: 'pr:E013:kg:80', k: 'pr', at: '2026-11-03', ex: 'E013', name: 'Jalón al pecho', kg: 80, prevKg: 77.5, unit: 'kg', createdAt: serverTimestamp() }), ESPERA_NUEVO);
await caso('M3 hito con uid ajeno', mkMs(dbDe(ALU), ALU2 + '_foodDay', msBase({ uid: ALU2 })), false);
await caso('M4 id que no es uid_slug', mkMs(dbDe(ALU), ALU + '_otro', msBase()), false);
await caso('M5 clave extra (peso corporal)', mkMs(dbDe(ALU), ALU + '_foodDay', msBase({ peso: 84 })), false);
await caso('M6 marca sin kg', mkMs(dbDe(ALU), ALU + '_pr:E013:kg:80',
  { uid: ALU, slug: 'pr:E013:kg:80', k: 'pr', at: '2026-11-03', ex: 'E013', name: 'Jalón al pecho', prevKg: 77.5, unit: 'kg', createdAt: serverTimestamp() }), false);
await caso('M7 marca con prevKg >= kg', mkMs(dbDe(ALU), ALU + '_pr:E013:kg:80',
  { uid: ALU, slug: 'pr:E013:kg:80', k: 'pr', at: '2026-11-03', ex: 'E013', name: 'Jalón al pecho', kg: 80, prevKg: 80, unit: 'kg', createdAt: serverTimestamp() }), false);
await caso('M8 hito no-marca CON kg (dato fuera de forma)', mkMs(dbDe(ALU), ALU + '_foodDay', msBase({ kg: 80 })), false);
await caso('M9 tipo de hito desconocido', mkMs(dbDe(ALU), ALU + '_foodDay', msBase({ k: 'racha' })), false);
await caso('M10 fecha con formato malo', mkMs(dbDe(ALU), ALU + '_foodDay', msBase({ at: '03/11/2026' })), false);
await caso('M11 createdAt que no es la hora del servidor', mkMs(dbDe(ALU), ALU + '_foodDay', msBase({ createdAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) })), false);
await caso('M12 sin autenticar crea un hito', mkMs(dbAnon(), ALU + '_foodDay', msBase()), false);
await caso('M13 el entrenador crea un hito PARA su alumna', mkMs(dbDe(ENT), ALU + '_streak4',
  { uid: ALU, slug: 'streak4', k: 'streak4', at: '2026-11-02', createdAt: serverTimestamp() }), false);
await caso('M14 el dueño crea un hito para una alumna', mkMs(dbDe(DUENO), ALU + '_streak4',
  { uid: ALU, slug: 'streak4', k: 'streak4', at: '2026-11-02', createdAt: serverTimestamp() }), false);

/* --- milestones: lectura --- */
await caso('M15 la alumna lee su hito', getDoc(doc(dbDe(ALU), 'milestones', ALU + '_firstWeek')), ESPERA_NUEVO);
await caso('M16 la alumna lista sus hitos', getDocs(query(collection(dbDe(ALU), 'milestones'), where('uid', '==', ALU))), ESPERA_NUEVO);
await caso('M17 su entrenador asignado lee el hito', getDoc(doc(dbDe(ENT), 'milestones', ALU + '_firstWeek')), ESPERA_NUEVO);
await caso('M18 su entrenador asignado lista sus hitos', getDocs(query(collection(dbDe(ENT), 'milestones'), where('uid', '==', ALU))), ESPERA_NUEVO);
await caso('M19 otro entrenador lee el hito', getDoc(doc(dbDe(ENT2), 'milestones', ALU + '_firstWeek')), false);
await caso('M20 un alumno ajeno lee el hito', getDoc(doc(dbDe(AJENO), 'milestones', ALU + '_firstWeek')), false);
await caso('M21 el dueño lee el hito', getDoc(doc(dbDe(DUENO), 'milestones', ALU + '_firstWeek')), ESPERA_NUEVO);
await caso('M22 sin autenticar lee el hito', getDoc(doc(dbAnon(), 'milestones', ALU + '_firstWeek')), false);
await caso('M23 la alumna lista hitos de OTRA alumna', getDocs(query(collection(dbDe(ALU), 'milestones'), where('uid', '==', ALU2))), false);

/* --- milestones: inmutabilidad --- */
await caso('M24 la alumna edita su hito (inmutable)', updateDoc(doc(dbDe(ALU), 'milestones', ALU + '_firstWeek'), { at: '2026-10-13' }), false);
await caso('M25 la alumna borra su hito', deleteDoc(doc(dbDe(ALU), 'milestones', ALU + '_firstWeek')), false);
await caso('M26 el dueño borra un hito (limpieza administrativa)', deleteDoc(doc(dbDe(DUENO), 'milestones', ALU + '_pr:E012:kg:75')), ESPERA_NUEVO);
await caso('M27 el entrenador borra el hito de su alumna', deleteDoc(doc(dbDe(ENT), 'milestones', ALU + '_firstWeek')), false);

/* --- vecinos intactos (ambas suites) --- */
await caso('V1 vecino retos: una alumna crea su reto individual', setDoc(doc(dbDe(ALU), 'challenges', 'vec-1'), {
  kind: 'individual', catalogId: 'train4-7', metric: 'train_days', target: 4,
  periodDays: 7, startDate: '2026-11-04', endDate: '2026-11-10',
  createdBy: ALU, ownerUid: ALU, groupScope: '', title: '', rewardText: '',
  createdAt: serverTimestamp(),
}), true);
await caso('V2 vecino usuarios: la alumna lee su propio documento', getDoc(doc(dbDe(ALU), 'users', ALU)), true);

if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n')); console.log(`\n${fallos.length} FALLOS`); process.exit(1); }
console.log('\nSIN FALLOS');
await testEnv.cleanup();
