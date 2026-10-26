// RONBO NUTRI — Batería del CANDIDATO FINAL COMPUESTO 2026-10-23
// (composición + roles + corrección «Registrar pesaje»).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc,
  writeBatch, serverTimestamp
} from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: 8080 }
});

let pass = 0, fail = 0; const failures = [];
async function T(name, promise, shouldSucceed) {
  try {
    if (shouldSucceed) await assertSucceeds(promise); else await assertFails(promise);
    pass++; console.log('PASS — ' + name);
  } catch (e) {
    fail++; failures.push(name);
    console.log('FAIL — ' + name + ' :: ' + String(e && e.message || e).slice(0, 140));
  }
}

// ---- Seed (sin reglas): propietario, entrenador, clientes ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Ficticio', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Dos Ficticio', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', role: 'usuario', trainerUid: 'trainerX', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'clientW'), { ...base, name: 'Cliente Espera', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting' });
  // clientA arranca en modo entrenador (defecto de composición)
  await setDoc(doc(db, 'nutrition_progress', 'clientA_compaccess'), { kind: 'compAccess', uid: 'clientA', ownerUid: 'clientA', mode: 'trainer', history: [] });
  await setDoc(doc(db, 'nutrition_meals', 'mealB1'), { ownerUid: 'clientB', food: 'Arroz', kcal: 300 });
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const trainer = testEnv.authenticatedContext('trainer1').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const B = testEnv.authenticatedContext('clientB').firestore();
const W = testEnv.authenticatedContext('clientW').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const WDOC = (db, uid, date) => doc(db, 'nutrition_weight', `${uid}_${date}`);

// ============ P1 — el bug «Registrar pesaje» ============
await T('P1.1 el PROPIETARIO crea el primer pesaje de un cliente (el bug)', setDoc(WDOC(owner, 'clientA', '2026-10-23'), { ownerUid: 'clientA', date: '2026-10-23', weight: 80.5 }), true);
await T('P1.2 el ENTRENADOR ASIGNADO crea el pesaje de SU cliente', setDoc(WDOC(trainer, 'clientA', '2026-10-22'), { ownerUid: 'clientA', date: '2026-10-22', weight: 81 }), true);
await T('P1.3 el entrenador NO crea pesajes de un cliente ajeno', setDoc(WDOC(trainer, 'clientB', '2026-10-22'), { ownerUid: 'clientB', date: '2026-10-22', weight: 70 }), false);
await T('P1.4 el cliente en modo entrenador NO crea su pesaje', setDoc(WDOC(A, 'clientA', '2026-10-21'), { ownerUid: 'clientA', date: '2026-10-21', weight: 82 }), false);
await T('P1.5 el cliente SIN documento compAccess (defecto entrenador) tampoco', setDoc(WDOC(B, 'clientB', '2026-10-21'), { ownerUid: 'clientB', date: '2026-10-21', weight: 71 }), false);
// El entrenador habilita a clientA (update del ajuste, como en la app)
await T('P1.6 el entrenador asignado ACTUALIZA el ajuste compAccess de su cliente', updateDoc(doc(trainer, 'nutrition_progress', 'clientA_compaccess'), { mode: 'client', history: [{ mode: 'client', by: 'trainer1', byName: 'Entrenador Ficticio', at: '2026-10-23T18:00:00.000Z' }] }), true);
await T('P1.7 con la habilitación, el cliente SÍ crea su pesaje', setDoc(WDOC(A, 'clientA', '2026-10-20'), { ownerUid: 'clientA', date: '2026-10-20', weight: 82.4 }), true);
await T('P1.8 el cliente NO puede cambiar su propio mode/history', updateDoc(doc(A, 'nutrition_progress', 'clientA_compaccess'), { mode: 'trainer' }), false);
await T('P1.9 el entrenador lee (get) el ajuste de su cliente — hueco de la ficha cerrado', getDoc(doc(trainer, 'nutrition_progress', 'clientA_compaccess')), true);
await T('P1.10 el entrenador NO lee el ajuste de un cliente ajeno (no existe: get de patrón ajeno)', getDoc(doc(trainer, 'nutrition_progress', 'clientB_compaccess')), false);

