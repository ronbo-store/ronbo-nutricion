// RONBO NUTRI — Batería CI del paquete «METAS CON FUNDAMENTO»
// (2026-10-26). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción. Banco de reglas: ./firestore.rules = candidato de
// publicación del paquete (texto vivo verificado 0d752923,
// SHA-256 75c2033f…, + SOLO el delta de metas; candidato SHA-256
// dd25a14f…).
//
// Diseño: DISEÑO-METAS-CON-FUNDAMENTO-2026-10-26.md §§C–I.
// Serie A — assessment/current: el alumno escribe SUS datos de
// fundamento (birthYear, heightCm, palBasal, activityCategoryId)
// con validación; la ecuación sigue siendo SOLO del entrenador;
// el bloque de resultado del propio alumno (faComputeMine) y la
// señal sexDataProvided quedan EXACTAMENTE como hoy; la ficha
// puede nacer solo con fundamento si aún no existe.
// Serie G — users/{uid}: el dueño escribe goals, goalsProvenance,
// goalObjective, su SUGERENCIA de ritmo (paceSuggestion solo
// 'pending', banda −500/−750/−1000) y goalsTerms; el entrenador
// ASIGNADO decide el ritmo sin reescribir la sugerencia; approved,
// consentimientos y asignación siguen cerrados para el dueño.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: 8080 }
});

