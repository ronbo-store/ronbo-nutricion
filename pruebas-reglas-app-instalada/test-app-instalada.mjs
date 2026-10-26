// RONBO NUTRI — Batería CI del delta APP INSTALADA VISIBLE
// (2026-10-26). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción. Banco de reglas: ./firestore.rules = candidato de
// publicación (texto vivo verificado 0c2ce641, SHA-256 e5e9452f…,
// + SOLO el delta appInstall; candidato SHA-256 7900d3bb…).
//
// Forma REAL que escribe la app (pieza A del paquete): el PROPIO
// usuario, al abrir la app en modo instalado/standalone, escribe en
// su users/{uid} — SOLO y con serverTimestamp():
//   { appInstall: { everInstalled: true, lastStandaloneAt: TS } }
// mediante setDoc(..., { merge: true }) (= updateDoc aquí).
// El delta la admite SOLO en la rama isSelf del dueño (la rama del
// motor de metas, con 'appInstall' en su lista cerrada + cláusula
// de forma cerrada). El entrenador NO tiene rama para este campo;
// el administrador conserva su rama vigente de propietario.
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
  await setDoc(doc(db, 'users', 'clientA'), {
    ...base, name: 'Cliente A', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned',
    consentSeq: 3, termsVersion: 'v3-2026-10-16',
    goals: { kcal: 2100, prot: 140, carb: 200, azuc: 26, gras: 60 }
  });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', role: 'usuario', trainerUid: 'trainer2', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  await setDoc(doc(db, 'users', 'clientD'), { ...base, name: 'Cliente D', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', approved: false, consentSeq: 3, termsVersion: 'v3-2026-10-16' });
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const tr2 = testEnv.authenticatedContext('trainer2').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const B = testEnv.authenticatedContext('clientB').firestore();
const D = testEnv.authenticatedContext('clientD').firestore();
const ANON = testEnv.unauthenticatedContext().firestore();
const USR = (db, uid) => doc(db, 'users', uid);
const TS = serverTimestamp();
const SIGNAL = { everInstalled: true, lastStandaloneAt: TS };

// ============ AI — appInstall: la señal del propio usuario ============
await T('AI01 el dueño escribe su señal con la forma real (everInstalled:true + hora del servidor), sola',
  updateDoc(USR(A, 'clientA'), { appInstall: SIGNAL }), true);
await T('AI02 el dueño REFRESCA su señal (segunda escritura, misma forma): admitida',
  updateDoc(USR(A, 'clientA'), { appInstall: SIGNAL }), true);
{
  // Verificación de datos: lo guardado es la señal, no otra cosa.
  let okData = false;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), 'users', 'clientA'));
    const ai = s.exists() ? s.data().appInstall : null;
    okData = !!ai && ai.everInstalled === true && !!ai.lastStandaloneAt && Object.keys(ai).length === 2;
  });
  if (okData) { pass++; console.log('PASS — AI02b lo guardado es exactamente {everInstalled:true, lastStandaloneAt:timestamp}'); }
  else { fail++; failures.push('AI02b datos'); console.log('FAIL — AI02b lo guardado no es la señal exacta'); }
}
await T('AI03 señal con everInstalled:false: denegada (la señal no es un estado libre)',
  updateDoc(USR(B, 'clientB'), { appInstall: { everInstalled: false, lastStandaloneAt: TS } }), false);
await T('AI04 señal con clave extra (device): denegada (forma cerrada)',
  updateDoc(USR(B, 'clientB'), { appInstall: { everInstalled: true, lastStandaloneAt: TS, device: 'ios' } }), false);
await T('AI05 señal con lastStandaloneAt literal (fecha del cliente): denegada',
  updateDoc(USR(B, 'clientB'), { appInstall: { everInstalled: true, lastStandaloneAt: new Date('2030-01-01T00:00:00Z') } }), false);
await T('AI06 señal SIN lastStandaloneAt: denegada',
  updateDoc(USR(B, 'clientB'), { appInstall: { everInstalled: true } }), false);
await T('AI07 señal SIN everInstalled: denegada',
  updateDoc(USR(B, 'clientB'), { appInstall: { lastStandaloneAt: TS } }), false);
await T('AI08 señal como texto (no mapa): denegada',
  updateDoc(USR(B, 'clientB'), { appInstall: 'yes' }), false);
await T('AI09 un usuario escribe la señal en el documento de OTRO: denegado',
  updateDoc(USR(A, 'clientB'), { appInstall: SIGNAL }), false);
await T('AI10 el entrenador ASIGNADO escribe la señal de su cliente: denegado (sin rama)',
  updateDoc(USR(tr1, 'clientA'), { appInstall: SIGNAL }), false);
await T('AI11 un entrenador NO asignado escribe la señal de un cliente: denegado',
  updateDoc(USR(tr2, 'clientA'), { appInstall: SIGNAL }), false);
await T('AI12 sin sesión se escribe una señal: denegado',
  updateDoc(USR(ANON, 'clientB'), { appInstall: SIGNAL }), false);
await T('AI13 el administrador escribe la señal en un cliente por su rama vigente de propietario: admitida',
  updateDoc(USR(owner, 'clientB'), { appInstall: SIGNAL }), true);
await T('AI14 señal + goals saneados en la MISMA escritura del dueño: admitida (misma rama)',
  updateDoc(USR(A, 'clientA'), { appInstall: SIGNAL, goals: { kcal: 2000, prot: 130, carb: 210, azuc: 25, gras: 55 } }), true);
await T('AI15 señal + approved colado: denegada (ninguna rama del alumno abre approved)',
  updateDoc(USR(D, 'clientD'), { appInstall: SIGNAL, approved: true }), false);
await T('AI16 señal + name en la misma escritura: denegada (la señal viaja sola; el nombre va por su rama)',
  updateDoc(USR(B, 'clientB'), { appInstall: SIGNAL, name: 'Cliente B' }), false);
await T('AI17 un ENTRENADOR escribe su PROPIA señal: admitida (la señal es de cualquier cuenta)',
  updateDoc(USR(tr1, 'trainer1'), { appInstall: SIGNAL }), true);

console.log(`APP-INSTALADA: ${pass} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
