// Batería de reglas — MÓDULOS P4-3 (H unidades · A Ten Haaf · D
// entrenamiento interactivo) contra el candidato compuesto sobre el
// texto vivo b202013c (actividad flotante): fusión del bloque
// preferences (rama 'units' junto a 'activities'), las cuatro
// ediciones del bloque assessment del módulo A y la rama de cierre
// v2 de training_logs del módulo D. El módulo B no lleva delta.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';

const rules = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { rules, host: '127.0.0.1', port: 8080 }
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

const ADM = 'adm', CLI = 'cli', CLI2 = 'cli2', TR = 'tr1';
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const seed = {
    [`users/${ADM}`]: { name: 'Admin', isOwner: true, role: 'administrador', approved: true },
    [`users/${CLI}`]: { name: 'Cliente', role: 'usuario', approved: true },
    [`users/${CLI2}`]: { name: 'Cliente Dos', role: 'usuario', approved: true },
    [`users/${TR}`]: { name: 'Entrenador', role: 'entrenador', approved: true },
    [`users/${CLI}/assessment/current`]: { equation: 'mifflin-st-jeor', palBasal: 1.55, updatedAt: Timestamp.fromMillis(1758000000000), updatedBy: ADM }
  };
  for (const [path, data] of Object.entries(seed)) await setDoc(doc(db, path), data);
});

const adm = testEnv.authenticatedContext(ADM).firestore();
const cli = testEnv.authenticatedContext(CLI).firestore();
const cli2 = testEnv.authenticatedContext(CLI2).firestore();
const tr = testEnv.authenticatedContext(TR).firestore();

// ---------- H — preferencias de unidades (bloque fusionado) ----------
const unitsDoc = (db, uid) => doc(db, 'users', uid, 'preferences', 'units');
const validUnits = () => ({ mass: 'lb', height: 'ft-in', distance: 'mi', updatedAt: serverTimestamp() });

await T('U1 el titular crea su documento units válido', setDoc(unitsDoc(cli, CLI), validUnits()), true);
await T('U2 el titular lee su documento units', getDoc(unitsDoc(cli, CLI)), true);
await T('U3 el titular actualiza sus unidades', updateDoc(unitsDoc(cli, CLI), { mass: 'kg', updatedAt: serverTimestamp() }), true);
await T('U4 otro usuario NO lee las units ajenas', getDoc(unitsDoc(cli2, CLI)), false);
await T('U5 otro usuario NO crea units ajenas', setDoc(unitsDoc(cli2, CLI), validUnits()), false);
await T('U6 el ENTRENADOR no lee las units de su cliente (ajustes de pantalla del titular)', getDoc(unitsDoc(tr, CLI)), false);
await T('U7 listar la subcolección preferences está denegado', getDocs(collection(cli, 'users', CLI, 'preferences')), false);
await T('U8 unidad de masa fuera del conjunto cerrado se deniega', setDoc(unitsDoc(cli2, CLI2), { mass: 'stone', height: 'cm', distance: 'km', updatedAt: serverTimestamp() }), false);
await T('U9 clave extra en units se deniega', setDoc(unitsDoc(cli2, CLI2), { ...validUnits(), theme: 'dark' }), false);
await T('U10 updatedAt que no es la hora del servidor se deniega', setDoc(unitsDoc(cli2, CLI2), { mass: 'kg', height: 'cm', distance: 'km', updatedAt: Timestamp.fromMillis(1758000000000) }), false);
await T('U11 el titular borra sus units (borrado propio)', deleteDoc(unitsDoc(cli, CLI)), true);

// ---------- Fusión: la rama 'activities' publicada sigue intacta ----------
const actDoc = (db, uid) => doc(db, 'users', uid, 'preferences', 'activities');
await T('F1 el titular crea sus favoritos de actividad (rama publicada, sin regresión)', setDoc(actDoc(cli, CLI), { favorites: ['correr', 'natacion'], updatedAt: serverTimestamp() }), true);
await T('F2 favorito fuera del catálogo cerrado se sigue denegando', setDoc(actDoc(cli2, CLI2), { favorites: ['paracaidismo'], updatedAt: serverTimestamp() }), false);
await T('F3 un documento de preferencias no habilitado se deniega', setDoc(doc(cli, 'users', CLI, 'preferences', 'theme'), { dark: true, updatedAt: serverTimestamp() }), false);
await T('F4 units NO admite la forma de activities (ramas separadas)', setDoc(unitsDoc(cli2, CLI2), { favorites: ['correr'], updatedAt: serverTimestamp() }), false);

