// RONBO NUTRI — Batería CI del delta «BIBLIOTECA COMUNITARIA CON
// APROBACIÓN» (2026-10-24). Usuarios FICTICIOS, emulador LOCAL. Nunca
// toca producción. Banco de reglas: ./firestore.rules = candidato de
// publicación del paquete (texto vivo verificado b135f2f8 + SOLO el
// delta de biblioteca comunitaria; SHA-256
// 75c2033ffb8799f4afe2c4aaada90e4c6094a7906bb7ce1fa8cf7e61f590a775).
//
// Decisión de Ronald (chat 2026-10-24 20:57 CDT): el entrenador crea
// ejercicios, el administrador los aprueba, y aprobados sirven a toda
// la comunidad con la marca «Creado por {nombre} · {fecha}».
//
// Matriz: GET por documento según estado (fábrica sin 'estado',
// aprobado, pendiente, rechazado) × rol (admin, autor, otro
// entrenador, cliente, sin aprobar, anónimo); las CONSULTAS REALES de
// la app rediseñada (libFetchClassDocs) con sus conjuntos exactos —
// la lección de N-09: las reglas no son filtros, así que la suite NO
// afirma nada sobre consultas no demostrables; crear (forma exacta
// del alta de entrenador y del alta firmada del administrador, y sus
// abusos); actualizar (edición del autor, reenvío tras rechazo,
// aprobación SOLO con firma del administrador, autoría inmutable,
// rastro updatedAt/updatedBy obligatorio); borrar (autor solo en
// pendiente/rechazado; administrador todo).
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, collection,
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
async function TQuery(name, q, exactIds) {
  try {
    const snap = await getDocs(q);
    const ids = snap.docs.map(d => d.id).sort();
    const want = [...exactIds].sort();
    if (JSON.stringify(ids) !== JSON.stringify(want)) throw new Error('ids=' + ids.join(',') + ' want=' + want.join(','));
    pass++; console.log('PASS — ' + name);
  } catch (e) {
    fail++; failures.push(name);
    console.log('FAIL — ' + name + ' :: ' + String(e && e.message || e).slice(0, 140));
  }
}

const CONTENT = {
  nombre_es: 'Curl martillo', nombre_en: 'Hammer curl',
  grupo_muscular_es: 'Bíceps', grupo_muscular_en: 'Biceps',
  musculos_secundarios_es: 'Antebrazo', musculos_secundarios_en: 'Forearm',
  categoria_es: 'Sin máquinas y sin asistencia', categoria_en: 'No machines, unassisted',
  equipo_es: 'Mancuernas', equipo_en: 'Dumbbells',
  nivel_es: 'Principiante', nivel_en: 'Beginner',
  como_se_hace_es: 'De pie, sube sin balancear.', como_se_hace_en: 'Standing, lift without swinging.',
  errores_a_evitar_es: 'Balancear el torso', errores_a_evitar_en: 'Swinging the torso',
  foto_url: '', video_youtube_url: ''
};
const TS = '2026-10-24T15:00:00.000Z';

// ---- Seed (sin reglas): usuarios y documentos de los cuatro estados ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Uno', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Dos', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'noob1'), { ...base, name: 'Sin Aprobar', approved: false, role: 'usuario' });
  const L = (id, data) => setDoc(doc(db, 'exercise_library', id), data);
  // Fábrica: SIN campo 'estado' (la forma de los 103 cargados).
  await L('E001', { ...CONTENT, nombre_es: 'Sentadilla', nombre_en: 'Squat' });
  await L('EDEL', { ...CONTENT, nombre_es: 'Borrable de fábrica', nombre_en: 'Factory deletable' });
  // Comunitario APROBADO del entrenador 1 (con la firma del admin).
  await L('CAP', { ...CONTENT, estado: 'aprobado', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: TS, approvedBy: 'owner1', approvedAt: TS });
  // Comunitario PENDIENTE de cada entrenador.
  await L('CPE', { ...CONTENT, estado: 'pendiente', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: TS });
  await L('CPE2', { ...CONTENT, estado: 'pendiente', createdBy: 'trainer2', createdByName: 'Entrenador Dos', createdAt: TS });
  await L('CPE3', { ...CONTENT, estado: 'pendiente', createdBy: 'trainer2', createdByName: 'Entrenador Dos', createdAt: TS });
  await L('CPE4', { ...CONTENT, estado: 'pendiente', createdBy: 'trainer2', createdByName: 'Entrenador Dos', createdAt: TS });
  // Comunitario RECHAZADO de cada entrenador.
  await L('CRE1', { ...CONTENT, estado: 'rechazado', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: TS });
  await L('CRE2', { ...CONTENT, estado: 'rechazado', createdBy: 'trainer2', createdByName: 'Entrenador Dos', createdAt: TS });
  // Para borrar: pendiente propio y aprobado propio del entrenador 1.
  await L('DELP', { ...CONTENT, estado: 'pendiente', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: TS });
  await L('DELA', { ...CONTENT, estado: 'aprobado', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: TS, approvedBy: 'owner1', approvedAt: TS });
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const tr2 = testEnv.authenticatedContext('trainer2').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const noob = testEnv.authenticatedContext('noob1').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const LIB = (db, id) => doc(db, 'exercise_library', id);
const LIBC = db => collection(db, 'exercise_library');

