// RONBO FIT — Batería CI del capítulo de reglas «Coach de
// alimentación» (punto 101 de la cola; preámbulo 2026-11-02 y
// cierre de decisiones de Ronald 2026-11-03 10:59 CST). Usuarios
// FICTICIOS, emulador oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 5b1b21a0-0528-4fc3-8ff4-0105c989275d, SHA-256 8329b84e…):
// ayudantes nutri*, lectura del coach activo en nutrition_meals
// (+crear con autoría byUid/byRole) y en nutrition_weight (solo
// lectura), y el capítulo nuevo completo (perfiles, membresías,
// directorio, relaciones+historial, seguimiento, planes,
// plantillas, sugerencias, agua, reseñas, consentimiento,
// recetas, favoritos, asignaciones).
//
// La suite corre en DOS modos con la misma lista de casos:
//   ESPERA_NUEVO=true  → reglas = CANDIDATA (el capítulo se
//                        comporta como se diseñó)
//   ESPERA_NUEVO=false → reglas = texto VIVO (el capítulo no
//                        existe: todo lo suyo deniega, también al
//                        propietario; los vecinos no cambian)
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { appendFileSync } from 'node:fs';

// Superficie de fallos: además de la consola, cada fallo se anota
// en fallos.txt y el workflow lo republica como anotación visible.
process.on('unhandledRejection', (e) => {
  const msg = String(e && e.message || e).slice(0, 300).replace(/[\r\n]+/g, ' ');
  try { appendFileSync('fallos.txt', 'ARRANQUE :: ' + msg + '\n'); } catch {}
  console.log('::error title=ARRANQUE::' + msg);
});

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const NOMBRE = ESPERA_NUEVO ? 'COACH-CANDIDATA' : 'COACH-VIVO';
const N = ESPERA_NUEVO; // expectativa de los casos del capítulo

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8080) }
});

let pass = 0, fail = 0; const failures = [];
async function T(name, promise, shouldSucceed) {
  try {
    if (shouldSucceed) await assertSucceeds(promise); else await assertFails(promise);
    pass++; console.log('PASS — ' + name);
  } catch (e) {
    fail++; failures.push(name);
    const msg = String(e && e.message || e).slice(0, 200).replace(/[\r\n]+/g, ' ');
    console.log('FAIL — ' + name + ' :: ' + msg);
    console.log('::error title=' + name + '::' + msg);
    try { appendFileSync('fallos.txt', name + ' :: ' + msg + '\n'); } catch {}
  }
}

const dbOf = (uid) => uid ? testEnv.authenticatedContext(uid).firestore()
  : testEnv.unauthenticatedContext().firestore();
const D = (uid, col, id) => doc(dbOf(uid), col, id);

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const parts = path.split('/');
    await setDoc(doc(ctx.firestore(), ...parts), data);
  });
}
async function seedUser(uid, extra) {
  await seed('users/' + uid, Object.assign({
    name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
    isOwner: false, approved: true
  }, extra || {}));
}

/* ── Siembra ── */
await seedUser('dueno', { isOwner: true, role: 'administrador', approved: false });
await seedUser('alumna', {});
await seedUser('alumnaNueva', { approved: false });
await seedUser('coach', {});
await seedUser('coach2', {});
await seedUser('coachPend', { approved: false });
await seedUser('entrenador', { role: 'entrenador' });
await seedUser('intruso', {});
await seed('nutritionist_profiles/coach', { status: 'aprobado', activeClients: 1, displayName: 'Coach Uno', bio: 'bio' });
await seed('nutritionist_profiles/coach2', { status: 'aprobado', activeClients: 0, displayName: 'Coach Dos', bio: 'bio' });
await seed('nutritionist_relations/alumna', { studentUid: 'alumna', nutritionistUid: 'coach', status: 'activa' });
await seed('nutritionist_memberships/coach', { status: 'activa', level: 'premium' });
await seed('nutritionist_directory/current', { coaches: [{ uid: 'coach' }] });
await seed('trainer_directory/current', { trainers: [] });
await seed('app_settings/mail_templates', { welcome: { en: 'x', es: 'x' } });
await seed('nutrition_meals/m1', { ownerUid: 'alumna', name: 'Siembra', kcal: 100 });
await seed('nutrition_weight/alumna_2026-11-03', { ownerUid: 'alumna', kg: 80 });
await seed('recipes/generalPub', { ownerUid: 'intruso', scope: 'general', status: 'publicada', photoUrl: 'data:img' });

