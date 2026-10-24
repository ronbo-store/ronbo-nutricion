// RONBO NUTRI — Batería CI del candidato «Roles + Escalabilidad»
// (2026-10-24). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción. Banco de reglas: ./firestore.rules (generado por
// build-fixture.py = el candidato del paquete, íntegro).
// ⚠️ ESCRITA PERO NO EJECUTADA en este paquete: correr la CI y
// publicar las reglas requieren autorización por separado de Ronald.
//
// Matriz: administrador / entrenador / alumno × users(create/update),
// memberships, trainer_profiles, trainer_relations(+history),
// meal_requests, audit_log, app_settings — con los acoplamientos
// getAfter (relación↔espejo, relación↔contadores, confirmación de
// comidas↔features.meals) que el candidato exige.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, collection, addDoc,
  updateDoc, deleteDoc, writeBatch, serverTimestamp
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

const adm = testEnv.authenticatedContext('adm').firestore();
const tr1 = testEnv.authenticatedContext('tr1').firestore();
const tr2 = testEnv.authenticatedContext('tr2').firestore();
const al1 = testEnv.authenticatedContext('al1').firestore();
const al3 = testEnv.authenticatedContext('al3').firestore();
const anon = testEnv.unauthenticatedContext().firestore();

const baseUser = { isOwner: false, approved: true, acceptedTerms: true, termsVersion: 'v4-2026-10-24', consentSeq: 2 };
/* Siembra sin reglas: identidades y estados de partida. */
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const seed = {
    'users/adm': { ...baseUser, name: 'Admin', isOwner: true, role: 'administrador', approved: true },
    'users/tr1': { ...baseUser, name: 'Entrenador Uno', role: 'entrenador', trainerUid: null, assignmentStatus: 'waiting' },
    'users/tr2': { ...baseUser, name: 'Entrenador Dos', role: 'entrenador', trainerUid: null, assignmentStatus: 'waiting' },
    'users/tr3': { ...baseUser, name: 'Entrenador Tres', role: 'entrenador', trainerUid: null, assignmentStatus: 'waiting' },
    'users/al1': { ...baseUser, name: 'Alumno Uno', role: 'usuario', accountType: 'alumno', modality: 'virtual', trainerUid: 'tr1', assignmentStatus: 'assigned', features: { training: true, activity: true, photos: true, metrics: true, meals: false, somatotype: true } },
    'users/al2': { ...baseUser, name: 'Alumno Dos', role: 'usuario', accountType: 'alumno', modality: 'presencial', trainerUid: null, assignmentStatus: 'waiting', features: { training: true, activity: true, photos: true, metrics: true, meals: false, somatotype: true } },
    'users/al3': { ...baseUser, name: 'Alumno Tres', role: 'usuario', accountType: 'alumno', modality: 'hibrido', trainerUid: null, assignmentStatus: 'waiting', features: { training: true, activity: true, photos: true, metrics: true, meals: false, somatotype: true } },
    'trainer_relations/al3': { alumnoUid: 'al3', trainerUid: null, modality: 'hibrido', status: 'en_espera' },
    'memberships/tr1': { level: 'basico', status: 'activa', source: 'gratis', requestedLevel: null },
    'memberships/tr2': { level: null, status: 'sin_membresia', source: 'gratis', requestedLevel: null },
    'trainer_profiles/tr1': { displayName: 'Entrenador Uno', modalities: ['presencial', 'hibrido', 'virtual'], bio: '', available: true, activeStudents: 5 },
    'trainer_profiles/tr2': { displayName: 'Entrenador Dos', modalities: ['presencial', 'hibrido', 'virtual'], bio: '', available: true, activeStudents: 0 },
    'trainer_relations/al1': { alumnoUid: 'al1', trainerUid: 'tr1', modality: 'virtual', status: 'activa' },
    'app_settings/approvals': { maxPerTrainer: 5 }
  };
  for (const [p, data] of Object.entries(seed)) {
    const [col, id] = p.split('/');
    await setDoc(doc(db, col, id), data);
  }
});

/* ---------- users: creación con campos nuevos ---------- */
const regBase = {
  isOwner: false, approved: false, role: 'usuario', acceptedTerms: true,
  termsVersion: 'v4-2026-10-24', termsAcceptedAt: serverTimestamp(),
  adultConfirmed: true, consentSeq: 1
};
/* El recibo 'registered' acoplado (A2) lo siembra el propio registro
   en el mismo lote; aquí se usa un lote por caso. */
