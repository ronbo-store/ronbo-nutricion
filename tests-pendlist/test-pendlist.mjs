// RONBO FIT — Batería CI del delta de reglas «sello del mensaje
// combinado de pendientes» (paquete 2026-11-03; pedido de Ronald
// 2026-11-03 18:35 CST). Usuarios FICTICIOS, emulador oficial.
// Nunca toca producción.
//
// El delta, sobre el texto vivo verificado (ruleset
// 7ac4667a-f9d3-4b7f-ae47-4e521f986c80, AUTH-2026-11-03-201),
// toca SOLO la rama de sellos de aviso AUTH-133 de
// match /users/{uid}:
//   · la lista cerrada de subclaves de notices.nudge gana 'all'
//     (el sello del correo combinado «✉ Enviarle sus pendientes»);
//   · la guarda por subclave nudgeSubOk133 se aplica también a
//     'all' (exactamente {at, by}, hora del servidor, su firma).
// Nada más: ni una clave más en ningún mapa, ni otra rama. El
// sello 'all' es independiente de los sellos por pendiente en
// ambas direcciones (subclaves hermanas del mismo mapa).
//
// La suite corre en DOS modos con la misma lista de casos:
//   ESPERA_NUEVO=true  → candidata ('all' se comporta como se diseñó)
//   ESPERA_NUEVO=false → texto vivo ('all' no existe: N1/N7/N13
//                        se invierten a DENY)
// Los vecinos (sellos individuales, formas cerradas, otros
// actores, la rama del propietario) valen lo mismo en ambos.
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, updateDoc, serverTimestamp
} from 'firebase/firestore';

const ESPERA_NUEVO = process.env.ESPERA_NUEVO !== 'false';
const NOMBRE = ESPERA_NUEVO ? 'PENDLIST-CANDIDATA' : 'PENDLIST-VIVO';

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

