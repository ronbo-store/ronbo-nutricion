// RONBO NUTRI — Batería CI del delta N-09 (permisos de biblioteca y
// plantillas). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción. Banco de reglas: ./firestore.rules (generado por
// build-fixture.py = candidato de la línea N-07 + delta N-09; es un
// fixture de pruebas, NO un candidato de publicación).
// Matriz ejercitada: admin/entrenador/usuario × biblioteca × tres
// clases de plantilla × leer/crear/modificar/borrar.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, collection, addDoc,
  updateDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';

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
async function TList(name, db, mustHave, mustNotHave) {
  try {
    const snap = await getDocs(collection(db, 'routine_templates'));
    const ids = snap.docs.map(d => d.id);
    const ok = mustHave.every(i => ids.includes(i)) && mustNotHave.every(i => !ids.includes(i));
    if (!ok) throw new Error('ids=' + ids.join(','));
    pass++; console.log('PASS — ' + name);
  } catch (e) {
    fail++; failures.push(name);
    console.log('FAIL — ' + name + ' :: ' + String(e && e.message || e).slice(0, 140));
  }
}

// ---- Seed (sin reglas): usuarios y documentos de las tres clases ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Uno', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Dos', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'clientW'), { ...base, name: 'Cliente Espera', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting' });
  await setDoc(doc(db, 'users', 'noob1'), { ...base, name: 'Sin Aprobar', approved: false, role: 'usuario' });
  await setDoc(doc(db, 'exercise_library', 'E001'), { nombre_es: 'Sentadilla', nombre_en: 'Squat' });
  await setDoc(doc(db, 'exercise_library', 'EDEL'), { nombre_es: 'Borrable', nombre_en: 'Deletable' });
  const days = [{ dia_num: 1, dia_nombre_es: 'Día 1', dia_nombre_en: 'Day 1', exercises: [{ exerciseId: 'E001', series: '4', repeticiones: '8-10' }] }];
  // RF: LEGADA, sin visibility ni autoría → factory por defecto.
  await setDoc(doc(db, 'routine_templates', 'RF'), { nombre_es: 'Fábrica legada', nombre_en: 'Legacy factory', dias_por_semana: 1, days, session: [] });
  await setDoc(doc(db, 'routine_templates', 'TF1'), { nombre_es: 'Del entrenador 1', nombre_en: 'Trainer one', dias_por_semana: 1, days, session: [], visibility: 'trainer', createdBy: 'trainer1', createdByName: 'Entrenador Uno', ownerUid: 'trainer1' });
  await setDoc(doc(db, 'routine_templates', 'TF2'), { nombre_es: 'Del entrenador 2', nombre_en: 'Trainer two', dias_por_semana: 1, days, session: [], visibility: 'trainer', createdBy: 'trainer2', createdByName: 'Entrenador Dos', ownerUid: 'trainer2' });
  await setDoc(doc(db, 'routine_templates', 'PV1'), { nombre_es: 'Privada de A', nombre_en: 'A private', dias_por_semana: 1, days, session: [], visibility: 'private', createdBy: 'clientA', createdByName: 'Cliente A', ownerUid: 'clientA' });
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const tr2 = testEnv.authenticatedContext('trainer2').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const W = testEnv.authenticatedContext('clientW').firestore();
const noob = testEnv.authenticatedContext('noob1').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const LIB = (db, id) => doc(db, 'exercise_library', id);
const TPL = (db, id) => doc(db, 'routine_templates', id);
const tplDoc = (over = {}) => ({
  nombre_es: 'Nueva', nombre_en: 'New', dias_por_semana: 1,
  days: [{ dia_num: 1, dia_nombre_es: 'Día 1', dia_nombre_en: 'Day 1', exercises: [{ exerciseId: 'E001', series: '4', repeticiones: '10' }] }],
  session: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  ...over,
});

