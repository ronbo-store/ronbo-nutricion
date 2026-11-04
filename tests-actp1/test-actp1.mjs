// RONBO FIT — Batería CI del delta de reglas «Integración de
// actividad, Paquete 1» (2026-11-03): consentimiento por tipo en
// users.activityConsents con recibos derivados + colección nueva
// activity_data (solo sueño) con la compuerta del entrenador.
// Usuarios FICTICIOS, emulador oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// d85419e6-f6f2-42e8-b55f-24b35fbcbd25, AUTH-2026-11-03-210):
//   · ayudantes actData*/actConsentActive y la familia de
//     derivación act* (recibos activity-{tipo}-{granted|renewed|
//     withdrawn});
//   · receiptType gana una guarda previa estricta; receiptVersion
//     gana los 12 tipos de actividad;
//   · users.create: nadie nace con activityConsents; la rama del
//     propietario ya no puede tocar activityConsents;
//   · dos ramas del propio alumno (otorgar/renovar · retirar);
//   · bloque nuevo match /activity_data/{docId}.
// Nada más.
//
// La suite corre en DOS modos con la misma lista de casos:
//   ESPERA_NUEVO=true  → candidata (lo nuevo se comporta como se
//                        diseñó)
//   ESPERA_NUEVO=false → texto vivo (activityConsents no tiene
//                        ramas: los actos nuevos se deniegan;
//                        activity_data no existe: todo denegado;
//                        la rama del propietario SÍ podía escribir
//                        el campo: G12 se invierte a ALLOW)
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, query, collection, where,
  writeBatch, setDoc, updateDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const NOMBRE = ESPERA_NUEVO ? 'ACTP1-CANDIDATA' : 'ACTP1-VIVO';

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
    console.log('::error title=' + name + '::' + String(e && e.message || e).slice(0, 1500).replace(/[\r\n]+/g, ' '));
  }
}

const dbOf = (uid) => uid ? testEnv.authenticatedContext(uid).firestore()
  : testEnv.unauthenticatedContext().firestore();
const adminDb = () => testEnv.withSecurityRulesDisabled(async (ctx) => ctx.firestore());

const V = 'v1-2026-11-03';           // versión del texto de actividad
const BT_V = 'v1-2026-10-24';        // versión vigente de tipo corporal
const OLD_A = new Date('2026-10-30T10:00:00Z');
const OLD_W = new Date('2026-11-01T10:00:00Z');

async function seedUser(uid, extra) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), Object.assign({
      name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true, termsVersion: 'vX',
      consentSeq: 3, consentReceiptId: uid + '_3'
    }, extra || {}));
  });
}
async function seedSleep(uid, fecha, minutos) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'activity_data', uid + '_' + fecha + '_sleep'), {
      clientUid: uid, date: fecha, dataType: 'sleep', value: minutos,
      unit: 'min', source: 'manual', createdAt: OLD_A, updatedAt: OLD_A
    });
  });
}
async function readUser(uid) {
  let out = null;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), 'users', uid));
    out = s.exists() ? s.data() : null;
  });
  return out;
}

/* El lote acoplado de la casa, como lo construye consentBatch:
   set merge en users {activityConsents, consentSeq, consentReceiptId}
   + el recibo {uid}_{seq} con {uid, email, type, version, at}. */
function consentAct(db, uid, map, seq, type, version) {
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid),
    { activityConsents: map, consentSeq: seq, consentReceiptId: uid + '_' + seq },
    { merge: true });
  b.set(doc(db, 'consent_receipts', uid + '_' + seq),
    { uid, email: uid + '@test.local', type, version, at: serverTimestamp() });
  return b.commit();
}

