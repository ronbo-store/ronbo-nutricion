// RONBO FIT — Batería CI del delta AUTH-2026-11-02-153 «La alumna
// guarda su propio peso» (punto 13 de la cola de despliegue
// 2026-11-01; diagnóstico de Ronald verificado 2026-11-01 18:50 y
// 23:08 CST). Usuarios FICTICIOS, emulador LOCAL/oficial. Nunca
// toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 4e0c88e1-7a2a-4d55-9837-373220fe5a3d, SHA-256 6f7b482c…;
// candidata SHA-256 6df936f1…), toca SOLO la colección
// nutrition_weight y añade UNA función:
//   (1) función weightCreateNoComp(d): la creación no trae
//       composición (fat/muscle/water/visceral/notes ausentes o
//       en cero/vacío).
//   (2) create propio: aprobado + (compModeIsClient ||
//       weightCreateNoComp) — antes exigía compModeIsClient
//       siempre.
//   (3) update propio: aprobado + (compModeIsClient || el diff
//       no toca ninguno de los cinco campos de composición).
// Todo lo demás queda byte a byte.
//
// La suite gemela (pruebas-reglas-peso-vivo) corre los MISMOS
// casos contra el texto VIVO con las expectativas del delta
// invertidas (W1, W2, W6, W10 y W18a denegados allí).
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';

const ESPERA_DELTA_OK = true; // candidato: true · vivo: false
const NOMBRE = 'PESO-CANDIDATO';

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

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();

/* Siembra sin reglas: usuarios base y ajustes de composición. */
async function seedUser(uid, extra) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), Object.assign({
      name: 'Ficticio ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true, trainerUid: 'coach'
    }, extra || {}));
  });
}
async function seedCompAccess(uid, mode) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'nutrition_progress', uid + '_compaccess'), {
      kind: 'compAccess', ownerUid: uid, mode, history: []
    });
  });
}
/* El documento de pesaje «del entrenador»: nace con composición. */
async function seedWeightDoc(uid, date) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'nutrition_weight', uid + '_' + date), {
      ownerUid: uid, date, weight: 80, weightOriginal: 80, weightUnitOriginal: 'kg',
      fat: 20, muscle: 30, water: 50, visceral: 8, notes: 'del entrenador',
      updatedAt: serverTimestamp()
    });
  });
}

/* Formas EXACTAS que escribe la app servida (f625c8c):
   - appFull: el submit del modal con los cinco campos de
     composición en los valores dados (si el candado está puesto,
     son los del registro previo; si es el primer pesaje, ceros).
   - evalShape: la escritura de la evaluación (setDoc merge, solo
     peso). */
const appFull = (uid, date, weight, fat, muscle, water, visceral, notes) => ({
  ownerUid: uid, date, weight, weightOriginal: weight, weightUnitOriginal: 'kg',
  fat, muscle, water, visceral, notes, updatedAt: serverTimestamp()
});
const appZero = (uid, date, weight) => appFull(uid, date, weight, 0, 0, 0, 0, '');
const evalShape = (uid, date, weight) => ({
  ownerUid: uid, date, weight, updatedAt: serverTimestamp()
});
const wdoc = (db, uid, date) => doc(db, 'nutrition_weight', uid + '_' + date);

await seedUser('dueno', { isOwner: true, approved: false, role: 'administrador', trainerUid: null });
await seedUser('coach', { role: 'entrenador', trainerUid: null });
await seedUser('aluSin');            // aprobada, SIN doc de modo (defecto: 'trainer')
await seedUser('aluCon');            // aprobada, con modo 'client'
await seedUser('aluMT');             // aprobada, con modo 'trainer' EXPLÍCITO
await seedUser('aluNo', { approved: false });
await seedUser('otra');              // otra alumna aprobada
await seedCompAccess('aluCon', 'client');
await seedCompAccess('aluMT', 'trainer');

