// RONBO FIT — Batería CI del delta de reglas de «Repetir día /
// Repetir semana» (2026-10-29): autoría propia del alumno SIN
// entrenador (Q4) + canal de propuestas Q5.
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
//
// EL DELTA (único, sobre el texto vivo f91e6f97 = ruleset
// f5352f7c): helper nuevo selfAuthorNoTrainer() (aprobado y
// users.trainerUid vacío en el PROPIO documento) y, en match
// /training_plans/{docId}, la línea combinada create/update/
// delete se separa: create y update ganan la rama «…o el propio
// alumno sin entrenador sobre SU clientUid»; delete conserva la
// expresión viva exacta. Candidato SHA-256 cba128f2…
//
// ESTA suite corre contra el texto VIVO. La suite gemela
// (pruebas-reglas-repetir-vivo) corre los MISMOS 21 casos contra
// el texto VIVO con CUATRO expectativas invertidas (R1, R2, R3 y
// R21: la autoría propia que el delta abre). Todos los demás
// casos —incluida la superficie Q5 entera, que NO necesita
// delta— se comportan igual en ambos textos: el contraste prueba
// que el delta es justo lo que cambia, ni más ni menos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, collection, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp
} from 'firebase/firestore';

const ESPERA_AUTOR_PROPIO = false;  // R1/R2/R3/R21: la rama que el delta ABRE
const NOMBRE = 'REPETIR-VIVO';

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
  const base = { acceptedTerms: true, isOwner: false, approved: false, role: 'usuario', assignmentStatus: 'waiting' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', email: 'owner@test.local', isOwner: true, approved: true, role: 'administrador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Uno', email: 't1@test.local', approved: true, role: 'entrenador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Dos', email: 't2@test.local', approved: true, role: 'entrenador', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'free1'), { ...base, name: 'Alumno Libre', email: 'free1@test.local', approved: true });
  await setDoc(doc(db, 'users', 'free2'), { ...base, name: 'Alumno Libre Dos', email: 'free2@test.local', approved: true, trainerUid: '' });
  await setDoc(doc(db, 'users', 'with1'), { ...base, name: 'Alumno Con Entrenador', email: 'with1@test.local', approved: true, trainerUid: 'trainer1', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'unapproved1'), { ...base, name: 'Alumno Sin Aprobar', email: 'unap@test.local', approved: false });
  const plan = (clientUid, title) => ({ clientUid, title, notes: '', days: [{ label: 'Día 1', exercises: [{ name: 'Squat', sets: '4', reps: '8', note: '' }] }], active: true, startsAt: '2026-10-26', endsAt: '2026-11-08' });
  await setDoc(doc(db, 'training_plans', 'planT'), plan('with1', 'Plan de with1'));
  await setDoc(doc(db, 'training_plans', 'planFree'), plan('free1', 'Plan de free1'));
  await setDoc(doc(db, 'training_plans', 'planDel'), plan('with1', 'Plan para borrar'));
});

const dbAs = uid => testEnv.authenticatedContext(uid).firestore();
const owner = dbAs('owner1'), tr1 = dbAs('trainer1'), tr2 = dbAs('trainer2');
const free1 = dbAs('free1'), free2 = dbAs('free2'), with1 = dbAs('with1'), unap = dbAs('unapproved1');
const newPlan = clientUid => ({ clientUid, title: 'Copia', notes: '', days: [{ label: 'Día 1', exercises: [{ name: 'Squat', sets: '4', reps: '8', note: '' }] }], active: false, startsAt: '2026-11-09', endsAt: '2026-11-22', createdAt: serverTimestamp() });