// ---------- A — Ten Haaf y declaración de atleta (assessment) ----------
const asmt = (db, uid) => doc(db, 'users', uid, 'assessment', 'current');
await T('A1 el propietario crea current con ecuación ten-haaf (configuración válida)', setDoc(asmt(adm, CLI2), { equation: 'ten-haaf', palBasal: 1.55, updatedAt: serverTimestamp(), updatedBy: ADM }), true);
await T('A2 harris-benedict sigue bloqueada al crear', setDoc(asmt(adm, CLI2), { equation: 'harris-benedict', palBasal: 1.55, updatedAt: serverTimestamp(), updatedBy: ADM }), false);
await T('A3 el propietario cambia la ecuación a ten-haaf en update', updateDoc(asmt(adm, CLI), { equation: 'ten-haaf', updatedAt: serverTimestamp(), updatedBy: ADM }), true);
await T('A4 el cliente declara atleta (bool + sello de servidor)', updateDoc(asmt(cli, CLI), { athleteDeclared: true, athleteDeclaredAt: serverTimestamp() }), true);
await T('A5 declaración que no es bool se deniega', updateDoc(asmt(cli, CLI), { athleteDeclared: 'si' }), false);
await T('A6 sello de declaración con hora de cliente se deniega', updateDoc(asmt(cli, CLI), { athleteDeclaredAt: Timestamp.fromMillis(1758000000000) }), false);
await T('A7 el cliente guarda su resultado con equationUsed ten-haaf', updateDoc(asmt(cli, CLI), { rmrKcal: 1959.82, tdeeKcal: 3037.72, equationUsed: 'ten-haaf', equationVersion: 'ten-haaf-2005', computedAt: serverTimestamp(), computedBy: CLI }), true);
await T('A8 resultado con equationUsed fuera de la lista se deniega', updateDoc(asmt(cli, CLI), { equationUsed: 'harris-benedict', computedAt: serverTimestamp(), computedBy: CLI }), false);
await T('A9 el entrenador/propietario NO puede escribir la declaración del cliente', updateDoc(asmt(adm, CLI), { athleteDeclared: false }), false);
await T('A10 instantánea de historial con ten-haaf se admite', setDoc(doc(cli, 'users', CLI, 'assessment', 'hist_1'), { rmrKcal: 1959.82, tdeeKcal: 3037.72, equationUsed: 'ten-haaf', equationVersion: 'ten-haaf-2005', computedAt: serverTimestamp(), computedBy: CLI }), true);
await T('A11 instantánea con equationUsed fuera de la lista se deniega', setDoc(doc(cli, 'users', CLI, 'assessment', 'hist_2'), { rmrKcal: 1, tdeeKcal: 2, equationUsed: 'harris-benedict', equationVersion: 'x', computedAt: serverTimestamp(), computedBy: CLI }), false);

// ---------- D — cierre de día v2 (training_logs) ----------
const tlog = (db, id) => doc(db, 'training_logs', id);
await T('D1 registro v1 (done == true) se sigue admitiendo', setDoc(tlog(cli, 'd1'), { clientUid: CLI, done: true }), true);
await T('D2 cierre v2 PARCIAL con al menos un ejercicio hecho se admite', setDoc(tlog(cli, 'd2'), { clientUid: CLI, schemaVersion: 2, done: false, status: 'partial', exercisesDone: [{ name: 'Sentadilla', sets: [{ reps: 10 }] }] }), true);
await T('D3 cierre v2 parcial SIN ejercicios se deniega', setDoc(tlog(cli, 'd3'), { clientUid: CLI, schemaVersion: 2, done: false, status: 'partial', exercisesDone: [] }), false);
await T('D4 cierre v2 SALTADO con acto explícito propio sellado se admite', setDoc(tlog(cli, 'd4'), { clientUid: CLI, schemaVersion: 2, done: false, status: 'skipped', skippedExplicit: { value: true, by: CLI, at: serverTimestamp() } }), true);
await T('D5 saltado con sello de OTRO se deniega', setDoc(tlog(cli, 'd5'), { clientUid: CLI, schemaVersion: 2, done: false, status: 'skipped', skippedExplicit: { value: true, by: CLI2, at: serverTimestamp() } }), false);
await T('D6 done == false sin forma v2 se deniega (como hoy)', setDoc(tlog(cli, 'd6'), { clientUid: CLI, done: false }), false);
await T('D7 registro para otro clientUid se deniega', setDoc(tlog(cli, 'd7'), { clientUid: CLI2, done: true }), false);
await T('D8 saltado con hora de cliente en el sello se deniega', setDoc(tlog(cli, 'd8'), { clientUid: CLI, schemaVersion: 2, done: false, status: 'skipped', skippedExplicit: { value: true, by: CLI, at: Timestamp.fromMillis(1758000000000) } }), false);

console.log(`\n===== P4-3 REGLAS: ${pass}/${pass + fail} PASS =====`);
if (failures.length) { console.log('FALLOS:\n - ' + failures.join('\n - ')); process.exit(1); }
await testEnv.cleanup();
