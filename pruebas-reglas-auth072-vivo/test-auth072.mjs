// RONBO FIT — Batería CI del delta AUTH-2026-10-28-072
// «Delegación de la aprobación al entrenador elegido» (diseño
// 2026-10-28, §4 y §7). Usuarios FICTICIOS, emulador LOCAL.
// Nunca toca producción.
//
// El paquete añade SOLO dos piezas sobre el texto vivo
// (ruleset 8c3c6e40 = texto AUTH-068 + bloque fdCamAt de
// AUTH-071, SHA-256 b71d4fd4…; candidato SHA-256 f91e6f97…):
//   Pieza 1 — colección nueva trainer_notify/{trainerUid}:
//     {email, mailLang, updatedAt} que escribe SOLO el propio
//     entrenador (correo atado al de su cuenta users) y que
//     puede leer un registrante PENDIENTE que eligió a ESE
//     entrenador (además del propio y del propietario). Sin
//     lista: ningún correo queda enumerable.
//   Pieza 2 — cláusula allow update en users/{uid}: el
//     entrenador que APROBÓ a un alumno (approved==true,
//     approvedBy==él, trainerUid==él) anota SOLO
//     notices.welcome {at: hora del servidor, by: él,
//     template: 'welcome'} (réplica de mailRecordNotice).
//
// ESTA suite corre contra el texto VIVO (contraste). La suite gemela
// (pruebas-reglas-auth072) corre los MISMOS 19 casos
// contra el CANDIDATO; aquí las expectativas del delta van
// INVERTIDAS: en el texto vivo no existe el match
// trainer_notify ni ninguna rama que permita a un entrenador
// escribir notices, así que los casos que el delta ABRE
// pasan a DENEGADOS — N1 (creación válida), N6 (actualización
// válida), N7 (lectura del propio), N8 (lectura del
// propietario), N9 (lectura del registrante pendiente que lo
// eligió) y A1 (anotación welcome del aprobador). Todos los
// demás casos ya son denegados en AMBOS textos y no cambian:
// el contraste prueba que el delta es justo lo que cambia,
// ni más ni menos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, collection, setDoc, updateDoc, getDoc, getDocs, serverTimestamp
} from 'firebase/firestore';

const ESPERA_NOTIFY_ESCRITURA = false;  // N1/N6: el propio entrenador escribe su trainer_notify
const ESPERA_NOTIFY_LECTURA = false;    // N7/N8/N9: lecturas que la pieza 1 abre
const ESPERA_NOTICES = false;           // A1: el aprobador anota notices.welcome
const NOMBRE = 'AUTH072-VIVO';

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

const T_MAIL = 'trainer.t@test.local';
const T2_MAIL = 'trainer.t2@test.local';

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: false,
    role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', email: 'owner@test.local', isOwner: true, approved: true, role: 'administrador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'trainerT'), { ...base, name: 'Entrenador T', email: T_MAIL, approved: true, role: 'entrenador', assignmentStatus: 'assigned', approvalsUsed: 0 });
  await setDoc(doc(db, 'users', 'trainerT2'), { ...base, name: 'Entrenador T2', email: T2_MAIL, approved: true, role: 'entrenador', assignmentStatus: 'assigned', approvalsUsed: 0 });
  // Registrantes PENDIENTES: pendT eligió a trainerT; pendOther, a trainerT2.
  await setDoc(doc(db, 'users', 'pendT'), { ...base, name: 'Pendiente De T', email: 'pend.t@test.local', trainerUid: 'trainerT', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'pendOther'), { ...base, name: 'Pendiente De T2', email: 'pend.other@test.local', trainerUid: 'trainerT2', assignmentStatus: 'assigned' });
  // Alumno ya APROBADO que eligió a trainerT (para N11 y como base de las A).
  await setDoc(doc(db, 'users', 'alumOkT'), { ...base, name: 'Alumno De T', email: 'alum.ok@test.local', approved: true, trainerUid: 'trainerT', assignmentStatus: 'assigned', approvedBy: 'trainerT' });
  // Extraño sin relación con trainerT.
  await setDoc(doc(db, 'users', 'stranger1'), { ...base, name: 'Extrano', email: 'stranger@test.local', approved: true });
  // Alumnos de la serie A: aprobados por trainerT y asignados a él…
  for (const u of ['alumA1', 'alumA2', 'alumA4', 'alumA5']) {
    await setDoc(doc(db, 'users', u), { ...base, name: 'Alumno ' + u, email: u + '@test.local', approved: true, trainerUid: 'trainerT', assignmentStatus: 'assigned', approvedBy: 'trainerT' });
  }
  // …salvo alumA3, aprobado por trainerT2 y asignado a trainerT2…
  await setDoc(doc(db, 'users', 'alumA3'), { ...base, name: 'Alumno alumA3', email: 'alumA3@test.local', approved: true, trainerUid: 'trainerT2', assignmentStatus: 'assigned', approvedBy: 'trainerT2' });
  // …y alumA6, que eligió a trainerT pero sigue SIN aprobar.
  await setDoc(doc(db, 'users', 'alumA6'), { ...base, name: 'Alumno alumA6', email: 'alumA6@test.local', trainerUid: 'trainerT', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'app_settings', 'approvals'), { maxPerTrainer: 5 });
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const NDOC = (db, trainerUid) => doc(db, 'trainer_notify', trainerUid);
const UDOC = (db, uid) => doc(db, 'users', uid);
const EN = ESPERA_NOTIFY_ESCRITURA ? 'admitida (el delta)' : 'denegada (texto vivo: sin match trainer_notify)';
const EL = ESPERA_NOTIFY_LECTURA ? 'admitida (el delta)' : 'denegada (texto vivo: sin match trainer_notify)';
const EA = ESPERA_NOTICES ? 'admitida (el delta)' : 'denegada (texto vivo: ninguna rama abre notices al entrenador)';