/* ── P: perfiles ── */
await T('P2 registrante NO crea su perfil ya aprobado', setDoc(D('coachPend', 'nutritionist_profiles', 'coachPend'), { status: 'aprobado', activeClients: 0 }), false);
await T('P1 registrante crea su perfil pendiente', setDoc(D('coachPend', 'nutritionist_profiles', 'coachPend'), { status: 'pendiente', activeClients: 0, displayName: 'Coach Pend' }), N);
await T('P3 coach edita su bio (status congelado)', updateDoc(D('coach', 'nutritionist_profiles', 'coach'), { bio: 'bio nueva' }), N);
await T('P4 coach NO cambia su propio status', updateDoc(D('coach', 'nutritionist_profiles', 'coach'), { status: 'suspendido' }), false);
await T('P5 administrador aprueba el perfil pendiente', updateDoc(D('dueno', 'nutritionist_profiles', 'coachPend'), { status: 'aprobado' }), N);
await T('P6 administrador lista perfiles', getDocs(collection(dbOf('dueno'), 'nutritionist_profiles')), N);
await T('P7 alumna aprobada lista perfiles (pool)', getDocs(collection(dbOf('alumna'), 'nutritionist_profiles')), N);
await T('P8 sin sesión NO lee un perfil', getDoc(D(null, 'nutritionist_profiles', 'coach')), false);

/* ── M: membresías ── */
await T('M1 registrante crea su membresía pendiente', setDoc(D('coachPend', 'nutritionist_memberships', 'coachPend'), { status: 'pendiente', level: 'sin_membresia', requestedLevel: 'basico' }), N);
await T('M2 coach pide otro nivel (decisión congelada)', updateDoc(D('coachPend', 'nutritionist_memberships', 'coachPend'), { requestedLevel: 'premium', status: 'pendiente' }), N);
await T('M3 coach NO se fija su propio nivel', updateDoc(D('coachPend', 'nutritionist_memberships', 'coachPend'), { level: 'premium', status: 'pendiente', requestedLevel: 'premium' }), false);
await T('M4 administrador activa la membresía', updateDoc(D('dueno', 'nutritionist_memberships', 'coachPend'), { status: 'activa', level: 'premium', decidedBy: 'dueno' }), N);
await T('M5 alumna aprobada lee la membresía del coach (pool)', getDoc(D('alumna', 'nutritionist_memberships', 'coach')), N);

/* ── D: directorio ── */
await T('D1 sin sesión lee el directorio publicado', getDoc(D(null, 'nutritionist_directory', 'current')), N);
await T('D2 sin sesión NO lista el directorio', getDocs(collection(dbOf(null), 'nutritionist_directory')), false);
await T('D3 coach NO escribe el directorio', setDoc(D('coach', 'nutritionist_directory', 'current'), { coaches: [] }), false);
await T('D4 administrador publica el directorio', setDoc(D('dueno', 'nutritionist_directory', 'current'), { coaches: [{ uid: 'coach' }, { uid: 'coach2' }] }), N);

