// RONBO NUTRI — Batería CI del delta POOL DE ENTRENADORES
// VISIBLE PARA EL ALUMNO (2026-10-27, AUTH-2026-10-27-041).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
// Banco de reglas: ./firestore.rules = texto VIVO verificado
// a4435194 (SHA-256 08d90807…), SIN el delta. Misma suite que
// pruebas-reglas-pool con la expectativa invertida en P2/P13:
// el contraste prueba que el delta es justo lo que desbloquea
// el standing del pool, y nada más cambia.
//
// El punto 4 de la cola en vivo (verificado 2026-10-26) dejó dos
// hechos de reglas: (1) el list de `users` está DENEGADO al alumno
// — por eso el selector nacía vacío — y (2) el list de
// `trainer_profiles` SÍ está permitido al aprobado. El pool nuevo
// lee los perfiles públicos y, para el cupo, la membresía de cada
// entrenador por GET puntual vía escTrainerStanding: ese get es
// lo ÚNICO que el texto vivo denegaba al alumno (self/owner) y es
// exactamente el delta de este paquete. La suite gemela
// (pruebas-reglas-pool-vivo) corre los MISMOS casos contra el
// texto vivo con la expectativa invertida en P2/P13: el contraste
// prueba que el delta es justo lo que desbloquea el standing.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, collection, updateDoc, writeBatch, serverTimestamp
} from 'firebase/firestore';

const ESPERA_GET_MEMB = false; // texto VIVO: el get de memberships sigue denegado al alumno
const NOMBRE = 'POOL-VIVO';

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
const TS = serverTimestamp();

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Uno', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Dos', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
  await setDoc(doc(db, 'users', 'clientU'), { ...base, name: 'Cliente U', role: 'usuario', approved: false, trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' });
  // Perfiles públicos: trainer1 con cupo (1/5), trainer2 LLENO (5/5),
  // owner1 SIN documento de membresía (el caso del propietario).
  await setDoc(doc(db, 'trainer_profiles', 'trainer1'), { displayName: 'Entrenador Uno', headline: 'Fuerza y técnica', available: true, modalities: ['virtual'], activeStudents: 1, updatedAt: TS });
  await setDoc(doc(db, 'trainer_profiles', 'trainer2'), { displayName: 'Entrenador Dos', headline: 'Resistencia', available: true, modalities: ['virtual'], activeStudents: 5, updatedAt: TS });
  await setDoc(doc(db, 'trainer_profiles', 'owner1'), { displayName: 'Admin Ficticio', headline: 'Propietario', available: true, modalities: ['virtual'], activeStudents: 0, updatedAt: TS });
  await setDoc(doc(db, 'memberships', 'trainer1'), { status: 'activa', level: 'basico', source: 'gratis' });
  await setDoc(doc(db, 'memberships', 'trainer2'), { status: 'activa', level: 'basico', source: 'gratis' });
  // Relaciones nacidas en el registro (como las crea la app):
  // sin entrenador, en espera, modalidad virtual.
  for (const c of ['clientA', 'clientB']) {
    await setDoc(doc(db, 'trainer_relations', c), { alumnoUid: c, trainerUid: null, modality: 'virtual', status: 'en_espera', startedAt: TS, updatedAt: TS });
  }
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const B = testEnv.authenticatedContext('clientB').firestore();
const U = testEnv.authenticatedContext('clientU').firestore();
const anon = testEnv.unauthenticatedContext().firestore();

const PROF = (db, uid) => doc(db, 'trainer_profiles', uid);
const MEMB = (db, uid) => doc(db, 'memberships', uid);

// ---- Lecturas del pool ----
await T('P1 el alumno aprobado LISTA los perfiles públicos (trainer_profiles): admitida',
  getDocs(collection(A, 'trainer_profiles')), true);
await T('P2 el alumno aprobado LEE la membresía de un entrenador (get puntual, el standing del pool): ' + (ESPERA_GET_MEMB ? 'admitida (el delta)' : 'denegada (texto vivo)'),
  getDoc(MEMB(A, 'trainer1')), ESPERA_GET_MEMB);
await T('P3 el alumno aprobado NO puede LISTAR memberships (la lista sigue siendo del propietario): denegada',
  getDocs(collection(A, 'memberships')), false);
await T('P4 el alumno NO aprobado NO lee la membresía ajena: denegada',
  getDoc(MEMB(U, 'trainer1')), false);
await T('P5 un anónimo NO lee la membresía ajena: denegada',
  getDoc(MEMB(anon, 'trainer1')), false);
await T('P6 el entrenador lee SU propia membresía: admitida',
  getDoc(MEMB(tr1, 'trainer1')), true);
await T('P7 el propietario lee la membresía de un entrenador: admitida',
  getDoc(MEMB(owner, 'trainer1')), true);
await T('P8 el alumno aprobado NO puede LISTAR users (el diagnóstico original del pool vacío): denegada',
  getDocs(collection(A, 'users')), false);
await T('P9 el alumno aprobado lee UN perfil público por get: admitida',
  getDoc(PROF(A, 'trainer1')), true);
await T('P13 la sonda del pool sobre el propietario (membresía INEXISTENTE): ' + (ESPERA_GET_MEMB ? 'get admitido y el documento no existe' : 'denegada (texto vivo)'),
  (async () => { const s = await getDoc(MEMB(A, 'owner1')); if (ESPERA_GET_MEMB && s.exists()) throw new Error('owner1 no debe tener membresía'); })(), ESPERA_GET_MEMB);
await T('P14 el alumno NO lee por get el users de un entrenador (el nombre sale del displayName del perfil): denegada',
  getDoc(doc(A, 'users', 'trainer1')), false);

// ---- Elecciones del alumno (la forma exacta de escChangeTrainer) ----
function loteEleccion(db, alumno, destino, activosAntes) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'trainer_relations', alumno), {
    alumnoUid: alumno, trainerUid: destino, modality: 'virtual',
    status: 'activa', startedAt: TS, updatedAt: TS
  });
  batch.set(doc(db, 'users', alumno), { trainerUid: destino, assignmentStatus: 'assigned' }, { merge: true });
  batch.set(PROF(db, destino), { activeStudents: activosAntes + 1, updatedAt: TS }, { merge: true });
  return batch.commit();
}
await T('P10 el alumno elige a un entrenador CON membresía activa y cupo (lote relación + espejo + contador): admitida',
  loteEleccion(A, 'clientA', 'trainer1', 1), true);
