// ============================================================
// RONBO NUTRI — Batería oficial de reglas: CANDIDATO r4
// Regresión íntegra de los 62 casos validados para r3 (los 35
// de r2 en su forma acoplada A2 + 27 casos R de recibos,
// cierre de cuenta y recuperación), SIN MODIFICAR, + 8 casos
// nuevos N63–N70: la renovación del consentimiento general
// con el consentimiento ACTIVO (acceptedTerms true→true,
// p. ej. v2→v3), imposible contra r3. Proyecto ficticio
// demo-recibos-r4. TODOS los casos cuentan: cualquier FAIL
// => exit 1. r4 NO se declara validado sin corrida oficial.
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp, query, where, writeBatch } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.propuesta-r4', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-recibos-r4', firestore: { rules, host: '127.0.0.1', port: 8799 } });

let pass = 0, fail = 0; const fails = [];
async function T(nombre, promesa, debePasar) {
  try { if (debePasar) await assertSucceeds(promesa); else await assertFails(promesa); pass++; console.log('PASS · ' + nombre); }
  catch (e) { fail++; fails.push(nombre); console.log('FAIL · ' + nombre + ' — ' + String(e).split('\n')[0].slice(0, 140)); }
}
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

// ---------- Fixtures (sin reglas) ----------
const seed = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v2-2026-10-14', consentSeq: 10 };
  await setDoc(doc(d, 'users', 'dueno'), { ...base, isOwner: true, name: 'Dueño' });
  await setDoc(doc(d, 'users', 'ana'), { ...base, name: 'Ana', consentReceiptId: 'ana_10',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-16T10:00:00Z') } });
  await setDoc(doc(d, 'users/ana/healthDeclarations', 'v2'), { version: 2, conditions: ['Diabetes'], details: 'Metformina', state: 'active', declaredAt: new Date('2026-10-16T10:01:00Z'), updatedAt: new Date('2026-10-16T10:01:00Z'), blockedAt: null });
  await setDoc(doc(d, 'users/ana/healthDeclarations', 'v1'), { version: 1, conditions: ['Asma / problemas respiratorios'], details: '', state: 'blocked', declaredAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'), blockedAt: new Date('2026-10-05T10:00:00Z') });
  await setDoc(doc(d, 'users', 'dora'), { ...base, name: 'Dora', consentReceiptId: 'dora_10',
    healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-01T10:00:00Z'), withdrawnAt: new Date('2026-10-05T10:00:00Z') } });
  await setDoc(doc(d, 'users/dora/healthDeclarations', 'v1'), { version: 1, conditions: [], details: 'x', state: 'blocked', declaredAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'), blockedAt: new Date('2026-10-05T10:00:00Z') });
  await setDoc(doc(d, 'users', 'carol'), { ...base, name: 'Carol', consentReceiptId: 'carol_10' });
  await setDoc(doc(d, 'users', 'elena'), { ...base, name: 'Elena', consentReceiptId: 'elena_10' });
  await setDoc(doc(d, 'users', 'sofia'), { ...base, name: 'Sofía', consentReceiptId: 'sofia_10',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-16T10:00:00Z') } });
  await setDoc(doc(d, 'users', 'pendiente'), { ...base, name: 'Pendiente', approved: false, consentReceiptId: 'pendiente_10' });
});
await seed;

const decl = (uid, id) => doc(db(uid), 'users/' + uid + '/healthDeclarations', id);
const declAnon = id => doc(db(null), 'users/ana/healthDeclarations', id);

// ---------- Ayudantes A2: escrituras acopladas (transición + recibo) ----------
const VB = 'v2-2026-10-14', VS = 'v1-2026-10-16', V3 = 'v3-2026-10-16';
const recDoc = (uid, type, version, extra) => ({ uid, email: uid + '@pruebas.ronbo.store', type, version, at: serverTimestamp(), ...(extra || {}) });
function batchUser(uid, cambios, seq, type, version, extra) {
  const d = db(uid); const b = writeBatch(d);
  b.set(doc(d, 'users', uid), { ...cambios, consentSeq: seq, consentReceiptId: uid + '_' + seq }, { merge: true });
  b.set(doc(d, 'consent_receipts', uid + '_' + seq), recDoc(uid, type, version, extra));
  return b.commit();
}
function batchUserUpdate(uid, cambios, seq, type, version, extra) {
  const d = db(uid); const b = writeBatch(d);
  b.update(doc(d, 'users', uid), { ...cambios, consentSeq: seq, consentReceiptId: uid + '_' + seq });
  b.set(doc(d, 'consent_receipts', uid + '_' + seq), recDoc(uid, type, version, extra));
  return b.commit();
}
function regCoupled(uid, extraUser) {
  const d = db(uid); const b = writeBatch(d);
  b.set(doc(d, 'users', uid), { isOwner: false, approved: false, role: 'user', acceptedTerms: true, adultConfirmed: true, termsVersion: VB, termsAcceptedAt: serverTimestamp(), consentSeq: 1, consentReceiptId: uid + '_1', ...(extraUser || {}) });
  b.set(doc(d, 'consent_receipts', uid + '_1'), recDoc(uid, 'registered', VB));
  return b.commit();
}

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
await T('elena otorga su consentimiento específico (serverTimestamp)', batchUser('elena', { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp() } }, 11, 'specific-granted', 'v1-2026-10-16'), true);
await T('elena crea su declaración v1 con consentimiento activo', setDoc(doc(db('elena'), 'users/elena/healthDeclarations', 'v1'), { version: 1, conditions: [], details: '', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }), true);
await T('elena intenta retirar ELIMINANDO acceptedAt (mapa sustituido, sin merge) → denegado', batchUserUpdate('elena', { healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', withdrawnAt: serverTimestamp() } }, 12, 'specific-withdrawn', 'v1-2026-10-16'), false); // P1/S4: updateDoc sustituye el mapa: el documento resultante pierde acceptedAt y la sentencia lo deniega
await T('sofia retira su específico CORRECTAMENTE (fixture independiente, acceptedAt conservado, como la app)', (async () => {
  const cur = (await getDoc(doc(db('sofia'), 'users', 'sofia'))).data().healthConsent;
  await batchUser('sofia', { healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', acceptedAt: cur.acceptedAt, withdrawnAt: serverTimestamp() } }, 11, 'specific-withdrawn', 'v1-2026-10-16');
})(), true);
await T('dora intenta crear declaración con consentimiento RETIRADO → denegado', setDoc(doc(db('dora'), 'users/dora/healthDeclarations', 'v2'), { version: 2, conditions: [], details: '', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }), false);
await T('ana otorga su específico con fecha literal 2030 → denegado (B1)', batchUser('ana', { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2030-01-01') } }, 11, 'specific-granted', 'v1-2026-10-16'), false);
await T('ana borra su propia declaración bloqueada (su derecho)', deleteDoc(decl('ana', 'v1')), true);

// ---------- Registro endurecido ----------
const regBase = { isOwner: false, approved: false, role: 'user', acceptedTerms: true, adultConfirmed: true };
await T('registro limpio (sin salud) → permitido', regCoupled('nuevo1'), true);
await T('registro con campo health → denegado', setDoc(doc(db('nuevo2'), 'users', 'nuevo2'), { ...regBase, termsAcceptedAt: serverTimestamp(), health: { conditions: [] } }), false);
await T('registro con healthConsent prehorneado → denegado', setDoc(doc(db('nuevo3'), 'users', 'nuevo3'), { ...regBase, termsAcceptedAt: serverTimestamp(), healthConsent: { status: 'accepted', version: 'v1', acceptedAt: new Date() } }), false);

// ---------- Regresión H-C1: el consentimiento general no toca el específico ----------
await T('ana RETIRA el general y luego lo RENUEVA (flujo H-C1); su healthConsent queda intacto', (async () => {
  const userRef = doc(db('ana'), 'users', 'ana');
  const antes = (await getDoc(userRef)).data().healthConsent;
  await assertSucceeds(batchUser('ana', { acceptedTerms: false, approved: false, consentWithdrawnAt: serverTimestamp() }, 11, 'general-withdrawn', 'v2-2026-10-14'));
  await assertSucceeds(batchUser('ana', { acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp() }, 12, 'general-renewed', 'v2-2026-10-14'));
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
  await assertSucceeds(regCoupled(U, { name: 'Lucía' }));
  await assertSucceeds(batchUser(U, { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp() } }, 2, 'specific-granted', 'v1-2026-10-16'));
  await assertSucceeds(setDoc(declRef('v1'), { version: 1, conditions: ['Diabetes'], details: 'Inicial', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }));
  await assertSucceeds(getDoc(declOwner('v1'))); // el entrenador la consulta con consentimiento activo
  const cur1 = (await getDoc(userRef)).data().healthConsent;
  await assertSucceeds(batchUser(U, { healthConsent: { status: 'withdrawn', version: 'v1-2026-10-16', acceptedAt: cur1.acceptedAt, withdrawnAt: serverTimestamp() } }, 3, 'specific-withdrawn', 'v1-2026-10-16'));
  await assertSucceeds(updateDoc(declRef('v1'), { state: 'blocked', blockedAt: serverTimestamp() }));
  await assertFails(getDoc(declOwner('v1'))); // el entrenador pierde el acceso ordinario
  const conservada = await assertSucceeds(getDoc(declRef('v1'))); // la anterior se conserva, bloqueada
  if (conservada.data().state !== 'blocked') throw new Error('la declaración anterior no quedó bloqueada');
  const cur2 = (await getDoc(userRef)).data().healthConsent;
  await assertSucceeds(batchUser(U, { healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: serverTimestamp(), withdrawnAt: cur2.withdrawnAt } }, 4, 'specific-renewed', 'v1-2026-10-16'));
  await assertFails(getDoc(declOwner('v1'))); // renovar NO reactiva la anterior
  await assertSucceeds(setDoc(declRef('v2'), { version: 2, conditions: [], details: 'Nueva etapa', state: 'active', declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null }));
  await assertSucceeds(getDoc(declOwner('v2'))); // el entrenador consulta la nueva vigente
  await assertFails(getDoc(declOwner('v1'))); // la histórica sigue bloqueada para él
})(), true);

// ---------- Paso A S7: doble consentimiento (casos 34–35) ----------
const seed2 = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v2-2026-10-14', consentSeq: 10 };
  await setDoc(doc(d, 'users', 'doble'), { ...base, name: 'Doble', consentReceiptId: 'doble_10',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-16T10:00:00Z') } });
  await setDoc(doc(d, 'users/doble/healthDeclarations', 'v1'), { version: 1, conditions: ['Hipertensión'], details: '', state: 'active', declaredAt: new Date('2026-10-16T10:01:00Z'), updatedAt: new Date('2026-10-16T10:01:00Z'), blockedAt: null });
  await setDoc(doc(d, 'users', 'pendiente2'), { ...base, name: 'Pendiente2', approved: false, consentReceiptId: 'pendiente2_10',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-16T10:00:00Z') } });
  await setDoc(doc(d, 'users/pendiente2/healthDeclarations', 'v1'), { version: 1, conditions: [], details: '', state: 'active', declaredAt: new Date('2026-10-16T10:01:00Z'), updatedAt: new Date('2026-10-16T10:01:00Z'), blockedAt: null });
});
await seed2;

await T('CASO 34 · doble consentimiento: retirar el GENERAL deniega get y list del entrenador; renovarlo los restaura sin tocar la declaración', (async () => {
  const ref = doc(db('dueno'), 'users/doble/healthDeclarations', 'v1');
  const lista = query(collection(db('dueno'), 'users/doble/healthDeclarations'), where('state', '==', 'active'));
  const antes = (await getDoc(decl('doble', 'v1'))).data();
  await getDoc(ref);            // lectura inicial permitida
  await getDocs(lista);         // listado inicial permitido
  await batchUser('doble', { acceptedTerms: false, approved: false, consentWithdrawnAt: serverTimestamp() }, 11, 'general-withdrawn', 'v2-2026-10-14'); // retirada SOLO del general (forma de la app, lote acoplado A2)
  let getDenegado = false, listDenegado = false;
  try { await getDoc(ref); } catch { getDenegado = true; }
  try { await getDocs(lista); } catch { listDenegado = true; }
  if (!getDenegado) throw new Error('el get del entrenador NO fue denegado tras retirar el general');
  if (!listDenegado) throw new Error('el list del entrenador NO fue denegado tras retirar el general');
  await batchUser('doble', { acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp() }, 12, 'general-renewed', 'v2-2026-10-14'); // renovación del general (flujo H-C1, lote acoplado A2)
  await getDoc(ref);            // la lectura vuelve a permitirse
  const despues = (await getDoc(decl('doble', 'v1'))).data();
  if (despues.state !== 'active' || JSON.stringify(despues.conditions) !== JSON.stringify(antes.conditions)) throw new Error('la declaración cambió durante el ciclo del general');
})(), true);

await T('CASO 35 · cliente NO aprobado (approved=false) con ambos consentimientos vigentes: el entrenador SÍ lee su declaración (approved no forma parte de la puerta)', getDoc(doc(db('dueno'), 'users/pendiente2/healthDeclarations', 'v1')), true);

// ---------- A2/B2: recibos con integridad bidireccional y cierre ----------
await T('R1 registro SIN recibo → DENEGADO (dirección inversa)', setDoc(doc(db('solo1'), 'users', 'solo1'), { isOwner: false, approved: false, role: 'user', acceptedTerms: true, adultConfirmed: true, termsVersion: VB, termsAcceptedAt: serverTimestamp(), consentSeq: 1, consentReceiptId: 'solo1_1' }), false);
await T('R2 recibo de registro SIN la transición → DENEGADO', setDoc(doc(db('solo2'), 'consent_receipts', 'solo2_1'), recDoc('solo2', 'registered', VB)), false);
await T('R3 registro acoplado de solo3 → permitido', regCoupled('solo3', { name: 'Solo3' }), true);
await T('R4 otorgamiento específico SIN recibo → DENEGADO (dirección inversa)', setDoc(doc(db('solo3'), 'users', 'solo3'), { healthConsent: { status: 'accepted', version: VS, acceptedAt: serverTimestamp() }, consentSeq: 2, consentReceiptId: 'solo3_2' }, { merge: true }), false);
await T('R5 otorgamiento con recibo de TIPO INCORRECTO → DENEGADO', batchUser('solo3', { healthConsent: { status: 'accepted', version: VS, acceptedAt: serverTimestamp() } }, 2, 'specific-withdrawn', VS), false);
await T('R6 otorgamiento acoplado correcto → permitido', batchUser('solo3', { healthConsent: { status: 'accepted', version: VS, acceptedAt: serverTimestamp() } }, 2, 'specific-granted', VS), true);
await T('R7 DUPLICAR el otorgamiento con otro recibo → DENEGADO', batchUser('solo3', { healthConsent: { status: 'accepted', version: VS, acceptedAt: serverTimestamp() } }, 3, 'specific-granted', VS), false);
await T('R8 actualización de perfil SIN recibo → permitida (control)', updateDoc(doc(db('solo3'), 'users', 'solo3'), { name: 'Solo Tres' }), true);
await T('R9 retirada con recibo con CAMPO EXTRA (conditions) → DENEGADO', (async () => { const cur = (await getDoc(doc(db('solo3'), 'users', 'solo3'))).data().healthConsent; return batchUser('solo3', { healthConsent: { status: 'withdrawn', version: VS, acceptedAt: cur.acceptedAt, withdrawnAt: serverTimestamp() } }, 3, 'specific-withdrawn', VS, { conditions: [] }); })(), false);
await T('R10 recibo dirigido a OTRO uid → DENEGADO', (async () => { const cur = (await getDoc(doc(db('solo3'), 'users', 'solo3'))).data().healthConsent; const d = db('solo3'); const b = writeBatch(d); b.set(doc(d, 'users', 'solo3'), { healthConsent: { status: 'withdrawn', version: VS, acceptedAt: cur.acceptedAt, withdrawnAt: serverTimestamp() }, consentSeq: 3, consentReceiptId: 'solo3_3' }, { merge: true }); b.set(doc(d, 'consent_receipts', 'otro_3'), recDoc('otro', 'specific-withdrawn', VS)); return b.commit(); })(), false);
await T('R11 retirada acoplada → permitida', (async () => { const cur = (await getDoc(doc(db('solo3'), 'users', 'solo3'))).data().healthConsent; return batchUser('solo3', { healthConsent: { status: 'withdrawn', version: VS, acceptedAt: cur.acceptedAt, withdrawnAt: serverTimestamp() } }, 3, 'specific-withdrawn', VS); })(), true);
await T('R12 RENOVACIÓN del específico acoplada (specific-renewed) → permitida', (async () => { const cur = (await getDoc(doc(db('solo3'), 'users', 'solo3'))).data().healthConsent; return batchUser('solo3', { healthConsent: { status: 'accepted', version: VS, acceptedAt: serverTimestamp(), withdrawnAt: cur.withdrawnAt } }, 4, 'specific-renewed', VS); })(), true);
await T('R13 recibo con fecha LITERAL (at sin serverTimestamp) → DENEGADO', (async () => { const cur = (await getDoc(doc(db('solo3'), 'users', 'solo3'))).data().healthConsent; const d = db('solo3'); const b = writeBatch(d); b.set(doc(d, 'users', 'solo3'), { healthConsent: { status: 'withdrawn', version: VS, acceptedAt: cur.acceptedAt, withdrawnAt: serverTimestamp() }, consentSeq: 5, consentReceiptId: 'solo3_5' }, { merge: true }); b.set(doc(d, 'consent_receipts', 'solo3_5'), { uid: 'solo3', email: 'solo3@pruebas.ronbo.store', type: 'specific-withdrawn', version: VS, at: new Date() }); return b.commit(); })(), false);
await T('R14 leer recibos AJENOS → DENEGADO', getDoc(doc(db('solo3'), 'consent_receipts', 'ana_11')), false);
await T('R15 el propietario LEE los recibos → permitido', getDoc(doc(db('dueno'), 'consent_receipts', 'solo3_2')), true);
await T('R16 ACTUALIZAR un recibo propio → DENEGADO', updateDoc(doc(db('solo3'), 'consent_receipts', 'solo3_2'), { type: 'general-renewed' }), false);
await T('R17 BORRAR un recibo propio → DENEGADO', deleteDoc(doc(db('solo3'), 'consent_receipts', 'solo3_2')), false);
await T('R18 el propietario CREA un recibo para un cliente → DENEGADO (no falsifica)', setDoc(doc(db('dueno'), 'consent_receipts', 'ana_99'), recDoc('ana', 'general-renewed', VB)), false);
await T('R19 salto de consentSeq (+2) con recibo → DENEGADO', (async () => { const cur = (await getDoc(doc(db('solo3'), 'users', 'solo3'))).data().healthConsent; return batchUser('solo3', { healthConsent: { status: 'withdrawn', version: VS, acceptedAt: cur.acceptedAt, withdrawnAt: serverTimestamp() } }, 6, 'specific-withdrawn', VS); })(), false);
await T('R20 registro acoplado de solo4 → permitido', regCoupled('solo4', { name: 'Solo4' }), true);
await T('R21 documento de cierre SIN borrar la cuenta → DENEGADO', setDoc(doc(db('solo4'), 'consent_receipts', 'solo4'), recDoc('solo4', 'account-closed', VB)), false);
await T('R22 borrar la cuenta SIN documento de cierre → DENEGADO', deleteDoc(doc(db('solo4'), 'users', 'solo4')), false);
await T('R23 borrar la cuenta CON cierre en el mismo lote → permitido', (() => { const d = db('solo4'); const b = writeBatch(d); b.set(doc(d, 'consent_receipts', 'solo4'), recDoc('solo4', 'account-closed', VB)); b.delete(doc(d, 'users', 'solo4')); return b.commit(); })(), true);
await T('R24 tras el borrado, el propietario SIGUE leyendo los recibos → permitido', getDoc(doc(db('dueno'), 'consent_receipts', 'solo4_1')), true);
await T('R25 el propietario PURGA un recibo → permitido', deleteDoc(doc(db('dueno'), 'consent_receipts', 'solo3_2')), true);
await T('R26 registro acoplado de solo5 → permitido', regCoupled('solo5', { name: 'Solo5' }), true);
await T('R27 retirada del GENERAL sin recibo → DENEGADA (dirección inversa)', setDoc(doc(db('solo5'), 'users', 'solo5'), { acceptedTerms: false, approved: false, consentWithdrawnAt: serverTimestamp(), consentSeq: 2, consentReceiptId: 'solo5_2' }, { merge: true }), false);

// ---------- r4: renovación del general con el consentimiento ACTIVO ----------
// Fixture que reproduce el estado verificado en producción el
// 18/10/2026 (documento del propietario): consentimiento general
// ACTIVO con la versión antigua aceptada, retirada antigua
// conservada, consentSeq=1 cuyo recibo _1 es el otorgamiento del
// específico, y approved=false (la renovación no lo toca).
const seed3 = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'users', 'renueva'), { role: 'user', isOwner: false, approved: false, acceptedTerms: true, adultConfirmed: true,
    name: 'Renueva', termsVersion: 'v2-2026-10-14', termsAcceptedAt: new Date('2026-10-16T14:07:30Z'),
    consentWithdrawnAt: new Date('2026-10-15T18:32:48Z'), consentSeq: 1, consentReceiptId: 'renueva_1',
    healthConsent: { status: 'accepted', version: 'v1-2026-10-16', acceptedAt: new Date('2026-10-17T08:00:52Z') } });
  await setDoc(doc(d, 'consent_receipts', 'renueva_1'), { uid: 'renueva', email: 'renueva@pruebas.ronbo.store', type: 'specific-granted', version: 'v1-2026-10-16', at: new Date('2026-10-17T08:00:52Z') });
});
await seed3;

await T('N63 · r4: renovación en ACTIVO con versión antigua (v2→v3) + recibo → PERMITIDA', batchUser('renueva', { acceptedTerms: true, termsVersion: V3, termsAcceptedAt: serverTimestamp() }, 2, 'general-renewed', V3), true);
await T('N64 · r4: renovación en ACTIVO con la MISMA versión (solo avanza termsAcceptedAt) + recibo → PERMITIDA', batchUser('renueva', { acceptedTerms: true, termsVersion: V3, termsAcceptedAt: serverTimestamp() }, 3, 'general-renewed', V3), true);
await T('N65 · r4: renovación en ACTIVO SIN recibo → DENEGADA', setDoc(doc(db('renueva'), 'users', 'renueva'), { acceptedTerms: true, termsVersion: V3, termsAcceptedAt: serverTimestamp(), consentSeq: 4, consentReceiptId: 'renueva_4' }, { merge: true }), false);
await T('N66 · r4: renovación en ACTIVO con consentSeq +2 → DENEGADA', batchUser('renueva', { acceptedTerms: true, termsVersion: V3, termsAcceptedAt: serverTimestamp() }, 5, 'general-renewed', V3), false);
await T('N67 · r4: renovación en ACTIVO tocando un campo extra (approved) → DENEGADA', batchUser('renueva', { acceptedTerms: true, termsVersion: V3, termsAcceptedAt: serverTimestamp(), approved: true }, 4, 'general-renewed', V3), false);
await T('N68 · r4: renovación en ACTIVO con recibo de TIPO distinto (specific-granted) → DENEGADA', batchUser('renueva', { acceptedTerms: true, termsVersion: V3, termsAcceptedAt: serverTimestamp() }, 4, 'specific-granted', VS), false);
await T('N69 · r4: renovación en ACTIVO con termsAcceptedAt LITERAL 2030 → DENEGADA', batchUser('renueva', { acceptedTerms: true, termsVersion: V3, termsAcceptedAt: new Date('2030-01-01') }, 4, 'general-renewed', V3), false);
await T('N70 · r4: recibo general-renewed SIN la actualización de usuario acoplada → DENEGADO', setDoc(doc(db('renueva'), 'consent_receipts', 'renueva_4'), recDoc('renueva', 'general-renewed', V3)), false);

console.log(`\nRESULTADO BATERÍA r4: ${pass} PASS · ${fail} FAIL` + (fails.length ? ' · fallos: ' + fails.join(' | ') : ''));
await env.cleanup();
process.exit(fail ? 1 : 0);
