// RONBO FIT — Batería CI del delta AUTH-2026-10-28-071 «Puerta
// falsa Camera Coach» (diseño aprobado por Ronald el 2026-10-28).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
//
// El paquete añade el campo users/{uid}.fdCamAt: el propio alumno
// lo escribe SOLO como cadena (la fecha ISO que escribe la app al
// tocar «Quiero entrar») por la rama de perfil inofensivo — la
// misma que AUTH-062 amplió con mailLang y AUTH-068 con
// emailConfirmedAt — y el create del registro lo prohíbe: nadie
// nace interesado. La suite gemela (pruebas-reglas-fdcam-vivo)
// corre los MISMOS 10 casos contra el texto vivo (el candidato
// AUTH-068 ya publicado, SHA-256 9d7dd0b3…) con las expectativas
// del delta invertidas donde el delta manda.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, writeBatch, serverTimestamp, deleteField
} from 'firebase/firestore';

const ESPERA_CAMPO = true;   // escribir fdCamAt como cadena por la rama de perfil
const ESPERA_CREATE_CON_CAMPO = false; // nacer CON fdCamAt en el lote de registro
const NOMBRE = 'FDCAM-CANDIDATO';

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

const ISO1 = '2026-10-28T19:00:00.000Z';
const ISO2 = '2026-10-29T19:00:00.000Z';

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: false,
    role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, approved: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'other1'), { ...base, name: 'Otro Usuario', approved: true });
  for (const u of ['userF1', 'userF2', 'userF3', 'userF9', 'userF10']) {
    await setDoc(doc(db, 'users', u), { ...base, name: 'Usuario ' + u });
  }
  // userF4 YA trae fdCamAt (confirmó su interés antes).
  await setDoc(doc(db, 'users', 'userF4'), { ...base, name: 'Usuario userF4', fdCamAt: ISO1 });
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const UDOC = (db, uid) => doc(db, 'users', uid);
const ET = ESPERA_CAMPO ? 'admitida (el delta)' : 'denegada (texto vivo)';
const EC = ESPERA_CREATE_CON_CAMPO ? 'admitida (texto vivo: el create no cerraba el campo)' : 'denegada (el delta: la línea del create)';

// ---- La marca de interés del propio alumno (el delta) ----
await T('FDCAM F1 el propio alumno escribe SOLO {fdCamAt: cadena ISO}: ' + ET,
  updateDoc(UDOC(dbOf('userF1'), 'userF1'), { fdCamAt: ISO1 }), ESPERA_CAMPO);
await T('FDCAM F2 el propio alumno escribe {fdCamAt: cadena ISO, name} junto a otro campo inofensivo: ' + ET,
  updateDoc(UDOC(dbOf('userF2'), 'userF2'), { fdCamAt: ISO1, name: 'Nombre Cambiado' }), ESPERA_CAMPO);
await T('FDCAM F3 el propio alumno intenta fdCamAt con un NÚMERO (12345): denegada',
  updateDoc(UDOC(dbOf('userF3'), 'userF3'), { fdCamAt: 12345 }), false);
await T('FDCAM F4 existiendo fdCamAt, el propio alumno intenta BORRARLO (deleteField): denegada',
  updateDoc(UDOC(dbOf('userF4'), 'userF4'), { fdCamAt: deleteField() }), false);
await T('FDCAM F5 OTRO usuario firmado intenta escribir fdCamAt en un documento ajeno: denegada',
  updateDoc(UDOC(dbOf('other1'), 'userF1'), { fdCamAt: ISO1 }), false);

// ---- El registro: nadie nace interesado (la línea del create) ----
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
await T('FDCAM F6 create de registro CON fdCamAt en el lote completo: ' + EC,
  newUser('newBad70', { trainerUid: null, assignmentStatus: 'waiting', fdCamAt: ISO1 }), ESPERA_CREATE_CON_CAMPO);
await T('FDCAM F7 create de registro normal SIN el campo (lote completo con su recibo registered): admitida',
  newUser('newOk70', { trainerUid: null, assignmentStatus: 'waiting' }), true);

// ---- Regresión de la misma rama de perfil inofensivo ----
await T('FDCAM F8 regresión de la rama: {mailLang:es} admitida · {mailLang:fr} denegada · {approved:true} denegada · {name} admitida',
  (async () => {
    const db = dbOf('userF9');
    await assertSucceeds(updateDoc(UDOC(db, 'userF9'), { mailLang: 'es' }));
    await assertFails(updateDoc(UDOC(db, 'userF9'), { mailLang: 'fr' }));
    await assertFails(updateDoc(UDOC(db, 'userF9'), { approved: true }));
    await assertSucceeds(updateDoc(UDOC(db, 'userF9'), { name: 'Nombre F9' }));
  })(), true);
await T('FDCAM F9 re-confirmación: segundo {fdCamAt: cadena ISO} existiendo ya el campo: ' + ET,
  updateDoc(UDOC(dbOf('userF4'), 'userF4'), { fdCamAt: ISO2 }), ESPERA_CAMPO);
await T('FDCAM F10 el propio alumno intenta {fdCamAt: cadena ISO, approved:true} en un solo update: denegada',
  updateDoc(UDOC(dbOf('userF10'), 'userF10'), { fdCamAt: ISO1, approved: true }), false);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
