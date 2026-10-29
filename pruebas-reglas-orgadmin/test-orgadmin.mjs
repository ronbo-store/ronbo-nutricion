// RONBO FIT — Batería CI del delta de reglas de la
// «Organización de Administración» (2026-10-28): captura de la
// bitácora ND-2 por el ENTRENADOR asignado.
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
//
// EL DELTA (único, sobre el texto vivo f91e6f97 = ruleset
// f5352f7c): en match /access_log/{logId}, el allow create pasa
// de «solo el propietario» a «la misma forma exacta Y (el
// propietario O un entrenador aprobado asignado a ese cliente)»
// — isTrainerUser() && isApprovedUser() &&
// isAssignedTrainerOf(clientUid), helpers que YA existen en el
// texto vivo. Lectura (solo propietario), update (denegado a
// todos, append-only) y delete (solo propietario) NO cambian.
// Candidato SHA-256 ce0962bb…
//
// ESTA suite corre contra el CANDIDATO. La suite gemela
// (pruebas-reglas-orgadmin-vivo) corre los MISMOS 16 casos
// contra el texto VIVO con UNA expectativa invertida: L2 (el
// entrenador asignado crea su registro) es DENEGADO en el texto
// vivo — es justo el hueco que el delta cierra. Todos los
// demás casos se comportan igual en ambos textos: el contraste
// prueba que el delta es justo lo que cambia, ni más ni menos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, collection, addDoc, setDoc, updateDoc, deleteDoc, getDocs, serverTimestamp
} from 'firebase/firestore';

const ESPERA_ENTRENADOR_CREAR = true;  // L2: la rama que el delta ABRE
const NOMBRE = 'ORGADMIN-CANDIDATO';

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
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: false,
    role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', email: 'owner@test.local', isOwner: true, approved: true, role: 'administrador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Uno', email: 't1@test.local', approved: true, role: 'entrenador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Dos', email: 't2@test.local', approved: true, role: 'entrenador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'trainer3'), { ...base, name: 'Entrenador Sin Aprobar', email: 't3@test.local', approved: false, role: 'entrenador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'student1'), { ...base, name: 'Alumno Uno', email: 's1@test.local', approved: true, trainerUid: 'trainer1', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'student2'), { ...base, name: 'Alumno Dos', email: 's2@test.local', approved: true, trainerUid: 'trainer2', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'student3'), { ...base, name: 'Alumno Tres', email: 's3@test.local', approved: true, trainerUid: 'trainer3', assignmentStatus: 'assigned' });
  // Un registro previo del propietario (para lectura/update/delete)
  await setDoc(doc(db, 'access_log', 'logprev'), { viewerUid: 'owner1', clientUid: 'student1', zone: 'evaluations', at: new Date('2026-10-24T03:19:11Z') });
});

const dbAs = uid => testEnv.authenticatedContext(uid).firestore();
const dbAnon = () => testEnv.unauthenticatedContext().firestore();
const logDoc = (viewer, client) => ({ viewerUid: viewer, clientUid: client, zone: 'evaluations', at: serverTimestamp() });

// ---- Casos ----
const owner = dbAs('owner1'), tr1 = dbAs('trainer1'), tr2 = dbAs('trainer2'), tr3 = dbAs('trainer3'), st1 = dbAs('student1');

await T('L1 propietario crea un registro válido de un cliente', addDoc(collection(owner, 'access_log'), logDoc('owner1', 'student1')), true);
await T('L2 entrenador APROBADO y ASIGNADO crea el registro de SU cliente', addDoc(collection(tr1, 'access_log'), logDoc('trainer1', 'student1')), ESPERA_ENTRENADOR_CREAR);
await T('L3 entrenador aprobado NO asignado a ese cliente', addDoc(collection(tr2, 'access_log'), logDoc('trainer2', 'student1')), false);
await T('L4 entrenador asignado pero NO aprobado', addDoc(collection(tr3, 'access_log'), logDoc('trainer3', 'student3')), false);
await T('L5 entrenador registra a nombre de OTRO (viewerUid ajeno)', addDoc(collection(tr1, 'access_log'), logDoc('owner1', 'student1')), false);
await T('L6 entrenador se registra mirándose a SÍ mismo', addDoc(collection(tr1, 'access_log'), logDoc('trainer1', 'trainer1')), false);
await T('L7 zona distinta de evaluations', addDoc(collection(tr1, 'access_log'), { viewerUid: 'trainer1', clientUid: 'student1', zone: 'profile', at: serverTimestamp() }), false);
await T('L8 campo extra en el registro', addDoc(collection(tr1, 'access_log'), { ...logDoc('trainer1', 'student1'), detail: 'x' }), false);
await T('L9 at con hora del cliente (no serverTimestamp)', addDoc(collection(tr1, 'access_log'), { viewerUid: 'trainer1', clientUid: 'student1', zone: 'evaluations', at: new Date() }), false);
await T('L10 un ALUMNO intenta crear un registro', addDoc(collection(st1, 'access_log'), logDoc('student1', 'student2')), false);
await T('L11 un anónimo intenta crear un registro', addDoc(collection(dbAnon(), 'access_log'), logDoc('trainer1', 'student1')), false);
await T('L12 el propietario LEE la bitácora (list)', getDocs(collection(owner, 'access_log')), true);
await T('L13 un entrenador NO puede leer la bitácora', getDocs(collection(tr1, 'access_log')), false);
await T('L14 update denegado a TODOS (ni el propietario reescribe)', updateDoc(doc(owner, 'access_log', 'logprev'), { zone: 'evaluations' }), false);
await T('L15 el propietario puede borrar (purga de retención)', deleteDoc(doc(owner, 'access_log', 'logprev')), true);
await T('L16 un entrenador NO puede borrar registros', deleteDoc(doc(tr1, 'access_log', 'logprev')), false);

console.log(`\n${NOMBRE}: ${pass} PASS · ${fail} FAIL`);
if (failures.length) console.log('Fallos: ' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
