// RONBO FIT — Batería gemela del delta de reglas «RETOS —
// APROBACIÓN Y PUNTOS» (AUTH-2026-11-08-RETOS) contra el emulador
// oficial de Firestore (proyecto ficticio ronbo-nutri-test, sin
// secretos ni datos reales).
// El delta: la participación (challenge_parts) nace con estado de
// inscripción (joinState 'pending' | 'approved' + joinRequestedAt
// + joinDecidedAt + joinDecidedBy); quien decide es el entrenador
// asignado del alumno, el administrador o el propietario (D1/D2);
// al aprobar un reto INDIVIDUAL, quien decide puede reponer la
// ventana (D3); el avance del participante solo corre con la
// participación aprobada (las legadas, sin joinState, cuentan
// como aprobadas); y el alumno puede re-pedir tras un rechazo.
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas 210dfe7d + delta).
//   ESPERA_NUEVO=false → VIVAS 210dfe7d: las expectativas del
//                        delta se invierten donde el diseño lo
//                        manda (la forma nueva ni siquiera cabe en
//                        las claves viejas) y el resto es idéntico.
// Salida: fallos.txt solo si hay fallos.
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const N = process.env.ESPERA_NUEVO !== 'false';
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
    rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', ADMIN = 'adminA', TR1 = 'trainer1', TR2 = 'trainer2', ALU = 'alumnaS', LIBRE = 'libreL', OTRA = 'alumnaT';
const F = await import('firebase/firestore');
const { doc, collection, setDoc, updateDoc, serverTimestamp } = F;

const chalBase = { catalogId: 'train4-7', metric: 'train_days', target: 4, periodDays: 7, startDate: '2026-11-02', endDate: '2026-11-08', groupScope: '', title: '', rewardText: '' };
const ind = (owner) => ({ ...chalBase, kind: 'individual', createdBy: owner, ownerUid: owner });
const asg = (id) => ({ ...chalBase, kind: 'assigned', catalogId: 'meal5-7', metric: 'meal_days', target: 5, createdBy: TR1, ownerUid: ALU });
const grp = (scope, creator) => ({ ...chalBase, kind: 'group', catalogId: '', metric: 'streak_days', target: 7, createdBy: creator, ownerUid: '', groupScope: scope, title: 'Grupo' });

const partNew = (cid, uid, over = {}) => ({
  challengeId: cid, uid, displayName: 'Nombre', progressCount: 0, progressPct: 0,
  completedAt: null, joinedAt: serverTimestamp(), joinState: 'pending',
  joinRequestedAt: serverTimestamp(), joinDecidedAt: null, joinDecidedBy: null, ...over,
});
const partApprovedBy = (cid, uid, by) => partNew(cid, uid, { joinState: 'approved', joinDecidedAt: serverTimestamp(), joinDecidedBy: by });

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: false, isOwner: true });
  await setDoc(doc(db, 'users', ADMIN), { name: 'Admin', role: 'administrador', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', TR1), { name: 'Entrenador', role: 'entrenador', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', TR2), { name: 'OtroEntrenador', role: 'entrenador', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true, isOwner: false, trainerUid: TR1 });
  await setDoc(doc(db, 'users', LIBRE), { name: 'Libre', role: 'usuario', approved: true, isOwner: false, trainerUid: null });
  await setDoc(doc(db, 'users', OTRA), { name: 'Otra', role: 'usuario', approved: true, isOwner: false, trainerUid: TR2 });
  for (const id of ['IND1', 'IND2', 'IND3', 'IND5', 'INDB', 'INDC', 'INDH', 'INDT', 'INDU', 'INDV', 'INDW', 'INDF', 'INDG', 'INDI', 'INDD', 'INDE']) {
    await setDoc(doc(db, 'challenges', id), ind(ALU));
  }
  await setDoc(doc(db, 'challenges', 'IND_OTRA'), ind(OTRA));
  await setDoc(doc(db, 'challenges', 'IND_LIBRE'), ind(LIBRE));
  for (const id of ['ASGA', 'ASGB', 'ASGC', 'ASGD']) await setDoc(doc(db, 'challenges', id), asg(id));
  await setDoc(doc(db, 'challenges', 'GRPALL'), grp('all', TR1));
  await setDoc(doc(db, 'challenges', 'GRPTR1'), grp(TR1, TR1));
  await setDoc(doc(db, 'challenges', 'GRPOWN'), grp('all', ALU));
  /* Participaciones sembradas por estado */
  const seed = async (cid, uid, data) => setDoc(doc(db, 'challenge_parts', cid + '_' + uid), data);
  await seed('INDB', ALU, partNew('INDB', ALU));                                   // pending → aprobar (TR1)
  await seed('INDC', ALU, partNew('INDC', ALU));                                   // pending → no aprobar (TR1)
  await seed('INDH', ALU, partNew('INDH', ALU));                                   // pending → aprobar (dueño)
  await seed('INDT', ALU, partNew('INDT', ALU));                                   // pending → intento con avance
  await seed('INDU', ALU, partNew('INDU', ALU));                                   // pending → auto-aprobación
  await seed('INDV', ALU, partNew('INDV', ALU));                                   // pending → entrenador ajeno
  await seed('IND_LIBRE', LIBRE, partNew('IND_LIBRE', LIBRE));                     // pending sin entrenador → admin
  await seed('INDD', ALU, partNew('INDD', ALU));                                   // pending → avance del participante
  await seed('INDE', ALU, partNew('INDE', ALU, { joinState: 'rejected', joinDecidedAt: serverTimestamp(), joinDecidedBy: TR1 })); // rejected
  await seed('INDF', ALU, { challengeId: 'INDF', uid: ALU, displayName: 'Alumna', progressCount: 1, progressPct: 25, completedAt: null, joinedAt: serverTimestamp() }); // LEGADA sin joinState
  await seed('INDG', ALU, partApprovedBy('INDG', ALU, TR1));                       // aprobada → avance
  await seed('INDI', ALU, partApprovedBy('INDI', ALU, TR1));                       // aprobada → completar
});

