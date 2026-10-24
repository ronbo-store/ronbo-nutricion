// RONBO NUTRI — Batería de reglas de las preferencias de hobbies
// de actividad (2026-10-24). ESCRITA, NO EJECUTADA: su corrida
// pertenece al checkpoint de despliegue del paquete «rediseño
// flotante de actividad» y requiere la autorización por separado
// de Ronald. Valida el bloque match /preferences/{docId} del
// candidato preparacion-local/firestore.rules.candidato-
// actividad-flotante-2026-10-24.rules contra el emulador oficial.
// Usuarios FICTICIOS, proyecto ficticio. Nunca toca producción.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, serverTimestamp, Timestamp
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
const favDoc = (favorites, extra = {}) => ({ favorites, updatedAt: serverTimestamp(), ...extra });

// ---- Semilla (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true, role: 'usuario', termsVersion: 'v4-2026-10-24' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Propietario Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Asignado', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', trainerUid: 'trainer1' });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', trainerUid: 'trainer1' });
  // Documento previo de clientA para los casos de update/get/delete:
  await setDoc(doc(db, 'users', 'clientA', 'preferences', 'activities'),
    { favorites: ['correr'], updatedAt: CREATED });
});

const dbA = testEnv.authenticatedContext('clientA').firestore();
const dbB = testEnv.authenticatedContext('clientB').firestore();
const dbT = testEnv.authenticatedContext('trainer1').firestore();
const dbO = testEnv.authenticatedContext('owner1').firestore();
const dbAnon = testEnv.unauthenticatedContext().firestore();
const prefA = db => doc(db, 'users', 'clientA', 'preferences', 'activities');

// PREF-01: el titular crea su documento con la forma exacta.
await T('PREF-01 creación válida del titular (clientB, sin doc previo)',
  setDoc(doc(dbB, 'users', 'clientB', 'preferences', 'activities'), favDoc(['correr', 'natacion'])), true);
// PREF-02: el titular actualiza su documento.
await T('PREF-02 actualización válida del titular',
  setDoc(prefA(dbA), favDoc(['ciclismo', 'otro'])), true);
// PREF-03: el titular lee su documento.
await T('PREF-03 lectura válida del titular', getDoc(prefA(dbA)), true);
// PREF-04: otro cliente no puede leerlo.
await T('PREF-04 lectura de otro cliente denegada', getDoc(prefA(dbB)), false);
// PREF-05: el entrenador asignado no puede leerlo ni escribirlo.
await T('PREF-05 entrenador denegado (lectura y escritura)',
  (async () => { await assertFails(getDoc(prefA(dbT))); return setDoc(prefA(dbT), favDoc(['correr'])); })(), false);
// PREF-06: el propietario/administrador tampoco (es un dato del titular).
await T('PREF-06 propietario denegado (lectura y escritura)',
  (async () => { await assertFails(getDoc(prefA(dbO))); return setDoc(prefA(dbO), favDoc(['correr'])); })(), false);
// PREF-07: anónimo denegado.
await T('PREF-07 anónimo denegado', getDoc(prefA(dbAnon)), false);
// PREF-08: otro docId ('units') no está habilitado por este bloque.
await T('PREF-08 docId distinto de activities denegado (units)',
  setDoc(doc(dbA, 'users', 'clientA', 'preferences', 'units'), favDoc(['correr'])), false);
// PREF-09: clave de más deniega.
await T('PREF-09 clave extra denegada',
  setDoc(prefA(dbA), favDoc(['correr'], { theme: 'dark' })), false);
// PREF-10: un favorito fuera del catálogo cerrado deniega.
await T('PREF-10 favorito fuera del catálogo denegado',
  setDoc(prefA(dbA), favDoc(['correr', 'escalar'])), false);
// PREF-11: lista mayor que el catálogo (12) deniega.
await T('PREF-11 lista de 12 elementos denegada',
  setDoc(prefA(dbA), favDoc(['correr', 'correr', 'natacion', 'ciclismo', 'futbol', 'baloncesto', 'senderismo', 'baile', 'artes_marciales', 'transporte_activo', 'otro', 'ejercicios_en_casa'])), false);
// PREF-12: favorites que no es lista deniega; y updatedAt fijo (no servidor) deniega.
await T('PREF-12 tipos inválidos denegados (favorites texto; updatedAt fijo)',
  (async () => {
    await assertFails(setDoc(prefA(dbA), { favorites: 'correr', updatedAt: serverTimestamp() }));
    return setDoc(prefA(dbA), { favorites: ['correr'], updatedAt: CREATED });
  })(), false);
// PREF-13: el listado de la subcolección está denegado incluso al titular.
await T('PREF-13 list de preferences denegado',
  getDocs(collection(dbA, 'users', 'clientA', 'preferences')), false);
// PREF-14: el titular puede borrar su documento; otro no.
await T('PREF-14 borrado del titular permitido y de otro denegado',
  (async () => { await assertFails(deleteDoc(prefA(dbB))); return deleteDoc(prefA(dbA)); })(), true);

console.log(`\n===== REGLAS ACTIVIDAD FLOTANTE: ${pass}/${pass + fail} PASS =====`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' - ' + f)); process.exitCode = 1; }
await testEnv.cleanup();