// ---- trainer_notify: escrituras del propio entrenador ----
// Las denegadas van ANTES de la válida: un intento fallido no
// crea el documento, así que N1 sigue siendo una creación.
await T('AUTH072 N2 el propio entrenador crea su doc con un correo DISTINTO al de su cuenta users: denegada',
  setDoc(NDOC(dbOf('trainerT'), 'trainerT'), { email: 'otro@test.local', mailLang: 'es', updatedAt: serverTimestamp() }), false);
await T('AUTH072 N3 el propio entrenador crea su doc con una CLAVE EXTRA (phone): denegada',
  setDoc(NDOC(dbOf('trainerT'), 'trainerT'), { email: T_MAIL, mailLang: 'es', updatedAt: serverTimestamp(), phone: '555-0000' }), false);
await T('AUTH072 N4 el propio entrenador crea su doc con mailLang fuera de [en, es] (fr): denegada',
  setDoc(NDOC(dbOf('trainerT'), 'trainerT'), { email: T_MAIL, mailLang: 'fr', updatedAt: serverTimestamp() }), false);
await T('AUTH072 N1 el propio entrenador crea su doc válido {email == el de su users, mailLang es, updatedAt == hora del servidor}: ' + EN,
  setDoc(NDOC(dbOf('trainerT'), 'trainerT'), { email: T_MAIL, mailLang: 'es', updatedAt: serverTimestamp() }), ESPERA_NOTIFY_ESCRITURA);
await T('AUTH072 N5 OTRO entrenador (T2, no el dueño) escribe el doc de trainerT: denegada',
  setDoc(NDOC(dbOf('trainerT2'), 'trainerT'), { email: T_MAIL, mailLang: 'en', updatedAt: serverTimestamp() }), false);
await T('AUTH072 N6 actualización válida del propio entrenador (mailLang es -> en, updatedAt == hora del servidor): ' + EN,
  setDoc(NDOC(dbOf('trainerT'), 'trainerT'), { email: T_MAIL, mailLang: 'en', updatedAt: serverTimestamp() }), ESPERA_NOTIFY_ESCRITURA);

// ---- trainer_notify: lecturas ----
await T('AUTH072 N7 lectura por el PROPIO entrenador: ' + EL,
  getDoc(NDOC(dbOf('trainerT'), 'trainerT')), ESPERA_NOTIFY_LECTURA);
await T('AUTH072 N8 lectura por el PROPIETARIO: ' + EL,
  getDoc(NDOC(dbOf('owner1'), 'trainerT')), ESPERA_NOTIFY_LECTURA);
await T('AUTH072 N9 lectura por un registrante PENDIENTE (approved == false) cuyo trainerUid == ese entrenador: ' + EL,
  getDoc(NDOC(dbOf('pendT'), 'trainerT')), ESPERA_NOTIFY_LECTURA);
await T('AUTH072 N10 lectura por un registrante pendiente que eligió a OTRO entrenador (trainerT2): denegada',
  getDoc(NDOC(dbOf('pendOther'), 'trainerT')), false);
await T('AUTH072 N11 lectura por un alumno ya APROBADO que lo eligió (la rama exige approved == false): denegada',
  getDoc(NDOC(dbOf('alumOkT'), 'trainerT')), false);
await T('AUTH072 N12 lectura por un extraño sin relación: denegada',
  getDoc(NDOC(dbOf('stranger1'), 'trainerT')), false);
await T('AUTH072 N13 list de trainer_notify (incluso por el propio entrenador): denegada',
  getDocs(collection(dbOf('trainerT'), 'trainer_notify')), false);

// ---- notices: la anotación welcome del aprobador (pieza 2) ----
// Réplica fiel de mailRecordNotice de la app: setDoc con merge
// de {notices: {welcome: {at: hora del servidor, by, template}}}.
const notice = (db, uid, by, template) =>
  setDoc(UDOC(db, uid), { notices: { welcome: { at: serverTimestamp(), by, template } } }, { merge: true });
await T('AUTH072 A1 el entrenador que aprobó al alumno anota notices.welcome {at: hora del servidor, by: él, template: welcome} con setDoc merge: ' + EA,
  notice(dbOf('trainerT'), 'alumA1', 'trainerT', 'welcome'), ESPERA_NOTICES);
await T('AUTH072 A2 OTRO entrenador (T2) anota sobre un alumno aprobado por trainerT: denegada',
  notice(dbOf('trainerT2'), 'alumA2', 'trainerT2', 'welcome'), false);
await T('AUTH072 A3 trainerT anota sobre un alumno aprobado por OTRO (approvedBy == trainerT2): denegada',
  notice(dbOf('trainerT'), 'alumA3', 'trainerT', 'welcome'), false);
await T('AUTH072 A4 trainerT anota con template DISTINTO de welcome en la entrada welcome: denegada',
  notice(dbOf('trainerT'), 'alumA4', 'trainerT', 'trainer'), false);
await T('AUTH072 A5 trainerT intenta tocar OTRA clave (name) además de notices en el mismo update: denegada',
  setDoc(UDOC(dbOf('trainerT'), 'alumA5'), { notices: { welcome: { at: serverTimestamp(), by: 'trainerT', template: 'welcome' } }, name: 'Nombre Cambiado' }, { merge: true }), false);
await T('AUTH072 A6 trainerT anota sobre un alumno aún NO aprobado: denegada',
  notice(dbOf('trainerT'), 'alumA6', 'trainerT', 'welcome'), false);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
