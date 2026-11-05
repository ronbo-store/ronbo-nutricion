// RONBO FIT — Batería del delta de reglas «RENOVACIÓN DEL
// CONSENTIMIENTO ESPECÍFICO AL CAMBIAR EL CONTENIDO DE LA
// DECLARACIÓN» (defecto D-3/S-1 de la auditoría de bloqueos
// 2026-11-04; autorización de Ronald 2026-11-05 08:52 CST) contra
// el emulador oficial de Firestore (proyecto ficticio, sin datos
// reales).
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA: la renovación aceptado→aceptado
//                        con su recibo 'specific-renewed' y la
//                        versión clavada SÍ pasa, sola y plegada
//                        con el cambio de contenido en el mismo
//                        lote; todo lo demás se comporta igual.
//   ESPERA_NUEVO=false → texto VIVO 66dfe323: esa renovación está
//                        DENEGADA (ninguna rama viva la permite:
//                        otorgar/renovar exige estado previo no
//                        aceptado y receiptType() no deriva tipo
//                        para el par aceptado→aceptado).
// Salida: fallos.txt solo si hay fallos (anotaciones del workflow).
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
try { rmSync(new URL('./fallos.txt', import.meta.url)); } catch {}
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

const F = await import('firebase/firestore');
const { doc, setDoc, writeBatch, serverTimestamp, Timestamp } = F;
const V = 'v1-2026-10-16';
const T_ACEPT = Timestamp.fromDate(new Date('2026-10-16T10:00:00Z'));
const T_RETIR = Timestamp.fromDate(new Date('2026-10-20T10:00:00Z'));

// Usuarios semilla, uno por caso para que ningún caso contamine otro.
const U = {
  REN: 'renSola', LOTE: 'renLote', HIST: 'renHist', HIST2: 'renHist2',
  VER: 'fVersion', SINREC: 'fSinRecibo', TIPO: 'fTipo', SEQ: 'fSeq',
  OTORGA: 'otorga', DESDE_RET: 'desdeRet', RETIRA: 'retira',
  SOLODECL: 'soloDecl', AJENA: 'ajena',
};
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const base = (extra = {}) => ({
    name: ' Semilla', role: 'usuario', approved: true,
    consentSeq: 5, ...extra,
  });
  const aceptado = (extra = {}) => base({
    consentReceiptId: '', healthConsent: { status: 'accepted', version: V, acceptedAt: T_ACEPT }, ...extra,
  });
  for (const k of ['REN', 'LOTE', 'VER', 'SINREC', 'TIPO', 'SEQ', 'SOLODECL']) {
    await setDoc(doc(db, 'users', U[k]), { ...aceptado(), consentReceiptId: U[k] + '_5' });
  }
  await setDoc(doc(db, 'users', U.HIST), { ...aceptado(), consentReceiptId: U.HIST + '_5', healthConsent: { status: 'accepted', version: V, acceptedAt: T_ACEPT, withdrawnAt: T_RETIR } });
  await setDoc(doc(db, 'users', U.HIST2), { ...aceptado(), consentReceiptId: U.HIST2 + '_5', healthConsent: { status: 'accepted', version: V, acceptedAt: T_ACEPT, withdrawnAt: T_RETIR } });
  await setDoc(doc(db, 'users', U.OTORGA), { ...base(), consentReceiptId: U.OTORGA + '_5' });
  await setDoc(doc(db, 'users', U.DESDE_RET), {
    ...base(), consentReceiptId: U.DESDE_RET + '_5',
    healthConsent: { status: 'withdrawn', version: V, acceptedAt: T_ACEPT, withdrawnAt: T_RETIR },
  });
  await setDoc(doc(db, 'users', U.RETIRA), { ...aceptado(), consentReceiptId: U.RETIRA + '_5' });
  await setDoc(doc(db, 'users', U.AJENA), { ...aceptado(), consentReceiptId: U.AJENA + '_5' });
  for (const k of ['LOTE', 'RETIRA', 'SOLODECL', 'REN']) {
    await setDoc(doc(db, 'users', U[k], 'healthDeclarations', 'v1'), {
      version: 1, conditions: ['Hipertensión'], details: '', state: 'active',
      declaredAt: T_ACEPT, updatedAt: T_ACEPT, blockedAt: null,
    });
  }
});
const dbDe = (uid) => testEnv.authenticatedContext(uid).firestore();

/* El lote EXACTO que emite la app (consentBatch + escritura plegada):
   users {healthConsent, consentSeq, consentReceiptId} merge +
   consent_receipts/{uid_seq} + (opcional) el parche de contenido. */
function lote(db, uid, { version = V, type = 'specific-renewed', seq = 6, recibo = true, conDecl = false, conHist = false } = {}) {
  const b = writeBatch(db);
  const hc = { status: 'accepted', version, acceptedAt: serverTimestamp() };
  if (conHist) hc.withdrawnAt = T_RETIR;
  b.set(doc(db, 'users', uid), { healthConsent: hc, consentSeq: seq, consentReceiptId: uid + '_' + seq }, { merge: true });
  if (recibo) b.set(doc(db, 'consent_receipts', uid + '_' + seq), { uid, email: 'semilla@ejemplo.test', type, version, at: serverTimestamp() });
  if (conDecl) b.set(doc(db, 'users', uid, 'healthDeclarations', 'v1'), { conditions: ['Hipertensión', 'Embarazo'], details: 'nota nueva', updatedAt: serverTimestamp() }, { merge: true });
  return b.commit();
}