// ============ G — GET por documento y estado ============
await T('G1 cliente aprobado lee un ejercicio de FÁBRICA (sin estado)', getDoc(LIB(A, 'E001')), true);
await T('G2 cliente aprobado lee un comunitario APROBADO', getDoc(LIB(A, 'CAP')), true);
await T('G3 otro entrenador NO lee un pendiente ajeno', getDoc(LIB(tr2, 'CPE')), false);
await T('G4 el AUTOR lee su propio pendiente', getDoc(LIB(tr1, 'CPE')), true);
await T('G5 el administrador lee un pendiente ajeno', getDoc(LIB(owner, 'CPE')), true);
await T('G6 el cliente NO lee un rechazado', getDoc(LIB(A, 'CRE2')), false);
await T('G7 el autor lee su propio rechazado', getDoc(LIB(tr2, 'CRE2')), true);
await T('G8 anónimo NO lee ni la fábrica', getDoc(LIB(anon, 'E001')), false);
await T('G9 usuario sin aprobar NO lee la fábrica', getDoc(LIB(noob, 'E001')), false);
await T('G10 GET de un id inexistente: permitido al aprobado (devuelve no-encontrado; el sondeo de fábrica no filtra nada)', getDoc(LIB(A, 'E999')), true);
await T('G11 el cliente NO lee un pendiente (aunque sea de su entrenador)', getDoc(LIB(A, 'CPE')), false);

// ============ LQ — las consultas REALES de la app (libFetchClassDocs) ============
await TQuery('LQ1 cliente: where(estado==aprobado) devuelve SOLO los aprobados (la fábrica no sale por consulta: llega por GET)',
  query(LIBC(A), where('estado', '==', 'aprobado')), ['CAP', 'DELA']);
await TQuery('LQ2 entrenador 1: where(createdBy==su uid) devuelve TODOS sus aportes y solo los suyos',
  query(LIBC(tr1), where('createdBy', '==', 'trainer1')), ['CAP', 'CPE', 'CRE1', 'DELA', 'DELP']);
await TQuery('LQ3 administrador: where(estado==pendiente) es su bandeja completa',
  query(LIBC(owner), where('estado', '==', 'pendiente')), ['CPE', 'CPE2', 'CPE3', 'CPE4', 'DELP']);
await TQuery('LQ4 administrador: where(createdBy==trainer2) ve los aportes de ese autor en todo estado',
  query(LIBC(owner), where('createdBy', '==', 'trainer2')), ['CPE2', 'CPE3', 'CPE4', 'CRE2']);
await TQuery('LQ5 entrenador 2: where(createdBy==su uid) — simétrico al de entrenador 1',
  query(LIBC(tr2), where('createdBy', '==', 'trainer2')), ['CPE2', 'CPE3', 'CPE4', 'CRE2']);

// ============ C — CREAR ============
await T('C1 entrenador crea su aporte: nace PENDIENTE con su autoría y la hora del servidor',
  setDoc(LIB(tr1, 'NEW1'), { ...CONTENT, estado: 'pendiente', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: serverTimestamp() }), true);
await T('C2 entrenador NO puede crear ya APROBADO',
  setDoc(LIB(tr1, 'NEW2'), { ...CONTENT, estado: 'aprobado', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: serverTimestamp() }), false);
await T('C3 entrenador NO puede crear a nombre de otro (createdBy ajeno)',
  setDoc(LIB(tr1, 'NEW3'), { ...CONTENT, estado: 'pendiente', createdBy: 'trainer2', createdByName: 'Entrenador Dos', createdAt: serverTimestamp() }), false);
await T('C4 entrenador NO puede colar la firma de aprobación (approvedBy en el alta)',
  setDoc(LIB(tr1, 'NEW4'), { ...CONTENT, estado: 'pendiente', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: serverTimestamp(), approvedBy: 'owner1', approvedAt: serverTimestamp() }), false);
await T('C5 el cliente NO crea aportes (no es entrenador)',
  setDoc(LIB(A, 'NEW5'), { ...CONTENT, estado: 'pendiente', createdBy: 'clientA', createdByName: 'Cliente A', createdAt: serverTimestamp() }), false);
await T('C6 administrador crea: nace APROBADO con SU firma y su autoría',
  setDoc(LIB(owner, 'NEW6'), { ...CONTENT, estado: 'aprobado', createdBy: 'owner1', createdByName: 'Admin Ficticio', createdAt: serverTimestamp(), approvedBy: 'owner1', approvedAt: serverTimestamp() }), true);
await T('C7 administrador NO crea en pendiente (su alta es decisión firmada)',
  setDoc(LIB(owner, 'NEW7'), { ...CONTENT, estado: 'pendiente', createdBy: 'owner1', createdByName: 'Admin Ficticio', createdAt: serverTimestamp() }), false);
