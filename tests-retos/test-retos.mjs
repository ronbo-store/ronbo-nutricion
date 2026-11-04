// RONBO FIT — Batería del delta de reglas «RETOS» (colecciones
// NUEVAS challenges + challenge_parts) contra el emulador oficial
// de Firestore (proyecto ficticio, sin secretos ni datos reales).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → contra la CANDIDATA: las dos colecciones
//                        se comportan como se diseñaron.
//   ESPERA_NUEVO=false → contra el texto VIVO 84974ca6: las dos
//                        colecciones NO existen (todo denegado por
//                        el catch-all) y los vecinos quedan
//                        idénticos.
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
const ALU = 'alumnaS', ALU2 = 'alumnoS2', AJENO = 'ajenoX';
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: true, isOwner: true });
  await setDoc(doc(db, 'users', ENT), { name: 'Entrenador', role: 'entrenador', approved: true });
  await setDoc(doc(db, 'users', ENT2), { name: 'Entrenador Dos', role: 'entrenador', approved: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true, trainerUid: ENT });
  await setDoc(doc(db, 'users', ALU2), { name: 'Alumno Dos', role: 'usuario', approved: true, trainerUid: ENT });
  await setDoc(doc(db, 'users', AJENO), { name: 'Ajeno', role: 'usuario', approved: true, trainerUid: ENT2 });
});
const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();
const dbAnon = () => testEnv.unauthenticatedContext().firestore();
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, collection, where, serverTimestamp } = F;

const chalBase = (extra = {}) => ({
  kind: 'individual', catalogId: 'train4-7', metric: 'train_days', target: 4,
  periodDays: 7, startDate: '2026-11-04', endDate: '2026-11-10',
  createdBy: ALU, ownerUid: ALU, groupScope: '', title: '', rewardText: '',
  createdAt: serverTimestamp(), ...extra,
});
const mkChal = (db, id, data) => setDoc(doc(db, 'challenges', id), data);

/* --- challenges: creación --- */
await caso('C1 alumna crea su reto individual válido', mkChal(dbDe(ALU), 'ind-1', chalBase()), ESPERA_NUEVO);
await caso('C2 alumna crea individual con ownerUid ajeno', mkChal(dbDe(ALU), 'ind-x', chalBase({ ownerUid: ALU2 })), false);
await caso('C3 alumna crea reto con clave extra', mkChal(dbDe(ALU), 'ind-y', chalBase({ sorpresa: 1 })), false);
await caso('C4a meta 0', mkChal(dbDe(ALU), 'ind-z1', chalBase({ target: 0 })), false);
await caso('C4b meta 101', mkChal(dbDe(ALU), 'ind-z2', chalBase({ target: 101 })), false);
await caso('C4c meta no entera', mkChal(dbDe(ALU), 'ind-z3', chalBase({ target: 2.5 })), false);
await caso('C5 alumna (no entrenadora) crea reto de grupo', mkChal(dbDe(ALU), 'grp-x', chalBase({ kind: 'group', ownerUid: '', groupScope: ALU, createdBy: ALU })), false);
await caso('C6 entrenador crea grupo para SUS alumnos', mkChal(dbDe(ENT), 'grp-t1', chalBase({ kind: 'group', ownerUid: '', groupScope: ENT, createdBy: ENT, catalogId: 'meal5-7', metric: 'meal_days', target: 5 })), ESPERA_NUEVO);
await caso('C7 entrenador crea grupo con alcance «all»', mkChal(dbDe(ENT), 'grp-t2', chalBase({ kind: 'group', ownerUid: '', groupScope: 'all', createdBy: ENT })), false);
await caso('C8 administración crea grupo para todos (diseñado, con recompensa)', mkChal(dbDe(DUENO), 'grp-all', chalBase({ kind: 'group', ownerUid: '', groupScope: 'all', createdBy: DUENO, catalogId: '', metric: 'goal_days', target: 3, title: 'Semana firme', rewardText: 'Una sesión de estiramiento guiada' })), ESPERA_NUEVO);
await caso('C9 entrenador asigna un reto a SU alumna', mkChal(dbDe(ENT), 'asg-1', chalBase({ kind: 'assigned', ownerUid: ALU, createdBy: ENT, catalogId: 'streak7-7', metric: 'streak_days', target: 7 })), ESPERA_NUEVO);
await caso('C10 entrenador asigna a alumna de OTRO entrenador', mkChal(dbDe(ENT), 'asg-x', chalBase({ kind: 'assigned', ownerUid: AJENO, createdBy: ENT })), false);
await caso('C11 administración asigna a una alumna', mkChal(dbDe(DUENO), 'asg-2', chalBase({ kind: 'assigned', ownerUid: ALU, createdBy: DUENO, catalogId: 'weight2-14', metric: 'weight_logs', target: 2, periodDays: 14, endDate: '2026-11-17' })), ESPERA_NUEVO);
await caso('C19 sin autenticar crea un reto', mkChal(dbAnon(), 'ind-anon', chalBase()), false);
await caso('C20 alumna crea un reto «assigned» para sí misma', mkChal(dbDe(ALU), 'asg-y', chalBase({ kind: 'assigned', ownerUid: ALU, createdBy: ALU })), false);
await caso('C21 reto diseñado con título demasiado largo', mkChal(dbDe(DUENO), 'grp-z', chalBase({ kind: 'group', ownerUid: '', groupScope: 'all', createdBy: DUENO, catalogId: '', title: 'x'.repeat(81) })), false);
await caso('C22 reto con fecha fin anterior a inicio', mkChal(dbDe(ALU), 'ind-z4', chalBase({ endDate: '2026-11-01' })), false);

