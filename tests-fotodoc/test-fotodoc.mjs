// RONBO FIT — Batería gemela del delta de reglas «FOTO DENTRO DEL
// DOCUMENTO» (paquete que completa AUTH-2026-11-08-304) contra el
// emulador oficial de Firestore (proyecto ficticio
// ronbo-nutri-test, sin secretos ni datos reales).
// El delta: en exercise_library, la tercera rama de creación (el
// borrador «pendiente» de cualquier usuario aprobado, AUTH-304) y
// la rama de actualización del propio autor exigen ahora que
// foto_url, si viene, sea texto y no pase de 300 000 caracteres —
// la foto del borrador vive COMO DATO en ese campo (cadena
// «data:») porque Firebase Storage nunca fue aprovisionado y el
// proyecto sigue en Spark $0 (decisión de Ronald, 2026-11-08
// 23:32 CST). Todo lo demás del bloque queda byte a byte igual.
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas 55632b3b + delta): las
//                        guardas nuevas deniegan lo que excede.
//   ESPERA_NUEVO=false → VIVAS 55632b3b (AUTH-2026-11-08-307): sin
//                        guarda, lo excedido aún pasa (las
//                        expectativas de C3/C4/U2 se invierten) y
//                        el resto se comporta idéntico.
// Alcance declarado y probado (C13): la rama del ENTRENADOR que
// crea «pendiente» NO lleva la guarda — es la rama comunitaria
// anterior, de un rol de confianza, como el resto de campos de
// texto del bloque, que tampoco llevan tope.
// LA SONDA (D1): la escritura EXACTA de decisión del entrenador
// (goalsTrainerDecideProposal) en el bloque users — que este
// paquete no toca — debe pasar en las dos suites, por la
// disciplina de la casa tras el hallazgo del presupuesto de
// expresiones de la Fibra.
// Salida: fallos.txt solo si hay fallos; progreso.txt incremental.
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';

