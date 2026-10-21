// ============================================================
// RONBO NUTRI — Batería oficial de reglas: CANDIDATO F-A1 v2
// (Etapa 2, 2026-10-20). Contiene:
//  (a) REGRESIÓN r4 ÍNTEGRA: los 70 casos oficiales de r4 SIN
//      MODIFICAR (35 de r2 en su forma acoplada A2 + 27 casos R
//      + 8 casos N de r4), ejecutados contra el texto r4 +
//      bloque F-A1. Solo cambian, respecto del archivo oficial
//      de r4: este encabezado, el archivo de reglas, el
//      proyecto ficticio y la línea de resultado (la misma
//      disciplina que r4 aplicó sobre r3). Esto ES el caso R13.
//  (b) BLOQUE F-A1: casos R1–R12 y R14 del diseño aprobado
//      (Etapa 1 §3a) + casos S1–S8 de la señal «dato aportado:
//      sí/no» (decisión de Ronald, 2026-10-20 01:49).
// Proyecto ficticio demo-fa1. TODOS los casos cuentan:
// cualquier FAIL => exit 1.
// ============================================================
// PAQUETE HALLAZGO C (2026-10-21): esta batería = la oficial
// del candidato F-A1 v2 (110 casos: regresión r4 íntegra 70 =
// R13 + bloque F-A1 R1–R14 + señal S1–S8) SIN MODIFICAR ni un
// caso, MÁS el bloque HALLAZGO C (HC1–HC9, 10 casos) añadido
// al final, contra el CANDIDATO HALLAZGO C (base = texto vivo
// verificado 2026-10-21, ruleset cfe28b3f; único cambio: el
// get de nutrition_progress). Proyecto ficticio
// demo-hallazgo-c. Total: 120 casos. Las únicas diferencias
// mecánicas respecto del archivo oficial F-A1: este párrafo,
// el nombre del archivo de reglas, el proyecto ficticio, el
// bloque HC con su SUBTOTAL y la línea DESGLOSE (gana el
// tercer segmento; la línea RESULTADO suma los 120).
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp, query, where, writeBatch } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.candidato-hallazgo-c-2026-10-21.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-hallazgo-c', firestore: { rules, host: '127.0.0.1', port: 8799 } });

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


// ============================================================
// BLOQUE F-A1 (Etapa 2) — energyPrivate, assessment y la señal
// «dato aportado: sí/no». (El caso R13 ES la regresión r4 de
// arriba: 70 casos íntegros contra el candidato completo.)
// ============================================================
const r4pass = pass, r4fail = fail;
console.log(`\nSUBTOTAL REGRESIÓN r4 (= R13): ${r4pass} PASS · ${r4fail} FAIL`);

const seedFa = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v3-2026-10-16', consentSeq: 10 };
  for (const u of ['fa1', 'fa2', 'fa3', 'fa4', 'fa5', 'fa6', 'fa7', 'fa8']) {
    await setDoc(doc(d, 'users', u), { ...base, name: u, consentReceiptId: u + '_10' });
  }
});
await seedFa;

const ep = (uid, ctxUid) => doc(db(ctxUid), 'users/' + uid + '/energyPrivate', 'sex');
const asmt = (uid, ctxUid, id) => doc(db(ctxUid), 'users/' + uid + '/assessment', id || 'current');
const PV = 'v1-2026-10-20';

// ---------- R4 (escritura del dato privado) y R1–R3, R5 ----------
await T('FA-R4a · la cliente escribe su sexForCalc válido (updatedAt == hora del servidor) → PERMITIDO',
  setDoc(ep('fa1', 'fa1'), { sexForCalc: 'female', purposeVersion: PV, providedAt: serverTimestamp(), updatedAt: serverTimestamp() }), true);
await T('FA-R4b · sexForCalc con updatedAt LITERAL → DENEGADO',
  setDoc(ep('fa2', 'fa2'), { sexForCalc: 'male', purposeVersion: PV, providedAt: serverTimestamp(), updatedAt: new Date('2026-10-20T00:00:00Z') }), false);
