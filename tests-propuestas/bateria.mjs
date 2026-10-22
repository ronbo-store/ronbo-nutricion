// ============================================================
// RONBO NUTRI — Batería de reglas del PAQUETE 7 «PLANTILLAS
// VISIBLES AL CLIENTE + PROPUESTAS» (2026-10-22).
// NO hay candidato de reglas: el archivo bajo prueba es la
// COPIA EXACTA del texto vivo verificado (ruleset 2a1e98c1,
// SHA-256 bbbf00db…54b — el mismo texto que la suite de 151
// casos validó). La
// batería PRUEBA que la casa de datos elegida por el diseño
// (nutrition_progress con kind 'planProposal') funciona bajo
// las reglas vivas para ambos roles, que un tercero no accede,
// que aprobar jamás puede escribir el plan, y que una colección
// nueva quedaría denegada por el catch-all (por eso haría falta
// un candidato si algún día se quisiera). Proyecto ficticio
// demo-propuestas. TODOS los casos cuentan: cualquier FAIL =>
// exit 1. Diseño: DISENO-DETALLADO-P7-PROPUESTAS-2026-10-22.md.
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.vivas-2a1e98c1.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-propuestas', firestore: { rules, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

// ---------- Fixtures (sin reglas) ----------
const PROP = (id, extra) => ({ kind: 'planProposal', ownerUid: 'ana', uid: 'ana', planId: 'planA', planTitle: 'Plan Fuerza',
  type: 'add', dayIndex: 0, dayLabel: 'Lunes — Tren superior', exerciseId: 'E003',
  exerciseName_es: 'Dominadas', exerciseName_en: 'Pull-ups', note: '', status: 'pending',
  createdAt: new Date('2026-10-09T10:00:00Z'), ...(extra || {}) });
const seed = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v3-2026-10-16', consentSeq: 2 };
  await setDoc(doc(d, 'users', 'dueno'), { ...base, isOwner: true, name: 'Dueño' });
  await setDoc(doc(d, 'users', 'ana'), { ...base, name: 'Ana' });
  await setDoc(doc(d, 'users', 'beto'), { ...base, name: 'Beto' });
  await setDoc(doc(d, 'users', 'pendiente'), { ...base, name: 'Pendiente', approved: false });
  await setDoc(doc(d, 'nutrition_progress', 'ana_prop_seed'), PROP('ana_prop_seed'));
  await setDoc(doc(d, 'nutrition_progress', 'ana_prop_del'), PROP('ana_prop_del'));
  await setDoc(doc(d, 'nutrition_progress', 'ana_prop_del2'), PROP('ana_prop_del2'));
  await setDoc(doc(d, 'routine_templates', 'R01'), { nombre_es: 'Fuerza base', nombre_en: 'Base strength' });
  await setDoc(doc(d, 'exercise_library', 'E003'), { nombre_es: 'Dominadas', nombre_en: 'Pull-ups' });
});
await seed;

const np = (uid, id) => doc(db(uid), 'nutrition_progress', id);
const npList = (uid, owner) => query(collection(db(uid), 'nutrition_progress'), where('ownerUid', '==', owner));

// ---------- Creación (líneas 568-569 del texto vivo) ----------
await T('PROP01 · el cliente aprobado crea SU propuesta (ownerUid propio)', setDoc(np('ana', 'ana_prop_1'), PROP('ana_prop_1')), true);
await T('PROP02 · el cliente crea con ownerUid de OTRO → denegado', setDoc(np('ana', 'ana_prop_bad'), PROP('ana_prop_bad', { ownerUid: 'beto', uid: 'beto' })), false);
await T('PROP03 · el cliente NO aprobado crea su propuesta → denegado (isApprovedUser)', setDoc(np('pendiente', 'pendiente_prop_1'), PROP('x', { ownerUid: 'pendiente', uid: 'pendiente' })), false);
await T('PROP04 · sin sesión crea una propuesta → denegado', setDoc(np(null, 'ana_prop_anon'), PROP('ana_prop_anon')), false);
await T('PROP05 · el ENTRENADOR crea suplantando al cliente (ownerUid ajeno) → denegado: nadie propone por otro', setDoc(np('dueno', 'ana_prop_fake'), PROP('ana_prop_fake')), false);