await seedUser('dueno', { isOwner: true, role: 'administrador', consentSeq: 5, consentReceiptId: 'dueno_5' });
await seedUser('entrenadorT', { role: 'entrenador', consentSeq: 1, consentReceiptId: 'entrenadorT_1' });
await seedUser('entrenadorU', { role: 'entrenador', consentSeq: 1, consentReceiptId: 'entrenadorU_1' });
await seedUser('aluBase', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned' });
await seedUser('aluGrant', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned' });
await seedUser('aluDos', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', consentSeq: 4, consentReceiptId: 'aluDos_4' });
await seedUser('aluSleep', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', consentSeq: 4, consentReceiptId: 'aluSleep_4',
  activityConsents: { sleep: { status: 'accepted', version: V, acceptedAt: OLD_A } } });
await seedUser('aluRet', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', consentSeq: 4, consentReceiptId: 'aluRet_4',
  activityConsents: { sleep: { status: 'accepted', version: V, acceptedAt: OLD_A } } });
await seedUser('aluRen', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', consentSeq: 6, consentReceiptId: 'aluRen_6',
  activityConsents: { steps: { status: 'withdrawn', version: V, acceptedAt: OLD_A, withdrawnAt: OLD_W } } });
await seedUser('aluBt', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', consentSeq: 2, consentReceiptId: 'aluBt_2' });
await seedSleep('aluSleep', '2026-11-02', 450);
await seedSleep('aluRet', '2026-11-02', 420);
await seedSleep('aluDos', '2026-11-02', 400);

/* ════════ CONSENTIMIENTO POR TIPO (users.activityConsents) ════════ */
// G1 — otorgar el sueño desde cero, con su recibo acoplado.
await T('G1 otorgar sueño (aluGrant) con recibo activity-sleep-granted',
  consentAct(dbOf('aluGrant'), 'aluGrant',
    { sleep: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
    4, 'activity-sleep-granted', V),
  ESPERA_NUEVO);
// G2 — otorgar sin recibo: denegado en ambos textos.
await T('G2 otorgar pasos sin recibo = denegado', (() => {
  const db = dbOf('aluBase'); const b = writeBatch(db);
  b.set(doc(db, 'users', 'aluBase'),
    { activityConsents: { steps: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
      consentSeq: 4, consentReceiptId: 'aluBase_4' }, { merge: true });
  return b.commit();
})(), false);
// G3 — recibo de otro tipo: denegado.
await T('G3 otorgar sueño con recibo de pasos = denegado',
  consentAct(dbOf('aluDos'), 'aluDos',
    { sleep: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
    5, 'activity-steps-granted', V),
  false);
// G4 — dos tipos en un acto: denegado.
await T('G4 otorgar dos tipos a la vez = denegado',
  consentAct(dbOf('aluDos'), 'aluDos',
    { steps: { status: 'accepted', version: V, acceptedAt: serverTimestamp() },
      sleep: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
    5, 'activity-sleep-granted', V),
  false);
// G5 — el acto toca además otro campo: denegado.
await T('G5 otorgar mezclando otro campo (name) = denegado', (() => {
  const db = dbOf('aluDos'); const b = writeBatch(db);
  b.set(doc(db, 'users', 'aluDos'),
    { name: 'Otro nombre',
      activityConsents: { steps: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
      consentSeq: 5, consentReceiptId: 'aluDos_5' }, { merge: true });
  b.set(doc(db, 'consent_receipts', 'aluDos_5'),
    { uid: 'aluDos', email: 'aluDos@test.local', type: 'activity-steps-granted', version: V, at: serverTimestamp() });
  return b.commit();
})(), false);
// G6 — seq +2: denegado.
await T('G6 otorgar con consentSeq +2 = denegado',
  consentAct(dbOf('aluDos'), 'aluDos',
    { steps: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
    6, 'activity-steps-granted', V),
  false);
// G7 — acceptedAt con fecha literal (no hora del servidor): denegado.
await T('G7 otorgar con acceptedAt literal = denegado',
  consentAct(dbOf('aluDos'), 'aluDos',
    { steps: { status: 'accepted', version: V, acceptedAt: OLD_A } },
    5, 'activity-steps-granted', V),
  false);
// G8 — renovar pasos desde retirado, conservando withdrawnAt.
{
  const cur = await readUser('aluRen');
  const wAt = cur.activityConsents.steps.withdrawnAt;
  await T('G8 renovar pasos (retirado → aceptado) con recibo activity-steps-renewed',
    consentAct(dbOf('aluRen'), 'aluRen',
      { steps: { status: 'accepted', version: V, acceptedAt: serverTimestamp(), withdrawnAt: wAt } },
      7, 'activity-steps-renewed', V),
    ESPERA_NUEVO);
}
// G9 — retirar el sueño aceptado, conservando acceptedAt.
{
  const cur = await readUser('aluRet');
  const aAt = cur.activityConsents.sleep.acceptedAt;
  await T('G9 retirar sueño con recibo activity-sleep-withdrawn',
    consentAct(dbOf('aluRet'), 'aluRet',
      { sleep: { status: 'withdrawn', version: V, acceptedAt: aAt, withdrawnAt: serverTimestamp() } },
      5, 'activity-sleep-withdrawn', V),
    ESPERA_NUEVO);
}
// G10 — retirar un tipo no aceptado: denegado.
await T('G10 retirar pasos sin estar aceptado = denegado',
  consentAct(dbOf('aluBase'), 'aluBase',
    { steps: { status: 'withdrawn', version: V, withdrawnAt: serverTimestamp() } },
    4, 'activity-steps-withdrawn', V),
  false);
// G11 — otro usuario otorga por el alumno: denegado.
await T('G11 el entrenador otorga por el alumno = denegado',
  consentAct(dbOf('entrenadorT'), 'aluBase',
    { steps: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
    4, 'activity-steps-granted', V),
  false);
// G12 — el propietario escribe activityConsents de un alumno:
// la candidata lo cierra (el estado es solo del alumno); en el
// texto vivo la rama del propietario aún NO excluía el campo.
await T('G12 el propietario escribe activityConsents ajeno',
  updateDoc(doc(dbOf('dueno'), 'users', 'aluBase'),
    { activityConsents: { steps: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } } }),
  !ESPERA_NUEVO);
// G13 — vecino intacto: el otorgamiento de tipo corporal con su
// recibo sigue funcionando igual en ambos textos.
{
  const db = dbOf('aluBt'); const b = writeBatch(db);
  b.set(doc(db, 'users', 'aluBt'),
    { bodyTypeConsent: { status: 'accepted', version: BT_V, acceptedAt: serverTimestamp() },
      consentSeq: 3, consentReceiptId: 'aluBt_3' }, { merge: true });
  b.set(doc(db, 'consent_receipts', 'aluBt_3'),
    { uid: 'aluBt', email: 'aluBt@test.local', type: 'bodytype-granted', version: BT_V, at: serverTimestamp() });
  await T('G13 vecino: otorgar tipo corporal con su recibo (ambos textos)', b.commit(), true);
}
// G19 — vecino intacto: el otorgamiento del consentimiento
// específico de salud con su recibo (la ruta de receiptVersion
// que el delta roza: su rama cae DESPUÉS de la de actividad).
await seedUser('aluHealth', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', consentSeq: 2, consentReceiptId: 'aluHealth_2' });
{
  const db = dbOf('aluHealth'); const b = writeBatch(db);
  b.set(doc(db, 'users', 'aluHealth'),
    { healthConsent: { status: 'accepted', version: 'hv-test-1', acceptedAt: serverTimestamp() },
      consentSeq: 3, consentReceiptId: 'aluHealth_3' }, { merge: true });
  b.set(doc(db, 'consent_receipts', 'aluHealth_3'),
    { uid: 'aluHealth', email: 'aluHealth@test.local', type: 'specific-granted', version: 'hv-test-1', at: serverTimestamp() });
  await T('G19 vecino: otorgar consentimiento de salud con su recibo (ambos textos)', b.commit(), true);
}
// G14 — segundo tipo con el primero intacto (mapa completo).
{
  const cur = await readUser('aluSleep');
  const sleepSub = cur.activityConsents.sleep;
  await T('G14 otorgar peso conservando el sueño ya aceptado',
    consentAct(dbOf('aluSleep'), 'aluSleep',
      { sleep: sleepSub, weight: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
      5, 'activity-weight-granted', V),
    ESPERA_NUEVO);
}
// G15 — segundo tipo PERDIENDO el primero en el mapa: denegado.
await T('G15 otorgar ejercicio perdiendo el sueño del mapa = denegado',
  consentAct(dbOf('aluSleep'), 'aluSleep',
    { exercise: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
    5, 'activity-exercise-granted', V),
  false);
// G16 — el alumno lee su propio recibo (vecino, ambos textos).
await T('G16 el alumno lee su recibo de actividad',
  getDoc(doc(dbOf('aluGrant'), 'consent_receipts', 'aluGrant_4')),
  ESPERA_NUEVO);

// G17 (aislamiento) — SOLO la creación del recibo, con el
// documento de la alumna ya en el estado posterior al acto
// (sembrado sin reglas): en esta casa un recibo suelto, sin la
// transición de su lote, NO se puede crear en NINGÚN texto —
// la derivación exige el cambio en el mismo lote. Denegado
// en ambos: es la prueba de que el recibo no se puede forjar.
await seedUser('aluIso', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned',
  consentSeq: 4, consentReceiptId: 'aluIso_4',
  activityConsents: { sleep: { status: 'accepted', version: V, acceptedAt: OLD_A } } });
await T('G17 un recibo suelto de actividad, sin su lote, no se puede crear',
  setDoc(doc(dbOf('aluIso'), 'consent_receipts', 'aluIso_4'),
    { uid: 'aluIso', email: 'aluIso@test.local', type: 'activity-sleep-granted', version: V, at: serverTimestamp() }),
  false);
// G18 (aislamiento) — SOLO la escritura en users, sin recibo:
// denegada en ambos textos por el acoplamiento; el MOTIVO del
// error impreso distingue «recibo ausente» de «desbordamiento».
await seedUser('aluIso2', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned' });
await T('G18 aislamiento: escribir solo users sin recibo (denegado)',
  setDoc(doc(dbOf('aluIso2'), 'users', 'aluIso2'),
    { activityConsents: { sleep: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
      consentSeq: 4, consentReceiptId: 'aluIso2_4' }, { merge: true }),
  false);

/* ════════ activity_data (el hogar del sueño) ════════ */
const sleepDoc = (uid, fecha, over) => Object.assign({
  clientUid: uid, date: fecha, dataType: 'sleep', value: 450,
  unit: 'min', source: 'manual', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
}, over || {});
// S1 — el alumno crea su sueño sin consentimiento de por medio
// (decisión 5: registrar lo suyo nunca depende de compartir).
await T('S1 el alumno crea su sueño (sin compartir nada)',
  setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-02_sleep'),
    sleepDoc('aluBase', '2026-11-02')),
  ESPERA_NUEVO);
// S2 — tipo distinto de sueño: denegado (frecuencia = otro paquete).
await T('S2 crear con dataType heart_rate = denegado',
  setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-02_heart_rate'),
    sleepDoc('aluBase', '2026-11-02', { dataType: 'heart_rate' })),
  false);
// S3 — fuente distinta de manual: denegada.
await T('S3 crear con source health_connect = denegado',
  setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-03_sleep'),
    sleepDoc('aluBase', '2026-11-03', { source: 'health_connect' })),
  false);
// S4/S5 — valor fuera de rango: denegado.
await T('S4 crear con value 2000 = denegado',
  setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-04_sleep'),
    sleepDoc('aluBase', '2026-11-04', { value: 2000 })),
  false);
await T('S5 crear con value 0 = denegado',
  setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-04_sleep'),
    sleepDoc('aluBase', '2026-11-04', { value: 0 })),
  false);
// S6 — documento para otro alumno: denegado.
await T('S6 crear sueño para otro uid = denegado',
  setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluSleep_2026-11-05_sleep'),
    sleepDoc('aluSleep', '2026-11-05')),
  false);
// S7 — docId que no casa con el contenido: denegado.
await T('S7 docId distinto de la fecha del contenido = denegado',
  setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-06_sleep'),
    sleepDoc('aluBase', '2026-11-02')),
  false);
// S8 — el alumno edita su sueño (createdAt conservado).
{
  let creado = null;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), 'activity_data', 'aluBase_2026-11-02_sleep'));
    creado = s.exists() ? s.data().createdAt : null;
  });
  const upd = sleepDoc('aluBase', '2026-11-02', { value: 480 });
  if (creado) upd.createdAt = creado;
  await T('S8 el alumno edita su sueño',
    setDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-02_sleep'), upd),
    ESPERA_NUEVO);
}
// S9 — el alumno borra su sueño.
await T('S9 el alumno borra su sueño',
  deleteDoc(doc(dbOf('aluBase'), 'activity_data', 'aluBase_2026-11-02_sleep')),
  ESPERA_NUEVO);
