// RONBO FIT — Batería gemela del delta de reglas «FIBRA FASE 2 ·
// CIERRE DECISIÓN B» (AUTH-2026-11-08-308) contra el emulador
// oficial de Firestore (proyecto ficticio ronbo-nutri-test, sin
// secretos ni datos reales).
// El delta (decisión B de Ronald, 2026-11-08 23:17 CST): la meta
// derivada de fibra vive en el campo APARTE `goalsFib` de
// users/{uid}; la cláusula «Metas con fundamento» del dueño lo
// admite con guarda numérica propia (> 0, ≤ 300 — la derivación
// máxima con la kcal al tope es 280). El mapa cerrado `goals` y
// las cláusulas de decisión y rechazo del entrenador NO se tocan.
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas 55632b3b + delta B).
//   ESPERA_NUEVO=false → VIVAS 55632b3b (AUTH-2026-11-08-307): el
//                        dueño NO puede escribir goalsFib todavía
//                        y todo lo demás se comporta idéntico.
// LA SONDA (casos D1–D6): la escritura EXACTA de la app
// (goalsTrainerDecideProposal) sobre documentos que YA TIENEN
// goalsFib guardado debe PASAR en las dos suites — el parche de
// decisión no incluye el campo y no lo necesita —; con `fib`
// dentro del mapa `goals` sigue DENEGADA como hoy; y ningún
// entrenador puede tocar goalsFib ni colarlo en su parche.
// Salida: fallos.txt solo si hay fallos.
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';

/* Diagnóstico incremental (ronda 2): cada caso deja su marca en
   progreso.txt al terminar y cada fallo se escribe a fallos.txt
   EN EL MOMENTO — si el proceso muere a mitad (semillas, carga de
   reglas), el rastro sobrevive y el paso de diagnóstico del
   workflow lo publica como anotaciones. */
const marca = (f, s) => { try { appendFileSync(f, s + '\n'); } catch {} };
process.on('uncaughtException', e => { marca('fallos.txt', 'CRASH: ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 400)); process.exit(1); });
process.on('unhandledRejection', e => { marca('fallos.txt', 'CRASH-REJ: ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 400)); process.exit(1); });

const N = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
async function caso(nombre, promesa, debePasar) {
  try {
    if (debePasar) await assertSucceeds(promesa);
    else await assertFails(promesa);
    console.log(`OK    ${nombre} → ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
    marca('progreso.txt', 'OK ' + nombre);
  } catch (e) {
    const crudo = String((e && e.message) || e).replace(/\s+/g, ' ');
    if (!fallos.length) for (let i = 0; i < Math.min(crudo.length, 540); i += 180) { fallos.push('CRUDO1 ' + crudo.slice(i, i + 180)); marca('fallos.txt', 'CRUDO1 ' + crudo.slice(i, i + 180)); }
    fallos.push('FALLO: ' + nombre);
    marca('fallos.txt', 'FALLO: ' + nombre);
    marca('progreso.txt', 'FALLO ' + nombre);
    console.log(`FALLO ${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'} — ${crudo.slice(0, 400)}`);
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

const DUENO = 'dueno', ALU = 'alumnaS', ALU2 = 'alumnaB', ENT = 'entrenadorE', OTRA = 'alumnaT';
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, updateDoc, serverTimestamp, Timestamp, deleteField } = F;

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
/* La forma de un alumno REAL de producción (los campos que la app
   va escribiendo con el uso), igual que en la batería anterior. */
const alumnaReal = (uid) => ({
  ...alumnaBase(uid),
  email: uid + '@example.com', phone: '+10000000000', gender: 'femenino', social: '',
  accountType: 'alumno', modality: 'virtual', lang: 'es', mailLang: 'es',
  createdAt: PROP_TS, termsVersion: 'v4-2026-10-24', acceptedTerms: true, adultConfirmed: true,
  features: { actividad: true, camaraCoach: false, retos: true },
  goalsAgreement: { version: 'v2-2026-11-03', records: [
    { kind: 'goal', param: 'kcal', date: null, foundedValue: 2000, chosenValue: 2000, warningKey: '', agreementVersion: 'v2-2026-11-03', acceptedAt: '2026-11-01T10:00:00.000Z' },
    { kind: 'goal', param: 'prot', date: null, foundedValue: 170, chosenValue: 170, warningKey: '', agreementVersion: 'v2-2026-11-03', acceptedAt: '2026-11-01T10:00:00.000Z' } ], updatedAt: PROP_TS },
  goalsDayOverrides: { '2026-11-10': 'exigente', '2026-11-12': 'descanso' },
  paceSuggestion: { paceKcal: -750, suggestedAt: PROP_TS, status: 'approved', decidedBy: ENT, decidedAt: PROP_TS },
  goalObjective: 'bajar', goalFocus: null,
  notices: { welcome: { by: ENT, at: PROP_TS } },
  daySummary: { enabled: true, hour: '21:00', tz: 'America/Chicago' },
  eveAlert: { meds: true },
  appInstall: { installed: true, platform: 'ios' },
  approvalsUsed: 0,
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: false, isOwner: true });
  await setDoc(doc(db, 'users', ALU), alumnaBase(ALU));
  await setDoc(doc(db, 'users', ALU2), { ...alumnaBase(ALU2), goalsFib: 27 });
  await setDoc(doc(db, 'users', 'fullG'), { ...alumnaBase('fullG'), goalsFib: 27 });
  await setDoc(doc(db, 'users', 'realG'), { ...alumnaReal('realG'), goalsFib: 27 });
  await setDoc(doc(db, 'users', 'fibmap1'), { ...alumnaBase('fibmap1'), goals: { ...SEMILLA, fib: 26 } });
  await setDoc(doc(db, 'users', 'extra1'), { ...alumnaBase('extra1'), goalsFib: 27 });
  await setDoc(doc(db, 'users', 'rej1'), { ...alumnaReal('rej1'), goalsFib: 27 });
  await setDoc(doc(db, 'users', ENT), { name: 'Entrenador', role: 'entrenador', approved: true, isOwner: false, approvalsUsed: 0 });
  // Semilla FIEL a producción: sin estos dos documentos, varias
  // cláusulas del entrenador caen en rutas de error que consumen
  // presupuesto de expresiones en el emulador.
  await setDoc(doc(db, 'app_settings', 'approvals'), { maxPerTrainer: 1 });
  await setDoc(doc(db, 'trainer_profiles', ENT), { uid: ENT, active: true });
  await setDoc(doc(db, 'users', OTRA), { name: 'Otra', role: 'usuario', approved: true, isOwner: false });
});

marca('progreso.txt', 'SEMILLAS OK · suite ' + (N ? 'CANDIDATA' : 'VIVAS'));
const dbS = testEnv.authenticatedContext(ALU).firestore();
const dbB = testEnv.authenticatedContext(ALU2).firestore();
const dbE = testEnv.authenticatedContext(ENT).firestore();
const dbT = testEnv.authenticatedContext(OTRA).firestore();

/* — cláusula del dueño: el motor estampa goalsFib — */
await caso('P1 dueña: la escritura del motor (metas 5 + procedencia + goalsFib 27)', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5, goalsProvenance: { engine: 'metas-v3-2026-10-26' }, goalsFib: 27 }), N);
await caso('P2 dueña: metas sin goalsFib (las 5 de siempre)', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5 }), true);
await caso('P3 dueña: goalsFib = 0 se deniega', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5, goalsFib: 0 }), false);
await caso('P4 dueña: goalsFib como texto se deniega', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5, goalsFib: '27' }), false);
await caso('P5 dueña: goalsFib = 301 (sobre el tope derivado) se deniega', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5, goalsFib: 301 }), false);
await caso('P6 dueña: goalsFib = 280 (el máximo derivable) pasa', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5, goalsFib: 280 }), N);
await caso('P7 dueña: goalsFib = 25 (el piso) pasa', updateDoc(doc(dbS, 'users', ALU), { goals: METAS5, goalsFib: 25 }), N);
await caso('P8 dueña: retira goalsFib con deleteField (sin kcal no hay meta)', updateDoc(doc(dbB, 'users', ALU2), { goalsFib: deleteField() }), N);
await caso('P9 tercera cuenta escribe goalsFib ajeno: denegado', updateDoc(doc(dbT, 'users', ALU), { goalsFib: 30 }), false);
await caso('P10 dueña: goalsFib solo (sin tocar el mapa) pasa', updateDoc(doc(dbS, 'users', ALU), { goalsFib: 30 }), N);

