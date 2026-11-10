// RONBO FIT — Batería gemela del delta de reglas «CHECK-IN SEMANAL»
// (AUTH-2026-11-10-367) contra el emulador oficial de Firestore
// (proyecto ficticio ronbo-nutri-test, sin datos reales).
// El delta: colección NUEVA weekly_checkins con forma cerrada —
// el alumno crea/edita lo suyo sin revisar; su entrenador
// asignado o administración lo marca revisado; nadie más entra.
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas f7d47e8b + delta).
//   ESPERA_NUEVO=false → VIVAS f7d47e8b: weekly_checkins no
//                        existe → TODO se deniega (catch-all) y
//                        la regresión (hitos, peticiones) idéntica.
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync } from 'node:fs';

const N = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
async function caso(nombre, promesa, debePasar) {
  try {
    if (debePasar) await assertSucceeds(promesa);
    else await assertFails(promesa);
    console.log(`OK    ${nombre} → ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
  } catch (e) {
    const crudo = String((e && e.message) || e).replace(/\s+/g, ' ');
    fallos.push('FALLO: ' + nombre);
    console.log(`FALLO ${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'} — ${crudo.slice(0, 300)}`);
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

const DUENO = 'dueno', ALU = 'alumnaS', ENT = 'entrenadorE', OTRA = 'alumnaT', ENT2 = 'entrenadorX', NOAPR = 'noAprobada';
const WS = '2026-11-09'; // lunes de la semana del fixture
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } = F;

function ctx(uid) { return testEnv.withSecurityRulesDisabled(async c => c.firestore()); }
async function db(uid) {
  return uid ? testEnv.authenticatedContext(uid).firestore() : testEnv.unauthenticatedContext().firestore();
}
async function seed() {
  const d = await ctx();
  const U = (id, data) => setDoc(doc(d, 'users', id), data);
  await U(DUENO, { isOwner: true, approved: true, role: 'administrador', name: 'Dueño' });
  await U(ENT, { approved: true, role: 'entrenador', name: 'Entrenador' });
  await U(ENT2, { approved: true, role: 'entrenador', name: 'Otro entrenador' });
  await U(ALU, { approved: true, role: 'usuario', name: 'Alumna', trainerUid: ENT, assignmentStatus: 'assigned' });
  await U(OTRA, { approved: true, role: 'usuario', name: 'Otra alumna', trainerUid: ENT2, assignmentStatus: 'assigned' });
  await U(NOAPR, { approved: false, role: 'usuario', name: 'Sin aprobar', trainerUid: ENT });
}
function chkDoc(uid, ws, over) {
  return Object.assign({
    uid, weekStart: ws, trainerUid: ENT,
    feel: 4, energy: 3, sleep: 5, hunger: 2,
    trainPlan: 'part', mealPlan: 'yes', note: 'Semana dura en el trabajo.',
    reviewedBy: null, reviewedAt: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }, over || {});
}
const id = (uid, ws) => uid + '_' + ws;

/* ---------- creación ---------- */
await seed();
{
  const dS = await db(ALU);
  await caso('C1 alumna crea su check-in válido', setDoc(doc(dS, 'weekly_checkins', id(ALU, WS)), chkDoc(ALU, WS)), N);
  await caso('C2 escala 0 denegada', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, '2026-11-16', { feel: 0 })), false);
  await caso('C3 escala 6 denegada', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, '2026-11-16', { energy: 6 })), false);
  await caso('C4 escala decimal denegada', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, '2026-11-16', { sleep: 2.5 })), false);
  await caso('C5 campo de más denegado', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, '2026-11-16', { peso: 80 })), false);
  await caso('C6 campo de menos denegado', (() => { const v = chkDoc(ALU, '2026-11-16'); delete v.hunger; return setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), v); })(), false);
  await caso('C7 id ≠ uid+semana denegado', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, WS)), false);
  await caso('C8 nace ya revisado denegado', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, '2026-11-16', { reviewedBy: ENT })), false);
  await caso('C9 plan fuera del trío denegado', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, '2026-11-16', { trainPlan: 'casi' })), false);
  await caso('C10 nota >500 denegada', setDoc(doc(dS, 'weekly_checkins', id(ALU, '2026-11-16')), chkDoc(ALU, '2026-11-16', { note: 'x'.repeat(501) })), false);
  await caso('C11 crear para otra denegado', setDoc(doc(dS, 'weekly_checkins', id(OTRA, WS)), chkDoc(OTRA, WS)), false);
  const dU = await db(NOAPR);
  await caso('C12 sin aprobar no crea', setDoc(doc(dU, 'weekly_checkins', id(NOAPR, WS)), chkDoc(NOAPR, WS)), false);
  const dAnon = await db(null);
  await caso('C13 anónimo no crea', setDoc(doc(dAnon, 'weekly_checkins', id(ALU, '2026-11-23')), chkDoc(ALU, '2026-11-23')), false);
  // Segunda respuesta la misma semana: es un UPDATE del mismo doc.
  await caso('C14 segunda respuesta = edita la misma (sin revisar)', updateDoc(doc(dS, 'weekly_checkins', id(ALU, WS)), { feel: 5, note: 'Mejor de lo que pensaba.', updatedAt: serverTimestamp() }), N);
  await caso('C15 la alumna no se marca revisada', updateDoc(doc(dS, 'weekly_checkins', id(ALU, WS)), { reviewedBy: ALU, reviewedAt: serverTimestamp() }), false);
  await caso('C16 la alumna no cambia la semana', updateDoc(doc(dS, 'weekly_checkins', id(ALU, WS)), { weekStart: '2026-11-02', updatedAt: serverTimestamp() }), false);
}