// ---------- Lectura: el cliente solo las suyas; el entrenador, las de su cliente ----------
await T('PROP06 · el cliente lee SU propuesta', getDoc(np('ana', 'ana_prop_seed')), true);
await T('PROP07 · el cliente lista SUS propuestas (ownerUid == él)', getDocs(npList('ana', 'ana')), true);
await T('PROP08 · un TERCERO lee la propuesta de ana → denegado', getDoc(np('beto', 'ana_prop_seed')), false);
await T('PROP09 · un TERCERO lista las propuestas de ana → denegado', getDocs(npList('beto', 'ana')), false);
await T('PROP10 · el tercero lista LAS SUYAS (vacías) → permitido', getDocs(npList('beto', 'beto')), true);
await T('PROP11 · el entrenador lee la propuesta de su cliente', getDoc(np('dueno', 'ana_prop_seed')), true);
await T('PROP12 · el entrenador lista las propuestas de su cliente', getDocs(npList('dueno', 'ana')), true);

// ---------- Decisión del entrenador (update por la rama del propietario) ----------
await T('PROP13 · el entrenador APRUEBA: actualiza solo el estado de la propuesta', updateDoc(np('dueno', 'ana_prop_seed'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'dueno' }), true);
await T('PROP14 · el cliente relee su propuesta ya aprobada (el estado ES el acuse)', (async () => {
  const s = await getDoc(np('ana', 'ana_prop_seed')); if (!s.exists() || s.data().status !== 'approved') throw new Error('estado no aprobado');
})(), true);
await T('PROP15 · el cliente actualiza SU propia propuesta → permitido (postura viva declarada, = evaluaciones; jamás crea aprobación efectiva)', updateDoc(np('ana', 'ana_prop_1'), { note: 'nota ajustada' }), true);
await T('PROP16 · un TERCERO actualiza la propuesta de ana → denegado', updateDoc(np('beto', 'ana_prop_seed'), { status: 'rejected' }), false);

// ---------- Borrado (misma postura viva que el resto de nutrition_progress) ----------
await T('PROP17 · el cliente borra SU propuesta', deleteDoc(np('ana', 'ana_prop_del')), true);
await T('PROP18 · el entrenador borra una propuesta del cliente', deleteDoc(np('dueno', 'ana_prop_del2')), true);

// ---------- Explorar plantillas y biblioteca (Paquetes 2/3, sin cambios) ----------
await T('PROP19 · el cliente aprobado lee routine_templates (explorar plantillas)', getDoc(doc(db('ana'), 'routine_templates', 'R01')), true);
await T('PROP20 · el cliente aprobado lee exercise_library (elegir ejercicio)', getDoc(doc(db('ana'), 'exercise_library', 'E003')), true);
await T('PROP21 · el cliente NO aprobado lee routine_templates → denegado', getDoc(doc(db('pendiente'), 'routine_templates', 'R01')), false);

// ---------- El plan jamás se escribe desde este flujo ----------
await T('PROP22 · el cliente crea un plan en training_plans → denegado (solo el entrenador escribe planes)', setDoc(doc(db('ana'), 'training_plans', 'p1'), { clientUid: 'ana', title: 'X', days: [] }), false);
await T('PROP23 · el cliente actualiza un plan → denegado', updateDoc(doc(db('ana'), 'training_plans', 'p1'), { title: 'Y' }), false);

// ---------- Por qué no una colección nueva sin reglas ----------
await T('PROP24 · crear en una colección NUEVA (plan_proposals) → denegado por el catch-all: exigiría candidato de reglas', setDoc(doc(db('ana'), 'plan_proposals', 'x1'), { ownerUid: 'ana', status: 'pending' }), false);

// ---------- Convivencia: la misma casa sigue sirviendo a lo ya desplegado ----------
await T('PROP25 · el cliente sigue creando sus documentos de progreso de otros tipos (kind evaluation) en la misma colección', setDoc(np('ana', 'ana_2026-10-09_eval'), { kind: 'evaluation', ownerUid: 'ana', date: '2026-10-09' }), true);

console.log('');
console.log('SUBTOTAL PROPUESTAS: ' + pass + ' PASS · ' + fail + ' FAIL');
console.log('RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL' + (fail ? ' — FALLOS: ' + fails.join(' | ') : ''));
await env.cleanup();
process.exit(fail ? 1 : 0);