/* ── R: relaciones, historial y contador ── */
// La app escribe la relación, el historial y el contador como
// escrituras SUELTAS en ese orden (nutriAdjustQuota nunca va en
// el lote de la relación): la suite espeja esa secuencia real.
await T('R1 registro: la alumna crea su relación (suelta)', setDoc(D('alumnaNueva', 'nutritionist_relations', 'alumnaNueva'), { studentUid: 'alumnaNueva', nutritionistUid: 'coach2', status: 'activa' }), N);
await T('R1b registro: evento de historial (suelto)', setDoc(doc(dbOf('alumnaNueva'), 'nutritionist_relations/alumnaNueva/history', 'ev1'), { by: 'alumnaNueva', type: 'assigned' }), N);
await T('R1c registro: contador +1 suelto de la propia alumna', updateDoc(D('alumnaNueva', 'nutritionist_profiles', 'coach2'), { activeClients: 1 }), N);
await T('R2 alumna NO crea relación para otra', setDoc(D('alumnaNueva', 'nutritionist_relations', 'intruso'), { studentUid: 'intruso', nutritionistUid: 'coach', status: 'activa' }), false);
await T('R3 su coach lee la relación', getDoc(D('coach', 'nutritionist_relations', 'alumna')), N);
await T('R4 un tercero NO lee la relación', getDoc(D('intruso', 'nutritionist_relations', 'alumna')), false);
await T('R5 alumna pide cambio (pendingChange, vínculo congelado)', updateDoc(D('alumna', 'nutritionist_relations', 'alumna'), { pendingChange: { toUid: 'coach2', stage: 'espera_nutricionista' } }), N);
await T('R6 alumna NO cambia su coach directamente', updateDoc(D('alumna', 'nutritionist_relations', 'alumna'), { nutritionistUid: 'coach2' }), false);
await T('R7 el coach entrante acepta el cambio', updateDoc(D('coach2', 'nutritionist_relations', 'alumna'), { pendingChange: { toUid: 'coach2', stage: 'espera_administrador' } }), N);
await T('R8 un tercero NO toca la relación ajena', updateDoc(D('intruso', 'nutritionist_relations', 'alumna'), { followUpCadence: 'mensual' }), false);
await T('R9 alumna añade evento al historial', setDoc(doc(dbOf('alumna'), 'nutritionist_relations/alumna/history', 'evR9'), { by: 'alumna', type: 'change_requested' }), N);
await T('R10 nadie edita el historial', updateDoc(doc(dbOf('alumna'), 'nutritionist_relations/alumna/history', 'evR9'), { type: 'otro' }), false);
await T('R11 nadie borra el historial', deleteDoc(doc(dbOf('alumna'), 'nutritionist_relations/alumna/history', 'evR9')), false);
await T('R12 contador suelto sin relación NO se mueve', updateDoc(D('alumnaNueva', 'nutritionist_profiles', 'coach'), { activeClients: 99 }), false);

/* ── S: seguimiento (doble llave) ── */
await T('S1 alumna abre su seguimiento', setDoc(D('alumna', 'nutrition_followups', 'fu1'), { studentUid: 'alumna', nutritionistUid: 'coach', status: 'pendiente_nutricionista' }), N);
await T('S2 su coach da la primera llave', updateDoc(D('coach', 'nutrition_followups', 'fu1'), { status: 'pendiente_administrador' }), N);
await T('S5b alumna abre otro seguimiento', setDoc(D('alumna', 'nutrition_followups', 'fu2'), { studentUid: 'alumna', nutritionistUid: 'coach', status: 'pendiente_nutricionista' }), N);
await T('S3 el coach NO salta a aprobada', updateDoc(D('coach', 'nutrition_followups', 'fu2'), { status: 'aprobada' }), false);
await T('S4 el administrador confirma', updateDoc(D('dueno', 'nutrition_followups', 'fu1'), { status: 'aprobada' }), N);
await T('S5 alumna NO abre seguimiento para otra', setDoc(D('alumna', 'nutrition_followups', 'fuX'), { studentUid: 'intruso', status: 'pendiente_administrador' }), false);

/* ── PL: planes ── */
await T('PL1 su coach crea el borrador del plan', setDoc(D('coach', 'nutrition_plans', 'plan1'), { studentUid: 'alumna', nutritionistUid: 'coach', status: 'borrador' }), N);
await T('PL2 el coach NO crea planes para quien no es su alumno', setDoc(D('coach', 'nutrition_plans', 'planX'), { studentUid: 'intruso', nutritionistUid: 'coach', status: 'borrador' }), false);
await T('PL3 la alumna NUNCA escribe planes', setDoc(D('alumna', 'nutrition_plans', 'planY'), { studentUid: 'alumna', nutritionistUid: 'coach', status: 'activo' }), false);
await T('PL4 la alumna lee su plan', getDoc(D('alumna', 'nutrition_plans', 'plan1')), N);
await T('PL5 el entrenador NO entra al dominio del coach', getDoc(D('entrenador', 'nutrition_plans', 'plan1')), false);

/* ── G: sugerencias de metas ── */
await T('G1 alumna sugiere metas', setDoc(D('alumna', 'nutrition_goal_suggestions', 'sg1'), { studentUid: 'alumna', nutritionistUid: 'coach', status: 'pendiente' }), N);
await T('G2 su coach atiende la sugerencia', updateDoc(D('coach', 'nutrition_goal_suggestions', 'sg1'), { status: 'observada' }), N);
await T('G3 otro coach NO atiende la sugerencia', updateDoc(D('coach2', 'nutrition_goal_suggestions', 'sg1'), { status: 'observada' }), false);

