// RONBO NUTRI — Batería CI del delta ENFOQUE DE OBJETIVOS
// (2026-10-26, diseño DISEÑO-ENFOQUE-OBJETIVOS §5.4). Usuarios
// FICTICIOS, emulador LOCAL. Nunca toca producción. Banco de
// reglas: ./firestore.rules = candidato de publicación (texto vivo
// verificado e79df57e, SHA-256 7900d3bb…, + SOLO el delta
// goalFocus; candidato SHA-256 b2abe7f1…).
//
// Forma REAL que escribe la app (diseño §2.2): el campo goalFocus
// viaja COMPLETO en users/{uid} con serverTimestamp() en
// declaredAt/updatedAt al declarar:
//   { focus, status, declaredAt: TS, strengthConfirmed,
//     competition: null | { date, phase, phaseObjective,
//     checkinEveryDays }, decidedBy, decidedAt, updatedAt: TS }
// El alumno declara (general/recomposición directo; competencia
// nace 'pending-trainer' solo con entrenador asignado); SOLO el
// entrenador ASIGNADO activa competencia y cambia de fase,
// firmando decidedBy/decidedAt y sin tocar el contenido del
// alumno. Los 16 casos son los mínimos del §5.4 del diseño.
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
async function readGF(uid) {
  let gf = null;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), 'users', uid));
    gf = s.exists() ? (s.data().goalFocus || null) : null;
  });
  return gf;
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
    goals: { kcal: 2100, prot: 140, carb: 200, azuc: 26, gras: 60 }
  });
  await setDoc(doc(db, 'users', 'clientB'), { ...base, name: 'Cliente B', role: 'usuario', trainerUid: 'trainer2', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  await setDoc(doc(db, 'users', 'clientD'), { ...base, name: 'Cliente D', role: 'usuario', trainerUid: null, assignmentStatus: 'waiting', approved: false, consentSeq: 3, termsVersion: 'v3-2026-10-16' });
  // clientE: declaración de competencia YA sembrada en 'pending-trainer'
  await setDoc(doc(db, 'users', 'clientE'), {
    ...base, name: 'Cliente E', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16',
    goalFocus: {
      focus: 'competencia', status: 'pending-trainer', declaredAt: serverTimestamp(), strengthConfirmed: null,
      competition: { date: '2027-03-15', phase: null, phaseObjective: null, checkinEveryDays: null },
      decidedBy: null, decidedAt: null, updatedAt: serverTimestamp()
    }
  });
  // clientF: competencia YA activa (fase volumen, decidida por trainer1)
  await setDoc(doc(db, 'users', 'clientF'), {
    ...base, name: 'Cliente F', role: 'usuario', trainerUid: 'trainer1', assignmentStatus: 'assigned', consentSeq: 3, termsVersion: 'v3-2026-10-16',
    goalFocus: {
      focus: 'competencia', status: 'active', declaredAt: serverTimestamp(), strengthConfirmed: null,
      competition: { date: '2027-04-20', phase: 'volumen', phaseObjective: 'ganar', checkinEveryDays: 7 },
      decidedBy: 'trainer1', decidedAt: serverTimestamp(), updatedAt: serverTimestamp()
    }
  });
});

const owner = testEnv.authenticatedContext('owner1').firestore();
const tr1 = testEnv.authenticatedContext('trainer1').firestore();
const tr2 = testEnv.authenticatedContext('trainer2').firestore();
const A = testEnv.authenticatedContext('clientA').firestore();
const B = testEnv.authenticatedContext('clientB').firestore();
const D = testEnv.authenticatedContext('clientD').firestore();
const E = testEnv.authenticatedContext('clientE').firestore();
const F = testEnv.authenticatedContext('clientF').firestore();
const USR = (db, uid) => doc(db, 'users', uid);
const TS = serverTimestamp();
const GF_GENERAL = { focus: 'general', status: 'active', declaredAt: TS, strengthConfirmed: null, competition: null, decidedBy: null, decidedAt: null, updatedAt: TS };
const GF_RECOMP = { focus: 'recomposicion', status: 'active', declaredAt: TS, strengthConfirmed: true, competition: null, decidedBy: null, decidedAt: null, updatedAt: TS };
const GF_COMP_PENDING = (date) => ({
  focus: 'competencia', status: 'pending-trainer', declaredAt: TS, strengthConfirmed: null,
  competition: { date, phase: null, phaseObjective: null, checkinEveryDays: null },
  decidedBy: null, decidedAt: null, updatedAt: TS
});