// ---- Autoría propia del alumno sin entrenador (el delta) ----
await T('R1 alumno sin entrenador (sin campo trainerUid) CREA su propio plan', addDoc(collection(free1, 'training_plans'), newPlan('free1')), ESPERA_AUTOR_PROPIO);
await T('R2 alumno sin entrenador CREA su propia instantánea de guardado (§6.4, misma colección)', addDoc(collection(free1, 'training_plans'), { ...newPlan('free1'), isSnapshot: true, sourcePlanId: 'planFree', active: false }), ESPERA_AUTOR_PROPIO);
await T('R3 alumno sin entrenador ACTUALIZA su propio plan (merge)', setDoc(doc(free1, 'training_plans', 'planFree'), { title: 'Plan de free1 v2' }, { merge: true }), ESPERA_AUTOR_PROPIO);
await T('R21 alumno sin entrenador (trainerUid cadena vacía) CREA su propio plan', addDoc(collection(free2, 'training_plans'), newPlan('free2')), ESPERA_AUTOR_PROPIO);
await T('R4 alumno sin entrenador crea un plan para OTRO clientUid', addDoc(collection(free1, 'training_plans'), newPlan('with1')), false);
await T('R5 alumno sin entrenador actualiza el plan de OTRO', setDoc(doc(free1, 'training_plans', 'planT'), { title: 'Ajeno' }, { merge: true }), false);
await T('R6 alumno sin entrenador BORRA su propio plan (delete NO se amplía)', deleteDoc(doc(free1, 'training_plans', 'planFree')), false);
await T('R7 alumno CON entrenador crea su propio plan (la vía se cierra con la asignación)', addDoc(collection(with1, 'training_plans'), newPlan('with1')), false);
await T('R8 alumno CON entrenador actualiza su propio plan (autoría del entrenador)', setDoc(doc(with1, 'training_plans', 'planT'), { title: 'Mío' }, { merge: true }), false);
await T('R9 alumno NO aprobado crea su propio plan', addDoc(collection(unap, 'training_plans'), newPlan('unapproved1')), false);

// ---- Vías de siempre: entrenador asignado / no asignado / propietario ----
await T('R10 entrenador ASIGNADO crea un plan para su cliente', addDoc(collection(tr1, 'training_plans'), newPlan('with1')), true);
await T('R11 entrenador ASIGNADO actualiza el plan de su cliente', setDoc(doc(tr1, 'training_plans', 'planT'), { title: 'Plan de with1 v2' }, { merge: true }), true);
await T('R12 entrenador NO asignado crea un plan para el cliente de otro', addDoc(collection(tr2, 'training_plans'), newPlan('with1')), false);
await T('R13 propietario crea un plan para cualquier cliente', addDoc(collection(owner, 'training_plans'), newPlan('with1')), true);
await T('R14 propietario BORRA un plan (delete intacto)', deleteDoc(doc(owner, 'training_plans', 'planDel')), true);

// ---- Lecturas (sin cambios) ----
await T('R15 alumno lee SU propio plan', getDoc(doc(free1, 'training_plans', 'planFree')), true);
await T('R16 alumno lee el plan de OTRO', getDoc(doc(free1, 'training_plans', 'planT')), false);
await T('R17 alumno lista SOLO sus planes (consulta acotada por clientUid)', getDocs(query(collection(free1, 'training_plans'), where('clientUid', '==', 'free1'))), true);

// ---- Q5: propuestas por el canal planProposal (SIN delta) ----
await T('R18 alumno CON entrenador crea su propuesta planProposal type=repeatWeek', setDoc(doc(with1, 'nutrition_progress', 'with1_prop_1'), { kind: 'planProposal', ownerUid: 'with1', uid: 'with1', planId: 'planT', planTitle: 'Plan de with1', type: 'repeatWeek', dayIndex: null, dayLabel: '', sourceLogId: null, sourceLogDate: null, note: '', status: 'pending', createdAt: serverTimestamp() }), true);
await T('R19 su entrenador ASIGNADO decide la propuesta (merge de estado)', setDoc(doc(tr1, 'nutrition_progress', 'with1_prop_1'), { status: 'approved', decidedBy: 'trainer1' }, { merge: true }), true);
await T('R20 alumno crea una propuesta con ownerUid AJENO', setDoc(doc(with1, 'nutrition_progress', 'free1_prop_9'), { kind: 'planProposal', ownerUid: 'free1', uid: 'free1', planId: 'planFree', planTitle: 'Plan de free1', type: 'repeatDay', dayIndex: 0, dayLabel: 'Día 1', sourceLogId: null, sourceLogDate: null, note: '', status: 'pending', createdAt: serverTimestamp() }), false);

console.log(`${NOMBRE}: ${pass}/${pass + fail} PASS` + (failures.length ? ' — fallos: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
