// RONBO FIT — Batería gemela del delta de reglas «FIBRA FASE 2»
// (AUTH-2026-11-08-303) contra el emulador oficial de Firestore
// (proyecto ficticio ronbo-nutri-test, sin secretos ni datos reales).
// El delta: el mapa `goals` admite la clave `fib` — la meta de fibra
// DERIVADA de la kcal que el motor escribe — en las DOS cláusulas
// que cierran el mapa (la del dueño y la del entrenador asignado al
// aplicar una propuesta aprobada), con el mismo saneado numérico
// de las demás claves (> 0, <= 20000).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas cc0cfae7 + delta).
//   ESPERA_NUEVO=false → VIVAS cc0cfae7 (AUTH-2026-11-08-298): la
//                        escritura con fib se DENIEGA (hasOnly) y
//                        el resto se comporta idéntico.
// La decisión del entrenador espeja la escritura REAL de la app
// (goalsTrainerDecideProposal): reparte la propuesta RELEÍDA del
// documento, firma decidedBy/decidedAt y escribe la procedencia
// con su changeLog; al aprobar un kind 'goal', goals = el mapa
// vigente con el parámetro aplicado. Cada caso corre sobre una
// alumna FRESCA (semilla idéntica) y los fallos registran el error
// crudo para diagnóstico.
// Salida: fallos.txt solo si hay fallos.
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const N = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
async function caso(nombre, promesa, debePasar) {
  try {
    if (debePasar) await assertSucceeds(promesa);
    else await assertFails(promesa);
    console.log(`OK    ${nombre} → ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
  } catch (e) {
    const crudo = String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 220);
    fallos.push(`${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'} — ${crudo}`);
    console.log(`FALLO ${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'} — ${crudo}`);
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', ALU = 'alumnaS', ENT = 'entrenadorE', OTRA = 'alumnaT';
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, updateDoc, serverTimestamp, Timestamp } = F;

const METAS5 = { kcal: 1915, prot: 179, carb: 204, azuc: 24, gras: 43 };
const METAS6 = { ...METAS5, fib: 27 };
const SEMILLA = { kcal: 1800, prot: 170, carb: 190, azuc: 23, gras: 40 };
const PROP_TS = Timestamp.fromDate(new Date('2026-11-08T12:00:00Z'));
const propuesta = () => ({ kind: 'goal', param: 'kcal', date: null, foundedValue: 1915, chosenValue: 1915, warningKey: 'gm.warn.kcal', status: 'pending', proposedAt: PROP_TS, decidedBy: null, decidedAt: null });
const alumnaBase = (uid) => ({
  name: 'Alumna ' + uid, role: 'usuario', approved: true, isOwner: false,
  trainerUid: ENT, assignmentStatus: 'assigned', consentSeq: 4, termsVersion: 'v4-2026-10-24',
  goals: { ...SEMILLA },
  goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [] },
  goalsProposal: propuesta(),
});

const FRESCAS = ['aluM1', 'aluM2', 'aluM3', 'aluM4', 'aluM5', 'aluM6'];
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: false, isOwner: true });
  await setDoc(doc(db, 'users', ALU), alumnaBase(ALU));
  for (const u of FRESCAS) await setDoc(doc(db, 'users', u), alumnaBase(u));
  await setDoc(doc(db, 'users', ENT), { name: 'Entrenador', role: 'entrenador', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', OTRA), { name: 'Otra', role: 'usuario', approved: true, isOwner: false });
});

const dbS = testEnv.authenticatedContext(ALU).firestore();
const dbE = testEnv.authenticatedContext(ENT).firestore();
const dbT = testEnv.authenticatedContext(OTRA).firestore();

