// RONBO FIT — Batería del delta de reglas «NOMBRAMIENTO»
// (AUTH-2026-11-05-263) contra el emulador oficial de Firestore
// (proyecto ficticio, sin secretos ni datos reales).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → contra la CANDIDATA: el propietario puede
//                        CREAR el perfil de coach YA APROBADO y la
//                        membresía YA ACTIVA de un usuario
//                        registrado, SOLO con la marca de origen
//                        'admin_appointment'; todo lo demás igual.
//   ESPERA_NUEVO=false → contra el texto VIVO cb96c3a1: esos dos
//                        creates están denegados (el hueco).
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

const DUENO = 'dueno', T = 'nombrado', T2 = 'nombrado2', OTRO = 'otroAprobado';
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: true, isOwner: true });
  await setDoc(doc(db, 'users', T), { name: 'Nombrado', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', T2), { name: 'Nombrado Dos', role: 'usuario', approved: true });
  await setDoc(doc(db, 'users', OTRO), { name: 'Otro', role: 'usuario', approved: true });
});
const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();
const F = await import('firebase/firestore');
const { doc, setDoc, updateDoc } = F;

const perfilNombramiento = { displayName: 'Nombrado', status: 'aprobado', origin: 'admin_appointment', activeClients: 0 };
const membresiaNombramiento = { level: null, status: 'activa', origin: 'admin_appointment', source: 'gratis' };

/* el delta: SOLO estos dos creates cambian con ESPERA_NUEVO */
await caso('dueño crea perfil de coach APROBADO con origen (nombramiento)',
  setDoc(doc(dbDe(DUENO), 'nutritionist_profiles', T), perfilNombramiento), ESPERA_NUEVO);
await caso('dueño crea membresía de coach ACTIVA con origen (nombramiento)',
  setDoc(doc(dbDe(DUENO), 'nutritionist_memberships', T), membresiaNombramiento), ESPERA_NUEVO);

/* invariantes: denegados con y sin delta */
await caso('dueño crea perfil aprobado SIN marca de origen → denegado',
  setDoc(doc(dbDe(DUENO), 'nutritionist_profiles', T2), { displayName: 'X', status: 'aprobado', activeClients: 0 }), false);
await caso('dueño crea perfil PENDIENTE con origen para otro → denegado (esa vía es la postulación propia)',
  setDoc(doc(dbDe(DUENO), 'nutritionist_profiles', T2), { displayName: 'X', status: 'pendiente', origin: 'admin_appointment', activeClients: 0 }), false);
await caso('dueño crea membresía activa SIN marca de origen → denegado',
  setDoc(doc(dbDe(DUENO), 'nutritionist_memberships', T2), { level: null, status: 'activa', source: 'gratis' }), false);
await caso('un aprobado NO dueño crea perfil aprobado con origen para otro → denegado',
  setDoc(doc(dbDe(OTRO), 'nutritionist_profiles', T2), perfilNombramiento), false);
await caso('el propio usuario se autoaprueba como coach (aprobado+origen) → denegado',
  setDoc(doc(dbDe(T2), 'nutritionist_profiles', T2), perfilNombramiento), false);
await caso('el propio usuario se autoactiva la membresía (activa+origen) → denegado',
  setDoc(doc(dbDe(T2), 'nutritionist_memberships', T2), membresiaNombramiento), false);

/* caminos existentes intactos en ambas suites */
await caso('postulación propia: perfil nace pendiente (camino de siempre)',
  setDoc(doc(dbDe(T2), 'nutritionist_profiles', T2), { displayName: 'Nombrado Dos', status: 'pendiente', activeClients: 0 }), true);
await caso('registro propio: membresía nace sin_membresia (camino de siempre)',
  setDoc(doc(dbDe(T2), 'nutritionist_memberships', T2), { level: null, status: 'sin_membresia', source: 'gratis' }), true);
await caso('dueño actualiza el perfil del coach (aprobación de siempre)',
  updateDoc(doc(dbDe(DUENO), 'nutritionist_profiles', T2), { status: 'aprobado' }), true);

try { rmSync(new URL('./fallos.txt', import.meta.url)); } catch {}
if (fallos.length) writeFileSync(new URL('./fallos.txt', import.meta.url), fallos.join('\n') + '\n');
console.log(fallos.length ? `FALLOS: ${fallos.length}` : 'SIN FALLOS');
await testEnv.cleanup();
process.exit(fallos.length ? 1 : 0);