/* ── W: agua ── */
await T('W1 alumna registra su agua', setDoc(D('alumna', 'nutrition_water', 'alumna_2026-11-03'), { alumnoUid: 'alumna', byUid: 'alumna', ml: 250 }), N);
await T('W2 su coach registra agua para ella con autoría', setDoc(D('coach', 'nutrition_water', 'alumna_2026-11-04'), { alumnoUid: 'alumna', byUid: 'coach', ml: 500 }), N);
await T('W3 el coach NO registra agua para quien no es su alumno', setDoc(D('coach', 'nutrition_water', 'intruso_2026-11-04'), { alumnoUid: 'intruso', byUid: 'coach', ml: 500 }), false);
await T('W4 un tercero NO lee el agua ajena', getDoc(D('intruso', 'nutrition_water', 'alumna_2026-11-03')), false);

/* ── C: consentimiento específico ── */
await T('C1 alumna firma su consentimiento específico', setDoc(D('alumna', 'nutrition_consents', 'alumna'), { studentUid: 'alumna', version: 'v1-2026-11-03', shareDetails: true }), N);
await T('C2 su coach activo lo lee', getDoc(D('coach', 'nutrition_consents', 'alumna')), N);
await T('C3 un tercero NO lo lee', getDoc(D('intruso', 'nutrition_consents', 'alumna')), false);
await T('C4 el coach NO escribe el consentimiento', updateDoc(D('coach', 'nutrition_consents', 'alumna'), { shareDetails: false }), false);
await T('C5 alumna lo retira (campos borrados por ella)', updateDoc(D('alumna', 'nutrition_consents', 'alumna'), { shareDetails: false, healthNotes: '', withdrawnAt: 123 }), N);

/* ── RC: recetas ── */
await T('RC1 receta general SIN foto no nace', setDoc(D('alumna', 'recipes', 'rSinFoto'), { ownerUid: 'alumna', scope: 'general', status: 'pendiente' }), false);
await T('RC2 alumna propone general con foto (nace pendiente)', setDoc(D('alumna', 'recipes', 'rAlumna'), { ownerUid: 'alumna', scope: 'general', status: 'pendiente', photoUrl: 'data:img' }), N);
await T('RC3 alumna NO la nace ya publicada', setDoc(D('alumna', 'recipes', 'rPub'), { ownerUid: 'alumna', scope: 'general', status: 'publicada', photoUrl: 'data:img' }), false);
await T('RC4 coach crea su privada publicada con foto', setDoc(D('coach', 'recipes', 'rPriv'), { ownerUid: 'coach', scope: 'privada', status: 'publicada', photoUrl: 'data:img' }), N);
await T('RC5 su alumna lee la privada', getDoc(D('alumna', 'recipes', 'rPriv')), N);
await T('RC6 otra alumna NO lee la privada', getDoc(D('intruso', 'recipes', 'rPriv')), false);
await T('RC7 aprobada lee la general publicada', getDoc(D('alumna', 'recipes', 'generalPub')), N);
await T('RC8 la autora NO se autopublica', updateDoc(D('alumna', 'recipes', 'rAlumna'), { status: 'publicada' }), false);
await T('RC9 el administrador publica la general', updateDoc(D('dueno', 'recipes', 'rAlumna'), { status: 'publicada' }), N);

/* ── RV: reseñas ── */
await T('RV1 alumna reseña a SU coach activo', setDoc(D('alumna', 'nutrition_reviews', 'rv1'), { studentUid: 'alumna', nutritionistUid: 'coach', stars: 5 }), N);
await T('RV2 alumna NO reseña a un coach que no es el suyo', setDoc(D('alumna', 'nutrition_reviews', 'rv2'), { studentUid: 'alumna', nutritionistUid: 'coach2', stars: 5 }), false);

