// RONBO FIT — Batería CI del delta «Curaduría SOLO Ronald»
// (corrección de P3 por la palabra de Ronald del 2026-10-31:
// «solamente yo, nadie más»). El delta, sobre el texto vivo
// (ruleset 15e87534, SHA-256 f02566d7…), cambia SOLO el cuerpo de
// isCuratorUser() — de «isAdminUser() || isTrainerUser()» a
// «isAdminUser()» — más los comentarios que registran la
// corrección. Candidata SHA-256 7b26c0cf….
// La suite gemela (pruebas-reglas-foodcur-vivo) corre los MISMOS
// casos contra el texto VIVO con las expectativas del delta
// invertidas donde el delta manda (el entrenador SÍ curaba).
// Usuarios FICTICIOS, emulador LOCAL. Nunca toca producción.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, serverTimestamp, addDoc
} from 'firebase/firestore';

const ESPERA_DELTA = true; // true = CANDIDATO (curador = solo admin); false = VIVO (curaba también el entrenador)
const NOMBRE = "FOODCUR-CANDIDATO";

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
const D = ESPERA_DELTA; // expectativa «pasa solo SIN el delta» (lo que el entrenador podía como curador)

const VALS = { name: 'Pechuga de pollo a la plancha', nameKey: 'pechuga de pollo a la plancha',
  qtyNum: 150, qtyUnit: 'g', kcal: 248, prot: 46, carb: 0, sugar: 0, fat: 5.4 };

// ---- Seed (sin reglas) ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = { acceptedTerms: true, adultConfirmed: true, isOwner: false, approved: false,
    role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', modality: 'virtual' };
  await setDoc(doc(db, 'users', 'owner1'), { ...base, name: 'Admin Ficticio', isOwner: true, approved: true, role: 'administrador' });
  await setDoc(doc(db, 'users', 'coach1'), { ...base, name: 'Entrenador Uno', role: 'entrenador', approved: true, assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'alu1'), { ...base, name: 'Alumna Una', approved: true, assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'alu2'), { ...base, name: 'Alumno Dos', approved: true, assignmentStatus: 'assigned' });
  await setDoc(doc(db, 'users', 'pend1'), { ...base, name: 'Pendiente Uno' });
  await setDoc(doc(db, 'food_library', 'fichaPub1'), { ...VALS });
  await setDoc(doc(db, 'food_library', 'fichaDelCoach'), { name: 'Arroz blanco cocido', nameKey: 'arroz blanco cocido', qtyNum: 100, qtyUnit: 'g', kcal: 130, prot: 2.7, carb: 28, sugar: 0.1, fat: 0.3 });
  await setDoc(doc(db, 'food_library', 'fichaDelOwner'), { name: 'Avena en hojuelas', nameKey: 'avena en hojuelas', qtyNum: 40, qtyUnit: 'g', kcal: 154, prot: 5.3, carb: 27, sugar: 0.4, fat: 2.6 });
  await setDoc(doc(db, 'food_contrib', 'aporteA'), { kind: 'aporte', ...VALS, flags: [], contributorUid: 'alu1', estado: 'pendiente', createdAt: new Date('2026-10-31T10:00:00Z') });
  await setDoc(doc(db, 'food_contrib', 'aporteB'), { kind: 'aporte', name: 'Yogur griego Chobani 0%', nameKey: 'yogur griego chobani 0%', qtyNum: 170, qtyUnit: 'g', kcal: 100, prot: 17, carb: 6, sugar: 5, fat: 0, flags: ['atwater'], contributorUid: 'alu2', estado: 'pendiente', createdAt: new Date('2026-10-31T10:05:00Z') });
  await setDoc(doc(db, 'food_contrib', 'aporteCoach'), { kind: 'aporte', name: 'Huevo cocido', nameKey: 'huevo cocido', qtyNum: 1, qtyUnit: 'unidad', pieceGrams: 50, kcal: 78, prot: 6.3, carb: 0.6, sugar: 0.6, fat: 5.3, flags: [], contributorUid: 'coach1', estado: 'pendiente', createdAt: new Date('2026-10-31T10:10:00Z') });
  await setDoc(doc(db, 'food_contrib', 'reporteR'), { kind: 'reporte', publicId: 'fichaPub1', foodName: 'Pechuga de pollo a la plancha', reason: 'valores', reporterUid: 'alu1', estado: 'pendiente', createdAt: new Date('2026-10-31T11:00:00Z') });
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const CONTRIB = (db, id) => doc(db, 'food_contrib', id);
const LIB = (db, id) => doc(db, 'food_library', id);
const nuevoAporte = (db, uid) => addDoc(collection(db, 'food_contrib'),
  { kind: 'aporte', ...VALS, flags: [], contributorUid: uid, estado: 'pendiente', createdAt: serverTimestamp() });

// ---- La entrada automática sigue abierta a TODO aprobado (como autor) ----
await T('FC1 alumna aprobada crea su candidato (la vía del candidato automático): admitido',
  nuevoAporte(dbOf('alu1'), 'alu1'), true);
await T('FC2 el ENTRENADOR como AUTOR crea SU candidato (su comida también pasa por la bandeja): admitido',
  nuevoAporte(dbOf('coach1'), 'coach1'), true);
await T('FC3 usuario NO aprobado intenta crear candidato: denegado',
  nuevoAporte(dbOf('pend1'), 'pend1'), false);

// ---- EL DELTA: el entrenador deja de ser curador ----
await T('FC4 ENTRENADOR lista la bandeja (estado == pendiente): ' + (D ? 'DENEGADA (solo admin)' : 'admitida (vivo: curaba)'),
  getDocs(query(collection(dbOf('coach1'), 'food_contrib'), where('estado', '==', 'pendiente'))), !D);
