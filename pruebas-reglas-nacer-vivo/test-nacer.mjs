// RONBO FIT — Batería CI del delta «las cuentas nuevas nacen con
// Comida encendida» (AUTH-2026-11-01-132; decisión expresa de Ronald
// 2026-11-01 14:32 CST: «Sí: publica ese cambio de reglas de una
// línea», sobre el §4 del INFORME-INTERRUPTOR-COMIDA-2026-11-01).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
//
// El delta, sobre el texto vivo (ruleset ff21ca3a, SHA-256
// 7b26c0cf…), toca SOLO la guardia de nacimiento de features en la
// cláusula de creación de users/{uid}: la línea
//   request.resource.data.features.get('meals', false) == false
// pasa a ser una guardia de tipo
//   request.resource.data.features.get('meals', false) is bool
// (con su comentario de política actualizado). Efecto neto: el lote
// de registro vigente con meals:true queda admitido y NINGÚN otro
// nacimiento cambia (meals:false sigue admitido; sin features,
// admitido; privilegios, claves cerradas y recibo, intactos).
// Candidata SHA-256 718f411f….
// La suite gemela (pruebas-reglas-nacer-vivo) corre los MISMOS 10
// casos contra el texto VIVO con la expectativa de N1 invertida.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, writeBatch, serverTimestamp
} from 'firebase/firestore';

const ESPERA_MEALS_TRUE_OK = false; // candidato: true · vivo: false
const NOMBRE = 'NACER-VIVO';

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

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const FEATURES = (meals) => ({ training: true, activity: true, photos: true, metrics: true, meals, somatotype: true });

// El lote EXACTO de registro de la app (alumno): users/{uid} +
// consent_receipts/{uid}_1 en un solo lote, con las transformaciones
// de hora del servidor de la app.
const regBatch = (uid, mutate) => {
  const db = dbOf(uid);
  const user = {
    name: 'Nuevo Ficticio', email: uid + '@test.local', phone: '', gender: '', social: '',
    role: 'usuario', isOwner: false, approved: false,
    accountType: 'alumno', modality: 'virtual', features: FEATURES(true),
    trainerUid: null, assignmentStatus: 'waiting',
    acceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: 'v4-2026-10-24',
    adultConfirmed: true, adultConfirmedAt: serverTimestamp(), createdAt: serverTimestamp(),
    consentSeq: 1, consentReceiptId: uid + '_1'
  };
  if (mutate) mutate(user);
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), user);
  b.set(doc(db, 'consent_receipts', uid + '_1'), {
    uid, email: user.email, type: 'registered', version: 'v4-2026-10-24', at: serverTimestamp() });
  return b.commit();
};

const EM = ESPERA_MEALS_TRUE_OK ? 'admitida (el delta)' : 'DENEGADA (texto vivo: meals debía nacer en false)';

// ---- El delta ----
await T('NACER N1 registro de alumno con el lote exacto de la app y meals:true: ' + EM,
  regBatch('nacOn1', null), ESPERA_MEALS_TRUE_OK);

// ---- Controles: nacimientos que NO cambian ----
await T('NACER N2 registro de alumno con meals:false (control): admitida en ambos textos',
  regBatch('nacOff2', u => { u.features = FEATURES(false); }), true);
await T('NACER N3 registro de alumno SIN campo features: admitida en ambos textos',
  regBatch('nacSin3', u => { delete u.features; }), true);
await T('NACER N9 solicitud de entrenador (roleRequest, sin features ni modalidad): admitida en ambos textos',
  regBatch('nacCoach9', u => { u.accountType = 'entrenador'; u.roleRequest = 'entrenador'; delete u.features; delete u.modality; }), true);

// ---- El resto de la cláusula de creación, intacto (denegadas en ambos) ----
await T('NACER N4 meals:true mezclado con approved:true (privilegio al nacer): denegada',
  regBatch('nacBad4', u => { u.approved = true; }), false);
await T('NACER N5 meals:true con role «entrenador» a pelo (sin roleRequest): denegada',
  regBatch('nacBad5', u => { u.role = 'entrenador'; }), false);
await T('NACER N6 meals con valor no booleano («si»): denegada',
  regBatch('nacBad6', u => { u.features = FEATURES('si'); }), false);
await T('NACER N7 meals:true con una clave extra en features (chat): denegada (lista cerrada intacta)',
  regBatch('nacBad7', u => { u.features = { ...FEATURES(true), chat: true }; }), false);
await T('NACER N8 meals:true con consentSeq 2 (el recibo no casa): denegada',
  regBatch('nacBad8', u => { u.consentSeq = 2; }), false);
await T('NACER N10 meals:true mezclado con isOwner:true: denegada',
  regBatch('nacBad10', u => { u.isOwner = true; }), false);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
