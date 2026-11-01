// AUTH-2026-11-01-133 · Batería de reglas de la rama «nudge» de
// notices: el entrenador ASIGNADO anota el aviso por pendiente que
// acaba de enviar (botón «✉ Avisar»; diseño 2026-10-31 + D1–D4).
//
// Corre contra el emulador oficial de Firestore con el texto que el
// workflow copie a firestore.rules:
//   NUDGE_MODE=candidata → el delta está: la anotación del
//                          entrenador asignado PASA (N1).
//   NUDGE_MODE=vivo      → el texto vivo de hoy: N1 debe FALLAR
//                          (contraste: hoy nadie puede anotar
//                          avisos por esta vía); el resto de la
//                          suite se comporta igual en ambos textos.
// La anotación es UN setDoc merge sobre users/{alumno} con la
// forma exacta que enviará la app: { notices: { nudge: { <sub>:
// { at: <hora del servidor>, by: <uid del entrenador> } } } }.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const MODE = process.env.NUDGE_MODE || 'candidata';
const rules = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

const OWNER = 'sWfllr4HvYRFUP1T8B1gFGLYU2t2'; // uid del propietario (isOwner en las reglas)
const TRAINER = 'trainerNudgeT';
const TRAINER2 = 'trainerNudgeZ';
const STUDENT = 'studentNudgeS';   // asignado a TRAINER; approvedBy = el administrador (NO el entrenador)
const STUDENT_W = 'studentNudgeW'; // asignado a TRAINER y aprobado POR TRAINER (regresión AUTH-072)
const STUDENT_O = 'studentNudgeO'; // asignado a TRAINER2
const STUDENT_NA = 'studentNudgeNA'; // NO aprobado, asignado a TRAINER

/* Patrón probado de la casa (AUTH-132): initializeTestEnvironment
   SIN la clave rules — el emulador sirve el texto que el workflow
   haya copiado a firestore.rules (firebase.json), y la suite solo
   ejerce escrituras contra él. */
const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: 8080 }
});

function dbFor(uid) {
  const ctx = uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext();
  return ctx.firestore();
}

function nudgeWrite(uid, student, nudge) {
  const db = dbFor(uid);
  return setDoc(doc(db, 'users', student), { notices: { nudge } }, { merge: true });
}
const fresh = (by) => ({ at: serverTimestamp(), by });

let pass = 0, fail = 0;
async function check(name, promise, shouldSucceed) {
  try {
    if (shouldSucceed) await assertSucceeds(promise); else await assertFails(promise);
    pass++; console.log('PASS', name);
  } catch (e) {
    fail++; console.log('FAIL', name, '→', String(e && e.message || e).slice(0, 220));
  }
}

// Siembra con las reglas desactivadas.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  /* El documento PROPIO del propietario: isOwnerUser() de las
     reglas lo exige (uid + su users con isOwner == true) para la
     rama general del dueño que ejercita N15. */
  await setDoc(doc(db, 'users', OWNER), { role: 'administrador', isOwner: true, approved: false, name: 'Owner Nudge', email: 'owner@ficticio.test' });
  await setDoc(doc(db, 'users', TRAINER), { role: 'entrenador', approved: true, name: 'Trainer Nudge', email: 't@ficticio.test' });
  await setDoc(doc(db, 'users', TRAINER2), { role: 'entrenador', approved: true, name: 'Trainer Otro', email: 'z@ficticio.test' });
  await setDoc(doc(db, 'users', STUDENT), { role: 'usuario', approved: true, trainerUid: TRAINER, approvedBy: OWNER, name: 'Alumna Nudge', email: 's@ficticio.test' });
  await setDoc(doc(db, 'users', STUDENT_W), { role: 'usuario', approved: true, trainerUid: TRAINER, approvedBy: TRAINER, name: 'Alumno Welcome', email: 'w@ficticio.test' });
  await setDoc(doc(db, 'users', STUDENT_O), { role: 'usuario', approved: true, trainerUid: TRAINER2, approvedBy: TRAINER2, name: 'Alumno Ajeno', email: 'o@ficticio.test' });
  await setDoc(doc(db, 'users', STUDENT_NA), { role: 'usuario', approved: false, trainerUid: TRAINER, name: 'Alumno Sin Aprobar', email: 'na@ficticio.test' });
});

const deltaPresente = MODE === 'candidata';

// N1 — el caso del paquete: el entrenador ASIGNADO anota el aviso
// de pesaje de SU alumna (aunque la aprobó el administrador: la
// relación operante es la asignación, misma puerta que el Worker).
await check('N1 entrenador asignado anota nudge.pes de su alumna',
  nudgeWrite(TRAINER, STUDENT, { pes: fresh(TRAINER) }), deltaPresente);