const dbS = testEnv.authenticatedContext(ALU).firestore();
const dbL = testEnv.authenticatedContext(LIBRE).firestore();
const dbT = testEnv.authenticatedContext(TR1).firestore();
const dbT2 = testEnv.authenticatedContext(TR2).firestore();
const dbA = testEnv.authenticatedContext(ADMIN).firestore();
const dbO = testEnv.authenticatedContext(DUENO).firestore();
const P = (db, cid, uid) => doc(db, 'challenge_parts', cid + '_' + uid);
const decide = (by, state) => ({ joinState: state, joinDecidedAt: serverTimestamp(), joinDecidedBy: by });

/* ── CREAR: el nacimiento de la inscripción ── */
await caso('alumna pide su reto de catálogo (pending, forma exacta)', setDoc(P(dbS, 'IND1', ALU), partNew('IND1', ALU)), N);
await caso('alumna se auto-aprueba su reto individual', setDoc(P(dbS, 'IND2', ALU), partApprovedBy('IND2', ALU, ALU)), false);
await caso('alumna pide con la decisión ya sellada', setDoc(P(dbS, 'IND3', ALU), partNew('IND3', ALU, { joinDecidedBy: TR1 })), false);
await caso('alumna pide el reto individual de otra (no lo ve)', setDoc(P(dbS, 'IND_OTRA', ALU), partNew('IND_OTRA', ALU)), false);
await caso('alumna pide un grupo visible para todos (pending)', setDoc(P(dbS, 'GRPALL', ALU), partNew('GRPALL', ALU)), N);
await caso('alumna pide el grupo de su entrenador (pending)', setDoc(P(dbS, 'GRPTR1', ALU), partNew('GRPTR1', ALU)), N);
await caso('alumna crea una participación con una clave extra', setDoc(P(dbS, 'IND5', ALU), partNew('IND5', ALU, { truco: 1 })), false);
await caso('entrenador siembra el asignado PENDING (debe nacer aprobado, D2)', setDoc(P(dbT, 'ASGA', ALU), partNew('ASGA', ALU)), false);
await caso('entrenador siembra el asignado ya aprobado (D2)', setDoc(P(dbT, 'ASGB', ALU), partApprovedBy('ASGB', ALU, TR1)), N);
await caso('alumna auto-cura su asignado (aprobado, decisión del creador)', setDoc(P(dbS, 'ASGC', ALU), partApprovedBy('ASGC', ALU, TR1)), N);
await caso('alumna auto-cura su asignado sellándose ella la decisión', setDoc(P(dbS, 'ASGD', ALU), partApprovedBy('ASGD', ALU, ALU)), false);
await caso('la creadora entra aprobada a SU propio grupo (sin solicitud)', setDoc(P(dbS, 'GRPOWN', ALU), partApprovedBy('GRPOWN', ALU, ALU)), N);

