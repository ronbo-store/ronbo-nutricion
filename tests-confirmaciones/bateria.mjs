// ============================================================
// RONBO NUTRI — Batería de reglas: CANDIDATO AISLADO
// CONFIRMACIONES (19/10/2026). ESCRITA, NO EJECUTADA.
// Valida SOLO el candidato aislado derivado de r4:
//   preparacion-local/firestore.rules.candidato-confirmaciones-
//   aislado-2026-10-19.rules (SHA-256
//   30f71a20803593d3d39402b538297aae4100024e4ed3d50d8cc70bd2eae1dc9f),
// cuya copia exacta en esta carpeta es
//   firestore.rules.candidato-confirmaciones
// (verificar SHA-256 de ambas antes de cualquier corrida).
// Patrón idéntico a las baterías r3/r4: emulador oficial de
// Firestore vía @firebase/rules-unit-testing, proyecto ficticio
// demo-confirmaciones-v1 (prefijo demo- = emulador, sin
// credenciales ni datos reales posibles). 35 casos contados:
// cualquier FAIL => exit 1. El candidato NO se declara validado
// sin una corrida oficial 100% PASS con artefacto preservado,
// y su PUBLICACIÓN exigiría autorización expresa posterior de
// Ronald (checkpoint separado). Ejecutarla también requiere su
// autorización: esta batería se entrega solo escrita.
// Uso previsto el día autorizado (Mac o CI):
//   firebase emulators:exec --only firestore \
//     --project demo-confirmaciones-v1 "node bateria.mjs"
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, deleteField, serverTimestamp, query, where } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.candidato-confirmaciones', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-confirmaciones-v1', firestore: { rules, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

// ---------- Fixtures (sin reglas) ----------
const seed = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v3-2026-10-16', consentSeq: 10 };
  await setDoc(doc(d, 'users', 'dueno'), { ...base, isOwner: true, name: 'Dueño', consentReceiptId: 'dueno_10' });
  await setDoc(doc(d, 'users', 'ana'), { ...base, name: 'Ana', consentReceiptId: 'ana_10' });
  await setDoc(doc(d, 'users', 'carol'), { ...base, name: 'Carol', consentReceiptId: 'carol_10' });
  await setDoc(doc(d, 'users', 'pendiente'), { ...base, name: 'Pendiente', approved: false, consentReceiptId: 'pendiente_10' });
  // Set de fotos de ana (forma DESPLEGADA el 2026-10-19: un doc por foto).
  for (const slot of ['front', 'side', 'back']) {
    await setDoc(doc(d, 'nutrition_progress', 'ana_2026-10-19_' + slot),
      { uid: 'ana', ownerUid: 'ana', date: '2026-10-19', slot, photo: 'data:image/jpeg;base64,SEED-' + slot, updatedAt: new Date('2026-10-19T10:00:00Z') });
  }
  // Análisis de ana en estado de propuesta (sin confirmación).
  await setDoc(doc(d, 'nutrition_progress', 'ana_2026-10-19_analysis'),
    { uid: 'ana', ownerUid: 'ana', date: '2026-10-19', kind: 'bodytype-analysis', status: 'propuesta', dominance: 'mesomorph', mix: 'endomorphic tendency', confidence: 68, observations: 'nota inicial', createdAt: new Date('2026-10-19T10:05:00Z') });
  // Doc LEGADO/FALSIFICABLE sembrado a propósito (simula un análisis
  // creado contra r4 ANTES del candidato, ya con campos de
  // confirmación dentro de nutrition_progress): sirve para probar
  // que ni siquiera sobre ese doc se puede tocar la confirmación.
  await setDoc(doc(d, 'nutrition_progress', 'ana_2026-09-01_analysis'),
    { uid: 'ana', ownerUid: 'ana', date: '2026-09-01', kind: 'bodytype-analysis', status: 'propuesta', dominance: 'mesomorph', confidence: 50, observations: 'legado', confirmedBy: 'dueno', confirmedAt: new Date('2026-09-01T10:00:00Z'), adjustments: { dominance: 'x' } });
  // Foto y confirmación YA EXISTENTE de carol (para terceros y purga).
  await setDoc(doc(d, 'nutrition_progress', 'carol_2026-10-19_front'),
    { uid: 'carol', ownerUid: 'carol', date: '2026-10-19', slot: 'front', photo: 'data:image/jpeg;base64,SEED-carol', updatedAt: new Date('2026-10-19T10:00:00Z') });
  await setDoc(doc(d, 'progress_confirmations', 'carol_2026-10-19'),
    { ownerUid: 'carol', date: '2026-10-19', confirmedBy: 'dueno', confirmedAt: new Date('2026-10-19T11:00:00Z'), status: 'confirmed', adjustments: {} });
});
await seed;

const prog = (actor, id) => doc(db(actor), 'nutrition_progress', id);
const conf = (actor, id) => doc(db(actor), 'progress_confirmations', id);
const analisis = (uid, date, extra) => ({ uid, ownerUid: uid, date, kind: 'bodytype-analysis', status: 'propuesta', dominance: 'mesomorph', mix: 'endomorphic tendency', confidence: 68, observations: '', createdAt: serverTimestamp(), ...(extra || {}) });

