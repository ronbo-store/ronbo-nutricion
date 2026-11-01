// RONBO FIT — Batería CI del delta «Elección obligatoria de
// propósito al registrarse» (AUTH-2026-11-01-145; diseño de Ronald
// 2026-11-01 14:22 CST y sus cuatro decisiones del mismo día
// 15:20–15:26 CST). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción.
//
// El delta, sobre el texto vivo (ruleset 2ad00641, SHA-256
// 5525d2f2…; candidata SHA-256 06aba677…), toca SOLO dos cosas:
// (1) la rama de perfil inofensivo de users/{uid} admite SIETE
// claves nuevas de declaración de propósito (purpose, purposeAt,
// purposeUse, purposeSuggest, purposeTrainerChoice,
// purposeMembership, purposeAskedAt) con guardas de valor CERRADAS
// — el propósito jamás puede valer «administrador» —; (2) la
// solicitud propia de membresía admite el nivel «prueba» en la
// lista de requestedLevel. Todo lo demás queda intacto.
// La suite gemela (pruebas-reglas-proposito-vivo) corre los MISMOS
// casos contra el texto VIVO con las expectativas del delta
// invertidas (P1, P9 y P15 denegados allí).
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, writeBatch, serverTimestamp
} from 'firebase/firestore';

const ESPERA_DELTA_OK = false; // candidato: true · vivo: false
const NOMBRE = 'PROPOSITO-VIVO';

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8080) }
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

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const ISO = '2026-11-01T21:20:00.000Z';

/* Siembra sin reglas: documentos de usuario y de membresía base. */
async function seedUser(uid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      name: 'Ficticio ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true, trainerUid: null, assignmentStatus: 'waiting'
    });
  });
}
async function seedMembership(uid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'memberships', uid), {
      level: null, status: 'sin_membresia', source: 'gratis', requestedLevel: null,
      requestedAt: null, decidedBy: null, decidedAt: null, startedAt: null,
      currentPeriodEnd: null, priceSnapshot: null
    });
  });
}
const selfSet = (uid, data) => setDoc(doc(dbOf(uid), 'users', uid), data, { merge: true });

// ---- El delta (1): la declaración de propósito del propio usuario ----
await seedUser('propA');
await T('PROPOSITO P1 declaración completa (purpose+purposeAt+purposeUse+purposeAskedAt): ' + (ESPERA_DELTA_OK ? 'admitida (el delta)' : 'DENEGADA (texto vivo)'),
  selfSet('propA', { purpose: 'cuenta', purposeAt: ISO, purposeUse: 'both', purposeAskedAt: ISO }), ESPERA_DELTA_OK);
await T('PROPOSITO P2 purpose «administrador» (la opción no elegible): denegada en ambos textos',
  selfSet('propA', { purpose: 'administrador' }), false);
await T('PROPOSITO P3 purposeUse fuera de su lista («todo»): denegada en ambos textos',
  selfSet('propA', { purposeUse: 'todo' }), false);
await T('PROPOSITO P4 propósito mezclado con approved:true (privilegio colado): denegada en ambos textos',
  selfSet('propA', { purpose: 'cuenta', approved: true }), false);
await T('PROPOSITO P5 purposeMembership fuera de su lista («oro»): denegada en ambos textos',
  selfSet('propA', { purposeMembership: 'oro' }), false);
await T('PROPOSITO P6 purposeSuggest no booleano («si»): denegada en ambos textos',
  selfSet('propA', { purposeSuggest: 'si' }), false);
await T('PROPOSITO P14 purposeTrainerChoice de 129 caracteres (sobre el tope): denegada en ambos textos',
  selfSet('propA', { purposeTrainerChoice: 'x'.repeat(129) }), false);
await T('PROPOSITO P15 declaración con entrenador elegido (purposeTrainerChoice corto): ' + (ESPERA_DELTA_OK ? 'admitida (el delta)' : 'DENEGADA (texto vivo)'),
  selfSet('propA', { purpose: 'con_entrenador', purposeAt: ISO, purposeTrainerChoice: 'coachFicticioUid' }), ESPERA_DELTA_OK);
await T('PROPOSITO P7 control — mailLang, clave inofensiva de siempre: admitida en ambos textos',
  selfSet('propA', { mailLang: 'es' }), true);

// ---- El nacimiento con propósito: la cláusula de creación NO
// tiene lista cerrada de claves — los campos de propósito nacen
// con el documento sin delta (verificado aquí en AMBOS textos). ----
const regBatch = (uid) => {
  const db = dbOf(uid);
  const user = {
    name: 'Nuevo Ficticio', email: uid + '@test.local', phone: '', gender: '', social: '',
    role: 'usuario', isOwner: false, approved: false,
    accountType: 'alumno', modality: 'virtual',
    features: { training: true, activity: true, photos: true, metrics: true, meals: true, somatotype: true },
    trainerUid: null, assignmentStatus: 'waiting',
    purpose: 'con_entrenador', purposeAt: ISO, purposeSuggest: true,
    acceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: 'v4-2026-10-24',
    adultConfirmed: true, adultConfirmedAt: serverTimestamp(), createdAt: serverTimestamp(),
    consentSeq: 1, consentReceiptId: uid + '_1'
  };
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), user);
  b.set(doc(db, 'consent_receipts', uid + '_1'), {
    uid, email: user.email, type: 'registered', version: 'v4-2026-10-24', at: serverTimestamp() });
  return b.commit();
};
await T('PROPOSITO P13 registro con los campos de propósito en el lote de nacimiento: admitida en AMBOS textos (sin delta)',
  regBatch('propNew13'), true);

// ---- El delta (2): la solicitud de membresía de prueba ----
await seedUser('propCoach'); await seedMembership('propCoach');
const membSet = (uid, data) => setDoc(doc(dbOf(uid), 'memberships', uid), data, { merge: true });
await T('PROPOSITO P9 solicitud propia con requestedLevel «prueba»: ' + (ESPERA_DELTA_OK ? 'admitida (el delta)' : 'DENEGADA (texto vivo)'),
  membSet('propCoach', { status: 'pendiente', requestedLevel: 'prueba', requestedAt: serverTimestamp() }), ESPERA_DELTA_OK);
await seedMembership('propCoach');
await T('PROPOSITO P10 solicitud con nivel fuera de lista («oro»): denegada en ambos textos',
  membSet('propCoach', { status: 'pendiente', requestedLevel: 'oro', requestedAt: serverTimestamp() }), false);
await T('PROPOSITO P11 control — solicitud con requestedLevel «elite»: admitida en ambos textos',
  membSet('propCoach', { status: 'pendiente', requestedLevel: 'elite', requestedAt: serverTimestamp() }), true);
await seedMembership('propCoach');
await T('PROPOSITO P12 auto-activación (status «activa» por la propia mano): denegada en ambos textos',
  membSet('propCoach', { status: 'activa', requestedLevel: 'prueba', requestedAt: serverTimestamp() }), false);
await T('PROPOSITO P8 control — nacimiento del documento de membresía «sin_membresia»: admitida en ambos textos',
  (async () => { await seedUser('propCoach2'); return setDoc(doc(dbOf('propCoach2'), 'memberships', 'propCoach2'), {
    level: null, status: 'sin_membresia', source: 'gratis', requestedLevel: null,
    requestedAt: null, decidedBy: null, decidedAt: null, startedAt: null,
    currentPeriodEnd: null, priceSnapshot: null }); })(), true);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