// ============ GF — goalFocus: declaración del alumno ============
await T('GF01 el alumno declara enfoque general con la forma real: admitida',
  updateDoc(USR(A, 'clientA'), { goalFocus: GF_GENERAL }), true);
await T('GF02 el alumno declara recomposición con su confirmación de fuerza: admitida',
  updateDoc(USR(A, 'clientA'), { goalFocus: GF_RECOMP }), true);
await T('GF03 el alumno SIN entrenador declara competencia: denegada (no nace sin asignación)',
  updateDoc(USR(D, 'clientD'), { goalFocus: GF_COMP_PENDING('2027-06-01') }), false);
await T('GF04 el alumno CON entrenador declara competencia: nace pending-trainer, admitida',
  updateDoc(USR(B, 'clientB'), { goalFocus: GF_COMP_PENDING('2027-05-01') }), true);
{
  const gf = await readGF('clientB');
  const ok = !!gf && gf.focus === 'competencia' && gf.status === 'pending-trainer'
    && gf.competition && gf.competition.date === '2027-05-01' && gf.competition.phase === null
    && gf.decidedBy === null && gf.decidedAt === null;
  if (ok) { pass++; console.log('PASS — GF04b lo guardado es la declaración pendiente exacta (sin fase ni decisión)'); }
  else { fail++; failures.push('GF04b datos'); console.log('FAIL — GF04b lo guardado no es la declaración pendiente exacta'); }
}
await T('GF05 el alumno se AUTO-ACTIVA su competencia (status active + fase): denegada',
  updateDoc(USR(E, 'clientE'), {
    goalFocus: {
      focus: 'competencia', status: 'active', declaredAt: TS, strengthConfirmed: null,
      competition: { date: '2027-03-15', phase: 'volumen', phaseObjective: 'ganar', checkinEveryDays: null },
      decidedBy: null, decidedAt: null, updatedAt: TS
    }
  }), false);
await T('GF06 el alumno FALSIFICA decidedBy en su declaración pendiente: denegada',
  updateDoc(USR(E, 'clientE'), {
    goalFocus: {
      focus: 'competencia', status: 'pending-trainer', declaredAt: TS, strengthConfirmed: null,
      competition: { date: '2027-03-15', phase: null, phaseObjective: null, checkinEveryDays: null },
      decidedBy: 'trainer1', decidedAt: TS, updatedAt: TS
    }
  }), false);
{
  const gfF = await readGF('clientF');
  await T('GF07 el alumno MUEVE LA FASE de su competencia activa: denegada (la fase es del entrenador)',
    updateDoc(USR(F, 'clientF'), {
      goalFocus: {
        ...gfF, updatedAt: TS,
        competition: { ...gfF.competition, phase: 'definicion', phaseObjective: 'bajar' }
      }
    }), false);
}
{
  const gfE = await readGF('clientE');
  await T('GF08 un entrenador NO asignado activa la competencia del cliente: denegada',
    updateDoc(USR(tr2, 'clientE'), {
      goalFocus: {
        ...gfE, status: 'active', decidedBy: 'trainer2', decidedAt: TS, updatedAt: TS,
        competition: { ...gfE.competition, phase: 'volumen', phaseObjective: 'ganar' }
      }
    }), false);
}