await T('FA-R4c · sexForCalc fuera de la lista (valor «otro») → DENEGADO',
  setDoc(ep('fa2', 'fa2'), { sexForCalc: 'otro', purposeVersion: PV, providedAt: serverTimestamp(), updatedAt: serverTimestamp() }), false);
await T('FA-R4d · energyPrivate con CAMPO EXTRA → DENEGADO',
  setDoc(ep('fa2', 'fa2'), { sexForCalc: 'male', purposeVersion: PV, providedAt: serverTimestamp(), updatedAt: serverTimestamp(), nota: 'x' }), false);
await T('FA-R1 · la cliente lee SU energyPrivate → PERMITIDO', getDoc(ep('fa1', 'fa1')), true);
await T('FA-R2 · el ENTRENADOR lee energyPrivate ajena → DENEGADO', getDoc(ep('fa1', 'dueno')), false);
await T('FA-R3 · OTRA cliente lee energyPrivate ajena → DENEGADO', getDoc(ep('fa1', 'fa2')), false);

// ---------- R6–R9 (creación y palBasal por el entrenador) ----------
await T('FA-R6 · el entrenador crea assessment/current SIN equation (nace ausente, N-01) → PERMITIDO',
  setDoc(asmt('fa1', 'dueno'), { birthYear: 1996, heightCm: 175, activityCategoryId: 3, palBasal: 1.55, updatedAt: serverTimestamp(), updatedBy: 'dueno' }), true);
await T('FA-R6b · la cliente lee SU assessment/current → PERMITIDO', getDoc(asmt('fa1', 'fa1')), true);
await T('FA-R7 · el entrenador crea con equation=«ten-haaf» (bloqueada) → DENEGADO',
  setDoc(asmt('fa7', 'dueno'), { equation: 'ten-haaf', updatedAt: serverTimestamp(), updatedBy: 'dueno' }), false);
await T('FA-R8 · la CLIENTE crea su assessment/current → DENEGADO',
  setDoc(asmt('fa8', 'fa8'), { birthYear: 1990, updatedAt: serverTimestamp(), updatedBy: 'fa8' }), false);
await T('FA-R9a · palBasal 1.35 SIN confirmación (creación) → DENEGADO',
  setDoc(asmt('fa3', 'dueno'), { palBasal: 1.35, updatedAt: serverTimestamp(), updatedBy: 'dueno' }), false);
await T('FA-R9b · palBasal 1.35 CON confirmación expresa (creación) → PERMITIDO',
  setDoc(asmt('fa4', 'dueno'), { palBasal: 1.35, palExceptionConfirmed: true, updatedAt: serverTimestamp(), updatedBy: 'dueno' }), true);
await T('FA-R9c · palBasal 1.19 (creación, aun con confirmación) → DENEGADO SIEMPRE',
  setDoc(asmt('fa5', 'dueno'), { palBasal: 1.19, palExceptionConfirmed: true, updatedAt: serverTimestamp(), updatedBy: 'dueno' }), false);
await T('FA-R9d · palBasal 2.01 (creación) → DENEGADO',
  setDoc(asmt('fa6', 'dueno'), { palBasal: 2.01, updatedAt: serverTimestamp(), updatedBy: 'dueno' }), false);
await T('FA-R9e · palBasal 1.19 por UPDATE del entrenador → DENEGADO (A-3 también en update)',
  updateDoc(asmt('fa4', 'dueno'), { palBasal: 1.19 }), false);
await T('FA-R9f · palBasal 1.35 por UPDATE sin confirmación → DENEGADO',
  updateDoc(asmt('fa1', 'dueno'), { palBasal: 1.35 }), false);
await T('FA-R9g · palBasal 1.35 por UPDATE CON confirmación en el mismo acto → PERMITIDO',
  updateDoc(asmt('fa1', 'dueno'), { palBasal: 1.35, palExceptionConfirmed: true }), true);

