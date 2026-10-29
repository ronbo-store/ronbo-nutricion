// RONBO FIT — Batería CI del delta «Ayuda pública sin iniciar
// sesión — Opción B» (diseño DISENO-AYUDA-SIN-LOGIN-2026-10-28;
// autorización de construcción de Ronald por correo 2026-10-28
// 21:35 CDT). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción.
//
// El paquete añade SOLO una pieza sobre el texto vivo
// (ruleset f5352f7c = texto SHA-256 f91e6f97…; candidato
// SHA-256 98379d34…): en el match /app_settings/{docId}, el get
// pasa a admitir SIN sesión únicamente el documento
// 'faq_public' y la lista de escritura del propietario gana
// 'faq_public'. Nada más cambia: list sigue prohibido, la FAQ
// interna y el resto de app_settings siguen tras sesión.
//
// ESTA suite corre contra el CANDIDATO. La suite gemela
// (pruebas-reglas-ayuda-vivo) corre los MISMOS casos contra el
// texto VIVO con las expectativas del delta INVERTIDAS: los
// casos que el delta ABRE (P1 get anónimo de faq_public, P6
// get con sesión de un no-propietario, P9 creación y P10
// actualización del propietario, P13 borrado del propietario)
// pasan a DENEGADOS. Todos los demás casos ya se comportan
// igual en AMBOS textos: el contraste prueba que el delta es
// justo lo que cambia, ni más ni menos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, serverTimestamp
} from 'firebase/firestore';

const ESPERA_GET_PUBLICO = true;          // P1/P6: get de faq_public sin sesión o sin ser propietario
const ESPERA_ESCRITURA_PROPIETARIO = true; // P9/P10/P13: el propietario crea/actualiza/borra faq_public
const NOMBRE = 'AYUDA-CANDIDATO';

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

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: false,
    role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', email: 'owner@test.local', isOwner: true, approved: true, role: 'administrador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'user1'), { ...base, name: 'Usuario Ficticio', email: 'user@test.local', approved: true, assignmentStatus: 'assigned' });
  const entrada = { id: '1.1', block: 1, order: 1, q: { en: 'Q?', es: '¿P?' }, a: { en: 'A.', es: 'R.' } };
  await setDoc(doc(db, 'app_settings', 'approvals'), { maxPerTrainer: 5 });
  await setDoc(doc(db, 'app_settings', 'faq'), { entries: [entrada], updatedAt: serverTimestamp(), updatedBy: 'owner1' });
  // faq_public NO se siembra: P9 prueba su CREACIÓN por el propietario.
});

const dbAnon = () => testEnv.unauthenticatedContext().firestore();
const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const SDOC = (db, id) => doc(db, 'app_settings', id);
const EG = ESPERA_GET_PUBLICO ? 'admitido (el delta)' : 'denegado (texto vivo: faq_public no está en ninguna lista)';
const EE = ESPERA_ESCRITURA_PROPIETARIO ? 'admitida (el delta)' : 'denegada (texto vivo: faq_public fuera de la lista de escritura)';

// ---- Negativos anónimos ANTES de crear faq_public (documento ausente) ----
await T('AYUDA P3 anónimo get de otro ajuste (approvals): denegado en ambos textos',
  getDoc(SDOC(dbAnon(), 'approvals')), false);

// ---- Escrituras sobre faq_public: solo el propietario ----
// Las denegadas van ANTES de la válida: un intento fallido no
// crea el documento, así que P9 sigue siendo una creación.
await T('AYUDA P7 un usuario con sesión NO propietario crea faq_public: denegado en ambos textos',
  setDoc(SDOC(dbOf('user1'), 'faq_public'), { entries: [], updatedAt: serverTimestamp(), updatedBy: 'user1' }), false);
await T('AYUDA P8 anónimo crea faq_public: denegado en ambos textos',
  setDoc(SDOC(dbAnon(), 'faq_public'), { entries: [], updatedAt: serverTimestamp(), updatedBy: 'anon' }), false);
await T('AYUDA P9 el PROPIETARIO crea faq_public {entries, updatedAt, updatedBy}: ' + EE,
  setDoc(SDOC(dbOf('owner1'), 'faq_public'), { entries: [{ id: '1.1', block: 1, order: 1, q: { en: 'Q?', es: '¿P?' }, a: { en: 'A.', es: 'R.' } }], updatedAt: serverTimestamp(), updatedBy: 'owner1' }), ESPERA_ESCRITURA_PROPIETARIO);

// ---- Lecturas de faq_public ----
await T('AYUDA P1 anónimo get de faq_public (la página /ayuda sin sesión): ' + EG,
  getDoc(SDOC(dbAnon(), 'faq_public')), ESPERA_GET_PUBLICO);
await T('AYUDA P6 usuario con sesión NO propietario get de faq_public (la lectura es pública): ' + EG,
  getDoc(SDOC(dbOf('user1'), 'faq_public')), ESPERA_GET_PUBLICO);
await T('AYUDA P5 anónimo get de la FAQ INTERNA (faq): denegado en ambos textos',
  getDoc(SDOC(dbAnon(), 'faq')), false);
await T('AYUDA P2 anónimo LIST de app_settings (enumerar ajustes): denegado en ambos textos',
  getDocs(collection(dbAnon(), 'app_settings')), false);

// ---- Actualización y borrado de faq_public ----
await T('AYUDA P11 un usuario con sesión NO propietario actualiza faq_public: denegado en ambos textos',
  updateDoc(SDOC(dbOf('user1'), 'faq_public'), { updatedBy: 'user1' }), false);
await T('AYUDA P12 anónimo actualiza faq_public: denegado en ambos textos',
  updateDoc(SDOC(dbAnon(), 'faq_public'), { updatedBy: 'anon' }), false);
await T('AYUDA P10 el PROPIETARIO actualiza faq_public (la sincronización del editor): ' + EE,
  setDoc(SDOC(dbOf('owner1'), 'faq_public'), { entries: [{ id: '1.1', block: 1, order: 1, q: { en: 'Q2?', es: '¿P2?' }, a: { en: 'A2.', es: 'R2.' } }], updatedAt: serverTimestamp(), updatedBy: 'owner1' }), ESPERA_ESCRITURA_PROPIETARIO);

// ---- Regresiones: lo que ya funcionaba no cambia ----
await T('AYUDA P4 usuario con sesión get de la FAQ interna (faq): admitido en ambos textos (regresión AUTH-063)',
  getDoc(SDOC(dbOf('user1'), 'faq')), true);
await T('AYUDA P14 el PROPIETARIO actualiza la FAQ interna (faq): admitido en ambos textos (regresión del editor)',
  setDoc(SDOC(dbOf('owner1'), 'faq'), { entries: [], updatedAt: serverTimestamp(), updatedBy: 'owner1' }), true);

// ---- Borrado (al final: destruye el documento de la suite) ----
await T('AYUDA P15 un usuario NO propietario borra faq_public: denegado en ambos textos',
  deleteDoc(SDOC(dbOf('user1'), 'faq_public')), false);
await T('AYUDA P13 el PROPIETARIO borra faq_public: ' + EE,
  deleteDoc(SDOC(dbOf('owner1'), 'faq_public')), ESPERA_ESCRITURA_PROPIETARIO);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
