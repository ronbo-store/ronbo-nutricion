// RONBO FIT — Batería CI del delta de reglas «Atleta y ritmo en
// la tarjeta de cálculo» (punto 129 de la cola; AUTH-2026-11-03-208).
// Pedido de Ronald (chat RONBO.NUTRI, 2026-11-03 18:31 CST):
// «Quiero poder quitarle el perfil de atleta» — desde la tarjeta
// «Cálculo energético» de la ficha de SU alumno. Usuarios
// FICTICIOS, emulador oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 7ac4667a-f9d3-4b7f-ae47-4e521f986c80): SOLO el bloque
// assessment/{docId}, ramas del entrenador —
//  (1) create y update admiten 'athleteDeclared',
//      'athleteDeclaredAt' y 'athleteDeclaredBy' con validación
//      (booleano; sello == tiempo de la petición; autor ==
//      quien pide);
//  (2) la cláusula equationOrigin del update admite, además de
//      'trainer', la forma exacta de la caída a la base
//      automática: origen 'auto' SOLO con la ecuación resultante
//      en 'mifflin-st-jeor', el atleta resultante en falso y SIN
//      equationChosenBy en el documento resultante.
// La rama del alumno NO se toca. El ritmo (paceSuggestion, en
// users) NO forma parte del delta: su escritura del entrenador
// ya es la viva y se prueba como vecino intacto.
//
// La suite corre en DOS modos con la misma lista de casos:
//   ESPERA_NUEVO=true  → reglas = CANDIDATA (el delta se
//                        comporta como se diseñó)
//   ESPERA_NUEVO=false → reglas = texto VIVO (el delta no
//                        existe: el entrenador no puede tocar el
//                        atleta; los vecinos no cambian)
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteField, Timestamp
} from 'firebase/firestore';
import { appendFileSync } from 'node:fs';

process.on('unhandledRejection', (e) => {
  const msg = String(e && e.message || e).slice(0, 300).replace(/[\r\n]+/g, ' ');
  try { appendFileSync('fallos.txt', 'ARRANQUE :: ' + msg + '\n'); } catch {}
  console.log('::error title=ARRANQUE::' + msg);
});

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const N = ESPERA_NUEVO; // expectativa de los casos del delta

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
    const msg = String(e && e.message || e).slice(0, 200).replace(/[\r\n]+/g, ' ');
    console.log('FAIL — ' + name + ' :: ' + msg);
    console.log('::error title=' + name + '::' + msg);
    try { appendFileSync('fallos.txt', name + ' :: ' + msg + '\n'); } catch {}
  }
}

const dbOf = (uid) => uid ? testEnv.authenticatedContext(uid).firestore()
  : testEnv.unauthenticatedContext().firestore();
const D = (uid, ...parts) => doc(dbOf(uid), ...parts);
const ASMT = (uid, who) => D(who, 'users', uid, 'assessment', 'current');

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path.split('/')), data);
  });
}
async function seedUser(uid, extra) {
  await seed('users/' + uid, Object.assign({
    name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
    isOwner: false, approved: true
  }, extra || {}));
}

/* ── Siembra ── */
await seedUser('dueno', { isOwner: true, role: 'administrador', approved: false });
await seedUser('entrena', { role: 'entrenador' });
await seedUser('otro', { role: 'entrenador' });
await seedUser('alumna', { trainerUid: 'entrena', assignmentStatus: 'assigned' });
await seedUser('alumna2', { trainerUid: 'entrena', assignmentStatus: 'assigned' });
const ASMT_BASE = {
  birthYear: 1993, heightCm: 165, goal: 'bajar',
  equation: 'ten-haaf', equationChosenBy: 'entrena',
  equationChosenAt: Timestamp.fromMillis(1762000000000), equationOrigin: 'trainer',
  palBasal: 1.55, activityCategoryId: 3, sexDataProvided: true,
  athleteDeclared: true, athleteDeclaredAt: Timestamp.fromMillis(1761700000000),
  rmrKcal: 1629, tdeeKcal: 2525, equationUsed: 'ten-haaf',
  computedAt: Timestamp.fromMillis(1762100000000)
};
await seed('users/alumna/assessment/current', ASMT_BASE);

const ST = () => serverTimestamp();
const selloEntrena = { athleteDeclaredAt: ST(), athleteDeclaredBy: 'entrena', updatedAt: ST(), updatedBy: 'entrena' };

/* ── El delta: el entrenador asignado y el atleta de SU alumna ── */
await T('entrena retira el atleta (update simple, sellado)',
  updateDoc(ASMT('alumna', 'entrena'), { athleteDeclared: false, ...selloEntrena }), N);
await seed('users/alumna/assessment/current', ASMT_BASE);
await T('entrena repone el atleta (update simple, sellado)',
  updateDoc(ASMT('alumna', 'entrena'), { athleteDeclared: true, ...selloEntrena }), N);
await seed('users/alumna/assessment/current', ASMT_BASE);
await T('entrena retira el atleta CON Ten Haaf vigente: caída a la base automática (Mifflin, origen auto, firma borrada)',
  updateDoc(ASMT('alumna', 'entrena'), {
    athleteDeclared: false, ...selloEntrena,
    equation: 'mifflin-st-jeor', equationOrigin: 'auto',
    equationChosenBy: deleteField(), equationChosenAt: deleteField()
  }), N);
