// RONBO FIT — Batería del delta de reglas «PETICIONES» (colección
// NUEVA trainer_requests) contra el emulador oficial de Firestore
// (proyecto ficticio, sin secretos ni datos reales).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → contra la CANDIDATA: la colección se
//                        comporta como se diseñó (D1–D4 + §6).
//   ESPERA_NUEVO=false → contra el texto VIVO b9a9aeb3: la
//                        colección NO existe (todo denegado por el
//                        catch-all) y los vecinos quedan idénticos.
// Salida: fallos.txt solo si hay fallos (anotaciones del workflow).
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
async function caso(nombre, promesa, debePasar) {
  try {
    if (debePasar) await assertSucceeds(promesa);
    else await assertFails(promesa);
    console.log(`OK    ${nombre} → ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
  } catch (e) {
    fallos.push(`${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
    console.log(`FALLO ${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    ...(process.env.REGLAS_PRECARGADAS === '1' ? {} : { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8') }),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', ENT = 'entrenadorT', ENT2 = 'entrenadorU';
const ALU = 'alumnaS', ALU2 = 'alumnoS2', AJENO = 'ajenoX', NOAPR = 'noAprobada';
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: true, isOwner: true });
  await setDoc(doc(db, 'users', ENT), { name: 'Entrenador', role: 'entrenador', approved: true });
  await setDoc(doc(db, 'users', ENT2), { name: 'Entrenador Dos', role: 'entrenador', approved: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true, trainerUid: ENT });
  await setDoc(doc(db, 'users', ALU2), { name: 'Alumno Dos', role: 'usuario', approved: true, trainerUid: ENT });
  await setDoc(doc(db, 'users', AJENO), { name: 'Ajeno', role: 'usuario', approved: true, trainerUid: ENT2 });
  await setDoc(doc(db, 'users', NOAPR), { name: 'Sin Aprobar', role: 'usuario', approved: false, trainerUid: ENT });
  /* Dos peticiones sembradas para las pruebas de resolución. */
  const { Timestamp } = await import('firebase/firestore');
  const semilla = {
    studentUid: ALU, studentName: 'Alumna', trainerUid: ENT, type: 'question',
    days: null, message: '¿Puedo cambiar el horario?', status: 'sent',
    createdAt: Timestamp.fromDate(new Date('2026-11-04T10:00:00Z')), createdISO: '2026-11-04',
    reply: null, resolvedAt: null, resolvedBy: null,
  };
  await setDoc(doc(db, 'trainer_requests', 'semilla-1'), semilla);
  await setDoc(doc(db, 'trainer_requests', 'semilla-2'), { ...semilla, type: 'pain_injury', message: 'Me molesta la rodilla' });
  await setDoc(doc(db, 'trainer_requests', 'semilla-3'), { ...semilla, type: 'other', message: 'Otra cosa' });
});
const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();
const dbAnon = () => testEnv.unauthenticatedContext().firestore();
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, collection, where, serverTimestamp, Timestamp } = F;

const reqBase = (extra = {}) => ({
  studentUid: ALU, studentName: 'Alumna', trainerUid: ENT,
  type: 'more_days', days: 5, message: 'Puedo entrenar más días entre semana',
  status: 'sent', createdAt: serverTimestamp(), createdISO: '2026-11-04',
  reply: null, resolvedAt: null, resolvedBy: null, ...extra,
});
const mkReq = (db, id, data) => setDoc(doc(db, 'trainer_requests', id), data);

/* --- creación --- */
await caso('A1 alumna crea «más días» (5) válida', mkReq(dbDe(ALU), 'a1', reqBase()), ESPERA_NUEVO);
await caso('A2 alumna crea «una duda» sin días y sin mensaje', mkReq(dbDe(ALU), 'a2', reqBase({ type: 'question', days: null, message: '' })), ESPERA_NUEVO);
await caso('A3 «otro» sin mensaje', mkReq(dbDe(ALU), 'a3', reqBase({ type: 'other', days: null, message: '' })), false);
await caso('A4 «molestia o lesión» sin mensaje', mkReq(dbDe(ALU), 'a4', reqBase({ type: 'pain_injury', days: null, message: '' })), false);
await caso('A5 «cambiar un ejercicio» sin mensaje', mkReq(dbDe(ALU), 'a5', reqBase({ type: 'change_exercise', days: null, message: '' })), false);
await caso('A6 «más días» con 3 días', mkReq(dbDe(ALU), 'a6', reqBase({ days: 3 })), false);
await caso('A7 «más días» con 7 días', mkReq(dbDe(ALU), 'a7', reqBase({ days: 7 })), false);
await caso('A8 «menos días» con 2 días', mkReq(dbDe(ALU), 'a8', reqBase({ type: 'fewer_days', days: 2 })), ESPERA_NUEVO);
await caso('A9 «menos días» con 6 días', mkReq(dbDe(ALU), 'a9', reqBase({ type: 'fewer_days', days: 6 })), false);
await caso('A10 petición dirigida a un entrenador que NO es el suyo', mkReq(dbDe(ALU), 'a10', reqBase({ trainerUid: ENT2 })), false);
await caso('A11 petición con studentUid ajeno', mkReq(dbDe(ALU), 'a11', reqBase({ studentUid: ALU2 })), false);
await caso('A12 nace ya «resolved»', mkReq(dbDe(ALU), 'a12', reqBase({ status: 'resolved' })), false);
await caso('A13 clave extra fuera de la forma cerrada', mkReq(dbDe(ALU), 'a13', reqBase({ sorpresa: 1 })), false);
const sinReply = reqBase(); delete sinReply.reply;
await caso('A14 falta un campo de la forma (reply)', mkReq(dbDe(ALU), 'a14', sinReply), false);
await caso('A15 mensaje de 281 caracteres', mkReq(dbDe(ALU), 'a15', reqBase({ message: 'x'.repeat(281) })), false);
await caso('A16 sin autenticar crea una petición', mkReq(dbAnon(), 'a16', reqBase()), false);
await caso('A17 alumna SIN aprobar crea una petición', mkReq(dbDe(NOAPR), 'a17', reqBase({ studentUid: NOAPR })), false);
await caso('A18 el entrenador se crea una petición a sí mismo', mkReq(dbDe(ENT), 'a18', reqBase({ studentUid: ENT, studentName: 'Entrenador' })), false);
await caso('A19 createdAt que no es la hora del servidor', mkReq(dbDe(ALU), 'a19', reqBase({ createdAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) })), false);
await caso('A20 tipo fuera del enum cerrado', mkReq(dbDe(ALU), 'a20', reqBase({ type: 'cambiar_plan', days: null })), false);
await caso('A21 «más días» sin número (days null)', mkReq(dbDe(ALU), 'a21', reqBase({ days: null })), false);
await caso('A22 petición de lesión válida (para la tarjeta semanal)', mkReq(dbDe(ALU), 'a22', reqBase({ type: 'pain_injury', days: null, message: 'Me molesta el hombro' })), ESPERA_NUEVO);

/* --- lectura --- */
await caso('L1 la alumna lee su petición', getDoc(doc(dbDe(ALU), 'trainer_requests', 'a1')), ESPERA_NUEVO);
await caso('L2 su entrenador lee la petición', getDoc(doc(dbDe(ENT), 'trainer_requests', 'a1')), ESPERA_NUEVO);
await caso('L3 otra alumna del MISMO entrenador lee la petición ajena', getDoc(doc(dbDe(ALU2), 'trainer_requests', 'a1')), false);
await caso('L4 otro entrenador lee la petición', getDoc(doc(dbDe(ENT2), 'trainer_requests', 'a1')), false);
await caso('L5 el propietario lee la petición', getDoc(doc(dbDe(DUENO), 'trainer_requests', 'a1')), ESPERA_NUEVO);
await caso('L6 sin autenticar lee la petición', getDoc(doc(dbAnon(), 'trainer_requests', 'a1')), false);
await caso('L7 la alumna lista SUS peticiones (studentUid acotado)', getDocs(query(collection(dbDe(ALU), 'trainer_requests'), where('studentUid', '==', ALU))), ESPERA_NUEVO);
await caso('L8 el entrenador lista las dirigidas a él (trainerUid acotado)', getDocs(query(collection(dbDe(ENT), 'trainer_requests'), where('trainerUid', '==', ENT))), ESPERA_NUEVO);
await caso('L9 otro entrenador lista las dirigidas a ENT', getDocs(query(collection(dbDe(ENT2), 'trainer_requests'), where('trainerUid', '==', ENT))), false);
await caso('L10 la alumna lista las peticiones de OTRA alumna', getDocs(query(collection(dbDe(ALU), 'trainer_requests'), where('studentUid', '==', ALU2))), false);
await caso('L11 el propietario lista toda la colección', getDocs(collection(dbDe(DUENO), 'trainer_requests')), ESPERA_NUEVO);
await caso('L12 la consulta de la tarjeta semanal (studentUid + type=pain_injury)', getDocs(query(collection(dbDe(ALU), 'trainer_requests'), where('studentUid', '==', ALU), where('type', '==', 'pain_injury'))), ESPERA_NUEVO);
await caso('L13 el alumno de otro entrenador lista las de ENT (trainerUid acotado a ENT)', getDocs(query(collection(dbDe(AJENO), 'trainer_requests'), where('trainerUid', '==', ENT))), false);

/* --- resolución (actualización) --- */
await caso('U1 su entrenador resuelve CON respuesta', updateDoc(doc(dbDe(ENT), 'trainer_requests', 'semilla-1'), { status: 'resolved', reply: 'Perfecto, te paso a 5 días desde el lunes', resolvedAt: serverTimestamp(), resolvedBy: ENT }), ESPERA_NUEVO);
await caso('U2 su entrenador resuelve SIN respuesta (reply null)', updateDoc(doc(dbDe(ENT), 'trainer_requests', 'semilla-2'), { status: 'resolved', reply: null, resolvedAt: serverTimestamp(), resolvedBy: ENT }), ESPERA_NUEVO);
await caso('U3 la alumna intenta resolver su propia petición', updateDoc(doc(dbDe(ALU), 'trainer_requests', 'semilla-3'), { status: 'resolved', reply: null, resolvedAt: serverTimestamp(), resolvedBy: ALU }), false);
await caso('U4 otro entrenador intenta resolverla', updateDoc(doc(dbDe(ENT2), 'trainer_requests', 'semilla-3'), { status: 'resolved', reply: null, resolvedAt: serverTimestamp(), resolvedBy: ENT2 }), false);
await caso('U5 el entrenador intenta EDITAR el mensaje de la petición al resolver', updateDoc(doc(dbDe(ENT), 'trainer_requests', 'semilla-3'), { status: 'resolved', message: 'editado', resolvedAt: serverTimestamp(), resolvedBy: ENT }), false);
await caso('U6 resolvedBy distinto del entrenador que resuelve', updateDoc(doc(dbDe(ENT), 'trainer_requests', 'semilla-3'), { status: 'resolved', reply: null, resolvedAt: serverTimestamp(), resolvedBy: ALU }), false);
await caso('U7 respuesta de 281 caracteres', updateDoc(doc(dbDe(ENT), 'trainer_requests', 'semilla-3'), { status: 'resolved', reply: 'x'.repeat(281), resolvedAt: serverTimestamp(), resolvedBy: ENT }), false);
await caso('U8 resolver una petición YA resuelta', updateDoc(doc(dbDe(ENT), 'trainer_requests', 'semilla-1'), { status: 'resolved', reply: 'otra', resolvedAt: serverTimestamp(), resolvedBy: ENT }), false);
await caso('U9 el entrenador intenta cambiar el TIPO al resolver', updateDoc(doc(dbDe(ENT), 'trainer_requests', 'semilla-3'), { status: 'resolved', type: 'question', resolvedAt: serverTimestamp(), resolvedBy: ENT }), false);

/* --- borrado --- */
await caso('D1 la alumna borra su petición', deleteDoc(doc(dbDe(ALU), 'trainer_requests', 'a1')), false);
await caso('D2 el entrenador borra la petición', deleteDoc(doc(dbDe(ENT), 'trainer_requests', 'a2')), false);
await caso('D3 el propietario borra (limpieza administrativa)', deleteDoc(doc(dbDe(DUENO), 'trainer_requests', 'a8')), ESPERA_NUEVO);

/* --- vecinos intactos --- */
await caso('V1 la alumna sigue leyendo su propio documento de usuario', getDoc(doc(dbDe(ALU), 'users', ALU)), true);
await caso('V2 la alumna NO lee el documento de otra alumna', getDoc(doc(dbDe(ALU), 'users', ALU2)), false);

console.log(`\n== ${fallos.length} fallos (ESPERA_NUEVO=${ESPERA_NUEVO}) ==`);
if (fallos.length) writeFileSync('fallos.txt', fallos.join('\n') + '\n');
else { try { rmSync('fallos.txt'); } catch {} }
await testEnv.cleanup();
process.exit(fallos.length ? 1 : 0);
