// RONBO NUTRI — Batería CI del delta AUTH-062 / mailLang
// (2026-10-28, despliegue autorizado por Ronald, correo
// 2026-10-28 01:27 CDT: delta mailLang + despliegue completo
// de AUTH-062). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción.
// Banco de reglas: ./firestore.rules = candidato de publicación
// (texto vivo verificado 41eac78d, SHA-256 c01fc199…, + SOLO el
// delta mailLang: 'mailLang' entra en la lista cerrada de la
// rama de perfil inofensivo de match /users/{uid}, con su valor
// cerrado a ['en','es'] cuando el campo cambia; candidato
// SHA-256 4237d9cc…).
//
// La pieza A de AUTH-062 es el selector de idioma de correo en
// «Mi perfil»: guarda la preferencia en el campo mailLang del
// propio documento del usuario, por la misma vía con la que hoy
// guarda su nombre o su teléfono. El texto vivo deniega ese
// guardado (la rama es una lista cerrada y mailLang no está).
// La suite gemela (pruebas-reglas-auth062-vivo) corre los
// MISMOS casos contra el texto vivo con las expectativas del
// delta invertidas (A1/A2/A5 y D1): el contraste prueba que el
// delta abre justo ese guardado, ni más ni menos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteField
} from 'firebase/firestore';

const ESPERA_DELTA = true;   // en la suite sobre el texto vivo: false
const NOMBRE = 'AUTH062';

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
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
  await setDoc(doc(db, 'users', 'clientSin'), { ...base, name: 'Cliente Sin', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
});

const A = testEnv.authenticatedContext('clientA').firestore();
const B = testEnv.authenticatedContext('clientB').firestore();
const S = testEnv.authenticatedContext('clientSin').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const UA = (db) => doc(db, 'users', 'clientA');
const ETQ = ESPERA_DELTA ? 'admitido (el delta)' : 'denegado (texto vivo)';

// ---- El guardado del selector (lo que abre el delta) ----
await T('A1 el alumno AÑADE mailLang=\'es\' a su propio documento (el primer guardado del selector): ' + ETQ,
  updateDoc(UA(A), { mailLang: 'es' }), ESPERA_DELTA);
await T('A2 el alumno CAMBIA su mailLang a \'en\': ' + ETQ,
  updateDoc(UA(A), { mailLang: 'en' }), ESPERA_DELTA);
await T('D1 dato: el mailLang guardado es el último valor válido (\'en\'), leído por el propio alumno: ' + (ESPERA_DELTA ? 'verificado' : 'en el texto vivo el campo nunca se escribió — el dato no existe'),
  (async () => {
    const s = await getDoc(UA(A));
    if (!s.exists()) throw new Error('el documento debe existir');
    if (s.data().mailLang !== 'en') throw new Error('mailLang=' + s.data().mailLang);
  })(), ESPERA_DELTA);
await T('A5 el alumno guarda nombre + mailLang=\'es\' en la misma actualización (la vía completa del perfil): ' + ETQ,
  updateDoc(UA(A), { name: 'Cliente A Editado', mailLang: 'es' }), ESPERA_DELTA);

// ---- Valor cerrado: ni con el delta ----
await T('A3 mailLang=\'fr\' (fuera de la lista cerrada en/es): denegado',
  updateDoc(UA(A), { mailLang: 'fr' }), false);
await T('A4 mailLang=123 (no es texto): denegado',
  updateDoc(UA(A), { mailLang: 123 }), false);
await T('A12 BORRAR mailLang (deleteField): denegado — la preferencia se cambia entre en/es, no se borra por esta rama',
  updateDoc(UA(A), { mailLang: deleteField() }), false);

// ---- La rama inofensiva de siempre: sin cambio ----
await T('A6 el alumno actualiza SOLO su nombre (la rama de siempre): admitido',
  updateDoc(UA(A), { name: 'Cliente A' }), true);
await T('A7 el alumno actualiza el juego inofensivo completo (phone/gender/social/photoURL) SIN mailLang: admitido',
  updateDoc(UA(A), { phone: '555-0100', gender: 'm', social: { ig: '@a' }, photoURL: 'https://x/y.png' }), true);
await T('D2 dato: un documento que NUNCA tuvo mailLang (clientSin) sigue actualizando su nombre: admitido — la ausencia del campo no rompe la rama',
  updateDoc(doc(S, 'users', 'clientSin'), { name: 'Cliente Sin Editado' }), true);

// ---- Nada fuera de la lista, ni propio ni ajeno ----
await T('A8 mailLang + role (fuera de la lista): denegado',
  updateDoc(UA(A), { mailLang: 'es', role: 'entrenador' }), false);
await T('A9 mailLang + approved (fuera de la lista): denegado',
  updateDoc(UA(A), { mailLang: 'es', approved: true }), false);
await T('A10 OTRO alumno (clientB) intenta poner el mailLang de clientA: denegado',
  updateDoc(UA(B), { mailLang: 'en' }), false);
await T('A11 un ANÓNIMO intenta poner el mailLang de clientA: denegado',
  updateDoc(UA(anon), { mailLang: 'en' }), false);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