// ---------- A · nutrition_progress: la confirmación no vive ahí [CONF-1] ----------
await T('C01 · ana crea su análisis SIN campos de confirmación → permitido [req.1]',
  setDoc(prog('ana', 'ana_2026-11-02_analysis'), analisis('ana', '2026-11-02')), true);
await T('C02 · ana intenta crear su análisis YA CONFIRMADO (confirmedBy ajeno + confirmedAt + adjustments) → denegado [req.2]',
  setDoc(prog('ana', 'ana_2026-11-16_analysis'), analisis('ana', '2026-11-16', { confirmedBy: 'dueno', confirmedAt: serverTimestamp(), adjustments: {} })), false);
await T('C03 · ana intenta crear su análisis SOLO con adjustments → denegado',
  setDoc(prog('ana', 'ana_2026-12-01_analysis'), analisis('ana', '2026-12-01', { adjustments: { dominance: 'ectomorph' } })), false);
await T('C04 · ana intenta crear su análisis con status «confirmada» (sin campos) → denegado',
  setDoc(prog('ana', 'ana_2026-12-15_analysis'), analisis('ana', '2026-12-15', { status: 'confirmada' })), false);
await T('C05 · ana intenta AÑADIR confirmedBy/confirmedAt a su análisis (updateDoc) → denegado [req.3]',
  updateDoc(prog('ana', 'ana_2026-10-19_analysis'), { confirmedBy: 'dueno', confirmedAt: serverTimestamp() }), false);
await T('C06 · ana intenta SOBRESCRIBIR su análisis con setDoc (ruta de la app) incluyendo confirmedBy → denegado [req.3]',
  setDoc(prog('ana', 'ana_2026-11-02_analysis'), analisis('ana', '2026-11-02', { confirmedBy: 'dueno', confirmedAt: serverTimestamp(), adjustments: {} })), false);
await T('C07 · ana intenta ELIMINAR el confirmedBy de su doc legado con deleteField → denegado [req.3c]',
  updateDoc(prog('ana', 'ana_2026-09-01_analysis'), { confirmedBy: deleteField() }), false);
await T('C08 · el dueño intenta tocar confirmedBy DENTRO de nutrition_progress → denegado (su cauce es la colección separada)',
  updateDoc(prog('dueno', 'ana_2026-09-01_analysis'), { confirmedBy: 'otro' }), false);
await T('C09 · ana edita su análisis (observations/confidence) sin tocar confirmaciones → permitido [req.4]',
  updateDoc(prog('ana', 'ana_2026-10-19_analysis'), { observations: 'revisado por ana', confidence: 70 }), true);
await T('C10 · pendiente (NO aprobado) intenta crear un análisis limpio → denegado (puerta de aprobación intacta)',
  setDoc(prog('pendiente', 'pendiente_2026-11-02_analysis'), analisis('pendiente', '2026-11-02')), false);

// ---------- B · progress_confirmations: solo el propietario escribe [CONF-2] ----------
const confAna = { ownerUid: 'ana', date: '2026-10-19', confirmedBy: 'dueno', confirmedAt: serverTimestamp(), status: 'confirmed', adjustments: {} };
await T('C11 · el propietario CREA la confirmación del análisis de ana → permitido [req.5]',
  setDoc(conf('dueno', 'ana_2026-10-19'), confAna), true);
await T('C12 · el propietario AJUSTA su confirmación (status adjusted + adjustments, confirmedAt renovado) → permitido [req.5]',
  updateDoc(conf('dueno', 'ana_2026-10-19'), { status: 'adjusted', adjustments: { dominance: 'mesomorph', note: 'ajuste de prueba' }, confirmedBy: 'dueno', confirmedAt: serverTimestamp() }), true);
await T('C13 · el propietario intenta atribuir la confirmación a OTRA persona (confirmedBy ≠ quien escribe) → denegado',
  setDoc(conf('dueno', 'carol_2026-11-02'), { ownerUid: 'carol', date: '2026-11-02', confirmedBy: 'ana', confirmedAt: serverTimestamp(), status: 'confirmed', adjustments: {} }), false);
await T('C14 · el propietario intenta crear una confirmación con fecha LITERAL 2030 → denegado (patrón B1)',
  setDoc(conf('dueno', 'ana_2026-11-02'), { ownerUid: 'ana', date: '2026-11-02', confirmedBy: 'dueno', confirmedAt: new Date('2030-01-01T00:00:00Z'), status: 'confirmed', adjustments: {} }), false);
await T('C15 · el propietario intenta crear una confirmación con id incoherente (id ≠ ownerUid_date) → denegado',
  setDoc(conf('dueno', 'ana_2099-01-01'), { ownerUid: 'ana', date: '2026-11-02', confirmedBy: 'dueno', confirmedAt: serverTimestamp(), status: 'confirmed', adjustments: {} }), false);
await T('C16 · ana lee SU confirmación → permitido',
  getDoc(conf('ana', 'ana_2026-10-19')), true);