// ============ BIBLIOTECA: leer todos los roles; escribir solo admin ============
await T('L1 biblioteca: leer un ejercicio como cliente aprobado', getDoc(LIB(A, 'E001')), true);
await T('L2 biblioteca: leer sin aprobar', getDoc(LIB(noob, 'E001')), false);
await T('L3 biblioteca: leer anónimo', getDoc(LIB(anon, 'E001')), false);
await T('L4 biblioteca: crear como administrador', addDoc(collection(owner, 'exercise_library'), { nombre_es: 'Nuevo', nombre_en: 'New' }), true);
await T('L5 biblioteca: crear como entrenador', addDoc(collection(tr1, 'exercise_library'), { nombre_es: 'X', nombre_en: 'X' }), false);
await T('L6 biblioteca: crear como usuario', addDoc(collection(A, 'exercise_library'), { nombre_es: 'X', nombre_en: 'X' }), false);
await T('L7 biblioteca: modificar como administrador', updateDoc(LIB(owner, 'E001'), { nombre_es: 'Sentadilla!' }), true);
await T('L8 biblioteca: modificar como entrenador', updateDoc(LIB(tr1, 'E001'), { nombre_es: 'Hack' }), false);
await T('L9 biblioteca: borrar como entrenador', deleteDoc(LIB(tr1, 'EDEL')), false);
await T('L10 biblioteca: borrar como administrador', deleteDoc(LIB(owner, 'EDEL')), true);

// ============ PLANTILLAS: lectura por clase ============
await T('R1 fábrica legada (sin visibility): la lee un cliente en espera', getDoc(TPL(W, 'RF')), true);
await T('R2 fábrica legada: la lee el cliente ASIGNADO (resolución 23:15, lectura para todos)', getDoc(TPL(A, 'RF')), true);
await T('R3 de entrenador: la lee su autor', getDoc(TPL(tr1, 'TF1')), true);
await T('R4 de entrenador: NO la lee otro entrenador', getDoc(TPL(tr2, 'TF1')), false);
await T('R5 de entrenador: NO la lee un cliente (ni el asignado a ese entrenador)', getDoc(TPL(A, 'TF1')), false);
await T('R6 de entrenador: la lee el administrador', getDoc(TPL(owner, 'TF1')), true);
await T('R7 privada: la lee su dueño', getDoc(TPL(A, 'PV1')), true);
await T('R8 privada: NO la lee otro cliente', getDoc(TPL(W, 'PV1')), false);
await T('R9 privada: NO la lee el entrenador asignado del dueño', getDoc(TPL(tr1, 'PV1')), false);
await T('R10 privada: la lee el administrador (ve todo)', getDoc(TPL(owner, 'PV1')), true);
await TList('R11 list del entrenador 2: ve fábrica + la suya; NO TF1 ni PV1', tr2, ['RF', 'TF2'], ['TF1', 'PV1']);
await TList('R12 list del cliente en espera: solo fábrica', W, ['RF'], ['TF1', 'TF2', 'PV1']);
await TList('R13 list del cliente asignado: fábrica + su privada; NO las de entrenador', A, ['RF', 'PV1'], ['TF1', 'TF2']);