// S10 — entrenador asignado SIN consentimiento: no lee.
await T('S10 entrenador asignado sin consentimiento no lee el sueño',
  getDoc(doc(dbOf('entrenadorT'), 'activity_data', 'aluDos_2026-11-02_sleep')),
  false);
// S11 — entrenador asignado CON consentimiento aceptado: lee.
await T('S11 entrenador asignado con consentimiento lee el sueño',
  getDoc(doc(dbOf('entrenadorT'), 'activity_data', 'aluSleep_2026-11-02_sleep')),
  ESPERA_NUEVO);
// S12 — entrenador NO asignado con consentimiento ajeno: no lee.
await T('S12 entrenador no asignado no lee el sueño',
  getDoc(doc(dbOf('entrenadorU'), 'activity_data', 'aluSleep_2026-11-02_sleep')),
  false);
// S13 — el propietario (no es el entrenador asignado) no lee:
// la colección no tiene lectura general del propietario.
await T('S13 el propietario sin asignar no lee el sueño',
  getDoc(doc(dbOf('dueno'), 'activity_data', 'aluSleep_2026-11-02_sleep')),
  false);
// S14 — el entrenador no escribe el sueño del alumno.
await T('S14 el entrenador crea el sueño del alumno = denegado',
  setDoc(doc(dbOf('entrenadorT'), 'activity_data', 'aluSleep_2026-11-07_sleep'),
    sleepDoc('aluSleep', '2026-11-07')),
  false);
