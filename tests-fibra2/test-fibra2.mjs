// RONBO FIT — Batería gemela del delta de reglas «FIBRA FASE 2»
// (AUTH-2026-11-08-300) contra el emulador oficial de Firestore
// (proyecto ficticio ronbo-nutri-test, sin secretos ni datos reales).
// El delta: el mapa `goals` admite la clave `fib` — la meta de fibra
// DERIVADA de la kcal que el motor escribe — en las DOS cláusulas
// que cierran el mapa (la del dueño y la del entrenador asignado al
// aplicar una propuesta aprobada), con el mismo saneado numérico
// de las demás claves (> 0, <= 20000).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas cc0cfae7 + delta): la
//                        escritura con fib válida pasa en ambas
//                        cláusulas; todo lo demás, igual que hoy.
//   ESPERA_NUEVO=false → VIVAS cc0cfae7 (AUTH-2026-11-08-298): la
//                        escritura con fib se DENIEGA (hasOnly) y
//                        el resto se comporta idéntico.
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
    fallos.push(`${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
    console.log(`FALLO ${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
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
const { doc, setDoc, updateDoc, serverTimestamp, Timestamp } = F;

const METAS5 = { kcal: 1915, prot: 179, carb: 204, azuc: 24, gras: 43 };
const METAS6 = { ...METAS5, fib: 27 };
const PROP_TS = Timestamp.fromDate(new Date('2026-11-08T12:00:00Z'));
const propuesta = () => ({ kind: 'goal', param: 'kcal', date: null, foundedValue: 1915, chosenValue: 1915, warningKey: '', status: 'pending', proposedAt: PROP_TS, decidedBy: null, decidedAt: null });

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: false, isOwner: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true, isOwner: false, trainerUid: ENT, goals: { kcal: 1800, prot: 170, carb: 190, azuc: 23, gras: 40 }, goalsProposal: propuesta() });
  await setDoc(doc(db, 'users', ENT), { name: 'Entrenador', role: 'entrenador', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', OTRA), { name: 'Otra', role: 'usuario', approved: true, isOwner: false });
});
async function resembrarPropuesta() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ALU), { goalsProposal: propuesta() }, { merge: true });
  });
}

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

/* — cláusula del entrenador asignado al aplicar la propuesta — */
const decision = (goals) => ({
  goalsProposal: { ...propuesta(), status: 'approved', decidedBy: ENT, decidedAt: serverTimestamp() },
  goals,
});
await caso('entrenador asignado aprueba y aplica metas CON fib', updateDoc(doc(dbE, 'users', ALU), decision(METAS6)), N);
await resembrarPropuesta();
await caso('entrenador asignado aprueba y aplica metas SIN fib', updateDoc(doc(dbE, 'users', ALU), decision(METAS5)), true);
await resembrarPropuesta();
await caso('entrenador asignado aprueba y aplica con fib = 0', updateDoc(doc(dbE, 'users', ALU), decision({ ...METAS5, fib: 0 })), false);
await resembrarPropuesta();
await caso('entrenador NO asignado intenta aplicar con fib', updateDoc(doc(dbT, 'users', ALU), decision(METAS6)), false);

await testEnv.cleanup();
if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n') + '\n'); console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('BATERÍA FIBRA2 OK —', N ? 'CANDIDATA' : 'VIVAS');