async function regBatch(db, uid, extra) {
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), { ...regBase, consentReceiptId: uid + '_1', ...extra });
  b.set(doc(db, 'consent_receipts', uid + '_1'), { uid, email: uid + '@test.local', type: 'registered', version: 'v4-2026-10-24', at: serverTimestamp() });
  return b.commit();
}
await T('U1 registro de ALUMNO con modalidad y features (comidas apagadas) nace bien',
  regBatch(testEnv.authenticatedContext('nuevo1').firestore(), 'nuevo1',
    { accountType: 'alumno', modality: 'hibrido', trainerUid: null, assignmentStatus: 'waiting', features: { training: true, activity: true, photos: true, metrics: true, meals: false, somatotype: true } }), true);
await T('U2 registro con features.meals = true al nacer DENEGADO (comidas solo por solicitud)',
  regBatch(testEnv.authenticatedContext('nuevo2').firestore(), 'nuevo2',
    { accountType: 'alumno', modality: 'virtual', trainerUid: null, assignmentStatus: 'waiting', features: { meals: true } }), false);
await T('U3 registro de ENTRENADOR (roleRequest, sin entrenador, en espera) nace bien',
  regBatch(testEnv.authenticatedContext('nuevo3').firestore(), 'nuevo3',
    { accountType: 'entrenador', roleRequest: 'entrenador', trainerUid: null, assignmentStatus: 'waiting' }), true);
await T('U4 roleRequest con entrenador asignado DENEGADO (el entrenador nace sin rol ni entrenador)',
  regBatch(testEnv.authenticatedContext('nuevo4').firestore(), 'nuevo4',
    { accountType: 'entrenador', roleRequest: 'entrenador', trainerUid: 'tr1', assignmentStatus: 'assigned' }), false);
await T('U5 modalidad fuera de la lista cerrada DENEGADA',
  regBatch(testEnv.authenticatedContext('nuevo5').firestore(), 'nuevo5',
    { accountType: 'alumno', modality: 'telepatica', trainerUid: null, assignmentStatus: 'waiting' }), false);

/* ---------- memberships ---------- */
await T('M1 el entrenador SOLICITA nivel sobre su membresía (pendiente)',
  updateDoc(doc(tr2, 'memberships', 'tr2'), { status: 'pendiente', requestedLevel: 'premium', requestedAt: serverTimestamp() }), true);
await T('M2 el entrenador NO puede aprobarse su propia solicitud',
  updateDoc(doc(tr2, 'memberships', 'tr2'), { status: 'activa', level: 'premium' }), false);
await T('M3 el entrenador NO toca la membresía de otro',
  updateDoc(doc(tr2, 'memberships', 'tr1'), { status: 'pendiente', requestedLevel: 'elite', requestedAt: serverTimestamp() }), false);
await T('M4 el administrador APRUEBA la solicitud (activa el nivel)',
  updateDoc(doc(adm, 'memberships', 'tr2'), { level: 'premium', status: 'activa', decidedBy: 'adm', decidedAt: serverTimestamp(), startedAt: serverTimestamp() }), true);
await T('M5 nadie BORRA una membresía (el historial jamás se elimina)',
  deleteDoc(doc(adm, 'memberships', 'tr2')), false);
await T('M6 un alumno NO lee membresías ajenas',
  getDoc(doc(al1, 'memberships', 'tr1')), false);

/* ---------- trainer_profiles ---------- */
await T('P1 el entrenador edita SU bio y disponibilidad',
  updateDoc(doc(tr1, 'trainer_profiles', 'tr1'), { bio: 'ISSA, 8 años', available: false }), true);
await T('P2 el entrenador NO se quita modalidades a sí mismo (las fija el administrador)',
  updateDoc(doc(tr1, 'trainer_profiles', 'tr1'), { modalities: ['virtual'] }), false);
await T('P3 el administrador SÍ ajusta las modalidades de un entrenador',
  updateDoc(doc(adm, 'trainer_profiles', 'tr1'), { modalities: ['presencial', 'virtual'] }), true);
await T('P4 el entrenador NO puede bajar su contador a mano (−1 prohibido)',
  updateDoc(doc(tr1, 'trainer_profiles', 'tr1'), { activeStudents: 4 }), false);
await T('P5 lectura de perfiles con sesión (el pool lo necesita)',
  getDoc(doc(al1, 'trainer_profiles', 'tr1')), true);
await T('P6 sin sesión NO se leen perfiles', getDoc(doc(anon, 'trainer_profiles', 'tr1')), false);

