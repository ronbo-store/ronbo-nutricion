// RONBO FIT — Batería CI del delta «daySummary» (punto 18 de la
// cola de despliegue 2026-11-01, piezas A+B; delta APROBADO por
// Ronald el 2026-11-02 12:05 CST, widget-15621c42). Usuarios
// FICTICIOS, emulador oficial. Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 6adb18d5-78af-45d2-bfcd-3b34f791d5ab, SHA-256 f20a3a6f…;
// candidata SHA-256 80f5babf…), añade SOLO dos cosas dentro de la
// rama de datos inofensivos de la escritura propia de users/{uid}:
//   1. 'daySummary' al final de la lista hasOnly de la rama.
//   2. Su guarda de forma cerrada: mapa con claves
//      hasOnly(['on','time','tz']); 'on' booleano; 'time' cadena
//      con patrón ^([01][0-9]|2[0-3]):(00|30)$; 'tz' cadena de
//      hasta 64 caracteres (las claves pueden venir parciales).
// Todo lo demás queda byte a byte (diff de la candidata contra el
// texto vivo: dos trozos, ambos dentro de esta rama).
//
// La suite gemela (pruebas-reglas-daysummary-vivo) corre los
// MISMOS casos contra el texto VIVO con las expectativas del
// delta invertidas (DS1, DS2, DS3 y DS13 denegados allí).
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc
} from 'firebase/firestore';

const ESPERA_DELTA_OK = true; // candidato: true · vivo: false
const NOMBRE = 'DAYSUMMARY-CANDIDATO';

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
    console.log('FAIL — ' + name + ' :: ' + String(e && e.message || e).slice(0, 140));
  }
}

const dbOf = (uid) => uid ? testEnv.authenticatedContext(uid).firestore()
  : testEnv.unauthenticatedContext().firestore();

async function seedUser(uid, extra) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), Object.assign({
      name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true, trainerUid: 'coach'
    }, extra || {}));
  });
}

const udoc = (db, uid) => doc(db, 'users', uid);
const wDS = (db, uid, ds) => setDoc(udoc(db, uid), { daySummary: ds }, { merge: true });
const DS_OK = { on: true, time: '05:00', tz: 'America/Chicago' };

await seedUser('alu');                // alumna aprobada con sesión
await seedUser('otra');               // otra usuaria aprobada, ajena
await seedUser('coach', { role: 'entrenador', trainerUid: null });

// ---- EL DELTA: la propia escribe su daySummary con la forma cerrada ----
await T('DS1 la PROPIA escribe su daySummary COMPLETO válido {on,time,tz}: ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  wDS(dbOf('alu'), 'alu', DS_OK), ESPERA_DELTA_OK);
await T('DS2 la PROPIA escribe su daySummary PARCIAL {tz} (la guarda de zona al abrir el perfil): ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  wDS(dbOf('alu'), 'alu', { tz: 'America/Chicago' }), ESPERA_DELTA_OK);
await T('DS3 la PROPIA escribe su daySummary PARCIAL {on:false} (apagar): ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  wDS(dbOf('alu'), 'alu', { on: false }), ESPERA_DELTA_OK);
await T('DS13 la PROPIA escribe daySummary válido JUNTO a name (ambos de la rama inofensiva): ' + (ESPERA_DELTA_OK ? 'admitido (el delta)' : 'DENEGADO (texto vivo)'),
  setDoc(udoc(dbOf('alu'), 'alu'), { name: 'Ficticia alu', daySummary: DS_OK }, { merge: true }), ESPERA_DELTA_OK);

// ---- Formas inválidas: denegadas en AMBOS textos ----
await T('DS4 time fuera de paso "05:15": denegado en ambos textos',
  wDS(dbOf('alu'), 'alu', { on: true, time: '05:15', tz: 'America/Chicago' }), false);
await T('DS5 time inexistente "24:00": denegado en ambos textos',
  wDS(dbOf('alu'), 'alu', { on: true, time: '24:00', tz: 'America/Chicago' }), false);
await T('DS6 time sin cero inicial "5:00": denegado en ambos textos',
  wDS(dbOf('alu'), 'alu', { on: true, time: '5:00', tz: 'America/Chicago' }), false);
await T('DS7 clave de más en el mapa {on,time,tz,extra}: denegado en ambos textos',
  wDS(dbOf('alu'), 'alu', { on: true, time: '05:00', tz: 'America/Chicago', extra: 1 }), false);
await T('DS8 on NO booleano ("true" cadena): denegado en ambos textos',
  wDS(dbOf('alu'), 'alu', { on: 'true', time: '05:00', tz: 'America/Chicago' }), false);
await T('DS9 tz de 65 caracteres: denegado en ambos textos',
  wDS(dbOf('alu'), 'alu', { on: true, time: '05:00', tz: 'A'.repeat(65) }), false);
await T('DS10 daySummary que NO es mapa (cadena): denegado en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { daySummary: 'si' }, { merge: true }), false);
await T('DS14 daySummary válido JUNTO a approved (campo privilegiado): denegado en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { daySummary: DS_OK, approved: true }, { merge: true }), false);

// ---- Nadie escribe el daySummary AJENO ----
await T('DS11 OTRA usuaria escribe el daySummary de alu (forma válida): denegado en ambos textos',
  wDS(dbOf('otra'), 'alu', DS_OK), false);
await T('DS12 SIN sesión se escribe el daySummary de alu: denegado en ambos textos',
  wDS(dbOf(null), 'alu', DS_OK), false);

// ---- REGRESIÓN: la rama inofensiva se comporta idéntica sin el delta ----
await T('R1 la PROPIA escribe su mailLang "es": admitido en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { mailLang: 'es' }, { merge: true }), true);
await T('R2 la PROPIA escribe su mailLang "fr": denegado en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { mailLang: 'fr' }, { merge: true }), false);
await T('R3 la PROPIA escribe su name: admitido en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { name: 'Ficticia alu' }, { merge: true }), true);
await T('R4 la PROPIA escribe su purpose "cuenta": admitido en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { purpose: 'cuenta' }, { merge: true }), true);
await T('R5 la PROPIA escribe su purpose "administrador": denegado en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { purpose: 'administrador' }, { merge: true }), false);
await T('R6 la PROPIA escribe su fdCamAt (cadena): admitido en ambos textos',
  setDoc(udoc(dbOf('alu'), 'alu'), { fdCamAt: '2026-11-02T12:00:00.000Z' }, { merge: true }), true);
await T('R7 la PROPIA lee su propio documento: admitido en ambos textos',
  getDoc(udoc(dbOf('alu'), 'alu')), true);
await T('R8 OTRA usuaria lee el documento de alu: denegado en ambos textos',
  getDoc(udoc(dbOf('otra'), 'alu')), false);

console.log('== ' + NOMBRE + ': ' + pass + ' PASS · ' + fail + ' FAIL ==');
if (failures.length) console.log('FALLOS: ' + failures.join(' | '));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