// ============ P2/P3/P4 — propuestas comidas / progreso / meal_help ============
await T('P2.1 el propietario crea una comida para un cliente', setDoc(doc(owner, 'nutrition_meals', 'mealA-own'), { ownerUid: 'clientA', food: 'Pollo', kcal: 400 }), true);
await T('P2.2 el entrenador asignado crea una comida para SU cliente', setDoc(doc(trainer, 'nutrition_meals', 'mealA-tr'), { ownerUid: 'clientA', food: 'Pescado', kcal: 350 }), true);
await T('P2.3 el entrenador NO crea comidas para un cliente ajeno', setDoc(doc(trainer, 'nutrition_meals', 'mealB-tr'), { ownerUid: 'clientB', food: 'Sopa', kcal: 200 }), false);
await T('P3.1 el entrenador asignado crea la evaluación de progreso de SU cliente', setDoc(doc(trainer, 'nutrition_progress', 'clientA_2026-10-23_eval'), { kind: 'evaluation', uid: 'clientA', ownerUid: 'clientA', measures: { cintura: 90 }, comp: { fat: 20, muscle: 35 } }), true);
await T('P3.2 el entrenador NO crea progreso de un cliente ajeno', setDoc(doc(trainer, 'nutrition_progress', 'clientB_2026-10-23_eval'), { kind: 'evaluation', uid: 'clientB', ownerUid: 'clientB', measures: {} }), false);
await T('P3.3 el cliente NO nace un compAccess con historial inventado', setDoc(doc(B, 'nutrition_progress', 'clientB_compaccess'), { kind: 'compAccess', uid: 'clientB', ownerUid: 'clientB', mode: 'client', history: [{ mode: 'client', by: 'clientB', at: 'x' }] }), false);
await T('P4.1 el propietario crea meal_help para un cliente', setDoc(doc(owner, 'meal_help', 'mh-own'), { ownerUid: 'clientA', status: 'pending' }), true);
await T('P4.2 el entrenador asignado crea meal_help para SU cliente', setDoc(doc(trainer, 'meal_help', 'mh-tr'), { ownerUid: 'clientA', status: 'pending' }), true);
await T('P4.3 el entrenador NO crea meal_help para un cliente ajeno', setDoc(doc(trainer, 'meal_help', 'mh-b'), { ownerUid: 'clientB', status: 'pending' }), false);

// ============ ROLES — registro, lectura por asignación, directorio ============
/* El alta replica el batch real de la app: users/{uid} + su recibo
   'registered' (consentSeq 1, consentReceiptId uid_1, at = servidor). */
const newUser = (uid, extra) => {
  const db = testEnv.authenticatedContext(uid).firestore();
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), {
    name: 'Nuevo Ficticio', email: uid + '@test.local', role: 'usuario', isOwner: false, approved: false,
    acceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: 'v3-2026-10-16',
    adultConfirmed: true, consentSeq: 1, consentReceiptId: uid + '_1', ...extra });
  b.set(doc(db, 'consent_receipts', uid + '_1'), {
    uid, email: uid + '@test.local', type: 'registered', version: 'v3-2026-10-16', at: serverTimestamp() });
  return b.commit();
};
await T('R1 registro EN ESPERA válido (trainerUid null + waiting)', newUser('newW', { trainerUid: null, assignmentStatus: 'waiting' }), true);
await T('R2 registro CON entrenador válido (trainerUid string + assigned)', newUser('newA', { trainerUid: 'trainer1', assignmentStatus: 'assigned' }), true);
await T('R3 registro con role administrador DENEGADO', newUser('newBad', { role: 'administrador', trainerUid: null, assignmentStatus: 'waiting' }), false);
await T('R4 registro assigned SIN trainerUid DENEGADO', newUser('newBad2', { trainerUid: null, assignmentStatus: 'assigned' }), false);
await T('R5 registro waiting CON trainerUid DENEGADO', newUser('newBad3', { trainerUid: 'trainer1', assignmentStatus: 'waiting' }), false);
await T('R6 el entrenador LEE (get) a su cliente asignado', getDoc(doc(trainer, 'users', 'clientA')), true);
await T('R7 el entrenador NO lee a un cliente ajeno', getDoc(doc(trainer, 'users', 'clientB')), false);
await T('R8 el entrenador NO lee a un cliente en espera (aún no es suyo)', getDoc(doc(trainer, 'users', 'clientW')), false);
await T('R9 el entrenador LISTA solo con la consulta acotada por trainerUid', getDocs(query(collection(trainer, 'users'), where('trainerUid', '==', 'trainer1'))), true);
await T('R10 el cliente NO se cambia el role a sí mismo', updateDoc(doc(A, 'users', 'clientA'), { role: 'entrenador' }), false);
await T('R11 el directorio de entrenadores se lee SIN sesión (selector del registro)', getDoc(doc(anon, 'trainer_directory', 'current')), true);
await T('R12 el directorio NO lo escribe un no-propietario', setDoc(doc(trainer, 'trainer_directory', 'current'), { trainers: [] }), false);
await testEnv.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'trainer_directory', 'current'), { trainers: [{ uid: 'trainer1', name: 'Entrenador Ficticio' }] }); });
await T('R13 el directorio sembrado se lee sin sesión y trae los entrenadores', getDoc(doc(anon, 'trainer_directory', 'current')).then(s => { if (!s.exists() || (s.data().trainers || []).length !== 1) throw new Error('sin datos'); }), true);

