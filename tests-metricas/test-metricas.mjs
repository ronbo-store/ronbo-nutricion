// RONBO FIT — Batería CI del delta de reglas «Recordarle sus
// métricas» (punto 129 de la cola). Usuarios FICTICIOS, emulador
// oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 7ac4667a-f9d3-4b7f-ae47-4e521f986c80): la rama del entrenador
// asignado de AUTH-133 en users/{uid} admite UNA subclave más en
// notices.nudge — «met», el sello del recordatorio de métricas —
// en sus dos sitios (la lista hasOnly y su nudgeSubOk133, con la
// forma exacta {at == request.time, by == quien pide}).
//
// La suite corre en DOS modos con la misma lista de casos:
//   ESPERA_NUEVO=true  → reglas = CANDIDATA (la subclave vive)
//   ESPERA_NUEVO=false → reglas = texto VIVO (la subclave no
//                        existe: lo suyo deniega; los vecinos —
//                        las 8 subclaves hermanas, el propietario,
//                        las denegaciones de siempre — idénticos)
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { appendFileSync } from 'node:fs';

process.on('unhandledRejection', (e) => {
  const msg = String(e && e.message || e).slice(0, 300).replace(/[\r\n]+/g, ' ');
  try { appendFileSync('fallos.txt', 'ARRANQUE :: ' + msg + '\n'); } catch {}
  console.log('::error title=ARRANQUE::' + msg);
});

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const NOMBRE = ESPERA_NUEVO ? 'METRICAS-CANDIDATA' : 'METRICAS-VIVO';
const N = ESPERA_NUEVO; // expectativa de los casos del delta

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8080) }
});

let pass = 0, fail = 0; const failures = [];
async function T(name, promise, shouldSucceed) {
  try {
    if (shouldSucceed) await assertSucceeds(promise); else await assertFails(promise);
    pass++; console.log('PASS  ' + name);
  } catch (e) {
    fail++; failures.push(name);
    const msg = String(e && e.message || e).slice(0, 200).replace(/[\r\n]+/g, ' ');
    try { appendFileSync('fallos.txt', NOMBRE + ' :: ' + name + ' :: ' + msg + '\n'); } catch {}
    console.log('FAIL  ' + name + ' :: ' + msg);
  }
}

const OWNER = 'ownerT', TRAINER = 'trainerT', OTHER = 'otherT';
const STU = 'stuMet', STU_OTRA = 'stuOtra', STU_SIN = 'stuSinAp';

/* Semilla (sin reglas): los papeles y las alumnas. */
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, termsVersion: 'v4-2026-10-24', consentSeq: 2, createdAt: Timestamp.fromDate(new Date('2026-10-20T12:00:00Z')) };
  await setDoc(doc(db, 'users', OWNER), { ...base, name: 'Dueno', email: 'o@t.local', role: 'administrador', isOwner: true, approved: false });
  await setDoc(doc(db, 'users', TRAINER), { ...base, name: 'Entrenador', email: 't@t.local', role: 'entrenador', approved: true });
  await setDoc(doc(db, 'users', OTHER), { ...base, name: 'Otro', email: 'x@t.local', role: 'entrenador', approved: true });
  const stu = (extra = {}) => ({ ...base, name: 'Alumna', email: 'a@t.local', role: 'usuario', approved: true, assignmentStatus: 'assigned', trainerUid: TRAINER, ...extra });
  await setDoc(doc(db, 'users', STU), stu({ notices: { nudge: { eval: { at: Timestamp.fromDate(new Date('2026-11-01T12:00:00Z')), by: TRAINER } } } }));
  await setDoc(doc(db, 'users', STU_OTRA), stu({ trainerUid: OTHER }));
  await setDoc(doc(db, 'users', STU_SIN), stu({ approved: false, assignmentStatus: 'waiting', trainerUid: null }));
});

const asTrainer = testEnv.authenticatedContext(TRAINER).firestore();
const asOther = testEnv.authenticatedContext(OTHER).firestore();
const asOwner = testEnv.authenticatedContext(OWNER).firestore();
const asStu = testEnv.authenticatedContext(STU).firestore();
const stamp = (db, uid, sub, val) => updateDoc(doc(db, 'users', uid), { [`notices.nudge.${sub}`]: val });