// S15 — tras RETIRAR (G9), la vista del entrenador se cierra.
await T('S15 tras retirar, el entrenador ya no lee el sueño',
  getDoc(doc(dbOf('entrenadorT'), 'activity_data', 'aluRet_2026-11-02_sleep')),
  false);
// S16 — el alumno lista lo suyo.
await T('S16 el alumno lista sus sueños',
  getDocs(query(collection(dbOf('aluSleep'), 'activity_data'), where('clientUid', '==', 'aluSleep'))),
  ESPERA_NUEVO);
// S17 — sin sesión: nada.
await T('S17 sin sesión no se lee el sueño',
  getDoc(doc(dbOf(null), 'activity_data', 'aluSleep_2026-11-02_sleep')),
  false);
// S18 — el entrenador lista con consentimiento (la consulta del
// panel: un tipo cada vez — clientUid + dataType).
await T('S18 el entrenador lista los sueños con consentimiento',
  getDocs(query(collection(dbOf('entrenadorT'), 'activity_data'),
    where('clientUid', '==', 'aluSleep'), where('dataType', '==', 'sleep'))),
  ESPERA_NUEVO);
// S19 — la misma lista SIN acotar el tipo: la compuerta no puede
// probar el tipo y se cierra (denegado en ambos textos).
await T('S19 el entrenador lista sin acotar el tipo = denegado',
  getDocs(query(collection(dbOf('entrenadorT'), 'activity_data'), where('clientUid', '==', 'aluSleep'))),
  false);

console.log(`\n${NOMBRE}: ${pass} PASS · ${fail} FAIL`);
if (failures.length) console.log('FALLOS: ' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