await T('C17 · carol lee SU confirmación → permitido',
  getDoc(conf('carol', 'carol_2026-10-19')), true);
await T('C18 · carol (tercera) lee la confirmación de ANA → denegado [req.6]',
  getDoc(conf('carol', 'ana_2026-10-19')), false);
await T('C19 · carol lista las confirmaciones de ana → denegado [req.6]',
  getDocs(query(collection(db('carol'), 'progress_confirmations'), where('ownerUid', '==', 'ana'))), false);
await T('C20 · carol intenta CREAR una confirmación para ana → denegado [req.6]',
  setDoc(conf('carol', 'ana_2026-12-01'), { ownerUid: 'ana', date: '2026-12-01', confirmedBy: 'carol', confirmedAt: serverTimestamp(), status: 'confirmed', adjustments: {} }), false);
await T('C21 · carol intenta crear una confirmación PARA SÍ MISMA → denegado (un no-propietario nunca escribe confirmaciones)',
  setDoc(conf('carol', 'carol_2026-11-02'), { ownerUid: 'carol', date: '2026-11-02', confirmedBy: 'carol', confirmedAt: serverTimestamp(), status: 'confirmed', adjustments: {} }), false);
await T('C22 · ana intenta ACTUALIZAR su propia confirmación (adjustments) → denegado [req.3/6]',
  updateDoc(conf('ana', 'ana_2026-10-19'), { adjustments: { dominance: 'ectomorph' }, confirmedAt: serverTimestamp() }), false);
await T('C23 · ana intenta BORRAR su propia confirmación → denegado [req.3c/6]',
  deleteDoc(conf('ana', 'ana_2026-10-19')), false);
await T('C24 · sin sesión crea una confirmación → denegado',
  setDoc(conf(null, 'ana_2026-12-15'), { ownerUid: 'ana', date: '2026-12-15', confirmedBy: 'dueno', confirmedAt: serverTimestamp(), status: 'confirmed', adjustments: {} }), false);
await T('C25 · sin sesión lee la confirmación de ana → denegado',
  getDoc(conf(null, 'ana_2026-10-19')), false);
await T('C26 · el propietario lee la confirmación de ana → permitido',
  getDoc(conf('dueno', 'ana_2026-10-19')), true);
await T('C27 · el propietario BORRA la confirmación de carol (purga) → permitido',
  deleteDoc(conf('dueno', 'carol_2026-10-19')), true);

// ---------- C · Regresión: fotos de progreso desplegadas [req.7] ----------
await T('C28 · ana crea una foto de progreso propia (setDoc, forma de la app) → permitido [req.7]',
  setDoc(prog('ana', 'ana_2026-11-02_front'), { uid: 'ana', ownerUid: 'ana', date: '2026-11-02', slot: 'front', photo: 'data:image/jpeg;base64,NUEVA', updatedAt: serverTimestamp() }), true);
await T('C29 · ana lee su foto → permitido [req.7]',
  getDoc(prog('ana', 'ana_2026-10-19_front')), true);
await T('C30 · ana REEMPLAZA su foto (setDoc sobre el mismo id) → permitido [req.7]',
  setDoc(prog('ana', 'ana_2026-10-19_front'), { uid: 'ana', ownerUid: 'ana', date: '2026-10-19', slot: 'front', photo: 'data:image/jpeg;base64,REEMPLAZO', updatedAt: serverTimestamp() }), true);
await T('C31 · ana lee la foto de CAROL → denegado [req.7]',
  getDoc(prog('ana', 'carol_2026-10-19_front')), false);
await T('C32 · ana borra la foto de CAROL → denegado [req.7]',
  deleteDoc(prog('ana', 'carol_2026-10-19_front')), false);
await T('C33 · ana crea una foto con ownerUid de CAROL → denegado [req.7]',
  setDoc(prog('ana', 'carol_2026-11-02_front'), { uid: 'ana', ownerUid: 'carol', date: '2026-11-02', slot: 'front', photo: 'data:image/jpeg;base64,X', updatedAt: serverTimestamp() }), false);
await T('C34 · ana borra SU foto → permitido [req.7]',
  deleteDoc(prog('ana', 'ana_2026-11-02_front')), true);
await T('C35 · INTEGRAL: ana borra su ANÁLISIS (su derecho) y la confirmación SOBREVIVE intacta y sigue sin poder borrarla ella',
  (async () => {
    await assertSucceeds(deleteDoc(prog('ana', 'ana_2026-10-19_analysis')));
    const c = await assertSucceeds(getDoc(conf('dueno', 'ana_2026-10-19')));
    if (!c.exists() || c.data().confirmedBy !== 'dueno' || c.data().status !== 'adjusted') throw new Error('la confirmación cambió al borrar el análisis');
    await assertFails(deleteDoc(conf('ana', 'ana_2026-10-19')));
  })(), true);

console.log(`\nRESULTADO BATERÍA CONFIRMACIONES: ${pass} PASS · ${fail} FAIL` + (fails.length ? ' · fallos: ' + fails.join(' | ') : ''));
await env.cleanup();
process.exit(fail ? 1 : 0);
