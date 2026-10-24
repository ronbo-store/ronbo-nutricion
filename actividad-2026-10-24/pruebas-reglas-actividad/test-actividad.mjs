// RONBO NUTRI — Batería de reglas del registro de actividad (2026-10-24).
// Escrita para el despliegue del paquete (AUTH-2026-10-24-011): valida
// el bloque match /activity_logs/{docId} + helpers actKeysOk/actShapeOk
// del texto final compuesto (texto vivo tras el somatotipo + SOLO las
// adiciones de actividad) contra el emulador oficial de Firestore.
// Usuarios FICTICIOS, proyecto ficticio. Nunca toca producción.
// Casos: propietario CRUD válido, formas inválidas rechazadas, docId
// atado al contenido, lectura del entrenador asignado y del
// administrador, terceros denegados.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, serverTimestamp, Timestamp
} from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1', port: 8080
  }
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

const CREATED = Timestamp.fromMillis(1792700000000);
const actDoc = (ownerUid, date, extra = {}) => ({
  ownerUid, date, steps: 8000, stepKcal: 320.5, stepKm: 5.6,
  weightKgUsed: 80, weightDateUsed: '2026-10-20',
  activities: [{ type: 'caminata', minutes: 30, intensity: 'moderada', kcal: 150 }],
  kcalExtraTotal: 150, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra
});

// ---- Semilla (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true, role: 'user', termsVersion: 'v3-2026-10-16' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Propietario Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Asignado', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Ajeno', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', trainerUid: 'trainer1' });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', trainerUid: 'trainer1' });
  await setDoc(doc(db, 'users', 'clientC'), { ...base, name: 'Cliente C sin aprobar', approved: false, trainerUid: 'trainer1' });
  // Documento previo de clientA para los casos de update/delete:
  await setDoc(doc(db, 'activity_logs', 'clientA_2026-10-20'),
    actDoc('clientA', '2026-10-20', { createdAt: CREATED, updatedAt: CREATED }));
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const tr2 = testEnv.authenticatedContext('trainer2').firestore();
const cA = testEnv.authenticatedContext('clientA').firestore();
const cB = testEnv.authenticatedContext('clientB').firestore();
const cC = testEnv.authenticatedContext('clientC').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const L = (db, id) => doc(db, 'activity_logs', id);

// ============ Creación: forma válida e inválidas ============
await T('ACT-01 el propietario crea su documento válido (docId = ownerUid_fecha) → PERMITIDO',
  setDoc(L(cA, 'clientA_2026-10-24'), actDoc('clientA', '2026-10-24')), true);
await T('ACT-02 docId NO atado al contenido (fecha del docId ≠ date) → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-25'), actDoc('clientA', '2026-10-24')), false);
await T('ACT-03 ownerUid distinto del autor → DENEGADO',
  setDoc(L(cA, 'clientB_2026-10-24'), actDoc('clientB', '2026-10-24')), false);
