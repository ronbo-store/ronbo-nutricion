// RONBO FIT — Batería gemela del delta de reglas «RECETARIO»
// (AUTH-2026-11-10-364) contra el emulador oficial de Firestore
// (proyecto ficticio ronbo-nutri-test, sin secretos ni datos
// reales). El delta: la cláusula create de /recipes gana UNA rama
// de propietario — el dueño puede sembrar el catálogo 'general'
// SIN foto y nacerlo 'pendiente' o 'publicada' —; para el resto,
// la foto sigue obligatoria y los caminos de siempre no cambian.
// Suite GEMELA:
//   ESPERA_NUEVO=true  → CANDIDATA (vivas b2e231d7 + delta).
//   ESPERA_NUEVO=false → VIVAS b2e231d7 (AUTH-2026-11-10-358): los
//                        tres casos de la rama nueva se DENIEGAN y
//                        el resto se comporta idéntico.
// Salida: fallos.txt solo si hay fallos.
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const N = process.env.ESPERA_NUEVO !== 'false';
const fallos = [];
async function caso(nombre, promesa, debePasar) {
  try {
    if (debePasar) await assertSucceeds(promesa);
    else await assertFails(promesa);
    console.log(`OK    ${nombre} → ${debePasar ? 'PERMITIDO' : 'DENEGADO'}`);
  } catch (e) {
    const crudo = String((e && e.message) || e).replace(/\s+/g, ' ');
    if (!fallos.length) for (let i = 0; i < Math.min(crudo.length, 540); i += 180) fallos.push('CRUDO1 ' + crudo.slice(i, i + 180));
    fallos.push('FALLO: ' + nombre);
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

const DUENO = 'dueno', ALU = 'alumnaS', NUTRI = 'nutriN';
const F = await import('firebase/firestore');
const { doc, setDoc, getDoc, updateDoc } = F;

/* Semilla con reglas apagadas: los documentos que los helpers de
   las reglas leen (users con isOwner/approved y el perfil de
   coach de alimentación aprobado) + dos recetas del dueño. */
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', DUENO), { name: 'Dueño', role: 'administrador', approved: true, isOwner: true });
  await setDoc(doc(db, 'users', ALU), { name: 'Alumna', role: 'usuario', approved: true, isOwner: false });
  await setDoc(doc(db, 'users', NUTRI), { name: 'Coach', role: 'usuario', approved: true, isOwner: false });
  await setDoc(doc(db, 'nutritionist_profiles', NUTRI), { status: 'aprobado' });
  await setDoc(doc(db, 'recipes', 'semillaPub'), { ownerUid: DUENO, scope: 'general', status: 'publicada', photoUrl: 'https://example.com/x.jpg' });
  await setDoc(doc(db, 'recipes', 'semillaPend'), { ownerUid: DUENO, scope: 'general', status: 'pendiente', photoUrl: 'https://example.com/x.jpg' });
});

const dbD = testEnv.authenticatedContext(DUENO).firestore();
const dbA = testEnv.authenticatedContext(ALU).firestore();
const dbN = testEnv.authenticatedContext(NUTRI).firestore();
let seq = 0;
const receta = (over) => ({ ownerUid: DUENO, scope: 'general', status: 'pendiente', title: { es: 'X', en: 'X' }, ...over });
const FOTO = { photoUrl: 'https://example.com/plato.jpg' };

/* — La rama nueva del propietario (el delta) — */
await caso('D1 dueño: general+publicada SIN foto', setDoc(doc(dbD, 'recipes', 't' + (++seq)), receta({ ownerUid: DUENO, status: 'publicada' })), N);
await caso('D2 dueño: general+pendiente SIN foto', setDoc(doc(dbD, 'recipes', 't' + (++seq)), receta({ ownerUid: DUENO })), N);
await caso('D3 dueño: general+publicada CON foto', setDoc(doc(dbD, 'recipes', 't' + (++seq)), receta({ ownerUid: DUENO, status: 'publicada', ...FOTO })), N);
/* — Los caminos de siempre, idénticos en ambas suites — */
await caso('C1 dueño: general+pendiente CON foto (camino viejo)', setDoc(doc(dbD, 'recipes', 't' + (++seq)), receta({ ownerUid: DUENO, ...FOTO })), true);
await caso('C2 alumna: general+pendiente CON foto', setDoc(doc(dbA, 'recipes', 't' + (++seq)), receta({ ownerUid: ALU, ...FOTO })), true);
await caso('C3 alumna: general+pendiente SIN foto → denegado', setDoc(doc(dbA, 'recipes', 't' + (++seq)), receta({ ownerUid: ALU })), false);
await caso('C4 alumna: general+publicada CON foto → denegado', setDoc(doc(dbA, 'recipes', 't' + (++seq)), receta({ ownerUid: ALU, status: 'publicada', ...FOTO })), false);
await caso('C5 coach aprobada: privada+publicada CON foto', setDoc(doc(dbN, 'recipes', 't' + (++seq)), receta({ ownerUid: NUTRI, scope: 'privada', status: 'publicada', ...FOTO })), true);
await caso('C6 coach aprobada: privada+publicada SIN foto → denegado', setDoc(doc(dbN, 'recipes', 't' + (++seq)), receta({ ownerUid: NUTRI, scope: 'privada', status: 'publicada' })), false);
await caso('C7 alumna (no coach): privada+publicada CON foto → denegado', setDoc(doc(dbA, 'recipes', 't' + (++seq)), receta({ ownerUid: ALU, scope: 'privada', status: 'publicada', ...FOTO })), false);
await caso('C8 dueño: ownerUid AJENO sin foto → denegado', setDoc(doc(dbD, 'recipes', 't' + (++seq)), receta({ ownerUid: ALU, status: 'publicada' })), false);
await caso('C9 dueño: privada+publicada SIN foto → denegado (la rama es solo general)', setDoc(doc(dbD, 'recipes', 't' + (++seq)), receta({ ownerUid: DUENO, scope: 'privada', status: 'publicada' })), false);
/* — Lectura y publicación de siempre, intactas — */
await caso('L1 alumna lee la general publicada', getDoc(doc(dbA, 'recipes', 'semillaPub')), true);
await caso('L2 alumna lee la general pendiente ajena → denegado', getDoc(doc(dbA, 'recipes', 'semillaPend')), false);
await caso('U1 dueño publica la pendiente (update de siempre)', updateDoc(doc(dbD, 'recipes', 'semillaPend'), { status: 'publicada' }), true);

try { rmSync(new URL('./fallos.txt', import.meta.url)); } catch {}
if (fallos.length) writeFileSync(new URL('./fallos.txt', import.meta.url), fallos.join('\n') + '\n');
console.log(fallos.length ? `RESULTADO: ${fallos.length} FALLOS` : 'RESULTADO: TODO OK');
await testEnv.cleanup();
process.exit(fallos.length ? 1 : 0);