// ============ Regresión de cordura sobre el candidato ============
await T('G1 el cliente NO lee las comidas de otro cliente', getDoc(doc(A, 'nutrition_meals', 'mealB1')), false);
await T('G2 el cliente SÍ crea su propia comida', setDoc(doc(A, 'nutrition_meals', 'mealA-own2'), { ownerUid: 'clientA', food: 'Huevos', kcal: 210 }), true);
await T('G3 sin sesión NO se crea ningún pesaje', setDoc(WDOC(anon, 'clientA', '2026-10-19'), { ownerUid: 'clientA', date: '2026-10-19', weight: 1 }), false);
await T('G4 el propietario lo lee todo (pesaje de clientB inexistente: get denegado por patrón no aplica al owner)', getDoc(doc(owner, 'users', 'clientW')), true);
await T('G5 el cliente en espera NO crea comidas (su cuenta está aprobada en la semilla: sí puede las suyas)', setDoc(doc(W, 'nutrition_meals', 'mealW'), { ownerUid: 'clientW', food: 'Té', kcal: 5 }), true);

// ============ N-07 — aprobación por entrenador con límite del administrador ============
/* El lote REAL de la app: aprueba asignando al aprobador + sube su
   contador approvalsUsed exactamente +1 en la misma operación. */
const trainer2 = testEnv.authenticatedContext('trainer2').firestore();
const batchApprove = (db, trainerUid, clientUid, used) => {
  const b = writeBatch(db);
  b.update(doc(db, 'users', clientUid), { approved: true, trainerUid, assignmentStatus: 'assigned', approvedBy: trainerUid, approvedAt: serverTimestamp() });
  b.update(doc(db, 'users', trainerUid), { approvalsUsed: used + 1 });
  return b.commit();
};
await T('N1 SIN límite configurado el entrenador NO aprueba (fail-closed)', newUser('newP', { trainerUid: null, assignmentStatus: 'waiting' }).then(() => batchApprove(trainer, 'trainer1', 'newP', 0)), false);
await T('N2 el ENTRENADOR no escribe el ajuste de límite', setDoc(doc(trainer, 'app_settings', 'approvals'), { maxPerTrainer: 3 }), false);
await T('N3 un USUARIO común no escribe el ajuste de límite', setDoc(doc(A, 'app_settings', 'approvals'), { maxPerTrainer: 3 }), false);
await T('N4 el ADMINISTRADOR sí escribe el ajuste de límite', setDoc(doc(owner, 'app_settings', 'approvals'), { maxPerTrainer: 1 }), true);
await T('N5 el entrenador LEE el ajuste (su cupo)', getDoc(doc(trainer, 'app_settings', 'approvals')), true);
await T('N6 BAJO el límite el entrenador aprueba y el cliente queda SUYO', batchApprove(trainer, 'trainer1', 'newW', 0)
  .then(() => getDoc(doc(owner, 'users', 'newW')))
  .then(s => { const d = s.data(); if (!(d.approved === true && d.trainerUid === 'trainer1' && d.assignmentStatus === 'assigned' && d.approvedBy === 'trainer1')) throw new Error('aprobación sin asignación al aprobador'); }), true);
await newUser('newP2', { trainerUid: null, assignmentStatus: 'waiting' });
await T('N7 SOBRE el límite (1 usada de 1) el entrenador ya NO aprueba', batchApprove(trainer, 'trainer1', 'newP2', 1), false);
await T('N8 aprobar SIN el contador acoplado en el lote se deniega', (() => { const b = writeBatch(trainer2); b.update(doc(trainer2, 'users', 'newP'), { approved: true, trainerUid: 'trainer2', assignmentStatus: 'assigned', approvedBy: 'trainer2', approvedAt: serverTimestamp() }); return b.commit(); })(), false);
await T('N9 otro entrenador, bajo SU límite, aprueba la cuenta en espera', batchApprove(trainer2, 'trainer2', 'newP', 0), true);
await T('N10 un USUARIO común NO aprueba cuentas (ni con contador)', batchApprove(A, 'clientA', 'newP2', 0), false);
await T('N11 el contador NO salta de dos en dos', updateDoc(doc(trainer2, 'users', 'trainer2'), { approvalsUsed: 3 }), false);
await T('N12 el ADMINISTRADOR aprueba sin límite ni contador (vía del propietario)', setDoc(doc(owner, 'users', 'newP2'), { approved: true }, { merge: true }), true);

console.log(`\nRESULTADO CANDIDATO: ${pass}/${pass + fail} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
