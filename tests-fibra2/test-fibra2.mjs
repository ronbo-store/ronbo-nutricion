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
// (goalsTrainerDecideProposal). Cada caso corre sobre una alumna
// FRESCA. RONDA DE DIAGNÓSTICO (2026-11-08): las corridas 1–4
// mostraron que la decisión CON fib agota el presupuesto de 1.000
// expresiones del motor de reglas antes de llegar a la cláusula
// de decisión en documentos con la forma completa; esta ronda
// discrimina documento mínimo / completo / REALISTA (la forma de
// un alumno de verdad) y decisión sin procedencia, para saber si
// el riesgo es del delta o preexistente en el flujo de hoy.
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
    const crudo = String((e && e.message) || e).replace(/\s+/g, ' ');
    // Solo el NOMBRE del caso (la vista de anotaciones de GitHub
    // se corta a ~10) + el error crudo del PRIMER fallo.
    if (!fallos.length) for (let i = 0; i < Math.min(crudo.length, 540); i += 180) fallos.push('CRUDO1 ' + crudo.slice(i, i + 180));
    fallos.push('FALLO: ' + nombre);
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
/* La forma de un alumno REAL de producción: el documento trae
   además los campos que la app va escribiendo con el uso
   (funciones elegidas, acuerdo firmado, avisos, resumen diario,
   sugerencia de ritmo, día-tipo, instalación…). */
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
  await setDoc(doc(db, 'users', 'min1'), { trainerUid: ENT, goals: { ...SEMILLA }, goalsProposal: propuesta() });
  await setDoc(doc(db, 'users', 'full1'), alumnaBase('full1'));
  await setDoc(doc(db, 'users', 'full2'), alumnaBase('full2'));
  await setDoc(doc(db, 'users', 'full3'), alumnaBase('full3'));
  await setDoc(doc(db, 'users', 'real1'), alumnaReal('real1'));
  await setDoc(doc(db, 'users', 'real2'), alumnaReal('real2'));
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

/* — cláusula del entrenador: diagnóstico del presupuesto — */
async function decisionReal(uid, goalsAplicadas, conProv = true) {
  let data;
  try {
    const snap = await getDoc(doc(dbE, 'users', uid));
    data = snap.data();
    if (!data || !data.goalsProposal) throw new Error('LECTURA: sin documento o sin propuesta');
  } catch (e) { throw new Error('LECTURA: ' + String((e && e.message) || e).slice(0, 120)); }
  const prop = data.goalsProposal;
  const patch = {
    goalsProposal: { ...prop, status: 'approved', decidedBy: ENT, decidedAt: serverTimestamp() },
  };
  if (conProv) patch.goalsProvenance = { ...(data.goalsProvenance || {}), changeLog: [...(((data.goalsProvenance || {}).changeLog) || []), { at: '2026-11-08T18:00:00.000Z', kind: prop.kind, param: prop.param, date: prop.date || null, foundedValue: prop.foundedValue, chosenValue: prop.chosenValue, gate: 'approved', by: ENT }] };
  if (goalsAplicadas) patch.goals = goalsAplicadas;
  return updateDoc(doc(dbE, 'users', uid), patch);
}
await caso('D1 doc MÍNIMO: entrenador aprueba y aplica CON fib', decisionReal('min1', METAS6), N);
await caso('D2 doc completo: entrenador aprueba y aplica SIN fib (control)', decisionReal('full1', METAS5), true);
await caso('D3 doc completo: entrenador aprueba y aplica CON fib', decisionReal('full2', METAS6), N);
await caso('D4 doc completo: decisión CON fib SIN procedencia', decisionReal('full3', METAS6, false), N);
await caso('D5 doc REALISTA: entrenador aprueba y aplica SIN fib (flujo de hoy)', decisionReal('real2', METAS5), true);
await caso('D6 doc REALISTA: entrenador aprueba y aplica CON fib', decisionReal('real1', METAS6), N);
await caso('D7 entrenador escribe SOLO goals con fib (sin decisión): denegado', updateDoc(doc(dbE, 'users', 'full2'), { goals: { ...SEMILLA, fib: 27 } }), false);

await testEnv.cleanup();
if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n') + '\n'); console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('BATERÍA FIBRA2 OK —', N ? 'CANDIDATA' : 'VIVAS');
