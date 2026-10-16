// Batería S4 — validación de reglas PROPUESTAS contra el emulador oficial.
// Proyecto ficticio demo-fase1-hc1 · sin producción · datos ficticios.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.propuesta-renovacion', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-fase1-hc1', firestore: { rules, host: '127.0.0.1', port: 8799 } });
const db = (uid) => uid === null ? env.unauthenticatedContext().firestore() : env.authenticatedContext(uid).firestore();
let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
// ---------- Semilla (sin reglas) ----------
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const U = (id, data) => setDoc(doc(d, 'users', id), data);
  await U('dueno', { name: 'Dueño', role: 'user', isOwner: true, approved: true, acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: Timestamp.fromDate(new Date('2026-10-01')) });
  await U('ana', { name: 'Ana', role: 'user', isOwner: false, approved: true, acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: Timestamp.fromDate(new Date('2026-10-01')) });
  await U('beto', { name: 'Beto', role: 'user', isOwner: false, approved: true, acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: Timestamp.fromDate(new Date('2026-10-01')) });
  await U('pablo', { name: 'Pablo', role: 'user', isOwner: false, approved: false, acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: Timestamp.fromDate(new Date('2026-10-01')) });
  await U('retirado', { name: 'Ret', role: 'user', isOwner: false, approved: false, acceptedTerms: false, termsVersion: 'v2-2026-10-14', termsAcceptedAt: Timestamp.fromDate(new Date('2026-10-01')), consentWithdrawnAt: Timestamp.fromDate(new Date('2026-10-10')) });
  await setDoc(doc(d, 'nutrition_meals', 'm-ana'), { ownerUid: 'ana', name: 'Pollo', kcal: 500 });
  await setDoc(doc(d, 'nutrition_meals', 'm-beto'), { ownerUid: 'beto', name: 'Arroz', kcal: 300 });
  await setDoc(doc(d, 'nutrition_weight', 'w-ana'), { ownerUid: 'ana', kg: 80, date: '2026-10-10' });
});
// ---------- Acceso a usuarios ----------
await T('ana lee su propio documento', getDoc(doc(db('ana'), 'users', 'ana')), true);
await T('ana lee el documento de beto → denegado', getDoc(doc(db('ana'), 'users', 'beto')), false);
await T('sin sesión lee un documento → denegado', getDoc(doc(db(null), 'users', 'ana')), false);
await T('el dueño lee el documento de ana', getDoc(doc(db('dueno'), 'users', 'ana')), true);
await T('el dueño aprueba a pablo (approved:true)', updateDoc(doc(db('dueno'), 'users', 'pablo'), { approved: true }), true);
await T('ana intenta aprobarse a otro (a beto) → denegado', updateDoc(doc(db('ana'), 'users', 'beto'), { approved: false }), false);
// ---------- Registro (forma nacida sin privilegios) ----------
const regBase = { email: 'nuevo@pruebas.ronbo.store', name: 'Nuevo', role: 'user', isOwner: false, approved: false, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp(), goals: { kcal: 1900 } };
await T('registro con la forma correcta', setDoc(doc(db('nuevo'), 'users', 'nuevo'), regBase), true);
await T('registro con isOwner:true → denegado', setDoc(doc(db('nuevo2'), 'users', 'nuevo2'), { ...regBase, isOwner: true }), false);
await T('registro con approved:true → denegado', setDoc(doc(db('nuevo3'), 'users', 'nuevo3'), { ...regBase, approved: true }), false);
// ---------- Comidas (aislamiento y aprobación) ----------
await T('ana crea su comida', addDoc(collection(db('ana'), 'nutrition_meals'), { ownerUid: 'ana', name: 'Huevos', kcal: 200 }), true);
await T('ana crea comida con ownerUid de beto → denegado', addDoc(collection(db('ana'), 'nutrition_meals'), { ownerUid: 'beto', name: 'X' }), false);
await T('ana lee su comida sembrada', getDoc(doc(db('ana'), 'nutrition_meals', 'm-ana')), true);
await T('ana lee la comida de beto → denegado', getDoc(doc(db('ana'), 'nutrition_meals', 'm-beto')), false);
await T('ana lista SOLO sus comidas (query ownerUid==ana)', getDocs(query(collection(db('ana'), 'nutrition_meals'), where('ownerUid', '==', 'ana'))), true);
await T('ana lista comidas de beto (query ownerUid==beto) → denegado', getDocs(query(collection(db('ana'), 'nutrition_meals'), where('ownerUid', '==', 'beto'))), false);
await T('el dueño crea comida con ownerUid de ana → denegado (sin override en create)', addDoc(collection(db('dueno'), 'nutrition_meals'), { ownerUid: 'ana', name: 'X' }), false);
await T('retirado SIN renovar crea comida → denegado', addDoc(collection(db('retirado'), 'nutrition_meals'), { ownerUid: 'retirado', name: 'X' }), false);
// ---------- Peso ----------
await T('ana crea su pesaje', addDoc(collection(db('ana'), 'nutrition_weight'), { ownerUid: 'ana', kg: 79.5, date: '2026-10-15' }), true);
await T('ana actualiza su pesaje sembrado', updateDoc(doc(db('ana'), 'nutrition_weight', 'w-ana'), { kg: 79.8 }), true);
await T('beto actualiza el pesaje de ana → denegado', updateDoc(doc(db('beto'), 'nutrition_weight', 'w-ana'), { kg: 1 }), false);
await T('retirado crea pesaje → denegado', addDoc(collection(db('retirado'), 'nutrition_weight'), { ownerUid: 'retirado', kg: 70 }), false);
// ---------- Consentimiento: retirada ----------
await T('beto retira su consentimiento (desde activo)', updateDoc(doc(db('beto'), 'users', 'beto'), { acceptedTerms: false, approved: false, consentWithdrawnAt: serverTimestamp() }), true);
await T('beto RE-retira desde ya retirado → denegado (observación preexistente)', updateDoc(doc(db('beto'), 'users', 'beto'), { acceptedTerms: false, approved: false, consentWithdrawnAt: serverTimestamp() }), false);
// ---------- Consentimiento: renovación (H-C1) ----------
await T('retirado renueva con los 3 campos exactos + serverTimestamp', updateDoc(doc(db('retirado'), 'users', 'retirado'), { acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp() }), true);
const snapRet = await getDoc(doc(db('retirado'), 'users', 'retirado'));
console.log((snapRet.data().acceptedTerms === true && !!snapRet.data().consentWithdrawnAt ? 'PASS' : 'FAIL') + ' · tras renovar: acceptedTerms=true y consentWithdrawnAt CONSERVADO (historial)');
snapRet.data().acceptedTerms === true && snapRet.data().consentWithdrawnAt ? pass++ : (fail++, fails.push('historial tras renovar'));
await T('renovado pero NO aprobado crea comida → denegado (consentimiento ≠ aprobación)', addDoc(collection(db('retirado'), 'nutrition_meals'), { ownerUid: 'retirado', name: 'X' }), false);
await T('renovación colando approved:true → denegado', updateDoc(doc(db('retirado'), 'users', 'retirado'), { acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp(), approved: true }), false);
await T('renovación sobre el documento de ana → denegado', updateDoc(doc(db('retirado'), 'users', 'ana'), { acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp() }), false);
await T('renovación con acceptedTerms=false → denegado', updateDoc(doc(db('retirado'), 'users', 'retirado'), { acceptedTerms: false, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp() }), false);
await T('renovación sin termsVersion → denegado', updateDoc(doc(db('retirado'), 'users', 'retirado'), { acceptedTerms: true, termsAcceptedAt: serverTimestamp() }), false);
// Fecha arbitraria literal: la regla propuesta (solo-tipo) la ACEPTA → discrepancia conocida y reportada
let arbitrariaAceptada = false;
try { await assertSucceeds(updateDoc(doc(db('retirado'), 'users', 'retirado'), { acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: Timestamp.fromDate(new Date('2030-01-01')) })); arbitrariaAceptada = true; } catch {}
console.log((arbitrariaAceptada ? 'DISCREPANCIA CONFIRMADA' : 'PASS') + ' · renovación con fecha literal arbitraria (2030): ' + (arbitrariaAceptada ? 'ACEPTADA por la regla de solo-tipo (endurecimiento == request.time propuesto, NO implementado)' : 'denegada'));
console.log(`\nRESULTADO BATERÍA: ${pass} PASS · ${fail} FAIL` + (fails.length ? ' · fallos: ' + fails.join(' | ') : ''));
await env.cleanup();
process.exit(fail ? 1 : 0);
