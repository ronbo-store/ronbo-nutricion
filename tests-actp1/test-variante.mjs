// SONDA (no es batería): corre G1 y G13 contra la VARIANTE de
// reglas que le pase el workflow (firestore.rules en el dir) e
// imprime si el error de G1 menciona el tope de expresiones.
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'ronbo-nutri-test',
  firestore: { host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8080) }
});
const V = 'v1-2026-11-03', BT_V = 'v1-2026-10-24';
async function seedUser(uid, extra) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), Object.assign({
      name: 'Ficticia ' + uid, email: uid + '@test.local', role: 'usuario',
      isOwner: false, approved: true, termsVersion: 'vX',
      consentSeq: 3, consentReceiptId: uid + '_3'
    }, extra || {}));
  });
}
await seedUser('entrenadorT', { role: 'entrenador' });
await seedUser('aluGrant', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned' });
await seedUser('aluBt', { trainerUid: 'entrenadorT', assignmentStatus: 'assigned', consentSeq: 2, consentReceiptId: 'aluBt_2' });
{
  const db = testEnv.authenticatedContext('aluGrant').firestore();
  const b = writeBatch(db);
  b.set(doc(db, 'users', 'aluGrant'),
    { activityConsents: { sleep: { status: 'accepted', version: V, acceptedAt: serverTimestamp() } },
      consentSeq: 4, consentReceiptId: 'aluGrant_4' }, { merge: true });
  b.set(doc(db, 'consent_receipts', 'aluGrant_4'),
    { uid: 'aluGrant', email: 'aluGrant@test.local', type: 'activity-sleep-granted', version: V, at: serverTimestamp() });
  try { await assertSucceeds(b.commit()); console.log('SONDA G1: PASS'); }
  catch (e) { const m = String(e.message || e).replace(/[\r\n]+/g, ' ⏎ '); console.log('SONDA G1: FAIL · ¿tope? ' + m.includes('maximum of 1000') + ' :: ' + m.slice(0, 8000)); }
}
{
  const db = testEnv.authenticatedContext('aluBt').firestore();
  const b = writeBatch(db);
  b.set(doc(db, 'users', 'aluBt'),
    { bodyTypeConsent: { status: 'accepted', version: BT_V, acceptedAt: serverTimestamp() },
      consentSeq: 3, consentReceiptId: 'aluBt_3' }, { merge: true });
  b.set(doc(db, 'consent_receipts', 'aluBt_3'),
    { uid: 'aluBt', email: 'aluBt@test.local', type: 'bodytype-granted', version: BT_V, at: serverTimestamp() });
  try { await assertSucceeds(b.commit()); console.log('SONDA G13: PASS'); }
  catch (e) { const m = String(e.message || e).replace(/[\r\n]+/g, ' ⏎ '); console.log('SONDA G13: FAIL · ¿tope? ' + m.includes('maximum of 1000') + ' :: COLA :: ' + m.slice(-2500)); }
}
await testEnv.cleanup();
process.exit(0);