/* ---------- lectura ---------- */
{
  const dS = await db(ALU), dT = await db(ENT), dT2 = await db(ENT2), dO = await db(OTRA), dD = await db(DUENO), dAnon = await db(null);
  await caso('L1 la dueña lee lo suyo', getDoc(doc(dS, 'weekly_checkins', id(ALU, WS))), N);
  await caso('L2 su entrenador asignado lee', getDoc(doc(dT, 'weekly_checkins', id(ALU, WS))), N);
  await caso('L3 otro entrenador NO lee', getDoc(doc(dT2, 'weekly_checkins', id(ALU, WS))), false);
  await caso('L4 otra alumna NO lee', getDoc(doc(dO, 'weekly_checkins', id(ALU, WS))), false);
  await caso('L5 el propietario lee', getDoc(doc(dD, 'weekly_checkins', id(ALU, WS))), N);
  await caso('L6 anónimo NO lee', getDoc(doc(dAnon, 'weekly_checkins', id(ALU, WS))), false);
}

/* ---------- la marca de revisión ---------- */
{
  const dT = await db(ENT), dT2 = await db(ENT2), dS = await db(ALU);
  await caso('R1 otro entrenador NO marca', updateDoc(doc(dT2, 'weekly_checkins', id(ALU, WS)), { reviewedBy: ENT2, reviewedAt: serverTimestamp() }), false);
  await caso('R2 el entrenador no edita respuestas al marcar', updateDoc(doc(dT, 'weekly_checkins', id(ALU, WS)), { reviewedBy: ENT, reviewedAt: serverTimestamp(), feel: 1 }), false);
  await caso('R3 su entrenador marca revisado', updateDoc(doc(dT, 'weekly_checkins', id(ALU, WS)), { reviewedBy: ENT, reviewedAt: serverTimestamp() }), N);
  await caso('R4 ya revisado no se re-marca', updateDoc(doc(dT, 'weekly_checkins', id(ALU, WS)), { reviewedBy: ENT, reviewedAt: serverTimestamp() }), false);
  await caso('R5 ya revisado no se edita', updateDoc(doc(dS, 'weekly_checkins', id(ALU, WS)), { feel: 2, updatedAt: serverTimestamp() }), false);
  const dD = await db(DUENO);
  await caso('R6 el borrado es solo del propietario', deleteDoc(doc(dD, 'weekly_checkins', id(ALU, WS))), N);
  await caso('R7 la alumna no borra', deleteDoc(doc(dS, 'weekly_checkins', id(ALU, WS))), false);
}

/* ---------- sin entrenador: se guarda sin destinatario ---------- */
{
  await seed();
  const d = await ctx();
  await setDoc(doc(d, 'users', 'sola'), { approved: true, role: 'usuario', name: 'Sin entrenador', trainerUid: null, assignmentStatus: 'waiting' });
  const dSola = await db('sola');
  await caso('S1 sin entrenador crea con trainerUid null', setDoc(doc(dSola, 'weekly_checkins', id('sola', WS)), chkDoc('sola', WS, { trainerUid: null })), N);
  const dT = await db(ENT);
  await caso('S2 ningún entrenador lo lee (no es suyo)', getDoc(doc(dT, 'weekly_checkins', id('sola', WS))), false);
}

/* ---------- regresión: lo de siempre se comporta igual ---------- */
{
  await seed();
  const dS = await db(ALU), dT = await db(ENT);
  const ms = { uid: ALU, slug: 'semana1', k: 'firstWeek', at: WS, createdAt: serverTimestamp() };
  await caso('G1 regresión hitos: la alumna crea su hito', setDoc(doc(dS, 'milestones', ALU + '_semana1'), ms), true);
  const treq = { studentUid: ALU, studentName: 'Alumna', trainerUid: ENT, type: 'question', days: null, message: '¿Puedo mover el día de pierna?', status: 'sent', createdAt: serverTimestamp(), createdISO: WS, reply: null, resolvedAt: null, resolvedBy: null };
  await caso('G2 regresión peticiones: la alumna pide a su entrenador', setDoc(doc(dS, 'trainer_requests', 'req1'), treq), true);
  await caso('G3 regresión peticiones: su entrenador resuelve', updateDoc(doc(dT, 'trainer_requests', 'req1'), { status: 'resolved', reply: 'Claro.', resolvedAt: serverTimestamp(), resolvedBy: ENT }), true);
  await caso('G4 catch-all intacto: colección inventada denegada', setDoc(doc(dS, 'coleccion_inventada', 'x'), { a: 1 }), false);
}

await testEnv.cleanup();
if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n')); console.log('\nRESULTADO: ' + fallos.length + ' FALLOS'); process.exit(1); }
console.log('\nRESULTADO: SIN FALLOS' + (N ? ' (candidata)' : ' (control vivas)'));
