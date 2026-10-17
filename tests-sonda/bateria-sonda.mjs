// ============================================================
// RONBO NUTRI — Batería de la SONDA DE ÉPOCA DE REGLAS (ventana D→E)
// Verifica el hecho técnico del que depende el mecanismo de
// bloqueo de la app A2 (commit eb8d48f): leer los recibos propios
// en consent_receipts está DENEGADO bajo las reglas H-C1 activas
// (la colección no existe) y PERMITIDO bajo el candidato r3,
// incluida la lista VACÍA de un usuario aún sin recibos.
// Dos proyectos ficticios en el mismo emulador oficial:
// demo-sonda-hc1 (reglas H-C1, SHA e874f453…) y demo-sonda-r3
// (candidato r3, SHA a32a908c…). TODOS los casos cuentan:
// cualquier FAIL => exit 1.
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';

const rulesHc1 = readFileSync(new URL('./firestore.rules.hc1', import.meta.url), 'utf8');
const rulesR3 = readFileSync(new URL('./firestore.rules.r3', import.meta.url), 'utf8');
const envH = await initializeTestEnvironment({ projectId: 'demo-sonda-hc1', firestore: { rules: rulesHc1, host: '127.0.0.1', port: 8799 } });
const envR = await initializeTestEnvironment({ projectId: 'demo-sonda-r3', firestore: { rules: rulesR3, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
const dbH = uid => envH.authenticatedContext(uid).firestore();
const dbR = uid => envR.authenticatedContext(uid).firestore();

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v3-2026-10-16' };
    await setDoc(doc(d, 'users', 'dueno'), { ...base, isOwner: true, name: 'Dueño', consentSeq: 1, consentReceiptId: 'dueno_1' });
    await setDoc(doc(d, 'users', 'cliente'), { ...base, name: 'Cliente', consentSeq: 1, consentReceiptId: 'cliente_1' });
    await setDoc(doc(d, 'users', 'nuevo'), { ...base, name: 'Nuevo', consentSeq: 0 });
    await setDoc(doc(d, 'consent_receipts', 'cliente_1'), { uid: 'cliente', email: 'cliente@pruebas.ronbo.store', type: 'registered', version: 'v3-2026-10-16', at: new Date('2026-10-16T10:00:00Z') });
  });
}
await seed(envH);
await seed(envR);

// --- Bajo H-C1: toda lectura de consent_receipts se DENIEGA ---
await T('S1 H-C1 · cliente lista sus recibos -> DENEGADO',
  getDocs(query(collection(dbH('cliente'), 'consent_receipts'), where('uid', '==', 'cliente'))), false);
await T('S2 H-C1 · cliente lee su recibo cliente_1 -> DENEGADO',
  getDoc(doc(dbH('cliente'), 'consent_receipts', 'cliente_1')), false);
await T('S3 H-C1 · dueño lista recibos -> DENEGADO',
  getDocs(collection(dbH('dueno'), 'consent_receipts')), false);

// --- Bajo r3: la sonda se PERMITE (y el control cruzado se deniega) ---
await T('S4 r3 · usuario sin recibos lista los suyos (vacío) -> PERMITIDO',
  getDocs(query(collection(dbR('nuevo'), 'consent_receipts'), where('uid', '==', 'nuevo'))), true);
await T('S5 r3 · cliente lee su recibo cliente_1 -> PERMITIDO',
  getDoc(doc(dbR('cliente'), 'consent_receipts', 'cliente_1')), true);
await T('S6 r3 · cliente lista sus recibos -> PERMITIDO',
  getDocs(query(collection(dbR('cliente'), 'consent_receipts'), where('uid', '==', 'cliente'))), true);
await T('S7 r3 · dueño lista recibos -> PERMITIDO',
  getDocs(collection(dbR('dueno'), 'consent_receipts')), true);
await T('S8 r3 · cliente lista recibos de OTRO uid -> DENEGADO',
  getDocs(query(collection(dbR('cliente'), 'consent_receipts'), where('uid', '==', 'cliente-otro'))), false);

console.log(`RESULTADO BATERÍA SONDA D→E: ${pass} PASS · ${fail} FAIL · ${pass + fail} casos`);
if (fails.length) console.log('FALLOS: ' + fails.join(' | '));
await envH.cleanup(); await envR.cleanup();
process.exit(fail ? 1 : 0);