await T('P11 el alumno elige al PROPIETARIO, que NO tiene membresía (cupo abierto por isOwner en escQuotaOpen): admitida',
  loteEleccion(B, 'clientB', 'owner1', 0), true);
await T('P12 el alumno NO puede ESCRIBIR la membresía ajena: denegada',
  updateDoc(MEMB(A, 'trainer1'), { level: 'elite' }), false);

// ---- Verificación de datos (sin reglas): el lote dejó la
// relación y el contador acoplados, como exige el patrón N-07 ----
async function leer(col, id) {
  let d = null;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), col, id));
    d = s.exists() ? s.data() : null;
  });
  return d;
}
await T('D1 datos: la relación de clientA quedó activa con trainer1 y su contador subió a 2',
  (async () => {
    const r = await leer('trainer_relations', 'clientA');
    const p = await leer('trainer_profiles', 'trainer1');
    if (!r || r.trainerUid !== 'trainer1' || r.status !== 'activa') throw new Error('relación: ' + JSON.stringify(r));
    if (!p || p.activeStudents !== 2) throw new Error('contador: ' + JSON.stringify(p));
  })(), true);
await T('D2 datos: la relación de clientB quedó activa con el propietario y su contador subió a 1',
  (async () => {
    const r = await leer('trainer_relations', 'clientB');
    const p = await leer('trainer_profiles', 'owner1');
    if (!r || r.trainerUid !== 'owner1' || r.status !== 'activa') throw new Error('relación: ' + JSON.stringify(r));
    if (!p || p.activeStudents !== 1) throw new Error('contador: ' + JSON.stringify(p));
  })(), true);

console.log(`${NOMBRE}: ${pass} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