/* — LA SONDA: el camino de decisión con goalsFib presente — */
async function decisionReal(uid, goalsAplicadas, extra) {
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
  if (extra) Object.assign(patch, extra);
  return updateDoc(doc(dbE, 'users', uid), patch);
}
async function rechazoReal(uid) {
  let data;
  try {
    const snap = await getDoc(doc(dbE, 'users', uid));
    data = snap.data();
    if (!data || !data.goalsProposal) throw new Error('LECTURA: sin documento o sin propuesta');
  } catch (e) { throw new Error('LECTURA: ' + String((e && e.message) || e).slice(0, 120)); }
  const prop = data.goalsProposal;
  return updateDoc(doc(dbE, 'users', uid), {
    goalsProposal: { ...prop, status: 'rejected', decidedBy: ENT, decidedAt: serverTimestamp() },
    goalsProvenance: { ...(data.goalsProvenance || {}), changeLog: [...(((data.goalsProvenance || {}).changeLog) || []), { at: '2026-11-08T18:00:00.000Z', kind: prop.kind, param: prop.param, date: prop.date || null, foundedValue: prop.foundedValue, chosenValue: prop.chosenValue, gate: 'rejected', by: ENT }] },
  });
}
await caso('D1 SONDA doc completo CON goalsFib: la decisión exacta de la app pasa (sin tocar goalsFib)', decisionReal('fullG', METAS5), true);
await caso('D2 SONDA doc REALISTA CON goalsFib: la decisión exacta de la app pasa', decisionReal('realG', METAS5), true);
await caso('D3 decisión que aplica `fib` DENTRO del mapa goals: denegada como hoy', decisionReal('fibmap1', METAS6), false);
await caso('D4 decisión que cuela goalsFib en su parche: denegada (la cláusula no lo admite)', decisionReal('extra1', METAS5, { goalsFib: 30 }), false);
await caso('D5 entrenador escribe SOLO goalsFib ajeno: denegado', updateDoc(doc(dbE, 'users', ALU), { goalsFib: 30 }), false);
await caso('D6 rechazo con goalsFib presente en el documento: pasa', rechazoReal('rej1'), true);

await testEnv.cleanup();
if (fallos.length) { console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('BATERÍA FIBRA2-CIERRE OK —', N ? 'CANDIDATA' : 'VIVAS');
