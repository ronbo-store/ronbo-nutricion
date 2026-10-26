// RONBO NUTRI — Batería S-1 (mitigación, 2026-10-23).
// Valida el candidato firestore.rules.candidato-s1-2026-10-23.rules
// (copia byte-idéntica en ./firestore.rules, SHA-256 a292011a…):
// la rama de actualización de CONTENIDO de la declaración de
// salud vigente re-verifica EN VIVO el consentimiento específico
// del propio usuario; retirado o ausente ⇒ deniega (fallo cerrado).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
// Control esperado: contra el texto vivo e5efaef2 (sin el delta),
// el caso S1-02 PASA la escritura (ese es exactamente el hallazgo
// S-1) y la batería marca FAIL — la batería detecta el hallazgo.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, serverTimestamp
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

// ---- Semilla (sin reglas): propietario y tres clientes ----
// clientOK: consentimiento específico ACEPTADO, declaración v2
//   vigente y v1 bloqueada (historial).
// clientWD: consentimiento específico RETIRADO pero su declaración
//   v1 sigue 'active' — el residuo exacto que describe S-1 (p. ej.
//   un retiro que no pasó por el lote atómico de la app).
// clientNO: SIN campo healthConsent (ausente) y declaración activa.
// clientX: otro cliente con su consentimiento aceptado (no-self).
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Entrenador Ficticio', isOwner: true });
  await setDoc(doc(db, 'users', 'clientOK'), { ...base, name: 'Cliente OK',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp() } });
  await setDoc(doc(db, 'users', 'clientWD'), { ...base, name: 'Cliente Retirado',
    healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', acceptedAt: serverTimestamp(), withdrawnAt: serverTimestamp() } });
  await setDoc(doc(db, 'users', 'clientNO'), { ...base, name: 'Cliente Sin Consentimiento' });
  await setDoc(doc(db, 'users', 'clientX'), { ...base, name: 'Cliente Ajeno',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp() } });
  const decl = (state, version) => ({ state, version,
    conditions: ['Asma / problemas respiratorios'], details: 'detalle inicial',
    declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: state === 'blocked' ? serverTimestamp() : null });
  await setDoc(doc(db, 'users', 'clientOK', 'healthDeclarations', 'v2'), decl('active', 2));
  await setDoc(doc(db, 'users', 'clientOK', 'healthDeclarations', 'v1'), decl('blocked', 1));
  await setDoc(doc(db, 'users', 'clientWD', 'healthDeclarations', 'v1'), decl('active', 1));
  await setDoc(doc(db, 'users', 'clientNO', 'healthDeclarations', 'v1'), decl('active', 1));
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const ok = testEnv.authenticatedContext('clientOK').firestore();
const wd = testEnv.authenticatedContext('clientWD').firestore();
const no = testEnv.authenticatedContext('clientNO').firestore();
const x = testEnv.authenticatedContext('clientX').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const D = (db, uid, id) => doc(db, 'users', uid, 'healthDeclarations', id);
const contentUpdate = (db, uid, id) => updateDoc(D(db, uid, id),
  { conditions: ['Diabetes'], details: 'detalle actualizado', updatedAt: serverTimestamp() });

// ============ Núcleo S-1: actualización de contenido ============
await T('S1-01 actualizar contenido con consentimiento VIGENTE → permite',
  contentUpdate(ok, 'clientOK', 'v2'), true);
await T('S1-02 actualizar contenido con consentimiento RETIRADO → deniega (el hallazgo S-1)',
  contentUpdate(wd, 'clientWD', 'v1'), false);
await T('S1-03 actualizar contenido SIN consentimiento (ausente) → deniega, fallo cerrado',
  contentUpdate(no, 'clientNO', 'v1'), false);
await T('S1-04 actualizar contenido de OTRO cliente → deniega (isSelf intacto)',
  contentUpdate(x, 'clientOK', 'v2'), false);
await T('S1-05 actualizar tocando una clave prohibida (version) → deniega (hasOnly intacto)',
  updateDoc(D(ok, 'clientOK', 'v2'), { conditions: [], details: 'x', version: 99, updatedAt: serverTimestamp() }), false);
await T('S1-06 actualización mixta (contenido + state) → deniega (ninguna rama la cubre)',
  updateDoc(D(ok, 'clientOK', 'v2'), { conditions: ['Diabetes'], state: 'blocked', updatedAt: serverTimestamp() }), false);
await T('S1-07 actualizar contenido de una declaración BLOQUEADA → deniega (inmutable)',
  contentUpdate(ok, 'clientOK', 'v1'), false);

// ============ Usos que ya verificaban en el texto vivo ============
await T('S1-08 el entrenador LEE la vigente con consentimiento aceptado → permite (sin cambio)',
  getDoc(D(owner, 'clientOK', 'v2')), true);
await T('S1-09 el entrenador LEE la vigente con consentimiento retirado → deniega (sin cambio)',
  getDoc(D(owner, 'clientWD', 'v1')), false);
await T('S1-10 CREAR declaración con consentimiento aceptado → permite (sin cambio)',
  setDoc(D(ok, 'clientOK', 'v3'), { state: 'active', version: 3, conditions: [], details: '', declaredAt: serverTimestamp() }), true);
await T('S1-11 CREAR declaración con consentimiento retirado → deniega (sin cambio)',
  setDoc(D(wd, 'clientWD', 'v2'), { state: 'active', version: 2, conditions: [], details: '', declaredAt: serverTimestamp() }), false);
await T('S1-12 CREAR declaración sin consentimiento → deniega (sin cambio)',
  setDoc(D(no, 'clientNO', 'v2'), { state: 'active', version: 2, conditions: [], details: '', declaredAt: serverTimestamp() }), false);

// ============ Usos NO afectados por el delta ============
await T('S1-13 el cliente lee SU declaración vigente aunque retiró el consentimiento → permite',
  getDoc(D(wd, 'clientWD', 'v1')), true);
await T('S1-14 el cliente LISTA sus declaraciones con el consentimiento retirado → permite',
  getDocs(collection(wd, 'users', 'clientWD', 'healthDeclarations')), true);
await T('S1-15 BLOQUEAR la vigente con el consentimiento retirado → permite (la rama de bloqueo NO gana la condición: es el mecanismo del retiro)',
  updateDoc(D(wd, 'clientWD', 'v1'), { state: 'blocked', blockedAt: serverTimestamp() }), true);
await T('S1-16 SIN sesión, actualizar contenido → deniega',
  contentUpdate(anon, 'clientOK', 'v2'), false);
await T('S1-17 el cliente BORRA su declaración (ya bloqueada) con el consentimiento retirado → permite (borrado = derecho, no uso)',
  deleteDoc(D(wd, 'clientWD', 'v1')), true);

console.log(`\nRESULTADO S-1: ${pass}/${pass + fail} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
