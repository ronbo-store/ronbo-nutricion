// RONBO NUTRI — Batería CI del delta METAS-L (§L: libertad del
// alumno con compuerta, 2026-10-26). Usuarios FICTICIOS, emulador
// LOCAL. Nunca toca producción. Banco de reglas: ./firestore.rules
// = candidato de publicación (texto vivo verificado cd47f337,
// SHA-256 dd25a14f…, + SOLO el delta §L; candidato SHA-256
// e5e9452f…).
//
// Formas REALES verificadas en pruebas-metas-v3/bloque-motor-v3.js:
//  - el alumno crea goalsProposal con status 'pending',
//    proposedAt = serverTimestamp() y decidedBy/decidedAt = null
//    (PRESENTES y nulos, no ausentes), junto con goalsProvenance
//    (con changeLog) en la misma escritura;
//  - el entrenador decide con {...prop, status, decidedBy: su uid,
//    decidedAt: serverTimestamp()} + goalsProvenance; al aprobar
//    aplica goals / goalsDayOverrides / goalObjective en la MISMA
//    escritura; al rechazar solo decisión + procedencia;
//  - goalsAgreement lo escribe SOLO el dueño, en escritura propia:
//    {version, records, updatedAt: serverTimestamp()}; acceptedAt
//    de cada registro es una CADENA ISO (new Date().toISOString()),
//    NO la hora del servidor;
//  - goalsDayOverrides lo escribe el dueño directo como mapa.
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
    goals: { kcal: 2100, prot: 140, carb: 200, azuc: 26, gras: 60 },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [] }
  });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', role: 'usuario', trainerUid: 'trainer2', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  await setDoc(doc(db, 'users', 'clientD'), { ...base, name: 'Cliente D', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
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
const LOG1 = { at: '2026-10-26T12:00:00.000Z', kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, gate: 'pending', by: 'clientA' };

// ============ P — goalsProposal: creación del dueño ============
await T('P01 el dueño crea su propuesta de meta pending (forma real v3: decidedBy/decidedAt NULOS) + goalsProvenance con changeLog en la misma escritura',
  updateDoc(USR(A, 'clientA'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), true);
await T('P02 el dueño intenta SUSTITUIR su propuesta aún pending: denegado (una sola viva, inmutable)',
  updateDoc(USR(A, 'clientA'), {
    goalsProposal: { kind: 'goal', param: 'kcal', date: null, foundedValue: 2100, chosenValue: 1500, warningKey: 'gm.warn.kcal', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null }
  }), false);
await T('P03 el dueño se AUTO-DECIDE la propuesta (status approved): denegado',
  updateDoc(USR(A, 'clientA'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'approved', proposedAt: TS, decidedBy: 'clientA', decidedAt: TS }
  }), false);
await T('P04 propuesta con decidedBy colado (el propio dueño) en pending: denegada',
  updateDoc(USR(B, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: 'clientB', decidedAt: null }
  }), false);
await T('P05 propuesta con proposedAt literal (no hora del servidor): denegada',
  updateDoc(USR(B, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: new Date('2030-01-01T00:00:00Z'), decidedBy: null, decidedAt: null }
  }), false);
await T('P06 propuesta con clave fuera de la lista cerrada: denegada',
  updateDoc(USR(B, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null, nota: 'x' }
  }), false);
await T('P07 propuesta incoherente kind=goal con param=dayType: denegada',
  updateDoc(USR(B, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'dayType', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null }
  }), false);
await T('P08 propuesta daytype con chosenValue fuera de la lista (fiesta): denegada',
  updateDoc(USR(B, 'clientB'), {
    goalsProposal: { kind: 'daytype', param: 'dayType', date: '2026-10-27', foundedValue: 'exigente', chosenValue: 'fiesta', warningKey: 'gm.warn.daytype', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null }
  }), false);
await T('P09 propuesta de meta con chosenValue como texto: denegada',
  updateDoc(USR(B, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: '60', warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null }
  }), false);
await T('P10 el dueño escribe la propuesta en el documento de OTRO: denegado',
  updateDoc(USR(A, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null }
  }), false);
await T('P11 el entrenador CREA una propuesta para su cliente: denegado (no crea, solo decide)',
  updateDoc(USR(tr1, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null }
  }), false);
await T('P12 sin sesión se escribe una propuesta: denegado',
  updateDoc(USR(ANON, 'clientB'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null }
  }), false);

