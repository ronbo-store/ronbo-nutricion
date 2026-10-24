// RONBO NUTRI — Batería de reglas del módulo de somatotipo (Nivel 2), 2026-10-23.
// Valida el candidato firestore.rules.candidato-somatotipo-2026-10-23.rules
// (copia byte-idéntica en ./firestore.rules, SHA-256 8acc2485…):
// colección segregada e inmutable body_type_estimates, consentimiento
// específico bodyTypeConsent con recibos acoplados, y verificación
// del consentimiento DENTRO de la regla en cada uso (patrón S-1) —
// incluido EL caso obligatorio: consentimiento revocado ENTRE el
// análisis y la lectura (BT-31…BT-34).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
// Control esperado: contra el texto vivo e5efaef2 (sin el delta),
// toda operación del módulo cae en el catch-all (deny) y los casos
// «permite» de esta batería FALLAN — la batería detecta la ausencia
// del delta; los casos de revocación pasan trivialmente porque ya
// todo está denegado.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, serverTimestamp, writeBatch
} from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1', port: 8080
  }
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

const BT_VERSION = 'draft-2026-10-23';
const estDoc = (clientUid, shared, extra = {}) => ({
  kind: 'bodyTypeEstimate', clientUid, category: 'mesomorph',
  mix: { ectomorph: 20, mesomorph: 60, endomorph: 20 },
  providerId: 'fixture', sourceDate: '2026-10-20',
  sourceDocIds: [`${clientUid}_2026-10-20_front`, `${clientUid}_2026-10-20_side`, `${clientUid}_2026-10-20_back`],
  shared, requestedBy: 'trainer1', consentVersion: BT_VERSION,
  createdAt: serverTimestamp(), ...extra
});

// ---- Semilla (sin reglas) ----
// owner1: propietario (isOwner). trainer1/trainer2: rol entrenador;
// trainer1 es el asignado de clientA/clientB/clientC.
// clientA: consentimiento bodyType ACTIVO (seq 5) + 2 estimaciones
//   (estA compartida, estA2 no compartida).
// clientB: SIN bodyTypeConsent (seq 1) — para los casos de otorgar.
// clientC: consentimiento ACTIVO, asignado a trainer1 (lecturas cruzadas).
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true, role: 'user', termsVersion: 'v3-2026-10-16' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Propietario Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Asignado', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Ajeno', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', trainerUid: 'trainer1', consentSeq: 5, consentReceiptId: 'clientA_5',
    bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() } });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', trainerUid: 'trainer1', consentSeq: 1, consentReceiptId: 'clientB_1' });
  await setDoc(doc(db, 'users', 'clientC'), { ...base, name: 'Cliente C', trainerUid: 'trainer1', consentSeq: 3, consentReceiptId: 'clientC_3',
    bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() } });
  await setDoc(doc(db, 'body_type_estimates', 'estA'), estDoc('clientA', true));
  await setDoc(doc(db, 'body_type_estimates', 'estA2'), estDoc('clientA', false));
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const tr2 = testEnv.authenticatedContext('trainer2').firestore();
const cA = testEnv.authenticatedContext('clientA').firestore();
const cB = testEnv.authenticatedContext('clientB').firestore();
const cC = testEnv.authenticatedContext('clientC').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const E = (db, id) => doc(db, 'body_type_estimates', id);
const createEst = (db, id, clientUid, extra = {}) => setDoc(E(db, id), estDoc(clientUid, false, extra));

