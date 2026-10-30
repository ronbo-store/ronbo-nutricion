// RONBO FIT — Batería CI del delta N-2 «ppSymptoms» del FRENTE 1
// Paquete A (decisión de Ronald 2026-10-30 02:58 CDT: la respuesta
// a la pregunta suave de síntomas del posparto SE PERSISTE, con su
// ajuste de reglas propio). Usuarios FICTICIOS, emulador LOCAL.
// Nunca toca producción.
//
// El delta, sobre el texto vivo (ruleset 0c01e832, SHA-256
// 3e3c5ea1…), toca SOLO la cláusula de healthDeclarations:
//  (1) create: guarda de forma — si ppSymptoms viene, debe ser
//      cadena dentro de ['si','no','omitida'];
//  (2) update de contenidos: 'ppSymptoms' entra en la lista
//      cerrada de claves afectadas (la rama viva la CONGELABA: la
//      app escribe con setDoc merge + updatedAt, como en la suite)
//      + la misma guarda de forma.
// La suite gemela (pruebas-reglas-ppsx-vivo) corre los MISMOS 11
// casos contra el texto VIVO con las expectativas del delta
// invertidas donde el delta manda.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, serverTimestamp, deleteField
} from 'firebase/firestore';

const ESPERA_UPDATE_CAMPO = true;  // actualizar ppSymptoms en una declaración activa: admitida (el delta) / denegada (texto vivo: congelada)
const ESPERA_CREATE_MALO = false;  // crear CON ppSymptoms fuera del conjunto: denegada (la guarda del delta) / admitida (texto vivo: el create no cerraba el campo)
const NOMBRE = 'PPSX-CANDIDATO';

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

const CONSENT = { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: '2026-10-20T12:00:00Z' };
const UBASE = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true,
  role: 'usuario', trainerUid: null, assignmentStatus: 'assigned', modality: 'virtual',
  healthConsent: CONSENT };
const DECL = (extra) => ({ version: 1, conditions: ['Posparto'], details: '', state: 'active',
  declaredAt: new Date('2026-10-29T12:00:00Z'), updatedAt: new Date('2026-10-29T12:00:00Z'),
  blockedAt: null, ...extra });

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const { healthConsent: _hc, ...UBASE_NC } = UBASE;
  await setDoc(doc(db, 'users', 'owner1'), { ...UBASE_NC, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'otra'), { ...UBASE, name: 'Otra Usuaria' });
  for (const u of ['aluC1', 'aluC2', 'aluC3', 'alumna1']) {
    await setDoc(doc(db, 'users', u), { ...UBASE, name: 'Usuaria ' + u });
  }
  const D = (uid, id, data) => setDoc(doc(db, 'users', uid, 'healthDeclarations', id), data);
  await D('alumna1', 'v1', DECL({}));                                  // PPS4: update solo el campo
  await D('alumna1', 'v2', DECL({}));                                  // PPS5: update conditions + campo
  await D('alumna1', 'v3', DECL({ ppSymptoms: 'si' }));                // PPS6: retirar el campo
  await D('alumna1', 'v4', DECL({}));                                  // PPS7: valor fuera del conjunto
  await D('alumna1', 'v5', DECL({}));                                  // PPS8: update ordinaria sin el campo
  await D('alumna1', 'v0', DECL({ state: 'blocked', blockedAt: new Date('2026-10-29T13:00:00Z') })); // PPS10
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const DREF = (db, uid, id) => doc(db, 'users', uid, 'healthDeclarations', id);
const EU = ESPERA_UPDATE_CAMPO ? 'admitida (el delta)' : 'denegada (texto vivo: el campo queda congelado tras crear)';
const EM = ESPERA_CREATE_MALO ? 'admitida (texto vivo: el create no cerraba ni guardaba la forma)' : 'denegada (la guarda de forma del delta)';

// ---- Create: la forma del campo nuevo ----
await T('PPSX PPS1 la alumna crea su declaración activa SIN ppSymptoms: admitida',
  setDoc(DREF(dbOf('aluC1'), 'aluC1', 'v1'), { version: 1, conditions: ['Posparto'], details: '', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }), true);