// ============ GF — activación y fases: el entrenador asignado ============
{
  const gfE = await readGF('clientE');
  await T('GF09 el entrenador ASIGNADO activa con pareja coherente (volumen<->ganar) y fija la frecuencia: admitida',
    updateDoc(USR(tr1, 'clientE'), {
      goalFocus: {
        ...gfE, status: 'active', decidedBy: 'trainer1', decidedAt: TS, updatedAt: TS,
        competition: { ...gfE.competition, phase: 'volumen', phaseObjective: 'ganar', checkinEveryDays: 7 }
      }
    }), true);
}
{
  const gf = await readGF('clientE');
  const ok = !!gf && gf.status === 'active' && gf.decidedBy === 'trainer1' && !!gf.decidedAt
    && gf.competition.phase === 'volumen' && gf.competition.phaseObjective === 'ganar'
    && gf.competition.checkinEveryDays === 7 && gf.competition.date === '2027-03-15';
  if (ok) { pass++; console.log('PASS — GF09b lo guardado es la activación exacta (firmada, fase y frecuencia, fecha del alumno intacta)'); }
  else { fail++; failures.push('GF09b datos'); console.log('FAIL — GF09b lo guardado no es la activación exacta'); }
}
{
  const gfB = await readGF('clientB');
  await T('GF10 el entrenador asignado activa con pareja INCOHERENTE (volumen<->bajar): denegada',
    updateDoc(USR(tr2, 'clientB'), {
      goalFocus: {
        ...gfB, status: 'active', decidedBy: 'trainer2', decidedAt: TS, updatedAt: TS,
        competition: { ...gfB.competition, phase: 'volumen', phaseObjective: 'bajar' }
      }
    }), false);
}
{
  const gfE = await readGF('clientE');
  await T('GF11 el entrenador asignado cambia la FECHA del alumno al cambiar de fase: denegada (la fecha es del alumno)',
    updateDoc(USR(tr1, 'clientE'), {
      goalFocus: {
        ...gfE, updatedAt: TS,
        competition: { ...gfE.competition, date: '2027-03-22', phase: 'definicion', phaseObjective: 'bajar' }
      }
    }), false);
  await T('GF12 el entrenador asignado CAMBIA DE FASE (volumen->definición) conservando decisión y frecuencia: admitida',
    updateDoc(USR(tr1, 'clientE'), {
      goalFocus: {
        ...gfE, updatedAt: TS,
        competition: { ...gfE.competition, phase: 'definicion', phaseObjective: 'bajar' }
      }
    }), true);
}
{
  const gfE = await readGF('clientE');
  await T('GF13 el alumno CORRIGE SU FECHA con la competencia activa (fase y decisión intactas): admitida',
    updateDoc(USR(E, 'clientE'), {
      goalFocus: {
        ...gfE, updatedAt: TS,
        competition: { ...gfE.competition, date: '2027-03-20' }
      }
    }), true);
  const gfE2 = await readGF('clientE');
  await T('GF14 el alumno SALE a general conservando la decisión del entrenador como registro: admitida',
    updateDoc(USR(E, 'clientE'), {
      goalFocus: {
        focus: 'general', status: 'active', declaredAt: TS, strengthConfirmed: null, competition: null,
        decidedBy: gfE2.decidedBy, decidedAt: gfE2.decidedAt, updatedAt: TS
      }
    }), true);
}
await T('GF15 el entrenador CREA una declaración desde cero en un cliente sin ella: denegada (él no declara)',
  updateDoc(USR(tr1, 'clientA'), {
    goalFocus: {
      focus: 'competencia', status: 'active', declaredAt: TS, strengthConfirmed: null,
      competition: { date: '2027-01-10', phase: 'volumen', phaseObjective: 'ganar', checkinEveryDays: null },
      decidedBy: 'trainer1', decidedAt: TS, updatedAt: TS
    }
  }), false);
await T('GF16 goalFocus + approved colado en la misma escritura del alumno: denegada (ninguna rama la admite)',
  updateDoc(USR(D, 'clientD'), { goalFocus: GF_GENERAL, approved: true }), false);

console.log(`ENFOQUE: ${pass} PASS · ${fail} FAIL`);
if (failures.length) { console.log('FALLOS:'); failures.forEach(f => console.log(' · ' + f)); }
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