// ============ Consentimiento bodyTypeConsent: otorgar con recibo acoplado ============
await T('BT-01 otorgar SIN recibo acoplado → DENEGADO',
  updateDoc(doc(cB, 'users', 'clientB'), { bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() }, consentSeq: 2, consentReceiptId: 'clientB_2' }), false);
{
  const b = writeBatch(cB);
  b.set(doc(cB, 'users', 'clientB'), { bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() }, consentSeq: 2, consentReceiptId: 'clientB_2' }, { merge: true });
  b.set(doc(cB, 'consent_receipts', 'clientB_2'), { uid: 'clientB', email: 'b@test.local', type: 'specific-granted', version: BT_VERSION, at: serverTimestamp() });
  await T('BT-02 otorgar con recibo de tipo EQUIVOCADO (specific-granted) → DENEGADO', b.commit(), false);
}
{
  const b = writeBatch(cB);
  b.set(doc(cB, 'users', 'clientB'), { bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() }, consentSeq: 2, consentReceiptId: 'clientB_2' }, { merge: true });
  b.set(doc(cB, 'consent_receipts', 'clientB_2'), { uid: 'clientB', email: 'b@test.local', type: 'bodytype-granted', version: BT_VERSION, at: serverTimestamp() });
  await T('BT-03 otorgar con recibo bodytype-granted correcto → PERMITIDO', b.commit(), true);
}
await T('BT-04 re-otorgar estando ya ACEPTADO → DENEGADO',
  updateDoc(doc(cB, 'users', 'clientB'), { bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() }, consentSeq: 3, consentReceiptId: 'clientB_3' }), false);
await T('BT-05 el PROPIETARIO no puede fijar el bodyTypeConsent ajeno → DENEGADO',
  updateDoc(doc(owner, 'users', 'clientB'), { bodyTypeConsent: { status: 'withdrawn', version: BT_VERSION, withdrawnAt: serverTimestamp() } }), false);
await T('BT-06 el ENTRENADOR no puede fijar el bodyTypeConsent ajeno → DENEGADO',
  updateDoc(doc(tr1, 'users', 'clientB'), { bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() } }), false);

// ============ Creación de estimaciones ============
await T('BT-07 entrenador ASIGNADO crea con consentimiento activo → PERMITIDO', createEst(tr1, 'estNew1', 'clientA'), true);
await T('BT-08 PROPIETARIO crea con consentimiento activo → PERMITIDO', createEst(owner, 'estNew2', 'clientA', { requestedBy: 'owner1' }), true);
await T('BT-09 entrenador NO asignado crea → DENEGADO', createEst(tr2, 'estNew3', 'clientA', { requestedBy: 'trainer2' }), false);
await T('BT-10 el propio CLIENTE crea su estimación → DENEGADO', createEst(cA, 'estNew4', 'clientA', { requestedBy: 'clientA' }), false);
await T('BT-11 SIN SESIÓN crea → DENEGADO', createEst(anon, 'estNew5', 'clientA'), false);
await T('BT-12 crear ya COMPARTIDA (shared=true al nacer) → DENEGADO', createEst(tr1, 'estNew6', 'clientA', { shared: true }), false);
await T('BT-13 crear con categoría inválida → DENEGADO', createEst(tr1, 'estNew7', 'clientA', { category: 'obeso' }), false);
await T('BT-14 crear con campo EXTRA → DENEGADO', createEst(tr1, 'estNew8', 'clientA', { nota: 'x' }), false);
await T('BT-15 crear con requestedBy de otro → DENEGADO', createEst(tr1, 'estNew9', 'clientA', { requestedBy: 'trainer2' }), false);
await T('BT-16 entrenador asignado crea para clientC (consentimiento activo) → PERMITIDO', createEst(tr1, 'estNew10', 'clientC'), true);

// ============ Lecturas con consentimiento activo ============
await T('BT-17 entrenador asignado GET de estimación NO compartida → PERMITIDO', getDoc(E(tr1, 'estA2')), true);
await T('BT-18 propietario GET de estimación NO compartida → PERMITIDO', getDoc(E(owner, 'estA2')), true);
await T('BT-19 entrenador NO asignado GET → DENEGADO', getDoc(E(tr2, 'estA')), false);
await T('BT-20 cliente GET de su estimación COMPARTIDA → PERMITIDO', getDoc(E(cA, 'estA')), true);
await T('BT-21 cliente GET de su estimación NO compartida → DENEGADO', getDoc(E(cA, 'estA2')), false);
await T('BT-22 cliente LIST filtrado (clientUid propio + shared=true) → PERMITIDO',
  getDocs(query(collection(cA, 'body_type_estimates'), where('clientUid', '==', 'clientA'), where('shared', '==', true))), true);