await T('ACT-04 clave EXTRA fuera de la lista cerrada → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), actDoc('clientA', '2026-10-26', { notaLibre: 'x' })), false);
await T('ACT-05 falta una clave obligatoria (steps) → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), (() => { const d = actDoc('clientA', '2026-10-26'); delete d.steps; return d; })()), false);
await T('ACT-06 steps por encima de la cota (200001) → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), actDoc('clientA', '2026-10-26', { steps: 200001 })), false);
await T('ACT-07 steps negativos → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), actDoc('clientA', '2026-10-26', { steps: -1 })), false);
await T('ACT-08 steps no enteros → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), actDoc('clientA', '2026-10-26', { steps: 1.5 })), false);
await T('ACT-09 kcalExtraTotal por encima de la cota (50001) → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), actDoc('clientA', '2026-10-26', { kcalExtraTotal: 50001 })), false);
await T('ACT-10 más de 20 actividades → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), actDoc('clientA', '2026-10-26', { activities: Array.from({ length: 21 }, () => ({ type: 'x', minutes: 10 })) })), false);
await T('ACT-11 fecha con formato inválido → DENEGADO',
  setDoc(L(cA, 'clientA_2026-1-1'), actDoc('clientA', '2026-1-1')), false);
await T('ACT-12 fecha fuera de rango (2019) → DENEGADO',
  setDoc(L(cA, 'clientA_2019-12-31'), actDoc('clientA', '2019-12-31')), false);
await T('ACT-13 createdAt distinto del tiempo del servidor → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-26'), actDoc('clientA', '2026-10-26', { createdAt: CREATED })), false);
await T('ACT-14 usuario NO aprobado crea → DENEGADO',
  setDoc(L(cC, 'clientC_2026-10-24'), actDoc('clientC', '2026-10-24')), false);
await T('ACT-15 anónimo crea → DENEGADO',
  setDoc(L(anon, 'clientA_2026-10-27'), actDoc('clientA', '2026-10-27')), false);

// ============ Actualización (idempotencia del guardado) ============
await T('ACT-16 el propietario actualiza su documento (createdAt preservado) → PERMITIDO',
  updateDoc(L(cA, 'clientA_2026-10-20'), { steps: 9100, stepKcal: 360, updatedAt: serverTimestamp() }), true);
await T('ACT-17 actualizar cambiando createdAt → DENEGADO',
  setDoc(L(cA, 'clientA_2026-10-20'), actDoc('clientA', '2026-10-20', { createdAt: serverTimestamp(), updatedAt: serverTimestamp() })), false);
await T('ACT-18 otro cliente actualiza el documento ajeno → DENEGADO',
  updateDoc(L(cB, 'clientA_2026-10-20'), { steps: 1, updatedAt: serverTimestamp() }), false);
await T('ACT-19 el entrenador actualiza el documento del cliente → DENEGADO',
  updateDoc(L(tr1, 'clientA_2026-10-20'), { steps: 1, updatedAt: serverTimestamp() }), false);

// ============ Lectura ============
await T('ACT-20 el propietario lee su documento → PERMITIDO',
  getDoc(L(cA, 'clientA_2026-10-20')), true);
await T('ACT-21 el propietario pide un documento propio inexistente con su patrón → PERMITIDO (Hallazgo C)',
  getDoc(L(cA, 'clientA_2026-01-01')), true);
await T('ACT-22 otro cliente lee el documento ajeno → DENEGADO',
  getDoc(L(cB, 'clientA_2026-10-20')), false);
await T('ACT-23 el entrenador ASIGNADO lee el documento del cliente → PERMITIDO',
  getDoc(L(tr1, 'clientA_2026-10-20')), true);
await T('ACT-24 el entrenador NO asignado lee → DENEGADO',
  getDoc(L(tr2, 'clientA_2026-10-20')), false);
await T('ACT-25 el ADMINISTRADOR (propietario de la plataforma) lee → PERMITIDO',
  getDoc(L(owner, 'clientA_2026-10-20')), true);
await T('ACT-26 anónimo lee → DENEGADO',
  getDoc(L(anon, 'clientA_2026-10-20')), false);
await T('ACT-27 el propietario lista SOLO lo suyo → PERMITIDO',
  getDocs(query(collection(cA, 'activity_logs'), where('ownerUid', '==', 'clientA'))), true);
await T('ACT-28 el entrenador asignado lista lo de su cliente → PERMITIDO',
  getDocs(query(collection(tr1, 'activity_logs'), where('ownerUid', '==', 'clientA'))), true);
await T('ACT-29 un tercero lista lo ajeno → DENEGADO',
  getDocs(query(collection(cB, 'activity_logs'), where('ownerUid', '==', 'clientA'))), false);

// ============ Borrado ============
await T('ACT-30 un tercero borra el documento ajeno → DENEGADO',
  deleteDoc(L(cB, 'clientA_2026-10-20')), false);
await T('ACT-31 el ADMINISTRADOR borra un documento → PERMITIDO',
  deleteDoc(L(owner, 'clientA_2026-10-24')), true);
await T('ACT-32 el propietario borra su documento → PERMITIDO',
  deleteDoc(L(cA, 'clientA_2026-10-20')), true);

console.log(`\nRESULTADO ACTIVIDAD-REGLAS: ${pass}/${pass + fail} PASS`);
if (failures.length) console.log('FAIL: ' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail === 0 ? 0 : 1);
