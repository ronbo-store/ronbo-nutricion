// RONBO FIT — Batería CI del delta «Función de variantes»
// (AUTH-2026-10-31-106). Usuarios FICTICIOS, emulador LOCAL.
// Nunca toca producción.
// El delta, sobre el texto vivo (ruleset 2d83cdb4, SHA-256
// 098fc990…), añade SOLO dos claves a dos listas cerradas de
// exercise_library: 'variantes' en el hasOnly de create y en el
// affectedKeys().hasOnly de update. Candidata SHA-256 f02566d7….
// La suite gemela (pruebas-reglas-variantes-vivo) corre los MISMOS
// casos contra el texto VIVO con las expectativas del delta
// invertidas donde el delta manda (marcadas con D).
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp
} from 'firebase/firestore';

const ESPERA_DELTA = false; // true = CANDIDATO (el delta admite lo suyo); false = VIVO (todo el delta denegado)
const NOMBRE = 'VARIANTES-VIVO';

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
const D = ESPERA_DELTA; // expectativa «pasa solo con el delta»

// Una variante válida de referencia (las reglas NO validan su
// interior: solo la clave 'variantes' entra en las listas).
const VAR = [{ nombre_es: 'Alta', nombre_en: 'High',
  cambio_es: 'Los pies van arriba del todo de la plataforma.',
  cambio_en: 'Feet at the very top of the platform.',
  enfasis_es: 'Glúteos y parte trasera del muslo',
  enfasis_en: 'Glutes and back of the thigh',
  nota_es: '', nota_en: '', es_estandar: false,
  foto_url: 'https://example.com/alta.gif' }];
const VAR2 = [...VAR, { nombre_es: 'Estándar', nombre_en: 'Standard',
  cambio_es: '', cambio_en: '', enfasis_es: '', enfasis_en: '',
  nota_es: '', nota_en: '', es_estandar: true }];

// Formas de creación válidas según la cláusula viva.
const creaAdmin = (extra) => ({ nombre_es: 'Prensa de piernas ficticia',
  createdBy: 'owner1', createdByName: 'Admin Ficticio',
  createdAt: serverTimestamp(), estado: 'aprobado',
  approvedBy: 'owner1', approvedAt: serverTimestamp(), ...extra });
const creaCoach = (extra) => ({ nombre_es: 'Jalón ficticio',
  createdBy: 'coach1', createdByName: 'Entrenador Uno',
  createdAt: serverTimestamp(), estado: 'pendiente', ...extra });

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false,
    approved: false, role: 'usuario', trainerUid: null,
    assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, approved: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'coach1'), { ...base, name: 'Entrenador Uno', role: 'entrenador', approved: true, assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'alu1'), { ...base, name: 'Alumna Una', approved: true, assignmentStatus: 'assigned', trainerUid: 'coach1' });
  await setDoc(doc(db, 'users', 'pend1'), { ...base, name: 'Pendiente Uno' });
  // Ficha aprobada del administrador (update con/sin variantes).
  await setDoc(doc(db, 'exercise_library', 'exAdmin'), { nombre_es: 'Prensa de piernas ficticia',
    createdBy: 'owner1', createdByName: 'Admin Ficticio', createdAt: new Date('2026-10-30T10:00:00Z'),
    estado: 'aprobado', approvedBy: 'owner1', approvedAt: new Date('2026-10-30T10:00:00Z') });
  // Fichas pendientes del entrenador (update propio con/sin variantes).
  await setDoc(doc(db, 'exercise_library', 'exPendCoach'), { nombre_es: 'Jalón ficticio',
    createdBy: 'coach1', createdByName: 'Entrenador Uno', createdAt: new Date('2026-10-30T10:05:00Z'), estado: 'pendiente' });
  await setDoc(doc(db, 'exercise_library', 'exPendCoach2'), { nombre_es: 'Remo ficticio',
    createdBy: 'coach1', createdByName: 'Entrenador Uno', createdAt: new Date('2026-10-30T10:06:00Z'), estado: 'pendiente' });
  // Ficha de fábrica (sin 'estado': lectura para aprobados).
  await setDoc(doc(db, 'exercise_library', 'exFabrica'), { nombre_es: 'Sentadilla ficticia' });
  // Ficha aprobada para la prueba de borrado del administrador.
  await setDoc(doc(db, 'exercise_library', 'exBorrar'), { nombre_es: 'Ficha a borrar',
    createdBy: 'owner1', createdByName: 'Admin Ficticio', createdAt: new Date('2026-10-30T10:07:00Z'),
    estado: 'aprobado', approvedBy: 'owner1', approvedAt: new Date('2026-10-30T10:07:00Z') });
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const LIB = (db, id) => doc(db, 'exercise_library', id);

// ---- Crear ----
await T('VAR V1 admin crea ficha SIN variantes: admitido',
  setDoc(LIB(dbOf('owner1'), 'nuevaSinVar'), creaAdmin({})), true);
await T('VAR V2 admin crea ficha CON variantes: ' + (D ? 'admitido' : 'denegado (vivo)'),
  setDoc(LIB(dbOf('owner1'), 'nuevaConVar'), creaAdmin({ variantes: VAR2 })), D);