await T('BT-23 cliente LIST sin filtro shared → DENEGADO',
  getDocs(query(collection(cA, 'body_type_estimates'), where('clientUid', '==', 'clientA'))), false);
await T('BT-24 otro cliente GET de estimación ajena compartida → DENEGADO', getDoc(E(cC, 'estA')), false);
await T('BT-25 SIN SESIÓN GET → DENEGADO', getDoc(E(anon, 'estA')), false);

// ============ Actualización (solo compartir) y borrado ============
await T('BT-26 entrenador asignado COMPARTIR (solo shared/sharedAt/sharedBy) → PERMITIDO',
  updateDoc(E(tr1, 'estA2'), { shared: true, sharedAt: serverTimestamp(), sharedBy: 'trainer1' }), true);
await T('BT-27 entrenador intenta EDITAR la categoría (inmutable) → DENEGADO',
  updateDoc(E(tr1, 'estA'), { category: 'ectomorph' }), false);
await T('BT-28 el cliente intenta cambiar shared → DENEGADO',
  updateDoc(E(cA, 'estA'), { shared: false, sharedAt: serverTimestamp(), sharedBy: 'clientA' }), false);
await T('BT-29 ni el propietario puede BORRAR una estimación → DENEGADO', deleteDoc(E(owner, 'estA')), false);

// ============ ★ CASO OBLIGATORIO: revocación ENTRE el análisis y la lectura ============
{
  const snap = await getDoc(doc(cA, 'users', 'clientA'));
  const accAt = snap.data().bodyTypeConsent.acceptedAt;
  const b = writeBatch(cA);
  b.set(doc(cA, 'users', 'clientA'), { bodyTypeConsent: { status: 'withdrawn', version: BT_VERSION, acceptedAt: accAt, withdrawnAt: serverTimestamp() }, consentSeq: 6, consentReceiptId: 'clientA_6' }, { merge: true });
  b.set(doc(cA, 'consent_receipts', 'clientA_6'), { uid: 'clientA', email: 'a@test.local', type: 'bodytype-withdrawn', version: BT_VERSION, at: serverTimestamp() });
  await T('BT-30 el cliente REVOCA su consentimiento (recibo bodytype-withdrawn) → PERMITIDO', b.commit(), true);
}
await T('BT-31 ★ tras revocar: el entrenador ya NO lee la estimación generada → DENEGADO', getDoc(E(tr1, 'estA')), false);
await T('BT-32 ★ tras revocar: el cliente ya NO lee su estimación compartida → DENEGADO', getDoc(E(cA, 'estA')), false);
await T('BT-33 ★ tras revocar: crear un análisis nuevo → DENEGADO', createEst(tr1, 'estNew11', 'clientA'), false);
await T('BT-34 ★ tras revocar: compartir/dejar de compartir → DENEGADO',
  updateDoc(E(tr1, 'estA'), { shared: false, sharedAt: serverTimestamp(), sharedBy: 'trainer1' }), false);
{
  const snap = await getDoc(doc(cA, 'users', 'clientA'));
  const wdAt = snap.data().bodyTypeConsent.withdrawnAt;
  const b = writeBatch(cA);
  b.set(doc(cA, 'users', 'clientA'), { bodyTypeConsent: { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp(), withdrawnAt: wdAt }, consentSeq: 7, consentReceiptId: 'clientA_7' }, { merge: true });
  b.set(doc(cA, 'consent_receipts', 'clientA_7'), { uid: 'clientA', email: 'a@test.local', type: 'bodytype-renewed', version: BT_VERSION, at: serverTimestamp() });
  await T('BT-35 RENOVAR tras retirar (recibo bodytype-renewed, retirada preservada) → PERMITIDO', b.commit(), true);
}
await T('BT-36 renovado el consentimiento, el entrenador vuelve a leer (el documento NO se borró) → PERMITIDO', getDoc(E(tr1, 'estA')), true);

console.log(`RESULTADO SOMATOTIPO: ${pass}/${pass + fail} PASS` + (failures.length ? ' · FAIL: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
