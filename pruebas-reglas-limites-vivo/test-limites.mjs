// RONBO FIT — Batería CI del delta «Límites» (punto 12 de la cola
// de despliegue 2026-11-01; delta aprobado por Ronald 2026-11-02
// 09:04 CST, widget-1d015a67). Usuarios FICTICIOS, emulador
// LOCAL/oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// d2cdb249-7cc1-4ac0-86a7-96b01a9c4388, SHA-256 6df936f1…;
// candidata SHA-256 f20a3a6f…), añade SOLO un bloque, réplica del
// precedente mail_templates (AUTH-146), tras su bloque:
//   match /app_settings/limits {
//     allow get, create, update: if isOwnerUser();
//     allow delete: if false;
//   }
// Todo lo demás queda byte a byte.
//
// La suite gemela (pruebas-reglas-limites-vivo) corre los MISMOS
// casos contra el texto VIVO con las expectativas del delta
// invertidas (L1, L2 y L3 denegados allí).
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, deleteDoc, getDocs, collection, serverTimestamp
} from 'firebase/firestore';

const ESPERA_DELTA_OK = false; // candidato: true · vivo: false
const NOMBRE = 'LIMITES-VIVO';

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8080) }
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

const dbOf = (uid) => uid ? testEnv.authenticatedContext(uid).firestore()
  : testEnv.unauthenticatedContext().firestore();

async function seedUser(uid, extra) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), Object.assign({
      name: 'Ficticio ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true, trainerUid: 'coach'
    }, extra || {}));
  });
}
async function seedSetting(docId, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'app_settings', docId), data);
  });
}

const limitesShape = () => ({
  rows: [{ service: 'Firestore (plan Spark)', measure: 'Lecturas de documentos', cap: '50.000', period: 'día', notes: 'Cuota publicada del plan Spark.' }],
  updatedAt: serverTimestamp(), updatedBy: 'dueno'
});
const sdoc = (db, docId) => doc(db, 'app_settings', docId);

await seedUser('dueno', { isOwner: true, approved: false, role: 'administrador', trainerUid: null });
await seedUser('coach', { role: 'entrenador', trainerUid: null });
await seedUser('alu');               // alumna aprobada con sesión
await seedSetting('approvals', { maxPerTrainer: 1 });
await seedSetting('mail_templates', { templates: {} });

// ---- EL DELTA: app_settings/limits, solo el propietario ----
await T('LIMITES L1 el PROPIETARIO lee app_settings/limits (aún sin documento): ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  getDoc(sdoc(dbOf('dueno'), 'limits')), ESPERA_DELTA_OK);
await T('LIMITES L2 el PROPIETARIO crea app_settings/limits con la forma del registro: ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(sdoc(dbOf('dueno'), 'limits'), limitesShape()), ESPERA_DELTA_OK);
await seedSetting('limits', limitesShape());
await T('LIMITES L3 el PROPIETARIO actualiza app_settings/limits (merge): ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(sdoc(dbOf('dueno'), 'limits'), { updatedAt: serverTimestamp(), updatedBy: 'dueno' }, { merge: true }), ESPERA_DELTA_OK);

// ---- Quien NO es propietario: ni con sesión (idéntico en ambos textos) ----
await T('LIMITES L4 una ALUMNA con sesión lee app_settings/limits: denegado en ambos textos',
  getDoc(sdoc(dbOf('alu'), 'limits')), false);
await T('LIMITES L5 un ENTRENADOR lee app_settings/limits: denegado en ambos textos',
  getDoc(sdoc(dbOf('coach'), 'limits')), false);
await T('LIMITES L6 una ALUMNA crea app_settings/limits: denegado en ambos textos',
  setDoc(sdoc(dbOf('alu'), 'limits'), limitesShape()), false);
await T('LIMITES L7 un ENTRENADOR actualiza app_settings/limits: denegado en ambos textos',
  setDoc(sdoc(dbOf('coach'), 'limits'), { updatedBy: 'coach' }, { merge: true }), false);
await T('LIMITES L8 SIN sesión se lee app_settings/limits: denegado en ambos textos',
  getDoc(sdoc(dbOf(null), 'limits')), false);

// ---- El documento no se borra: nadie (idéntico en ambos textos) ----
await T('LIMITES L9 el PROPIETARIO borra app_settings/limits: denegado en ambos textos',
  deleteDoc(sdoc(dbOf('dueno'), 'limits')), false);
await T('LIMITES L10 una ALUMNA borra app_settings/limits: denegado en ambos textos',
  deleteDoc(sdoc(dbOf('alu'), 'limits')), false);

// ---- REGRESIÓN: el resto de app_settings se comporta idéntico ----
await T('LIMITES R1 un usuario con sesión lee app_settings/approvals (lista blanca): admitido en ambos textos',
  getDoc(sdoc(dbOf('alu'), 'approvals')), true);
await T('LIMITES R2 SIN sesión se lee app_settings/approvals: denegado en ambos textos',
  getDoc(sdoc(dbOf(null), 'approvals')), false);
await T('LIMITES R3 SIN sesión se lee app_settings/faq_public (público): admitido en ambos textos',
  getDoc(sdoc(dbOf(null), 'faq_public')), true);
await T('LIMITES R4 el PROPIETARIO lee app_settings/mail_templates: admitido en ambos textos',
  getDoc(sdoc(dbOf('dueno'), 'mail_templates')), true);
await T('LIMITES R5 una ALUMNA lee app_settings/mail_templates: denegado en ambos textos',
  getDoc(sdoc(dbOf('alu'), 'mail_templates')), false);
await T('LIMITES R6 un usuario con sesión lee un docId FUERA de la lista (noExiste): denegado en ambos textos',
  getDoc(sdoc(dbOf('alu'), 'noExiste')), false);
await T('LIMITES R7 el PROPIETARIO crea un docId FUERA de la lista (noExiste): denegado en ambos textos',
  setDoc(sdoc(dbOf('dueno'), 'noExiste'), { x: 1 }), false);
await T('LIMITES R8 el PROPIETARIO actualiza app_settings/approvals (lista blanca): admitido en ambos textos',
  setDoc(sdoc(dbOf('dueno'), 'approvals'), { maxPerTrainer: 1, updatedAt: serverTimestamp() }, { merge: true }), true);
await T('LIMITES R9 listar app_settings (list): denegado en ambos textos',
  getDocs(collection(dbOf('dueno'), 'app_settings')), false);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS');
if (failures.length) console.log('FALLOS: ' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