await T('C8 alta sin NINGÚN nombre (es y en vacíos) se deniega',
  setDoc(LIB(tr1, 'NEW8'), { ...CONTENT, nombre_es: '', nombre_en: '', estado: 'pendiente', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: serverTimestamp() }), false);
await T('C9 alta con un campo fuera de la lista (trampa) se deniega',
  setDoc(LIB(tr1, 'NEW9'), { ...CONTENT, estado: 'pendiente', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: serverTimestamp(), trampa: 'x' }), false);
await T('C10 alta con createdAt que no es la hora del servidor se deniega',
  setDoc(LIB(tr1, 'NEW10'), { ...CONTENT, estado: 'pendiente', createdBy: 'trainer1', createdByName: 'Entrenador Uno', createdAt: TS }), false);

// ============ U — ACTUALIZAR ============
const U = (db, id, data) => updateDoc(LIB(db, id), data);
await T('U1 el autor edita el contenido de su pendiente (con rastro)',
  U(tr1, 'CPE', { nombre_es: 'Nombre corregido', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), true);
await T('U2 el autor REENVÍA su rechazado al corregirlo (rechazado → pendiente)',
  U(tr1, 'CRE1', { nombre_es: 'Versión corregida', estado: 'pendiente', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), true);
await T('U3 el autor NO puede aprobarse a sí mismo (pendiente → aprobado con su «firma»)',
  U(tr1, 'CPE', { estado: 'aprobado', approvedBy: 'trainer1', approvedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), false);
await T('U4 el autor NO edita su ejercicio ya APROBADO (es de la comunidad)',
  U(tr1, 'CAP', { nombre_es: 'Cambio tardío', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), false);
await T('U5 un entrenador NO edita el pendiente de otro',
  U(tr1, 'CPE2', { nombre_es: 'Intrusión', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), false);
await T('U6 un entrenador NO edita la fábrica',
  U(tr1, 'E001', { nombre_es: 'Intrusión', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), false);
await T('U7 el administrador APRUEBA un pendiente con su firma (approvedBy/approvedAt nuevos)',
  U(owner, 'CPE2', { estado: 'aprobado', approvedBy: 'owner1', approvedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: 'owner1' }), true);
await T('U8 el administrador NO aprueba sin firmar (estado a aprobado sin approvedBy/approvedAt)',
  U(owner, 'CPE3', { estado: 'aprobado', updatedAt: serverTimestamp(), updatedBy: 'owner1' }), false);
await T('U9 el administrador RECHAZA un pendiente (sin firma de aprobación: el estado y el rastro bastan)',
  U(owner, 'CPE3', { estado: 'rechazado', updatedAt: serverTimestamp(), updatedBy: 'owner1' }), true);
await T('U10 el administrador edita el contenido de la fábrica (con rastro)',
  U(owner, 'E001', { equipo_es: 'Barra olímpica', updatedAt: serverTimestamp(), updatedBy: 'owner1' }), true);
await T('U11 nadie reescribe la autoría: el autor intentando cambiar createdBy al editar',
  U(tr1, 'CPE', { createdBy: 'trainer2', updatedAt: serverTimestamp(), updatedBy: 'trainer1' }), false);
// La garantía del rastro es la IGUALDAD tras la escritura (updatedBy
// nombra a quien edita), no la frescura del campo: es la semántica
// que la CI de N-09 fijó con su U10/U12 — un hasAll sobre diff() no
// sirve porque diff() no ve una escritura con el mismo valor y
// denegaría al editor legítimo que guarda dos veces. U12 es el caso
// determinista (el documento NO trae rastro y la edición no lo
// escribe); U13 fija el caso veraz complementario.
await T('U12 sin rastro no hay edición: el administrador edita un pendiente SIN rastro previo y sin escribir updatedBy',
  U(owner, 'CPE4', { nombre_es: 'Sin rastro', updatedAt: serverTimestamp() }), false);
await T('U13 el rastro que ya nombra al editor sigue siendo veraz: el administrador re-edita E001 sin reescribir updatedBy (U10 ya lo dejó con su nombre)',
  U(owner, 'E001', { equipo_es: 'Barra fija', updatedAt: serverTimestamp() }), true);

// ============ D — BORRAR ============
await T('D1 el autor borra su propio pendiente', deleteDoc(LIB(tr1, 'DELP')), true);
await T('D2 el autor NO borra su ejercicio ya aprobado', deleteDoc(LIB(tr1, 'DELA')), false);
await T('D3 un entrenador NO borra el pendiente de otro', deleteDoc(LIB(tr2, 'CPE')), false);
await T('D4 el administrador borra un comunitario aprobado', deleteDoc(LIB(owner, 'DELA')), true);
await T('D5 el cliente NO borra la fábrica', deleteDoc(LIB(A, 'E001')), false);
await T('D6 un entrenador NO borra la fábrica', deleteDoc(LIB(tr1, 'EDEL')), false);

console.log(`BIBLIOTECA COMUNITARIA: ${pass} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