const EVAL_AT = new Date('2026-10-20T10:00:00Z');
const WEL_AT = new Date('2026-10-21T10:00:00Z');
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
await seedUser('entrenadorT', { role: 'entrenador', approved: true });
await seedUser('entrenadorU', { role: 'entrenador', approved: true });
await seedUser('alumnoS', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned' });
await seedUser('alumnoS2', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned',
  notices: { nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' } } } });
await seedUser('alumnoS3', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', approved: false });
await seedUser('alumnoS4', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned',
  notices: { welcome: { at: WEL_AT, by: 'dueno', template: 'welcome' },
             nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' } } } });
await seedUser('alumnoS5', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned',
  notices: { nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' } } } });
await seedUser('alumnoS6', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned',
  notices: { nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' }, all: { at: EVAL_AT, by: 'entrenadorT' } } } });
await seedUser('alumnoS7', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned',
  notices: { nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' }, pes: { at: EVAL_AT, by: 'entrenadorT' } } } });

const upd = (asUid, target, data) => updateDoc(doc(dbOf(asUid), 'users', target), data);
const selloAll = by => ({ notices: { nudge: { all: { at: serverTimestamp(), by } } } });

/* — El delta: el sello del combinado — */
await T('N1 el entrenador asignado anota notices.nudge.all {at: servidor, by: él} sobre su alumno aprobado',
  upd('entrenadorT', 'alumnoS', selloAll('entrenadorT')), ESPERA_NUEVO);
await T('N2 el sello con la firma de OTRO se deniega',
  upd('entrenadorT', 'alumnoS', selloAll('entrenadorU')), false);
await T('N3 el sello con una clave de más (no es exactamente {at, by}) se deniega',
  upd('entrenadorT', 'alumnoS', { notices: { nudge: { all: { at: serverTimestamp(), by: 'entrenadorT', extra: 1 } } } }), false);
await T('N4 el sello con hora del CLIENTE (no la del servidor) se deniega',
  upd('entrenadorT', 'alumnoS', { notices: { nudge: { all: { at: new Date('2020-01-01T00:00:00Z'), by: 'entrenadorT' } } } }), false);
await T('N5 el entrenador NO asignado no anota el sello',
  upd('entrenadorU', 'alumnoS', selloAll('entrenadorU')), false);
await T('N6 el propio alumno no anota el sello sobre sí mismo',
  upd('alumnoS', 'alumnoS', selloAll('alumnoS')), false);
await T('N7 independencia: anotar «all» junto a un sello individual fresco suyo, dejando el viejo intacto, se admite entero',
  upd('entrenadorT', 'alumnoS2', { notices: { nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' }, all: { at: serverTimestamp(), by: 'entrenadorT' } } } }), ESPERA_NUEVO);
await T('N13 con otras claves de notices ya presentes (welcome) y sin tocarlas, el sello «all» entra por la misma rama',
  upd('entrenadorT', 'alumnoS4', { notices: { welcome: { at: WEL_AT, by: 'dueno', template: 'welcome' }, nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' }, all: { at: serverTimestamp(), by: 'entrenadorT' } } } }), ESPERA_NUEVO);
await T('N11 sobre un alumno NO aprobado no se anota el sello',
  upd('entrenadorT', 'alumnoS3', selloAll('entrenadorT')), false);
await T('N14 sin sesión no se anota nada',
  upd(null, 'alumnoS', selloAll('entrenadorT')), false);

/* — Vecinos: la familia se comporta igual en ambos textos — */
await T('N8 el sello INDIVIDUAL de siempre (nudge.eval fresco sobre su sello viejo) sigue admitido',
  upd('entrenadorT', 'alumnoS5', { notices: { nudge: { eval: { at: serverTimestamp(), by: 'entrenadorT' } } } }), true);
await T('N16 BORRAR el sello «all» (escribir el mapa sin él cuando existe): la CANDIDATA lo deniega (los sellos solo nacen o se refrescan); en la VIVA la subclave no existe en ningún dato real y la rama no la ve — el hueco es vacío hoy y lo cierra este delta',
  upd('entrenadorT', 'alumnoS6', { notices: { nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' } } } }), !ESPERA_NUEVO);
await T('N17 BORRAR un sello CONOCIDO (eval) se deniega en ambas: la protección antirremoción ya existía para las subclaves de la lista',
  upd('entrenadorT', 'alumnoS7', { notices: { nudge: { pes: { at: EVAL_AT, by: 'entrenadorT' } } } }), false);
await T('N9 una subclave desconocida (nudge.zzz) se deniega',
  upd('entrenadorT', 'alumnoS', { notices: { nudge: { zzz: { at: serverTimestamp(), by: 'entrenadorT' } } } }), false);
await T('N10 el sello acompañado de otro campo cambiado (name) se deniega: la rama solo toca notices',
  upd('entrenadorT', 'alumnoS', Object.assign(selloAll('entrenadorT'), { name: 'Otro Nombre' })), false);
await T('N15 mezclar el sello con un cambio de welcome en la misma escritura se deniega (cada rama, su llave)',
  upd('entrenadorT', 'alumnoS4', { notices: { welcome: { at: serverTimestamp(), by: 'entrenadorT', template: 'welcome' }, nudge: { eval: { at: EVAL_AT, by: 'entrenadorT' }, all: { at: serverTimestamp(), by: 'entrenadorT' } } } }), false);
await T('N12 el propietario anota sus sellos de Comunicaciones por su rama general (regresión)',
  upd('dueno', 'alumnoS', { notices: { daySummary: { at: serverTimestamp(), by: 'dueno', template: 'daySummary' } } }), true);

console.log(`\n===== ${NOMBRE}: ${pass}/${pass + fail} PASS =====`);
if (failures.length) { console.log('FALLOS: ' + failures.join(' · ')); process.exit(1); }
await testEnv.cleanup();
process.exit(0);
