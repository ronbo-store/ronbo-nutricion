// RONBO NUTRI — Batería CI del delta FAQ / AYUDA
// (2026-10-28, despliegue autorizado por Ronald, correo
// 2026-10-28 01:13 CDT: paquete FAQ + su delta de reglas).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
// Banco de reglas: ./firestore.rules = texto VIVO verificado
// 13c0a457 (SHA-256 c7d039bb…), SIN el delta: esta es la suite
// de CONTRASTE de la gemela pruebas-reglas-faq — los mismos
// casos con las expectativas del delta invertidas.
//
// El paquete FAQ guarda su contenido editable en
// app_settings/faq {entries:[…]}: lo lee cualquier usuario con
// sesión (la ayuda se pinta para todos) y solo lo escribe el
// propietario (el editor de Accesos). El texto vivo deniega ese
// documento a TODOS porque la lista de docId de app_settings es
// cerrada y 'faq' no está en ella. La suite gemela
// (pruebas-reglas-faq-vivo) corre los MISMOS casos contra el
// texto vivo con las expectativas del delta invertidas
// (F2/F3/F4, F8/F9/F10 y D1/D2): el contraste prueba que el
// delta es justo lo que desbloquea el paquete, ni más ni menos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, collection, deleteDoc, serverTimestamp
} from 'firebase/firestore';

const ESPERA_GET_FAQ = false;   // suite sobre el texto vivo: el delta NO está
const ESPERA_WRITE_FAQ = false; // suite sobre el texto vivo: el delta NO está
const NOMBRE = 'FAQ-VIVO';

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
const TS = serverTimestamp();

const FAQ_SEED = {
  entries: [
    { id: 'f1', block: 1, order: 1, q: { en: 'Q1 en', es: 'P1 es' }, a: { en: 'A1 en', es: 'R1 es' } },
    { id: 'f2', block: 1, order: 2, q: { en: 'Q2 en', es: 'P2 es' }, a: { en: 'A2 en', es: 'R2 es' } }
  ],
  updatedAt: TS, updatedBy: 'owner1'
};

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Uno', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
  await setDoc(doc(db, 'users', 'clientU'), { ...base, name: 'Cliente U', role: 'usuario', approved: false, trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
  await setDoc(doc(db, 'app_settings', 'faq'), FAQ_SEED);
  await setDoc(doc(db, 'app_settings', 'approvals'), { maxPerTrainer: 5 });
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const U = testEnv.authenticatedContext('clientU').firestore();
const anon = testEnv.unauthenticatedContext().firestore();

const FAQ = (db) => doc(db, 'app_settings', 'faq');
const ETQ = ESPERA_GET_FAQ ? 'admitida (el delta)' : 'denegada (texto vivo)';
const ETW = ESPERA_WRITE_FAQ ? 'admitida (el delta)' : 'denegada (texto vivo)';

// ---- Lecturas ----
await T('F1 un anónimo NO lee app_settings/faq: denegada',
  getDoc(FAQ(anon)), false);
await T('F2 el alumno aprobado LEE app_settings/faq (la ayuda se pinta para todo usuario con sesión): ' + ETQ,
  getDoc(FAQ(A)), ESPERA_GET_FAQ);
await T('F3 el entrenador LEE app_settings/faq: ' + ETQ,
  getDoc(FAQ(tr1)), ESPERA_GET_FAQ);
await T('F4 el usuario con sesión SIN aprobar LEE app_settings/faq (la rama es signedIn, como approvals/ai_control): ' + ETQ,
  getDoc(FAQ(U)), ESPERA_GET_FAQ);
await T('F5 el alumno aprobado sigue leyendo app_settings/approvals (sin cambio): admitida',
  getDoc(doc(A, 'app_settings', 'approvals')), true);
await T('F6 el alumno NO lee un docId fuera de la lista cerrada (app_settings/otro): denegada',
  getDoc(doc(A, 'app_settings', 'otro')), false);
await T('F7 el alumno NO puede LISTAR app_settings: denegada',
  getDocs(collection(A, 'app_settings')), false);
await T('D1 dato: el alumno lee el CONTENIDO de faq y trae las 2 entradas sembradas: ' + (ESPERA_GET_FAQ ? 'verificado' : 'la lectura se deniega — el dato queda sellado (texto vivo)'),
  (async () => {
    const s = await getDoc(FAQ(A));
    if (!s.exists()) throw new Error('faq debe existir');
    const n = (s.data().entries || []).length;
    if (n !== 2) throw new Error('entries=' + n + ' (esperadas 2)');
  })(), ESPERA_GET_FAQ);

// ---- Escrituras ajenas: siempre denegadas ----
await T('F11 el entrenador NO puede escribir app_settings/faq (el editor es solo del propietario): denegada',
  setDoc(FAQ(tr1), { entries: [], updatedBy: 'trainer1' }, { merge: true }), false);
await T('F12 el alumno NO puede escribir app_settings/faq: denegada',
  setDoc(FAQ(A), { entries: [], updatedBy: 'clientA' }, { merge: true }), false);
await T('F13 el alumno NO puede BORRAR app_settings/faq: denegada',
  deleteDoc(FAQ(A)), false);
await T('F14 el propietario NO puede crear un docId fuera de la lista cerrada (app_settings/otro): denegada — la lista sigue cerrada también al escribir',
  setDoc(doc(owner, 'app_settings', 'otro'), { x: 1 }), false);

// ---- Escrituras del propietario sobre faq (el delta) ----
await T('F8 el propietario ACTUALIZA app_settings/faq (guardar del editor): ' + ETW,
  setDoc(FAQ(owner), { entries: FAQ_SEED.entries, updatedBy: 'owner1-edit' }, { merge: true }), ESPERA_WRITE_FAQ);
await T('D2 dato: tras el guardado del propietario, el alumno lee el updatedBy NUEVO (la edición fluye a la ayuda): ' + ((ESPERA_GET_FAQ && ESPERA_WRITE_FAQ) ? 'verificado' : 'sin flujo en el texto vivo (escritura y/o lectura denegadas)'),
  (async () => {
    const s = await getDoc(FAQ(A));
    if (!s.exists()) throw new Error('faq debe existir');
    if (s.data().updatedBy !== 'owner1-edit') throw new Error('updatedBy=' + s.data().updatedBy);
  })(), ESPERA_GET_FAQ && ESPERA_WRITE_FAQ);
await T('F9 el propietario BORRA app_settings/faq: ' + ETW,
  deleteDoc(FAQ(owner)), ESPERA_WRITE_FAQ);
await T('F10 el propietario CREA app_settings/faq de nuevo (el alta inicial / la siembra): ' + ETW,
  setDoc(FAQ(owner), FAQ_SEED), ESPERA_WRITE_FAQ);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
