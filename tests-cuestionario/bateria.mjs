// ============================================================
// RONBO NUTRI — Batería oficial de reglas: CUESTIONARIO v1
// Consentimiento específico + declaraciones de salud separadas.
// Proyecto ficticio demo-cuestionario-v1 (prefijo demo- =
// emulador, sin credenciales ni datos reales posibles).
// TODOS los casos cuentan: cualquier FAIL => exit 1.
// Ampliación S2 (autorizada el 16/10/2026): +1 caso integral
// (ciclo completo de la Opción II) = 33 casos contados. La
// batería original de 32 casos se conserva íntegra arriba.
// Corrección S4 (autorizada el 16/10/2026, tras la auditoría
// S3): P1 el caso de retirada de Elena prueba ahora una
// operación que SÍ elimina acceptedAt (updateDoc sin merge);
// P2 la retirada positiva usa una ficticia independiente
// (sofia); P3 la renovación general reproduce el flujo real
// retirar -> renovar de H-C1; P4 sustituye la falsa
// autoaprobación por tres intentos reales de escalada con una
// ficticia NO aprobada (pendiente). Conteo: 33 casos; P4 es un
// caso compuesto con 3 subcomprobaciones obligatorias.
// Uso (Mac o CI): firebase emulators:start --only firestore
//   --project demo-cuestionario-v1  +  node bateria.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.propuesta-cuestionario-v1', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-cuestionario-v1', firestore: { rules, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

