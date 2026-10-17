// ============================================================
// RONBO NUTRI — Batería de ESCENARIOS DE CIERRE Y REVERSIÓN
// (comprobaciones finales pedidas por Ronald, 16/10/2026 20:51).
// Dos proyectos ficticios en el emulador oficial: demo-cierre-hc1
// (reglas H-C1 activas, SHA e874f453…) y demo-cierre-r3 (candidato
// r3, SHA a32a908c…). Cada caso es una SECUENCIA completa con
// sub-chequeos obligatorios y estado final verificado con reglas
// deshabilitadas; cualquier desviación => el caso FALLA y la
// batería sale con exit 1. 6 casos contados.
//   E1 orden v1 bajo H-C1 (control: el cierre de hoy es coherente)
//   E2 orden v1 bajo r3 (escenario 2: cierre parcial de la app vieja)
//   E3 orden A2 antiguo con flip r3→H-C1 (escenario 1: el agujero)
//   E4 orden NUEVO con flip (lote primero: no se pierde nada)
//   E5 orden NUEVO bajo r3 (cierre completo; borrados tras el lote)
//   E6 flip DESPUÉS del lote (r3→H-C1 a mitad del cierre nuevo)
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, getDocs, collection, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

const rulesHc1 = readFileSync(new URL('./firestore.rules.hc1', import.meta.url), 'utf8');
const rulesR3 = readFileSync(new URL('./firestore.rules.r3', import.meta.url), 'utf8');
const envH = await initializeTestEnvironment({ projectId: 'demo-cierre-hc1', firestore: { rules: rulesHc1, host: '127.0.0.1', port: 8799 } });
const envR = await initializeTestEnvironment({ projectId: 'demo-cierre-r3', firestore: { rules: rulesR3, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, fn) {
  try { await fn(); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e && e.message || e).split('\n')[0].slice(0, 160)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const dbH = uid => envH.authenticatedContext(uid).firestore();
const dbR = uid => envR.authenticatedContext(uid).firestore();

async function seed(env, u, { meal = true, weight = false, decl = false } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'users', u), { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v3-2026-10-16', consentSeq: 5, consentReceiptId: u + '_5', name: u });
    if (meal) await setDoc(doc(d, 'nutrition_meals', u + '-m1'), { ownerUid: u, date: '2026-10-16', meal: 'lunch', food: 'x', qty: '1' });
    if (weight) await setDoc(doc(d, 'nutrition_weight', u + '-w1'), { ownerUid: u, date: '2026-10-16', kg: 80 });
    if (decl) await setDoc(doc(d, 'users/' + u + '/healthDeclarations', 'v1'), { version: 1, conditions: [], details: '', state: 'active', declaredAt: new Date('2026-10-16T10:00:00Z'), updatedAt: new Date('2026-10-16T10:00:00Z'), blockedAt: null });
  });
}
async function exists(env, path) {
  let out = false;
  await env.withSecurityRulesDisabled(async (ctx) => { const s = await getDoc(doc(ctx.firestore(), path)); out = s.exists(); });
  return out;
}
function closeBatch(db, u) {
  const b = writeBatch(db);
  b.set(doc(db, 'consent_receipts', u), { uid: u, email: u + '@pruebas.ronbo.store', type: 'account-closed', version: 'v3-2026-10-16', at: serverTimestamp() });
  b.delete(doc(db, 'users', u));
  return b.commit();
}

// ---------- E1: orden v1 bajo H-C1 (control) ----------
await seed(envH, 'e1');
await T('E1 v1 bajo H-C1: borra comida y su documento; cierre coherente', async () => {
  await assertSucceeds(deleteDoc(doc(dbH('e1'), 'nutrition_meals', 'e1-m1')));
  await assertSucceeds(deleteDoc(doc(dbH('e1'), 'users', 'e1')));
  assert(!(await exists(envH, 'nutrition_meals/e1-m1')), 'la comida debía desaparecer');
  assert(!(await exists(envH, 'users/e1')), 'el documento debía desaparecer');
});

// ---------- E2: orden v1 bajo r3 (ESCENARIO 2) ----------
await seed(envR, 'e2', { decl: true });
await T('E2 v1 bajo r3: borra datos y declaración, el documento SOBREVIVE (cierre parcial)', async () => {
  await assertSucceeds(deleteDoc(doc(dbR('e2'), 'nutrition_meals', 'e2-m1')));
  await assertSucceeds(deleteDoc(doc(dbR('e2'), 'users/e2/healthDeclarations', 'v1')));
  await assertFails(deleteDoc(doc(dbR('e2'), 'users', 'e2')));
  assert(!(await exists(envR, 'nutrition_meals/e2-m1')), 'la comida debía desaparecer');
  assert(!(await exists(envR, 'users/e2/healthDeclarations/v1')), 'la declaración debía desaparecer');
  assert(await exists(envR, 'users/e2'), 'EL DOCUMENTO DEBÍA SOBREVIVIR: cierre parcial confirmado');
});

// ---------- E3: orden A2 antiguo con flip r3→H-C1 (ESCENARIO 1, el agujero) ----------
await seed(envR, 'e3'); await seed(envH, 'e3', { weight: true });
await T('E3 orden antiguo + flip: sonda OK en r3, datos borrados en H-C1, lote denegado (pérdida parcial)', async () => {
  await assertSucceeds(getDocs(query(collection(dbR('e3'), 'consent_receipts'), where('uid', '==', 'e3')))); // sonda previa en r3
  await assertSucceeds(deleteDoc(doc(dbH('e3'), 'nutrition_meals', 'e3-m1')));
  await assertSucceeds(deleteDoc(doc(dbH('e3'), 'nutrition_weight', 'e3-w1')));
  await assertFails(closeBatch(dbH('e3'), 'e3'));
  assert(!(await exists(envH, 'nutrition_meals/e3-m1')), 'la comida debía haberse borrado');
  assert(!(await exists(envH, 'nutrition_weight/e3-w1')), 'el peso debía haberse borrado');
  assert(await exists(envH, 'users/e3'), 'el documento sobrevive: la pérdida parcial queda probada');
});

// ---------- E4: orden NUEVO con flip (lote primero bajo H-C1) ----------
await seed(envH, 'e4', { decl: true });
await T('E4 orden nuevo + flip: el lote se deniega PRIMERO y no se pierde nada', async () => {
  await assertFails(closeBatch(dbH('e4'), 'e4'));
  assert(await exists(envH, 'nutrition_meals/e4-m1'), 'la comida debía seguir intacta');
  assert(await exists(envH, 'users/e4'), 'el documento debía seguir intacto');
  assert(!(await exists(envH, 'consent_receipts/e4')), 'no debía existir recibo de cierre');
});

// ---------- E5: orden NUEVO bajo r3 (cierre completo) ----------
await seed(envR, 'e5', { decl: true });
await T('E5 orden nuevo bajo r3: lote, borrados posteriores (incl. declaración sin documento padre) y recibo', async () => {
  await assertSucceeds(closeBatch(dbR('e5'), 'e5'));
  assert(!(await exists(envR, 'users/e5')), 'el documento debía desaparecer con el lote');
  assert(await exists(envR, 'consent_receipts/e5'), 'el recibo de cierre debía existir');
  await assertSucceeds(deleteDoc(doc(dbR('e5'), 'nutrition_meals', 'e5-m1')));
  await assertSucceeds(deleteDoc(doc(dbR('e5'), 'users/e5/healthDeclarations', 'v1')));
  assert(!(await exists(envR, 'nutrition_meals/e5-m1')), 'la comida debía desaparecer');
  assert(!(await exists(envR, 'users/e5/healthDeclarations/v1')), 'la declaración debía desaparecer');
});

// ---------- E6: flip DESPUÉS del lote (r3 → H-C1 a mitad del cierre nuevo) ----------
await seed(envR, 'e6', { decl: true }); await seed(envH, 'e6', { decl: true });
await T('E6 flip tras el lote: datos ordinarios se borran en H-C1; la declaración queda congelada para consola', async () => {
  await assertSucceeds(closeBatch(dbR('e6'), 'e6'));
  await assertSucceeds(deleteDoc(doc(dbH('e6'), 'nutrition_meals', 'e6-m1')));
  await assertFails(deleteDoc(doc(dbH('e6'), 'users/e6/healthDeclarations', 'v1')));
  assert(!(await exists(envH, 'nutrition_meals/e6-m1')), 'la comida debía desaparecer');
  assert(await exists(envH, 'users/e6/healthDeclarations/v1'), 'la declaración queda congelada bajo H-C1 (borrado por consola, procedimiento C1)');
});

console.log(`RESULTADO BATERÍA CIERRE/REVERSIÓN: ${pass} PASS · ${fail} FAIL · ${pass + fail} casos`);
if (fails.length) console.log('FALLOS: ' + fails.join(' | '));
await envH.cleanup(); await envR.cleanup();
process.exit(fail ? 1 : 0);
