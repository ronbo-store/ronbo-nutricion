// RONBO NUTRI — Batería CI del delta AUTH-2026-10-28-068
// «Registro y aprobación en un clic» (diseño 2026-10-28, §4 y
// §8.1). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción.
// Banco de reglas: ./firestore.rules = candidato de publicación
// (texto vivo verificado ec2963ec, SHA-256 4237d9cc…, + SOLO el
// delta AUTH-068 de 2 ediciones; candidato SHA-256 9d7dd0b3…).
//
// El paquete añade el campo users/{uid}.emailConfirmedAt: el
// propio usuario lo escribe SOLO con la hora del servidor, tras
// verificar su enlace de confirmación. Vive en la rama de
// perfil inofensivo (la misma que AUTH-062 amplió con mailLang)
// y el create del registro lo prohíbe: nadie nace confirmado.
// La suite gemela (pruebas-reglas-auth068-vivo) corre los
// MISMOS 10 casos contra el texto vivo con las expectativas
// del delta invertidas: A1/A2/A9 pasan a denegadas y A6 a
// admitida (sin la línea del create, el texto vivo no tiene
// lista cerrada de campos al nacer y el lote completo con
// el campo pasaba). El contraste prueba que el delta es
// justo lo que cambia, ni más ni menos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, writeBatch, serverTimestamp, deleteField, Timestamp
} from 'firebase/firestore';

const ESPERA_CONFIRMA = true;   // A1/A2/A9: escribir emailConfirmedAt con hora del servidor
const ESPERA_CREATE_CON_CAMPO = false; // A6: nacer CON emailConfirmedAt en el lote de registro
const NOMBRE = 'AUTH068';

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

const YA_CONFIRMADO = Timestamp.fromDate(new Date('2026-10-01T12:00:00.000Z'));

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: false,
    role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, approved: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'other1'), { ...base, name: 'Otro Usuario', approved: true });
  for (const u of ['userA1', 'userA2', 'userA3', 'userA10']) {
    await setDoc(doc(db, 'users', u), { ...base, name: 'Usuario ' + u });
  }
  // userA4/userA8/userA9 YA traen emailConfirmedAt (confirmaron antes).
  for (const u of ['userA4', 'userA8', 'userA9']) {
    await setDoc(doc(db, 'users', u), { ...base, name: 'Usuario ' + u, emailConfirmedAt: YA_CONFIRMADO });
  }
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const UDOC = (db, uid) => doc(db, 'users', uid);
const ET = ESPERA_CONFIRMA ? 'admitida (el delta)' : 'denegada (texto vivo)';
const EC = ESPERA_CREATE_CON_CAMPO ? 'admitida (texto vivo: el create no cerraba el campo)' : 'denegada (el delta: la línea del create)';

// ---- La confirmación del propio usuario (el delta) ----
await T('AUTH068 A1 el propio usuario escribe SOLO {emailConfirmedAt: hora del servidor}: ' + ET,
  updateDoc(UDOC(dbOf('userA1'), 'userA1'), { emailConfirmedAt: serverTimestamp() }), ESPERA_CONFIRMA);
await T('AUTH068 A2 el propio usuario escribe {emailConfirmedAt: hora del servidor, name} junto a otro campo inofensivo: ' + ET,
  updateDoc(UDOC(dbOf('userA2'), 'userA2'), { emailConfirmedAt: serverTimestamp(), name: 'Nombre Cambiado' }), ESPERA_CONFIRMA);
await T('AUTH068 A3 el propio usuario intenta emailConfirmedAt con una FECHA LITERAL de cliente (2020-01-01): denegada',
  updateDoc(UDOC(dbOf('userA3'), 'userA3'), { emailConfirmedAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00.000Z')) }), false);
await T('AUTH068 A4 existiendo emailConfirmedAt, el propio usuario intenta BORRARLO (deleteField): denegada',
  updateDoc(UDOC(dbOf('userA4'), 'userA4'), { emailConfirmedAt: deleteField() }), false);
await T('AUTH068 A5 OTRO usuario firmado intenta escribir emailConfirmedAt en un documento ajeno: denegada',
  updateDoc(UDOC(dbOf('other1'), 'userA1'), { emailConfirmedAt: serverTimestamp() }), false);

// ---- El registro: nadie nace confirmado (la línea del create) ----
// El alta replica el lote real de la app (patrón de la Línea
// Completa): users/{uid} + su recibo 'registered' en el mismo lote.
const newUser = (uid, extra) => {
  const db = dbOf(uid);
  const b = writeBatch(db);
  b.set(UDOC(db, uid), {
    name: 'Nuevo Ficticio', email: uid + '@test.local', role: 'usuario', isOwner: false, approved: false,
    acceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: 'v3-2026-10-16',
    adultConfirmed: true, consentSeq: 1, consentReceiptId: uid + '_1', ...extra });
  b.set(doc(db, 'consent_receipts', uid + '_1'), {
    uid, email: uid + '@test.local', type: 'registered', version: 'v3-2026-10-16', at: serverTimestamp() });
  return b.commit();
};
await T('AUTH068 A6 create de registro CON emailConfirmedAt en el lote completo: ' + EC,
  newUser('newBad68', { trainerUid: null, assignmentStatus: 'waiting', emailConfirmedAt: serverTimestamp() }), ESPERA_CREATE_CON_CAMPO);
await T('AUTH068 A7 create de registro normal SIN el campo (lote completo con su recibo registered): admitida',
  newUser('newOk68', { trainerUid: null, assignmentStatus: 'waiting' }), true);

// ---- Regresión de la misma rama de perfil inofensivo ----
await T('AUTH068 A8 regresión de la rama: {mailLang:es} admitida · {mailLang:fr} denegada · {approved:true} denegada · {name} sin tocar un emailConfirmedAt ya existente admitida',
  (async () => {
    const db = dbOf('userA8');
    await assertSucceeds(updateDoc(UDOC(db, 'userA8'), { mailLang: 'es' }));
    await assertFails(updateDoc(UDOC(db, 'userA8'), { mailLang: 'fr' }));
    await assertFails(updateDoc(UDOC(db, 'userA8'), { approved: true }));
    await assertSucceeds(updateDoc(UDOC(db, 'userA8'), { name: 'Nombre A8' }));
  })(), true);
await T('AUTH068 A9 re-confirmación: segundo {emailConfirmedAt: hora del servidor} existiendo ya el campo: ' + ET,
  updateDoc(UDOC(dbOf('userA9'), 'userA9'), { emailConfirmedAt: serverTimestamp() }), ESPERA_CONFIRMA);
await T('AUTH068 A10 el propio usuario intenta {emailConfirmedAt: hora del servidor, approved:true} en un solo update: denegada',
  updateDoc(UDOC(dbOf('userA10'), 'userA10'), { emailConfirmedAt: serverTimestamp(), approved: true }), false);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
