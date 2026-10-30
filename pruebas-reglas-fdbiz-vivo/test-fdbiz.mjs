// RONBO FIT — Batería CI del delta «Puerta falsa Business»
// (decisiones de Ronald 2026-10-30 12:00–12:06 CDT: D3 — en la
// app, el entrenador registra su interés con un toque, patrón
// fdCamAt, y puede nombrar su gimnasio en un campo opcional).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
//
// El delta, sobre el texto vivo (ruleset 9cbf987a, SHA-256
// 77736abe…), toca SOLO la cláusula de users/{uid} en 3 toques:
//  (1) create: dos guardias «nadie nace interesado» —
//      !('fdBizAt' in …) y !('fdBizGym' in …);
//  (2) rama de perfil inofensivo: 'fdBizAt' y 'fdBizGym' entran
//      en la lista cerrada hasOnly, tras 'fdCamAt';
//  (3) guardias de valor en la misma rama: fdBizAt debe ser
//      cadena si cambia; fdBizGym cadena de hasta 80 si cambia.
// Candidata SHA-256 0d53712e….
// La suite gemela (pruebas-reglas-fdbiz-vivo) corre los MISMOS
// 12 casos contra el texto VIVO con las expectativas del delta
// invertidas donde el delta manda.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, writeBatch, serverTimestamp, deleteField
} from 'firebase/firestore';

const ESPERA_SELLO = false;   // escribir el sello {fdBizAt[, fdBizGym]} por la rama de perfil
const ESPERA_CREATE_CON_CAMPOS = true; // nacer CON fdBizAt/fdBizGym en el lote de registro
const NOMBRE = 'FDBIZ-VIVO';

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

const ISO1 = '2026-10-30T17:00:00.000Z';
const ISO2 = '2026-10-30T18:00:00.000Z';

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: false,
    role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, approved: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'other1'), { ...base, name: 'Otro Usuario', approved: true });
  // El entrenador protagonista de la pieza (rol entrenador, aprobado).
  await setDoc(doc(db, 'users', 'coach1'), { ...base, name: 'Entrenador Uno', role: 'entrenador', approved: true, assignmentStatus: 'assigned' });
  // coach2 YA trae el sello (registró su interés antes) — para FB12.
  await setDoc(doc(db, 'users', 'coach2'), { ...base, name: 'Entrenador Dos', role: 'entrenador', approved: true, assignmentStatus: 'assigned', fdBizAt: ISO1, fdBizGym: 'Gimnasio Sol' });
  await setDoc(doc(db, 'users', 'userR1'), { ...base, name: 'Usuario Regresión' });
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const UDOC = (db, uid) => doc(db, 'users', uid);
const ET = ESPERA_SELLO ? 'admitida (el delta)' : 'denegada (texto vivo: la lista cerrada no trae los campos)';
const EC = ESPERA_CREATE_CON_CAMPOS ? 'admitida (texto vivo: el create no cerraba los campos)' : 'denegada (el delta: las guardias del create)';

// ---- El sello del entrenador (el delta) — la escritura EXACTA de la app:
// setDoc(users/{uid}, {fdBizAt[, fdBizGym]}, {merge:true}) ----
await T('FDBIZ FB1 el propio entrenador sella SOLO {fdBizAt: cadena ISO} (setDoc merge, como la app): ' + ET,
  setDoc(UDOC(dbOf('coach1'), 'coach1'), { fdBizAt: ISO1 }, { merge: true }), ESPERA_SELLO);
await T('FDBIZ FB2 el propio entrenador sella {fdBizAt, fdBizGym: «Gimnasio Sol»} (setDoc merge, como la app): ' + ET,
  setDoc(UDOC(dbOf('coach1'), 'coach1'), { fdBizAt: ISO2, fdBizGym: 'Gimnasio Sol' }, { merge: true }), ESPERA_SELLO);