// ============ T — decisión del entrenador asignado (sobre P01) ============
const snap1 = await getDoc(USR(tr1, 'clientA'));
const prop1 = snap1.data().goalsProposal;
await T('T01 entrenador NO asignado intenta APROBAR la propuesta: denegado',
  updateDoc(USR(tr2, 'clientA'), {
    goalsProposal: { ...prop1, status: 'approved', decidedBy: 'trainer2', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), false);
await T('T02 el asignado aprueba CAMBIANDO el chosenValue de la propuesta: denegado (contenido byte-idéntico)',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop1, chosenValue: 61, status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), false);
await T('T03 el asignado aprueba CAMBIANDO el warningKey: denegado',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop1, warningKey: 'gm.warn.kcal', status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), false);
await T('T04 el asignado aprueba tocando ADEMÁS approved del cliente: denegado entero',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop1, status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] },
    approved: false
  }), false);
await T('T05 el asignado aprueba tocando ADEMÁS goalsAgreement: denegado (ese campo es solo del dueño)',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop1, status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] },
    goalsAgreement: { version: 'draft-2026-10-26', records: [], updatedAt: TS }
  }), false);
await T('T06 el asignado RECHAZA pero aplica goals en la misma escritura: denegado (al rechazar, solo propuesta + procedencia)',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop1, status: 'rejected', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] },
    goals: { kcal: 2100, prot: 60, carb: 200, azuc: 26, gras: 60 }
  }), false);
await T('T07 el asignado toca goals SIN decisión en la misma escritura: denegado',
  updateDoc(USR(tr1, 'clientA'), {
    goals: { kcal: 2100, prot: 60, carb: 200, azuc: 26, gras: 60 }
  }), false);
await T('T08 el entrenador ASIGNADO APRUEBA y APLICA la meta (goals) + procedencia, en la misma escritura',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop1, status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goals: { kcal: 2100, prot: 60, carb: 200, azuc: 26, gras: 60 },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1, { ...LOG1, gate: 'approved', by: 'trainer1' }] }
  }), true);
await T('T09 decidir de nuevo sobre la propuesta YA decidida: denegado',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop1, status: 'rejected', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), false);

// ============ O — goalsDayOverrides del dueño ============
await T('O01 el dueño escribe su override de día directo (mapa fecha -> nivel)',
  updateDoc(USR(A, 'clientA'), { goalsDayOverrides: { '2026-10-28': 'base' } }), true);
await T('O02 el dueño escribe goalsDayOverrides como texto (no mapa): denegado',
  updateDoc(USR(A, 'clientA'), { goalsDayOverrides: 'descanso' }), false);
await T('O03 el entrenador escribe goalsDayOverrides SIN decisión: denegado',
  updateDoc(USR(tr1, 'clientA'), { goalsDayOverrides: { '2026-10-29': 'descanso' } }), false);
await T('O04 otro alumno escribe los overrides de A: denegado',
  updateDoc(USR(B, 'clientA'), { goalsDayOverrides: { '2026-10-29': 'descanso' } }), false);
await T('O05 el dueño escribe overrides tocando ADEMÁS trainerUid: denegado entero',
  updateDoc(USR(A, 'clientA'), { goalsDayOverrides: { '2026-10-29': 'descanso' }, trainerUid: 'trainer2' }), false);

// ============ P/T — daytype: propuesta, aprobación con override ============
await T('P13 el dueño SUSTITUYE la propuesta ya decidida por una nueva pending de tipo de día (forma real v3)',
  updateDoc(USR(A, 'clientA'), {
    goalsProposal: { kind: 'daytype', param: 'dayType', date: '2026-10-27', foundedValue: 'exigente', chosenValue: 'descanso', warningKey: 'gm.warn.daytype', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), true);
const snap2 = await getDoc(USR(tr1, 'clientA'));
const prop2 = snap2.data().goalsProposal;
await T('T10 el asignado APRUEBA el tipo de día aplicando goalsDayOverrides en la misma escritura',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop2, status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goalsDayOverrides: { '2026-10-28': 'base', '2026-10-27': 'descanso' },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), true);

// ============ P/T — objective: propuesta y aplicación ============
await T('P14 el dueño propone un cambio de objetivo (kind objective, forma de la lista de campos)',
  updateDoc(USR(A, 'clientA'), {
    goalsProposal: { kind: 'objective', param: 'goalObjective', date: null, foundedValue: 'mantener', chosenValue: 'bajar', warningKey: 'gm.warn.objective', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), true);
const snap3 = await getDoc(USR(tr1, 'clientA'));
const prop3 = snap3.data().goalsProposal;
await T('T11 el asignado APRUEBA el objetivo aplicando goalObjective en la misma escritura',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop3, status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goalObjective: 'bajar',
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), true);

// ============ P/T — rechazo limpio ============
await T('P15 el dueño crea una nueva propuesta de meta pending tras las decisiones anteriores',
  updateDoc(USR(A, 'clientA'), {
    goalsProposal: { kind: 'goal', param: 'azuc', date: null, foundedValue: 26, chosenValue: 60, warningKey: 'gm.warn.azuc', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1] }
  }), true);
const snap4 = await getDoc(USR(tr1, 'clientA'));
const prop4 = snap4.data().goalsProposal;
await T('T12 el asignado RECHAZA tocando SOLO goalsProposal + goalsProvenance',
  updateDoc(USR(tr1, 'clientA'), {
    goalsProposal: { ...prop4, status: 'rejected', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1, { ...LOG1, param: 'azuc', gate: 'rejected', by: 'trainer1' }] }
  }), true);