/* ── LA DECISIÓN ── */
await caso('su entrenador APRUEBA la solicitud', updateDoc(P(dbT, 'INDB', ALU), decide(TR1, 'approved')), N);
await caso('su entrenador NO APRUEBA otra solicitud', updateDoc(P(dbT, 'INDC', ALU), decide(TR1, 'rejected')), N);
await caso('el propietario aprueba una solicitud', updateDoc(P(dbO, 'INDH', ALU), decide(DUENO, 'approved')), N);
await caso('el administrador aprueba al alumno SIN entrenador (D1)', updateDoc(P(dbA, 'IND_LIBRE', LIBRE), decide(ADMIN, 'approved')), N);
await caso('un entrenador ajeno intenta aprobar', updateDoc(P(dbT2, 'INDV', ALU), decide(TR2, 'approved')), false);
await caso('la propia alumna intenta aprobarse', updateDoc(P(dbS, 'INDU', ALU), decide(ALU, 'approved')), false);
await caso('aprobar tocando también el avance (progressCount)', updateDoc(P(dbT, 'INDT', ALU), { ...decide(TR1, 'approved'), progressCount: 5 }), false);
await caso('decidir sobre una participación YA aprobada', updateDoc(P(dbT, 'INDB', ALU), decide(TR1, 'rejected')), false);

/* ── LA VENTANA D3 ── */
await caso('su entrenador repone la ventana del individual al aprobar', updateDoc(doc(dbT, 'challenges', 'INDW'), { startDate: '2026-11-08', endDate: '2026-11-14' }), N);
await caso('reponer la ventana tocando también el título', updateDoc(doc(dbT, 'challenges', 'INDW'), { startDate: '2026-11-08', endDate: '2026-11-14', title: 'X' }), false);
await caso('un entrenador ajeno repone la ventana', updateDoc(doc(dbT2, 'challenges', 'INDW'), { startDate: '2026-11-08', endDate: '2026-11-14' }), false);
await caso('la alumna repone la ventana de su propio reto', updateDoc(doc(dbS, 'challenges', 'INDW'), { startDate: '2026-11-09', endDate: '2026-11-15' }), false);

/* ── EL AVANCE: solo con la participación aprobada ── */
await caso('la alumna mueve su avance en una participación aprobada', updateDoc(P(dbS, 'INDG', ALU), { progressCount: 2, progressPct: 50 }), true);
await caso('la alumna completa su participación aprobada', updateDoc(P(dbS, 'INDI', ALU), { progressCount: 4, progressPct: 100, completedAt: serverTimestamp() }), true);
await caso('la alumna mueve su avance en una participación PENDIENTE', updateDoc(P(dbS, 'INDD', ALU), { progressCount: 1, progressPct: 25 }), !N);
await caso('la alumna mueve su avance en una participación NO APROBADA', updateDoc(P(dbS, 'INDE', ALU), { progressCount: 1, progressPct: 25 }), !N);
await caso('la alumna mueve su avance en una participación LEGADA (sin joinState)', updateDoc(P(dbS, 'INDF', ALU), { progressCount: 2, progressPct: 50 }), true);

/* ── LA RE-SOLICITUD ── */
await caso('la alumna re-pide tras el «no aprobada» (vuelve a pending, decisión limpia)',
  updateDoc(P(dbS, 'INDC', ALU), { joinState: 'pending', joinRequestedAt: serverTimestamp(), joinDecidedAt: null, joinDecidedBy: null }), N);
await caso('la alumna «re-pide» una que sigue pendiente (no es re-solicitud)',
  updateDoc(P(dbS, 'INDT', ALU), { joinState: 'pending', joinRequestedAt: serverTimestamp(), joinDecidedAt: null, joinDecidedBy: null }), false);

await testEnv.cleanup();
if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n') + '\n'); console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('BATERÍA RETOS OK —', N ? 'CANDIDATA' : 'VIVAS');
