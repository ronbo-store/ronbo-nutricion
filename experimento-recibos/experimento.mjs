// ============================================================
// EXPERIMENTO AISLADO C2 — integridad bidireccional de recibos
// Proyecto ficticio demo-recibos-c2 · datos ficticios · TODOS
// los casos cuentan: cualquier FAIL => exit 1.
// Pregunta: ¿pueden las reglas nativas exigir que TODA
// transición de consentimiento lleve su recibo en el mismo
// lote (y viceversa), sin Cloud Functions?
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-recibos-c2', firestore: { rules, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
const db = uid => env.authenticatedContext(uid).firestore();
const V = 'v1-2026-10-16';
const rec = (uid, type, extra) => ({ uid, email: uid + '@pruebas.ronbo.store', type, version: V, at: serverTimestamp(), ...(extra || {}) });

// Fixture: propietario (sin reglas)
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'users', 'dueno'), { isOwner: true, name: 'Dueño', acceptedTerms: true, consentSeq: 1, consentReceiptId: 'dueno_1' });
});

function regBatch(uid, withReceipt = true, receiptAlone = false) {
  const d = db(uid); const b = writeBatch(d);
  if (!receiptAlone) b.set(doc(d, 'users', uid), { name: uid, acceptedTerms: true, termsVersion: V, consentSeq: 1, consentReceiptId: uid + '_1' });
  if (withReceipt || receiptAlone) b.set(doc(d, 'consent_receipts', uid + '_1'), rec(uid, 'registered'));
  return b.commit();
}
function transBatch(uid, seq, cambios, type, extra) {
  const d = db(uid); const b = writeBatch(d);
  b.update(doc(d, 'users', uid), { ...cambios, consentSeq: seq, consentReceiptId: uid + '_' + seq });
  if (type !== null) b.set(doc(d, 'consent_receipts', uid + '_' + seq), rec(uid, type, extra));
  return b.commit();
}
const grant = (uid, seq, type = 'specific-granted', extra) => transBatch(uid, seq, { healthConsent: { status: 'accepted', version: V } }, type, extra);
const dropS = (uid, seq, type = 'specific-withdrawn', extra) => transBatch(uid, seq, { healthConsent: { status: 'withdrawn', version: V } }, type, extra);

// ---------- Luis: ciclo completo acoplado ----------
await T('L1 registro CON recibo en el mismo lote → permitido', regBatch('luis'), true);
await T('L2 otorgamiento específico CON recibo → permitido', grant('luis', 2), true);
await T('L3 actualización sin consentimiento (nombre) SIN recibo → permitida (control)', updateDoc(doc(db('luis'), 'users', 'luis'), { name: 'Luis G.' }), true);
await T('L4 retirada específica CON recibo → permitida', dropS('luis', 3), true);

// ---------- Marta: las dos direcciones de la exigencia ----------
await T('M1 registro SIN recibo → DENEGADO (dirección inversa)', regBatch('marta', false), false);
await T('M2 recibo de registro SIN crear el usuario → DENEGADO', regBatch('marta', true, true), false);
await T('M3 registro CON recibo → permitido', regBatch('marta'), true);
await T('M4 otorgamiento específico SIN recibo → DENEGADO (dirección inversa)', transBatch('marta', 2, { healthConsent: { status: 'accepted', version: V } }, null), false);
await T('M5 otorgamiento con recibo de TIPO INCORRECTO → DENEGADO', grant('marta', 2, 'specific-withdrawn'), false);
await T('M6 otorgamiento específico CON recibo correcto → permitido', grant('marta', 2), true);
await T('M7 DUPLICAR el otorgamiento con otro recibo → DENEGADO', grant('marta', 3), false);
await T('M8 retirada con recibo con CAMPO EXTRA (conditions) → DENEGADO', dropS('marta', 3, 'specific-withdrawn', { conditions: [] }), false);
await T('M9 recibo dirigido a OTRO uid → DENEGADO', (() => { const d = db('marta'); const b = writeBatch(d); b.update(doc(d, 'users', 'marta'), { healthConsent: { status: 'withdrawn', version: V }, consentSeq: 3, consentReceiptId: 'marta_3' }); b.set(doc(d, 'consent_receipts', 'luis_99'), rec('luis', 'specific-withdrawn')); return b.commit(); })(), false);
await T('M10 retirada específica CON recibo → permitida', dropS('marta', 3), true);
await T('M11 retirada del GENERAL con recibo → permitida', transBatch('marta', 4, { acceptedTerms: false }, 'general-withdrawn'), true);
await T('M12 renovación del GENERAL con recibo → permitida', transBatch('marta', 5, { acceptedTerms: true }, 'general-renewed'), true);
await T('M13 leer el recibo de OTRO cliente → DENEGADO', getDoc(doc(db('marta'), 'consent_receipts', 'luis_2')), false);

// ---------- Luis: borrado de cuenta acoplado y supervivencia ----------
await T('L5 borrar la cuenta SIN documento de cierre → DENEGADO', deleteDoc(doc(db('luis'), 'users', 'luis')), false);
await T('L6 borrar la cuenta CON cierre en el mismo lote → permitido', (() => { const d = db('luis'); const b = writeBatch(d); b.set(doc(d, 'consent_receipts', 'luis'), rec('luis', 'account-closed')); b.delete(doc(d, 'users', 'luis')); return b.commit(); })(), true);
await T('L7 tras el borrado, el propietario SIGUE leyendo los recibos → permitido', getDoc(doc(db('dueno'), 'consent_receipts', 'luis_2')), true);

// ---------- Inmutabilidad y purga ----------
await T('M14 ACTUALIZAR un recibo propio → DENEGADO', updateDoc(doc(db('marta'), 'consent_receipts', 'marta_2'), { type: 'general-renewed' }), false);
await T('M15 BORRAR un recibo propio → DENEGADO', deleteDoc(doc(db('marta'), 'consent_receipts', 'marta_2')), false);
await T('M16 el propietario BORRA un recibo (purga) → permitido', deleteDoc(doc(db('dueno'), 'consent_receipts', 'marta_2')), true);

console.log('RESULTADO EXPERIMENTO C2: ' + pass + ' PASS · ' + fail + ' FAIL · ' + (pass + fail) + ' casos');
if (fail) { console.log('CASOS FALLIDOS: ' + fails.join(' | ')); process.exit(1); }
await env.cleanup();