const marca = (f, s) => { try { appendFileSync(f, s + '\n'); } catch {} };
process.on('uncaughtException', e => { marca('fallos.txt', 'CRASH: ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 400)); process.exit(1); });
process.on('unhandledRejection', e => { marca('fallos.txt', 'CRASH-REJ: ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 400)); process.exit(1); });

const N = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
async function caso(nombre, promesa, debePasar) {
  try {
    if (debePasar) await assertSucceeds(promesa);
    else await assertFails(promesa);
    console.log(`OK    ${nombre} → ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
    marca('progreso.txt', 'OK ' + nombre);
  } catch (e) {
    const crudo = String((e && e.message) || e).replace(/\s+/g, ' ');
    if (!fallos.length) for (let i = 0; i < Math.min(crudo.length, 540); i += 180) { fallos.push('CRUDO1 ' + crudo.slice(i, i + 180)); marca('fallos.txt', 'CRUDO1 ' + crudo.slice(i, i + 180)); }
    fallos.push('FALLO: ' + nombre);
    marca('fallos.txt', 'FALLO: ' + nombre);
    marca('progreso.txt', 'FALLO ' + nombre);
    console.log(`FALLO ${nombre}: se esperaba ${debePasar ? 'PERMITIDO' : 'DENEGADO'} — ${crudo.slice(0, 400)}`);
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: {
    rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

const DUENO = 'dueno', ADMIN = 'adminA', ENT = 'entrenadorE', ALU = 'alumnaS', OTRA = 'alumnaT', NOAP = 'noaprobada';
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } = F;

/* — la forma EXACTA que la app escribe (mphDraftData + campos del
     alta comunitaria): las 18 claves de LIB_FIELDS + variantes +
     estado/createdBy/createdByName/createdAt — */
const CAMPOS = {
  nombre_es: '', nombre_en: '', grupo_muscular_es: '', grupo_muscular_en: '',
  musculos_secundarios_es: '', musculos_secundarios_en: '',
  categoria_es: '', categoria_en: '', equipo_es: '', equipo_en: '',
  nivel_es: '', nivel_en: '', como_se_hace_es: '', como_se_hace_en: '',
  errores_a_evitar_es: '', errores_a_evitar_en: '',
  foto_url: '', video_youtube_url: '', variantes: [],
};
const PRE = 'data:image/webp;base64,';
const FOTO_OK = PRE + 'QUJDREVGR0hJSg=='.repeat(1100);            // ≈17 600 caracteres (foto típica)
const FOTO_TOPE = PRE + 'A'.repeat(300000 - PRE.length);          // exactamente 300 000
const FOTO_SOBRE = PRE + 'A'.repeat(300001 - PRE.length);         // 300 001
const borrador = (foto, extra = {}) => ({
  ...CAMPOS,
  nombre_es: 'Prensa inclinada 45', nombre_en: '45 degree leg press',
  grupo_muscular_es: 'Cuádriceps', grupo_muscular_en: 'Quadriceps',
  categoria_es: 'Con máquinas', categoria_en: 'Machine-based',
  foto_url: foto, estado: 'pendiente', createdBy: ALU,
  createdByName: 'Alumna Prueba', createdAt: serverTimestamp(), ...extra,
});

/* — semillas de la sonda de decisión (la forma de producción) — */
const PROP_TS = Timestamp.fromDate(new Date('2026-11-08T12:00:00Z'));
const METAS5 = { kcal: 1915, prot: 179, carb: 204, azuc: 24, gras: 43 };
const propuesta = () => ({ kind: 'goal', param: 'kcal', date: null, foundedValue: 1915, chosenValue: 1915, warningKey: 'gm.warn.kcal', status: 'pending', proposedAt: PROP_TS, decidedBy: null, decidedAt: null });

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueno', role: 'administrador', approved: false, isOwner: true });
  await setDoc(doc(db, 'users', ADMIN), { name: 'Admin', role: 'administrador', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', ENT), { name: 'Entrenador', role: 'entrenador', approved: true, isOwner: false, approvalsUsed: 0 });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true, isOwner: false, trainerUid: ENT });
  await setDoc(doc(db, 'users', OTRA), { name: 'Otra', role: 'usuario', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', NOAP), { name: 'Sin aprobar', role: 'usuario', approved: false, isOwner: false });
  /* Borradores semilla para update/read/delete. */
  await setDoc(doc(db, 'exercise_library', 'DRAFT1'), borrador(FOTO_OK));
  await setDoc(doc(db, 'exercise_library', 'DRAFT2'), borrador(FOTO_TOPE));
  /* Sonda: alumna con propuesta pendiente y su entrenador. */
  await setDoc(doc(db, 'users', 'aluD'), {
    name: 'Alumna D', role: 'usuario', approved: true, isOwner: false,
    trainerUid: ENT, assignmentStatus: 'assigned', consentSeq: 4, termsVersion: 'v4-2026-10-24',
    goals: { kcal: 1800, prot: 170, carb: 190, azuc: 23, gras: 40 },
    goalsProvenance: { engineVersion: 'metas-v3-2026-10-26', changeLog: [] },
    goalsProposal: propuesta(),
  });
  await setDoc(doc(db, 'app_settings', 'approvals'), { maxPerTrainer: 1 });
  await setDoc(doc(db, 'trainer_profiles', ENT), { uid: ENT, active: true });
});
marca('progreso.txt', 'SEMILLAS OK · suite ' + (N ? 'CANDIDATA' : 'VIVAS'));

const dbA = testEnv.authenticatedContext(ALU).firestore();
const dbAd = testEnv.authenticatedContext(ADMIN).firestore();
const dbE = testEnv.authenticatedContext(ENT).firestore();
const dbT = testEnv.authenticatedContext(OTRA).firestore();
const dbN = testEnv.authenticatedContext(NOAP).firestore();
const lib = (db, id) => doc(db, 'exercise_library', id);

/* — CREACIÓN: el borrador de la foto (tercera rama) — */
await caso('C1 alumna: borrador con foto-dato normal nace', setDoc(lib(dbA, 'FD01'), borrador(FOTO_OK)), true);
await caso('C2 alumna: foto-dato en el tope exacto (300 000) nace', setDoc(lib(dbA, 'FD02'), borrador(FOTO_TOPE)), true);
await caso('C3 alumna: foto-dato sobre el tope (300 001) — la guarda manda', setDoc(lib(dbA, 'FD03'), borrador(FOTO_SOBRE)), N ? false : true);
await caso('C4 alumna: foto_url numérica — la guarda exige texto', setDoc(lib(dbA, 'FD04'), borrador(12345)), N ? false : true);
const sinFoto = borrador(''); delete sinFoto.foto_url;
await caso('C5 alumna: borrador SIN campo foto_url nace (forma manual)', setDoc(lib(dbA, 'FD05'), sinFoto), true);
await caso('C6 alumna: borrador con foto_url de URL corta nace (forma manual)', setDoc(lib(dbA, 'FD06'), borrador('https://ejemplo.test/foto.webp')), true);
await caso('C7 alumna: nacer ya «aprobado» se deniega', setDoc(lib(dbA, 'FD07'), borrador(FOTO_OK, { estado: 'aprobado' })), false);
await caso('C8 alumna: pendiente con firma de aprobación se deniega', setDoc(lib(dbA, 'FD08'), borrador(FOTO_OK, { approvedBy: ALU, approvedAt: serverTimestamp() })), false);
await caso('C9 alumna: createdBy ajeno se deniega', setDoc(lib(dbA, 'FD09'), borrador(FOTO_OK, { createdBy: OTRA })), false);
await caso('C10 alumna: campo fuera de la lista cerrada se deniega', setDoc(lib(dbA, 'FD10'), borrador(FOTO_OK, { foo: 'x' })), false);
await caso('C11 cuenta NO aprobada no crea borradores', setDoc(lib(dbN, 'FD11'), borrador(FOTO_OK)), false);
await caso('C12 entrenador: su pendiente con foto-dato normal nace', setDoc(lib(dbE, 'FD12'), borrador(FOTO_OK, { createdBy: ENT, createdByName: 'Entrenador' })), true);
await caso('C13 entrenador: su rama NO lleva la guarda (alcance declarado)', setDoc(lib(dbE, 'FD13'), borrador(FOTO_SOBRE, { createdBy: ENT, createdByName: 'Entrenador' })), true);
await caso('C14 administrador: crea «aprobado» directo con su firma (rama intacta)', setDoc(lib(dbAd, 'FD14'), borrador('https://ejemplo.test/f.webp', { estado: 'aprobado', createdBy: ADMIN, createdByName: 'Admin', approvedBy: ADMIN, approvedAt: serverTimestamp() })), true);

/* — ACTUALIZACIÓN: la vida del borrador — */
const edicionAutora = (foto, extra = {}) => ({
  ...CAMPOS, nombre_es: 'Prensa inclinada 45', nombre_en: '45 degree leg press',
  grupo_muscular_es: 'Cuádriceps', grupo_muscular_en: 'Quadriceps',
  categoria_es: 'Con máquinas', categoria_en: 'Machine-based',
  como_se_hace_es: '1. Ajusta el asiento. 2. Empuja con los talones.',
  foto_url: foto, updatedAt: serverTimestamp(), updatedBy: ALU, ...extra,
});
await caso('U1 autora: completa los pasos de SU borrador con la foto-dato intacta', updateDoc(lib(dbA, 'DRAFT1'), edicionAutora(FOTO_OK)), true);
await caso('U2 autora: inflar foto_url sobre el tope en su edición — la guarda manda', updateDoc(lib(dbA, 'DRAFT1'), edicionAutora(FOTO_SOBRE)), N ? false : true);
await caso('U3 autora: auto-aprobarse su borrador se deniega', updateDoc(lib(dbA, 'DRAFT1'), edicionAutora(FOTO_OK, { estado: 'aprobado', approvedBy: ALU, approvedAt: serverTimestamp() })), false);
await caso('U4 administrador: APRUEBA el borrador con la foto-dato intacta (la decisión del paquete)', updateDoc(lib(dbAd, 'DRAFT1'), { estado: 'aprobado', approvedAt: serverTimestamp(), approvedBy: ADMIN, updatedAt: serverTimestamp(), updatedBy: ADMIN }), true);
await caso('U5 tercera cuenta: editar el borrador ajeno se deniega', updateDoc(lib(dbT, 'DRAFT2'), { como_se_hace_es: 'x', updatedAt: serverTimestamp(), updatedBy: OTRA }), false);
await caso('U6 autora: edita su borrador con la foto EN el tope (no sobre)', updateDoc(lib(dbA, 'DRAFT2'), edicionAutora(FOTO_TOPE)), true);

/* — LECTURA y BORRADO — */
await caso('R1 tercera cuenta: NO lee el pendiente ajeno (DRAFT2)', getDoc(lib(dbT, 'DRAFT2')), false);
await caso('R2 administrador: lee el pendiente en su bandeja', getDoc(lib(dbAd, 'DRAFT2')), true);
await caso('R3 autora: lee su propio pendiente', getDoc(lib(dbA, 'DRAFT2')), true);
await caso('R4 tras la aprobación (U4), el aprobado ya lo lee cualquiera aprobado', getDoc(lib(dbT, 'DRAFT1')), true);
await caso('X1 autora: borra su propio borrador', deleteDoc(lib(dbA, 'DRAFT2')), true);

/* — LA SONDA: el camino grande de decisión (bloque users intacto) — */
async function decisionReal(uid, goalsAplicadas) {
  let data;
  try {
    const snap = await getDoc(doc(dbE, 'users', uid));
    data = snap.data();
    if (!data || !data.goalsProposal) throw new Error('LECTURA: sin documento o sin propuesta');
  } catch (e) { throw new Error('LECTURA: ' + String((e && e.message) || e).slice(0, 120)); }
  const prop = data.goalsProposal;
  const patch = {
    goalsProposal: { ...prop, status: 'approved', decidedBy: ENT, decidedAt: serverTimestamp() },
    goalsProvenance: { ...(data.goalsProvenance || {}), changeLog: [...(((data.goalsProvenance || {}).changeLog) || []), { at: '2026-11-08T18:00:00.000Z', kind: prop.kind, param: prop.param, date: prop.date || null, foundedValue: prop.foundedValue, chosenValue: prop.chosenValue, gate: 'approved', by: ENT }] },
  };
  if (goalsAplicadas) patch.goals = goalsAplicadas;
  return updateDoc(doc(dbE, 'users', uid), patch);
}
await caso('D1 SONDA: la decisión exacta del entrenador sigue pasando (bloque users intacto)', decisionReal('aluD', METAS5), true);

await testEnv.cleanup();
if (fallos.length) { console.log('FALLOS:', fallos.length); process.exit(1); }
try { rmSync('fallos.txt'); } catch {}
console.log('BATERÍA FOTODOC OK —', N ? 'CANDIDATA' : 'VIVAS');