await T('FDBIZ FB3 el propio entrenador compone {name, fdBizAt} con otro campo inofensivo: ' + ET,
  updateDoc(UDOC(dbOf('coach1'), 'coach1'), { name: 'Entrenador Uno Mejorado', fdBizAt: ISO2 }), ESPERA_SELLO);

// ---- Guardias de valor (denegadas en ambos textos) ----
await T('FDBIZ FB4 fdBizAt con un NÚMERO (123): denegada',
  setDoc(UDOC(dbOf('coach1'), 'coach1'), { fdBizAt: 123 }, { merge: true }), false);
await T('FDBIZ FB5 fdBizGym de 81 caracteres (con fdBizAt válido): denegada',
  setDoc(UDOC(dbOf('coach1'), 'coach1'), { fdBizAt: ISO2, fdBizGym: 'x'.repeat(81) }, { merge: true }), false);
await T('FDBIZ FB6 fdBizGym con un NÚMERO (42), no cadena: denegada',
  setDoc(UDOC(dbOf('coach1'), 'coach1'), { fdBizAt: ISO2, fdBizGym: 42 }, { merge: true }), false);

// ---- Privilegio y terceros (denegadas en ambos textos) ----
await T('FDBIZ FB7 el sello mezclado con un campo de privilegio {fdBizAt, role:administrador}: denegada',
  updateDoc(UDOC(dbOf('coach1'), 'coach1'), { fdBizAt: ISO2, role: 'administrador' }), false);
await T('FDBIZ FB8 OTRO usuario firmado intenta sellar el documento del entrenador: denegada',
  setDoc(UDOC(dbOf('other1'), 'coach1'), { fdBizAt: ISO1 }, { merge: true }), false);

// ---- El registro: nadie nace interesado (las guardias del create) ----
const newUser = (uid, extra) => {
  const db = dbOf(uid);
  const b = writeBatch(db);
  b.set(UDOC(db, uid), {
    name: 'Nuevo Ficticio', email: uid + '@test.local', role: 'usuario', isOwner: false, approved: false,
    acceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: 'v4-2026-10-24',
    adultConfirmed: true, consentSeq: 1, consentReceiptId: uid + '_1', ...extra });
  b.set(doc(db, 'consent_receipts', uid + '_1'), {
    uid, email: uid + '@test.local', type: 'registered', version: 'v4-2026-10-24', at: serverTimestamp() });
  return b.commit();
};
await T('FDBIZ FB9 create de registro CON fdBizAt y fdBizGym en el lote completo: ' + EC,
  newUser('newBad98', { trainerUid: null, assignmentStatus: 'waiting', fdBizAt: ISO1, fdBizGym: 'Gimnasio Sol' }), ESPERA_CREATE_CON_CAMPOS);
await T('FDBIZ FB10 create de registro normal SIN los campos (lote completo con su recibo registered): admitida',
  newUser('newOk98', { trainerUid: null, assignmentStatus: 'waiting' }), true);

// ---- Regresión de la misma rama de perfil inofensivo ----
await T('FDBIZ FB11 regresión de la rama: {mailLang:es} admitida · {mailLang:fr} denegada · {approved:true} denegada · {fdCamAt: cadena} admitida (el precedente AUTH-071 intacto)',
  (async () => {
    const db = dbOf('userR1');
    await assertSucceeds(updateDoc(UDOC(db, 'userR1'), { mailLang: 'es' }));
    await assertFails(updateDoc(UDOC(db, 'userR1'), { mailLang: 'fr' }));
    await assertFails(updateDoc(UDOC(db, 'userR1'), { approved: true }));
    await assertSucceeds(updateDoc(UDOC(db, 'userR1'), { fdCamAt: ISO1 }));
  })(), true);
await T('FDBIZ FB12 existiendo el sello, el propio entrenador intenta BORRAR fdBizAt (deleteField): denegada (la guardia exige cadena si el campo cambia)',
  updateDoc(UDOC(dbOf('coach2'), 'coach2'), { fdBizAt: deleteField() }), false);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
