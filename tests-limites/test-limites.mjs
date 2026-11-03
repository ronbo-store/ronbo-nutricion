// RONBO FIT — Batería CI del delta «límites de imágenes»
// (punto 112 de la cola; orden de Ronald 2026-11-03 02:12 CST +
// autorización permanente 2026-10-29). Usuarios FICTICIOS,
// emulador oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 8edbd6e6-e8f7-487b-af7c-9b3a79a0721f, SHA-256 ab2e3d12…;
// candidata SHA-256 0ff13b11…), añade SOLO un bloque nuevo tras
// app_settings/trainer_attention:
//   match /app_settings/assets_usage {
//     allow get, create, update: if isOwnerUser();
//     allow delete: if false;
//   }
// El documento guarda solo cifras del repositorio de imágenes
// (tamaño, conteo, fecha de chequeo) — ningún dato personal.
//
// La suite corre en DOS modos con la misma lista de casos:
//   MODO=candidata → firestore.rules = candidata; ESPERA_NUEVO=true
//   MODO=vivo      → firestore.rules = texto vivo; ESPERA_NUEVO=false
// En el texto vivo, el documento nuevo no lo cubre ninguna
// regla: ni el propietario puede crearlo ni leerlo (las
// expectativas R1–R3 se invierten). Los casos de vecinos
// (V1–V7) valen lo mismo en ambos modos: el delta no toca
// nada más.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc
} from 'firebase/firestore';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const NOMBRE = ESPERA_NUEVO ? 'LIMITES-IMG-CANDIDATA' : 'LIMITES-IMG-VIVO';

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

const USAGE = { repoBytes: 29281778, limitBytes: 1000000000, imageCount: 107, repoFiles: 109, source: 'medicion-automatica' };
const ref = (uid) => doc(dbOf(uid), 'app_settings', 'assets_usage');

/* ── R: el documento nuevo ── */
await T('R1 propietario crea assets_usage', setDoc(ref('dueno'), USAGE), ESPERA_NUEVO);
await T('R2 propietario lee assets_usage', getDoc(ref('dueno')), ESPERA_NUEVO);
await T('R3 propietario actualiza assets_usage', updateDoc(ref('dueno'), { repoBytes: 30000000 }), ESPERA_NUEVO);
await T('R4 entrenadora NO lee assets_usage', getDoc(ref('entrenadora')), false);
await T('R5 entrenadora NO crea assets_usage', setDoc(ref('entrenadora'), USAGE), false);
await T('R6 entrenadora NO actualiza assets_usage', updateDoc(ref('entrenadora'), { repoBytes: 1 }), false);
await T('R7 alumna NO lee assets_usage', getDoc(ref('alumna')), false);
await T('R8 sin sesión NO lee assets_usage', getDoc(ref(null)), false);
await T('R9 propietario NO borra assets_usage', deleteDoc(ref('dueno')), false);
await T('R10 entrenadora NO borra assets_usage', deleteDoc(ref('entrenadora')), false);
await T('R11 nadie lista app_settings (assets_usage)', getDocs(collection(dbOf('dueno'), 'app_settings')), false);

/* ── V: vecinos intactos (mismas expectativas en ambos modos) ── */
await T('V1 propietario lee limits', getDoc(doc(dbOf('dueno'), 'app_settings', 'limits')), true);
await T('V2 propietario escribe limits', setDoc(doc(dbOf('dueno'), 'app_settings', 'limits'), { rows: [] }), true);
await T('V3 entrenadora NO lee limits', getDoc(doc(dbOf('entrenadora'), 'app_settings', 'limits')), false);
await T('V4 entrenadora SÍ lee trainer_attention (AUTH-193 intacto)', getDoc(doc(dbOf('entrenadora'), 'app_settings', 'trainer_attention')), true);
await T('V5 entrenadora NO escribe trainer_attention', setDoc(doc(dbOf('entrenadora'), 'app_settings', 'trainer_attention'), { redDays: 3 }), false);
await T('V6 alumna lee approvals (lista firmada)', getDoc(doc(dbOf('alumna'), 'app_settings', 'approvals')), true);
await T('V7 entrenadora NO lee mail_templates · propietario SÍ', getDoc(doc(dbOf('entrenadora'), 'app_settings', 'mail_templates')), false);
await T('V8 propietario lee mail_templates', getDoc(doc(dbOf('dueno'), 'app_settings', 'mail_templates')), true);

console.log('== ' + NOMBRE + ': ' + pass + ' PASS · ' + fail + ' FAIL ==');
if (fail) { console.log('::error::' + NOMBRE + ' falló: ' + failures.join(' | ')); process.exit(1); }
await testEnv.cleanup();
process.exit(0);