/* --- challenges: lectura --- */
await caso('L1 alumna lee su reto individual', getDoc(doc(dbDe(ALU), 'challenges', 'ind-1')), ESPERA_NUEVO);
await caso('L2 ajeno lee el individual de la alumna', getDoc(doc(dbDe(AJENO), 'challenges', 'ind-1')), false);
await caso('L3 su entrenador lee su individual (ficha)', getDoc(doc(dbDe(ENT), 'challenges', 'ind-1')), ESPERA_NUEVO);
await caso('L4 alumna lee el grupo de su entrenador', getDoc(doc(dbDe(ALU), 'challenges', 'grp-t1')), ESPERA_NUEVO);
await caso('L5 alumna de otro entrenador lee ese grupo', getDoc(doc(dbDe(AJENO), 'challenges', 'grp-t1')), false);
await caso('L6 alumna lista los grupos «all» (kind+groupScope acotados)', getDocs(query(collection(dbDe(ALU), 'challenges'), where('kind', '==', 'group'), where('groupScope', '==', 'all'))), ESPERA_NUEVO);
await caso('L7 alumna lista SUS retos (ownerUid acotado)', getDocs(query(collection(dbDe(ALU), 'challenges'), where('ownerUid', '==', ALU))), ESPERA_NUEVO);
await caso('L8 ajeno lista los retos de la alumna (ownerUid de ella)', getDocs(query(collection(dbDe(AJENO), 'challenges'), where('ownerUid', '==', ALU))), false);

/* --- challenges: retoques y borrado del creador --- */
await caso('U1 creador retoca título y recompensa de su grupo diseñado', updateDoc(doc(dbDe(DUENO), 'challenges', 'grp-all'), { title: 'Semana firme II', rewardText: 'Dos sesiones de estiramiento guiada' }), ESPERA_NUEVO);
await caso('U2 creador intenta mover la META de su grupo', updateDoc(doc(dbDe(DUENO), 'challenges', 'grp-all'), { target: 9 }), false);
await caso('U3 no-creador retoca el título ajeno', updateDoc(doc(dbDe(ENT), 'challenges', 'grp-all'), { title: 'Hackeado' }), false);
await caso('D1 creador borra un reto suyo desechable', (async () => { await mkChal(dbDe(ENT), 'del-1', chalBase({ kind: 'group', ownerUid: '', groupScope: ENT, createdBy: ENT })); await deleteDoc(doc(dbDe(ENT), 'challenges', 'del-1')); })(), ESPERA_NUEVO);
await caso('D2 no-creador borra el grupo ajeno', deleteDoc(doc(dbDe(AJENO), 'challenges', 'grp-t1')), false);

/* --- challenge_parts --- */
const partBase = (cid, uid, extra = {}) => ({
  challengeId: cid, uid, displayName: 'Participante',
  progressCount: 0, progressPct: 0, completedAt: null,
  joinedAt: serverTimestamp(), ...extra,
});
const mkPart = (db, cid, uid, data) => setDoc(doc(db, 'challenge_parts', cid + '_' + uid), data);