// ---------- Señal «dato aportado: sí/no» (S1–S8) ----------
await T('FA-S1 · la cliente escribe SOLO el booleano sexDataProvided=true → PERMITIDO',
  updateDoc(asmt('fa1', 'fa1'), { sexDataProvided: true }), true);
await T('FA-S2 · el entrenador LEE assessment/current y ve el booleano (sin ver jamás el valor) → PERMITIDO', (async () => {
  const s = await getDoc(asmt('fa1', 'dueno'));
  if (!s.exists() || s.data().sexDataProvided !== true) throw new Error('el booleano no es visible para el entrenador');
  if ('sexForCalc' in s.data()) throw new Error('el documento del entrenador contiene sexForCalc');
})(), true);
await T('FA-S3 · sexDataProvided con valor NO booleano («si») → DENEGADO',
  updateDoc(asmt('fa1', 'fa1'), { sexDataProvided: 'si' }), false);
await T('FA-S4 · OTRA cliente escribe el booleano ajeno → DENEGADO',
  updateDoc(asmt('fa1', 'fa2'), { sexDataProvided: true }), false);
await T('FA-S5 · el ENTRENADOR intenta escribir el booleano → DENEGADO (la señal es solo del cliente)',
  updateDoc(asmt('fa1', 'dueno'), { sexDataProvided: false }), false);
await T('FA-S6 · la cliente escribe booleano + bloque de resultado EN EL MISMO acto → PERMITIDO',
  updateDoc(asmt('fa1', 'fa1'), { sexDataProvided: true, rmrKcal: 1648.75, tdeeKcal: 2555.56, equationUsed: 'mifflin-st-jeor', equationVersion: 'mifflin-st-jeor@1.0', inputsSnapshot: { weightKg: 70, weightDate: '2026-10-12', heightCm: 175, ageYears: 30, palBasal: 1.55 }, sexConstantApplied: true, uncertaintyNote: 'La incertidumbre es propia del método de estimación; no es una garantía individual.', computedAt: serverTimestamp(), computedBy: 'fa1' }), true);
await T('FA-S7 · la cliente APAGA la señal (sexDataProvided=false, p. ej. al retirar el dato) → PERMITIDO',
  updateDoc(asmt('fa1', 'fa1'), { sexDataProvided: false }), true);
await T('FA-S8 · con la señal activa, el entrenador SIGUE sin poder leer energyPrivate → DENEGADO',
  getDoc(ep('fa1', 'dueno')), false);

// ---------- R10 (bloque de resultado del cliente) ----------
await T('FA-R10a · la sesión del cliente escribe SOLO el bloque de resultado → PERMITIDO',
  updateDoc(asmt('fa1', 'fa1'), { rmrKcal: 1648.75, tdeeKcal: 2555.56, equationUsed: 'mifflin-st-jeor', equationVersion: 'mifflin-st-jeor@1.0', inputsSnapshot: { weightKg: 70, weightDate: '2026-10-12', heightCm: 175, ageYears: 30, palBasal: 1.55 }, sexConstantApplied: true, uncertaintyNote: 'La incertidumbre es propia del método de estimación; no es una garantía individual.', computedAt: serverTimestamp(), computedBy: 'fa1' }), true);
await T('FA-R10b · la cliente intenta tocar la ELECCIÓN de ecuación → DENEGADO',
  updateDoc(asmt('fa1', 'fa1'), { equation: 'mifflin-st-jeor' }), false);
await T('FA-R10c · la cliente intenta tocar palBasal → DENEGADO',
  updateDoc(asmt('fa1', 'fa1'), { palBasal: 1.9 }), false);
await T('FA-R10d · resultado con computedAt LITERAL → DENEGADO',
  updateDoc(asmt('fa1', 'fa1'), { rmrKcal: 1600, equationUsed: 'mifflin-st-jeor', computedAt: new Date('2026-10-20T00:00:00Z'), computedBy: 'fa1' }), false);

