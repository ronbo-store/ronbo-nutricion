// RONBO FIT — Batería CI del delta «ecuación automática»
// (SIMPLIFICACIÓN DE LA BASE, D1; punto 106 de la cola de
// despliegue 2026-11-01; aprobado por Ronald el 2026-11-02:
// correo 19:12 CST condicionado a la maqueta + aprobación de la
// maqueta en el chat 21:17 CST + autorización permanente
// 2026-10-29). Usuarios FICTICIOS, emulador oficial. Nunca toca
// producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 2446cb1d-26dd-4aeb-aabd-ab5e5b622945, SHA-256 80f5babf…;
// candidata SHA-256 e282f695…), toca SOLO el bloque
// assessment/{docId}:
//   1. Rama del ALUMNO (update): 'equation' y 'equationOrigin'
//      entran en su lista de claves, con dos guardas cerradas —
//      la ecuación que nace solo puede ser 'mifflin-st-jeor'
//      con equationOrigin resultante 'auto' y SOLO si el
//      documento no lleva equationChosenBy (ninguna elección
//      del entrenador que pisar); el origen que el alumno
//      escribe solo puede ser 'auto'.
//   2. Ramas del ENTRENADOR (create + update): 'equationOrigin'
//      entra en sus listas, con la guarda de que el origen que
//      el entrenador estampa solo puede ser 'trainer'.
// La suite gemela (pruebas-reglas-base) corre los MISMOS
// casos contra el texto VIVO con las expectativas del delta
// invertidas (EQ1, EQ6, EQ14 y EQ15 denegados allí por la
// llave nueva; todo lo demás idéntico).
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, serverTimestamp
} from 'firebase/firestore';

const ESPERA_DELTA_OK = false; // candidato: true · vivo: false
const NOMBRE = 'BASE-VIVO';

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
      name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true, trainerUid: 'coach'
    }, extra || {}));
  });
}
async function seedAsmt(uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid, 'assessment', 'current'), data);
  });
}

const asmt = (db, uid) => doc(db, 'users', uid, 'assessment', 'current');
const wAsmt = (db, uid, data) => setDoc(asmt(db, uid), data, { merge: true });

/* La ficha SIN ecuación (el caso Gerwynth/María): datos
   completos, señal dada, ninguna ecuación elegida por nadie. */
const SIN_ECUACION = {
  birthYear: 1998, heightCm: 174, activityCategoryId: 5, palBasal: 1.9,
  sexDataProvided: false, updatedBy: 'alu'
};
/* La ficha CON elección del entrenador (Ten Haaf firmada). */
const CON_ELECCION = {
  birthYear: 1995, heightCm: 168, activityCategoryId: 4, palBasal: 1.75,
  sexDataProvided: true, equation: 'ten-haaf',
  equationChosenBy: 'coach', athleteDeclared: true, updatedBy: 'coach'
};
/* El bloque de resultado EXACTO que escribe faComputeMine. */
const RESULTADO = {
  rmrKcal: 1900.5, tdeeKcal: 3610.9, equationUsed: 'mifflin-st-jeor',
  equationVersion: 'mifflin-st-jeor@1.0',
  inputsSnapshot: { weightKg: 90, weightDate: '2026-11-02', heightCm: 174, ageYears: 27, palBasal: 1.9 },
  sexConstantApplied: true, uncertaintyNote: 'nota', computedBy: 'alu'
};
const resultadoDe = (uid) => ({ ...RESULTADO, computedAt: serverTimestamp(), computedBy: uid });

await seedUser('alu');
await seedUser('alu2');
await seedUser('alu3');
await seedUser('alu4');
await seedUser('alu5');
await seedUser('otra');
await seedUser('coach', { role: 'entrenador', trainerUid: null });
await seedAsmt('alu', { ...SIN_ECUACION });
await seedAsmt('alu4', { ...SIN_ECUACION, updatedBy: 'alu4' });
await seedAsmt('otra', { ...CON_ELECCION });

