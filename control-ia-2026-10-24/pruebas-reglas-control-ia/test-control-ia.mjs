// RONBO NUTRI — Batería de reglas del Control de IA (2026-10-24).
// Escrita para el despliegue del paquete (AUTH-2026-10-24-012): valida
// la extensión del bloque match /app_settings/{docId} a
// docId in ['approvals', 'ai_control'] del texto final compuesto
// (texto vivo tras la actividad + SOLO ese delta) contra el emulador
// oficial de Firestore. Usuarios FICTICIOS, proyecto ficticio.
// Nunca toca producción.
// Casos: lectura de ai_control con sesión (cliente, entrenador,
// incluso sin aprobar: la regla exige sesión, no aprobación),
// anónimos denegados; escritura (create/update/delete) SOLO del
// propietario/administrador; docIds fuera de la lista denegados
// incluso al propietario; list denegado; approvals INTACTO.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection
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

// ---- Semilla (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true, role: 'user', termsVersion: 'v4-2026-10-24' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Propietario Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', trainerUid: 'trainer1' });
  await setDoc(doc(db, 'users', 'clientC'), { ...base, name: 'Cliente sin aprobar', approved: false, trainerUid: 'trainer1' });
  await setDoc(doc(db, 'app_settings', 'approvals'), { maxPerTrainer: 5 });
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const cA = testEnv.authenticatedContext('clientA').firestore();
const cC = testEnv.authenticatedContext('clientC').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const AS = (db, id) => doc(db, 'app_settings', id);

// ---- Escritura: SOLO el propietario/administrador ----
await T('AIC-01 propietario CREA app_settings/ai_control {enabled:false}', setDoc(AS(owner, 'ai_control'), { enabled: false }), true);
await T('AIC-02 propietario ACTUALIZA ai_control (enabled:true)', updateDoc(AS(owner, 'ai_control'), { enabled: true }), true);
await T('AIC-03 cliente crea ai_control (doc nuevo con setDoc en otro id de la lista no aplica: recrea) — denegado', setDoc(AS(cA, 'ai_control'), { enabled: false }), false);
await T('AIC-04 cliente actualiza ai_control — denegado', updateDoc(AS(cA, 'ai_control'), { enabled: false }), false);
await T('AIC-05 entrenador actualiza ai_control — denegado', updateDoc(AS(tr1, 'ai_control'), { enabled: false }), false);
await T('AIC-06 anónimo actualiza ai_control — denegado', updateDoc(AS(anon, 'ai_control'), { enabled: false }), false);
await T('AIC-07 cliente borra ai_control — denegado', deleteDoc(AS(cA, 'ai_control')), false);
await T('AIC-08 propietario BORRA ai_control', deleteDoc(AS(owner, 'ai_control')), true);

// ---- Lectura: con sesión (la regla exige sesión, no aprobación) ----
// Se recrea el documento como propietario para las lecturas:
await setDoc(AS(owner, 'ai_control'), { enabled: false });
await T('AIC-09 cliente aprobado LEE ai_control', getDoc(AS(cA, 'ai_control')), true);
await T('AIC-10 entrenador LEE ai_control', getDoc(AS(tr1, 'ai_control')), true);
await T('AIC-11 usuario con sesión SIN aprobar lee ai_control (signedIn basta)', getDoc(AS(cC, 'ai_control')), true);
await T('AIC-12 anónimo lee ai_control — denegado', getDoc(AS(anon, 'ai_control')), false);
await T('AIC-13 LIST de app_settings denegado (cliente)', getDocs(collection(cA, 'app_settings')), false);

// ---- docIds fuera de la lista cerrada ----
await T('AIC-14 cliente lee app_settings/otro — denegado', getDoc(AS(cA, 'otro')), false);
await T('AIC-15 propietario crea app_settings/otro — denegado (lista cerrada)', setDoc(AS(owner, 'otro'), { x: 1 }), false);

// ---- approvals INTACTO ----
await T('AIC-16 approvals: cliente lee (con sesión)', getDoc(AS(cA, 'approvals')), true);
await T('AIC-17 approvals: propietario actualiza', updateDoc(AS(owner, 'approvals'), { maxPerTrainer: 3 }), true);
await T('AIC-18 approvals: cliente actualiza — denegado', updateDoc(AS(cA, 'approvals'), { maxPerTrainer: 99 }), false);

console.log(`\n===== CONTROL-IA/REGLAS: ${pass}/${pass + fail} PASS =====`);
if (failures.length) { console.log('FALLOS:', failures.join(' | ')); process.exit(1); }
await testEnv.cleanup();
process.exit(0);