// N2 — puede anotar dos subclaves en la misma escritura (p. ej. el
// alumno resolvió una y quedó otra) sin tocar ninguna otra clave.
await check('N2 dos subclaves en una sola escritura',
  nudgeWrite(TRAINER, STUDENT, { goal: fresh(TRAINER), per: fresh(TRAINER) }), deltaPresente);

// N3 — re-sellar la misma subclave días después (el segundo aviso
// tras cumplirse el tope de 7 días: el tope vive en el Worker; las
// reglas solo amparan la forma de la anotación).
await check('N3 re-sello de la misma subclave con hora nueva',
  nudgeWrite(TRAINER, STUDENT, { pes: fresh(TRAINER) }), deltaPresente);

// N4 — subclave fuera del banco cerrado.
await check('N4 subclave inventada (foo) denegada',
  nudgeWrite(TRAINER, STUDENT, { foo: fresh(TRAINER) }), false);

// N5 — la firma debe ser la del propio entrenador.
await check('N5 by de otra persona denegado',
  nudgeWrite(TRAINER, STUDENT, { meal: fresh(TRAINER2) }), false);

// N6 — la hora debe ser la del servidor (request.time), no una fija.
await check('N6 at con hora fija denegado',
  nudgeWrite(TRAINER, STUDENT, { meal: { at: Timestamp.fromMillis(1700000000000), by: TRAINER } }), false);

// N7 — alumno de OTRO entrenador: la asignación manda.
await check('N7 alumno asignado a otro entrenador denegado',
  nudgeWrite(TRAINER, STUDENT_O, { pes: fresh(TRAINER) }), false);

// N8 — alumno todavía no aprobado.
await check('N8 alumno no aprobado denegado',
  nudgeWrite(TRAINER, STUDENT_NA, { pes: fresh(TRAINER) }), false);

// N9 — la misma escritura NO puede tocar la clave welcome (la rama
// de AUTH-072 sigue siendo la única vía del entrenador a welcome).
{
  const db = dbFor(TRAINER);
  await check('N9 tocar welcome junto a nudge denegado',
    setDoc(doc(db, 'users', STUDENT), { notices: {
      nudge: { pes: fresh(TRAINER) },
      welcome: { at: serverTimestamp(), by: TRAINER, template: 'welcome' }
    } }, { merge: true }), false);
}

// N10 — ningún otro campo del documento puede cambiar a la vez.
{
  const db = dbFor(TRAINER);
  await check('N10 mezclar otro campo (name) denegado',
    setDoc(doc(db, 'users', STUDENT), { name: 'Cambiado', notices: { nudge: { pes: fresh(TRAINER) } } }, { merge: true }), false);
}

// N11 — la entrada de una subclave es exactamente {at, by}: sin
// campos extra.
await check('N11 entrada con campo extra (nota) denegada',
  nudgeWrite(TRAINER, STUDENT, { pes: { at: serverTimestamp(), by: TRAINER, nota: 'x' } }), false);

// N12 — el alumno no puede anotarse avisos a sí mismo.
await check('N12 el alumno se anota su propio nudge: denegado',
  nudgeWrite(STUDENT, STUDENT, { pes: fresh(STUDENT) }), false);

// N13 — sin sesión no hay anotación.
await check('N13 escritura sin autenticar denegada',
  nudgeWrite(null, STUDENT, { pes: fresh(TRAINER) }), false);

// N14 — REGRESIÓN AUTH-072: el welcome del entrenador a SU alumno
// aprobado por él sigue pasando en ambos textos.
{
  const db = dbFor(TRAINER);
  await check('N14 regresión AUTH-072: welcome del entrenador intacto',
    setDoc(doc(db, 'users', STUDENT_W), { notices: { welcome: { at: serverTimestamp(), by: TRAINER, template: 'welcome' } } }, { merge: true }), true);
}

// N15 — el propietario anota por su rama general (sin delta).
{
  const db = dbFor(OWNER);
  await check('N15 el propietario anota nudge por su rama general',
    setDoc(doc(db, 'users', STUDENT), { notices: { nudge: { bod: fresh(OWNER) } } }, { merge: true }), true);
}

// N16 — una clave superior inventada junto a nudge queda fuera.
await check('N16 clave superior inventada (nudge2) denegada',
  (() => { const db = dbFor(TRAINER);
    return setDoc(doc(db, 'users', STUDENT), { notices: { nudge: { pes: fresh(TRAINER) }, nudge2: { pes: fresh(TRAINER) } } }, { merge: true }); })(), false);

console.log(`\nMODO=${MODE} · PASS=${pass} FAIL=${fail}`);
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