await T('FC5 ENTRENADOR lee el aporte AJENO (aporteB): ' + (D ? 'DENEGADO' : 'admitido (vivo)'),
  getDoc(CONTRIB(dbOf('coach1'), 'aporteB')), !D);
await T('FC6 ENTRENADOR aprueba el aporte ajeno: ' + (D ? 'DENEGADO' : 'admitido (vivo)'),
  updateDoc(CONTRIB(dbOf('coach1'), 'aporteB'), { estado: 'aprobado', publicId: 'fichaPub1', resolvedBy: 'coach1', resolvedAt: serverTimestamp() }), !D);
await T('FC7 ENTRENADOR publica directo en food_library: ' + (D ? 'DENEGADO' : 'admitido (vivo)'),
  setDoc(LIB(dbOf('coach1'), 'fichaCoachNueva'), { name: 'Atun en agua', nameKey: 'atun en agua', qtyNum: 120, qtyUnit: 'g', kcal: 132, prot: 28, carb: 0, sugar: 0, fat: 1.2 }), !D);
await T('FC8 ENTRENADOR corrige una ficha pública: ' + (D ? 'DENEGADO' : 'admitido (vivo)'),
  updateDoc(LIB(dbOf('coach1'), 'fichaPub1'), { kcal: 250 }), !D);
await T('FC9 ENTRENADOR retira una ficha pública: ' + (D ? 'DENEGADO' : 'admitido (vivo)'),
  deleteDoc(LIB(dbOf('coach1'), 'fichaDelCoach')), !D);
await T('FC10 ENTRENADOR resuelve el reporte: ' + (D ? 'DENEGADO' : 'admitido (vivo)'),
  updateDoc(CONTRIB(dbOf('coach1'), 'reporteR'), { estado: 'resuelto', resolvedBy: 'coach1', resolvedAt: serverTimestamp() }), !D);
await T('FC11 ENTRENADOR borra el aporte ajeno pendiente: ' + (D ? 'DENEGADO' : 'admitido (vivo)'),
  deleteDoc(CONTRIB(dbOf('coach1'), 'aporteA')), !D);

// ---- El entrenador como AUTOR conserva lo suyo ----
await T('FC12 ENTRENADOR lista SOLO lo suyo (contributorUid == el): admitido',
  getDocs(query(collection(dbOf('coach1'), 'food_contrib'), where('contributorUid', '==', 'coach1'))), true);
await T('FC13 ENTRENADOR lee SU aporte: admitido',
  getDoc(CONTRIB(dbOf('coach1'), 'aporteCoach')), true);
await T('FC14 ENTRENADOR lee la biblioteca pública (para buscar): admitido',
  getDocs(collection(dbOf('coach1'), 'food_library')), true);

// ---- El administrador cura TODO (sin cambio) ----
await T('FC15 ADMINISTRADOR lista la bandeja: admitido',
  getDocs(query(collection(dbOf('owner1'), 'food_contrib'), where('estado', '==', 'pendiente'))), true);
await T('FC16 ADMINISTRADOR aprueba el aporte de alu2: admitido',
  updateDoc(CONTRIB(dbOf('owner1'), 'aporteB'), { estado: 'aprobado', publicId: 'fichaPub1', resolvedBy: 'owner1', resolvedAt: serverTimestamp() }), true);
await T('FC17 ADMINISTRADOR publica directo en food_library: admitido',
  setDoc(LIB(dbOf('owner1'), 'fichaOwnerNueva'), { name: 'Leche entera', nameKey: 'leche entera', qtyNum: 250, qtyUnit: 'ml', kcal: 150, prot: 8, carb: 12, sugar: 12, fat: 8 }), true);
await T('FC18 ADMINISTRADOR corrige una ficha pública: admitido',
  updateDoc(LIB(dbOf('owner1'), 'fichaPub1'), { kcal: 249 }), true);
await T('FC19 ADMINISTRADOR retira una ficha pública: admitido',
  deleteDoc(LIB(dbOf('owner1'), 'fichaDelOwner')), true);
await T('FC20 ADMINISTRADOR resuelve el reporte: admitido',
  updateDoc(CONTRIB(dbOf('owner1'), 'reporteR'), { estado: 'resuelto', resolvedBy: 'owner1', resolvedAt: serverTimestamp() }), true);

// ---- El alumno: lo suyo sí; la curaduría, jamás ----
await T('FC21 alumna lista SOLO lo suyo: admitido',
  getDocs(query(collection(dbOf('alu1'), 'food_contrib'), where('contributorUid', '==', 'alu1'))), true);
await T('FC22 alumna intenta la bandeja: denegado',
  getDocs(query(collection(dbOf('alu1'), 'food_contrib'), where('estado', '==', 'pendiente'))), false);
await T('FC23 alumna lee el aporte AJENO: denegado',
  getDoc(CONTRIB(dbOf('alu2'), 'aporteA')), false);
await T('FC24 alumna escribe directo en food_library: denegado',
  setDoc(LIB(dbOf('alu1'), 'fichaDirecta'), { ...VALS }), false);
await T('FC25 alumna lee la biblioteca pública (para buscar): admitido',
  getDocs(collection(dbOf('alu1'), 'food_library')), true);

// ---- Regresión: nutrition_meals intacto ----
await T('FC26 regresión: la alumna crea SU comida de siempre en nutrition_meals: admitido',
  addDoc(collection(dbOf('alu1'), 'nutrition_meals'), { ownerUid: 'alu1', date: '2026-10-31', meal: 'Almuerzo', food: 'Pollo', qty: '150 g', kcal: 248, prot: 46, carb: 0, sugar: 0, fat: 5.4, notes: '', createdAt: serverTimestamp() }), true);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
