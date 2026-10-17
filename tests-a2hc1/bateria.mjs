// ============================================================
// RONBO NUTRI — Compatibilidad app A2 (dev/recibos-r3 @ 0793c6d)
// contra las reglas ACTIVAS H-C1 (texto publicado 2026-10-16,
// relectura preservada en respaldo/). Pregunta de Ronald
// (16/10/2026 19:44 CDT, punto 2): ¿funciona A2 bajo H-C1 en la
// ventana D→E? Proyecto ficticio demo-a2hc1. Las escrituras
// reproducen la FORMA EXACTA de app.js A2 (lotes acoplados
// transición + recibo, consentSeq +1). Dos controles en la forma
// antigua (v1/H-C1) demuestran que el emulador y las reglas
// responden, y aislan la causa de cada resultado.
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.hc1-activas', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-a2hc1', firestore: { rules, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const VB = 'v2-2026-10-14', VS = 'v1-2026-10-16';
const recDoc = (uid, type, version) => ({ uid, email: uid + '@pruebas.ronbo.store', type, version, at: serverTimestamp() });

// ---------- Fixtures (sin reglas): usuarios en forma v1 (sin consentSeq) ----------
const seed = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: VB };
  await setDoc(doc(d, 'users', 'ana'), { ...base, name: 'Ana' });
  await setDoc(doc(d, 'users', 'berta'), { ...base, name: 'Berta', acceptedTerms: false, approved: false, consentWithdrawnAt: new Date('2026-10-10T10:00:00Z') });
  await setDoc(doc(d, 'users', 'carmen'), { ...base, name: 'Carmen' });
  await setDoc(doc(d, 'users', 'diana'), { ...base, name: 'Diana' });
  await setDoc(doc(d, 'nutrition_meals', 'm1'), { ownerUid: 'diana', name: 'Comida ficticia' });
});
await seed;

// ---------- Formas A2 (acopladas), tal como las escribe app.js @ 0793c6d ----------
function regCoupled(uid) {
  const d = db(uid); const b = writeBatch(d);
  b.set(doc(d, 'users', uid), { name: uid, email: uid + '@pruebas.ronbo.store', isOwner: false, approved: false, role: 'user', acceptedTerms: true, adultConfirmed: true, termsVersion: VB, termsAcceptedAt: serverTimestamp(), consentSeq: 1, consentReceiptId: uid + '_1' });
  b.set(doc(d, 'consent_receipts', uid + '_1'), recDoc(uid, 'registered', VB));
  return b.commit();
}
function batchUser(uid, cambios, seq, type, version) {
  const d = db(uid); const b = writeBatch(d);
  b.set(doc(d, 'users', uid), { ...cambios, consentSeq: seq, consentReceiptId: uid + '_' + seq }, { merge: true });
  b.set(doc(d, 'consent_receipts', uid + '_' + seq), recDoc(uid, type, version));
  return b.commit();
}

// 1 · Registro A2 acoplado (nace con recibo 'registered')
await T('A2 · registro acoplado con recibo → bajo H-C1', regCoupled('nueva'), false);
// 2 · Retirada general A2 acoplada
await T('A2 · retirada general acoplada → bajo H-C1', batchUser('ana', { consentWithdrawnAt: serverTimestamp(), acceptedTerms: false, approved: false }, 1, 'general-withdrawn', VB), false);
// 3 · Renovación general A2 acoplada (berta está retirada)
await T('A2 · renovación general acoplada → bajo H-C1', batchUser('berta', { acceptedTerms: true, termsVersion: VB, termsAcceptedAt: serverTimestamp() }, 1, 'general-renewed', VB), false);
// 4 · Otorgar consentimiento específico A2 acoplado
await T('A2 · otorgar específico acoplado → bajo H-C1', batchUser('carmen', { healthConsent: { status: 'accepted', version: VS, acceptedAt: serverTimestamp() } }, 1, 'specific-granted', VS), false);
// 5 · Cierre de cuenta A2: lote recibo 'account-closed' + borrado del doc de usuario
await T('A2 · lote de cierre (recibo + borrar users) → bajo H-C1', (() => { const d = db('diana'); const b = writeBatch(d); b.set(doc(d, 'consent_receipts', 'diana'), recDoc('diana', 'account-closed', VB)); b.delete(doc(d, 'users', 'diana')); return b.commit(); })(), false);
// 6 · Lectura del recibo de cierre por la propia usuaria (ruta onAuthStateChanged de A2)
await T('A2 · leer el recibo de cierre propio → bajo H-C1', getDoc(doc(db('diana'), 'consent_receipts', 'diana')), false);
// 7 · Paso PREVIO del cierre A2: borrar datos propios (comidas) — ocurre ANTES del lote de cierre
await T('A2 · borrado previo de datos propios (comida) → bajo H-C1', deleteDoc(doc(db('diana'), 'nutrition_meals', 'm1')), true);

// ---------- Controles en la forma antigua (v1, para la que H-C1 fue publicada) ----------
// 8 · Registro v1 sin recibo ni consentSeq
await T('CONTROL v1 · registro sin recibo → bajo H-C1', setDoc(doc(db('vieja'), 'users', 'vieja'), { name: 'Vieja', email: 'vieja@pruebas.ronbo.store', isOwner: false, approved: false, role: 'user', acceptedTerms: true, adultConfirmed: true, termsVersion: VB, termsAcceptedAt: serverTimestamp() }), true);
// 9 · Renovación general v1 sin recibo (forma H-C1 Fase 1, commit 5f27ede)
await T('CONTROL v1 · renovación general sin recibo → bajo H-C1', setDoc(doc(db('berta'), 'users', 'berta'), { acceptedTerms: true, termsVersion: VB, termsAcceptedAt: serverTimestamp() }, { merge: true }), true);
// 10 · Retirada general v1 sin recibo
await T('CONTROL v1 · retirada general sin recibo → bajo H-C1', setDoc(doc(db('carmen'), 'users', 'carmen'), { consentWithdrawnAt: serverTimestamp(), acceptedTerms: false, approved: false }, { merge: true }), true);

console.log(`\nRESULTADO: ${pass} PASS · ${fail} FAIL de ${pass + fail}`);
if (fails.length) console.log('FALLAN: ' + fails.join(' | '));
await env.cleanup();
process.exit(fail ? 1 : 0);