// ============ PLANTILLAS: crear (autoría veraz, clase por rol) ============
await T('C1 entrenador crea plantilla DE ENTRENADOR con su autoría', addDoc(collection(tr1, 'routine_templates'), tplDoc({ visibility: 'trainer', createdBy: 'trainer1', createdByName: 'Entrenador Uno', ownerUid: 'trainer1', updatedBy: 'trainer1' })), true);
await T('C2 entrenador NO crea de fábrica', addDoc(collection(tr1, 'routine_templates'), tplDoc({ visibility: 'factory', createdBy: 'trainer1', createdByName: 'Entrenador Uno', ownerUid: 'trainer1', updatedBy: 'trainer1' })), false);
await T('C3 entrenador NO crea privada para un cliente (ownerUid ajeno)', addDoc(collection(tr1, 'routine_templates'), tplDoc({ visibility: 'private', createdBy: 'trainer1', createdByName: 'Entrenador Uno', ownerUid: 'clientA', updatedBy: 'trainer1' })), false);
await T('C4 entrenador NO suplantar autoría (createdBy de otro)', addDoc(collection(tr1, 'routine_templates'), tplDoc({ visibility: 'trainer', createdBy: 'trainer2', createdByName: 'Entrenador Dos', ownerUid: 'trainer1', updatedBy: 'trainer1' })), false);
await T('C5 crear sin createdAt del servidor (fecha fija)', addDoc(collection(tr1, 'routine_templates'), tplDoc({ visibility: 'trainer', createdBy: 'trainer1', createdByName: 'Entrenador Uno', ownerUid: 'trainer1', updatedBy: 'trainer1', createdAt: new Date('2020-01-01') })), false);
await T('C6 usuario crea su PRIVADA', addDoc(collection(A, 'routine_templates'), tplDoc({ visibility: 'private', createdBy: 'clientA', createdByName: 'Cliente A', ownerUid: 'clientA', updatedBy: 'clientA' })), true);
await T('C7 usuario NO crea de entrenador', addDoc(collection(A, 'routine_templates'), tplDoc({ visibility: 'trainer', createdBy: 'clientA', createdByName: 'Cliente A', ownerUid: 'clientA', updatedBy: 'clientA' })), false);
await T('C8 usuario NO crea de fábrica', addDoc(collection(A, 'routine_templates'), tplDoc({ visibility: 'factory', createdBy: 'clientA', createdByName: 'Cliente A', ownerUid: 'clientA', updatedBy: 'clientA' })), false);
await T('C9 crear con un campo fuera de la lista cerrada', addDoc(collection(A, 'routine_templates'), tplDoc({ visibility: 'private', createdBy: 'clientA', createdByName: 'Cliente A', ownerUid: 'clientA', updatedBy: 'clientA', role: 'administrador' })), false);
await T('C10 administrador crea de FÁBRICA', addDoc(collection(owner, 'routine_templates'), tplDoc({ visibility: 'factory', createdBy: 'owner1', createdByName: 'Admin Ficticio', ownerUid: null, updatedBy: 'owner1' })), true);
await T('C11 administrador crea DE ENTRENADOR (actúa como entrenador, N-07.2)', addDoc(collection(owner, 'routine_templates'), tplDoc({ visibility: 'trainer', createdBy: 'owner1', createdByName: 'Admin Ficticio', ownerUid: 'owner1', updatedBy: 'owner1' })), true);
await T('C12 sin aprobar NO crea ni su privada', addDoc(collection(noob, 'routine_templates'), tplDoc({ visibility: 'private', createdBy: 'noob1', createdByName: 'Sin Aprobar', ownerUid: 'noob1', updatedBy: 'noob1' })), false);

// ============ PLANTILLAS: modificar (autoría y clase inmutables) ============
const updBy = (db, id, uid) => updateDoc(TPL(db, id), { nombre_es: 'Editada', updatedAt: serverTimestamp(), updatedBy: uid });
await T('U1 autor entrenador edita SU plantilla de entrenador', updBy(tr1, 'TF1', 'trainer1'), true);
await T('U2 otro entrenador NO edita la de entrenador ajena', updBy(tr2, 'TF1', 'trainer2'), false);
await T('U3 usuario NO edita la de fábrica legada', updBy(A, 'RF', 'clientA'), false);
await T('U4 administrador edita la de fábrica legada', updBy(owner, 'RF', 'owner1'), true);
await T('U5 editar cambiando visibility (salto de clase)', updateDoc(TPL(tr1, 'TF1'), { visibility: 'factory', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), false);
await T('U6 editar cambiando createdBy (reescribir autoría)', updateDoc(TPL(tr1, 'TF1'), { createdBy: 'trainer2', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), false);
await T('U7 dueño edita SU privada', updBy(A, 'PV1', 'clientA'), true);
await T('U8 el entrenador asignado NO edita la privada de su cliente', updBy(tr1, 'PV1', 'trainer1'), false);
await T('U9 administrador edita una privada ajena (ve y gobierna todo)', updBy(owner, 'PV1', 'owner1'), true);
await T('U10 editar sin updatedBy (sin rastro de quién edita)', updateDoc(TPL(tr1, 'TF1'), { nombre_es: 'Sin rastro', updatedAt: serverTimestamp() }), false);

// ============ PLANTILLAS: borrar (misma matriz que editar) ============
await T('D1 otro entrenador NO borra la de entrenador ajena', deleteDoc(TPL(tr2, 'TF1')), false);
await T('D2 usuario NO borra la de fábrica', deleteDoc(TPL(A, 'RF')), false);
await T('D3 dueño borra SU privada', deleteDoc(TPL(A, 'PV1')), true);
await T('D4 autor borra SU plantilla de entrenador', deleteDoc(TPL(tr1, 'TF1')), true);
await T('D5 administrador borra la de fábrica legada', deleteDoc(TPL(owner, 'RF')), true);

console.log(`\nRESULTADO: ${pass}/${pass + fail} PASS · ${fail} FAIL`);
if (fail) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
