// RONBO NUTRI — Serie F: RECHAZO de alumnos por el entrenador
// (decisión §8.2 de Ronald, chat RONBO.NUTRI 2026-10-24 17:11 CDT).
// Casos del DELTA escrito en preparacion-local/
// firestore.rules.delta-rechazo-alumno-2026-10-24.md.
// ⚠️ ESCRITA PERO NO EJECUTADA: requiere un fixture NUEVO =
// candidato del paquete + delta de rechazo fusionado (el
// build-fixture.py actual copia el candidato SIN el delta; estos
// casos están pensados para correr cuando Ronald autorice el
// paquete correctivo). Usuarios FICTICIOS, emulador LOCAL.
// Nunca toca producción.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, writeBatch, serverTimestamp
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
const al5 = testEnv.authenticatedContext('al5').firestore();

const baseUser = { isOwner: false, approved: true, acceptedTerms: true, termsVersion: 'v4-2026-10-24', consentSeq: 2 };
const FEATS = { training: true, activity: true, photos: true, metrics: true, meals: false, somatotype: true };
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const seed = {
    'users/adm': { ...baseUser, name: 'Admin', isOwner: true, role: 'administrador', approved: true },
    'users/tr1': { ...baseUser, name: 'Entrenador Uno', role: 'entrenador', trainerUid: null, assignmentStatus: 'waiting', approvalsUsed: 0 },
    'users/tr2': { ...baseUser, name: 'Entrenador Dos', role: 'entrenador', trainerUid: null, assignmentStatus: 'waiting', approvalsUsed: 0 },
    // al5: eligió a tr1, SIN aprobar — el caso del rechazo.
    'users/al5': { ...baseUser, name: 'Alumno Cinco', role: 'usuario', accountType: 'alumno', modality: 'virtual', trainerUid: 'tr1', assignmentStatus: 'assigned', approved: false, features: { ...FEATS } },
    'trainer_relations/al5': { alumnoUid: 'al5', trainerUid: 'tr1', modality: 'virtual', status: 'activa' },
    // al6: alumno de tr1 YA aprobado — no rechazable por esta vía.
    'users/al6': { ...baseUser, name: 'Alumno Seis', role: 'usuario', accountType: 'alumno', modality: 'virtual', trainerUid: 'tr1', assignmentStatus: 'assigned', approved: true, features: { ...FEATS } },
    'trainer_relations/al6': { alumnoUid: 'al6', trainerUid: 'tr1', modality: 'virtual', status: 'activa' },
    // al7: eligió a tr1, sin aprobar — para el intento cruzado de tr2.
    'users/al7': { ...baseUser, name: 'Alumno Siete', role: 'usuario', accountType: 'alumno', modality: 'presencial', trainerUid: 'tr1', assignmentStatus: 'assigned', approved: false, features: { ...FEATS } },
    'trainer_relations/al7': { alumnoUid: 'al7', trainerUid: 'tr1', modality: 'presencial', status: 'activa' },
    // al8: sin aprobar, de tr1 — para la vía del administrador.
    'users/al8': { ...baseUser, name: 'Alumno Ocho', role: 'usuario', accountType: 'alumno', modality: 'hibrido', trainerUid: 'tr1', assignmentStatus: 'assigned', approved: false, features: { ...FEATS } },
    'trainer_relations/al8': { alumnoUid: 'al8', trainerUid: 'tr1', modality: 'hibrido', status: 'activa' },
    // al9: en espera general, sin entrenador — nadie puede «rechazarlo».
    'users/al9': { ...baseUser, name: 'Alumno Nueve', role: 'usuario', accountType: 'alumno', modality: 'virtual', trainerUid: null, assignmentStatus: 'waiting', approved: false, features: { ...FEATS } },
    'trainer_relations/al9': { alumnoUid: 'al9', trainerUid: null, modality: 'virtual', status: 'en_espera' },
    'trainer_profiles/tr1': { displayName: 'Entrenador Uno', modalities: ['presencial', 'hibrido', 'virtual'], available: true, activeStudents: 1 },
    'app_settings/approvals': { maxPerTrainer: 5 },
  };
  for (const [p, data] of Object.entries(seed)) {
    const i = p.lastIndexOf('/');
    await setDoc(doc(db, p.slice(0, i), p.slice(i + 1)), data);
  }
});

/* El lote EXACTO de la app (escRejectStudent): espejo a espera +
   relación cerrada + evento 'rechazo' en el historial, en un lote. */
function loteRechazo(db, alumno, modality, by) {
  const b = writeBatch(db);
  b.update(doc(db, 'users', alumno), { trainerUid: null, assignmentStatus: 'waiting' });
  b.set(doc(db, 'trainer_relations', alumno), {
    alumnoUid: alumno, trainerUid: null, modality, status: 'en_espera',
    startedAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  b.set(doc(db, 'trainer_relations', alumno, 'history', 'evF1'), {
    type: 'rechazo', fromTrainerUid: by, toTrainerUid: null, modality, by, at: serverTimestamp()
  });
  return b.commit();
}

await T('F1 el entrenador RECHAZA a su alumno sin aprobar: el lote completo pasa',
  loteRechazo(tr1, 'al5', 'virtual', 'tr1'), true);

await T('F2 otro entrenador NO puede rechazar al alumno que no lo eligió',
  loteRechazo(tr2, 'al7', 'presencial', 'tr2'), false);

await T('F3 un alumno YA aprobado NO se rechaza por esta vía',
  loteRechazo(tr1, 'al6', 'virtual', 'tr1'), false);

await T('F4 lote INCOMPLETO (solo el espejo, sin cerrar la relación) denegado',
  updateDoc(doc(tr1, 'users', 'al7'), { trainerUid: null, assignmentStatus: 'waiting' }), false);

await T('F5 mezclar rechazo con aprobación (approved=true) denegado',
  (() => { const b = writeBatch(tr1);
    b.update(doc(tr1, 'users', 'al7'), { trainerUid: null, assignmentStatus: 'waiting', approved: true });
    b.set(doc(tr1, 'trainer_relations', 'al7'), { alumnoUid: 'al7', trainerUid: null, modality: 'presencial', status: 'en_espera', startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return b.commit(); })(), false);

await T('F6 el alumno NO puede fabricar su propio evento de rechazo (by != autor)',
  setDoc(doc(al5, 'trainer_relations', 'al5', 'history', 'evFake'),
    { type: 'rechazo', fromTrainerUid: 'tr1', toTrainerUid: null, by: 'tr1', at: serverTimestamp() }), false);

await T('F7 el ADMINISTRADOR conserva su vía viva para devolver a la espera (sin regresión)',
  loteRechazo(adm, 'al8', 'hibrido', 'adm'), true);

await T('F8 un alumno en espera general (sin entrenador) NO es rechazable',
  loteRechazo(tr1, 'al9', 'virtual', 'tr1'), false);

console.log(`\nSERIE F: ${pass}/${pass + fail} PASS`);
if (failures.length) { console.log('FALLOS:', failures); process.exit(1); }
await testEnv.cleanup();
process.exit(0);
