// RONBO FIT — Batería CI del delta de reglas «campo lang»
// (AUTH-2026-11-03-197; orden de Ronald 2026-11-03: el correo a
// un usuario sale en su ÚLTIMA configuración de idioma guardada
// en la aplicación — la app guarda lang en el propio documento
// y esta rama lo admite). Usuarios FICTICIOS, emulador oficial.
// Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// ee8c6dd5-2664-4d9f-9eac-db9545f6e2a5), toca SOLO la rama de
// perfil inofensivo de match /users/{uid}:
//   · la lista cerrada gana 'lang' (junto a 'mailLang');
//   · guarda gemela: si lang cambia, su valor ∈ ['en','es'].
// Nada más: ni un campo más, ni otra rama.
//
// La suite corre en DOS modos con la misma lista de casos:
//   ESPERA_NUEVO=true  → candidata (lang se comporta como se diseñó)
//   ESPERA_NUEVO=false → texto vivo (lang no existe en la lista:
//                        los casos L1/L2/L7 se invierten a DENY)
// Los vecinos (mailLang, name, campos prohibidos, otros usuarios,
// sin sesión) valen lo mismo en ambos modos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, updateDoc
} from 'firebase/firestore';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const NOMBRE = ESPERA_NUEVO ? 'LANG-CANDIDATA' : 'LANG-VIVO';

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
    console.log('::error title=' + name + '::' + String(e && e.message || e).slice(0, 200).replace(/[\r\n]+/g, ' '));
  }
}

const dbOf = (uid) => uid ? testEnv.authenticatedContext(uid).firestore()
  : testEnv.unauthenticatedContext().firestore();

async function seedUser(uid, extra) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(ctx.firestore(), 'users', uid), Object.assign({
      name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true
    }, extra || {}));
  });
}
await seedUser('dueno', { isOwner: true, role: 'administrador' });
await seedUser('entrenadora', { role: 'entrenador' });
await seedUser('alumna', { role: 'usuario', trainerUid: 'entrenadora' });

const mine = (uid) => doc(dbOf(uid), 'users', uid);
const hers = (asUid, target) => doc(dbOf(asUid), 'users', target);

/* ── L: el campo nuevo ── */
await T('L1 la propia usuaria guarda lang=es', updateDoc(mine('alumna'), { lang: 'es' }), ESPERA_NUEVO);
await T('L2 la propia usuaria guarda lang=en', updateDoc(mine('alumna'), { lang: 'en' }), ESPERA_NUEVO);
await T('L3 lang fuera de la lista cerrada (fr) se deniega', updateDoc(mine('alumna'), { lang: 'fr' }), false);
await T('L4 lang con un campo prohibido (role) se deniega', updateDoc(mine('alumna'), { lang: 'es', role: 'entrenador' }), false);
await T('L5 lang no cadena (número) se deniega', updateDoc(mine('alumna'), { lang: 5 }), false);
await T('L6 vecina mailLang sigue admitida', updateDoc(mine('alumna'), { mailLang: 'es' }), true);
await T('L7 lang+mailLang juntos (la pareja del idioma)', updateDoc(mine('alumna'), { lang: 'es', mailLang: 'en' }), ESPERA_NUEVO);
await T('L8 otra usuaria NO escribe el lang ajeno', updateDoc(hers('entrenadora', 'alumna'), { lang: 'es' }), false);
await T('L9 sin sesión NO se escribe lang', updateDoc(doc(dbOf(null), 'users', 'alumna'), { lang: 'es' }), false);
await T('L10 vecino inofensivo (name) intacto', updateDoc(mine('alumna'), { name: 'Nombre Nuevo' }), true);
await T('L11 mailLang fuera de lista (fr) sigue denegado', updateDoc(mine('alumna'), { mailLang: 'fr' }), false);

console.log('== ' + NOMBRE + ': ' + pass + ' PASS · ' + fail + ' FAIL ==');
if (fail) { console.log('FALLOS: ' + failures.join(' · ')); process.exitCode = 1; }
await testEnv.cleanup();