/* 1 — EL CASO DEL PAQUETE: el entrenador asignado escribe su sello
   «met» con la forma exacta {at: hora del servidor, by: él}. */
await T('1 entrenador asignado escribe notices.nudge.met {at: request.time, by: él}',
  stamp(asTrainer, STU, 'met', { at: serverTimestamp(), by: TRAINER }), N);
/* 2 — La misma escritura, con by de OTRA persona: denegada siempre. */
await T('2 sello «met» con by ajeno → denegado',
  stamp(asTrainer, STU, 'met', { at: serverTimestamp(), by: OTHER }), false);
/* 3 — Con una llave de más: denegada siempre. */
await T('3 sello «met» con llave extra → denegado',
  stamp(asTrainer, STU, 'met', { at: serverTimestamp(), by: TRAINER, extra: 1 }), false);
/* 4 — Con una fecha fija que no es la hora de la petición. */
await T('4 sello «met» con at fijo (no request.time) → denegado',
  stamp(asTrainer, STU, 'met', { at: Timestamp.fromDate(new Date('2026-11-01T12:00:00Z')), by: TRAINER }), false);
/* 5 — Regresión: una subclave hermana («eval») sigue escribiéndose
   igual en las dos reglas. */
await T('5 regresión: el entrenador asignado sigue escribiendo notices.nudge.eval como siempre',
  stamp(asTrainer, STU, 'eval', { at: serverTimestamp(), by: TRAINER }), true);
/* 6 — El sello no puede viajar con otro campo tocado. */
await T('6 sello «met» + tocar name en la misma escritura → denegado',
  updateDoc(doc(asTrainer, 'users', STU), { 'notices.nudge.met': { at: serverTimestamp(), by: TRAINER }, name: 'Cambiado' }), false);
/* 7 — Alumna de OTRO entrenador: denegado siempre. */
await T('7 entrenador NO asignado escribe «met» → denegado',
  stamp(asTrainer, STU_OTRA, 'met', { at: serverTimestamp(), by: TRAINER }), false);
/* 8 — Alumna sin aprobar: denegado siempre. */
await T('8 «met» sobre una alumna sin aprobar → denegado',
  stamp(asOther, STU_SIN, 'met', { at: serverTimestamp(), by: OTHER }), false);
/* 9 — El propietario escribe el sello por su rama general, en las
   dos reglas (su camino no necesitaba delta). */
await T('9 el propietario escribe notices.nudge.met por su rama general',
  stamp(asOwner, STU, 'met', { at: serverTimestamp(), by: OWNER }), true);
/* 10 — La propia alumna NO puede escribirse el sello. */
await T('10 la alumna escribe su propio sello «met» → denegado',
  stamp(asStu, STU, 'met', { at: serverTimestamp(), by: STU }), false);
/* 11 — Tocar el sello de OTRA subclave (by ajeno) en la misma
    escritura que el propio: denegado siempre. */
await T('11 «met» propio + resellar «eval» con by ajeno → denegado',
  updateDoc(doc(asTrainer, 'users', STU), {
    'notices.nudge.met': { at: serverTimestamp(), by: TRAINER },
    'notices.nudge.eval': { at: serverTimestamp(), by: OTHER }
  }), false);
/* 12 — La escritura completa del mapa nudge con las 9 subclaves en
    forma: solo la candidata la admite (en el vivo, «met» sobra). */
{
  const full = {}; for (const s of ['eval', 'cns', 'parq', 'goal', 'meal', 'pes', 'per', 'bod', 'met']) full[s] = { at: serverTimestamp(), by: TRAINER };
  await T('12 el mapa nudge completo con las 9 subclaves en forma {at, by}',
    updateDoc(doc(asTrainer, 'users', STU), { notices: { nudge: full } }), N);
}

console.log(`\n${NOMBRE}: ${pass}/${pass + fail} PASS`);
try { appendFileSync('fallos.txt', `${NOMBRE}: ${pass}/${pass + fail}\n`); } catch {}
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
