// RONBO FIT — Batería CI del delta «Biblioteca comunitaria de
// alimentos» (decisiones P1-P5 de Ronald, 2026-10-30: opt-in
// expreso por alimento; anonimato ESTRUCTURAL de la ficha pública;
// curan administrador y entrenadores; también fichas de IA; marca
// en el nombre). Usuarios FICTICIOS, emulador LOCAL. Nunca toca
// producción.
// El delta, sobre el texto vivo (ruleset 629611a4, SHA-256
// 0d53712e…), añade SOLO: ayudantes isCuratorUser/foodBase/
// foodShapeOk y las cláusulas food_library + food_contrib tras
// nutrition_meals. Candidata SHA-256 9823865e….
// La suite gemela (pruebas-reglas-foodlib-vivo) corre los MISMOS
// casos contra el texto VIVO con las expectativas del delta
// invertidas donde el delta manda.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp, addDoc
} from 'firebase/firestore';

const ESPERA_DELTA = false; // VIVO: sin el delta, la comodín deniega todo lo nuevo
const NOMBRE = 'FOODLIB-VIVO';

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

// Valores de alimento válidos de referencia (pollo, 150 g).
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
  // Fichas públicas ya vivas (para lectura/update/delete).
  await setDoc(doc(db, 'food_library', 'fichaPub1'), { ...VALS });
  await setDoc(doc(db, 'food_library', 'fichaPub2'), { name: 'Arroz blanco cocido', nameKey: 'arroz blanco cocido', qtyNum: 100, qtyUnit: 'g', kcal: 130, prot: 2.7, carb: 28, sugar: 0.1, fat: 0.3 });
  // Aportes en la antesala: A = de alu1 pendiente (se muta en los casos del autor),
  // B = de alu2 pendiente (el entrenador lo aprueba), C = de alu1 rechazado (borrado del autor).
  await setDoc(doc(db, 'food_contrib', 'aporteA'), { kind: 'aporte', ...VALS, flags: [], contributorUid: 'alu1', estado: 'pendiente', createdAt: new Date('2026-10-30T10:00:00Z') });
  await setDoc(doc(db, 'food_contrib', 'aporteB'), { kind: 'aporte', name: 'Yogur griego Chobani 0%', nameKey: 'yogur griego chobani 0%', qtyNum: 170, qtyUnit: 'g', kcal: 100, prot: 17, carb: 6, sugar: 5, fat: 0, flags: ['atwater'], contributorUid: 'alu2', estado: 'pendiente', createdAt: new Date('2026-10-30T10:05:00Z') });
  await setDoc(doc(db, 'food_contrib', 'aporteC'), { kind: 'aporte', name: 'Avena en hojuelas', nameKey: 'avena en hojuelas', qtyNum: 40, qtyUnit: 'g', kcal: 154, prot: 5.3, carb: 27, sugar: 0.4, fat: 2.6, flags: [], contributorUid: 'alu1', estado: 'rechazado', rejectReason: 'valores', createdAt: new Date('2026-10-29T10:00:00Z') });
  // Un reporte pendiente (lo resuelve el entrenador).
  await setDoc(doc(db, 'food_contrib', 'reporteR'), { kind: 'reporte', publicId: 'fichaPub2', foodName: 'Arroz blanco cocido', reason: 'valores', reporterUid: 'alu1', estado: 'pendiente', createdAt: new Date('2026-10-30T11:00:00Z') });
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const CONTRIB = (db, id) => doc(db, 'food_contrib', id);
const LIB = (db, id) => doc(db, 'food_library', id);
const nuevoAporte = (db, extra) => addDoc(collection(db, 'food_contrib'),
  { kind: 'aporte', ...VALS, flags: [], contributorUid: 'alu1', estado: 'pendiente', createdAt: serverTimestamp(), ...extra });

// ---- Aportar (el opt-in nace en la antesala, nunca en la pública) ----
await T('FOODLIB FL1 alumno aprobado crea su aporte válido en pendiente: ' + (D ? 'admitido' : 'denegado (vivo)'),
  nuevoAporte(dbOf('alu1'), {}), D);
await T('FOODLIB FL2 alumno crea aporte ya «aprobado» (auto-aprobación): denegado',
  nuevoAporte(dbOf('alu1'), { estado: 'aprobado' }), false);
await T('FOODLIB FL3 alumno crea aporte con contributorUid AJENO: denegado',
  nuevoAporte(dbOf('alu1'), { contributorUid: 'alu2' }), false);
await T('FOODLIB FL4 alumno inyecta un campo de autoría («createdBy») en el aporte: denegado (lista cerrada)',
  nuevoAporte(dbOf('alu1'), { createdBy: 'alu1' }), false);
await T('FOODLIB FL5 densidad imposible (2000 kcal en 100 g): denegado',
  nuevoAporte(dbOf('alu1'), { qtyNum: 100, kcal: 2000, prot: 10, carb: 10, fat: 10 }), false);