// ---------- R11 (sexForCalc jamás vive en assessment) ----------
await T('FA-R11a · crear assessment con clave sexForCalc → DENEGADO',
  setDoc(asmt('fa7', 'dueno'), { birthYear: 1990, sexForCalc: 'female', updatedAt: serverTimestamp(), updatedBy: 'dueno' }), false);
await T('FA-R11b · resultado con sexForCalc ANIDADO en inputsSnapshot → DENEGADO',
  updateDoc(asmt('fa1', 'fa1'), { rmrKcal: 1648.75, equationUsed: 'mifflin-st-jeor', inputsSnapshot: { sexForCalc: 'female', weightKg: 70 }, computedAt: serverTimestamp(), computedBy: 'fa1' }), false);

// ---------- R12 (historial inmutable y terceros) ----------
await T('FA-R12a · la cliente crea un snapshot hist_* → PERMITIDO',
  setDoc(asmt('fa1', 'fa1', 'hist_20261020'), { rmrKcal: 1648.75, tdeeKcal: 2555.56, equationUsed: 'mifflin-st-jeor', equationVersion: 'mifflin-st-jeor@1.0', inputsSnapshot: { weightKg: 70, weightDate: '2026-10-12', heightCm: 175, ageYears: 30, palBasal: 1.55 }, sexConstantApplied: true, uncertaintyNote: 'La incertidumbre es propia del método de estimación; no es una garantía individual.', computedAt: serverTimestamp(), computedBy: 'fa1' }), true);
await T('FA-R12b · ACTUALIZAR un snapshot hist_* → DENEGADO (inmutable)',
  updateDoc(asmt('fa1', 'fa1', 'hist_20261020'), { rmrKcal: 1 }), false);
await T('FA-R12c · UPDATE de current por un TERCER usuario → DENEGADO',
  updateDoc(asmt('fa1', 'fa2'), { palNote: 'x' }), false);

// ---------- R5 (borrado del dato privado) ----------
await T('FA-R5a · el ENTRENADOR borra energyPrivate ajena → DENEGADO', deleteDoc(ep('fa1', 'dueno')), false);
await T('FA-R5b · la cliente BORRA su energyPrivate (derecho de supresión) → PERMITIDO', deleteDoc(ep('fa1', 'fa1')), true);

// ---------- R14 (deny-by-default intacto) ----------
await T('FA-R14a · leer una subcolección DESCONOCIDA (users/{uid}/otraCosa) → DENEGADO',
  getDoc(doc(db('fa1'), 'users/fa1/otraCosa', 'x')), false);
await T('FA-R14b · crear en una subcolección DESCONOCIDA → DENEGADO',
  setDoc(doc(db('fa1'), 'users/fa1/otraCosa', 'x'), { a: 1 }), false);
await T('FA-R14c · ni el ENTRENADOR lee la subcolección desconocida → DENEGADO',
  getDoc(doc(db('dueno'), 'users/fa1/otraCosa', 'x')), false);


// ============================================================
// BLOQUE HALLAZGO C (2026-10-21) — get de documentos
// INEXISTENTES en nutrition_progress. Fixtures: dos fotos de
// progreso EXISTENTES (ana y carol). NINGÚN usuario tiene
// pendconfig/pendstate (no se siembran a propósito): ese es
// exactamente el escenario del diagnóstico en producción.
// CORRECCIÓN (2026-10-21, tras la CI run 39636010660: 116 PASS ·
// 4 FAIL): la protagonista aprobada de este bloque es la usuaria
// FRESCA «hcu», sembrada aquí aprobada y sin historial. La
// primera versión usaba a «ana», pero la regresión heredada la
// deja approved:false (su caso de retirada del general, línea
// ~140, fija approved:false y la renovación no lo restaura —
// fiel a la app: la reaprobación es del entrenador). Con «ana»
// contaminada, HC1/HC2/HC5/HC9a denegaban por isApprovedUser y
// NO por el candidato: el fallo era de la batería, no de las
// reglas. Los 110 casos heredados quedan intactos.
// ============================================================
const hcPass0 = pass, hcFail0 = fail;
const seedHc = env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'users', 'hcu'), { role: 'user', isOwner: false, approved: true, acceptedTerms: true, adultConfirmed: true, termsVersion: 'v3-2026-10-16', consentSeq: 10, name: 'HCU', consentReceiptId: 'hcu_10' });
  await setDoc(doc(d, 'nutrition_progress', 'hcu_2026-10-21_front'), { uid: 'hcu', ownerUid: 'hcu', date: '2026-10-21', slot: 'front' });
  await setDoc(doc(d, 'nutrition_progress', 'ana_2026-10-21_front'), { uid: 'ana', ownerUid: 'ana', date: '2026-10-21', slot: 'front' });
  await setDoc(doc(d, 'nutrition_progress', 'carol_2026-10-21_front'), { uid: 'carol', ownerUid: 'carol', date: '2026-10-21', slot: 'front' });
});
await seedHc;

