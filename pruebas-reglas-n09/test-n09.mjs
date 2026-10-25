// RONBO NUTRI — Batería CI del delta N-09 (permisos de biblioteca y
// plantillas). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción. Banco de reglas: ./firestore.rules (fixture de
// pruebas: candidato de composición + delta N-09; NO es un
// candidato de publicación).
// Matriz ejercitada: admin/entrenador/usuario × biblioteca × tres
// clases de plantilla × leer/crear/modificar/borrar.
//
// REDISEÑO 2026-10-24 (tras la detención del paquete en la cadena):
// la primera versión de esta batería suponía que una LISTA sin
// filtros se filtra por documento en el servidor — semántica que
// Firestore NO tiene (las reglas no son filtros): en producción esa
// consulta se deniega entera. Los casos de lista (serie LQ) prueban
// ahora LAS CONSULTAS REALES de la app rediseñada (tplFetchClassDocs):
// una por clase, acotadas a lo que quien lee puede leer, más el get
// individual de las legadas R01–R08 sin visibility. La matriz GET
// por documento (serie R) sigue probando el predicado del delta
// documento a documento. El emulador, en listas sin acotar, evalúa
// con laxitud distinta de producción: por eso la suite NO afirma
// nada sobre la lista sin filtros — afirma las consultas reales.
// U10 queda determinista con el ajuste mínimo del delta: el update
// exige hasAll(['updatedAt','updatedBy']) (toda edición toca su
// rastro); las semillas llevan la forma que la app escribe.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, collection, addDoc,
  updateDoc, deleteDoc, serverTimestamp, query, where
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
async function TQuery(name, q, mustHave, mustNotHave) {
  try {
    const snap = await getDocs(q);
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
  // RF y R01: LEGADAS, sin visibility ni autoría → factory por defecto.
  // (R01 espeja los ids reales de la carga del Paquete 3, R01–R08.)
  await setDoc(doc(db, 'routine_templates', 'RF'), { nombre_es: 'Fábrica legada', nombre_en: 'Legacy factory', dias_por_semana: 1, days, session: [] });
  await setDoc(doc(db, 'routine_templates', 'R01'), { nombre_es: 'Legada R01', nombre_en: 'Legacy R01', dias_por_semana: 1, days, session: [] });
  // FN1: fábrica CON visibility explícito (la forma de toda carga futura).
  await setDoc(doc(db, 'routine_templates', 'FN1'), { nombre_es: 'Fábrica nueva', nombre_en: 'New factory', dias_por_semana: 1, days, session: [], visibility: 'factory', createdBy: 'owner1', createdByName: 'Admin Ficticio', ownerUid: null, updatedBy: 'owner1' });
  await setDoc(doc(db, 'routine_templates', 'TF1'), { nombre_es: 'Del entrenador 1', nombre_en: 'Trainer one', dias_por_semana: 1, days, session: [], visibility: 'trainer', createdBy: 'trainer1', createdByName: 'Entrenador Uno', ownerUid: 'trainer1', updatedBy: 'trainer1' });
  await setDoc(doc(db, 'routine_templates', 'TF2'), { nombre_es: 'Del entrenador 2', nombre_en: 'Trainer two', dias_por_semana: 1, days, session: [], visibility: 'trainer', createdBy: 'trainer2', createdByName: 'Entrenador Dos', ownerUid: 'trainer2', updatedBy: 'trainer2' });
  await setDoc(doc(db, 'routine_templates', 'PV1'), { nombre_es: 'Privada de A', nombre_en: 'A private', dias_por_semana: 1, days, session: [], visibility: 'private', createdBy: 'clientA', createdByName: 'Cliente A', ownerUid: 'clientA', updatedBy: 'clientA' });
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
const TPLC = db => collection(db, 'routine_templates');
/* Las consultas EXACTAS de la app rediseñada (tplFetchClassDocs). */
const qFactory = db => query(TPLC(db), where('visibility', '==', 'factory'));
const qTrainerMine = (db, uid) => query(TPLC(db), where('visibility', '==', 'trainer'), where('createdBy', '==', uid));
const qTrainerAll = db => query(TPLC(db), where('visibility', '==', 'trainer'));
const qPrivateMine = (db, uid) => query(TPLC(db), where('visibility', '==', 'private'), where('ownerUid', '==', uid));
const qPrivateAll = db => query(TPLC(db), where('visibility', '==', 'private'));
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

// ============ PLANTILLAS: lectura por documento (matriz del delta) ============
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
await T('R14 sin aprobar NO lee ni la de fábrica (puerta isApprovedUser)', getDoc(TPL(noob, 'FN1')), false);
await T('R15 sin aprobar NO lee una privada', getDoc(TPL(noob, 'PV1')), false);
await T('R16 anónimo NO lee plantillas', getDoc(TPL(anon, 'FN1')), false);

// ============ PLANTILLAS: las consultas REALES de la app (rediseño) ============
// La consulta de fábrica devuelve SOLO documentos con el campo
// puesto: las legadas sin visibility NO aparecen por esta vía (en
// Firestore una consulta nunca matchea un documento sin el campo) —
// llegan por el get individual de LQ5, como hace la app.
await TQuery('LQ1 fábrica por consulta (visibility==factory), cliente en espera: solo FN1; ni legadas ni otras clases', qFactory(W), ['FN1'], ['RF', 'R01', 'TF1', 'TF2', 'PV1']);
await TQuery('LQ2 fábrica por consulta, cliente ASIGNADO (resolución 23:15 por la vía real)', qFactory(A), ['FN1'], ['TF1', 'TF2', 'PV1']);
await TQuery('LQ3 de entrenador acotada al autor (visibility==trainer ∧ createdBy==trainer2): solo TF2', qTrainerMine(tr2, 'trainer2'), ['TF2'], ['TF1', 'PV1', 'FN1']);
await TQuery('LQ4 privadas acotadas al dueño (visibility==private ∧ ownerUid==clientA): solo PV1', qPrivateMine(A, 'clientA'), ['PV1'], ['TF1', 'TF2', 'FN1']);
await T('LQ5a legada R01 por GET individual (el camino de la app), cliente en espera', getDoc(TPL(W, 'R01')), true);
await T('LQ5b legada R01 por GET individual, otro entrenador (fábrica es de todos)', getDoc(TPL(tr2, 'R01')), true);
await TQuery('LQ6a administrador, consulta amplia de entrenador (visibility==trainer): TF1 y TF2', qTrainerAll(owner), ['TF1', 'TF2'], ['PV1', 'FN1']);
await TQuery('LQ6b administrador, consulta amplia de privadas (visibility==private): PV1', qPrivateAll(owner), ['PV1'], ['TF1', 'TF2']);
await TQuery('LQ6c administrador, consulta de fábrica: FN1', qFactory(owner), ['FN1'], ['RF', 'R01', 'TF1', 'PV1']);
await TQuery('LQ7 la consulta de entrenador con createdBy de un cliente (no autor) vuelve VACÍA, sin error', qTrainerMine(A, 'clientA'), [], ['TF1', 'TF2', 'PV1', 'FN1']);

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
await T('U10 editar SIN tocar updatedBy (sin rastro nuevo: hasAll lo deniega siempre)', updateDoc(TPL(tr1, 'TF1'), { nombre_es: 'Sin rastro', updatedAt: serverTimestamp() }), false);
await T('U11 editar con updatedBy de OTRO (rastro suplantado)', updateDoc(TPL(tr1, 'TF1'), { nombre_es: 'Rastro falso', updatedAt: serverTimestamp(), updatedBy: 'trainer2' }), false);
await T('U12 edición mínima legítima: solo tocar updatedAt+updatedBy propios (el hasAll no bloquea lo válido)', updateDoc(TPL(tr1, 'TF1'), { updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), true);

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