await T('FOODLIB FL6 azúcares por encima de los carbos + 1: denegado',
  nuevoAporte(dbOf('alu1'), { carb: 10, sugar: 30 }), false);
await T('FOODLIB FL7 unidad sin pieceGrams: denegado',
  nuevoAporte(dbOf('alu1'), { qtyNum: 2, qtyUnit: 'unidad', kcal: 140, prot: 12, carb: 1, sugar: 0, fat: 10 }), false);
await T('FOODLIB FL7b unidad CON pieceGrams válido (2 piezas de 50 g): ' + (D ? 'admitido' : 'denegado (vivo)'),
  nuevoAporte(dbOf('alu1'), { qtyNum: 2, qtyUnit: 'unidad', pieceGrams: 50, kcal: 140, prot: 12, carb: 1, sugar: 0, fat: 10 }), D);
await T('FOODLIB FL8 usuario NO aprobado intenta aportar: denegado',
  addDoc(collection(dbOf('pend1'), 'food_contrib'), { kind: 'aporte', ...VALS, flags: [], contributorUid: 'pend1', estado: 'pendiente', createdAt: serverTimestamp() }), false);
await T('FOODLIB FL9 nombre con correo (dato personal): denegado',
  nuevoAporte(dbOf('alu1'), { name: 'Escribeme a casa@correo.com hoy', nameKey: 'escribeme a casa@correo.com hoy' }), false);
await T('FOODLIB FL10 nombre con teléfono (7+ dígitos seguidos): denegado',
  nuevoAporte(dbOf('alu1'), { name: 'Combo 9015551234 especial', nameKey: 'combo 9015551234 especial' }), false);

// ---- La ficha pública: solo curadores escriben, y JAMÁS con autoría ----
await T('FOODLIB FL11 alumno escribe DIRECTO en food_library: denegado',
  setDoc(LIB(dbOf('alu1'), 'fichaDirecta'), { ...VALS }), false);
await T('FOODLIB FL12 ENTRENADOR publica ficha saneada: ' + (D ? 'admitido' : 'denegado (vivo)'),
  setDoc(LIB(dbOf('coach1'), 'fichaCoach'), { name: 'Huevo cocido', nameKey: 'huevo cocido', qtyNum: 1, qtyUnit: 'unidad', pieceGrams: 50, kcal: 78, prot: 6.3, carb: 0.6, sugar: 0.6, fat: 5.3 }), D);
await T('FOODLIB FL13 entrenador inyecta «createdBy» en la ficha pública: denegado (la autoría no existe en lo público)',
  setDoc(LIB(dbOf('coach1'), 'fichaMala1'), { ...VALS, createdBy: 'coach1' }), false);
await T('FOODLIB FL14 entrenador inyecta «createdAt» en la ficha pública: denegado (sin fechas en lo público)',
  setDoc(LIB(dbOf('coach1'), 'fichaMala2'), { ...VALS, createdAt: serverTimestamp() }), false);
await T('FOODLIB FL15 PROPIETARIO publica ficha saneada: ' + (D ? 'admitido' : 'denegado (vivo)'),
  setDoc(LIB(dbOf('owner1'), 'fichaOwner'), { name: 'Atun en agua', nameKey: 'atun en agua', qtyNum: 120, qtyUnit: 'g', kcal: 132, prot: 28, carb: 0, sugar: 0, fat: 1.2 }), D);

// ---- Lecturas: la pública para aprobados; la antesala, compartimentada ----
await T('FOODLIB FL16 alumno aprobado LEE la biblioteca pública: ' + (D ? 'admitido' : 'denegado (vivo)'),
  getDocs(collection(dbOf('alu1'), 'food_library')), D);
await T('FOODLIB FL17 usuario NO aprobado lee la biblioteca pública: denegado',
  getDocs(collection(dbOf('pend1'), 'food_library')), false);
await T('FOODLIB FL18 «Mis aportes»: el autor consulta SOLO lo suyo (contributorUid == el): ' + (D ? 'admitido' : 'denegado (vivo)'),
  getDocs(query(collection(dbOf('alu1'), 'food_contrib'), where('contributorUid', '==', 'alu1'))), D);
await T('FOODLIB FL19 el autor intenta consultar los aportes de OTRO (contributorUid ajeno): denegado',
  getDocs(query(collection(dbOf('alu1'), 'food_contrib'), where('contributorUid', '==', 'alu2'))), false);
await T('FOODLIB FL20 la bandeja del curador (estado == pendiente) como ENTRENADOR: ' + (D ? 'admitida' : 'denegada (vivo)'),
  getDocs(query(collection(dbOf('coach1'), 'food_contrib'), where('estado', '==', 'pendiente'))), D);
await T('FOODLIB FL21 la misma bandeja como ALUMNO: denegada (sus documentos no son todos legibles para él)',
  getDocs(query(collection(dbOf('alu1'), 'food_contrib'), where('estado', '==', 'pendiente'))), false);