const prog = (ctxUid, id) => doc(db(ctxUid), 'nutrition_progress', id);

await T('HC1 · aprobada no propietaria: GET de su {uid}_pendconfig INEXISTENTE → PERMITIDO (responde «no existe»; el panel muestra la activación)', getDoc(prog('hcu', 'hcu_pendconfig')), true);
await T('HC2 · aprobada no propietaria: GET de su {uid}_pendstate INEXISTENTE → PERMITIDO', getDoc(prog('hcu', 'hcu_pendstate')), true);
await T('HC3 · aprobada: GET de documento INEXISTENTE con prefijo de OTRO uid → DENEGADO', getDoc(prog('hcu', 'carol_pendconfig')), false);
await T('HC4 · aprobada: GET de documento EXISTENTE ajeno en nutrition_progress → DENEGADO (manda ownerUid, sin cambio)', getDoc(prog('hcu', 'carol_2026-10-21_front')), false);
await T('HC5 · aprobada: GET de su documento EXISTENTE → PERMITIDO (sin cambio)', getDoc(prog('hcu', 'hcu_2026-10-21_front')), true);
await T('HC6 · SIN SESIÓN: GET de documento inexistente → DENEGADO', getDoc(prog(null, 'hcu_pendconfig')), false);
await T('HC7 · autenticada NO aprobada: GET de su «propio» inexistente → DENEGADO (la puerta es isApprovedUser)', getDoc(prog('pendiente', 'pendiente_pendconfig')), false);
await T('HC8 · PROPIETARIO: GET de su documento inexistente → PERMITIDO (sin cambio, primer disyuntivo)', getDoc(prog('dueno', 'dueno_pendconfig')), true);
await T('HC9a · LIST sin cambios: la aprobada lista nutrition_progress filtrando por SU ownerUid → PERMITIDO', getDocs(query(collection(db('hcu'), 'nutrition_progress'), where('ownerUid', '==', 'hcu'))), true);
await T('HC9b · LIST sin cambios: la aprobada lista filtrando por ownerUid AJENO → DENEGADO', getDocs(query(collection(db('hcu'), 'nutrition_progress'), where('ownerUid', '==', 'carol'))), false);

console.log(`\nSUBTOTAL HALLAZGO C: ${pass - hcPass0} PASS · ${fail - hcFail0} FAIL`);

console.log(`\nRESULTADO BATERÍA HALLAZGO C (110 regresión + 10 HC): ${pass} PASS · ${fail} FAIL` + (fails.length ? ' · fallos: ' + fails.join(' | ') : ''));
console.log(`DESGLOSE: regresión r4 (R13) ${r4pass} PASS · ${r4fail} FAIL | bloque F-A1+señal ${hcPass0 - r4pass} PASS · ${hcFail0 - r4fail} FAIL | bloque Hallazgo C ${pass - hcPass0} PASS · ${fail - hcFail0} FAIL`);
await env.cleanup();
process.exit(fail ? 1 : 0);