// ---- CREATE propio: el corazón del defecto ----
await T('PESO W1 create SOLO-PESO sin campos de composición (forma evaluación, merge), sin modo: ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-11-02'), evalShape('aluSin', '2026-11-02', 81), { merge: true }), ESPERA_DELTA_OK);
await T('PESO W2 create SOLO-PESO con composición en cero (forma app, primer pesaje), sin modo: ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-11-01'), appZero('aluSin', '2026-11-01', 81.4)), ESPERA_DELTA_OK);
await T('PESO W3 create CON composición (fat 25), sin modo: denegado en ambos textos',
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-31'), appFull('aluSin', '2026-10-31', 81, 25, 30, 50, 8, '')), false);
await T('PESO W4 create solo-peso pero con NOTAS escritas, sin modo: denegado en ambos textos',
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-29'), appFull('aluSin', '2026-10-29', 81, 0, 0, 0, 0, 'mi nota')), false);
await T('PESO W5 create CON composición, con modo client: admitido en ambos textos',
  setDoc(wdoc(dbOf('aluCon'), 'aluCon', '2026-11-02'), appFull('aluCon', '2026-11-02', 70, 22, 33, 55, 6, 'mía')), true);
await T('PESO W18a create SOLO-PESO con modo trainer EXPLÍCITO: ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(wdoc(dbOf('aluMT'), 'aluMT', '2026-11-02'), appZero('aluMT', '2026-11-02', 90)), ESPERA_DELTA_OK);
await T('PESO W18b create CON composición con modo trainer explícito: denegado en ambos textos',
  setDoc(wdoc(dbOf('aluMT'), 'aluMT', '2026-11-01'), appFull('aluMT', '2026-11-01', 90, 25, 30, 50, 8, '')), false);

// ---- UPDATE propio sobre el documento con composición del entrenador ----
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W6 update SOLO-PESO (misma composición en la carga, cambia el peso), sin modo: ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-30'), appFull('aluSin', '2026-10-30', 79.5, 20, 30, 50, 8, 'del entrenador')), ESPERA_DELTA_OK);
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W7 update peso Y grasa (fat 21), sin modo: denegado en ambos textos',
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-30'), appFull('aluSin', '2026-10-30', 79.5, 21, 30, 50, 8, 'del entrenador')), false);
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W8 update SOLO las notas, sin modo: denegado en ambos textos',
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-30'), appFull('aluSin', '2026-10-30', 80, 20, 30, 50, 8, 'cambio mío')), false);
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W9 update que OMITE la clave fat (borrar composición también es cambiarla), sin modo: denegado en ambos textos',
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-30'), {
    ownerUid: 'aluSin', date: '2026-10-30', weight: 79.5, weightOriginal: 79.5, weightUnitOriginal: 'kg',
    muscle: 30, water: 50, visceral: 8, notes: 'del entrenador', updatedAt: serverTimestamp()
  }), false);
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W10 update merge SOLO-PESO (forma evaluación) sobre doc con composición, sin modo: ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-30'), { weight: 79 }, { merge: true }), ESPERA_DELTA_OK);

// ---- Con modo client, la composición propia sigue abierta ----
await seedWeightDoc('aluCon', '2026-10-30');
await T('PESO W11 update de composición propia con modo client: admitido en ambos textos',
  setDoc(wdoc(dbOf('aluCon'), 'aluCon', '2026-10-30'), appFull('aluCon', '2026-10-30', 70, 21, 30, 50, 8, 'del entrenador')), true);

// ---- Entrenador asignado y propietario: accesos intactos ----
await T('PESO W12 el entrenador ASIGNADO crea el pesaje con composición de su alumna: admitido en ambos textos',
  setDoc(wdoc(dbOf('coach'), 'aluSin', '2026-10-28'), appFull('aluSin', '2026-10-28', 80, 22, 31, 51, 9, 'del entrenador')), true);
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W13 el entrenador ASIGNADO actualiza la composición de su alumna: admitido en ambos textos',
  setDoc(wdoc(dbOf('coach'), 'aluSin', '2026-10-30'), appFull('aluSin', '2026-10-30', 80, 23, 30, 50, 8, 'del entrenador')), true);
await T('PESO W14 el PROPIETARIO crea el pesaje con composición de una alumna: admitido en ambos textos',
  setDoc(wdoc(dbOf('dueno'), 'aluSin', '2026-10-27'), appFull('aluSin', '2026-10-27', 80, 22, 31, 51, 9, 'del propietario')), true);

// ---- Fronteras que no se mueven ----
await T('PESO W15a otra alumna crea un documento con ownerUid ajeno: denegado en ambos textos',
  setDoc(wdoc(dbOf('otra'), 'aluSin', '2026-10-26'), appZero('aluSin', '2026-10-26', 60)), false);
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W15b otra alumna actualiza el documento de aluSin: denegado en ambos textos',
  setDoc(wdoc(dbOf('otra'), 'aluSin', '2026-10-30'), appZero('aluSin', '2026-10-30', 60)), false);
await T('PESO W16 alumna NO aprobada crea su solo-peso: denegado en ambos textos',
  setDoc(wdoc(dbOf('aluNo'), 'aluNo', '2026-11-02'), appZero('aluNo', '2026-11-02', 60)), false);
await seedWeightDoc('aluSin', '2026-10-30');
await T('PESO W17a la alumna lee su propio documento: admitido en ambos textos',
  getDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-30')), true);
await T('PESO W17b otra alumna lee el documento de aluSin: denegado en ambos textos',
  getDoc(wdoc(dbOf('otra'), 'aluSin', '2026-10-30')), false);
await seedWeightDoc('aluSin', '2026-10-25');
await T('PESO W19 la alumna borra su propio documento (rama delete intacta): admitido en ambos textos',
  deleteDoc(wdoc(dbOf('aluSin'), 'aluSin', '2026-10-25')), true);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS');
if (failures.length) console.log('FALLOS: ' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