/* ── F/A: favoritos y asignaciones ── */
await T('F1 favorito con id que casa', setDoc(D('alumna', 'recipe_favorites', 'alumna_rec1'), { studentUid: 'alumna', recipeId: 'rec1' }), N);
await T('F2 favorito con id que NO casa', setDoc(D('alumna', 'recipe_favorites', 'cualquiera'), { studentUid: 'alumna', recipeId: 'rec1' }), false);
await T('A1 su coach le asigna una receta', setDoc(D('coach', 'recipe_assignments', 'as1'), { studentUid: 'alumna', nutritionistUid: 'coach', recipeId: 'rPriv' }), N);
await T('A2 alumna marca la receta hecha (solo doneAt)', updateDoc(D('alumna', 'recipe_assignments', 'as1'), { doneAt: 123 }), N);
await T('A3 alumna NO cambia la receta asignada', updateDoc(D('alumna', 'recipe_assignments', 'as1'), { recipeId: 'otra' }), false);

/* ── CM: comidas (edición del bloque vivo) ── */
await T('CM1 su coach registra una comida con autoría', setDoc(D('coach', 'nutrition_meals', 'cm1'), { ownerUid: 'alumna', byUid: 'coach', byRole: 'nutricionista', kcal: 300 }), N);
await T('CM2 el coach NO registra para quien no es su alumno', setDoc(D('coach', 'nutrition_meals', 'cmX'), { ownerUid: 'intruso', byUid: 'coach', byRole: 'nutricionista', kcal: 300 }), false);
await T('CM3 su coach lee el diario', getDoc(D('coach', 'nutrition_meals', 'm1')), N);
await T('CM4 el coach NO edita la comida del alumno', updateDoc(D('coach', 'nutrition_meals', 'm1'), { kcal: 1 }), false);
await T('CM5 la alumna crea su comida (vecino intacto)', setDoc(D('alumna', 'nutrition_meals', 'cmSelf'), { ownerUid: 'alumna', kcal: 200 }), true);
await T('CM6 el propietario lee la comida (vecino intacto)', getDoc(D('dueno', 'nutrition_meals', 'm1')), true);
await T('CM7 el entrenador no asignado NO lee el diario', getDoc(D('entrenador', 'nutrition_meals', 'm1')), false);

/* ── WT: peso (edición del bloque vivo) ── */
await T('WT1 su coach LEE el peso', getDoc(D('coach', 'nutrition_weight', 'alumna_2026-11-03')), N);
await T('WT2 su coach registra SOLO peso con autoría', setDoc(D('coach', 'nutrition_weight', 'alumna_2026-11-05'), { ownerUid: 'alumna', date: '2026-11-05', weight: 79, byUid: 'coach', byRole: 'nutricionista' }), N);
await T('WT2b el coach NO escribe composición (AUTH-153 intacto)', setDoc(D('coach', 'nutrition_weight', 'alumna_2026-11-07'), { ownerUid: 'alumna', weight: 79, fat: 20, byUid: 'coach', byRole: 'nutricionista' }), false);
await T('WT2c el coach NO registra peso para quien no es su alumno', setDoc(D('coach', 'nutrition_weight', 'intruso_2026-11-05'), { ownerUid: 'intruso', weight: 70, byUid: 'coach', byRole: 'nutricionista' }), false);
await T('WT3 la alumna crea su peso solo-peso (vecino intacto)', setDoc(D('alumna', 'nutrition_weight', 'alumna_2026-11-06'), { ownerUid: 'alumna', kg: 79 }), true);

/* ── V: vecinos intactos ── */
await T('V1 propietario lee mail_templates', getDoc(D('dueno', 'app_settings', 'mail_templates')), true);
await T('V2 sin sesión lee el directorio de entrenadores', getDoc(D(null, 'trainer_directory', 'current')), true);
await T('V3 colección inventada sigue denegada', getDoc(D('alumna', 'no_existe', 'x')), false);
await T('V4 alumna lee su propio users', getDoc(D('alumna', 'users', 'alumna')), true);
await T('V5 entrenador NO lee el consentimiento', getDoc(D('entrenador', 'nutrition_consents', 'alumna')), false);

console.log('== ' + NOMBRE + ': ' + pass + ' PASS · ' + fail + ' FAIL ==');
try { appendFileSync('fallos.txt', 'RESUMEN ' + NOMBRE + ' pass=' + pass + ' fail=' + fail + '\n'); } catch {}
if (failures.length) console.log('::error title=RESUMEN::' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
