// RONBO FIT — Batería CI del delta «umbrales del informe de
// atención» (punto 93 de la cola; decisiones de Ronald cerradas
// 2026-11-02/03 + autorización permanente 2026-10-29). Usuarios
// FICTICIOS, emulador oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 2d591bc3-b3ab-42ec-baa3-24d0b7605113, SHA-256 e282f695…; candidata
// SHA-256 ab2e3d12…), añade SOLO un bloque nuevo tras
// app_settings/limits:
//   match /app_settings/trainer_attention {
//     allow get: if isOwnerUser() || isTrainerUser();
//     allow create, update: if isOwnerUser();
//     allow delete: if false;
//   }
// El documento guarda solo cinco números de criterio de producto.
//
// La suite corre en DOS modos con la misma lista de casos:
//   MODO=candidata → firestore.rules = candidata; ESPERA_NUEVO=true
//   MODO=vivo      → firestore.rules = texto vivo; ESPERA_NUEVO=false
// En el texto vivo, el documento nuevo no lo cubre ninguna regla:
// ni el propietario puede crearlo ni el entrenador leerlo (las
// expectativas R1–R4 se invierten). Los casos de vecinos (V1–V5)
// valen lo mismo en ambos modos: el delta no toca nada más.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc
} from 'firebase/firestore';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const NOMBRE = ESPERA_NUEVO ? 'ATENCION-CANDIDATA' : 'ATENCION-VIVO';

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
    console.log('::error title=' + name + '::' + String(e && e.message || e).slice(0, 200).replace(/[\r\n]+/g, ' '));
  }
}

const dbOf = (uid) => uid ? testEnv.authenticatedContext(uid).firestore()
  : testEnv.unauthenticatedContext().firestore();

async function seedUser(uid, extra) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), Object.assign({
      name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true
    }, extra || {}));
  });
}
await seedUser('dueno', { isOwner: true, role: 'administrador' });
await seedUser('entrenadora', { role: 'entrenador' });
await seedUser('alumna', { role: 'usuario', trainerUid: 'entrenadora' });

const TH = { redDays: 14, weighPct: 80, satMin: 4, satMinN: 5, idleDays: 7 };
const ref = (uid) => doc(dbOf(uid), 'app_settings', 'trainer_attention');

/* ── R: el documento nuevo ── */
await T('R1 propietario lee trainer_attention', getDoc(ref('dueno')), ESPERA_NUEVO);
await T('R2 propietario crea trainer_attention', setDoc(ref('dueno'), TH), ESPERA_NUEVO);
await T('R3 propietario actualiza trainer_attention', updateDoc(ref('dueno'), { redDays: 10 }), ESPERA_NUEVO);
await T('R4 entrenadora lee trainer_attention', getDoc(ref('entrenadora')), ESPERA_NUEVO);
await T('R5 entrenadora NO crea trainer_attention', setDoc(ref('entrenadora'), TH), false);
await T('R6 entrenadora NO actualiza trainer_attention', updateDoc(ref('entrenadora'), { redDays: 3 }), false);
await T('R7 alumna NO lee trainer_attention', getDoc(ref('alumna')), false);
await T('R8 sin sesión NO lee trainer_attention', getDoc(ref(null)), false);
await T('R9 propietario NO borra trainer_attention', deleteDoc(ref('dueno')), false);
await T('R10 entrenadora NO borra trainer_attention', deleteDoc(ref('entrenadora')), false);
await T('R11 nadie lista app_settings (trainer_attention)', getDocs(collection(dbOf('dueno'), 'app_settings')), false);

/* ── V: vecinos intactos (mismas expectativas en ambos modos) ── */
await T('V1 propietario lee limits', getDoc(doc(dbOf('dueno'), 'app_settings', 'limits')), true);
await T('V2 propietario escribe limits', setDoc(doc(dbOf('dueno'), 'app_settings', 'limits'), { rows: [] }), true);
await T('V3 entrenadora NO lee limits', getDoc(doc(dbOf('entrenadora'), 'app_settings', 'limits')), false);
await T('V4 alumna lee approvals (lista firmada)', getDoc(doc(dbOf('alumna'), 'app_settings', 'approvals')), true);
await T('V5 entrenadora NO lee mail_templates', getDoc(doc(dbOf('entrenadora'), 'app_settings', 'mail_templates')), false);
await T('V6 propietario lee mail_templates', getDoc(doc(dbOf('dueno'), 'app_settings', 'mail_templates')), true);

console.log('== ' + NOMBRE + ': ' + pass + ' PASS · ' + fail + ' FAIL ==');
if (failures.length) console.log('::error title=RESUMEN::' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