await caso('P1 alumna se une al grupo de su entrenador', mkPart(dbDe(ALU), 'grp-t1', ALU, partBase('grp-t1', ALU)), ESPERA_NUEVO);
await caso('P2 alumno2 se une al mismo grupo', mkPart(dbDe(ALU2), 'grp-t1', ALU2, partBase('grp-t1', ALU2)), ESPERA_NUEVO);
await caso('P3 alumna crea la participación de OTRO', mkPart(dbDe(ALU), 'grp-t1', AJENO, partBase('grp-t1', AJENO)), false);
await caso('P4 alta con avance inicial > 0', mkPart(dbDe(AJENO), 'grp-all', AJENO, partBase('grp-all', AJENO, { progressCount: 3 })), false);
await caso('P5 alta con id no atado (challengeId_uid distinto)', setDoc(doc(dbDe(ALU), 'challenge_parts', 'libre-123'), partBase('grp-t1', ALU)), false);
await caso('P6 entrenador siembra la participación del reto asignado', mkPart(dbDe(ENT), 'asg-1', ALU, partBase('asg-1', ALU)), ESPERA_NUEVO);
await caso('P7 alumna siembra su participación del individual', mkPart(dbDe(ALU), 'ind-1', ALU, partBase('ind-1', ALU)), ESPERA_NUEVO);
await caso('P8 ajeno se une al grupo «all» diseñado', mkPart(dbDe(AJENO), 'grp-all', AJENO, partBase('grp-all', AJENO)), ESPERA_NUEVO);
await caso('P9 participante actualiza SU avance', updateDoc(doc(dbDe(ALU), 'challenge_parts', 'grp-t1_' + ALU), { progressCount: 3, progressPct: 60 }), ESPERA_NUEVO);
await caso('P10 participante marca SU cumplimiento (completedAt nace)', updateDoc(doc(dbDe(ALU), 'challenge_parts', 'grp-t1_' + ALU), { progressCount: 5, progressPct: 100, completedAt: serverTimestamp() }), ESPERA_NUEVO);
await caso('P11 tras cumplir, sigue actualizando avance SIN tocar completedAt', updateDoc(doc(dbDe(ALU), 'challenge_parts', 'grp-t1_' + ALU), { progressCount: 5, progressPct: 100 }), ESPERA_NUEVO);
await caso('P12 completedAt NO se mueve una vez nacido', updateDoc(doc(dbDe(ALU), 'challenge_parts', 'grp-t1_' + ALU), { completedAt: serverTimestamp() }), false);
await caso('P13 otro participante toca el avance ajeno', updateDoc(doc(dbDe(ALU2), 'challenge_parts', 'grp-t1_' + ALU), { progressCount: 1 }), false);
await caso('P14 compañero de grupo lista la tabla (challengeId acotado)', getDocs(query(collection(dbDe(ALU2), 'challenge_parts'), where('challengeId', '==', 'grp-t1'))), ESPERA_NUEVO);
await caso('P15 ajeno al grupo lista su tabla', getDocs(query(collection(dbDe(AJENO), 'challenge_parts'), where('challengeId', '==', 'grp-t1'))), false);
await caso('P16 creador del grupo lista su tabla', getDocs(query(collection(dbDe(ENT), 'challenge_parts'), where('challengeId', '==', 'grp-t1'))), ESPERA_NUEVO);
await caso('P17 entrenador lee la participación de su alumna (ficha, uid acotado)', getDocs(query(collection(dbDe(ENT), 'challenge_parts'), where('uid', '==', ALU))), ESPERA_NUEVO);
await caso('P18 sin autenticar lee una participación', getDoc(doc(dbAnon(), 'challenge_parts', 'grp-t1_' + ALU)), false);
await caso('P19 participante se retira (borra SU participación)', deleteDoc(doc(dbDe(ALU2), 'challenge_parts', 'grp-t1_' + ALU2)), ESPERA_NUEVO);

/* --- Vecinos intactos en AMBAS suites --- */
await caso('V1 (regresión) la alumna guarda su eveAlert', updateDoc(doc(dbDe(ALU), 'users', ALU), { eveAlert: { on: false } }), true);
await caso('V2 (regresión) la alumna guarda su daySummary completo', updateDoc(doc(dbDe(ALU), 'users', ALU), { daySummary: { on: true, time: '05:00', tz: 'America/Chicago' } }), true);
await caso('V3 (regresión) el entrenador NO escribe el eveAlert de su alumna', updateDoc(doc(dbDe(ENT), 'users', ALU), { eveAlert: { on: false } }), false);

if (fallos.length) writeFileSync(new URL('./fallos.txt', import.meta.url), fallos.join('\n') + '\n');
else { try { rmSync(new URL('./fallos.txt', import.meta.url)); } catch {} }
console.log(`\n${fallos.length === 0 ? 'TODO OK' : 'FALLOS: ' + fallos.length} (ESPERA_NUEVO=${ESPERA_NUEVO})`);
await testEnv.cleanup();
process.exit(fallos.length ? 1 : 0);