/* ---- El delta ---- */
await caso('D1 renovación aceptado→aceptado con recibo specific-renewed y versión clavada',
  lote(dbDe(U.REN), U.REN), ESPERA_NUEVO);
await caso('D2 renovación + cambio de contenido en el MISMO lote (el acto real de la app)',
  lote(dbDe(U.LOTE), U.LOTE, { conDecl: true }), ESPERA_NUEVO);
await caso('D3 renovación conservando el historial de retirada',
  lote(dbDe(U.HIST), U.HIST, { conHist: true }), ESPERA_NUEVO);

/* ---- La forma cerrada: denegado en ambas suites ---- */
await caso('F1 renovación con otra versión de texto (no clavada)',
  lote(dbDe(U.VER), U.VER, { version: 'v9-2099-01-01' }), false);
await caso('F2 renovación sin recibo acoplado',
  lote(dbDe(U.SINREC), U.SINREC, { recibo: false }), false);
await caso('F3 renovación con recibo de tipo specific-granted',
  lote(dbDe(U.TIPO), U.TIPO, { type: 'specific-granted' }), false);
await caso('F4 renovación con salto de secuencia (+2)',
  lote(dbDe(U.SEQ), U.SEQ, { seq: 7 }), false);
await caso('F5 renovación perdiendo el historial de retirada',
  lote(dbDe(U.HIST2), U.HIST2, { conHist: false }), false);
await caso('F6 renovación en la cuenta de otra persona',
  lote(dbDe(U.AJENA), U.REN, {}), false);

/* ---- Regresiones: idéntico en ambas suites ---- */
{
  const db = dbDe(U.OTORGA);
  const b = writeBatch(db);
  b.set(doc(db, 'users', U.OTORGA), { healthConsent: { status: 'accepted', version: V, acceptedAt: serverTimestamp() }, consentSeq: 6, consentReceiptId: U.OTORGA + '_6' }, { merge: true });
  b.set(doc(db, 'consent_receipts', U.OTORGA + '_6'), { uid: U.OTORGA, email: 'semilla@ejemplo.test', type: 'specific-granted', version: V, at: serverTimestamp() });
  await caso('R1 otorgar desde sin consentimiento (specific-granted)', b.commit(), true);
}
{
  const db = dbDe(U.DESDE_RET);
  const b = writeBatch(db);
  b.set(doc(db, 'users', U.DESDE_RET), { healthConsent: { status: 'accepted', version: V, acceptedAt: serverTimestamp(), withdrawnAt: T_RETIR }, consentSeq: 6, consentReceiptId: U.DESDE_RET + '_6' }, { merge: true });
  b.set(doc(db, 'consent_receipts', U.DESDE_RET + '_6'), { uid: U.DESDE_RET, email: 'semilla@ejemplo.test', type: 'specific-renewed', version: V, at: serverTimestamp() });
  await caso('R2 renovar desde retirado (rama viva, tipo derivado)', b.commit(), true);
}
{
  const db = dbDe(U.RETIRA);
  const b = writeBatch(db);
  b.set(doc(db, 'users', U.RETIRA), { healthConsent: { status: 'withdrawn', version: V, acceptedAt: T_ACEPT, withdrawnAt: serverTimestamp() }, consentSeq: 6, consentReceiptId: U.RETIRA + '_6' }, { merge: true });
  b.set(doc(db, 'consent_receipts', U.RETIRA + '_6'), { uid: U.RETIRA, email: 'semilla@ejemplo.test', type: 'specific-withdrawn', version: V, at: serverTimestamp() });
  b.update(doc(db, 'users', U.RETIRA, 'healthDeclarations', 'v1'), { state: 'blocked', blockedAt: serverTimestamp() });
  await caso('R3 retirar con recibo + bloqueo de la declaración', b.commit(), true);
}
/* Límite declarado del paquete: las reglas nunca cerraron la
   escritura de contenido por sí sola — la puerta vive en la app
   (diff real → bloque de renovación). Este caso DOCUMENTA el
   límite: pasa en ambas suites, como hoy. */
{
  const db = dbDe(U.SOLODECL);
  const b = writeBatch(db);
  b.set(doc(db, 'users', U.SOLODECL, 'healthDeclarations', 'v1'), { conditions: ['Diabetes'], details: '', updatedAt: serverTimestamp() }, { merge: true });
  await caso('R4 (límite declarado) cambio de contenido sin renovar: las reglas no lo cerraban ni lo cierran — la puerta es de la app', b.commit(), true);
}

if (fallos.length) writeFileSync(new URL('./fallos.txt', import.meta.url), fallos.join('\n') + '\n');
console.log(fallos.length ? `\n== ${fallos.length} FALLOS ==` : '\n== SIN FALLOS ==');
await testEnv.cleanup();
process.exit(fallos.length ? 1 : 0);