// ---- EL DELTA D1: la ecuación automática nace en la sesión del alumno ----
await T('EQ1 la PROPIA escribe su RESULTADO + equation mifflin + equationOrigin "auto" (sin elección previa): ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  wAsmt(dbOf('alu'), 'alu', { ...resultadoDe('alu'), equation: 'mifflin-st-jeor', equationOrigin: 'auto' }), ESPERA_DELTA_OK);
await T('EQ15 tras el nacimiento automático, su ENTRENADOR ajusta la ecuación (ten-haaf + chosenBy + origin "trainer"): ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  wAsmt(dbOf('coach'), 'alu', { equation: 'ten-haaf', equationChosenBy: 'coach', equationChosenAt: serverTimestamp(), equationOrigin: 'trainer', updatedAt: serverTimestamp(), updatedBy: 'coach' }), ESPERA_DELTA_OK);
await T('EQ6 el ENTRENADOR asignado elige la ecuación de otra alumna sin ecuación y estampa origin "trainer": ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  wAsmt(dbOf('coach'), 'alu4', { equation: 'mifflin-st-jeor', equationChosenBy: 'coach', equationChosenAt: serverTimestamp(), equationOrigin: 'trainer', updatedAt: serverTimestamp(), updatedBy: 'coach' }), ESPERA_DELTA_OK);
await T('EQ14 el ENTRENADOR CREA la ficha de su alumna con ecuación y origin "trainer": ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(asmt(dbOf('coach'), 'alu3'), { birthYear: 1990, heightCm: 160, activityCategoryId: 3, palBasal: 1.6, equation: 'mifflin-st-jeor', equationChosenBy: 'coach', equationChosenAt: serverTimestamp(), equationOrigin: 'trainer', updatedAt: serverTimestamp(), updatedBy: 'coach' }), ESPERA_DELTA_OK);

// ---- Formas prohibidas: denegadas en AMBOS textos ----
await T('EQ2 la PROPIA intenta hacer nacer "ten-haaf" como automática: denegado en ambos textos',
  wAsmt(dbOf('alu4'), 'alu4', { equation: 'ten-haaf', equationOrigin: 'auto' }), false);
await T('EQ3 la PROPIA intenta REESCRIBIR como "auto" una ecuación que su entrenador ya eligió (hay equationChosenBy): denegado en ambos textos',
  wAsmt(dbOf('otra'), 'otra', { equation: 'mifflin-st-jeor', equationOrigin: 'auto' }), false);
await T('EQ4 la PROPIA intenta escribir equationChosenBy: denegado en ambos textos',
  wAsmt(dbOf('alu4'), 'alu4', { equationChosenBy: 'alu4' }), false);
await T('EQ5 la PROPIA intenta estampar equationOrigin "trainer": denegado en ambos textos',
  wAsmt(dbOf('alu4'), 'alu4', { equationOrigin: 'trainer' }), false);
await T('EQ7 el ENTRENADOR intenta estampar equationOrigin "auto": denegado en ambos textos',
  wAsmt(dbOf('coach'), 'alu4', { equationOrigin: 'auto' }), false);
await T('EQ11 OTRA usuaria (no asignada) escribe la ecuación automática en la ficha de alu: denegado en ambos textos',
  wAsmt(dbOf('otra'), 'alu', { equation: 'mifflin-st-jeor', equationOrigin: 'auto' }), false);
await T('EQ13 la PROPIA CREA su ficha ya con ecuación (su rama de creación no la admite): denegado en ambos textos',
  setDoc(asmt(dbOf('alu5'), 'alu5'), { birthYear: 1999, heightCm: 170, equation: 'mifflin-st-jeor', updatedAt: serverTimestamp(), updatedBy: 'alu5' }), false);

// ---- REGRESIÓN: la ficha se comporta idéntica sin el delta ----
await T('EQ8 la PROPIA actualiza su año de nacimiento (dato de fundamento): admitido en ambos textos',
  wAsmt(dbOf('alu4'), 'alu4', { birthYear: 1999, updatedAt: serverTimestamp(), updatedBy: 'alu4' }), true);
await T('EQ9 la PROPIA escribe SOLO su bloque de resultado (sin llaves de ecuación): admitido en ambos textos',
  wAsmt(dbOf('alu4'), 'alu4', resultadoDe('alu4')), true);
await T('EQ10 la PROPIA escribe su señal sexDataProvided: admitido en ambos textos',
  wAsmt(dbOf('alu4'), 'alu4', { sexDataProvided: true }), true);
await T('EQ12 la PROPIA CREA su ficha solo con datos de fundamento: admitido en ambos textos',
  setDoc(asmt(dbOf('alu2'), 'alu2'), { birthYear: 1999, heightCm: 170, activityCategoryId: 3, palBasal: 1.6, updatedAt: serverTimestamp(), updatedBy: 'alu2' }), true);

console.log('== ' + NOMBRE + ': ' + pass + ' PASS · ' + fail + ' FAIL ==');
console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS');
if (fail) { console.log('FALLOS: ' + failures.join(' | ')); process.exit(1); }
await testEnv.cleanup();