await T('VAR V3 entrenador crea su ficha pendiente CON variantes: ' + (D ? 'admitido' : 'denegado (vivo)'),
  setDoc(LIB(dbOf('coach1'), 'nuevaCoachVar'), creaCoach({ variantes: VAR })), D);
await T('VAR V4 entrenador crea su ficha pendiente SIN variantes: admitido',
  setDoc(LIB(dbOf('coach1'), 'nuevaCoachSin'), creaCoach({})), true);
await T('VAR V5 ALUMNO intenta crear una ficha (aunque nazca pendiente): denegado',
  setDoc(LIB(dbOf('alu1'), 'nuevaAlumno'), { nombre_es: 'X', createdBy: 'alu1', createdByName: 'Alumna Una', createdAt: serverTimestamp(), estado: 'pendiente' }), false);
await T('VAR V6 admin crea ficha con un campo raíz NO listado: denegado (la lista sigue cerrada)',
  setDoc(LIB(dbOf('owner1'), 'nuevaRara'), creaAdmin({ campo_raro: 1 })), false);
await T('VAR V7 admin crea ficha con variantes Y un campo no listado: denegado (el delta abre SOLO «variantes»)',
  setDoc(LIB(dbOf('owner1'), 'nuevaRara2'), creaAdmin({ variantes: VAR, campo_raro: 1 })), false);
await T('VAR V8 entrenador crea su ficha ya «aprobado» (auto-aprobación): denegado',
  setDoc(LIB(dbOf('coach1'), 'nuevaCoachAprob'), { ...creaCoach({}), estado: 'aprobado', approvedBy: 'coach1', approvedAt: serverTimestamp() }), false);
await T('VAR V9 usuario NO aprobado intenta crear: denegado',
  setDoc(LIB(dbOf('pend1'), 'nuevaPend'), { nombre_es: 'X', createdBy: 'pend1', createdByName: 'Pendiente Uno', createdAt: serverTimestamp(), estado: 'pendiente' }), false);
await T('VAR V10 admin crea con createdBy AJENO: denegado',
  setDoc(LIB(dbOf('owner1'), 'nuevaAjena'), creaAdmin({ createdBy: 'coach1' })), false);

// ---- Actualizar ----
await T('VAR V11 admin añade variantes a su ficha aprobada: ' + (D ? 'admitido' : 'denegado (vivo)'),
  updateDoc(LIB(dbOf('owner1'), 'exAdmin'), { variantes: VAR, updatedAt: serverTimestamp(), updatedBy: 'owner1' }), D);
await T('VAR V12 admin actualiza su ficha aprobada SIN tocar variantes (foto_url): admitido',
  updateDoc(LIB(dbOf('owner1'), 'exAdmin'), { foto_url: 'https://example.com/base.jpg', updatedAt: serverTimestamp(), updatedBy: 'owner1' }), true);
await T('VAR V13 entrenador añade variantes a SU ficha pendiente: ' + (D ? 'admitido' : 'denegado (vivo)'),
  updateDoc(LIB(dbOf('coach1'), 'exPendCoach'), { variantes: VAR, updatedAt: serverTimestamp(), updatedBy: 'coach1' }), D);
await T('VAR V14 entrenador actualiza SU ficha pendiente sin variantes (el nombre): admitido',
  updateDoc(LIB(dbOf('coach1'), 'exPendCoach2'), { nombre_es: 'Remo ficticio editado', updatedAt: serverTimestamp(), updatedBy: 'coach1' }), true);
await T('VAR V15 entrenador intenta actualizar la ficha APROBADA del admin: denegado',
  updateDoc(LIB(dbOf('coach1'), 'exAdmin'), { nombre_es: 'Intruso', updatedAt: serverTimestamp(), updatedBy: 'coach1' }), false);
await T('VAR V16 alumno intenta actualizar una ficha de fábrica: denegado',
  updateDoc(LIB(dbOf('alu1'), 'exFabrica'), { nombre_es: 'Intruso', updatedAt: serverTimestamp(), updatedBy: 'alu1' }), false);
await T('VAR V17 admin actualiza con un campo NO listado en affectedKeys: denegado',
  updateDoc(LIB(dbOf('owner1'), 'exAdmin'), { campo_raro: 1, updatedAt: serverTimestamp(), updatedBy: 'owner1' }), false);

// ---- Leer y borrar (sin cambios del delta) ----
await T('VAR V18 alumno aprobado LEE una ficha de fábrica: admitido',
  getDoc(LIB(dbOf('alu1'), 'exFabrica')), true);
await T('VAR V19 usuario NO aprobado lee una ficha: denegado',
  getDoc(LIB(dbOf('pend1'), 'exFabrica')), false);
await T('VAR V20 alumno intenta BORRAR una ficha: denegado',
  deleteDoc(LIB(dbOf('alu1'), 'exFabrica')), false);
await T('VAR V21 admin BORRA su ficha aprobada de prueba: admitido',
  deleteDoc(LIB(dbOf('owner1'), 'exBorrar')), true);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