await seed('users/alumna/assessment/current', ASMT_BASE);
await T('entrena CREA la evaluación de alumna2 ya con el atleta sellado',
  setDoc(ASMT('alumna2', 'entrena'), {
    birthYear: 1998, heightCm: 174, palBasal: 1.55, activityCategoryId: 3,
    equation: 'mifflin-st-jeor', equationOrigin: 'trainer',
    equationChosenBy: 'entrena', equationChosenAt: ST(),
    athleteDeclared: true, athleteDeclaredAt: ST(), athleteDeclaredBy: 'entrena',
    updatedAt: ST(), updatedBy: 'entrena'
  }), N);

/* ── Las formas prohibidas de la caída y del sello (deniegan en AMBAS) ── */
await T('origen auto SIN retirar el atleta: denegado',
  updateDoc(ASMT('alumna', 'entrena'), {
    athleteDeclared: true, ...selloEntrena,
    equation: 'mifflin-st-jeor', equationOrigin: 'auto',
    equationChosenBy: deleteField(), equationChosenAt: deleteField()
  }), false);
await T('origen auto CONSERVANDO la firma del entrenador: denegado',
  updateDoc(ASMT('alumna', 'entrena'), {
    athleteDeclared: false, ...selloEntrena,
    equation: 'mifflin-st-jeor', equationOrigin: 'auto'
  }), false);
await T('origen auto con la ecuación en Ten Haaf: denegado',
  updateDoc(ASMT('alumna', 'entrena'), {
    athleteDeclared: false, ...selloEntrena,
    equation: 'ten-haaf', equationOrigin: 'auto',
    equationChosenBy: deleteField(), equationChosenAt: deleteField()
  }), false);
await T('sello de autor distinto de quien pide (athleteDeclaredBy = otro): denegado',
  updateDoc(ASMT('alumna', 'entrena'), {
    athleteDeclared: false, athleteDeclaredAt: ST(), athleteDeclaredBy: 'otro',
    updatedAt: ST(), updatedBy: 'entrena'
  }), false);
await T('sello de tiempo que no es el de la petición: denegado',
  updateDoc(ASMT('alumna', 'entrena'), {
    athleteDeclared: false, athleteDeclaredAt: Timestamp.fromMillis(1761700000000),
    athleteDeclaredBy: 'entrena', updatedAt: ST(), updatedBy: 'entrena'
  }), false);
await T('athleteDeclared que no es booleano: denegado',
  updateDoc(ASMT('alumna', 'entrena'), { athleteDeclared: 'sí', ...selloEntrena }), false);

/* ── Vecinos intactos (misma expectativa en candidata y en vivo) ── */
await T('el entrenador NO asignado no toca el atleta: denegado',
  updateDoc(ASMT('alumna', 'otro'), { athleteDeclared: false, athleteDeclaredAt: ST(), athleteDeclaredBy: 'otro', updatedAt: ST(), updatedBy: 'otro' }), false);
await T('la alumna conserva SU declaración en su propio flujo (la escritura exacta de su sesión)',
  updateDoc(ASMT('alumna', 'alumna'), { athleteDeclared: false, athleteDeclaredAt: ST() }), true);
await seed('users/alumna/assessment/current', ASMT_BASE);
await T('el entrenador sigue sin poder escribir la señal de sexo aportado: denegado',
  updateDoc(ASMT('alumna', 'entrena'), { sexDataProvided: false, updatedAt: ST(), updatedBy: 'entrena' }), false);
await T('el entrenador sigue eligiendo la ecuación como hoy (origen trainer)',
  updateDoc(ASMT('alumna', 'entrena'), {
    equation: 'mifflin-st-jeor', equationChosenBy: 'entrena', equationChosenAt: ST(),
    equationOrigin: 'trainer', updatedAt: ST(), updatedBy: 'entrena'
  }), true);
await seed('users/alumna/assessment/current', ASMT_BASE);
await T('el ritmo NO es del delta: el entrenador decide paceSuggestion en users como hoy',
  setDoc(D('entrena', 'users', 'alumna'), {
    paceSuggestion: { paceKcal: 500, suggestedAt: '2026-10-30T12:00:00Z', status: 'replaced', decidedPaceKcal: 750, decidedBy: 'entrena', decidedAt: '2026-11-03T12:00:00Z' }
  }, { merge: true }), true);
await T('el propietario puede lo de siempre, también el atleta',
  updateDoc(ASMT('alumna', 'dueno'), { athleteDeclared: false, athleteDeclaredAt: ST(), athleteDeclaredBy: 'dueno', updatedAt: ST(), updatedBy: 'dueno' }), true);
await T('sin sesión no se toca nada: denegado',
  updateDoc(ASMT('alumna', null), { athleteDeclared: false }), false);

console.log(`\n===== CI ATLETA (${ESPERA_NUEVO ? 'CANDIDATA' : 'VIVO'}): ${pass}/${pass + fail} PASS =====`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' - ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