/* — cláusula del dueño (la escritura del motor) — */
await caso('dueña escribe metas CON fib válida (27) + procedencia', updateDoc(doc(dbS, 'users', ALU), { goals: METAS6, goalsProvenance: { engine: 'metas-v3-2026-10-26' } }), N);
await caso('dueña escribe metas SIN fib (las 5 de siempre)', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5 }), true);
await caso('dueña escribe fib = 0', updateDoc(doc(dbS, 'users', ALU), { goals: { ...METAS5, fib: 0 } }), false);
await caso('dueña escribe fib como texto', updateDoc(doc(dbS, 'users', ALU), { goals: { ...METAS5, fib: '27' } }), false);
await caso('dueña escribe fib = 20001 (sobre el tope)', updateDoc(doc(dbS, 'users', ALU), { goals: { ...METAS5, fib: 20001 } }), false);
await caso('dueña escribe clave desconocida (fib2)', updateDoc(doc(dbS, 'users', ALU), { goals: { ...METAS5, fib2: 27 } }), false);
await caso('dueña escribe fib decimal válida (26.8)', updateDoc(doc(dbS, 'users', ALU), { goals: { ...METAS5, fib: 26.8 } }), N);
await caso('otra usuaria escribe las metas de la alumna', updateDoc(doc(dbT, 'users', ALU), { goals: METAS6 }), false);

/* — cláusula del entrenador: matriz discriminante —
     decisionReal espeja goalsTrainerDecideProposal de la app. */
async function decisionReal(uid, goalsAplicadas) {
  let data;
  try {
    const snap = await getDoc(doc(dbE, 'users', uid));
    data = snap.data();
    if (!data || !data.goalsProposal) throw new Error('LECTURA: sin documento o sin propuesta');
  } catch (e) { throw new Error('LECTURA: ' + String((e && e.message) || e).slice(0, 120)); }
  const prop = data.goalsProposal;
  const patch = {
    goalsProposal: { ...prop, status: 'approved', decidedBy: ENT, decidedAt: serverTimestamp() },
    goalsProvenance: { ...(data.goalsProvenance || {}), changeLog: [...(((data.goalsProvenance || {}).changeLog) || []), { at: '2026-11-08T18:00:00.000Z', kind: prop.kind, param: prop.param, date: prop.date || null, foundedValue: prop.foundedValue, chosenValue: prop.chosenValue, gate: 'approved', by: ENT }] },
  };
  if (goalsAplicadas) patch.goals = goalsAplicadas;
  return updateDoc(doc(dbE, 'users', uid), patch);
}
await caso('M1 entrenador aprueba y aplica la fusión de la app SIN fib', decisionReal('aluM1', { ...SEMILLA, kcal: 1915 }), true);
await caso('M2 entrenador aprueba y aplica la fusión de la app CON fib', decisionReal('aluM2', { ...SEMILLA, kcal: 1915, fib: 27 }), N);
await caso('M3 entrenador aprueba y SOLO añade fib al mapa vigente', decisionReal('aluM3', { ...SEMILLA, fib: 27 }), N);
await caso('M4 entrenador aprueba y aplica el mapa completo CON fib', decisionReal('aluM4', METAS6), N);
await caso('M5 entrenador aprueba y aplica con fib decimal (27.0)', decisionReal('aluM5', { ...SEMILLA, kcal: 1915, fib: 27.0 }), N);
await caso('M6 entrenador escribe SOLO goals con fib (sin decisión): denegado', updateDoc(doc(dbE, 'users', 'aluM6'), { goals: { ...SEMILLA, fib: 27 } }), false);
await caso('M7 entrenador NO asignado intenta aplicar con fib', (async () => {
  const snap = await getDoc(doc(dbT, 'users', 'aluM2'));
  const prop = snap.data().goalsProposal;
  return updateDoc(doc(dbT, 'users', 'aluM2'), {
    goalsProposal: { ...prop, status: 'approved', decidedBy: OTRA, decidedAt: serverTimestamp() },
    goals: METAS6,
  });
})(), false);

await testEnv.cleanup();
if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n') + '\n'); console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('BATERÍA FIBRA2 OK —', N ? 'CANDIDATA' : 'VIVAS');