/* ---------- trainer_relations + historial ---------- */
await T('R1 relación hacia entrenador SIN membresía DENEGADA (cupo 0: tr3 no tiene membresía)',
  setDoc(doc(al2, 'trainer_relations', 'al2'), { alumnoUid: 'al2', trainerUid: 'tr3', modality: 'presencial', status: 'activa' }), false);
/* (tr2 ya quedó con membresía premium activa en M4: el cupo manda) */
await T('R2 relación hacia entrenador con cupo libre nace bien',
  setDoc(doc(al2, 'trainer_relations', 'al2'), { alumnoUid: 'al2', trainerUid: 'tr2', modality: 'presencial', status: 'activa' }), true);
await T('R3 relación hacia entrenador con el CUPO LLENO denegada (tr1 básico: 5/5)',
  setDoc(doc(al2, 'trainer_relations', 'al2'), { alumnoUid: 'al2', trainerUid: 'tr1', modality: 'virtual', status: 'activa' }), false);
await T('R4 el alumno NO puede cambiar la modalidad de su relación (punto abierto: apagado)',
  updateDoc(doc(al1, 'trainer_relations', 'al1'), { modality: 'presencial' }), false);
await T('R5 historial: el alumno anexa el evento de su cambio',
  setDoc(doc(al1, 'trainer_relations', 'al1', 'history', 'ev1'), { type: 'cambio', fromTrainerUid: 'tr1', toTrainerUid: null, by: 'al1', at: serverTimestamp() }), true);
await T('R6 historial: NADIE edita un evento anexado',
  updateDoc(doc(al1, 'trainer_relations', 'al1', 'history', 'ev1'), { type: 'baja' }), false);

