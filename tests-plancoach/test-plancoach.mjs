// RONBO FIT — Batería del delta de reglas «PLAN DEL COACH, FASE 1»
// (AUTH-2026-11-04-247) contra el emulador oficial de Firestore
// (proyecto ficticio, sin secretos ni datos reales).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → contra la CANDIDATA: nutrition_wishes se
//                        comporta como se diseñó y el alumno puede
//                        DECIDIR sobre una propuesta (solo estado y
//                        metadatos de decisión, contenido fijado).
//   ESPERA_NUEVO=false → contra el texto VIVO c5aad155: la
//                        colección no existe y toda decisión del
//                        alumno sobre planes está denegada.
// Salida: fallos.txt solo si hay fallos (anotaciones del workflow).
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
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
    ...(process.env.REGLAS_PRECARGADAS === '1' ? {} : { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8') }),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', COACH = 'coachT', COACH2 = 'coachU';
const ALU = 'alumnaS', ALU2 = 'alumnoS2', NOAPR = 'noAprobada';
const GOALS = { kcal: 1900, prot: 170, carb: 185, azuc: 24, gras: 53 };
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: true, isOwner: true });
  await setDoc(doc(db, 'users', COACH), { name: 'Coach', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', COACH2), { name: 'Coach Dos', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', ALU2), { name: 'Alumno Dos', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', NOAPR), { name: 'Sin Aprobar', role: 'usuario', approved: false });
  await setDoc(doc(db, 'nutritionist_profiles', COACH), { status: 'aprobado', displayName: 'Coach' });
  await setDoc(doc(db, 'nutritionist_profiles', COACH2), { status: 'aprobado', displayName: 'Coach Dos' });
  await setDoc(doc(db, 'nutritionist_relations', ALU), { studentUid: ALU, nutritionistUid: COACH, status: 'activa' });
  const planBase = { studentUid: ALU, nutritionistUid: COACH, goals: GOALS, goalsDraft: GOALS, startsOn: '2026-11-05', endsOn: '2026-12-05', cadence: 'monthly', notes: '' };
  await setDoc(doc(db, 'nutrition_plans', 'p-propuesto'), { ...planBase, status: 'propuesto' });
  await setDoc(doc(db, 'nutrition_plans', 'p-propuesto2'), { ...planBase, status: 'propuesto' });
  await setDoc(doc(db, 'nutrition_plans', 'p-propuesto3'), { ...planBase, status: 'propuesto' });
  await setDoc(doc(db, 'nutrition_plans', 'p-activo'), { ...planBase, status: 'activo' });
  await setDoc(doc(db, 'nutrition_plans', 'p-borrador'), { ...planBase, status: 'borrador' });
});
const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, updateDoc, serverTimestamp } = F;

const wishes = (extra = {}) => ({
  studentUid: ALU, goal: 'bajar', mealsPerDay: 4, likes: ['pollo'], dislikes: ['pescado'],
  allergies: ['mani'], allergyText: '', cookTime: '30', budget: 'mid', note: '',
  updatedAt: serverTimestamp(), ...extra,
});

/* --- nutrition_wishes --- */
await caso('W1 la alumna crea sus deseos', setDoc(doc(dbDe(ALU), 'nutrition_wishes', ALU), wishes()), ESPERA_NUEVO);
await caso('W2 la alumna actualiza sus deseos', setDoc(doc(dbDe(ALU), 'nutrition_wishes', ALU), wishes({ goal: 'ganar' }), { merge: true }), ESPERA_NUEVO);
await caso('W3 otro alumno NO crea deseos ajenos', setDoc(doc(dbDe(ALU2), 'nutrition_wishes', ALU), wishes({ studentUid: ALU })), false);
await caso('W4 su coach activo lee los deseos', getDoc(doc(dbDe(COACH), 'nutrition_wishes', ALU)), ESPERA_NUEVO);
await caso('W5 un coach ajeno NO lee los deseos', getDoc(doc(dbDe(COACH2), 'nutrition_wishes', ALU)), false);
await caso('W6 studentUid del documento distinto al id', setDoc(doc(dbDe(ALU), 'nutrition_wishes', ALU), wishes({ studentUid: ALU2 })), false);
await caso('W7 alumna sin aprobar NO escribe deseos', setDoc(doc(dbDe(NOAPR), 'nutrition_wishes', NOAPR), wishes({ studentUid: NOAPR })), false);
await caso('W8 la alumna lee sus deseos', getDoc(doc(dbDe(ALU), 'nutrition_wishes', ALU)), ESPERA_NUEVO);

/* --- decisión del alumno sobre nutrition_plans --- */
await caso('T1 acepta: propuesto→activo (solo estado y metadatos)',
  updateDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-propuesto'), { status: 'activo', acceptedAt: serverTimestamp(), changeRequest: null, updatedAt: serverTimestamp() }), ESPERA_NUEVO);
await caso('T2 pide cambios: propuesto→borrador con changeRequest',
  updateDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-propuesto2'), { status: 'borrador', changeRequest: { reason: 'food', text: 'La merienda no me funciona', at: serverTimestamp() }, updatedAt: serverTimestamp() }), ESPERA_NUEVO);
await caso('T3 no acepta: propuesto→archivado con declinedAt',
  updateDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-propuesto3'), { status: 'archivado', declinedAt: serverTimestamp(), declineReason: '', updatedAt: serverTimestamp() }), ESPERA_NUEVO);
await caso('T4 archiva su plan activo (mitad de una aceptación)',
  updateDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-activo'), { status: 'archivado', updatedAt: serverTimestamp() }), ESPERA_NUEVO);
await caso('T5 acepta PERO cambia las kcal: denegado siempre',
  updateDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-propuesto'), { status: 'activo', 'goals.kcal': 2000, updatedAt: serverTimestamp() }), false);
await caso('T6 de un borrador NO puede saltar a activo',
  updateDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-borrador'), { status: 'activo', updatedAt: serverTimestamp() }), false);
await caso('T7 tocar las notas de una propuesta: denegado siempre',
  updateDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-propuesto'), { notes: 'cambiado', updatedAt: serverTimestamp() }), false);
await caso('T8 la alumna NO crea planes',
  setDoc(doc(dbDe(ALU), 'nutrition_plans', 'p-nuevo'), { studentUid: ALU, nutritionistUid: COACH, status: 'activo', goals: GOALS }), false);
await caso('T9 otro alumno NO decide sobre plan ajeno',
  updateDoc(doc(dbDe(ALU2), 'nutrition_plans', 'p-propuesto'), { status: 'activo', updatedAt: serverTimestamp() }), false);

/* --- el carril del coach queda intacto --- */
await caso('C1 el coach crea un borrador para su alumna',
  setDoc(doc(dbDe(COACH), 'nutrition_plans', 'p-coach-new'), { studentUid: ALU, nutritionistUid: COACH, status: 'borrador', goals: GOALS }), true);
await caso('C2 el coach actualiza su borrador (lo propone)',
  updateDoc(doc(dbDe(COACH), 'nutrition_plans', 'p-borrador'), { status: 'propuesto', updatedAt: serverTimestamp() }), true);
await caso('C3 un coach ajeno NO crea planes para la alumna',
  setDoc(doc(dbDe(COACH2), 'nutrition_plans', 'p-coach-ajeno'), { studentUid: ALU, nutritionistUid: COACH2, status: 'borrador', goals: GOALS }), false);

await testEnv.cleanup();
if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n')); console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('SIN FALLOS');