await T('PPSX PPS2 la alumna crea su declaración activa CON ppSymptoms «si»: admitida (ni el texto vivo cerraba las claves del create)',
  setDoc(DREF(dbOf('aluC2'), 'aluC2', 'v1'), { version: 1, conditions: ['Posparto'], details: '', state: 'active', ppSymptoms: 'si', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }), true);
await T('PPSX PPS3 la alumna crea CON ppSymptoms fuera del conjunto («grave»): ' + EM,
  setDoc(DREF(dbOf('aluC3'), 'aluC3', 'v1'), { version: 1, conditions: ['Posparto'], details: '', state: 'active', ppSymptoms: 'grave', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }), ESPERA_CREATE_MALO);

// ---- Update: el corazón del delta (la rama viva congelaba el campo) ----
await T('PPSX PPS4 la alumna responde los síntomas: update SOLO {ppSymptoms «si», updatedAt} (setDoc merge, como escribe la app): ' + EU,
  setDoc(DREF(dbOf('alumna1'), 'alumna1', 'v1'), { ppSymptoms: 'si', updatedAt: serverTimestamp() }, { merge: true }), ESPERA_UPDATE_CAMPO);
await T('PPSX PPS5 la alumna actualiza conditions Y ppSymptoms «no» en la misma escritura: ' + EU,
  setDoc(DREF(dbOf('alumna1'), 'alumna1', 'v2'), { conditions: ['Posparto', 'Lactancia'], ppSymptoms: 'no', updatedAt: serverTimestamp() }, { merge: true }), ESPERA_UPDATE_CAMPO);
await T('PPSX PPS6 al desmarcar Posparto, la respuesta se RETIRA (deleteField) junto a conditions: ' + EU,
  setDoc(DREF(dbOf('alumna1'), 'alumna1', 'v3'), { conditions: ['Lactancia'], ppSymptoms: deleteField(), updatedAt: serverTimestamp() }, { merge: true }), ESPERA_UPDATE_CAMPO);
await T('PPSX PPS7 actualizar ppSymptoms a un valor fuera del conjunto («grave»): denegada',
  setDoc(DREF(dbOf('alumna1'), 'alumna1', 'v4'), { ppSymptoms: 'grave', updatedAt: serverTimestamp() }, { merge: true }), false);
await T('PPSX PPS8 regresión: update ordinaria {conditions, details, updatedAt} SIN el campo: admitida',
  setDoc(DREF(dbOf('alumna1'), 'alumna1', 'v5'), { conditions: ['Posparto', 'Menopausia'], details: 'nota', updatedAt: serverTimestamp() }, { merge: true }), true);

// ---- Terceros e inmutabilidad ----
await T('PPSX PPS9 OTRA usuaria intenta escribir ppSymptoms en la declaración ajena: denegada',
  setDoc(DREF(dbOf('otra'), 'alumna1', 'v1'), { ppSymptoms: 'si', updatedAt: serverTimestamp() }, { merge: true }), false);
await T('PPSX PPS10 escribir ppSymptoms sobre una declaración BLOQUEADA: denegada (inmutable para todos)',
  setDoc(DREF(dbOf('alumna1'), 'alumna1', 'v0'), { ppSymptoms: 'si', updatedAt: serverTimestamp() }, { merge: true }), false);

// ---- Lecturas: la ruta de lectura no cambia ----
await T('PPSX PPS11 lecturas como hoy: la propietaria-entrenadora lee la activa con consentimiento · la alumna lee la suya · una tercera NO lee la ajena',
  (async () => {
    await assertSucceeds(getDoc(DREF(dbOf('owner1'), 'alumna1', 'v1')));
    await assertSucceeds(getDoc(DREF(dbOf('alumna1'), 'alumna1', 'v1')));
    await assertFails(getDoc(DREF(dbOf('otra'), 'alumna1', 'v1')));
  })(), true);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