// ---- El autor sobre lo suyo: editar y retirar, jamás resolverse ----
await T('FOODLIB FL22 autor corrige los valores de su aporte pendiente: ' + (D ? 'admitido' : 'denegado (vivo)'),
  updateDoc(CONTRIB(dbOf('alu1'), 'aporteA'), { kcal: 240 }), D);
await T('FOODLIB FL23 autor intenta AUTO-APROBARSE (estado -> aprobado): denegado',
  updateDoc(CONTRIB(dbOf('alu1'), 'aporteA'), { estado: 'aprobado' }), false);
await T('FOODLIB FL24 autor intenta colgar el publicId de su aporte: denegado (campo de resolución)',
  updateDoc(CONTRIB(dbOf('alu1'), 'aporteA'), { publicId: 'fichaPub1' }), false);
await T('FOODLIB FL25 autor RETIRA su aporte pendiente (estado -> retirado): ' + (D ? 'admitido' : 'denegado (vivo)'),
  updateDoc(CONTRIB(dbOf('alu1'), 'aporteA'), { estado: 'retirado' }), D);

// ---- El curador resuelve y corrige ----
await T('FOODLIB FL26 ENTRENADOR aprueba el aporte de alu2 (estado/publicId/resolvedBy/resolvedAt): ' + (D ? 'admitido' : 'denegado (vivo)'),
  updateDoc(CONTRIB(dbOf('coach1'), 'aporteB'), { estado: 'aprobado', publicId: 'fichaCoach', resolvedBy: 'coach1', resolvedAt: serverTimestamp() }), D);
await T('FOODLIB FL27 ENTRENADOR corrige una ficha pública (kcal): ' + (D ? 'admitido' : 'denegado (vivo)'),
  updateDoc(LIB(dbOf('coach1'), 'fichaPub1'), { kcal: 250 }), D);
await T('FOODLIB FL28 alumno intenta corregir una ficha pública: denegado',
  updateDoc(LIB(dbOf('alu1'), 'fichaPub1'), { kcal: 1 }), false);
await T('FOODLIB FL29 entrenador resuelve el reporte (estado -> resuelto): ' + (D ? 'admitido' : 'denegado (vivo)'),
  updateDoc(CONTRIB(dbOf('coach1'), 'reporteR'), { estado: 'resuelto', resolvedBy: 'coach1', resolvedAt: serverTimestamp() }), D);
await T('FOODLIB FL30 el autor del reporte intenta resolverlo él: denegado',
  updateDoc(CONTRIB(dbOf('alu1'), 'reporteR'), { estado: 'resuelto' }), false);

// ---- Reportar una ficha ----
await T('FOODLIB FL31 alumno crea un reporte válido sobre una ficha: ' + (D ? 'admitido' : 'denegado (vivo)'),
  addDoc(collection(dbOf('alu2'), 'food_contrib'), { kind: 'reporte', publicId: 'fichaPub1', foodName: 'Pechuga de pollo a la plancha', reason: 'duplicado', reporterUid: 'alu2', estado: 'pendiente', createdAt: serverTimestamp() }), D);
await T('FOODLIB FL32 reporte con motivo fuera del catálogo cerrado: denegado',
  addDoc(collection(dbOf('alu2'), 'food_contrib'), { kind: 'reporte', publicId: 'fichaPub1', foodName: 'X', reason: 'me-cae-mal', reporterUid: 'alu2', estado: 'pendiente', createdAt: serverTimestamp() }), false);

// ---- Borrados ----
await T('FOODLIB FL33 autor borra su aporte RECHAZADO: ' + (D ? 'admitido' : 'denegado (vivo)'),
  deleteDoc(CONTRIB(dbOf('alu1'), 'aporteC')), D);
await T('FOODLIB FL34 autor intenta borrar su aporte ya APROBADO (aporteB es de alu2; usa el suyo aprobado vía coach en FL26? no: alu2 sobre aporteB): denegado',
  deleteDoc(CONTRIB(dbOf('alu2'), 'aporteB')), false);
await T('FOODLIB FL35 ENTRENADOR retira (borra) una ficha pública: ' + (D ? 'admitido' : 'denegado (vivo)'),
  deleteDoc(LIB(dbOf('coach1'), 'fichaPub2')), D);
await T('FOODLIB FL36 alumno intenta borrar una ficha pública: denegado',
  deleteDoc(LIB(dbOf('alu1'), 'fichaPub1')), false);

// ---- Regresión: nutrition_meals intacto ----
await T('FOODLIB FL37 regresión: el alumno crea SU comida de siempre en nutrition_meals: admitido',
  addDoc(collection(dbOf('alu1'), 'nutrition_meals'), { ownerUid: 'alu1', date: '2026-10-30', meal: 'Almuerzo', food: 'Pollo', qty: '150 g', kcal: 248, prot: 46, carb: 0, sugar: 0, fat: 5.4, notes: '', createdAt: serverTimestamp() }), true);

console.log(NOMBRE + ': ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — FAILS: ' + failures.join(' | ') : ''));
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