// ---------- Fixtures (sin reglas) ----------
const seed = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true };
  await setDoc(doc(d, 'users', 'dueno'), { ...base, isOwner: true, name: 'Dueño' });
  await setDoc(doc(d, 'users', 'ana'), { ...base, name: 'Ana',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-16T10:00:00Z') } });
  await setDoc(doc(d, 'users/ana/healthDeclarations', 'v2'), { version: 2, conditions: ['Diabetes'], details: 'Metformina', state: 'active', declaredAt: new Date('2026-10-16T10:01:00Z'), updatedAt: new Date('2026-10-16T10:01:00Z'), blockedAt: null });
  await setDoc(doc(d, 'users/ana/healthDeclarations', 'v1'), { version: 1, conditions: ['Asma / problemas respiratorios'], details: '', state: 'blocked', declaredAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'), blockedAt: new Date('2026-10-05T10:00:00Z') });
  await setDoc(doc(d, 'users', 'dora'), { ...base, name: 'Dora',
    healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-01T10:00:00Z'), withdrawnAt: new Date('2026-10-05T10:00:00Z') } });
  await setDoc(doc(d, 'users/dora/healthDeclarations', 'v1'), { version: 1, conditions: [], details: 'x', state: 'blocked', declaredAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'), blockedAt: new Date('2026-10-05T10:00:00Z') });
  await setDoc(doc(d, 'users', 'carol'), { ...base, name: 'Carol' });
  await setDoc(doc(d, 'users', 'elena'), { ...base, name: 'Elena' });
  await setDoc(doc(d, 'users', 'sofia'), { ...base, name: 'Sofía',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-16T10:00:00Z') } });
  await setDoc(doc(d, 'users', 'pendiente'), { ...base, name: 'Pendiente', approved: false });
});
await seed;

const decl = (uid, id) => doc(db(uid), 'users/' + uid + '/healthDeclarations', id);
const declAnon = id => doc(db(null), 'users/ana/healthDeclarations', id);

// ---------- Cliente: acceso propio ----------
await T('ana lee su declaración vigente', getDoc(decl('ana', 'v2')), true);
await T('ana lee su declaración BLOQUEADA (consulta propia)', getDoc(decl('ana', 'v1')), true);
await T('ana actualiza los contenidos de su vigente', updateDoc(decl('ana', 'v2'), { conditions: ['Diabetes', 'Hipertensión'], details: 'Metformina 850', updatedAt: serverTimestamp() }), true);
await T('ana intenta modificar su BLOQUEADA → denegado (inmutable)', updateDoc(decl('ana', 'v1'), { details: 'cambio', updatedAt: serverTimestamp() }), false);
await T('ana intenta DESBLOQUEAR su bloqueada → denegado', updateDoc(decl('ana', 'v1'), { state: 'active', blockedAt: null }), false);

// ---------- Entrenador: consulta condicionada, jamás escribe ----------
await T('el dueño lee la vigente de ana con consentimiento activo', getDoc(doc(db('dueno'), 'users/ana/healthDeclarations', 'v2')), true);
await T('el dueño lee la BLOQUEADA de ana → denegado', getDoc(doc(db('dueno'), 'users/ana/healthDeclarations', 'v1')), false);
await T('el dueño lee la declaración de dora (consentimiento retirado) → denegado', getDoc(doc(db('dueno'), 'users/dora/healthDeclarations', 'v1')), false);
await T('el dueño CREA una declaración para ana → denegado (nunca escribe respuestas)', setDoc(doc(db('dueno'), 'users/ana/healthDeclarations', 'v9'), { version: 9, conditions: [], details: '', state: 'active', declaredAt: serverTimestamp() }), false);
await T('el dueño ACTUALIZA la declaración de ana → denegado', updateDoc(doc(db('dueno'), 'users/ana/healthDeclarations', 'v2'), { details: 'x', updatedAt: serverTimestamp() }), false);
await T('el dueño BORRA la declaración de ana → denegado', deleteDoc(doc(db('dueno'), 'users/ana/healthDeclarations', 'v2')), false);
await T('el dueño guarda NOTAS de ana en users (permitido) y la declaración no cambia', (async () => {
  await setDoc(doc(db('dueno'), 'users', 'ana'), { trainerNotes: 'Primera entrevista OK' }, { merge: true });
  const s = await getDoc(decl('ana', 'v2')); if (!s.exists() || s.data().details !== 'Metformina 850') throw new Error('la declaración cambió');
})(), true);
await T('el dueño intenta escribir el healthConsent de ana → denegado (guarda)', setDoc(doc(db('dueno'), 'users', 'ana'), { healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', withdrawnAt: new Date() } }, { merge: true }), false);
await T('el dueño intenta escribir el health legado de ana → denegado (guarda)', setDoc(doc(db('dueno'), 'users', 'ana'), { health: { conditions: [], details: '' } }, { merge: true }), false);
await T('el dueño sigue pudiendo aprobar/fijar metas (update general intacto)', setDoc(doc(db('dueno'), 'users', 'carol'), { goals: { kcal: 1800 } }, { merge: true }), true);
await T('ana bloquea su vigente (transición de retirada)', updateDoc(decl('ana', 'v2'), { state: 'blocked', blockedAt: serverTimestamp() }), true);
await T('el dueño lee la vigente de ana TRAS el bloqueo → denegado (retirada efectiva)', getDoc(doc(db('dueno'), 'users/ana/healthDeclarations', 'v2')), false);

// ---------- Terceros y anónimos ----------
await T('carol (tercera) lee la declaración de ana → denegado', getDoc(doc(db('carol'), 'users/ana/healthDeclarations', 'v2')), false);
await T('carol lista las declaraciones de ana → denegado', getDocs(collection(db('carol'), 'users/ana/healthDeclarations')), false);
await T('sin sesión lee una declaración → denegado', getDoc(declAnon('v2')), false);

// ---------- Consentimiento específico: otorgar / retirar / renovar ----------
await T('elena otorga su consentimiento específico (serverTimestamp)', setDoc(doc(db('elena'), 'users', 'elena'), { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp() } }, { merge: true }), true);
await T('elena crea su declaración v1 con consentimiento activo', setDoc(doc(db('elena'), 'users/elena/healthDeclarations', 'v1'), { version: 1, conditions: [], details: '', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }), true);
await T('elena intenta retirar ELIMINANDO acceptedAt (mapa sustituido, sin merge) → denegado', updateDoc(doc(db('elena'), 'users', 'elena'), { healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', withdrawnAt: serverTimestamp() } }), false); // P1/S4: updateDoc sustituye el mapa: el documento resultante pierde acceptedAt y la sentencia lo deniega
await T('sofia retira su específico CORRECTAMENTE (fixture independiente, acceptedAt conservado, como la app)', (async () => {
  const cur = (await getDoc(doc(db('sofia'), 'users', 'sofia'))).data().healthConsent;
  await setDoc(doc(db('sofia'), 'users', 'sofia'), { healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', acceptedAt: cur.acceptedAt, withdrawnAt: serverTimestamp() } }, { merge: true });
})(), true);
await T('dora intenta crear declaración con consentimiento RETIRADO → denegado', setDoc(doc(db('dora'), 'users/dora/healthDeclarations', 'v2'), { version: 2, conditions: [], details: '', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }), false);
await T('ana otorga su específico con fecha literal 2030 → denegado (B1)', setDoc(doc(db('ana'), 'users', 'ana'), { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2030-01-01') } }, { merge: true }), false);
await T('ana borra su propia declaración bloqueada (su derecho)', deleteDoc(decl('ana', 'v1')), true);

// ---------- Registro endurecido ----------
const regBase = { isOwner: false, approved: false, role: 'user', acceptedTerms: true, adultConfirmed: true };
await T('registro limpio (sin salud) → permitido', setDoc(doc(db('nuevo1'), 'users', 'nuevo1'), { ...regBase, termsAcceptedAt: serverTimestamp() }), true);
await T('registro con campo health → denegado', setDoc(doc(db('nuevo2'), 'users', 'nuevo2'), { ...regBase, termsAcceptedAt: serverTimestamp(), health: { conditions: [] } }), false);
await T('registro con healthConsent prehorneado → denegado', setDoc(doc(db('nuevo3'), 'users', 'nuevo3'), { ...regBase, termsAcceptedAt: serverTimestamp(), healthConsent: { status: 'accepted', version: 'v1', acceptedAt: new Date() } }), false);

// ---------- Regresión H-C1: el consentimiento general no toca el específico ----------
await T('ana RETIRA el general y luego lo RENUEVA (flujo H-C1); su healthConsent queda intacto', (async () => {
  const userRef = doc(db('ana'), 'users', 'ana');
  const antes = (await getDoc(userRef)).data().healthConsent;
  await assertSucceeds(setDoc(userRef, { acceptedTerms: false, approved: false, consentWithdrawnAt: serverTimestamp() }, { merge: true }));
  await assertSucceeds(setDoc(userRef, { acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp() }, { merge: true }));
  const despues = (await getDoc(userRef)).data().healthConsent;
  if (JSON.stringify(antes) !== JSON.stringify(despues)) throw new Error('healthConsent cambió');
})(), true);
await T('P4 ESCALADA: cliente NO aprobado intenta autoaprobarse, hacerse propietario y cambiar su rol (3 subcomprobaciones)', (async () => {
  let fallos = 0;
  const sub = async (nombre, promesa) => {
    try { await assertFails(promesa); console.log('  · ' + nombre + ': DENEGADO'); }
    catch (e) { fallos++; console.log('  · ' + nombre + ': NO DENEGADO (FALLO)'); }
  };
  await sub('P4a approved false→true', setDoc(doc(db('pendiente'), 'users', 'pendiente'), { approved: true }, { merge: true }));
  await sub('P4b isOwner false→true', setDoc(doc(db('pendiente'), 'users', 'pendiente'), { isOwner: true }, { merge: true }));
  await sub('P4c role user→owner', setDoc(doc(db('pendiente'), 'users', 'pendiente'), { role: 'owner' }, { merge: true }));
  if (fallos) throw new Error('P4: ' + fallos + ' subcomprobaciones no denegadas');
  const estado = (await getDoc(doc(db('dueno'), 'users', 'pendiente'))).data();
  if (estado.approved !== false || estado.isOwner !== false || estado.role !== 'user') throw new Error('P4: el estado de pendiente cambió');
})(), true);

// ---------- Caso integral 33: ciclo completo de la Opción II ----------
// Registro bajo reglas -> otorgar -> declarar -> entrenador lee ->
// retirar + bloquear -> entrenador denegado -> anterior conservada
// bloqueada -> renovar (historial conservado) -> anterior NO se
// reactiva -> declaración nueva -> entrenador lee SOLO la nueva.
await T('CASO INTEGRAL: ciclo completo (retirar → bloqueo → renovar → declaración nueva sin reactivar la anterior)', (async () => {
  const U = 'lucia';
  const userRef = doc(db(U), 'users', U);
  const declRef = id => doc(db(U), 'users/lucia/healthDeclarations', id);
  const declOwner = id => doc(db('dueno'), 'users/lucia/healthDeclarations', id);
  await assertSucceeds(setDoc(userRef, { name: 'Lucía', role: 'user', isOwner: false, approved: false,
    acceptedTerms: true, termsAcceptedAt: serverTimestamp(), adultConfirmed: true }));
  await assertSucceeds(setDoc(userRef, { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp() } }, { merge: true }));
  await assertSucceeds(setDoc(declRef('v1'), { version: 1, conditions: ['Diabetes'], details: 'Inicial', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }));
  await assertSucceeds(getDoc(declOwner('v1'))); // el entrenador la consulta con consentimiento activo
  const cur1 = (await getDoc(userRef)).data().healthConsent;
  await assertSucceeds(setDoc(userRef, { healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', acceptedAt: cur1.acceptedAt, withdrawnAt: serverTimestamp() } }, { merge: true }));
  await assertSucceeds(updateDoc(declRef('v1'), { state: 'blocked', blockedAt: serverTimestamp() }));
  await assertFails(getDoc(declOwner('v1'))); // el entrenador pierde el acceso ordinario
  const conservada = await assertSucceeds(getDoc(declRef('v1'))); // la anterior se conserva, bloqueada
  if (conservada.data().state !== 'blocked') throw new Error('la declaración anterior no quedó bloqueada');
  const cur2 = (await getDoc(userRef)).data().healthConsent;
  await assertSucceeds(setDoc(userRef, { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp(), withdrawnAt: cur2.withdrawnAt } }, { merge: true }));
  await assertFails(getDoc(declOwner('v1'))); // renovar NO reactiva la anterior
  await assertSucceeds(setDoc(declRef('v2'), { version: 2, conditions: [], details: 'Nueva etapa', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }));
  await assertSucceeds(getDoc(declOwner('v2'))); // el entrenador consulta la nueva vigente
  await assertFails(getDoc(declOwner('v1'))); // la histórica sigue bloqueada para él
})(), true);

console.log(`\nRESULTADO BATERÍA CUESTIONARIO v1: ${pass} PASS · ${fail} FAIL` + (fails.length ? ' · fallos: ' + fails.join(' | ') : ''));
await env.cleanup();
process.exit(fail ? 1 : 0);
