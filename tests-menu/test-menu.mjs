// RONBO FIT — Batería gemela del delta de reglas «MENÚS SEMANALES»
// (AUTH-2026-11-08-296; candidata corregida por AUTH-2026-11-08-298:
// los helpers isOwnerUser/isApprovedUser leen con .get() y valor por
// omisión, y el caso «pide cambios» corre sobre SU PROPIO menú
// propuesto — en la corrida 42544989030 reutilizaba el documento ya
// aceptado por el caso anterior: vigente→borrador, fuera del diseño)
// contra el emulador oficial de Firestore
// (proyecto ficticio ronbo-nutri-test, sin secretos ni datos reales).
// El delta: bloque NUEVO match /nutrition_menus/{menuId} — el menú
// lo arma el coach (borrador/propuesto) o el propio alumno
// (vigente al guardar); el alumno decide sobre los menús del coach
// con la lista blanca de la Fase 1; borrar, solo el dueño.
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas f6851bc2 + delta): los
//                        casos del ciclo de vida pasan.
//   ESPERA_NUEVO=false → VIVAS f6851bc2: la colección no existe y
//                        TODO se deniega (default), resto idéntico.
// Salida: fallos.txt solo si hay fallos.
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
    rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', COACH = 'coachC', ALU = 'alumnaS', OTRA = 'alumnaT', NOAP = 'noAprobada';
const F = await import('firebase/firestore');
const { doc, collection, addDoc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } = F;

const base = { basedOnPlanId: null, weekStart: '2026-11-09', days: [], wishesSnapshot: null, changeRequest: null };
const menuAlumno = { ...base, studentUid: ALU, nutritionistUid: null, authorRole: 'alumno', authorUid: ALU, status: 'vigente' };
const menuCoach = { ...base, studentUid: ALU, nutritionistUid: COACH, authorRole: 'coach', authorUid: COACH, status: 'borrador' };

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: false, isOwner: true });
  await setDoc(doc(db, 'users', COACH), { name: 'Coach', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', OTRA), { name: 'Otra', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', NOAP), { name: 'Pendiente', role: 'usuario', approved: false });
  await setDoc(doc(db, 'nutritionist_profiles', COACH), { status: 'aprobado' });
  await setDoc(doc(db, 'nutritionist_relations', ALU), { nutritionistUid: COACH, status: 'activa' });
  await setDoc(doc(db, 'nutrition_menus', 'menu-alu'), menuAlumno);
  await setDoc(doc(db, 'nutrition_menus', 'menu-coach-borr'), menuCoach);
  await setDoc(doc(db, 'nutrition_menus', 'menu-coach-prop'), { ...menuCoach, status: 'propuesto' });
  await setDoc(doc(db, 'nutrition_menus', 'menu-coach-prop2'), { ...menuCoach, status: 'propuesto' });
  await setDoc(doc(db, 'nutrition_menus', 'menu-coach-vig'), { ...menuCoach, status: 'vigente' });
});

const dbS = testEnv.authenticatedContext(ALU).firestore();
const dbC = testEnv.authenticatedContext(COACH).firestore();
const dbT = testEnv.authenticatedContext(OTRA).firestore();
const dbN = testEnv.authenticatedContext(NOAP).firestore();
const dbO = testEnv.authenticatedContext(DUENO).firestore();
const N = ESPERA_NUEVO; // en el texto vivo la colección no existe: todo denegado

await caso('alumna crea su menú vigente', addDoc(collection(dbS, 'nutrition_menus'), { ...menuAlumno, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }), N);
await caso('alumna lee su menú', getDoc(doc(dbS, 'nutrition_menus', 'menu-alu')), N);
await caso('otra alumna lee el menú ajeno', getDoc(doc(dbT, 'nutrition_menus', 'menu-alu')), false);
await caso('otra crea menú a nombre de la alumna', addDoc(collection(dbT, 'nutrition_menus'), { ...menuAlumno, authorUid: OTRA }), false);
await caso('no aprobada crea su menú', addDoc(collection(dbN, 'nutrition_menus'), { ...menuAlumno, studentUid: NOAP, authorUid: NOAP }), false);
await caso('coach crea borrador para su alumna', addDoc(collection(dbC, 'nutrition_menus'), { ...menuCoach, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }), N);
await caso('coach crea propuesto directo para su alumna', addDoc(collection(dbC, 'nutrition_menus'), { ...menuCoach, status: 'propuesto' }), N);
await caso('coach crea menú para alumna sin relación', addDoc(collection(dbC, 'nutrition_menus'), { ...menuCoach, studentUid: OTRA }), false);
await caso('coach lee el menú de su alumna', getDoc(doc(dbC, 'nutrition_menus', 'menu-alu')), N);
await caso('coach edita su borrador (días)', updateDoc(doc(dbC, 'nutrition_menus', 'menu-coach-borr'), { days: [{ date: '2026-11-09', dayType: 'base', meals: [] }], updatedAt: serverTimestamp() }), N);
await caso('alumna edita el contenido del borrador del coach', updateDoc(doc(dbS, 'nutrition_menus', 'menu-coach-borr'), { days: [], updatedAt: serverTimestamp() }), false);
await caso('alumna acepta la propuesta (lista blanca)', updateDoc(doc(dbS, 'nutrition_menus', 'menu-coach-prop'), { status: 'vigente', acceptedAt: serverTimestamp(), changeRequest: null, updatedAt: serverTimestamp() }), N);
await caso('alumna pide cambios (lista blanca)', updateDoc(doc(dbS, 'nutrition_menus', 'menu-coach-prop2'), { status: 'borrador', changeRequest: { reason: 'food', text: 'sin pollo' }, updatedAt: serverTimestamp() }), N);
await caso('alumna archiva el vigente del coach', updateDoc(doc(dbS, 'nutrition_menus', 'menu-coach-vig'), { status: 'archivado', updatedAt: serverTimestamp() }), N);
await caso('alumna toca weekStart del menú del coach (fuera de la lista)', updateDoc(doc(dbS, 'nutrition_menus', 'menu-coach-prop'), { weekStart: '2026-11-16', updatedAt: serverTimestamp() }), false);
await caso('alumna se crea un menú con rol coach', addDoc(collection(dbS, 'nutrition_menus'), { ...menuAlumno, authorRole: 'coach', nutritionistUid: ALU }), false);
await caso('alumna borra su menú', deleteDoc(doc(dbS, 'nutrition_menus', 'menu-alu')), false);
await caso('dueño borra un menú', deleteDoc(doc(dbO, 'nutrition_menus', 'menu-alu')), N);
await caso('dueño lee un menú', getDoc(doc(dbO, 'nutrition_menus', 'menu-coach-vig')), N);

await testEnv.cleanup();
if (fallos.length) { writeFileSync('fallos.txt', fallos.join('\n') + '\n'); console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('BATERÍA MENÚS OK —', ESPERA_NUEVO ? 'CANDIDATA' : 'VIVAS');