// ============ Ag — goalsAgreement: solo el dueño ============
const REC1 = { kind: 'goal', param: 'azuc', date: null, foundedValue: 26, chosenValue: 60, warningKey: 'gm.warn.azuc', agreementVersion: 'draft-2026-10-26', acceptedAt: '2026-10-26T12:00:00.000Z' };
await T('Ag01 el dueño registra su acuerdo (forma real v3: acceptedAt CADENA ISO en el registro, updatedAt hora del servidor)',
  updateDoc(USR(D, 'clientD'), { goalsAgreement: { version: 'draft-2026-10-26', records: [REC1], updatedAt: TS } }), true);
await T('Ag02 acuerdo con updatedAt literal (no servidor): denegado',
  updateDoc(USR(D, 'clientD'), { goalsAgreement: { version: 'draft-2026-10-26', records: [REC1], updatedAt: new Date('2030-01-01T00:00:00Z') } }), false);
await T('Ag03 acuerdo con clave fuera de la lista cerrada: denegado',
  updateDoc(USR(D, 'clientD'), { goalsAgreement: { version: 'draft-2026-10-26', records: [REC1], updatedAt: TS, nota: 'x' } }), false);
await T('Ag04 acuerdo con records que no es lista: denegado',
  updateDoc(USR(D, 'clientD'), { goalsAgreement: { version: 'draft-2026-10-26', records: { uno: REC1 }, updatedAt: TS } }), false);
await T('Ag05 el entrenador escribe el acuerdo de su cliente: denegado',
  updateDoc(USR(tr1, 'clientA'), { goalsAgreement: { version: 'draft-2026-10-26', records: [REC1], updatedAt: TS } }), false);
await T('Ag06 otro alumno escribe el acuerdo de D: denegado',
  updateDoc(USR(B, 'clientD'), { goalsAgreement: { version: 'draft-2026-10-26', records: [REC1], updatedAt: TS } }), false);
await T('Ag07 el ADMINISTRADOR conserva su acceso vigente sobre goalsAgreement (rama del propietario)',
  updateDoc(USR(owner, 'clientD'), { goalsAgreement: { version: 'draft-2026-10-26', records: [REC1, { ...REC1, param: 'prot' }], updatedAt: TS } }), true);

// ============ X — campos protegidos y procedencia (punto 6) ============
await T('X01 el dueño actualiza goalsProvenance con changeLog dentro (punto 6: no necesita campo nuevo)',
  updateDoc(USR(A, 'clientA'), {
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [LOG1, { ...LOG1, gate: 'direct', by: 'clientA' }] }
  }), true);
await T('X02 el dueño toca approved junto a una propuesta válida: denegado entero',
  updateDoc(USR(D, 'clientD'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS, decidedBy: null, decidedAt: null },
    approved: false
  }), false);
await T('X03 el dueño toca su role junto a goals: denegado',
  updateDoc(USR(A, 'clientA'), { role: 'entrenador', goals: { kcal: 2000 } }), false);
await T('X04 el dueño toca su consentimiento (healthConsent) junto al acuerdo: denegado',
  updateDoc(USR(D, 'clientD'), {
    goalsAgreement: { version: 'draft-2026-10-26', records: [REC1], updatedAt: TS },
    healthConsent: { status: 'withdrawn' }
  }), false);
await T('X05 el dueño SIN entrenador crea su propuesta pending SIN campos de decisión (forma ausente también admitida)',
  updateDoc(USR(D, 'clientD'), {
    goalsProposal: { kind: 'goal', param: 'prot', date: null, foundedValue: 140, chosenValue: 60, warningKey: 'gm.warn.prot', status: 'pending', proposedAt: TS }
  }), true);
const snapD = await getDoc(USR(owner, 'clientD'));
const propD = snapD.data().goalsProposal;
await T('X06 un entrenador NO asignado (D no tiene entrenador) intenta decidir la propuesta de D con el contenido intacto: denegado solo por la guarda de asignación',
  updateDoc(USR(tr1, 'clientD'), {
    goalsProposal: { ...propD, status: 'approved', decidedBy: 'trainer1', decidedAt: TS },
    goalsProvenance: { changeLog: [] }
  }), false);

console.log(`METAS-L (§L): ${pass} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