/* ---------- cambio de entrenador acoplado (users + relación + contadores) ---------- */
{
  /* al1 pasa de tr1 (cupo lleno pero es SALIDA: −1) a tr2 (con cupo) */
  const b = writeBatch(al1);
  b.update(doc(al1, 'users', 'al1'), { trainerUid: 'tr2', assignmentStatus: 'assigned' });
  b.set(doc(al1, 'trainer_relations', 'al1'), { alumnoUid: 'al1', trainerUid: 'tr2', modality: 'virtual', status: 'activa', startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.update(doc(al1, 'trainer_profiles', 'tr1'), { activeStudents: 4 });
  b.update(doc(al1, 'trainer_profiles', 'tr2'), { activeStudents: 1 });
  await T('C1 cambio de entrenador COMPLETO en un lote (espejo + relación + contadores)', b.commit(), true);
}
{
  const b = writeBatch(al1);
  b.update(doc(al1, 'users', 'al1'), { trainerUid: 'tr1', assignmentStatus: 'assigned' });
  await T('C2 espejo SIN relación en el mismo lote DENEGADO (acoplamiento getAfter)', b.commit(), false);
}

/* ---------- meal_requests: dos pasos ---------- */
let reqId = null;
{
  const r = await addDoc(collection(al1, 'meal_requests'), { alumnoUid: 'al1', trainerUid: 'tr2', status: 'pendiente_entrenador', requestedAt: serverTimestamp(), note: '' }).catch(() => null);
  reqId = r && r.id;
  await T('Q1 el alumno crea su solicitud (paso 0: nace pendiente del entrenador)', Promise.resolve(r), !!r);
}
await T('Q2 el entrenador de la solicitud la aprueba (paso 1 → administrador)',
  updateDoc(doc(tr2, 'meal_requests', reqId), { status: 'pendiente_administrador', trainerDecisionBy: 'tr2', trainerDecisionAt: serverTimestamp() }), true);
await T('Q3 el entrenador NO puede confirmar (el paso 2 no es suyo)',
  updateDoc(doc(tr2, 'meal_requests', reqId), { status: 'aprobada', adminDecisionBy: 'tr2', adminDecisionAt: serverTimestamp() }), false);
{
  const b = writeBatch(adm);
  b.update(doc(adm, 'meal_requests', reqId), { status: 'aprobada', adminDecisionBy: 'adm', adminDecisionAt: serverTimestamp() });
  await T('Q4 el administrador NO confirma sin encender features.meals en el mismo lote', b.commit(), false);
}
{
  const b = writeBatch(adm);
  b.update(doc(adm, 'meal_requests', reqId), { status: 'aprobada', adminDecisionBy: 'adm', adminDecisionAt: serverTimestamp() });
  b.update(doc(adm, 'users', 'al1'), { features: { training: true, activity: true, photos: true, metrics: true, meals: true, somatotype: true } });
  await T('Q5 confirmación COMPLETA: solicitud aprobada + features.meals = true', b.commit(), true);
}
await T('Q6 otro entrenador NO ve la solicitud', getDoc(doc(tr1, 'meal_requests', reqId)), false);

/* ---------- modality_requests: punto 9 (decisión 2026-10-24) ----------
   Estado al llegar aquí: al1 tiene entrenador tr2 (tras C1) y
   modalidad 'virtual' en relación y espejo; tr1 conserva cupo. */
const modReq = (db, uid, data) => setDoc(doc(db, 'modality_requests', uid), data);
await T('D1 el alumno CREA su solicitud de modalidad (de la vigente a otra; paso 0)',
  modReq(al1, 'al1', { alumnoUid: 'al1', trainerUid: 'tr2', fromModality: 'virtual', toModality: 'presencial', status: 'pendiente_entrenador', requestedAt: serverTimestamp(), note: '' }), true);
await T('D2 con una solicitud VIVA no cabe otra (la segunda NO duplica: denegada)',
  modReq(al1, 'al1', { alumnoUid: 'al1', trainerUid: 'tr2', fromModality: 'virtual', toModality: 'hibrido', status: 'pendiente_entrenador', requestedAt: serverTimestamp(), note: '' }), false);
await T('D3 pedir la MISMA modalidad vigente DENEGADO (destino = origen no es cambio)',
  modReq(al3, 'al3', { alumnoUid: 'al3', trainerUid: null, fromModality: 'hibrido', toModality: 'hibrido', status: 'pendiente_administrador', requestedAt: serverTimestamp(), note: '' }), false);
await T('D4 un entrenador que NO es el de la solicitud no la aprueba (actores cruzados)',
  updateDoc(doc(tr1, 'modality_requests', 'al1'), { status: 'pendiente_administrador', trainerDecisionBy: 'tr1', trainerDecisionAt: serverTimestamp() }), false);
await T('D5 el entrenador DE la solicitud la aprueba (paso 1 → administrador)',
  updateDoc(doc(tr2, 'modality_requests', 'al1'), { status: 'pendiente_administrador', trainerDecisionBy: 'tr2', trainerDecisionAt: serverTimestamp() }), true);
{
  const b = writeBatch(adm);
  b.update(doc(adm, 'modality_requests', 'al1'), { status: 'aprobada', adminDecisionBy: 'adm', adminDecisionAt: serverTimestamp() });
  await T('D6 confirmar SIN aplicar el cambio en el mismo lote DENEGADO (acoplamiento getAfter)', b.commit(), false);
}
await T('D7 cambio DIRECTO de la modalidad de la relación por el administrador DENEGADO (sin confirmación acoplada)',
  updateDoc(doc(adm, 'trainer_relations', 'al1'), { modality: 'presencial' }), false);
{
  const b = writeBatch(adm);
  b.update(doc(adm, 'modality_requests', 'al1'), { status: 'aprobada', adminDecisionBy: 'adm', adminDecisionAt: serverTimestamp() });
  b.update(doc(adm, 'trainer_relations', 'al1'), { modality: 'presencial' });
  b.update(doc(adm, 'users', 'al1'), { modality: 'presencial' });
  await T('D8 confirmación COMPLETA: solicitud aprobada + modalidad nueva en relación y espejo', b.commit(), true);
}
await T('D9 tras el cierre el alumno puede VOLVER a solicitar (re-solicitud con la forma cerrada)',
  modReq(al1, 'al1', { alumnoUid: 'al1', trainerUid: 'tr2', fromModality: 'presencial', toModality: 'hibrido', status: 'pendiente_entrenador', requestedAt: serverTimestamp(), note: '' }), true);
{
  const b = writeBatch(adm);
  b.update(doc(adm, 'modality_requests', 'al1'), { status: 'aprobada', adminDecisionBy: 'adm', adminDecisionAt: serverTimestamp() });
  b.update(doc(adm, 'trainer_relations', 'al1'), { modality: 'hibrido' });
  b.update(doc(adm, 'users', 'al1'), { modality: 'hibrido' });
  await T('D10 confirmación SIN aprobación previa del entrenador DENEGADA (no se salta el paso 1)', b.commit(), false);
}
await T('D11 el entrenador RECHAZA: la solicitud se cierra sin tocar la relación',
  updateDoc(doc(tr2, 'modality_requests', 'al1'), { status: 'rechazada', trainerDecisionBy: 'tr2', trainerDecisionAt: serverTimestamp() }), true);
await T('D12 SIN entrenador, la solicitud nace ante el administrador (pendiente_administrador)',
  modReq(al3, 'al3', { alumnoUid: 'al3', trainerUid: null, fromModality: 'hibrido', toModality: 'virtual', status: 'pendiente_administrador', requestedAt: serverTimestamp(), note: '' }), true);
await T('D13 ningún entrenador actúa sobre una solicitud sin entrenador (no hay paso 1 que dar)',
  updateDoc(doc(tr1, 'modality_requests', 'al3'), { status: 'pendiente_administrador', trainerDecisionBy: 'tr1', trainerDecisionAt: serverTimestamp() }), false);
{
  const b = writeBatch(adm);
  b.update(doc(adm, 'modality_requests', 'al3'), { status: 'aprobada', adminDecisionBy: 'adm', adminDecisionAt: serverTimestamp() });
  b.set(doc(adm, 'trainer_relations', 'al3'), { alumnoUid: 'al3', trainerUid: null, modality: 'virtual', status: 'en_espera', updatedAt: serverTimestamp() }, { merge: true });
  b.update(doc(adm, 'users', 'al3'), { modality: 'virtual' });
  await T('D14 el administrador RESUELVE completa la solicitud sin entrenador (aprueba y confirma en su rol)', b.commit(), true);
}
await T('D15 nueva solicitud del alumno (para probar la cancelación por cambio de entrenador)',
  modReq(al1, 'al1', { alumnoUid: 'al1', trainerUid: 'tr2', fromModality: 'presencial', toModality: 'virtual', status: 'pendiente_entrenador', requestedAt: serverTimestamp(), note: '' }), true);
{
  const b = writeBatch(al1);
  b.update(doc(al1, 'users', 'al1'), { trainerUid: 'tr1', assignmentStatus: 'assigned' });
  b.set(doc(al1, 'trainer_relations', 'al1'), { alumnoUid: 'al1', trainerUid: 'tr1', modality: 'presencial', status: 'activa', startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.update(doc(al1, 'trainer_profiles', 'tr1'), { activeStudents: 5 });
  b.update(doc(al1, 'trainer_profiles', 'tr2'), { activeStudents: 0 });
  b.update(doc(al1, 'modality_requests', 'al1'), { status: 'cancelada', cancelledBy: 'al1', cancelledAt: serverTimestamp(), cancelReason: 'cambio_entrenador' });
  await T('D16 cambiar de entrenador CIERRA la solicitud viva como cancelada (mismo lote, acoplado)', b.commit(), true);
}
await T('D17 la solicitud quedó CANCELADA y la modalidad vigente NO se movió (presencial)',
  getDoc(doc(al1, 'modality_requests', 'al1'))
    .then(s => { if (s.data().status !== 'cancelada') throw new Error('no cancelada'); })
    .then(() => getDoc(doc(al1, 'trainer_relations', 'al1')))
    .then(s => { if (s.data().modality !== 'presencial') throw new Error('modalidad tocada'); }), true);

/* ---------- audit_log (patrón ND-2) ---------- */
let logId = null;
{
  const r = await addDoc(collection(tr1, 'audit_log'), { type: 'membership', action: 'membership.requested', actorUid: 'tr1', targetUid: 'tr1', detail: 'premium', at: serverTimestamp() }).catch(() => null);
  logId = r && r.id;
  await T('A1 un actor firma su propio evento de auditoría', Promise.resolve(r), !!r);
}
await T('A2 nadie edita un evento de auditoría', updateDoc(doc(adm, 'audit_log', logId), { action: 'x' }), false);
await T('A3 nadie borra un evento de auditoría', deleteDoc(doc(adm, 'audit_log', logId)), false);
await T('A4 solo el administrador LEE la auditoría', getDoc(doc(tr1, 'audit_log', logId)), false);

/* ---------- app_settings: banderas y catálogo ---------- */
await T('F1 el administrador escribe feature_flags',
  setDoc(doc(adm, 'app_settings', 'feature_flags'), { flags: { meals: false } }), true);
await T('F2 un entrenador NO escribe feature_flags',
  setDoc(doc(tr1, 'app_settings', 'feature_flags'), { flags: { meals: true } }), false);
await T('F3 lectura de feature_flags con sesión (la app las refleja)',
  getDoc(doc(al1, 'app_settings', 'feature_flags')), true);
await T('F4 el administrador escribe el catálogo de membresías (precios fuera del código)',
  setDoc(doc(adm, 'app_settings', 'membership_catalog'), { levels: { basico: { quota: 5, priceMonthlyCents: null } } }), true);
await T('F5 documentos de app_settings fuera de la lista cerrada siguen DENEGADOS',
  setDoc(doc(adm, 'app_settings', 'otra_cosa'), { x: 1 }), false);

console.log(`\nRESULTADO: ${pass}/${pass + fail} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