let pass = 0, fail = 0; const failures = [];
async function T(name, promise, shouldSucceed) {
  try {
    if (shouldSucceed) await assertSucceeds(promise); else await assertFails(promise);
    pass++; console.log('PASS — ' + name);
  } catch (e) {
    fail++; failures.push(name);
    console.log('FAIL — ' + name + ' :: ' + String(e && e.message || e).slice(0, 140));
  }
}

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: true };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'trainer1'), { ...base, name: 'Entrenador Uno', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'trainer2'), { ...base, name: 'Entrenador Dos', role: 'entrenador' });
  await setDoc(doc(db, 'users', 'clientA'), { ...base, name: 'Cliente A', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', role: 'usuario', trainerUid: 'trainer2', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  await setDoc(doc(db, 'users', 'clientC'), { ...base, name: 'Cliente C', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  await setDoc(doc(db, 'users', 'clientD'), { ...base, name: 'Cliente D', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  // Fichas de A y B ya creadas por su entrenador (forma viva).
  await setDoc(doc(db, 'users', 'clientA', 'assessment', 'current'),
    { equation: 'mifflin-st-jeor', sexDataProvided: true });
  await setDoc(doc(db, 'users', 'clientB', 'assessment', 'current'),
    { equation: 'mifflin-st-jeor', sexDataProvided: false });
  // clientC y clientD NO tienen ficha: la suya nace del alumno.
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const tr2 = testEnv.authenticatedContext('trainer2').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const C = testEnv.authenticatedContext('clientC').firestore();
const D = testEnv.authenticatedContext('clientD').firestore();
const ASMT = (db, uid) => doc(db, 'users', uid, 'assessment', 'current');
const USR = (db, uid) => doc(db, 'users', uid);
const TS = serverTimestamp();

// ============ A — assessment/current: fundamento del alumno ============
await T('A01 alumno escribe SU birthYear válido (1990) con rastro',
  updateDoc(ASMT(A, 'clientA'), { birthYear: 1990, updatedAt: TS, updatedBy: 'clientA' }), true);
await T('A02 alumno escribe SU heightCm válido (175)',
  updateDoc(ASMT(A, 'clientA'), { heightCm: 175 }), true);
await T('A03 alumno escribe SU palBasal en banda normal (1.55)',
  updateDoc(ASMT(A, 'clientA'), { palBasal: 1.55 }), true);
await T('A04 alumno en banda baja (1.30) SIN confirmación expresa: denegado',
  updateDoc(ASMT(A, 'clientA'), { palBasal: 1.30 }), false);
await T('A05 alumno en banda baja (1.30) CON palExceptionConfirmed: permitido',
  updateDoc(ASMT(A, 'clientA'), { palBasal: 1.30, palExceptionConfirmed: true }), true);
await T('A06 alumno escribe SU activityCategoryId entera (3)',
  updateDoc(ASMT(A, 'clientA'), { activityCategoryId: 3 }), true);
await T('A07 alumno escribe el birthYear de OTRO alumno: denegado',
  updateDoc(ASMT(A, 'clientB'), { birthYear: 1990 }), false);
await T('A08 alumno cambia la ECUACIÓN de su ficha: denegado (solo entrenador)',
  updateDoc(ASMT(A, 'clientA'), { equation: 'ten-haaf' }), false);
await T('A09 alumno con birthYear de menor (2015): denegado',
  updateDoc(ASMT(A, 'clientA'), { birthYear: 2015 }), false);
await T('A10 birthYear 2008 (18 en 2026 sin garantía por año): denegado — la regla exige la mayoría garantizada (año+19 cumplido); la app valida además su 18+',
  updateDoc(ASMT(A, 'clientA'), { birthYear: 2008 }), false);
await T('A11 birthYear 2007 (mayoría garantizada): permitido',
  updateDoc(ASMT(A, 'clientA'), { birthYear: 2007 }), true);
await T('A12 birthYear como texto (\'1990\'): denegado',
  updateDoc(ASMT(A, 'clientA'), { birthYear: '1990' }), false);
await T('A13 heightCm fuera de rango (300): denegado',
  updateDoc(ASMT(A, 'clientA'), { heightCm: 300 }), false);
await T('A14 palBasal fuera de rango (2.50): denegado',
  updateDoc(ASMT(A, 'clientA'), { palBasal: 2.50 }), false);
await T('A15 activityCategoryId fuera de 1–6 (7) o como texto: denegado',
  updateDoc(ASMT(A, 'clientA'), { activityCategoryId: '3' }), false);
await T('A16 el RESULTADO del propio alumno sigue escribiéndose como hoy (faComputeMine)',
  updateDoc(ASMT(A, 'clientA'), {
    rmrKcal: 1500, tdeeKcal: 1950, equationUsed: 'mifflin-st-jeor',
    equationVersion: 'msj-2019', inputsSnapshot: { weightKg: 70, heightCm: 175, ageYears: 36, palBasal: 1.30 },
    sexConstantApplied: true, uncertaintyNote: '±10%', computedAt: TS, computedBy: 'clientA'
  }), true);
await T('A17 la señal sexDataProvided sigue siendo del alumno, como hoy',
  updateDoc(ASMT(A, 'clientA'), { sexDataProvided: true }), true);
await T('A18 alumno intenta colar sexForCalc en la ficha: denegado',
  updateDoc(ASMT(A, 'clientA'), { sexForCalc: 'male' }), false);
await T('A19 alumno SIN ficha la CREA solo con fundamento (sin entrenador previo)',
  setDoc(ASMT(C, 'clientC'), { birthYear: 1985, heightCm: 180, palBasal: 1.60, activityCategoryId: 4 }), true);
await T('A20 alumno sin ficha la crea CON ecuación: denegado',
  setDoc(ASMT(D, 'clientD'), { birthYear: 1992, equation: 'mifflin-st-jeor' }), false);
await T('A21 alumno crea la ficha de OTRO: denegado',
  setDoc(ASMT(C, 'clientD'), { birthYear: 1992, heightCm: 170 }), false);
await T('A22 el entrenador ASIGNADO sigue escribiendo la configuración (faSaveConfig), como hoy',
  updateDoc(ASMT(tr1, 'clientA'), { birthYear: 1991, heightCm: 176, updatedAt: TS, updatedBy: 'trainer1' }), true);
await T('A23 entrenador NO asignado escribe la configuración de clientA: denegado',
  updateDoc(ASMT(tr2, 'clientA'), { birthYear: 1991 }), false);
await T('A24 alumno mezcla fundamento con un campo de resultado SIN su forma (computedAt literal): denegado',
  updateDoc(ASMT(A, 'clientA'), { birthYear: 1990, rmrKcal: 1400 }), false);

// ============ G — users/{uid}: motor de metas ============
await T('G01 el dueño escribe sus goals calculadas (claves cerradas)',
  updateDoc(USR(A, 'clientA'), { goals: { kcal: 2100, prot: 150, carb: 200, azuc: 26, gras: 60 } }), true);
await T('G02 el dueño elige su objetivo (goalObjective)',
  updateDoc(USR(A, 'clientA'), { goalObjective: 'bajar' }), true);
await T('G03 el dueño escribe la procedencia de sus metas (goalsProvenance, mapa)',
  updateDoc(USR(A, 'clientA'), { goalsProvenance: { source: 'computed', basis: 'tdee', engineVersion: 'metas-2026-10-26' } }), true);
await T('G04 el dueño SUGIERE su ritmo: paceSuggestion nace pending, en banda (−750)',
  updateDoc(USR(A, 'clientA'), { paceSuggestion: { paceKcal: -750, suggestedAt: TS, status: 'pending' } }), true);
await T('G05 el dueño toca approved EN LA MISMA escritura que goals: denegado entero',
  updateDoc(USR(A, 'clientA'), { approved: false, goals: { kcal: 2000 } }), false);
await T('G06 el dueño toca su estado de consentimiento: denegado',
  updateDoc(USR(A, 'clientA'), { healthConsent: { status: 'withdrawn' } }), false);
await T('G07 el dueño se reasigna entrenador por la rama de metas: denegado',
  updateDoc(USR(A, 'clientA'), { trainerUid: 'trainer2', goals: { kcal: 2000 } }), false);
await T('G08 el dueño se AUTO-APRUEBA el ritmo (status approved): denegado',
  updateDoc(USR(A, 'clientA'), { paceSuggestion: { paceKcal: -750, suggestedAt: TS, status: 'approved' } }), false);
await T('G09 sugerencia fuera de banda (−300): denegada',
  updateDoc(USR(A, 'clientA'), { paceSuggestion: { paceKcal: -300, suggestedAt: TS, status: 'pending' } }), false);
await T('G10 sugerencia con decisión colada (decidedBy propio): denegada',
  updateDoc(USR(A, 'clientA'), { paceSuggestion: { paceKcal: -500, suggestedAt: TS, status: 'pending', decidedBy: 'clientA', decidedAt: TS } }), false);
await T('G11 goals con una clave fuera de la lista (fibra): denegado',
  updateDoc(USR(A, 'clientA'), { goals: { kcal: 2000, fibra: 10 } }), false);
await T('G12 goals con kcal como texto: denegado',
  updateDoc(USR(A, 'clientA'), { goals: { kcal: '2000' } }), false);
// Decisión del entrenador asignado sobre la sugerencia de G04:
// suggestedAt debe viajar EXACTAMENTE como quedó guardado.
const snapA = await getDoc(USR(tr1, 'clientA'));
const sugA = snapA.data().paceSuggestion;
await T('G13 el entrenador ASIGNADO APRUEBA el ritmo sin tocar la sugerencia',
  updateDoc(USR(tr1, 'clientA'), { paceSuggestion: { paceKcal: sugA.paceKcal, suggestedAt: sugA.suggestedAt, status: 'approved', decidedBy: 'trainer1', decidedAt: TS } }), true);
await T('G14 el dueño vuelve a sugerir (nuevo pending, −500)',
  updateDoc(USR(A, 'clientA'), { paceSuggestion: { paceKcal: -500, suggestedAt: TS, status: 'pending' } }), true);
const snapA2 = await getDoc(USR(tr1, 'clientA'));
const sugA2 = snapA2.data().paceSuggestion;
await T('G15 entrenador NO asignado intenta decidir el ritmo: denegado',
  updateDoc(USR(tr2, 'clientA'), { paceSuggestion: { paceKcal: sugA2.paceKcal, suggestedAt: sugA2.suggestedAt, status: 'approved', decidedBy: 'trainer2', decidedAt: TS } }), false);
await T('G16 el asignado intenta CAMBIAR el paceKcal al decidir: denegado',
  updateDoc(USR(tr1, 'clientA'), { paceSuggestion: { paceKcal: -1000, suggestedAt: sugA2.suggestedAt, status: 'approved', decidedBy: 'trainer1', decidedAt: TS } }), false);
await T('G17 el entrenador ASIGNADO RECHAZA el ritmo (decisión válida)',
  updateDoc(USR(tr1, 'clientA'), { paceSuggestion: { paceKcal: sugA2.paceKcal, suggestedAt: sugA2.suggestedAt, status: 'rejected', decidedBy: 'trainer1', decidedAt: TS } }), true);
await T('G18 decidir SIN sugerencia pendiente (clientB no tiene): denegado',
  updateDoc(USR(tr2, 'clientB'), { paceSuggestion: { paceKcal: -500, suggestedAt: TS, status: 'approved', decidedBy: 'trainer2', decidedAt: TS } }), false);
await T('G19 el dueño acepta las condiciones de la recomendación (goalsTerms con hora del servidor)',
  updateDoc(USR(A, 'clientA'), { goalsTerms: { version: 'metas-2026-10-26', acceptedAt: TS } }), true);
await T('G20 goalsTerms con fecha literal (no servidor): denegado',
  updateDoc(USR(A, 'clientA'), { goalsTerms: { version: 'metas-2026-10-26', acceptedAt: new Date('2030-01-01T00:00:00Z') } }), false);
await T('G21 el PROPIETARIO sigue escribiendo goals de un cliente, como hoy',
  updateDoc(USR(owner, 'clientB'), { goals: { kcal: 1800, prot: 140, carb: 180, azuc: 23, gras: 55 } }), true);

console.log(`METAS CON FUNDAMENTO: ${pass} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
