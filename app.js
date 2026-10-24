/* ronbo.nutri — app privada multiusuario. Cada cuenta ve solo sus datos. */
import { initializeApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, deleteUser,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, getDocFromServer, collection, getDocs, getDocsFromServer, addDoc,
  setDoc, deleteDoc, serverTimestamp, query, where, limit, writeBatch, onSnapshot,
} from "firebase/firestore";
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject,
} from "firebase/storage";

/* Configuración del proyecto Firebase ronbo-nutri (S4, 2026-10-14).
   La clave web está restringida por referentes y por API en Google Cloud. */
const firebaseConfig = {
  apiKey: "AIzaSyAhXRsW2tl0wPxXMuD9_074_ZaS-BaPbno",
  authDomain: "ronbo-nutri.firebaseapp.com",
  projectId: "ronbo-nutri",
  storageBucket: "ronbo-nutri.firebasestorage.app",
  messagingSenderId: "45863499739",
  appId: "1:45863499739:web:c78dc218d2452b8c52d9fe"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
/* La foto de comida del formulario (#m-photo) requiere Firebase Storage
   (plan Blaze): STORAGE_READY = false la oculta; cuando el dueño active
   Blaze, poner true y desplegar. Las fotos de PROGRESO no dependen de
   Storage desde 2026-10-19: se guardan comprimidas como dataURL en
   Firestore (ver la sección «MI PROGRESO»). */
const STORAGE_READY = false;

let UDATA = {};      // users/{uid}: {name, email, role, isOwner, approved}
let IS_OWNER = false;
/* ============ MODELO DE TRES ROLES (2026-10-23, SOLO desarrollo) ============
   Requisito de Ronald (correo expreso 2026-10-23 17:53): campo
   role en users/{uid} con tres valores exactos: 'administrador'
   (Ronald), 'entrenador', 'usuario'. Solo el administrador lo
   asigna o cambia (la UI de roles vive solo en su superficie; las
   reglas vigentes ya impiden que un cliente toque su role — sus
   ramas de auto-actualización son listas cerradas — y el candidato
   de reglas del paquete lo hace explícito y añade el alcance del
   entrenador). Derivación al entrar: isOwner ⇒ administrador;
   role 'entrenador' ⇒ entrenador; cualquier otro caso (incluido el
   legado role 'user' o sin campo) ⇒ usuario. Asignación de
   clientes: users/{uid}.trainerUid (uid del entrenador o del
   administrador responsable) + assignmentStatus
   'assigned'|'waiting'; en espera = bajo el administrador. */
let ROLE = 'usuario';
function deriveRole(udata, isOwner) {
  if (isOwner) return 'administrador';
  return udata && udata.role === 'entrenador' ? 'entrenador' : 'usuario';
}
let suppressAuthCheck = false; // evita el chequeo durante el registro (el doc aún se está creando)

/* Sin metas por defecto (decisión de Ronald, 2026-10-20: «que nazcan
   sin metas hasta que el entrenador las fije»): la cuenta nace SIN
   campo goals y GOALS queda {} hasta que el entrenador las establece
   desde el editor de metas. goalOf(key) devuelve la meta de una
   métrica o null si no está fijada; hasAnyGoal() indica si hay alguna. */
let GOALS = {}; // metas del usuario en sesión; {} = sin metas fijadas
const METRICS = [
  { key: 'kcal', name: 'CALORÍAS',     icon: '🔥', color: '#22C55E', unit: 'kcal' },
  { key: 'prot', name: 'PROTEÍNA',      icon: '💪', color: '#3B82F6', unit: 'g' },
  { key: 'carb', name: 'CARBOHIDRATOS', icon: '🌾', color: '#F59E0B', unit: 'g' },
  { key: 'azuc', name: 'AZÚCARES',      icon: '🍬', color: '#A855F7', unit: 'g', max: true },
  { key: 'gras', name: 'GRASAS',        icon: '🫀', color: '#EF4444', unit: 'g' },
];
const MEAL_ORDER = { 'Desayuno': 1, 'Merienda': 2, 'Almuerzo': 3, 'Snack': 4, 'Cena': 5 };
const goalOf = key => { const v = Number(GOALS[key]); return (isFinite(v) && v > 0) ? v : null; };
const hasAnyGoal = () => METRICS.some(m => goalOf(m.key) !== null);

let MEALS = {};   // fecha -> [{id, meal, food, qty, kcal, prot, carb, sugar, fat, notes}]
let WEIGHTS = []; // [{id, date, weight, fat, muscle, notes}]
/* ================= I18N (English default, ES/EN toggle) ================= */
const STR = {
en: {
  'app.title': 'ronbo.nutri · Private',
  'auth.subtitle': 'Your private nutrition log',
  'auth.tabLogin': 'Sign in',
  'auth.tabRegister': 'Create account',
  'form.email': 'Email',
  'form.password': 'Password',
  'auth.forgot': 'Forgot your password?',
  'pw.show': 'Show password', 'pw.hide': 'Hide password',
  'auth.signin': 'Sign in',
  'form.fullname': 'Full name',
  'form.fullnamePh': 'E.g. Maria Garcia',
  'form.emailLong': 'Email address',
  'form.phone': 'Phone number',
  'form.phonePh': 'E.g. +1 901 555 1234',
  'form.gender': 'Sex / Gender',
  'form.select': 'Select…',
  'form.social': 'Social media',
  'form.socialPh': 'E.g. Instagram: @user',
  'form.opt': '(optional)',
  'form.passwordHint': 'This is your ronbo.nutri account password, not your social media one.',
  'form.password2': 'Confirm password',
  'form.optional': 'optional',
  'health.title': '🏥 Health declaration',
  'health.hint': 'Check any conditions you have. It\'s for your safety: your trainer must know them before assigning an exercise or nutrition plan.',
  'health.details': 'Details / medications',
  'health.detailsPh': 'E.g. Takes metformin; left knee injury in 2023…',
  'health.ok': 'I declare that the health information provided is true.',
  'health.clientTitle': '🏥 Client health declaration',
  'health.regNote': 'You can complete your health declaration later, in your profile, with its own specific consent. It is not required to create your account.',
  'card.toggle': 'Show or hide section',
  'main.progress': 'Progress', 'main.food': 'Food', 'main.training': 'Training', 'main.pendings': 'Pendings',
  'health.panelTitle': '🏥 My health declaration',
  'health.specText': 'I give my SPECIFIC consent for ronbo.nutri to process my health declaration so my trainer can adapt my program and take precautions. Only my trainer and I can see it. I can withdraw this consent at any time: withdrawal blocks my trainer\'s access to my answers, but does not delete them.',
  'health.statusNone': 'You have not given specific consent for health data. Without it, no declaration is collected and your trainer cannot see any health answers.',
  'health.statusActive': 'Your specific consent is active (version {v} · accepted {date}). Your trainer can view your current declaration.',
  'health.statusWithdrawnSpec': 'Your specific consent is withdrawn. Your previous declarations are blocked: your trainer cannot view or use them, and they are kept, not deleted. If you renew your consent you will make a NEW declaration; your previous ones stay blocked.',
  'health.startBtn': 'Give my specific consent and start my declaration',
  'health.saveDecl': 'Save my declaration',
  'health.editDecl': 'Edit my declaration',
  'health.currentTitle': 'Your current declaration',
  'health.blockedTitle': 'Your previous declarations (blocked)',
  'health.blockedNote': 'Read-only: you can view them, but they cannot be edited and your trainer cannot see them.',
  'health.withdrawSpec': 'Withdraw my specific consent (health)',
  'health.withdrawSpecConfirm': 'Withdraw your SPECIFIC consent for health data? Your trainer will immediately lose access to your declarations. Your answers are kept blocked, not deleted. This is different from withdrawing your general consent or deleting your account.',
  'health.renewSpec': 'Renew my specific consent',
  'health.renewSpecConfirm': 'Renew your SPECIFIC consent? This lets you make a NEW declaration. Your previous declarations stay blocked and are NOT reactivated.',
  'health.renewedSpec': 'Your specific consent is renewed. You can now make a new declaration.',
  'health.declSaved': 'Your declaration has been saved.',
  'health.withdrawnSpec': 'Your specific consent has been withdrawn. Your declarations are now blocked.',
  'health.specGranted': 'Your specific consent is recorded. You can now complete your declaration.',
  'health.fourActions': 'Four different actions: withdrawing your GENERAL consent (in Privacy & Data), withdrawing your SPECIFIC health consent (here), deleting your health answers (a separate request: ask your trainer), and deleting your account and all its data (in Privacy & Data). Each has different effects.',
  'health.specSummary': 'Summary of the specific consent: ronbo.nutri may process your health declaration so your trainer can adapt your program and take precautions; only you and your trainer can see it; you may withdraw it at any time — withdrawal blocks access but does not delete your answers. The full text, which is the one that governs, appears in full next to the checkbox below.',
  'health.specFullTitle': 'Full text of the specific consent',
  'health.fourActionsTitle': 'The four actions, explained',
  'health.manage': 'Manage my health declaration',
  'health.sectionTitle': 'Health declaration',
  'health.declActiveNoConds': 'Active · no conditions declared',
  'health.declNoConds': 'No conditions declared',
  'health.declLoadError': 'Your declaration couldn\'t be loaded',
  'health.trainerNoAccess': 'Health declaration not available: this client has no active specific consent, or their declaration is blocked.',
  'health.trainerViewNote': 'Read-only. Health answers belong to the client; only the client can change them.',
  'health.needSpec': 'You must first give your specific consent.',
  'health.versionLabel': 'Declaration {n} · {date}',
  'terms.accept': 'I have read and accept the privacy notice.',
  'terms.body': '<b>PRIVACY NOTICE AND CONSENT FOR THE PROCESSING OF PERSONAL DATA</b><br><br>When you create your account at <b>ronbo.nutri</b>, you agree to the following:<br><br><b>1. Controller.</b> ronbo.nutri is responsible for your data.<br><br><b>2. Data we collect.</b> Name, email, phone, sex/gender, social media (optional), health condition declaration, food logs, weight and body composition, profile, progress and food photos (for nutritional analysis), and your nutrition goals.<br><br><b>3. Purpose.</b> To provide personalized training and nutrition coaching services, track your progress, and communicate with you.<br><br><b>4. Storage.</b> Your data is stored securely in Google Firebase (United States), with restricted access: only you and your trainer can see it.<br><br><b>5. Your rights.</b> You may at any time request to view, correct, or delete your data. Deleting your account erases your records.<br><br><b>6. Retention.</b> Your general account data (profile, food, weight and activity logs) are kept while your account is active. Your health declarations are treated separately: they are kept only while your specific consent is in force and your training relationship is active. If you withdraw your specific consent, or your training relationship ends, your health declarations are immediately blocked from ordinary use and will be deleted no later than 12 months after the first of those events to occur, unless you ask us to delete them sooner. Later use of the app, renewing your general consent, or resuming your training relationship does not extend or restart that period. Deletion under this clause is carried out through our documented manual procedure; it is not an automated process. If a specific legal obligation or an ongoing claim requires keeping specific information longer, we will keep only that information, for only that period, and we will tell you what is kept, why, and until when. Minimal consent records (the date and text version of each consent you give, withdraw or renew, without your health answers) may be kept as proof of consent while your account exists and for up to 24 months after it is closed.<br><br><b>7. Minors.</b> This service is for adults 18 and older only.<br><br><b>8. Withdrawal of consent.</b> You may withdraw your general consent at any time from the Privacy & Data section of the app, or by writing to your trainer. Withdrawing it suspends your access to the service; it does not by itself delete your data or close your account. Your existing information is kept under the retention policy in clause 6, and you may renew your general consent at any time. Renewing your consent is not the same as being approved as a client: access to the functions reserved for approved clients also requires your trainer\'s approval, which after a withdrawal may need to be granted again. Your health declaration is governed by a separate, specific consent: withdrawing that specific consent immediately blocks your trainer\'s ordinary access to your health declarations, which are kept restricted under clause 6 and are never reactivated by renewing the general consent. If you later renew your specific consent, you may submit a new declaration; declarations already blocked are not reactivated. You may at any time request the deletion of your health answers — a separate request that we process manually — without deleting your account. You may also delete your account and your data from the Privacy & Data section, subject only to the minimal consent records and the justified exceptions described in clause 6.<br><br><b>9. Health and exercise.</b> The trainer is an ISSA-certified fitness professional, not a medical professional. Consult your doctor before starting any exercise or nutrition program, especially if you declared a health condition.<br><br>By checking the box and creating your account, you declare that you read this notice and consent to the processing of your data for the purposes described.',
  'auth.create': 'Create my account',
  'app.logout': 'log out',
  'app.goals': 'Your daily goals',
  'app.myPhoto': 'My photo',
  'app.loading': 'Loading…',
  'avatar.change': 'Tap to change your profile photo',
  'tabs.track': '📊 My log',
  'tabs.clients': '👥 My clients',
  'tabs.access': '🔐 Access',
  'track.date': '📅 Date:',
  'track.addMeal': '＋ Log meal',
  'track.weekTitle': '📈 Weekly goal compliance',
  'track.detail': 'Food diary',
  'th.moment': 'Meal', 'th.food': 'Food', 'th.amount': 'Amount',
  'th.cal': 'Cal', 'th.prot': 'Prot (g)', 'th.carb': 'Carb (g)', 'th.sugar': 'Sugar (g)', 'th.fat': 'Fat (g)',
  'track.summary': 'Summary vs. goals',
  'track.notes': '📝 Notes',
  'track.emptyDay': 'No entries this day. Add a meal with the FOOD button (photo) or from "Meal help" (manual).',
  'track.viewPhoto': 'View photo',
  'track.delete': 'Delete',
  'track.repeat': 'Repeat',
  'repeat.bannerAi': 'Copy of an AI estimate: adjust the amount and the values are recalculated proportionally. Check them before saving.',
  'repeat.bannerQty': 'Copy of another entry: adjust the amount and the values are recalculated proportionally.',
  'repeat.bannerPieces': 'This entry is counted in units, not by weight: the macro values are NOT recalculated when the amount changes. Check them by hand.',
  'repeat.scaled': 'Values recalculated for the new amount (proportional to the original entry).',
  'vs.indicator': 'Metric', 'vs.intake': 'Intake', 'vs.goal': 'Goal', 'vs.progress': 'Progress',
  'metric.kcal': 'CALORIES', 'metric.prot': 'PROTEIN', 'metric.carb': 'CARBS', 'metric.azuc': 'SUGAR', 'metric.gras': 'FAT',
  'rings.title': 'Metric detail',
  'rings.firstNote': 'Your rings are at zero because nothing is logged for this day yet. Each ring fills as you log meals and compares your day with your goal: kcal = the energy you eat · protein = builds and repairs muscle · carbohydrates = your main fuel · sugars = the one to keep under its limit · fat = essential fats. Tap a ring to see its detail.',
  'rings.contributions': 'Contributions',
  'rings.topContrib': 'Top contributor',
  'rings.ofDay': 'of the day',
  'rings.noContrib': 'No meal contributed to this metric on this day.',
  'weight.title': '⚖️ Weight progress',
  'weight.sub': '· weekly weigh-in',
  'weight.add': '＋ Log weigh-in',
  'weight.loading': 'Loading weigh-ins…',
  'weight.empty': 'No weigh-ins yet.<br>Use "{btn}" when you weigh yourself — the chart draws itself.',
  'weight.reminder': '⚠️ It\'s been {d} days since your last weigh-in. Remember to log your weight every week.',
  'weight.current': 'CURRENT WEIGHT',
  'weight.vsPrev': 'VS PREVIOUS',
  'weight.totalChange': 'TOTAL CHANGE',
  'weight.firstRecord': 'first entry',
  'weight.since': 'since {d} · {n} weigh-in{s}',
  'weight.bodyFat': 'BODY FAT',
  'weight.delLast': 'Delete last weigh-in ({date})',
  'weight.history': 'Weigh-in history',
  'weight.chartWeight': 'Weight (kg)',
  'weight.chartFat': 'Fat (%)',
  'weight.title2': 'Log weigh-in',
  'compacc.notice': '🔒 Your trainer logs your body composition (weight, body fat, muscle, water and visceral fat). You can view it here, but you cannot change it.',
  'compacc.noticeShort': 'Your trainer logs your body composition.',
  'compacc.title': 'Body composition entry',
  'compacc.modeTrainer': 'Right now: the trainer logs this client\'s body composition.',
  'compacc.modeClient': 'Right now: this client may log their own body composition.',
  'compacc.grant': 'Allow the client to log it',
  'compacc.revoke': 'Back to trainer-only',
  'compacc.history': 'Change history',
  'compacc.histTrainer': 'Trainer-only entry',
  'compacc.histClient': 'Client entry allowed',
  'compacc.histBy': 'by {who} · {when}',
  'compacc.histEmpty': 'No changes yet — the default (trainer-only) applies.',
  'compacc.needClientOpen': 'This setting is created when the client opens the app for the first time. Ask them to open it once, then try again.',
  'compacc.saved': 'Body-composition entry updated.',
  'compacc.blocked': 'Your trainer logs your body composition — this entry is read-only for you.',
  'compacc.pctNote': '🔒 Percentages and notes are recorded by your trainer.',
  'frame.title': 'Framing guide',
  'frame.pick': 'Choose photo',
  'frame.camera': 'Use camera',
  'frame.capture': 'Take photo',
  'frame.use': 'Use this photo',
  'frame.retake': 'Retake',
  'frame.timer': 'Timer',
  'frame.noCam': 'The camera is not available here — choose a photo instead.',
  'frame.guide.front': 'Face the camera, arms relaxed at your sides, your whole body inside the silhouette.',
  'frame.guide.side': 'Stand sideways to the camera, looking straight ahead, arms relaxed, your whole body inside the silhouette.',
  'frame.guide.back': 'Turn your back to the camera, arms relaxed at your sides, your whole body inside the silhouette.',
  'roles.administrador': 'Administrator',
  'roles.entrenador': 'Trainer',
  'roles.usuario': 'User',
  'roles.roleLabel': 'Role',
  'roles.roleSaved': 'Role updated.',
  'roles.chooseTrainer': 'Who will be your trainer?',
  'roles.waitingOption': 'Decide later — wait for assignment',
  'roles.waitingTitle': '⏳ Waiting for assignment',
  'roles.waitingHint': 'These clients chose to wait for a trainer. They stay under the administrator\'s responsibility until you assign one.',
  'roles.assign': 'Assign',
  'roles.assigned': 'Trainer assigned.',
  'roles.notYourClient': 'This client is not assigned to you.',
  'roles.dirUpdate': 'Update the trainer directory (for sign-up)',
  'roles.dirUpdated': 'Trainer directory updated.',
  'roles.noWaiting': 'Nobody is waiting for assignment.',
  'appr.title': '🆕 Trainer account approvals',
  'appr.hint': 'Each trainer may approve new accounts up to this limit. Approving an account assigns it to the trainer who approves it. If no limit is set, trainers cannot approve — only you can.',
  'appr.limitLabel': 'Max approvals per trainer',
  'appr.saved': 'Approvals limit saved.',
  'appr.noLimitSet': 'No limit set: trainers cannot approve accounts.',
  'appr.usedOf': '{used} of {limit} approvals used',
  'appr.trayTitle': '🆕 New accounts',
  'appr.trayHint': 'New accounts waiting for approval. Approving one assigns it to you and uses one of your approvals.',
  'appr.noLimit': 'The administrator has not set an approval limit yet, so you cannot approve accounts.',
  'appr.exhausted': 'You have used all your approvals.',
  'appr.none': 'No new accounts are waiting for approval.',
  'appr.done': 'Account approved — the client is now assigned to you.',
  'appr.error': 'It could not be completed. Please try again.',
  'progress.title': '📸 My progress',
  'progress.sub': '· photos every 15 days: front, side and back',
  'progress.hint': 'Your progress photos (front, side and back). Who can see them: only you, your assigned trainer and the program\'s administrator — they are never public. Take a new evaluation every 15 days, and compare two of your evaluations yourself in the comparator in this same section.',
  'progress.week': 'This week',
  'progress.thisWeek': ' (this week)',
  'progress.front': 'Front',
  'progress.side': 'Side',
  'progress.back': 'Back',
  'progress.upload': '＋ Upload photo',
  'progress.replace': 'Replace',
  'progress.delete': 'Delete',
  'progress.delConfirm': 'Delete this photo? This cannot be undone.',
  'progress.loading': 'Loading photos…',
  'progress.complete': '✅ Evaluation complete.',
  'progress.missingOne': 'You\'re missing one photo this week.',
  'progress.missingList': 'Still missing: {list}',
  'progress.none': 'You haven\'t uploaded photos for this evaluation yet.',
  'progress.noPhoto': 'no photo',
  'progress.evalLabel': 'Evaluation · {date}',
  'progress.lastLabel': 'Last evaluation · {date}',
  'progress.next': 'Next evaluation suggested: {date}',
  'progress.history': 'Previous evaluations',
  'progress.emptyHistory': 'Your previous evaluations will appear here.',
  'eval.badgePending': 'PENDING',
  'eval.dueTitle': 'Your progress evaluation is due today.',
  'eval.dueToday': 'Due: {date} (today)',
  'eval.dueFuture': 'Due: {date}',
  'eval.overdue': 'Due: {date} — {n} days ago. It is still the same single pending: no new copy is created each day.',
  'eval.upcomingTitle': 'Your next progress evaluation is coming up.',
  'eval.completeTitle': '✅ This evaluation is complete.',
  'eval.nextCalc': 'How the date is set: your last COMPLETE evaluation was {last}; the next one is that date + 15 days.',
  'eval.firstTitle': 'Your first progress evaluation.',
  'eval.firstNote': 'You have no previous evaluation, so this one carries no punitive due date: it is your starting point. When you complete it, the 15-day count starts from its date.',
  'eval.haveLead': 'Already there:',
  'eval.missingLead': 'Still missing (required):',
  'eval.partialSaved': 'Partial progress saved ✓ — this is NOT yet a complete evaluation: it completes when everything required is in.',
  'eval.optionalNote': 'Every measure is optional unless YOU marked it required in the settings. Optional measures left empty never create pendings and never block completing the evaluation.',
  'eval.cycleLine': 'Evaluation cycle — last complete: {last} · next expected: {next}',
  'eval.cycleExplain': 'Every 15 days you take a progress evaluation: front, side and back photos plus your body measures. The 15 days are counted from your last COMPLETE evaluation. Your first evaluation has no deadline — it is your starting point.',
  'cmp.title': '🔍 Compare evaluations',
  'cmp.first': 'First date',
  'cmp.second': 'Second date',
  'cmp.needTwo': 'You need at least two complete evaluations to compare them.',
  'cmp.planCtx': 'Plan: {title}',
  'cmp.planRoutine': 'Source routine: {id}',
  'cmp.noAnchor': 'No plan anchor (before the integration)',
  'cmp.phaseNote': 'Note from your trainer',
  'teval.open': '📸 View evaluations & photos',
  'teval.close': 'Hide evaluations',
  'teval.empty': 'This client has no evaluations recorded yet.',
  'teval.noteLabel': 'Phase note (visible to the client)',
  'teval.notePh': 'Write the note for this evaluation…',
  'teval.noteSave': 'Save note',
  'teval.noteSaved': 'Note saved ✓',
  'teval.noteNoDoc': 'No evaluation document for this date: the note needs the client to record measures first.',
  'nd2.title': '🗒️ Access log (ND-2)',
  'nd2.hint': 'Every time the trainer view of a client\'s evaluations and photos is opened, one record is written here: who viewed whose data, and when. Records cannot be edited.',
  'nd2.empty': 'No accesses recorded yet.',
  'nd2.unavailable': 'The access log is not available yet (its rules are pending publication).',
  'nd2.viewer': 'Trainer',
  'nd2.client': 'Client',
  'nd2.zone': 'Area',
  'nd2.when': 'When',
  'nd2.zone.evaluations': 'Evaluations & photos',
  'nd2.logFail': '⚠️ This access could not be written to the access log.',
  'eval.cycleLastNone': 'none yet',
  'eval.cycleNextFirst': 'set when you complete the first one (that date + 15 days)',
  'eval.reqPhoto.front': 'front photo',
  'eval.reqPhoto.side': 'side photo',
  'eval.reqPhoto.back': 'back photo',
  'eval.omitBtn': 'Skip this cycle (just this once)',
  'eval.omittedNote': 'Cycle skipped. The next expected date is counted from the skipped due date + 15 days, and nothing was marked as done.',
  'eval.measure.peso': 'Weight',
  'eval.measure.cintura': 'Waist',
  'eval.measure.caderas': 'Hips / glutes',
  'eval.measure.muslos': 'Thighs',
  'eval.measure.pantorrillas': 'Calves',
  'eval.measure.brazos': 'Arms / biceps',
  'eval.measure.hombros': 'Shoulders',
  'eval.measure.pecho': 'Chest circumference',
  'eval.guide.peso': 'Scale: on waking, fasting, same time, light clothing.',
  'eval.guide.cintura': 'Tape on the skin, at navel height, at the end of a normal breath out, standing, not tight. Always the same spot and time of day.',
  'eval.guide.caderas': 'Tape around the widest part of the glutes, feet together, tape horizontal, not tight.',
  'eval.guide.muslos': 'Dominant side: midpoint between the groin and the kneecap, standing with weight evenly spread, leg relaxed.',
  'eval.guide.pantorrillas': 'Dominant side: widest point of the calf, standing, leg relaxed.',
  'eval.guide.brazos': 'Dominant side: arm hanging relaxed, not flexed, midpoint between the acromion (the shoulder bone) and the elbow.',
  'eval.guide.hombros': 'Around the widest part of both deltoids and the back, arms hanging.',
  'eval.measuresTitle': 'Evaluation measures',
  'eval.saveMeasures': 'Save measures',
  'eval.savedOk': '✓ Saved',
  'eval.fichaTitle': 'Evaluation sheet — measured data',
  'eval.colMeasure': 'Measure',
  'eval.colPrev': 'Previous',
  'eval.colNow': 'Current',
  'eval.colDiff': 'Difference',
  'eval.fichaObsNote': 'The numbers above are MEASURED data. Observations about how the body looks live in their own block, kept separate: a change in a circumference does not, by itself, say anything about muscle or fat.',
  'eval.pechoNote': 'Chest circumference is ONE single circumference around the torso at chest height (tape under the armpits, at the end of a normal breath out). It is NOT a separate back measurement.',
  'eval.reqTag': 'required',
  'eval.compTitle': 'Body composition (optional — you log it)',
  'eval.compNote': 'You log these values yourself if you have them (from a scale, a caliper, a scanner…). They are OPTIONAL: they are never required to complete an evaluation, they never create pendings, and they are NEVER calculated from photos. And a change in a circumference does not prove muscle gain or fat loss.',
  'eval.compFat': 'Body fat',
  'eval.compMuscle': 'Muscle mass',
  'eval.compMuscleNote': 'Muscle mass is NOT the same as fat-free mass: fat-free mass also includes bones, water and organs. They are different quantities — that is why they are never mixed here.',
  'eval.compMethod': 'Method / source',
  'eval.compEstimate': 'It is an estimate',
  'eval.compRegister': 'Log',
  'eval.compValuePh': 'Value',
  'eval.compEstTag': 'estimate',
  'eval.compNone': 'not logged',
  'eval.compMethodDiff': 'Different method from the previous one: the difference may come from the method, not from a real change.',
  'eval.compUnitDiff': 'Different units (kg vs %): they are never mixed — the difference is not calculated.',
  'eval.method.bio': 'Bioimpedance scale',
  'eval.method.caliper': 'Skinfold caliper',
  'eval.method.scan': 'Body scanner',
  'eval.method.other': 'Other / manual',
  'eval.cfgTitle': 'Evaluation settings',
  'eval.cfgRequired': 'Measures REQUIRED in the evaluation (only these can create a pending)',
  'eval.cfgReqNote': 'Every measure is optional unless YOU mark it required here. Only the required ones appear as “missing” and can hold an evaluation open. The three photos (front, side, back) are always part of an evaluation: they are its core, not a configurable extra.',
  'eval.cfgUnits': 'Measurement units',
  'eval.unitsMetric': 'Metric (kg, cm)',
  'eval.unitsImperial': 'Imperial (lb, inches)',
  'eval.cfgSave': 'Save settings',
  'mealhelp.addManual': 'Add food manually',
  'mealhelp.upload': '📷 Upload food photo',
  'mealhelp.takePhoto': '📷 Take a photo',
  'mealhelp.uploaded': 'Photo sent. Let me know in the chat so I can analyze it.',
  'mealhelp.uploading': 'Uploading photo…', 'mealhelp.uploadFail': 'The photo could not be uploaded.', 'mealhelp.tooBig': 'The image is too heavy, try another one.',
  'mealhelp.empty': 'You haven\'t uploaded photos yet.',
  'mealhelp.reviewed': '✓ reviewed',
  'mealhelp.pending': '⏳ pending',
  'mealhelp.foodAlt': 'Food',
  'mealhelp.tapZoom': 'Tap to enlarge',
  'mealhelp.zoomed': 'Enlarged photo',
  'ai.analyze': 'Analyze the food',
  'ai.introTitle': 'Analyze a meal from a photo',
  'ai.introTake': '📷 Take or choose the photo',
  'ai.photoNotSaved': '📷 Before you take the photo: food photos are NOT saved. A photo is used only for this analysis, in this moment — the app keeps the meal record (the foods and their values), never the picture. If you want to keep the photo, keep it in your phone\'s gallery as well.',
  'ai.limitNote': 'Daily analysis limit: photo and text analyses share a daily counter (a complete analysis usually takes 2 requests: identify + calculate). If your account has a daily limit set and you reach it, photo and text analysis pause until the counter resets the next day — you can still log every meal by hand. If no limit is set for your account, there is no cap.',
  'ai.scaleWhy': 'Why it matters whether a weight came from your scale: the scale gives the real weight, so the calculation rests on a measured fact. An estimate has a wider margin of error — that is why each amount keeps its badge (from your scale / estimated): so you and your trainer know which numbers are measured and which are estimated, and treat them with that honesty.',
  'ai.analyzing': 'Analyzing…',
  'ai.foodsFound': 'I found these foods:',
  'ai.foodsEditHint': 'You can fix a name or an amount, remove a food or add another one.',
  'ai.addFood': '＋ Add a food',
  'ai.removeFood': 'Remove food',
  'ai.questionsTitle': 'A few quick questions (you can skip them):',
  'ai.skipOption': 'Not sure / skip',
  'ai.otherLabel': 'Other: write your own',
  'ai.continue': 'Continue',
  'ai.draftTitle': 'Estimated draft — nothing is saved yet',
  'ai.range': 'Estimated range: {a}–{b} kcal',
  'ai.useDraft': 'Use as draft',
  'ai.discard': 'Discard',
  'ai.unavailable': 'Food analysis is not active yet.',
  'ai.failed': 'The analysis failed. You can log the meal manually.',
  'ai.banner': 'Draft from your photo: check and edit the values before saving.',
  'ai.draftError': 'Something went wrong while preparing the draft. Nothing was saved — please try again.',
  'ai.savedInfo': 'Meal saved: {kcal} kcal · Day total: {total} kcal',
  'ai.retry': 'Retry',
  'ai.continueManual': 'Continue manually',
  'ai.mealPrompt': 'Which meal is this?',
  'ai.metricsTitle': 'Values for this meal — you can edit them before saving:',
  'ai.save': 'Save',
  'ai.backToFoods': 'Fix the foods',
  'ai.estPortion': 'estimated portion',
  'ai.unitWord': 'unit',
  'ai.perPiece': 'g per unit',
  'ai.perPiecePh': 'e.g. 50',
  'ai.piecesTotal': '≈ {g} g in total',
  'ai.needPerPiece': 'To calculate, “{name}” needs its weight per unit: type how many grams 1 unit weighs — nothing is made up.',
  'ai.recalcWarn': 'You already adjusted the values by hand. Recalculating will replace those manual adjustments with the new calculation.',
  'ai.recalcYes': 'Yes, recalculate',
  'ai.saveError': 'It could not be saved. Your changes are still here: check your connection and tap Save to try again.',
  'ai.capReached': 'You reached the pilot\u2019s daily analysis limit. Come back tomorrow to analyze another photo — meanwhile you can log the meal manually.',
  'ai.retryHint': 'Try a clearer photo — or describe the meal in text right here:',
  'ai.newPhoto': 'New photo',
  'aiText.label': 'Describe your meal',
  'aiText.ph': 'E.g. quinoa tortilla with egg, cottage cheese and turkey ham',
  'aiText.hint': 'No photo? Describe the dish and AI will suggest its components and amounts — you review and edit everything before saving.',
  'aiText.button': 'Analyze the description with AI',
  'aiText.tooShort': 'Describe the meal with a bit more detail first.',
  'aiText.notFound': "AI couldn't identify any food this time. Try again, or log the meal manually.",
  'aiText.banner': 'Draft from your description: check and edit the values before saving.',
  'aiMulti.title': 'Photos of this meal',
  'aiMulti.hint': 'They are photos of ONE single meal: the dish as served and each item weighed on your scale. You can remove or replace any photo before analyzing.',
  'aiMulti.add': '＋ Add another photo',
  'aiMulti.analyze': 'Analyze the photos',
  'aiMulti.max': 'A maximum of 5 photos per analysis.',
  'aiMulti.remove': 'Remove photo',
  'aiMulti.fromScale': 'From your scale',
  'aiMulti.estimated': 'Estimated',
  'access.title': '🔐 Access management',
  'access.sub': '· administrator only',
  'access.hint': 'New accounts stay pending until you approve them. Only approved users can sign in, and each one sees only their own data.',
  'access.pending': 'Pending approval (',
  'access.users': 'Users with access',
  'access.loading': 'Loading…',
  'clients.title': '👥 My clients',
  'clients.sub': '· trainer management',
  'clients.hint': 'Each client must upload their weight every week. Select one to see their full history, edit their weigh-ins, or add new ones. You set their goals under "Access management".',
  'foot': 'ronbo.nutri · private · only you can see your data',
  'meal.title': 'Log meal',
  'form.date': 'Date',
  'form.moment': 'Meal',
  'form.food': 'Food',
  'form.foodPh': 'E.g. Chicken breast',
  'form.amount': 'Amount',
  'form.amountPh': 'E.g. 150 g',
  'form.photo': '📷 Meal photo (optional)',
  'meal.photoHint': '📷 Don\'t know a food\'s values? Use "Analyze the food" in Meal help.',
  'form.kcal': 'Kcal',
  'form.protein': 'Protein (g)',
  'form.carbs': 'Carbs (g)',
  'form.sugar': 'Sugars (g)',
  'form.fat': 'Fats (g)',
  'form.notes': 'Notes',
  'form.cancel': 'Cancel',
  'form.save': 'Save',
  'form.weight': 'Weight (kg)',
  'form.bodyfat': 'Body fat (%)',
  'form.muscle': 'Muscle mass (%)',
  'form.water': 'Body water (%)',
  'form.visceral': 'Visceral fat (level)',
  'goals.title': 'User goals',
  'goals.for': 'Goals · {name}',
  'form.cal': 'Calories (kcal)',
  'form.sugarMax': 'Max sugars (g)',
  'goals.save': 'Save goals',
  'goals.none': 'No goals set yet',
  'profile.title': 'Client profile',
  'profile.for': 'Profile · {name}',
  'form.phone2': 'Phone',
  'form.trainerNotes': 'Trainer notes (first interview, goals, observations)',
  'profile.notesPh': 'What you fill in during the first interview…',
  'profile.save': 'Save profile',
  'chart.note': '% of the daily goal per day. The dotted line is 100%. For sugar, the ideal is to stay below it.',
  'err.name': 'Enter your full name.',
  'err.phone': 'Enter your phone number.',
  'err.gender': 'Select your sex / gender.',
  'err.consent': 'You must accept the privacy notice.',
  'err.health': 'You must confirm your health declaration.',
  'err.pwmatch': 'The passwords don\'t match.',
  'err.emailInUse': 'That email already has an account. Use "Sign in".',
  'err.weakPw': 'The password must be at least 6 characters.',
  'err.badEmail': 'The email isn\'t valid.',
  'err.createFail': 'Couldn\'t create the account. Try again.',
  'err.forgotNoEmail': 'Type your email above so we can send you the link.',
  'err.resetFail': 'Couldn\'t send the email. Try again.',
  'err.noAccess': 'This account has no access.',
  'sys.maintenance': 'Maintenance in progress: consent and account operations are briefly unavailable while we complete a system update. Please try again in a few minutes. Your data is safe.',
  'err.pending': 'Your account is pending administrator approval.',
  'err.verifyFail': 'Couldn\'t verify access.',
  'err.noPermission': 'Your account doesn\'t have permission to do this. If you think this is a mistake, let your trainer know.',
  'err.noConnection': 'No connection, or the service isn\'t available right now. Check your connection and try again.',
  'err.genericFail': 'Something went wrong. Please try again.',
  'err.badCreds': 'Incorrect credentials.',
  'err.tooHeavy': 'The image is too heavy, try another one.',
  'err.uploadFail': 'Couldn\'t upload the photo.',
  'err.mealMissing': 'Missing date or food.',
  'err.mealPhotoFail': 'Couldn\'t upload the photo; saved without photo.',
  'err.weightMissing': 'Missing date or valid weight.',
  'msg.accountCreated': 'Account created. It now waits for approval — see the note below.',
  'reg.waitTitle': '✅ Your account was created — one step left: approval',
  'reg.waitTrainer': 'Your account now waits for {name}, the trainer you chose, to approve it. Your trainer reviews new accounts personally; as soon as they approve you, just sign in with your email and password and you will go straight in — there is nothing else to send and no second form. We cannot promise an exact time: it depends on your trainer reviewing it. Meanwhile your account stays closed inside the app — that is normal, and nothing is wrong with your registration.',
  'reg.waitAdmin': 'Your account now waits for approval: the administrator will assign you a trainer and approve your account. As soon as that happens, just sign in with your email and password and you will go straight in — there is nothing else to send and no second form. We cannot promise an exact time: it depends on the administrator reviewing it. Meanwhile your account stays closed inside the app — that is normal, and nothing is wrong with your registration.',
  'msg.resetSent': 'Reset email sent. It contains a link (not a code): tap the link and set your new password on the page that opens. Check your spam folder too.',
  'msg.approved': 'User approved.',
  'msg.revoked': 'Access removed.',
  'msg.rejected': 'Request deleted.',
  'msg.foodReviewed': 'Photo marked as reviewed.',
  'msg.goalsSaved': 'Goals updated.',
  'msg.profileSaved': 'Profile updated.',
  'msg.storageSoon': 'Progress photos will be enabled soon.',
  'msg.uploading': 'Uploading photo…',
  'msg.uploadFail': 'The photo could not be uploaded.',
  'msg.tooBig': 'The image is too heavy, try another one.',
  'ui.photoAlt': 'Enlarged photo',
  'msg.photoDeleted': 'Photo deleted.',
  'msg.foodSent': 'Photo sent. Let me know in the chat so I can analyze it.',
  'train.title': '🏋️ My training plan', 'train.loading': 'Loading your plan…',
  'train.none': 'Your trainer has not assigned you a plan yet.',
  'train.weekDone': 'Sessions completed this week: {n}',
  'train.planFreq': 'Your plan: {n} days per week',
  'train.markDone': 'Mark as done today', 'train.doneToday': 'Done today ✓', 'train.undo': 'Undo',
  'train.view.rest': 'Rest', 'train.view.warmup': 'Warm-up', 'train.view.session': 'Session',
  'train.view.rpe': 'RPE', 'train.view.rpeNone': 'No RPE', 'train.view.exDone': 'Done',
  'train.view.alignBody': 'Your routine: {plan}. Your training reminders: {cfg}. Align your reminders with your plan?',
  'train.view.sessionsWeek': '{n} sessions a week', 'train.view.noDays': 'no days set',
  'train.view.alignYes': 'Align with my plan', 'train.view.alignOpen': 'Review settings',
  'train.view.alignNo': 'Not now', 'train.view.alignDone': 'Training reminders aligned ✓',
  'train.saved': 'Plan saved.', 'train.deleted': 'Plan deleted.',
  'train.editorTitle': 'Training plan', 'train.section': '🏋️ Training',
  'train.f.title': 'Plan title', 'train.f.titlePh': 'E.g. Strength — 4 days',
  'train.f.notes': 'Notes for the client', 'train.f.active': 'Active plan (the one the client sees)',
  'train.f.addDay': '＋ Add day', 'train.f.dayPh': 'Day label (e.g. Day 1 · Chest)',
  'train.f.addEx': '＋ Add exercise', 'train.f.exPh': 'Exercise', 'train.f.setsPh': 'Sets',
  'train.f.repsPh': 'Reps', 'train.f.notePh': 'Note', 'train.f.remove': 'Remove',
  'train.save': 'Save plan', 'train.err': 'Give the plan a title and at least one exercise.',
  'train.new': 'New plan', 'train.activeBadge': 'Active', 'train.activate': 'Activate',
  'train.deactivate': 'Deactivate', 'train.delete': 'Delete',
  'train.deleteConfirm': 'Delete this plan permanently?',
  'train.noPlan': 'No plan assigned yet.', 'train.recent': 'Recent sessions',
  'train.noLogs': 'No sessions logged yet.',
  'train.daysCount': '{n} days', 'train.exCount': '{n} exercises',
  'train.gate.checking': 'Checking this client’s health declaration status…',
  'train.gate.ok': '🏥 Health declaration: this client has a valid declaration on file.',
  'train.gate.blockFirst': 'This client’s first plan cannot be saved yet: they do not have a valid health declaration on file, or their specific consent is not active. Ask them to complete their health declaration in their app first. (No declaration content is shown here.)',
  'train.gate.warnLater': '⚠️ This client has no valid health declaration on file. This plan can still be saved; you can ask them to complete it in their app.',
  'train.gate.savedWithWarning': 'Plan saved. Note: this client still has no valid health declaration on file.',
  'train.lib.unavailable': '📚 The exercise library is unavailable right now (it may be empty or could not be loaded). You can keep typing exercises as free text — plans save normally.',
  'train.lib.photo': 'Photo', 'train.lib.video': 'Video',
  'train.f.sePh': 'SE', 'train.f.repPh': 'REP', 'train.f.more': 'More options',
  'train.lib.media': 'Exercise media',
  'train.lib.noMedia': 'This exercise has no linked photo or video yet. Link it from the library by typing its name and choosing the suggestion.',
  'train.viz.title': '🧱 Visual builder',
  'train.viz.toggle': 'Browse the library visually',
  'train.viz.searchPh': 'Search by name, muscle, equipment…',
  'train.viz.allGroups': 'All muscle groups',
  'train.viz.dayLabel': 'Add to day',
  'train.viz.dayN': 'Day {n}',
  'train.viz.add': '＋ Add',
  'train.viz.added': 'Added: {name}',
  'train.viz.empty': 'No exercises match this filter.',
  'train.snap.btn': 'Versions', 'train.snap.title': 'Version history',
  'train.snap.empty': 'No saved versions yet. The previous version is kept here each time this plan is saved.',
  'train.snap.view': 'View', 'train.snap.hide': 'Hide', 'train.snap.at': 'Version saved on {d}',
  'train.sub.btn': 'Substitute', 'train.sub.title': 'Suggested substitutes (same muscle group)',
  'train.sub.none': 'No substitutes to suggest: the library is unavailable or this exercise has no known muscle group. Free text still works.',
  'train.sub.sameEq': 'same equipment',
  'train.btr.btn': 'Body type', 'train.btr.title': 'Ratings by body type — {name}',
  'train.btr.ecto': 'Ectomorph', 'train.btr.meso': 'Mesomorph', 'train.btr.endo': 'Endomorph',
  'train.btr.high': 'High', 'train.btr.med': 'Medium', 'train.btr.low': 'Low', 'train.btr.why': 'Why',
  'train.btr.note': 'Body types are a practical reference guide, not rigid boxes. Most people combine traits of more than one type; the personal goal and individual progress matter more than any label.',
  'train.btr.disclaimer': 'General reference for THIS exercise only. It does not label any person, and nothing is assigned or preselected by body type — the trainer always decides.',
  'train.btr.unavailable': 'Body-type ratings are unavailable right now (that collection could not be loaded or is empty). The editor keeps working as usual.',
  'train.btr.noData': 'This exercise has no body-type rating loaded.',
  'train.btr.needLink': 'Link this row to a library exercise to see its body-type ratings.',
  'train.print.btn': '🖨 Print card', 'train.print.title': 'Training plan', 'train.print.session': 'Session',
  'train.f.warmupPh': 'Warm-up sets', 'train.f.restPh': 'Rest',
  'train.tpl.title': '📋 Routine templates',
  'train.dates.currentTitle': 'Current active plan',
  'train.dates.change': 'Change plan',
  'train.dates.start': 'Start date',
  'train.dates.end': 'End date (expiry)',
  'train.dates.duration': 'Duration',
  'train.dates.presetNone': 'No fixed duration',
  'train.dates.weekly': 'Weekly',
  'train.dates.fortnightly': 'Fortnightly',
  'train.dates.monthly': 'Monthly',
  'train.dates.bimonthly': 'Bimonthly (2 months)',
  'train.dates.quarterly': 'Quarterly (3 months)',
  'train.dates.hint': 'The end date is calculated from the start date and the duration; you can also adjust it by hand.',
  'train.dates.none': 'No dates set',
  'train.dates.expired': 'Expired',
  'train.dates.fromOnly': 'From {d}',
  'train.dates.untilOnly': 'Until {d}',
  'train.dates.clientLine': 'Plan period: {period}',
  'train.tpl.use': 'Use this template',
  'train.tpl.perWeek': '{n} days/week',
  'train.tpl.unavailable': '📋 The routine templates are unavailable right now (they may be empty or could not be loaded). You can keep building the plan by hand — nothing is blocked.',
  'train.tpl.replaceConfirm': 'Applying this template will REPLACE the current draft in the editor (title, days and exercises). Continue?',
  'train.tpl.applied': 'Draft created from the template. Review and adjust it — nothing is saved until you tap Save plan.',
  'train.tpl.startLabel': 'Start date (for the weekday suggestion)',
  'train.tpl.alignHint': 'Pick a start date to see a suggestion: aligning each template day with a real weekday. The suggestion never changes anything by itself.',
  'train.tpl.alignTitle': 'Suggested weekday alignment from {date}:',
  'train.tpl.alignApply': 'Apply alignment',
  'train.tpl.alignIgnore': 'Ignore',
  'train.tpl.alignApplied': '✓ Weekdays applied to the day labels. You can still edit any label.',
  'train.prop.tplTitle': '📋 Routine templates',
  'train.prop.tplIntro': 'Browse the routine templates. You can propose adding or swapping an exercise in your active plan — your trainer reviews and decides.',
  'train.prop.tplUnavailable': '📋 The routine templates are unavailable right now (they may be empty or could not be loaded).',
  'train.prop.details': 'Details', 'train.prop.hide': 'Hide',
  'train.prop.proposeBtn': 'Propose for my plan',
  'train.prop.noPlanNote': 'You don’t have an active plan yet, so you can’t send proposals — but you can still browse the templates.',
  'train.prop.formTitle': 'New proposal',
  'train.prop.typeAdd': 'Add an exercise', 'train.prop.typeChange': 'Swap an exercise',
  'train.prop.day': 'Day of your plan', 'train.prop.currentEx': 'Exercise to replace',
  'train.prop.newEx': 'Proposed exercise',
  'train.prop.searchPh': 'Search the exercise library…',
  'train.prop.fromTpl': 'From template: {name}',
  'train.prop.note': 'Note for your trainer (optional)',
  'train.prop.notePh': 'Why would you like this change?',
  'train.prop.send': 'Send proposal', 'train.prop.cancel': 'Cancel',
  'train.prop.sent': 'Proposal sent. Your trainer will review it.',
  'train.prop.needEx': 'Choose an exercise first.',
  'train.prop.myTitle': '🗳️ My proposals',
  'train.prop.myEmpty': 'You have no proposals yet.',
  'train.prop.stSent': 'Sent', 'train.prop.stSeen': 'Seen',
  'train.prop.seenOn': 'Seen {date}',
  'train.prop.statusHint': 'How to read these: Sent = your trainer has not opened it yet · Seen = they opened your proposals · Approved / Rejected = their decision. These notices live only inside the app — nothing is sent to your phone.',
  'train.prop.stPending': 'Pending', 'train.prop.stApproved': 'Approved', 'train.prop.stRejected': 'Rejected',
  'train.prop.addLine': 'Add {ex} · {day}',
  'train.prop.changeLine': 'Swap {old} → {ex} · {day}',
  'train.prop.decidedOn': 'Decided {date}', 'train.prop.sentOn': 'Sent {date}',
  'train.prop.trayTitle': '🗳️ Client proposals',
  'train.prop.trayEmpty': 'This client has no proposals.',
  'train.prop.approve': 'Approve', 'train.prop.reject': 'Reject',
  'train.prop.openEditor': 'Open plan in editor',
  'train.prop.approvedNote': 'Approved. The plan has NOT changed — edit it yourself if you decide to apply the change.',
  'train.prop.byClient': 'Proposed {date}',
  'train.prop.noteLabel': 'Client note:',
  'train.prop.planGone': 'The plan no longer exists.',
  'form.dob': 'Date of birth', 'form.dobHint': '(to verify you are 18+; it is not stored)',
  'err.underage': 'You must be 18 or older to create an account.',
  'priv.title': '🔒 Privacy & Data',
  'priv.manage': 'Manage privacy and data',
  'perm.title': 'Permissions & privacy',
  'perm.intro': 'Here you manage your permissions: your health declaration and your privacy & data — what you accept, what you share, and what you can withdraw or delete.',
  'perm.photoNote': 'The food photo you send for analysis is not stored.',
  'priv.sectionTitle': 'Privacy & data',
  'priv.statusAccepted': 'Consent accepted · version {v} · {date}',
  'priv.statusNone': 'No consent record found for this account.',
  'priv.statusWithdrawn': 'Consent withdrawn · access revoked.',
  'priv.viewNotice': 'View the privacy notice', 'priv.download': 'Download my data (JSON)',
  'priv.downloaded': 'Your data file has been downloaded.',
  'priv.withdraw': 'Withdraw my consent',
  'priv.withdrawConfirm': 'If you withdraw your consent, your access is revoked immediately and your trainer will delete your data and close your account. Continue?',
  'priv.withdrawn': 'Consent withdrawn. Your access has been revoked.',
  'priv.delete': 'Delete my account and data',
  'priv.deleteConfirm': 'This permanently deletes your account and ALL your data (meals, weights, progress, plans and meal-help photos). This cannot be undone. Continue?',
  'priv.deleted': 'Your account and data have been deleted.',
  'priv.deleteFail': 'We could not complete the deletion. Please try again.',
  'priv.dataDeletedFinish': 'Your data has been deleted. Sign in once more to finish closing your account.',
  'priv.closedDataPending': 'Your account is closed. A few items could not be deleted automatically and will be removed manually; you do not need to do anything.',
  'priv.finishCloseAsk': 'Your data was already deleted. Do you want to finish closing your account now?',
  'priv.renew': 'Renew my consent',
  'priv.renewAccept': 'I accept the privacy notice',
  'priv.renewConfirm': 'Your consent will be recorded as accepted today, under notice version {v}. Your previous withdrawal stays on record. Continue?',
  'priv.renewed': 'Consent renewed.',
  'priv.statusHistory': 'Previously withdrawn on {d} · renewed on {d2}',
  'gate.renewIntro': 'Your account is pending administrator approval, and your consent is currently withdrawn. If you wish, you can renew it now: read the privacy notice and accept it. Your renewal is recorded with its date and the notice version; your previous withdrawal stays on record.',
  'priv.recentLogin': 'Your data was deleted, but Google needs a recent sign-in to delete the account itself: sign out, sign back in, and repeat the deletion. If you get stuck, ask your trainer.',
  'priv.working': 'Working…',
  'msg.photoSaved': 'Photo saved.',
  'msg.photoDeleted': 'Photo deleted.',
  'msg.avatarSaved': 'Profile photo updated.',
  'msg.mealSaved': 'Meal logged.',
  'msg.mealDeleted': 'Entry deleted.',
  'msg.weightSaved': 'Weigh-in logged.',
  'msg.weightDeleted': 'Weigh-in deleted.',
  'confirm.revoke': 'Remove this user\'s access? They won\'t be able to sign in again.',
  'confirm.reject': 'Reject and delete this request?',
  'confirm.delPhoto': 'Delete this photo?',
  'confirm.delMeal': 'Delete this entry?',
  'confirm.delWeight': 'Delete the weigh-in from {date}?',
  'admin.noPending': 'No pending requests.',
  'admin.noUsers': 'No approved users yet.',
  'admin.approve': 'Approve',
  'admin.reject': 'Reject',
  'admin.profile': 'Profile',
  'admin.goals': 'Goals',
  'admin.revoke': 'Remove access',
  'admin.owner': 'admin',
  'limits.title': '🤖 Analysis limits',
  'limits.hint': 'Daily photo-analysis limits, set only by you. Each account uses its own limit if it has one, otherwise its trainer\'s, otherwise the global one. No limit set means unlimited.',
  'limits.global': 'Global limit',
  'limits.trainers': 'Trainers',
  'limits.users': 'Users',
  'limits.perDay': '/ day',
  'limits.noLimit': 'No limit',
  'limits.usageToday': 'Today: {n}',
  'limits.save': 'Save',
  'limits.saved': 'Limit saved.',
  'limits.error': 'The limits could not be loaded or saved. Try again.',
  'limits.invalid': 'Enter a whole number of 0 or more, or choose "No limit".',
  'limits.countNote': 'The counter measures requests to the service; a full analysis normally uses two.',
  'clients.empty': 'No clients registered yet.',
  'clients.noWeighins': 'no weigh-ins',
  'clients.daysAgo': '{d} days ago',
  'clients.daysAgoShort': '{d}d ago',
  'clients.pending': 'pending',
  'clients.healthTitle': 'Declared health conditions',
  'clients.healthBadge': 'health',
  'clients.foodTitle': 'Food photos to review',
  'clients.view': 'View log',
  'client.fallbackName': 'Client',
  'client.weightLog': 'Weight log · {name}',
  'client.healthDecl': 'Health declaration:',
  'client.foodReview': '📷 Food photos to review ({n})',
  'client.addWeight': '＋ Add weigh-in',
  'client.close': 'Close',
  'client.noWeight': 'This client hasn\'t logged their weight yet.',
  'client.edit': 'Edit',
  'client.reviewed': '✓ Reviewed',
  'bt.title': 'Visual body type estimate',
  'bt.pilotNote': 'Pilot only: this feature is enabled only for the owner account and the “Prueba Ronald” test account until a separate launch decision.',
  'bt.providerInfo': 'Provider (D-09, updated by the owner’s decision of October 24, 2026): the analysis provider is Google Gemini, the same paid service this app already uses for meal analysis, reached through the M8 worker. Google does not use paid-service prompts or files to improve its products, but it does log prompts and responses — including the photos sent — for a limited period of time, solely to detect policy violations and keep the service safe; Google does not publish an exact number of days. This is NOT zero retention: if you give this consent, your body photos will be sent to Google and temporarily logged there under those terms.',
  'bt.consentIntro': 'A separate, specific and revocable consent for analyzing photos of your body with artificial intelligence.',
  'bt.consentText': 'I authorize RONBO.NUTRI to analyze my progress body photos (front, side and back) and my recorded physical measurements using an artificial-intelligence system, solely to estimate my body type as a reference for my trainer when setting training and nutrition goals. I understand that: this is a visual estimate, not a medical diagnosis or clinical assessment, and it can place me in the wrong category; my body photos will be transmitted to Google Gemini, the paid analysis provider this app uses, through its M8 worker: Google does not use paid-service prompts or files to improve its products, but it does log prompts and responses — including my photos — for a limited period of time, solely to detect policy violations and keep the service safe; Google does not publish an exact number of days, so this is not zero retention and I accept that temporary logging; I may revoke this consent at any time in the app, and revoking it immediately blocks new analyses and all access to estimates already generated (their physical deletion or retention period is still pending legal validation D-06); my assigned trainer and the platform administrator can see the estimate while this consent is active; and I will see my own estimate only if my trainer shares it with me.',
  'bt.consentCheck': 'I declare that I am 18 years or older and I give this specific consent.',
  'bt.statusNone': 'You have not given this specific consent. Without it, no body-photo analysis can run and no estimate can be shown.',
  'bt.statusActive': 'This specific consent is active (version {v} · accepted {date}).',
  'bt.statusWithdrawn': 'This specific consent is withdrawn. New analyses and all access to estimates already generated are blocked.',
  'bt.grant': 'Give my specific consent (body photos)',
  'bt.renew': 'Renew my specific consent (body photos)',
  'bt.withdraw': 'Withdraw my specific consent (body photos)',
  'bt.withdrawConfirm': 'Withdraw this SPECIFIC consent for body-photo analysis? New analyses will stop and all access to estimates already generated will be blocked immediately. Their physical deletion or retention period is still pending legal validation (D-06).',
  'bt.granted': 'Your specific consent for body-photo analysis has been recorded.',
  'bt.renewed': 'Your specific consent for body-photo analysis has been renewed.',
  'bt.withdrawnToast': 'Your specific consent for body-photo analysis has been withdrawn. Access to the estimates is blocked.',
  'bt.needConsent': 'This client does not have an active specific consent for body-photo analysis.',
  'bt.sharedTitle': 'Estimates shared with you',
  'bt.noShared': 'No estimate has been shared with you yet.',
  'bt.blockedNote': 'Estimates already generated are not shown while this consent is not active.',
  'bt.category.ectomorph': 'Ectomorph-leaning build',
  'bt.category.mesomorph': 'Mesomorph-leaning build',
  'bt.category.endomorph': 'Endomorph-leaning build',
  'bt.estimateLine': '{category} · {date}',
  'bt.mixLine': 'Visual mix: ectomorph {e}% · mesomorph {m}% · endomorph {n}%',
  'bt.margin': 'Estimate with margin: it may be off by one category.',
  'bt.notDiagnosis': 'Not a diagnosis and not a Heath-Carter measurement.',
  'bt.trainerTitle': 'Visual body type estimate',
  'bt.consentSignal': 'Specific body-photo consent: {v}',
  'bt.active': 'Active',
  'bt.inactive': 'Not active',
  'bt.sourceLine': 'Source evaluation: {date} (front, side and back photos on file).',
  'bt.sourceMissing': 'One or more source photo records are no longer available; this estimate’s origin is incomplete.',
  'bt.noCompleteSet': 'No complete photo set (front, side and back) is available for this client yet.',
  'bt.request': 'Request visual body type estimate',
  'bt.requesting': 'Requesting…',
  'bt.noEstimates': 'No estimates have been generated for this client yet.',
  'bt.share': 'Share with the client',
  'bt.unshare': 'Stop sharing',
  'bt.sharedState': 'Shared with the client',
  'bt.privateState': 'Not shared with the client',
  'bt.providerUnavailable': 'No analysis provider is available right now, so no photo was sent and no estimate was generated.',
  'bt.invalidProvider': 'The provider returned an invalid estimate, so nothing was saved.',
  'bt.saved': 'Visual body type estimate saved.',
  'bt.loadError': 'The visual body type estimates could not be loaded.',
  'bt.trainerNote': 'Trainer reference only. This estimate never feeds exercise ratings, training plans or goals automatically.',
  'bt.consentSummary': 'Summary: a separate consent for analyzing your body photos and measurements to estimate your body type. The full text, which is the one shown for acceptance, appears next to the checkbox below.',
  'bt.fullTextTitle': 'Full consent text',
  'bt.versionMismatch': 'The recorded consent uses a different version, so it is treated as inactive.',
  'fb3.title': '🧮 Protein reference (B-1)',
  'fb3.range': '{lo}–{hi} g/day',
  'fb3.basis': 'Based on the latest weight: {w} kg · {date}',
  'fb3.perkg': 'Reference: 1.4–2.0 g/kg/day (ISSN 2017) for healthy, physically active adults.',
  'fb3.stale': '⚠️ This weight is {d} days old — the reference may be out of date.',
  'fb3.noweight': 'No weight logged yet: there is no basis for the protein reference.',
  'fb3.nogoals': 'Educational reference only — it does not change the goals of this client. You set the goals manually.',
  'fb3.helpBtn': 'How it is calculated and sources',
  'fb3.help': '<b>How it is calculated</b><br>Daily protein range = latest body weight × 1.4–2.0 g/kg/day.<br><b>Sources</b><br>• ISSN Position Stand: protein and exercise (Jäger et al., 2017, J Int Soc Sports Nutr 14:20; DOI 10.1186/s12970-017-0177-8): 1.4–2.0 g/kg/day is sufficient for most people who exercise.<br>• Context only (not shown as a range here): for hypertrophy with resistance training, Morton et al. (2018, Br J Sports Med; DOI 10.1136/bjsports-2017-097608) estimated a breakpoint of 1.62 g/kg/day (95% CI upper limit 2.20) — neither a universal target nor a proven individual ceiling.<br>These ranges are educational references, pending validation in this app; they are not a prescription and never modify the goals you set.',
  'fa.title': '🧮 Energy calculation',
  'fa.helpBtn': 'How it is calculated and sources',
  'fa.help': '<b>What this estimates</b><br>Two estimates from the Mifflin-St Jeor equation: your resting expenditure (RMR) and your estimated expenditure without structured exercise (RMR × your activity multiplier).<br><b>What it is for</b><br>An orientation figure to plan with — not a measurement.<br><b>Its limits</b><br>Every figure here is an estimate with inherent uncertainty; it is not an individual guarantee. The multiplier covers rest, daily life and habitual movement; structured exercise is NOT included in this estimate.',
  'fa.helpDetail': '<b>Formula · Mifflin-St Jeor</b><br>Men: 10 × weight (kg) + 6.25 × height (cm) − 5 × age (years) + 5<br>Women: 10 × weight (kg) + 6.25 × height (cm) − 5 × age (years) − 161<br>Estimated expenditure without structured exercise = RMR × palBasal.<br><b>Sources</b><br>• Mifflin MD et al., “A new predictive equation for resting energy expenditure in healthy individuals”, Am J Clin Nutr 1990;51(2):241–247. DOI: 10.1093/ajcn/51.2.241<br>• Frankenfield D, Roth-Yousey L, Compher C. Systematic review of predictive equations, 2005. DOI: 10.1016/j.jada.2005.02.005<br><b>About structured exercise</b><br>Structured exercise is not inside the multiplier and is not added anywhere else in this version: there is no session-expenditure module yet, so this estimate never promises one.',
  'fa.helpMore': 'Formula and sources ▾',
  'fa.helpLess': 'Hide formula and sources ▴',
  'fa.provided': 'Sex data provided: {v}',
  'fa.yes': 'Yes',
  'fa.no': 'No',
  'fa.equation': 'Equation',
  'fa.noEquation': 'No equation selected — choose one to calculate',
  'fa.selected': '✓ selected',
  'fa.eqMifflin': 'Mifflin-St Jeor',
  'fa.eqHB': 'Harris-Benedict (revised)',
  'fa.eqTenHaaf': 'Ten Haaf',
  'fa.available': 'Available',
  'fa.unavailable': 'Unavailable · pending verification',
  'fa.birthYear': 'Birth year',
  'fa.height': 'Height (cm)',
  'fa.weightBasis': 'Using the latest weight: {w} kg · {date}',
  'fa.noWeight': 'No weight logged yet: there is no basis for the calculation.',
  'fa.actLabel': 'Activity level (context for the trainer — it carries no number)',
  'fa.actNone': 'No level chosen',
  'fa.act1': 'Almost total rest / very reduced mobility',
  'fa.act2': 'Sedentary life, desk work, minimal movement',
  'fa.act3': 'Sedentary with light daily activity (standing part of the day, short walks)',
  'fa.act4': 'Active in daily life (standing or light physical work, frequent walks)',
  'fa.act5': 'Physically demanding job or very active daily life',
  'fa.act6': 'Sustained heavy physical work',
  'fa.palLabel': 'Activity multiplier (palBasal)',
  'fa.palRules': 'Normal range: 1.40–2.00 · Exception band: 1.20–1.39 (with express confirmation) · Below 1.20: not allowed.',
  'fa.palGuide': '<b>Guidance — what this multiplier covers</b><br>For reference only, to support your judgement: you type the value; nothing is filled in or pre-selected.<br>The multiplier covers rest, daily life and habitual movement, including the thermic effect of food and unstructured activity. It does NOT include structured exercise, and no per-category number is assigned: the descriptive activity level above is context only and carries no number.',
  'fa.palPlaceholder': 'E.g. 1.55',
  'fa.palWarn': '⚠ This value is outside the usual physiological range.',
  'fa.palWarnBody': 'It is in the exception band (1.20–1.39): to save it you must confirm it expressly.',
  'fa.palConfirm': 'I expressly confirm this exception value',
  'fa.palError': 'This value cannot be saved. It is outside the admitted range (1.20–2.00). Adjust the value to continue.',
  'fa.saveConfig': 'Save data',
  'fa.configSaved': '✓ Assessment data saved',
  'fa.errBy': 'Birth year must be a year between 1900 and {max}.',
  'fa.errH': 'Height must be between 50 and 250 cm.',
  'fa.errPal': 'palBasal must be between 1.20 and 2.00.',
  'fa.errConfirm': 'To save a palBasal in the exception band (1.20–1.39) you must confirm it expressly.',
  'fa.noResult': 'No result',
  'fa.missEq': 'Not calculated yet: an equation must be chosen first.',
  'fa.missSex': 'Not calculated yet: the client has not provided their private sex data — only they can provide it.',
  'fa.missData': 'Not calculated yet: base data are incomplete (birth year, height, multiplier or a logged weight).',
  'fa.missPending': 'Not calculated yet: everything is ready — the result is recorded from the client’s own session when they open the app.',
  'fa.rmr': 'RESTING EXPENDITURE (RMR)',
  'fa.tdee': 'ESTIMATED EXPENDITURE WITHOUT STRUCTURED EXERCISE',
  'fa.kcalDay': 'kcal/day',
  'fa.traceTitle': 'Calculation traceability',
  'fa.trEq': 'Equation used',
  'fa.trEqVal': '{name} · version {ver}',
  'fa.trInputs': 'Inputs',
  'fa.trInputsVal': '{w} kg · {h} cm · {age} years',
  'fa.trWeight': 'Weight used',
  'fa.trWeightVal': '{w} kg — weighed on {date}',
  'fa.trPal': 'Multiplier',
  'fa.trConst': 'Constant applied',
  'fa.trConstYes': 'Yes (the value is not shown)',
  'fa.trConstNo': 'No',
  'fa.trWhen': 'Calculated',
  'fa.trWhenVal': '{date} · by {who}',
  'fa.whoClient': 'the client (their own session)',
  'fa.whoTrainer': 'the trainer',
  'fa.zone': '🔒 My private space',
  'fa.zoneSub': 'Only you can see what you keep here.',
  'fa.sexTitle': 'Sex for energy calculation',
  'fa.sexBody': 'The Mifflin-St Jeor equation uses a different constant depending on sex. This value is stored only in your private space and is never shown directly to your trainer: your trainer sees your data (weight, height, age, multiplier) and the calculation result, but not this value itself. Please note: because the equation is known, the constant applied could be inferred from those inputs and the result. It is not inferred from your gender and is never used for any other purpose. It is voluntary: without it, this equation cannot be calculated. You can delete it at any time.',
  'fa.female': 'Female',
  'fa.male': 'Male',
  'fa.current': 'Saved value: {v}',
  'fa.save': 'Save',
  'fa.delete': 'Delete this data',
  'fa.deleteConfirm': 'Delete your private sex data? Without it, the energy calculation cannot be done. You can provide it again whenever you want.',
  'fa.pickOne': 'Choose an option to save it.',
  'fa.saved': '✓ Saved in your private space',
  'fa.deleted': '✓ Private data deleted',
  'fa.lockNote': 'This value lives in your private space and is not shown directly to your trainer or to anyone else (it could only be inferred from the calculation inputs and the result, as explained above).',
  'fa.loadError': 'Your private data could not be loaded — that is not the same as having none. Check your connection and reload.',
  'fa.myResult': 'Your latest energy calculation: RMR {rmr} · estimated expenditure without structured exercise {tdee} {u} ({eq}).',
  'fa.staleBanner': '⚠ Pending recalculation — the base data changed after this result was calculated. The values below are the PREVIOUS result.',
  'fa.stalePrev': 'A previous result exists (calculated {date}) but it is NOT current: the private data needed to calculate was withdrawn. The history is kept — nothing was deleted.',
  'fa.calcInvalid': 'Not calculated: {cause}',
  'fa.errWeight': 'There is no valid logged weight to calculate with.',
  'pend.title': '🔔 Pendings',
  'pend.configBtn': '⚙️ Set up reminders',
  'pend.intro': 'What is left to LOG, grouped in one place. These notices only talk about logging — never about what you did or did not do. Phase 1: they live only inside the app; nothing is sent anywhere.',
  'pend.actTitle': 'Your reminders are not active yet',
  'pend.actIntro': 'Nothing is on by default. These are SUGGESTED values: review them, change whatever you want — reminders are only born when you tap «Confirm and activate».',
  'pend.cfgTitle': 'Reminder settings',
  'pend.meals': 'Meals and their times',
  'pend.mealName.Desayuno': 'Breakfast', 'pend.mealName.Almuerzo': 'Lunch', 'pend.mealName.Cena': 'Dinner', 'pend.mealName.Merienda': 'Morning snack', 'pend.mealName.Snack': 'Snack',
  'pend.weightOn': 'Remind me to log my weight',
  'pend.weightFreq': 'Weigh-in frequency',
  'pend.freq.1': 'Every day', 'pend.freq.3': 'Every 3 days', 'pend.freq.7': 'Every week', 'pend.freq.15': 'Every 15 days',
  'pend.trainOn': 'Remind me of my training sessions',
  'pend.trainDays': 'My training days',
  'pend.wd.0': 'S', 'pend.wd.1': 'M', 'pend.wd.2': 'T', 'pend.wd.3': 'W', 'pend.wd.4': 'T', 'pend.wd.5': 'F', 'pend.wd.6': 'S',
  'pend.quietOn': 'Quiet hours (no pending is shown during this block)',
  'pend.quietFrom': 'From', 'pend.quietTo': 'To',
  'pend.cutoff': 'Day cutoff',
  'pend.cutoffHelp': 'Your logging day starts at this time (suggested: 04:00 — you confirm your own). Before the cutoff, «today» is still the day that started yesterday: a 12:30 a.m. dinner is the dinner of the day that is ending.',
  'pend.tz': 'Time zone: your device ({tz}). Every «today» and every time uses it.',
  'pend.phaseNote': 'Phase 1: pendings only appear inside the app, when you open it. Notifications with the app closed are designed but NOT active.',
  'pend.confirm': 'Confirm and activate',
  'pend.saveCfg': 'Save settings',
  'pend.cancel': 'Cancel',
  'pend.deactivate': 'Turn all reminders off',
  'pend.deactivateConfirm': 'Turn off ALL reminders? Your settings are kept, but no pending will be born until you activate them again.',
  'pend.activatedOk': '✓ Reminders activated',
  'pend.savedOk': '✓ Settings saved',
  'pend.offOk': '✓ Reminders off',
  'pend.none': 'Nothing pending. Everything is logged. ✓',
  'pend.mealTitle': 'You haven\'t logged your {meal} yet.',
  'pend.mealDetail': 'Reminder you set for {time}',
  'pend.goMeal': 'Log {meal}',
  'pend.weightTitle': 'You haven\'t logged your weight yet for this period.',
  'pend.weightTitlePastYday': 'Yesterday you didn\'t log your weight.',
  'pend.weightTitlePastDate': 'On {date} you didn\'t log your weight.',
  'pend.weightDetail': 'Last log: {when} · your frequency: {freq}',
  'pend.weightNever': 'no weigh-in yet',
  'pend.daysAgo': '{d} days ago',
  'pend.todayWord': 'today',
  'pend.yesterday': 'yesterday',
  'pend.goWeight': 'Log weigh-in',
  'pend.trainTitle': 'You have a training session scheduled that you haven\'t logged yet.',
  'pend.trainTitlePastYday': 'Yesterday you didn\'t log your training.',
  'pend.trainTitlePastDate': 'On {date} you didn\'t log your training.',
  'pend.goTraining': 'Go to my training',
  'pend.evalTitle': 'Your progress evaluation was due on {date}.',
  'pend.energyTitle': 'Your energy calculation needs a private datum',
  'pend.energyDetail': 'Your trainer set up your energy calculation, but it cannot be completed yet: a private datum that only you can provide is missing. Only you can see its value — your trainer only sees whether it has been provided or not.',
  'pend.goEnergy': 'Complete it now',
  'pend.evalMissing': 'Still missing (required): {items}',
  'pend.goEval': 'Go to My progress',
  'pend.snooze': 'Snooze',
  'pend.snooze.1h': 'In 1 hour ({time})',
  'pend.snooze.3h': 'In 3 hours ({time})',
  'pend.snooze.tomorrowSame': 'Tomorrow at this time ({time})',
  'pend.snooze.tomorrow9': 'Tomorrow at 09:00',
  'pend.omitOccasion': 'Not applicable today',
  'pend.omitOccasionPast': 'Wasn\'t applicable',
  'pend.discard': 'Discard',
  'pend.discardConfirm': 'Discard this training pending? It will be recorded as discarded by you.',
  'pend.traceTitle': 'States',
  'pend.traceSnoozed': '{label}: snoozed — comes back {when}',
  'pend.traceOmitted': '{label}: skipped for this occasion only. The reminder stays ON for next time and nothing was marked as done.',
  'pend.traceDiscarded': '{label}: discarded by you',
  'pend.traceDone': '{label}: logged ✓',
  'pend.snoozeQuietShift': 'The time you chose ({time}) falls inside your quiet hours ({from}–{to}), so it was moved to the end of the quiet block.',
  'pend.whenToday': 'today at {time}',
  'pend.whenTomorrow': 'tomorrow at {time}',
  'pend.whenDate': 'on {date} at {time}',
  'pend.draftTitle': 'Unsaved record',
  'pend.draftBody': 'You have a meal record typed but not saved yet ({food}). What you typed is kept even if you reload: you can continue it or discard it — it is never written twice.',
  'pend.draftContinue': 'Continue the record',
  'pend.draftDiscard': 'Discard draft',
  'pend.draftDiscardConfirm': 'Discard the unsaved record? What you typed will be lost.',
  'pend.label.weight': 'Weight', 'pend.label.training': 'Training',
  'pend.loadError': 'Your pendings could not be loaded — that is not the same as having none. Check your connection and reload.',
  'date.today': ' (today)',
  'date.weekLabel': 'Week {n} · {y}',
  'note.kcalIn': '🔥 Calories within range; {left} kcal left.',
  'note.kcalOver': '🔥 Calories above goal (+{over} kcal).',
  'note.protOver': '💪 Protein above goal (+{over} g).',
  'note.protNear': '💪 Protein close to goal ({pct}%).',
  'note.protUnder': '💪 Protein below goal ({pct}%).',
  'note.carbOver': '🌾 Carbs above goal (+{over} g).',
  'note.carbNear': '🌾 Carbs close to goal ({pct}%).',
  'note.carbUnder': '🌾 Carbs below goal ({pct}%).',
  'note.sugarIn': '🍬 Sugar within the limit ({v} of {g} g).',
  'note.sugarOver': '🍬 Sugar above the limit (+{over} g).',
  'note.fatIn': '🫀 Fat within goal ({pct}%).',
  'note.fatSlight': '🫀 Fat slightly above goal (+{over} g).',
  'note.fatOver': '🫀 Fat above goal (+{over} g).',
  'status.left': 'left',
  'status.available': 'available',
  'status.overLimit': 'Over the limit',
  'status.above': 'over',
  'status.overGoal': 'Over goal',
  'meal.Desayuno': 'Breakfast',
  'meal.Almuerzo': 'Lunch',
  'meal.Cena': 'Dinner',
  'meal.Merienda': 'Morning snack',
  'meal.Snack': 'Snack',
  'gender.Femenino': 'Female',
  'gender.Masculino': 'Male',
  'gender.No binario': 'Non-binary',
  'gender.Género fluido': 'Gender-fluid',
  'gender.Otro': 'Other',
  'gender.Prefiero no decirlo': 'Prefer not to say',
  'cond.Hipertensión': 'High blood pressure',
  'cond.Diabetes': 'Diabetes',
  'cond.Problemas del corazón': 'Heart problems',
  'cond.Dolor de pecho al ejercitarse': 'Chest pain when exercising',
  'cond.Mareos o desmayos': 'Dizziness or fainting',
  'cond.Asma / problemas respiratorios': 'Asthma / breathing problems',
  'cond.Lesiones articulares o musculares': 'Joint or muscle injuries',
  'cond.Cirugía reciente': 'Recent surgery',
  'cond.Embarazo': 'Pregnancy',
  'cond.Ninguna de las anteriores': 'None of the above'
},
es: {
  'app.title': 'ronbo.nutri · Privado',
  'auth.subtitle': 'Tu registro privado de nutrición',
  'auth.tabLogin': 'Entrar',
  'auth.tabRegister': 'Crear cuenta',
  'form.email': 'Correo',
  'form.password': 'Contraseña',
  'auth.forgot': '¿Olvidaste tu contraseña?',
  'pw.show': 'Mostrar contraseña', 'pw.hide': 'Ocultar contraseña',
  'auth.signin': 'Entrar',
  'form.fullname': 'Nombre y apellido',
  'form.fullnamePh': 'Ej. María García',
  'form.emailLong': 'Correo electrónico',
  'form.phone': 'Número de teléfono',
  'form.phonePh': 'Ej. +1 901 555 1234',
  'form.gender': 'Sexo / Género',
  'form.select': 'Selecciona…',
  'form.social': 'Redes sociales',
  'form.socialPh': 'Ej. Instagram: @usuario',
  'form.opt': '(opcional)',
  'form.passwordHint': 'Es la contraseña de tu cuenta en ronbo.nutri, no la de tus redes sociales.',
  'form.password2': 'Confirmar contraseña',
  'form.optional': 'opcional',
  'health.title': '🏥 Declaración de salud',
  'health.hint': 'Marca las condiciones que tengas. Es por tu seguridad: tu entrenador debe conocerlas antes de asignarte un plan de ejercicio o nutrición.',
  'health.details': 'Detalles / medicamentos',
  'health.detailsPh': 'Ej. Toma metformina; lesión de rodilla izquierda en 2023…',
  'health.ok': 'Declaro que la información de salud indicada es verdadera.',
  'health.clientTitle': '🏥 Declaración de salud del cliente',
  'health.regNote': 'Puedes completar tu declaración de salud más tarde, en tu perfil, con su propio consentimiento específico. No es necesaria para crear tu cuenta.',
  'card.toggle': 'Mostrar u ocultar la sección',
  'main.progress': 'Progreso', 'main.food': 'Comida', 'main.training': 'Entrenamiento', 'main.pendings': 'Pendientes',
  'health.panelTitle': '🏥 Mi declaración de salud',
  'health.specText': 'Doy mi consentimiento ESPECÍFICO para que ronbo.nutri trate mi declaración de salud, para que mi entrenador adapte mi programa y tome precauciones. Solo mi entrenador y yo podemos verla. Puedo retirar este consentimiento cuando quiera: la retirada bloquea el acceso de mi entrenador a mis respuestas, pero no las elimina.',
  'health.statusNone': 'No has dado tu consentimiento específico para datos de salud. Sin él, no se recoge ninguna declaración y tu entrenador no puede ver ninguna respuesta de salud.',
  'health.statusActive': 'Tu consentimiento específico está activo (versión {v} · aceptado el {date}). Tu entrenador puede ver tu declaración vigente.',
  'health.statusWithdrawnSpec': 'Tu consentimiento específico está retirado. Tus declaraciones anteriores están bloqueadas: tu entrenador no puede verlas ni usarlas, y se conservan, no se eliminan. Si renuevas tu consentimiento harás una declaración NUEVA; las anteriores seguirán bloqueadas.',
  'health.startBtn': 'Dar mi consentimiento específico y empezar mi declaración',
  'health.saveDecl': 'Guardar mi declaración',
  'health.editDecl': 'Editar mi declaración',
  'health.currentTitle': 'Tu declaración vigente',
  'health.blockedTitle': 'Tus declaraciones anteriores (bloqueadas)',
  'health.blockedNote': 'Solo lectura: puedes verlas, pero no se pueden editar y tu entrenador no puede verlas.',
  'health.withdrawSpec': 'Retirar mi consentimiento específico (salud)',
  'health.withdrawSpecConfirm': '¿Retirar tu consentimiento ESPECÍFICO para datos de salud? Tu entrenador perderá de inmediato el acceso a tus declaraciones. Tus respuestas se conservan bloqueadas, no se eliminan. Esto es distinto de retirar tu consentimiento general o de eliminar tu cuenta.',
  'health.renewSpec': 'Renovar mi consentimiento específico',
  'health.renewSpecConfirm': '¿Renovar tu consentimiento ESPECÍFICO? Esto te permite hacer una declaración NUEVA. Tus declaraciones anteriores seguirán bloqueadas y NO se reactivarán.',
  'health.renewedSpec': 'Tu consentimiento específico está renovado. Ya puedes hacer una nueva declaración.',
  'health.declSaved': 'Tu declaración se ha guardado.',
  'health.withdrawnSpec': 'Tu consentimiento específico se ha retirado. Tus declaraciones están ahora bloqueadas.',
  'health.specGranted': 'Tu consentimiento específico ha quedado registrado. Ya puedes completar tu declaración.',
  'health.fourActions': 'Cuatro acciones diferentes: retirar tu consentimiento GENERAL (en Privacidad y datos), retirar tu consentimiento ESPECÍFICO de salud (aquí), eliminar tus respuestas de salud (una solicitud separada: pídelo a tu entrenador) y eliminar tu cuenta y todos sus datos (en Privacidad y datos). Cada una tiene efectos distintos.',
  'health.specSummary': 'Resumen del consentimiento específico: ronbo.nutri podrá tratar tu declaración de salud para que tu entrenador adapte tu programa y tome precauciones; solo tú y tu entrenador podrán verla; podrás retirarlo en cualquier momento — la retirada bloquea el acceso, pero no elimina tus respuestas. El texto completo, que es el que rige, aparece íntegro junto a la casilla, abajo.',
  'health.specFullTitle': 'Texto completo del consentimiento específico',
  'health.fourActionsTitle': 'Las cuatro acciones, explicadas',
  'health.manage': 'Gestionar mi declaración de salud',
  'health.sectionTitle': 'Declaración de salud',
  'health.declActiveNoConds': 'Activa · sin condiciones declaradas',
  'health.declNoConds': 'Sin condiciones declaradas',
  'health.declLoadError': 'No se pudo cargar tu declaración',
  'health.trainerNoAccess': 'Declaración de salud no disponible: este cliente no tiene un consentimiento específico activo, o su declaración está bloqueada.',
  'health.trainerViewNote': 'Solo lectura. Las respuestas de salud pertenecen al cliente; solo el cliente puede cambiarlas.',
  'health.needSpec': 'Primero debes dar tu consentimiento específico.',
  'health.versionLabel': 'Declaración {n} · {date}',
  'terms.accept': 'He leído y acepto el aviso de privacidad.',
  'terms.body': '<b>AVISO DE PRIVACIDAD Y CONSENTIMIENTO PARA EL TRATAMIENTO DE DATOS PERSONALES</b><br><br>Al crear tu cuenta en <b>ronbo.nutri</b>, aceptas lo siguiente:<br><br><b>1. Responsable.</b> ronbo.nutri es responsable de tus datos.<br><br><b>2. Datos que recogemos.</b> Nombre, correo, teléfono, sexo/género, redes sociales (opcional), declaración de condiciones de salud, registros de alimentación, peso y composición corporal, fotos de perfil, de progreso y de alimentos (para análisis nutricional), y tus metas nutricionales.<br><br><b>3. Finalidad.</b> Prestar servicios de entrenamiento y asesoría nutricional personalizada, dar seguimiento a tu progreso y comunicarnos contigo.<br><br><b>4. Almacenamiento.</b> Tus datos se guardan de forma segura en Google Firebase (Estados Unidos), con acceso restringido: solo tú y tu entrenador pueden verlos.<br><br><b>5. Tus derechos.</b> Puedes pedir en cualquier momento ver, corregir o eliminar tus datos. Eliminar tu cuenta borra tus registros.<br><br><b>6. Conservación.</b> Tus datos generales de cuenta (perfil, registros de alimentación, peso y actividad) se conservan mientras tu cuenta esté activa. Tus declaraciones de salud reciben un tratamiento separado: se conservan solo mientras tu consentimiento específico esté vigente y tu relación de entrenamiento esté activa. Si retiras tu consentimiento específico, o si finaliza tu relación de entrenamiento, tus declaraciones de salud se bloquean de inmediato para su uso ordinario y se eliminarán a más tardar 12 meses después del primero de esos eventos que ocurra, salvo que pidas eliminarlas antes. El uso posterior de la aplicación, renovar tu consentimiento general o reanudar tu relación de entrenamiento no prolonga ni reinicia ese plazo. La eliminación prevista en esta cláusula se realiza mediante nuestro procedimiento manual documentado; no es un proceso automático. Si una obligación legal concreta o una reclamación en curso exigiera conservar información específica por más tiempo, se conservará solo esa información, solo por ese periodo, y te informaremos de qué se conserva, por qué y hasta cuándo. Los registros mínimos de consentimiento (la fecha y la versión del texto de cada consentimiento que otorgues, retires o renueves, sin tus respuestas de salud) podrán conservarse como prueba del consentimiento mientras tu cuenta exista y hasta 24 meses después de su cierre.<br><br><b>7. Menores.</b> Este servicio es solo para personas mayores de 18 años.<br><br><b>8. Retirada del consentimiento.</b> Puedes retirar tu consentimiento general en cualquier momento desde la sección Privacidad y datos de la aplicación, o escribiendo a tu entrenador. Al retirarlo se suspende tu acceso al servicio; por sí solo no elimina tus datos ni cierra tu cuenta. Tu información existente se conserva conforme a la política de conservación de la cláusula 6, y puedes renovar tu consentimiento general en cualquier momento. Renovar tu consentimiento no equivale a estar aprobado como cliente: el acceso a las funciones reservadas a clientes aprobados requiere además la aprobación de tu entrenador, que tras una retirada podría tener que concederse de nuevo. Tu declaración de salud se rige por un consentimiento específico e independiente: al retirarlo se bloquea de inmediato el acceso ordinario de tu entrenador a tus declaraciones de salud, que se conservan restringidas conforme a la cláusula 6 y nunca se reactivan por renovar el consentimiento general. Si más adelante renuevas tu consentimiento específico, podrás presentar una declaración nueva; las declaraciones ya bloqueadas no se reactivan. Puedes solicitar en cualquier momento la eliminación de tus respuestas de salud —una solicitud independiente que tramitamos manualmente— sin eliminar tu cuenta. También puedes eliminar tu cuenta y tus datos desde la sección Privacidad y datos, con la única salvedad de los registros mínimos de consentimiento y las excepciones justificadas descritas en la cláusula 6.<br><br><b>9. Salud y ejercicio.</b> El entrenador es un profesional del fitness certificado (ISSA), no un profesional médico. Consulta a tu médico antes de iniciar cualquier programa de ejercicio o nutrición, especialmente si declaraste alguna condición de salud.<br><br>Al marcar la casilla y crear tu cuenta, declaras que leíste este aviso y das tu consentimiento para el tratamiento de tus datos con las finalidades descritas.',
  'auth.create': 'Crear mi cuenta',
  'app.logout': 'salir',
  'app.goals': 'Tus metas diarias',
  'app.myPhoto': 'Mi foto',
  'app.loading': 'Cargando…',
  'avatar.change': 'Toca para cambiar tu foto de perfil',
  'tabs.track': '📊 Mi registro',
  'tabs.clients': '👥 Mis clientes',
  'tabs.access': '🔐 Accesos',
  'track.date': '📅 Fecha:',
  'track.addMeal': '＋ Registrar comida',
  'track.weekTitle': '📈 Cumplimiento semanal de metas',
  'track.detail': 'Detalle de lo consumido',
  'th.moment': 'Momento', 'th.food': 'Alimento', 'th.amount': 'Cantidad',
  'th.cal': 'Cal', 'th.prot': 'Prot (g)', 'th.carb': 'Carb (g)', 'th.sugar': 'Azúc (g)', 'th.fat': 'Gras (g)',
  'track.summary': 'Resumen vs. metas',
  'track.notes': '📝 Notas',
  'track.emptyDay': 'Sin registros este día. Añade una comida con el botón COMIDA (foto) o desde «Ayuda con comidas» (manual).',
  'track.viewPhoto': 'Ver foto',
  'track.delete': 'Borrar',
  'track.repeat': 'Repetir',
  'repeat.bannerAi': 'Copia de una estimación de IA: ajusta la cantidad y los valores se recalculan en proporción. Revísalos antes de guardar.',
  'repeat.bannerQty': 'Copia de otro registro: ajusta la cantidad y los valores se recalculan en proporción.',
  'repeat.bannerPieces': 'Este registro se cuenta por unidades, no por peso: los valores NO se recalculan al cambiar la cantidad. Revísalos a mano.',
  'repeat.scaled': 'Valores recalculados para la cantidad nueva (proporcionales al registro original).',
  'vs.indicator': 'Indicador', 'vs.intake': 'Consumo', 'vs.goal': 'Meta', 'vs.progress': 'Progreso',
  'metric.kcal': 'CALORÍAS', 'metric.prot': 'PROTEÍNA', 'metric.carb': 'CARBOHIDRATOS', 'metric.azuc': 'AZÚCARES', 'metric.gras': 'GRASAS',
  'rings.title': 'Detalle de la métrica',
  'rings.firstNote': 'Tus anillos están en cero porque aún no hay nada registrado en este día. Cada anillo se llena según registras comidas y compara tu día con tu meta: kcal = la energía que comes · proteína = construye y repara el músculo · carbohidratos = tu combustible principal · azúcares = el que conviene mantener bajo su límite · grasas = grasas esenciales. Toca un anillo para ver su detalle.',
  'rings.contributions': 'Aportes',
  'rings.topContrib': 'Mayor aporte',
  'rings.ofDay': 'del día',
  'rings.noContrib': 'Ninguna comida aportó a esta métrica en este día.',
  'weight.title': '⚖️ Evolución de peso',
  'weight.sub': '· pesaje semanal',
  'weight.add': '＋ Registrar pesaje',
  'weight.loading': 'Cargando pesajes…',
  'weight.empty': 'Aún no hay pesajes registrados.<br>Usa "{btn}" cuando te peses — la gráfica se dibuja sola.',
  'weight.reminder': '⚠️ Llevas {d} días sin pesarte. Recuerda subir tu peso cada semana.',
  'weight.current': 'PESO ACTUAL',
  'weight.vsPrev': 'VS PESAJE ANTERIOR',
  'weight.totalChange': 'CAMBIO TOTAL',
  'weight.firstRecord': 'primer registro',
  'weight.since': 'desde {d} · {n} pesaje{s}',
  'weight.bodyFat': 'GRASA CORPORAL',
  'weight.delLast': 'Borrar último pesaje ({date})',
  'weight.history': 'Historial de pesajes',
  'weight.chartWeight': 'Peso (kg)',
  'weight.chartFat': 'Grasa (%)',
  'weight.title2': 'Registrar pesaje',
  'compacc.notice': '🔒 Tu entrenador registra tu composición corporal (peso, grasa corporal, masa muscular, agua y grasa visceral). Puedes verla aquí, pero no cambiarla.',
  'compacc.noticeShort': 'Tu entrenador registra tu composición corporal.',
  'compacc.title': 'Ingreso de composición corporal',
  'compacc.modeTrainer': 'Ahora: el entrenador registra la composición corporal de este cliente.',
  'compacc.modeClient': 'Ahora: este cliente puede registrar su propia composición corporal.',
  'compacc.grant': 'Permitir que el cliente la registre',
  'compacc.revoke': 'Volver a solo el entrenador',
  'compacc.history': 'Historial de cambios',
  'compacc.histTrainer': 'Ingreso solo del entrenador',
  'compacc.histClient': 'Ingreso del cliente permitido',
  'compacc.histBy': 'por {who} · {when}',
  'compacc.histEmpty': 'Sin cambios todavía: aplica el valor por defecto (solo el entrenador).',
  'compacc.needClientOpen': 'Este ajuste se crea cuando el cliente abre la app por primera vez. Pídele que la abra una vez y vuelve a intentarlo.',
  'compacc.saved': 'Ingreso de composición corporal actualizado.',
  'compacc.blocked': 'Tu entrenador registra tu composición corporal: este ingreso es de solo lectura para ti.',
  'compacc.pctNote': '🔒 Los porcentajes y las notas los registra tu entrenador.',
  'frame.title': 'Guía de encuadre',
  'frame.pick': 'Elegir foto',
  'frame.camera': 'Usar la cámara',
  'frame.capture': 'Tomar la foto',
  'frame.use': 'Usar esta foto',
  'frame.retake': 'Repetir',
  'frame.timer': 'Temporizador',
  'frame.noCam': 'La cámara no está disponible aquí: elige una foto.',
  'frame.guide.front': 'De frente a la cámara, brazos relajados a los lados, el cuerpo entero dentro de la silueta.',
  'frame.guide.side': 'De costado a la cámara, mirada al frente, brazos relajados, el cuerpo entero dentro de la silueta.',
  'frame.guide.back': 'De espaldas a la cámara, brazos relajados a los lados, el cuerpo entero dentro de la silueta.',
  'roles.administrador': 'Administrador',
  'roles.entrenador': 'Entrenador',
  'roles.usuario': 'Usuario',
  'roles.roleLabel': 'Rol',
  'roles.roleSaved': 'Rol actualizado.',
  'roles.chooseTrainer': '¿Quién será tu entrenador?',
  'roles.waitingOption': 'Decidir después: esperar asignación',
  'roles.waitingTitle': '⏳ En espera de asignación',
  'roles.waitingHint': 'Estos clientes eligieron esperar un entrenador. Quedan bajo responsabilidad del administrador hasta que les asignes uno.',
  'roles.assign': 'Asignar',
  'roles.assigned': 'Entrenador asignado.',
  'roles.notYourClient': 'Este cliente no está asignado a ti.',
  'roles.dirUpdate': 'Actualizar el directorio de entrenadores (para el registro)',
  'roles.dirUpdated': 'Directorio de entrenadores actualizado.',
  'roles.noWaiting': 'Nadie está esperando asignación.',
  'appr.title': '🆕 Aprobaciones por entrenadores',
  'appr.hint': 'Cada entrenador puede aprobar cuentas nuevas hasta este límite. Al aprobar, la cuenta queda asignada al entrenador que la aprueba. Si no hay límite fijado, los entrenadores no pueden aprobar: solo tú.',
  'appr.limitLabel': 'Máximo de aprobaciones por entrenador',
  'appr.saved': 'Límite de aprobaciones guardado.',
  'appr.noLimitSet': 'Sin límite fijado: los entrenadores no pueden aprobar cuentas.',
  'appr.usedOf': '{used} de {limit} aprobaciones usadas',
  'appr.trayTitle': '🆕 Cuentas nuevas',
  'appr.trayHint': 'Cuentas nuevas en espera de aprobación. Al aprobar una, queda asignada a ti y consume una de tus aprobaciones.',
  'appr.noLimit': 'El administrador aún no fijó un límite de aprobaciones, así que no puedes aprobar cuentas.',
  'appr.exhausted': 'Ya usaste todas tus aprobaciones.',
  'appr.none': 'No hay cuentas nuevas en espera de aprobación.',
  'appr.done': 'Cuenta aprobada: el cliente queda asignado a ti.',
  'appr.error': 'No se pudo completar. Inténtalo de nuevo.',
  'progress.title': '📸 Mi progreso',
  'progress.sub': '· fotos cada 15 días: frente, costado y espalda',
  'progress.hint': 'Tus fotos de progreso (frente, costado y espalda). Quién puede verlas: solo tú, tu entrenador asignado y el administrador del programa; nunca son públicas. Haz una nueva evaluación cada 15 días, y compara dos de tus evaluaciones tú mismo en el comparador de esta misma sección.',
  'progress.week': 'Esta semana',
  'progress.thisWeek': ' (esta semana)',
  'progress.front': 'Frente',
  'progress.side': 'Lado',
  'progress.back': 'Espalda',
  'progress.upload': '＋ Subir foto',
  'progress.replace': 'Reemplazar',
  'progress.delete': 'Eliminar',
  'progress.delConfirm': '¿Eliminar esta foto? No se puede deshacer.',
  'progress.loading': 'Cargando fotos…',
  'progress.complete': '✅ Evaluación completa.',
  'progress.missingOne': 'Te falta una foto esta semana.',
  'progress.missingList': 'Te falta: {list}',
  'progress.none': 'Aún no subes fotos de esta evaluación.',
  'progress.noPhoto': 'sin foto',
  'progress.evalLabel': 'Evaluación · {date}',
  'progress.lastLabel': 'Última evaluación · {date}',
  'progress.next': 'Próxima evaluación sugerida: {date}',
  'progress.history': 'Evaluaciones anteriores',
  'progress.emptyHistory': 'Tus evaluaciones anteriores aparecerán aquí.',
  'eval.badgePending': 'PENDIENTE',
  'eval.dueTitle': 'Hoy corresponde tu evaluación de progreso.',
  'eval.dueToday': 'Vence: {date} (hoy)',
  'eval.dueFuture': 'Vence: {date}',
  'eval.overdue': 'Venció: {date} — hace {n} días. Sigue siendo el mismo pendiente de siempre: no se crea una copia nueva cada día.',
  'eval.upcomingTitle': 'Tu próxima evaluación de progreso.',
  'eval.completeTitle': '✅ Esta evaluación está completa.',
  'eval.nextCalc': 'Cómo se calcula la fecha: tu última evaluación COMPLETA fue el {last}; la siguiente es esa fecha + 15 días.',
  'eval.firstTitle': 'Tu primera evaluación de progreso.',
  'eval.firstNote': 'No tienes una evaluación anterior, así que esta no tiene una fecha de vencimiento que castigue: es tu punto de partida. Al completarla, la cuenta de 15 días empieza desde su fecha.',
  'eval.haveLead': 'Ya tienes:',
  'eval.missingLead': 'Falta (requerido):',
  'eval.partialSaved': 'Avance guardado ✓ — aún NO es una evaluación completa: se completa cuando esté todo lo requerido.',
  'eval.optionalNote': 'Toda medida es opcional salvo las que TÚ marcaste como requeridas en la configuración. Las opcionales vacías nunca crean pendientes ni bloquean completar la evaluación.',
  'eval.cycleLine': 'Ciclo de evaluación — última completa: {last} · próxima prevista: {next}',
  'eval.cycleExplain': 'Cada 15 días te toca una evaluación de progreso: fotos de frente, costado y espalda, más tus medidas corporales. Los 15 días se cuentan desde tu última evaluación COMPLETA. Tu primera evaluación no tiene fecha límite: es tu punto de partida.',
  'cmp.title': '🔍 Comparar evaluaciones',
  'cmp.first': 'Primera fecha',
  'cmp.second': 'Segunda fecha',
  'cmp.needTwo': 'Necesitas al menos dos evaluaciones completas para compararlas.',
  'cmp.planCtx': 'Plan: {title}',
  'cmp.planRoutine': 'Rutina de origen: {id}',
  'cmp.noAnchor': 'Sin anclaje de plan (anterior a la integración)',
  'cmp.phaseNote': 'Nota de tu entrenador',
  'teval.open': '📸 Ver evaluaciones y fotos',
  'teval.close': 'Ocultar evaluaciones',
  'teval.empty': 'Este cliente aún no tiene evaluaciones registradas.',
  'teval.noteLabel': 'Nota de fase (visible para el cliente)',
  'teval.notePh': 'Escribe la nota de esta evaluación…',
  'teval.noteSave': 'Guardar nota',
  'teval.noteSaved': 'Nota guardada ✓',
  'teval.noteNoDoc': 'Sin documento de evaluación en esta fecha: la nota necesita que el cliente registre medidas primero.',
  'nd2.title': '🗒️ Bitácora de accesos (ND-2)',
  'nd2.hint': 'Cada vez que se abre la vista del entrenador sobre las evaluaciones y fotos de un cliente, aquí queda un registro: quién vio los datos de quién, y cuándo. Los registros no se pueden editar.',
  'nd2.empty': 'Aún no hay accesos registrados.',
  'nd2.unavailable': 'La bitácora aún no está disponible (sus reglas están pendientes de publicación).',
  'nd2.viewer': 'Entrenador',
  'nd2.client': 'Cliente',
  'nd2.zone': 'Zona',
  'nd2.when': 'Cuándo',
  'nd2.zone.evaluations': 'Evaluaciones y fotos',
  'nd2.logFail': '⚠️ Este acceso no pudo registrarse en la bitácora.',
  'eval.cycleLastNone': 'ninguna aún',
  'eval.cycleNextFirst': 'se fijará al completar la primera (esa fecha + 15 días)',
  'eval.reqPhoto.front': 'foto de frente',
  'eval.reqPhoto.side': 'foto de costado',
  'eval.reqPhoto.back': 'foto de espalda',
  'eval.omitBtn': 'Omitir este ciclo (solo esta vez)',
  'eval.omittedNote': 'Ciclo omitido. La próxima fecha prevista se cuenta desde la fecha prevista omitida + 15 días, y nada quedó marcado como hecho.',
  'eval.measure.peso': 'Peso',
  'eval.measure.cintura': 'Cintura',
  'eval.measure.caderas': 'Caderas / glúteos',
  'eval.measure.muslos': 'Muslos',
  'eval.measure.pantorrillas': 'Pantorrillas',
  'eval.measure.brazos': 'Brazos / bíceps',
  'eval.measure.hombros': 'Hombros',
  'eval.measure.pecho': 'Contorno de pecho',
  'eval.guide.peso': 'Báscula: al despertar, en ayunas, a la misma hora, con ropa ligera.',
  'eval.guide.cintura': 'Cinta sobre la piel, a la altura del ombligo, al final de una espiración normal, de pie, sin apretar. Siempre el mismo punto y la misma hora del día.',
  'eval.guide.caderas': 'Cinta por la parte más ancha de los glúteos, pies juntos, cinta horizontal y sin apretar.',
  'eval.guide.muslos': 'Lado dominante: punto medio entre la ingle y la rótula, de pie con el peso repartido entre ambas piernas, pierna relajada.',
  'eval.guide.pantorrillas': 'Lado dominante: punto más ancho de la pantorrilla, de pie, pierna relajada.',
  'eval.guide.brazos': 'Lado dominante: brazo colgando relajado, sin flexionar, punto medio entre el acromion (el hueso del hombro) y el codo.',
  'eval.guide.hombros': 'Contorno sobre la parte más ancha de ambos deltoides y la espalda, con los brazos colgando.',
  'eval.measuresTitle': 'Medidas de la evaluación',
  'eval.saveMeasures': 'Guardar medidas',
  'eval.savedOk': '✓ Guardado',
  'eval.fichaTitle': 'Ficha de evaluación — datos medidos',
  'eval.colMeasure': 'Medida',
  'eval.colPrev': 'Anterior',
  'eval.colNow': 'Actual',
  'eval.colDiff': 'Diferencia',
  'eval.fichaObsNote': 'Los números de arriba son DATOS MEDIDOS. Las observaciones sobre cómo se ve el cuerpo viven en su propio bloque, por separado: un cambio de contorno no dice, por sí solo, nada sobre músculo o grasa.',
  'eval.pechoNote': 'El contorno de pecho es UNA sola circunferencia alrededor del torso a la altura del pecho (cinta bajo las axilas, al final de una espiración normal). NO es una medida independiente de la espalda.',
  'eval.reqTag': 'requerida',
  'eval.compTitle': 'Composición corporal (opcional — la registras tú)',
  'eval.compNote': 'Estos valores los registras TÚ si los tienes (de una báscula, un calibre, un escáner…). Son OPCIONALES: nunca se exigen para completar una evaluación, nunca generan pendientes y NUNCA se calculan desde las fotos. Y un cambio de perímetro no demuestra ganancia de músculo ni pérdida de grasa.',
  'eval.compFat': 'Grasa corporal',
  'eval.compMuscle': 'Masa muscular',
  'eval.compMuscleNote': 'La masa muscular NO es lo mismo que la masa libre de grasa: la masa libre de grasa incluye también huesos, agua y órganos. Son magnitudes distintas — por eso aquí nunca se mezclan.',
  'eval.compMethod': 'Método / origen',
  'eval.compEstimate': 'Es una estimación',
  'eval.compRegister': 'Registrar',
  'eval.compValuePh': 'Valor',
  'eval.compEstTag': 'estimación',
  'eval.compNone': 'sin registrar',
  'eval.compMethodDiff': 'Método distinto al anterior: la diferencia puede deberse al método, no a un cambio real.',
  'eval.compUnitDiff': 'Unidades distintas (kg frente a %): no se mezclan — la diferencia no se calcula.',
  'eval.method.bio': 'Báscula de bioimpedancia',
  'eval.method.caliper': 'Calibre (plicómetro)',
  'eval.method.scan': 'Escáner corporal',
  'eval.method.other': 'Otro / manual',
  'eval.cfgTitle': 'Configuración de la evaluación',
  'eval.cfgRequired': 'Medidas REQUERIDAS en la evaluación (solo estas pueden generar un pendiente)',
  'eval.cfgReqNote': 'Toda medida es opcional salvo las que TÚ marques aquí como requeridas. Solo las requeridas aparecen como «falta» y pueden mantener abierta una evaluación. Las tres fotos (frente, costado, espalda) forman siempre parte de la evaluación: son su núcleo, no un extra configurable.',
  'eval.cfgUnits': 'Unidades de las medidas',
  'eval.unitsMetric': 'Métrico (kg, cm)',
  'eval.unitsImperial': 'Imperial (lb, pulgadas)',
  'eval.cfgSave': 'Guardar configuración',
  'mealhelp.addManual': 'Añadir comida manualmente',
  'mealhelp.upload': '📷 Subir foto de comida',
  'mealhelp.takePhoto': '📷 Tomar una foto',
  'mealhelp.uploaded': 'Foto enviada. Avísame por el chat para analizarla.',
  'mealhelp.uploading': 'Subiendo foto…', 'mealhelp.uploadFail': 'No se pudo subir la foto.', 'mealhelp.tooBig': 'La imagen es muy pesada, prueba con otra.',
  'mealhelp.empty': 'Aún no has subido fotos.',
  'mealhelp.reviewed': '✓ revisada',
  'mealhelp.pending': '⏳ pendiente',
  'mealhelp.foodAlt': 'Comida',
  'mealhelp.tapZoom': 'Toca para ampliar',
  'mealhelp.zoomed': 'Foto ampliada',
  'ai.analyze': 'Analiza la comida',
  'ai.introTitle': 'Analizar una comida desde una foto',
  'ai.introTake': '📷 Tomar o elegir la foto',
  'ai.photoNotSaved': '📷 Antes de tomar la foto: las fotos de comida NO se guardan. Una foto se usa solo para este análisis, en este momento: la app conserva el registro de la comida (los alimentos y sus valores), nunca la imagen. Si quieres conservar la foto, guárdala también en la galería de tu teléfono.',
  'ai.limitNote': 'Límite diario de análisis: los análisis por foto y por texto comparten un contador diario (un análisis completo suele llevar 2 peticiones: identificar + calcular). Si tu cuenta tiene un límite diario fijado y lo alcanzas, el análisis por foto y por texto se pausa hasta que el contador se reinicia al día siguiente; puedes seguir registrando cada comida a mano. Si tu cuenta no tiene límite fijado, no hay tope.',
  'ai.scaleWhy': 'Por qué importa si un peso era de báscula: la báscula da el peso real, así que el cálculo se apoya en un dato medido. Un estimado tiene más margen de error; por eso cada cantidad conserva su insignia (de tu báscula / estimado): para que tú y tu entrenador sepáis qué números son medidos y cuáles estimados, y los tratéis con esa honestidad.',
  'ai.analyzing': 'Analizando…',
  'ai.foodsFound': 'Encontré estos alimentos:',
  'ai.foodsEditHint': 'Puedes corregir un nombre o una cantidad, quitar un alimento o añadir otro.',
  'ai.addFood': '＋ Añadir alimento',
  'ai.removeFood': 'Quitar alimento',
  'ai.questionsTitle': 'Unas preguntas rápidas (puedes saltarlas):',
  'ai.skipOption': 'No sé / saltar',
  'ai.otherLabel': 'Otro: escríbelo tú',
  'ai.continue': 'Continuar',
  'ai.draftTitle': 'Borrador estimado: aún no se guarda nada',
  'ai.range': 'Rango estimado: {a}–{b} kcal',
  'ai.useDraft': 'Usar como borrador',
  'ai.discard': 'Descartar',
  'ai.unavailable': 'El análisis de la comida aún no está activo.',
  'ai.failed': 'El análisis falló. Puedes registrar la comida manualmente.',
  'ai.banner': 'Borrador de tu foto: revisa y edita los valores antes de guardar.',
  'ai.draftError': 'Algo salió mal al preparar el borrador. No se guardó nada: inténtalo de nuevo.',
  'ai.savedInfo': 'Comida guardada: {kcal} kcal · Total del día: {total} kcal',
  'ai.retry': 'Reintentar',
  'ai.continueManual': 'Continuar manualmente',
  'ai.mealPrompt': '¿A qué comida pertenece?',
  'ai.metricsTitle': 'Valores de esta comida — puedes editarlos antes de guardar:',
  'ai.save': 'Guardar',
  'ai.backToFoods': 'Corregir alimentos',
  'ai.estPortion': 'porción estimada',
  'ai.unitWord': 'unidad',
  'ai.perPiece': 'g por unidad',
  'ai.perPiecePh': 'ej. 50',
  'ai.piecesTotal': '≈ {g} g en total',
  'ai.needPerPiece': 'Para calcular falta el peso por unidad de «{name}»: escribe cuántos gramos pesa 1 unidad — no se inventa.',
  'ai.recalcWarn': 'Ya ajustaste los valores a mano. Si se recalcula, esos ajustes manuales se reemplazan por el cálculo nuevo.',
  'ai.recalcYes': 'Sí, recalcular',
  'ai.saveError': 'No se pudo guardar. Tus cambios siguen aquí: revisa la conexión y toca Guardar para reintentar.',
  'ai.capReached': 'Alcanzaste el límite diario de análisis del piloto. Vuelve mañana para analizar otra foto; mientras tanto puedes registrar la comida manualmente.',
  'ai.retryHint': 'Prueba con una foto más clara — o describe la comida por texto aquí mismo:',
  'ai.newPhoto': 'Nueva foto',
  'aiText.label': 'Describe tu comida',
  'aiText.ph': 'Ej.: tortilla de quinoa con huevo, queso cottage y jamón de pavo',
  'aiText.hint': '¿Sin foto? Describe el plato y la IA sugerirá sus componentes y cantidades: tú revisas y editas todo antes de guardar.',
  'aiText.button': 'Analizar la descripción con IA',
  'aiText.tooShort': 'Describe primero la comida con un poco más de detalle.',
  'aiText.notFound': 'La IA no pudo identificar ningún alimento esta vez. Inténtalo de nuevo o registra la comida manualmente.',
  'aiText.banner': 'Borrador de tu descripción: revisa y edita los valores antes de guardar.',
  'aiMulti.title': 'Fotos de esta comida',
  'aiMulti.hint': 'Son fotos de UNA misma comida: el plato servido y cada alimento pesado en tu báscula. Puedes quitar o reemplazar cualquier foto antes de analizar.',
  'aiMulti.add': '＋ Añadir otra foto',
  'aiMulti.analyze': 'Analizar las fotos',
  'aiMulti.max': 'Máximo 5 fotos por análisis.',
  'aiMulti.remove': 'Quitar foto',
  'aiMulti.fromScale': 'De tu báscula',
  'aiMulti.estimated': 'Estimado',
  'access.title': '🔐 Administración de accesos',
  'access.sub': '· solo administrador',
  'access.hint': 'Las cuentas nuevas quedan pendientes hasta que las apruebes. Solo los usuarios aprobados pueden entrar y cada uno ve únicamente sus datos.',
  'access.pending': 'Pendientes de aprobación (',
  'access.users': 'Usuarios con acceso',
  'access.loading': 'Cargando…',
  'clients.title': '👥 Mis clientes',
  'clients.sub': '· gestión de entrenador',
  'clients.hint': 'Cada cliente debe subir su peso cada semana. Selecciona uno para ver su historial completo, editar sus pesajes o agregar nuevos. Sus metas las estableces en "Administración de accesos".',
  'foot': 'ronbo.nutri · privado · tus datos solo los ves tú',
  'meal.title': 'Registrar comida',
  'form.date': 'Fecha',
  'form.moment': 'Momento',
  'form.food': 'Alimento',
  'form.foodPh': 'Ej. Pechuga de pollo',
  'form.amount': 'Cantidad',
  'form.amountPh': 'Ej. 150 g',
  'form.photo': '📷 Foto de la comida (opcional)',
  'meal.photoHint': '📷 ¿No sabes los valores de un alimento? Usa «Analiza la comida» en Ayuda con comidas.',
  'form.kcal': 'Kcal',
  'form.protein': 'Proteína (g)',
  'form.carbs': 'Carbos (g)',
  'form.sugar': 'Azúcares (g)',
  'form.fat': 'Grasas (g)',
  'form.notes': 'Notas',
  'form.cancel': 'Cancelar',
  'form.save': 'Guardar',
  'form.weight': 'Peso (kg)',
  'form.bodyfat': 'Grasa corporal (%)',
  'form.muscle': 'Masa muscular (%)',
  'form.water': 'Agua corporal (%)',
  'form.visceral': 'Grasa visceral (nivel)',
  'goals.title': 'Metas del usuario',
  'goals.for': 'Metas · {name}',
  'form.cal': 'Calorías (kcal)',
  'form.sugarMax': 'Azúcares máx (g)',
  'goals.save': 'Guardar metas',
  'goals.none': 'Sin metas fijadas todavía',
  'profile.title': 'Perfil del cliente',
  'profile.for': 'Perfil · {name}',
  'form.phone2': 'Teléfono',
  'form.trainerNotes': 'Notas del entrenador (primera entrevista, objetivos, observaciones)',
  'profile.notesPh': 'Lo que completes en la primera entrevista…',
  'profile.save': 'Guardar perfil',
  'chart.note': '% de la meta diaria por día. La línea punteada es el 100%. En azúcares, lo ideal es mantenerse por debajo.',
  'err.name': 'Escribe tu nombre y apellido.',
  'err.phone': 'Escribe tu número de teléfono.',
  'err.gender': 'Selecciona tu sexo / género.',
  'err.consent': 'Debes aceptar el aviso de privacidad.',
  'err.health': 'Debes confirmar tu declaración de salud.',
  'err.pwmatch': 'Las contraseñas no coinciden.',
  'err.emailInUse': 'Ese correo ya tiene cuenta. Entra con "Entrar".',
  'err.weakPw': 'La contraseña debe tener al menos 6 caracteres.',
  'err.badEmail': 'El correo no es válido.',
  'err.createFail': 'No se pudo crear la cuenta. Intenta de nuevo.',
  'err.forgotNoEmail': 'Escribe tu correo arriba para enviarte el enlace.',
  'err.resetFail': 'No se pudo enviar el correo. Intenta de nuevo.',
  'err.noAccess': 'Esta cuenta no tiene acceso.',
  'sys.maintenance': 'Mantenimiento en curso: las operaciones de consentimiento y de cuenta no están disponibles durante unos minutos mientras completamos una actualización del sistema. Inténtalo de nuevo en unos minutos. Tus datos están a salvo.',
  'err.pending': 'Tu cuenta está pendiente de aprobación por el administrador.',
  'err.verifyFail': 'No se pudo verificar el acceso.',
  'err.noPermission': 'Tu cuenta no tiene permiso para hacer esto. Si crees que es un error, avísale a tu entrenador.',
  'err.noConnection': 'Sin conexión, o el servicio no está disponible ahora. Revisa tu conexión e inténtalo de nuevo.',
  'err.genericFail': 'Algo salió mal. Inténtalo de nuevo.',
  'err.badCreds': 'Credenciales incorrectas.',
  'err.tooHeavy': 'La imagen es muy pesada, prueba con otra.',
  'err.uploadFail': 'No se pudo subir la foto.',
  'err.mealMissing': 'Faltan fecha o alimento.',
  'err.mealPhotoFail': 'No se pudo subir la foto; se guarda sin foto.',
  'err.weightMissing': 'Faltan fecha o peso válido.',
  'msg.accountCreated': 'Cuenta creada. Ahora espera aprobación: lee la nota de abajo.',
  'reg.waitTitle': '✅ Tu cuenta fue creada: falta un paso, la aprobación',
  'reg.waitTrainer': 'Tu cuenta ahora espera a que {name}, el entrenador que elegiste, la apruebe. Tu entrenador revisa las cuentas nuevas personalmente; en cuanto te apruebe, entra con tu correo y tu contraseña y pasarás directo: no hay nada más que enviar ni un segundo formulario. No podemos prometer un plazo exacto: depende de que tu entrenador lo revise. Mientras tanto tu cuenta permanece cerrada dentro de la app: es normal y no hay nada malo en tu registro.',
  'reg.waitAdmin': 'Tu cuenta ahora espera aprobación: el administrador te asignará un entrenador y aprobará tu cuenta. En cuanto eso ocurra, entra con tu correo y tu contraseña y pasarás directo: no hay nada más que enviar ni un segundo formulario. No podemos prometer un plazo exacto: depende de que el administrador lo revise. Mientras tanto tu cuenta permanece cerrada dentro de la app: es normal y no hay nada malo en tu registro.',
  'msg.resetSent': 'Correo enviado. Contiene un enlace (no un código): toca el enlace y escribe tu nueva contraseña en la página que se abre. Revisa también tu carpeta de spam.',
  'msg.approved': 'Usuario aprobado.',
  'msg.revoked': 'Acceso retirado.',
  'msg.rejected': 'Solicitud eliminada.',
  'msg.foodReviewed': 'Foto marcada como revisada.',
  'msg.goalsSaved': 'Metas actualizadas.',
  'msg.profileSaved': 'Perfil actualizado.',
  'msg.storageSoon': 'Las fotos de progreso se activarán próximamente.',
  'msg.uploading': 'Subiendo foto…',
  'msg.uploadFail': 'No se pudo subir la foto.',
  'msg.tooBig': 'La imagen es muy pesada, prueba con otra.',
  'ui.photoAlt': 'Foto ampliada',
  'msg.photoDeleted': 'Foto eliminada.',
  'msg.foodSent': 'Foto enviada. Avísame por el chat para analizarla.',
  'train.title': '🏋️ Mi plan de entrenamiento', 'train.loading': 'Cargando tu plan…',
  'train.none': 'Tu entrenador aún no te ha asignado un plan.',
  'train.weekDone': 'Sesiones completadas esta semana: {n}',
  'train.planFreq': 'Tu plan: {n} días por semana',
  'train.markDone': 'Marcar como hecho hoy', 'train.doneToday': 'Hecho hoy ✓', 'train.undo': 'Deshacer',
  'train.view.rest': 'Descanso', 'train.view.warmup': 'Aproximación', 'train.view.session': 'Sesión',
  'train.view.rpe': 'RPE', 'train.view.rpeNone': 'Sin RPE', 'train.view.exDone': 'Hecho',
  'train.view.alignBody': 'Tu rutina: {plan}. Tus avisos de entrenamiento: {cfg}. ¿Alineas tus avisos con tu plan?',
  'train.view.sessionsWeek': '{n} sesiones por semana', 'train.view.noDays': 'ningún día configurado',
  'train.view.alignYes': 'Alinear con mi plan', 'train.view.alignOpen': 'Revisar ajustes',
  'train.view.alignNo': 'Ahora no', 'train.view.alignDone': 'Avisos de entrenamiento alineados ✓',
  'train.saved': 'Plan guardado.', 'train.deleted': 'Plan eliminado.',
  'train.editorTitle': 'Plan de entrenamiento', 'train.section': '🏋️ Entrenamiento',
  'train.f.title': 'Título del plan', 'train.f.titlePh': 'Ej. Fuerza — 4 días',
  'train.f.notes': 'Notas para el cliente', 'train.f.active': 'Plan activo (el que ve el cliente)',
  'train.f.addDay': '＋ Añadir día', 'train.f.dayPh': 'Etiqueta del día (ej. Día 1 · Pecho)',
  'train.f.addEx': '＋ Añadir ejercicio', 'train.f.exPh': 'Ejercicio', 'train.f.setsPh': 'Series',
  'train.f.repsPh': 'Reps', 'train.f.notePh': 'Nota', 'train.f.remove': 'Quitar',
  'train.save': 'Guardar plan', 'train.err': 'Ponle un título al plan y al menos un ejercicio.',
  'train.new': 'Plan nuevo', 'train.activeBadge': 'Activo', 'train.activate': 'Activar',
  'train.deactivate': 'Desactivar', 'train.delete': 'Eliminar',
  'train.deleteConfirm': '¿Eliminar este plan permanentemente?',
  'train.noPlan': 'Aún no hay plan asignado.', 'train.recent': 'Sesiones recientes',
  'train.noLogs': 'Aún no hay sesiones registradas.',
  'train.daysCount': '{n} días', 'train.exCount': '{n} ejercicios',
  'train.gate.checking': 'Comprobando el estado de la declaración de salud de este cliente…',
  'train.gate.ok': '🏥 Declaración de salud: este cliente tiene una declaración vigente registrada.',
  'train.gate.blockFirst': 'El primer plan de este cliente aún no se puede guardar: no tiene una declaración de salud vigente registrada, o su consentimiento específico no está activo. Pídele que complete su declaración de salud en su app primero. (Aquí no se muestra ningún contenido de la declaración.)',
  'train.gate.warnLater': '⚠️ Este cliente no tiene una declaración de salud vigente registrada. Este plan sí se puede guardar; puedes pedirle que la complete en su app.',
  'train.gate.savedWithWarning': 'Plan guardado. Nota: este cliente sigue sin una declaración de salud vigente registrada.',
  'train.lib.unavailable': '📚 La biblioteca de ejercicios no está disponible ahora (puede estar vacía o no pudo cargarse). Puedes seguir escribiendo los ejercicios como texto libre: los planes se guardan con normalidad.',
  'train.lib.photo': 'Foto', 'train.lib.video': 'Video',
  'train.f.sePh': 'SE', 'train.f.repPh': 'REP', 'train.f.more': 'Más opciones',
  'train.lib.media': 'Multimedia del ejercicio',
  'train.lib.noMedia': 'Este ejercicio aún no tiene foto ni video asociados. Vincúlalo desde la biblioteca escribiendo su nombre y eligiendo la sugerencia.',
  'train.viz.title': '🧱 Constructor visual',
  'train.viz.toggle': 'Explorar la biblioteca visualmente',
  'train.viz.searchPh': 'Buscar por nombre, músculo, equipo…',
  'train.viz.allGroups': 'Todos los grupos musculares',
  'train.viz.dayLabel': 'Añadir al día',
  'train.viz.dayN': 'Día {n}',
  'train.viz.add': '＋ Añadir',
  'train.viz.added': 'Añadido: {name}',
  'train.viz.empty': 'Ningún ejercicio coincide con este filtro.',
  'train.snap.btn': 'Versiones', 'train.snap.title': 'Historial de versiones',
  'train.snap.empty': 'Aún no hay versiones guardadas. La versión anterior se conserva aquí cada vez que se guarda este plan.',
  'train.snap.view': 'Ver', 'train.snap.hide': 'Ocultar', 'train.snap.at': 'Versión guardada el {d}',
  'train.sub.btn': 'Sustituir', 'train.sub.title': 'Sustitutos sugeridos (mismo grupo muscular)',
  'train.sub.none': 'Sin sustitutos que sugerir: la biblioteca no está disponible o este ejercicio no tiene grupo muscular conocido. El texto libre sigue funcionando.',
  'train.sub.sameEq': 'mismo equipo',
  'train.btr.btn': 'Tipo de cuerpo', 'train.btr.title': 'Calificaciones por tipo de cuerpo — {name}',
  'train.btr.ecto': 'Ectomorfo', 'train.btr.meso': 'Mesomorfo', 'train.btr.endo': 'Endomorfo',
  'train.btr.high': 'Alto', 'train.btr.med': 'Medio', 'train.btr.low': 'Bajo', 'train.btr.why': 'Fundamento',
  'train.btr.note': 'Los tipos de cuerpo son una guía práctica de referencia, no cajas rígidas. La mayoría de las personas combina rasgos de más de un tipo; el objetivo personal y el progreso individual mandan sobre cualquier etiqueta.',
  'train.btr.disclaimer': 'Referencia general solo para ESTE ejercicio. No etiqueta a ninguna persona, y nada se asigna ni se preselecciona por tipo de cuerpo: el entrenador siempre decide.',
  'train.btr.unavailable': 'Las calificaciones por tipo de cuerpo no están disponibles ahora (esa colección no pudo cargarse o está vacía). El editor sigue funcionando como siempre.',
  'train.btr.noData': 'Este ejercicio no tiene calificación por tipo de cuerpo cargada.',
  'train.btr.needLink': 'Vincula esta fila a un ejercicio de la biblioteca para ver sus calificaciones por tipo de cuerpo.',
  'train.print.btn': '🖨 Tarjeta imprimible', 'train.print.title': 'Plan de entrenamiento', 'train.print.session': 'Sesión',
  'train.f.warmupPh': 'Series de aproximación', 'train.f.restPh': 'Descanso',
  'train.tpl.title': '📋 Plantillas de rutina',
  'train.dates.currentTitle': 'Plan activo actual',
  'train.dates.change': 'Cambiar plan',
  'train.dates.start': 'Fecha de inicio',
  'train.dates.end': 'Fecha de fin (vencimiento)',
  'train.dates.duration': 'Duración',
  'train.dates.presetNone': 'Sin duración fija',
  'train.dates.weekly': 'Semanal',
  'train.dates.fortnightly': 'Quincenal',
  'train.dates.monthly': 'Mensual',
  'train.dates.bimonthly': 'Bimensual (2 meses)',
  'train.dates.quarterly': 'Trimestral (3 meses)',
  'train.dates.hint': 'La fecha de fin se calcula desde la fecha de inicio y la duración; también puedes ajustarla a mano.',
  'train.dates.none': 'Sin fechas registradas',
  'train.dates.expired': 'Vencido',
  'train.dates.fromOnly': 'Desde el {d}',
  'train.dates.untilOnly': 'Hasta el {d}',
  'train.dates.clientLine': 'Periodo del plan: {period}',
  'train.tpl.use': 'Usar esta plantilla',
  'train.tpl.perWeek': '{n} días/semana',
  'train.tpl.unavailable': '📋 Las plantillas de rutina no están disponibles ahora (pueden estar vacías o no pudieron cargarse). Puedes seguir armando el plan a mano: nada se bloquea.',
  'train.tpl.replaceConfirm': 'Aplicar esta plantilla REEMPLAZA el borrador actual del editor (título, días y ejercicios). ¿Continuar?',
  'train.tpl.applied': 'Borrador creado desde la plantilla. Revísalo y ajústalo: nada se guarda hasta que toques Guardar plan.',
  'train.tpl.startLabel': 'Fecha de inicio (para la sugerencia de días)',
  'train.tpl.alignHint': 'Elige una fecha de inicio para ver una sugerencia: alinear cada día de la plantilla con un día de semana real. La sugerencia nunca cambia nada por sí sola.',
  'train.tpl.alignTitle': 'Alineación de días sugerida desde el {date}:',
  'train.tpl.alignApply': 'Aplicar alineación',
  'train.tpl.alignIgnore': 'Ignorar',
  'train.tpl.alignApplied': '✓ Días de semana aplicados a las etiquetas. Puedes seguir editando cualquier etiqueta.',
  'train.prop.tplTitle': '📋 Plantillas de rutina',
  'train.prop.tplIntro': 'Explora las plantillas de rutina. Puedes proponer añadir o cambiar un ejercicio de tu plan activo: tu entrenador lo revisa y decide.',
  'train.prop.tplUnavailable': '📋 Las plantillas de rutina no están disponibles ahora mismo (pueden estar vacías o no haberse podido cargar).',
  'train.prop.details': 'Detalles', 'train.prop.hide': 'Ocultar',
  'train.prop.proposeBtn': 'Proponer para mi plan',
  'train.prop.noPlanNote': 'Todavía no tienes un plan activo, así que no puedes enviar propuestas — pero sí explorar las plantillas.',
  'train.prop.formTitle': 'Nueva propuesta',
  'train.prop.typeAdd': 'Añadir un ejercicio', 'train.prop.typeChange': 'Cambiar un ejercicio',
  'train.prop.day': 'Día de tu plan', 'train.prop.currentEx': 'Ejercicio a sustituir',
  'train.prop.newEx': 'Ejercicio propuesto',
  'train.prop.searchPh': 'Busca en la biblioteca de ejercicios…',
  'train.prop.fromTpl': 'Desde la plantilla: {name}',
  'train.prop.note': 'Nota para tu entrenador (opcional)',
  'train.prop.notePh': '¿Por qué te gustaría este cambio?',
  'train.prop.send': 'Enviar propuesta', 'train.prop.cancel': 'Cancelar',
  'train.prop.sent': 'Propuesta enviada. Tu entrenador la revisará.',
  'train.prop.needEx': 'Elige primero un ejercicio.',
  'train.prop.myTitle': '🗳️ Mis propuestas',
  'train.prop.myEmpty': 'Todavía no tienes propuestas.',
  'train.prop.stSent': 'Enviada', 'train.prop.stSeen': 'Vista',
  'train.prop.seenOn': 'Vista el {date}',
  'train.prop.statusHint': 'Cómo leerlos: Enviada = tu entrenador aún no la ha abierto · Vista = ya abrió tus propuestas · Aprobada / Rechazada = su decisión. Estos avisos viven solo dentro de la app: no se envía nada a tu teléfono.',
  'train.prop.stPending': 'Pendiente', 'train.prop.stApproved': 'Aprobada', 'train.prop.stRejected': 'Rechazada',
  'train.prop.addLine': 'Añadir {ex} · {day}',
  'train.prop.changeLine': 'Cambiar {old} → {ex} · {day}',
  'train.prop.decidedOn': 'Resuelta el {date}', 'train.prop.sentOn': 'Enviada el {date}',
  'train.prop.trayTitle': '🗳️ Propuestas del cliente',
  'train.prop.trayEmpty': 'Este cliente no tiene propuestas.',
  'train.prop.approve': 'Aprobar', 'train.prop.reject': 'Rechazar',
  'train.prop.openEditor': 'Abrir el plan en el editor',
  'train.prop.approvedNote': 'Aprobada. El plan NO ha cambiado: edítalo tú si decides aplicar el cambio.',
  'train.prop.byClient': 'Propuesta el {date}',
  'train.prop.noteLabel': 'Nota del cliente:',
  'train.prop.planGone': 'El plan ya no existe.',

  'form.dob': 'Fecha de nacimiento', 'form.dobHint': '(para verificar que eres mayor de 18; no se guarda)',
  'err.underage': 'Debes tener 18 años o más para crear una cuenta.',
  'priv.title': '🔒 Privacidad y datos',
  'priv.manage': 'Gestionar privacidad y datos',
  'perm.title': 'Permisos y privacidad',
  'perm.intro': 'Aquí gestionas tus permisos: tu declaración de salud y tu privacidad y datos — qué aceptas, qué compartes y qué puedes retirar o eliminar.',
  'perm.photoNote': 'La foto de la comida que envías para el análisis no se almacena.',
  'priv.sectionTitle': 'Privacidad y datos',
  'priv.statusAccepted': 'Consentimiento aceptado · versión {v} · {date}',
  'priv.statusNone': 'No se encontró registro de consentimiento para esta cuenta.',
  'priv.statusWithdrawn': 'Consentimiento retirado · acceso revocado.',
  'priv.viewNotice': 'Ver el aviso de privacidad', 'priv.download': 'Descargar mis datos (JSON)',
  'priv.downloaded': 'Tu archivo de datos se ha descargado.',
  'priv.withdraw': 'Retirar mi consentimiento',
  'priv.withdrawConfirm': 'Si retiras tu consentimiento, tu acceso se revoca de inmediato y tu entrenador eliminará tus datos y cerrará tu cuenta. ¿Continuar?',
  'priv.withdrawn': 'Consentimiento retirado. Tu acceso ha sido revocado.',
  'priv.delete': 'Eliminar mi cuenta y mis datos',
  'priv.deleteConfirm': 'Esto elimina permanentemente tu cuenta y TODOS tus datos (comidas, pesos, progreso, planes y fotos de ayuda). No se puede deshacer. ¿Continuar?',
  'priv.deleted': 'Tu cuenta y tus datos han sido eliminados.',
  'priv.deleteFail': 'No pudimos completar la eliminación. Inténtalo de nuevo.',
  'priv.dataDeletedFinish': 'Tus datos han sido eliminados. Inicia sesión una vez más para terminar de cerrar tu cuenta.',
  'priv.closedDataPending': 'Tu cuenta está cerrada. Algunos elementos no pudieron eliminarse automáticamente y se eliminarán manualmente; no tienes que hacer nada.',
  'priv.finishCloseAsk': 'Tus datos ya fueron eliminados. ¿Quieres terminar de cerrar tu cuenta ahora?',
  'priv.renew': 'Renovar mi consentimiento',
  'priv.renewAccept': 'Acepto el aviso de privacidad',
  'priv.renewConfirm': 'Tu consentimiento quedará registrado como aceptado hoy, con la versión {v} del aviso. Tu retirada anterior se conserva en el registro. ¿Continuar?',
  'priv.renewed': 'Consentimiento renovado.',
  'priv.statusHistory': 'Retirado el {d} · renovado el {d2}',
  'gate.renewIntro': 'Tu cuenta está pendiente de aprobación del administrador y tu consentimiento consta como retirado. Si lo deseas, puedes renovarlo ahora: lee el aviso de privacidad y acéptalo. La renovación queda registrada con su fecha y la versión del aviso; tu retirada anterior se conserva en el registro.',
  'priv.recentLogin': 'Tus datos se eliminaron, pero Google necesita un inicio de sesión reciente para borrar la cuenta en sí: cierra sesión, vuelve a entrar y repite la eliminación. Si te atascas, pide ayuda a tu entrenador.',
  'priv.working': 'Procesando…',
  'msg.photoSaved': 'Foto guardada.',
  'msg.photoDeleted': 'Foto eliminada.',
  'msg.avatarSaved': 'Foto de perfil actualizada.',
  'msg.mealSaved': 'Comida registrada.',
  'msg.mealDeleted': 'Registro borrado.',
  'msg.weightSaved': 'Pesaje registrado.',
  'msg.weightDeleted': 'Pesaje borrado.',
  'confirm.revoke': '¿Quitar el acceso a este usuario? No podrá volver a entrar.',
  'confirm.reject': '¿Rechazar y eliminar esta solicitud?',
  'confirm.delPhoto': '¿Eliminar esta foto?',
  'confirm.delMeal': '¿Borrar este registro?',
  'confirm.delWeight': '¿Borrar el pesaje del {date}?',
  'admin.noPending': 'Sin solicitudes pendientes.',
  'admin.noUsers': 'Aún no hay usuarios aprobados.',
  'admin.approve': 'Aprobar',
  'admin.reject': 'Rechazar',
  'admin.profile': 'Perfil',
  'admin.goals': 'Metas',
  'admin.revoke': 'Quitar acceso',
  'admin.owner': 'administrador',
  'limits.title': '🤖 Límites de análisis',
  'limits.hint': 'Límites diarios de análisis de fotos, fijados solo por ti. Cada cuenta usa su propio límite si lo tiene; si no, el de su entrenador; si no, el global. Sin límite fijado significa ilimitado.',
  'limits.global': 'Límite global',
  'limits.trainers': 'Entrenadores',
  'limits.users': 'Usuarios',
  'limits.perDay': '/ día',
  'limits.noLimit': 'Sin límite',
  'limits.usageToday': 'Hoy: {n}',
  'limits.save': 'Guardar',
  'limits.saved': 'Límite guardado.',
  'limits.error': 'No se pudieron cargar ni guardar los límites. Inténtalo de nuevo.',
  'limits.invalid': 'Escribe un número entero de 0 o más, o elige «Sin límite».',
  'limits.countNote': 'El contador mide solicitudes al servicio; un análisis completo usa normalmente dos.',
  'clients.empty': 'Aún no hay clientes registrados.',
  'clients.noWeighins': 'sin pesajes',
  'clients.daysAgo': 'hace {d} días',
  'clients.daysAgoShort': 'hace {d} d',
  'clients.pending': 'pendiente',
  'clients.healthTitle': 'Declaró condiciones de salud',
  'clients.healthBadge': 'salud',
  'clients.foodTitle': 'Fotos de comida por revisar',
  'clients.view': 'Ver registro',
  'client.fallbackName': 'Cliente',
  'client.weightLog': 'Registro de peso · {name}',
  'client.healthDecl': 'Declaración de salud:',
  'client.foodReview': '📷 Fotos de comida por revisar ({n})',
  'client.addWeight': '＋ Agregar pesaje',
  'client.close': 'Cerrar',
  'client.noWeight': 'Este cliente aún no sube su peso.',
  'client.edit': 'Editar',
  'client.reviewed': '✓ Revisada',
  'bt.title': 'Estimación visual de tipo corporal',
  'bt.pilotNote': 'Solo piloto: esta función está habilitada únicamente para la cuenta del propietario y la cuenta de prueba «Prueba Ronald» hasta una decisión de lanzamiento separada.',
  'bt.providerInfo': 'Proveedor (D-09, actualizado por decisión del propietario del 24 de octubre de 2026): el proveedor de análisis es Google Gemini, el mismo servicio pagado que esta app ya usa para el análisis de comidas, a través del intermediario M8. Google no usa las instrucciones ni los archivos de los servicios pagados para mejorar sus productos, pero SÍ registra las instrucciones y las respuestas — incluidas las fotos enviadas — durante un periodo limitado, con el único fin de detectar infracciones de sus políticas y mantener la seguridad del servicio; Google no publica un número exacto de días. Esto NO es retención cero: si das este consentimiento, tus fotos corporales se enviarán a Google y quedarán registradas allí temporalmente bajo esos términos.',
  'bt.consentIntro': 'Un consentimiento específico, independiente y revocable para analizar fotos de tu cuerpo con inteligencia artificial.',
  'bt.consentText': 'Autorizo a RONBO.NUTRI a analizar mis fotografías corporales de progreso (frente, costado y espalda) y mis medidas físicas registradas, mediante un sistema de inteligencia artificial, con el único fin de estimar mi tipo de cuerpo como referencia para mi entrenador al establecer metas de entrenamiento y alimentación. Entiendo que: esta es una estimación visual, no un diagnóstico médico ni una evaluación clínica, y puede ubicarme en la categoría equivocada; mis fotos corporales se transmitirán a Google Gemini, el proveedor de análisis pagado que usa esta app, a través de su intermediario M8: Google no usa las instrucciones ni los archivos de los servicios pagados para mejorar sus productos, pero SÍ registra las instrucciones y las respuestas — incluidas mis fotos — durante un periodo limitado, con el único fin de detectar infracciones de sus políticas y mantener la seguridad del servicio; Google no publica un número exacto de días, así que esto no es retención cero y acepto ese registro temporal; puedo revocar este consentimiento en cualquier momento desde la app, y al revocarlo se bloquean de inmediato los nuevos análisis y todo acceso a las estimaciones ya generadas (su eliminación física o plazo de conservación sigue pendiente de la validación jurídica D-06); mi entrenador asignado y el administrador de la plataforma pueden ver la estimación mientras este consentimiento esté activo; y yo veré mi propia estimación solo si mi entrenador la comparte conmigo.',
  'bt.consentCheck': 'Declaro que tengo 18 años o más y doy este consentimiento específico.',
  'bt.statusNone': 'No has dado este consentimiento específico. Sin él, no puede ejecutarse ningún análisis de fotos corporales ni mostrarse ninguna estimación.',
  'bt.statusActive': 'Este consentimiento específico está activo (versión {v} · aceptado el {date}).',
  'bt.statusWithdrawn': 'Este consentimiento específico está retirado. Los nuevos análisis y todo acceso a las estimaciones ya generadas están bloqueados.',
  'bt.grant': 'Dar mi consentimiento específico (fotos corporales)',
  'bt.renew': 'Renovar mi consentimiento específico (fotos corporales)',
  'bt.withdraw': 'Retirar mi consentimiento específico (fotos corporales)',
  'bt.withdrawConfirm': '¿Retirar este consentimiento ESPECÍFICO para el análisis de fotos corporales? Los nuevos análisis se detendrán y todo acceso a las estimaciones ya generadas se bloqueará de inmediato. Su eliminación física o plazo de conservación sigue pendiente de la validación jurídica (D-06).',
  'bt.granted': 'Tu consentimiento específico para el análisis de fotos corporales ha quedado registrado.',
  'bt.renewed': 'Tu consentimiento específico para el análisis de fotos corporales ha sido renovado.',
  'bt.withdrawnToast': 'Tu consentimiento específico para el análisis de fotos corporales ha sido retirado. El acceso a las estimaciones está bloqueado.',
  'bt.needConsent': 'Este cliente no tiene un consentimiento específico activo para el análisis de fotos corporales.',
  'bt.sharedTitle': 'Estimaciones compartidas contigo',
  'bt.noShared': 'Todavía no se ha compartido ninguna estimación contigo.',
  'bt.blockedNote': 'Las estimaciones ya generadas no se muestran mientras este consentimiento no esté activo.',
  'bt.category.ectomorph': 'Constitución con predominio ectomorfo',
  'bt.category.mesomorph': 'Constitución con predominio mesomorfo',
  'bt.category.endomorph': 'Constitución con predominio endomorfo',
  'bt.estimateLine': '{category} · {date}',
  'bt.mixLine': 'Mezcla visual: ectomorfo {e}% · mesomorfo {m}% · endomorfo {n}%',
  'bt.margin': 'Estimación con margen: puede equivocarse por una categoría.',
  'bt.notDiagnosis': 'No es un diagnóstico ni una medición Heath-Carter.',
  'bt.trainerTitle': 'Estimación visual de tipo corporal',
  'bt.consentSignal': 'Consentimiento específico de fotos corporales: {v}',
  'bt.active': 'Activo',
  'bt.inactive': 'No activo',
  'bt.sourceLine': 'Evaluación de origen: {date} (fotos de frente, costado y espalda registradas).',
  'bt.sourceMissing': 'Uno o más registros de las fotos de origen ya no están disponibles; el origen de esta estimación está incompleto.',
  'bt.noCompleteSet': 'Todavía no hay un juego completo de fotos (frente, costado y espalda) para este cliente.',
  'bt.request': 'Solicitar estimación visual de tipo corporal',
  'bt.requesting': 'Solicitando…',
  'bt.noEstimates': 'Todavía no se han generado estimaciones para este cliente.',
  'bt.share': 'Compartir con el cliente',
  'bt.unshare': 'Dejar de compartir',
  'bt.sharedState': 'Compartida con el cliente',
  'bt.privateState': 'No compartida con el cliente',
  'bt.providerUnavailable': 'Ningún proveedor de análisis está disponible ahora mismo, así que no se envió ninguna foto ni se generó ninguna estimación.',
  'bt.invalidProvider': 'El proveedor devolvió una estimación no válida, así que no se guardó nada.',
  'bt.saved': 'Estimación visual de tipo corporal guardada.',
  'bt.loadError': 'No pudieron cargarse las estimaciones visuales de tipo corporal.',
  'bt.trainerNote': 'Solo referencia para el entrenador. Esta estimación nunca alimenta automáticamente las valoraciones de ejercicios, los planes de entrenamiento ni las metas.',
  'bt.consentSummary': 'Resumen: un consentimiento independiente para analizar tus fotos corporales y tus medidas para estimar tu tipo de cuerpo. El texto completo, que es el que se muestra para aceptarlo, aparece junto a la casilla, abajo.',
  'bt.fullTextTitle': 'Texto completo del consentimiento',
  'bt.versionMismatch': 'El consentimiento registrado usa otra versión, así que se trata como no activo.',
  'fb3.title': '🧮 Referencia de proteína (B-1)',
  'fb3.range': '{lo}–{hi} g/día',
  'fb3.basis': 'Con el último peso: {w} kg · {date}',
  'fb3.perkg': 'Referencia: 1,4–2,0 g/kg/día (ISSN 2017) para adultos sanos físicamente activos.',
  'fb3.stale': '⚠️ Este peso tiene {d} días — la referencia puede estar desactualizada.',
  'fb3.noweight': 'Aún no hay peso registrado: no hay base para la referencia de proteína.',
  'fb3.nogoals': 'Referencia solo educativa — no modifica las metas de este cliente. Las metas las fijas tú manualmente.',
  'fb3.helpBtn': 'Cómo se calcula y fuentes',
  'fb3.help': '<b>Cómo se calcula</b><br>Rango diario de proteína = último peso corporal × 1,4–2,0 g/kg/día.<br><b>Fuentes</b><br>• Position Stand de la ISSN: proteína y ejercicio (Jäger et al., 2017, J Int Soc Sports Nutr 14:20; DOI 10.1186/s12970-017-0177-8): 1,4–2,0 g/kg/día es suficiente para la mayoría de las personas que hacen ejercicio.<br>• Solo contexto (no se muestra como rango aquí): para hipertrofia con entrenamiento de resistencia, Morton et al. (2018, Br J Sports Med; DOI 10.1136/bjsports-2017-097608) estimó un punto de inflexión de 1,62 g/kg/día (límite superior del IC95%: 2,20) — ni meta universal ni techo individual demostrado.<br>Estos rangos son referencias educativas, pendientes de validación en esta app; no son una prescripción y nunca modifican las metas que tú fijas.',
  'fa.title': '🧮 Cálculo energético',
  'fa.helpBtn': 'Cómo se calcula y fuentes',
  'fa.help': '<b>Qué estima esto</b><br>Dos estimaciones con la ecuación de Mifflin-St Jeor: tu gasto en reposo (RMR) y tu gasto estimado sin ejercicio estructurado (RMR × tu multiplicador de actividad).<br><b>Para qué sirve</b><br>Una cifra de orientación para planificar — no es una medición.<br><b>Sus límites</b><br>Toda cifra aquí es una estimación con incertidumbre propia; no es una garantía individual. El multiplicador cubre el reposo, la vida diaria y el movimiento habitual; el ejercicio estructurado NO está incluido en esta estimación.',
  'fa.helpDetail': '<b>Fórmula · Mifflin-St Jeor</b><br>Hombres: 10 × peso (kg) + 6,25 × talla (cm) − 5 × edad (años) + 5<br>Mujeres: 10 × peso (kg) + 6,25 × talla (cm) − 5 × edad (años) − 161<br>Gasto estimado sin ejercicio estructurado = RMR × palBasal.<br><b>Fuentes</b><br>• Mifflin MD et al., «A new predictive equation for resting energy expenditure in healthy individuals», Am J Clin Nutr 1990;51(2):241–247. DOI: 10.1093/ajcn/51.2.241<br>• Frankenfield D, Roth-Yousey L, Compher C. Revisión sistemática de las ecuaciones predictivas, 2005. DOI: 10.1016/j.jada.2005.02.005<br><b>Sobre el ejercicio estructurado</b><br>El ejercicio estructurado no va dentro del multiplicador ni se suma en ningún otro sitio en esta versión: aún no existe un módulo de gasto por sesión, así que esta estimación nunca promete uno.',
  'fa.helpMore': 'Fórmula y fuentes ▾',
  'fa.helpLess': 'Ocultar fórmula y fuentes ▴',
  'fa.provided': 'Dato de sexo aportado: {v}',
  'fa.yes': 'Sí',
  'fa.no': 'No',
  'fa.equation': 'Ecuación',
  'fa.noEquation': 'Sin ecuación seleccionada — elige una para calcular',
  'fa.selected': '✓ seleccionada',
  'fa.eqMifflin': 'Mifflin-St Jeor',
  'fa.eqHB': 'Harris-Benedict revisada',
  'fa.eqTenHaaf': 'Ten Haaf',
  'fa.available': 'Disponible',
  'fa.unavailable': 'No disponible · pendiente de verificación',
  'fa.birthYear': 'Año de nacimiento',
  'fa.height': 'Talla (cm)',
  'fa.weightBasis': 'Con el último peso: {w} kg · {date}',
  'fa.noWeight': 'Aún no hay peso registrado: no hay base para el cálculo.',
  'fa.actLabel': 'Nivel de actividad (contexto para el entrenador — no lleva ningún número)',
  'fa.actNone': 'Sin nivel elegido',
  'fa.act1': 'Reposo casi total / movilidad muy reducida',
  'fa.act2': 'Vida sedentaria, trabajo de escritorio, desplazamientos mínimos',
  'fa.act3': 'Sedentario con actividad ligera diaria (de pie parte del día, caminatas cortas)',
  'fa.act4': 'Activo en la vida diaria (trabajo de pie o físico ligero, caminatas frecuentes)',
  'fa.act5': 'Trabajo físicamente exigente o vida diaria muy activa',
  'fa.act6': 'Trabajo físico pesado sostenido',
  'fa.palLabel': 'Multiplicador de actividad (palBasal)',
  'fa.palRules': 'Rango normal: 1,40–2,00 · Banda de excepción: 1,20–1,39 (con confirmación expresa) · Menos de 1,20: no admitido.',
  'fa.palGuide': '<b>Guía orientativa — qué cubre este multiplicador</b><br>Solo como referencia para tu criterio: el valor lo escribes tú; nada se rellena ni se preselecciona.<br>El multiplicador cubre el reposo, la vida diaria y el movimiento habitual, incluido el efecto térmico de los alimentos y la actividad no estructurada. NO incluye el ejercicio estructurado, y no se asigna ningún número por categoría: el nivel de actividad descriptivo de arriba es solo contexto y no lleva ningún número.',
  'fa.palPlaceholder': 'Ej.: 1,55',
  'fa.palWarn': '⚠ Este valor está fuera del rango fisiológico habitual.',
  'fa.palWarnBody': 'Está en la banda de excepción (1,20–1,39): para guardarlo necesitas confirmarlo expresamente.',
  'fa.palConfirm': 'Confirmo expresamente este valor de excepción',
  'fa.palError': 'Este valor no se puede guardar. Está fuera del rango admitido (1,20–2,00). Ajusta el valor para continuar.',
  'fa.saveConfig': 'Guardar datos',
  'fa.configSaved': '✓ Datos de cálculo guardados',
  'fa.errBy': 'El año de nacimiento debe estar entre 1900 y {max}.',
  'fa.errH': 'La talla debe estar entre 50 y 250 cm.',
  'fa.errPal': 'palBasal debe estar entre 1,20 y 2,00.',
  'fa.errConfirm': 'Para guardar un palBasal de la banda de excepción (1,20–1,39) debes confirmarlo expresamente.',
  'fa.noResult': 'Sin resultado',
  'fa.missEq': 'Todavía no se ha calculado: falta elegir la ecuación.',
  'fa.missSex': 'Todavía no se ha calculado: el cliente no ha aportado su dato privado de sexo — solo él puede aportarlo.',
  'fa.missData': 'Todavía no se ha calculado: faltan datos base (año de nacimiento, talla, multiplicador o un peso registrado).',
  'fa.missPending': 'Todavía no se ha calculado: todo está listo — el resultado se registra desde la propia sesión del cliente cuando abre la app.',
  'fa.rmr': 'GASTO EN REPOSO (RMR)',
  'fa.tdee': 'GASTO ESTIMADO SIN EJERCICIO ESTRUCTURADO',
  'fa.kcalDay': 'kcal/día',
  'fa.traceTitle': 'Trazabilidad del cálculo',
  'fa.trEq': 'Ecuación usada',
  'fa.trEqVal': '{name} · versión {ver}',
  'fa.trInputs': 'Entradas',
  'fa.trInputsVal': '{w} kg · {h} cm · {age} años',
  'fa.trWeight': 'Peso usado',
  'fa.trWeightVal': '{w} kg — pesaje del {date}',
  'fa.trPal': 'Multiplicador',
  'fa.trConst': 'Constante aplicada',
  'fa.trConstYes': 'Sí (el valor no se muestra)',
  'fa.trConstNo': 'No',
  'fa.trWhen': 'Calculado',
  'fa.trWhenVal': '{date} · por {who}',
  'fa.whoClient': 'el cliente (su propia sesión)',
  'fa.whoTrainer': 'el entrenador',
  'fa.zone': '🔒 Mi espacio privado',
  'fa.zoneSub': 'Lo que guardes aquí solo lo ves tú.',
  'fa.sexTitle': 'Sexo para el cálculo de energía',
  'fa.sexBody': 'La ecuación de Mifflin-St Jeor usa una constante distinta según el sexo. Este dato se guarda solo en tu espacio privado y nunca se muestra directamente a tu entrenador: tu entrenador ve tus datos (peso, talla, edad, multiplicador) y el resultado del cálculo, pero no este valor en sí. Ten en cuenta: como la ecuación es conocida, la constante aplicada podría inferirse a partir de esas entradas y del resultado. No se deduce de tu género y no se usa para ningún otro fin. Es voluntario: sin este dato no se puede calcular con esta ecuación. Puedes borrarlo cuando quieras.',
  'fa.female': 'Femenino',
  'fa.male': 'Masculino',
  'fa.current': 'Dato guardado: {v}',
  'fa.save': 'Guardar',
  'fa.delete': 'Borrar este dato',
  'fa.deleteConfirm': '¿Borrar tu dato privado de sexo? Sin él no se podrá hacer el cálculo de energía. Puedes volver a aportarlo cuando quieras.',
  'fa.pickOne': 'Elige una opción para guardarlo.',
  'fa.saved': '✓ Guardado en tu espacio privado',
  'fa.deleted': '✓ Dato privado borrado',
  'fa.lockNote': 'Este dato vive en tu espacio privado y no se muestra directamente a tu entrenador ni a nadie más (solo podría inferirse de las entradas y del resultado del cálculo, como se explica arriba).',
  'fa.loadError': 'No se pudo cargar tu espacio privado — no es lo mismo que no tener datos. Revisa tu conexión y recarga.',
  'fa.myResult': 'Tu último cálculo de energía: RMR {rmr} · gasto estimado sin ejercicio estructurado {tdee} {u} ({eq}).',
  'fa.staleBanner': '⚠ Pendiente de recálculo — los datos base cambiaron después de calcularse este resultado. Los valores siguientes son el resultado ANTERIOR.',
  'fa.stalePrev': 'Existe un resultado anterior (calculado el {date}) pero NO está vigente: se retiró el dato privado necesario para calcular. El historial se conserva — no se borró nada.',
  'fa.calcInvalid': 'No se calculó: {cause}',
  'fa.errWeight': 'No hay un peso registrado válido para calcular.',
  'pend.title': '🔔 Pendientes',
  'pend.configBtn': '⚙️ Configurar avisos',
  'pend.intro': 'Lo que falta por REGISTRAR, agrupado en un solo sitio. Estos avisos solo hablan del registro — nunca de lo que hiciste o dejaste de hacer. Fase 1: viven solo dentro de la app; no se envía nada a ningún sitio.',
  'pend.actTitle': 'Tus avisos aún no están activos',
  'pend.actIntro': 'Nada está activo por defecto. Estos son valores SUGERIDOS: revísalos, cambia lo que quieras — los avisos solo nacen cuando tocas «Confirmar y activar».',
  'pend.cfgTitle': 'Configuración de avisos',
  'pend.meals': 'Comidas y sus horas',
  'pend.mealName.Desayuno': 'Desayuno', 'pend.mealName.Almuerzo': 'Almuerzo', 'pend.mealName.Cena': 'Cena', 'pend.mealName.Merienda': 'Merienda', 'pend.mealName.Snack': 'Snack',
  'pend.weightOn': 'Avisarme de registrar mi peso',
  'pend.weightFreq': 'Frecuencia de pesaje',
  'pend.freq.1': 'Cada día', 'pend.freq.3': 'Cada 3 días', 'pend.freq.7': 'Cada semana', 'pend.freq.15': 'Cada 15 días',
  'pend.trainOn': 'Avisarme de mis sesiones de entrenamiento',
  'pend.trainDays': 'Mis días de entrenamiento',
  'pend.wd.0': 'D', 'pend.wd.1': 'L', 'pend.wd.2': 'M', 'pend.wd.3': 'X', 'pend.wd.4': 'J', 'pend.wd.5': 'V', 'pend.wd.6': 'S',
  'pend.quietOn': 'Descanso (ningún pendiente se muestra durante este bloque)',
  'pend.quietFrom': 'Desde', 'pend.quietTo': 'Hasta',
  'pend.cutoff': 'Corte del día',
  'pend.cutoffHelp': 'Tu día de registro empieza a esta hora (sugerida: 04:00 — tú confirmas la tuya). Antes del corte, «hoy» sigue siendo el día que empezó ayer: una cena a las 00:30 es la cena del día que termina.',
  'pend.tz': 'Zona horaria: la de tu dispositivo ({tz}). Cada «hoy» y cada hora la usan.',
  'pend.phaseNote': 'Fase 1: los pendientes solo aparecen dentro de la app, cuando la abres. Las notificaciones con la app cerrada están diseñadas pero NO activas.',
  'pend.confirm': 'Confirmar y activar',
  'pend.saveCfg': 'Guardar configuración',
  'pend.cancel': 'Cancelar',
  'pend.deactivate': 'Apagar todos los avisos',
  'pend.deactivateConfirm': '¿Apagar TODOS los avisos? Tu configuración se conserva, pero no nacerá ningún pendiente hasta que los actives de nuevo.',
  'pend.activatedOk': '✓ Avisos activados',
  'pend.savedOk': '✓ Configuración guardada',
  'pend.offOk': '✓ Avisos apagados',
  'pend.none': 'Nada pendiente. Todo registrado. ✓',
  'pend.mealTitle': 'Aún no has registrado tu {meal}.',
  'pend.mealDetail': 'Aviso que fijaste para las {time}',
  'pend.goMeal': 'Registrar {meal}',
  'pend.weightTitle': 'Aún no has registrado tu peso en este periodo.',
  'pend.weightTitlePastYday': 'Ayer no registraste tu peso.',
  'pend.weightTitlePastDate': 'El {date} no registraste tu peso.',
  'pend.weightDetail': 'Último registro: {when} · tu frecuencia: {freq}',
  'pend.weightNever': 'sin pesaje aún',
  'pend.daysAgo': 'hace {d} días',
  'pend.todayWord': 'hoy',
  'pend.yesterday': 'ayer',
  'pend.goWeight': 'Registrar pesaje',
  'pend.trainTitle': 'Tienes una sesión de entrenamiento programada que aún no has registrado.',
  'pend.trainTitlePastYday': 'Ayer no registraste tu entrenamiento.',
  'pend.trainTitlePastDate': 'El {date} no registraste tu entrenamiento.',
  'pend.goTraining': 'Ir a mi entrenamiento',
  'pend.evalTitle': 'Tu evaluación de progreso vencía el {date}.',
  'pend.energyTitle': 'Tu cálculo de energía necesita un dato privado',
  'pend.energyDetail': 'Tu entrenador dejó preparado tu cálculo de energía, pero aún no puede completarse: falta un dato privado que solo tú puedes aportar. Solo tú puedes ver su valor: tu entrenador solo ve si ya está aportado o no.',
  'pend.goEnergy': 'Completarlo ahora',
  'pend.evalMissing': 'Falta (requerido): {items}',
  'pend.goEval': 'Ir a Mi progreso',
  'pend.snooze': 'Posponer',
  'pend.snooze.1h': 'En 1 hora ({time})',
  'pend.snooze.3h': 'En 3 horas ({time})',
  'pend.snooze.tomorrowSame': 'Mañana a esta hora ({time})',
  'pend.snooze.tomorrow9': 'Mañana a las 09:00',
  'pend.omitOccasion': 'Hoy no corresponde',
  'pend.omitOccasionPast': 'No correspondía',
  'pend.discard': 'Descartar',
  'pend.discardConfirm': '¿Descartar este pendiente de entrenamiento? Quedará registrado como descartado por ti.',
  'pend.traceTitle': 'Estados',
  'pend.traceSnoozed': '{label}: pospuesto — vuelve {when}',
  'pend.traceOmitted': '{label}: omitido solo esta ocasión. El aviso sigue activo para la próxima vez y nada se marcó como hecho.',
  'pend.traceDiscarded': '{label}: descartado por ti',
  'pend.traceDone': '{label}: registrado ✓',
  'pend.snoozeQuietShift': 'La hora que elegiste ({time}) caía en tu descanso ({from}–{to}): se movió al final del descanso.',
  'pend.whenToday': 'hoy a las {time}',
  'pend.whenTomorrow': 'mañana a las {time}',
  'pend.whenDate': 'el {date} a las {time}',
  'pend.draftTitle': 'Registro sin guardar',
  'pend.draftBody': 'Tienes un registro de comida escrito pero aún no guardado ({food}). Lo que escribiste se conserva aunque recargues: puedes continuarlo o descartarlo — nunca se escribe dos veces.',
  'pend.draftContinue': 'Continuar el registro',
  'pend.draftDiscard': 'Descartar borrador',
  'pend.draftDiscardConfirm': '¿Descartar el registro sin guardar? Se perderá lo que escribiste.',
  'pend.label.weight': 'Peso', 'pend.label.training': 'Entrenamiento',
  'pend.loadError': 'Tus pendientes no pudieron cargarse — no es lo mismo que no tener ninguno. Revisa tu conexión y recarga.',
  'date.today': ' (hoy)',
  'date.weekLabel': 'Semana {n} · {y}',
  'note.kcalIn': '🔥 Calorías dentro del rango; quedan {left} kcal.',
  'note.kcalOver': '🔥 Calorías por encima de la meta (+{over} kcal).',
  'note.protOver': '💪 Proteína por encima de la meta (+{over} g).',
  'note.protNear': '💪 Proteína cerca de la meta ({pct}%).',
  'note.protUnder': '💪 Proteína por debajo de la meta ({pct}%).',
  'note.carbOver': '🌾 Carbohidratos por encima de la meta (+{over} g).',
  'note.carbNear': '🌾 Carbohidratos cerca de la meta ({pct}%).',
  'note.carbUnder': '🌾 Carbohidratos por debajo de la meta ({pct}%).',
  'note.sugarIn': '🍬 Azúcares dentro del límite ({v} de {g} g).',
  'note.sugarOver': '🍬 Azúcares por encima del límite (+{over} g).',
  'note.fatIn': '🫀 Grasas dentro de la meta ({pct}%).',
  'note.fatSlight': '🫀 Grasas ligeramente por encima de la meta (+{over} g).',
  'note.fatOver': '🫀 Grasas por encima de la meta (+{over} g).',
  'status.left': 'Te quedan',
  'status.available': 'disponible',
  'status.overLimit': 'Excediste el límite',
  'status.above': 'por encima',
  'status.overGoal': 'Excediste la meta',
  'meal.Desayuno': 'Desayuno',
  'meal.Almuerzo': 'Almuerzo',
  'meal.Cena': 'Cena',
  'meal.Merienda': 'Merienda',
  'meal.Snack': 'Snack',
  'gender.Femenino': 'Femenino',
  'gender.Masculino': 'Masculino',
  'gender.No binario': 'No binario',
  'gender.Género fluido': 'Género fluido',
  'gender.Otro': 'Otro',
  'gender.Prefiero no decirlo': 'Prefiero no decirlo',
  'cond.Hipertensión': 'Hipertensión',
  'cond.Diabetes': 'Diabetes',
  'cond.Problemas del corazón': 'Problemas del corazón',
  'cond.Dolor de pecho al ejercitarse': 'Dolor de pecho al ejercitarse',
  'cond.Mareos o desmayos': 'Mareos o desmayos',
  'cond.Asma / problemas respiratorios': 'Asma / problemas respiratorios',
  'cond.Lesiones articulares o musculares': 'Lesiones articulares o musculares',
  'cond.Cirugía reciente': 'Cirugía reciente',
  'cond.Embarazo': 'Embarazo',
  'cond.Ninguna de las anteriores': 'Ninguna de las anteriores'
}
};
let LANG = 'en';
try { const _l = localStorage.getItem('ronbo-nutri-lang'); if (_l === 'es' || _l === 'en') LANG = _l; } catch (e) {}
/* UX10-1 (piloto, 2026-10-23): primer arranque SIN elección guardada —
   la app abre en el idioma del teléfono (navigator.language): español
   si el teléfono está en español, inglés en cualquier otro caso. La
   elección manual del selector manda siempre: setLang() la persiste
   en localStorage y esta detección solo corre cuando no hay nada
   guardado, así que nunca sobrescribe la elección del usuario. */
if (LANG === 'en') {
  try {
    const _saved = localStorage.getItem('ronbo-nutri-lang');
    if (!_saved) {
      const _nav = String((navigator && (navigator.language || (navigator.languages || [])[0])) || '').toLowerCase();
      if (_nav.startsWith('es')) LANG = 'es';
    }
  } catch (e) {}
}
function t(k, vars) {
  let s = (STR[LANG] && STR[LANG][k] !== undefined) ? STR[LANG][k] : STR.en[k];
  if (s === undefined) s = k;
  if (vars) for (const key in vars) s = s.split('{' + key + '}').join(vars[key]);
  return s;
}
/* Values stored in Spanish (keeps existing data compatible); translated only for display. */
function mealName(v) { const s = t('meal.' + v); return s === 'meal.' + v ? v : s; }
function genderName(v) { const s = t('gender.' + v); return s === 'gender.' + v ? v : s; }
function condName(v) { const s = t('cond.' + v); return s === 'cond.' + v ? v : s; }
const MESES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DAYNAMES = { en: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], es: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'] };

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.getAttribute('data-i18n-title')); });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => { el.alt = t(el.getAttribute('data-i18n-alt')); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  document.querySelectorAll('.lang-toggle button').forEach(b => b.classList.toggle('active', b.getAttribute('data-lang') === LANG));
  document.documentElement.lang = LANG;
  document.title = t('app.title');
  const mm = document.getElementById('m-meal');
  if (mm) mm.querySelectorAll('option').forEach(o => { o.textContent = mealName(o.value); });
  ['reg-gender','p-gender'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.querySelectorAll('option').forEach(o => { if (o.value) o.textContent = genderName(o.value); });
  });
  document.querySelectorAll('.h-cond').forEach(c => {
    const lab = c.closest('label'); if (!lab) return;
    lab.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = ' ' + condName(c.value); });
  });
  if (typeof auth !== 'undefined' && auth) auth.languageCode = LANG;
}
async function refreshDynamic() {
  const keep = (document.getElementById('dateSel') && document.getElementById('dateSel').value) || null;
  await loadAll();
  if (keep) {
    const sel = document.getElementById('dateSel');
    if ([...sel.options].some(o => o.value === keep)) { sel.value = keep; render(keep); }
  }
}
function setLang(l) {
  LANG = (l === 'es') ? 'es' : 'en';
  try { localStorage.setItem('ronbo-nutri-lang', LANG); } catch (e) {}
  applyI18n();
  if (typeof auth !== 'undefined' && auth && auth.currentUser) {
    /* E2 (17/10/2026): re-render inmediato, con los datos YA en
       memoria, de los paneles que se pintan desde el estado local
       (privacidad y salud), para que todo el texto visible cambie
       de idioma al instante y no quede una mezcla mientras llega
       la red. refreshDynamic() sigue actualizando desde el
       servidor como siempre, y la reacción en vivo a cambios de
       permisos/consentimiento (H-C2) no se toca. */
    try { renderPrivacy(); } catch {}
    try { renderHealthPanel(); } catch {}
    try { renderEnergyPanel(); } catch {}
    try { renderPendings(); } catch {}
    try { renderProgress(); } catch {}
    try { aiOnLangChange(); } catch {}
    refreshDynamic();
  }
}

const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString(LANG === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 });
const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? 0 : n; };

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.className = 'toast', 2800);
}
/* Aviso honesto (2026-10-20, decisión de Ronald): los catch de las
   operaciones de acceso/consentimiento ya NO descartan el error.
   Se conserva err.code — solo en consola, para diagnóstico; nunca se
   muestran códigos internos en pantalla — y se presenta la causa en
   lenguaje accionable: permiso denegado ≠ sin conexión ≠ otro fallo. */
function errCauseKey(e) {
  const code = (e && e.code) || '';
  try { console.warn('[ronbo] operación fallida:', code || String((e && e.message) || e)); } catch {}
  if (code.includes('permission-denied')) return 'err.noPermission';
  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code.includes('network')) return 'err.noConnection';
  return 'err.genericFail';
}
function failToast(e) { toast(t(errCauseKey(e)), true); }
function showAuthError(msg) {
  const el = $('auth-error');
  el.textContent = msg;
  el.classList.remove('ok');
  el.classList.add('show');
}
/* Puerta con consentimiento retirado: la sesión se mantiene SOLO en la
   vista de acceso para ofrecer la renovación (las reglas siguen
   denegando todo dato a cuentas no aprobadas). Tras renovar — o si el
   consentimiento ya está vigente — se aplica la salida habitual. */
function showRenewalGate() {
  showAuthError(t('err.pending'));
  const box = $('renew-box'); if (!box) return;
  box.style.display = '';
  const n = $('renew-notice'); if (n) { n.style.display = 'none'; n.innerHTML = ''; }
  const ra = $('btn-gate-renew-accept'); if (ra) ra.style.display = 'none';
}
function dateName(iso) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = parseInt(m[3], 10), mi = parseInt(m[2], 10) - 1, y = m[1];
  return LANG === 'es' ? `${d} de ${MESES_ES[mi]} de ${y}` : `${MESES_EN[mi]} ${d}, ${y}`;
}
function shortDate(iso) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${parseInt(m[3],10)}/${parseInt(m[2],10)}` : iso;
}
function todayISO() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
}

function ageOn(dobISO, onISO) {
  const b = String(dobISO || '').split('-').map(Number), o = String(onISO || '').split('-').map(Number);
  if (b.length !== 3 || o.length !== 3 || b.some(isNaN) || o.some(isNaN)) return -1;
  let a = o[0] - b[0];
  if (o[1] < b[1] || (o[1] === b[1] && o[2] < b[2])) a--;
  return a;
}

/* ================= AUTH (multiusuario) ================= */
$('tab-login').onclick = () => {
  $('tab-login').classList.add('active'); $('tab-register').classList.remove('active');
  $('form-login').style.display = ''; $('form-register').style.display = 'none';
};
$('tab-register').onclick = () => {
  $('tab-register').classList.add('active'); $('tab-login').classList.remove('active');
  $('form-register').style.display = ''; $('form-login').style.display = 'none';
  loadTrainerDirectory();
};
/* Directorio de entrenadores para el registro: documento único
   trainer_directory/current { trainers: [{uid, name}] } que el
   administrador mantiene desde su panel (las reglas vigentes no
   dejan listar users sin ser propietario; el candidato de reglas
   del paquete de roles habilita su lectura para el registro y su
   escritura solo del administrador). Si no está disponible, el
   registro ofrece solo la espera de asignación. */
let REG_TRAINERS_LOADED = false;
async function loadTrainerDirectory() {
  if (REG_TRAINERS_LOADED) return;
  REG_TRAINERS_LOADED = true;
  try {
    const snap = await getDoc(doc(db, 'trainer_directory', 'current'));
    if (!snap.exists()) return;
    const list = (snap.data().trainers || []).filter(tr => tr && tr.uid);
    const sel = $('reg-trainer');
    if (!sel || !list.length) return;
    sel.innerHTML = `<option value="">${esc(t('roles.waitingOption'))}</option>`
      + list.map(tr => `<option value="${esc(tr.uid)}">${esc(tr.name || tr.uid)}</option>`).join('');
  } catch {}
}
function showRegError(msg) {
  const el = $('reg-error');
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
}
$('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  showRegError('');
  const name = $('reg-name').value.trim(), email = $('reg-email').value.trim(),
        pw = $('reg-password').value, pw2 = $('reg-password2').value;
  const phone = $('reg-phone').value.trim(), gender = $('reg-gender').value, social = $('reg-social').value.trim();
  if (!name) { showRegError(t('err.name')); return; }
  if (!phone) { showRegError(t('err.phone')); return; }
  if (!gender) { showRegError(t('err.gender')); return; }
  if (pw !== pw2) { showRegError(t('err.pwmatch')); return; }
  if (!$('reg-consent').checked) { showRegError(t('err.consent')); return; }
  const age = ageOn($('reg-dob').value, todayISO());
  if (!(age >= 18 && age <= 120)) { showRegError(t('err.underage')); return; }
  /* La declaración de salud NO se recoge en el registro (Decisión 1:
     es voluntaria y vive en el perfil, con su consentimiento
     específico independiente — usuarios/{uid}/healthDeclarations). */
  try {
    suppressAuthCheck = true;
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    /* A2: el registro es el primer acto de consentimiento — el
       documento nace en un lote con su recibo 'registered'
       (consentSeq = 1), como exigen las reglas r3. */
    /* Tres roles (2026-10-23): el registro nace 'usuario' y con la
       elección del formulario: entrenador elegido (assigned) o
       espera de asignación (waiting, bajo el administrador). El
       candidato de reglas del paquete valida estos campos al
       crear; con las reglas vivas el lote se denegaría (role
       'user'), así que app y candidato se despliegan juntos o no
       se despliega — orden: reglas primero (checkpoint aparte). */
    const trainerChoice = ($('reg-trainer') && $('reg-trainer').value) || '';
    const regBatch = writeBatch(db);
    regBatch.set(doc(db, 'users', cred.user.uid), {
      name, email, phone, gender, social: social || '',
      role: 'usuario', isOwner: false, approved: false,
      trainerUid: trainerChoice || null,
      assignmentStatus: trainerChoice ? 'assigned' : 'waiting',
      /* Sin goals al nacer (decisión de Ronald, 2026-10-20): las metas
         las fija el entrenador; la cuenta nueva no trae ninguna. */
      acceptedTerms: true, termsVersion: TERMS_VERSION, termsAcceptedAt: serverTimestamp(),
      adultConfirmed: true, adultConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      consentSeq: 1, consentReceiptId: cred.user.uid + '_1'
    });
    regBatch.set(receiptRef(cred.user.uid + '_1'),
      { uid: cred.user.uid, email, type: 'registered', version: TERMS_VERSION, at: serverTimestamp() });
    await regBatch.commit();
    await signOut(auth);
    suppressAuthCheck = false;
    showRegError('');
    /* UX10-2 (piloto, 2026-10-23): expectativas de aprobación EN LA
       PANTALLA, no solo el toast — qué pasa ahora, quién aprueba (el
       entrenador elegido o el administrador si quedó en espera), qué
       puede hacer mientras tanto (entrar en cuanto lo aprueben, sin
       ningún paso más) y NINGÚN plazo prometido: el texto dice
       expresamente que no se puede prometer un tiempo exacto. La
       tarjeta vive fuera de los formularios y sigue visible tras
       pasar a la pestaña de entrar. */
    const rw = $('reg-waiting');
    if (rw) {
      const selT = $('reg-trainer');
      const tName = (selT && selT.selectedIndex >= 0) ? (selT.options[selT.selectedIndex].textContent || '').trim() : '';
      rw.innerHTML = `<b>${esc(t('reg.waitTitle'))}</b>` +
        (trainerChoice ? esc(t('reg.waitTrainer', { name: tName || t('roles.chooseTrainer') })) : esc(t('reg.waitAdmin')));
      rw.style.display = '';
      try { rw.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }
    toast(t('msg.accountCreated'), false);
    $('tab-login').click();
  } catch (err) {
    suppressAuthCheck = false;
    const code = err.code || '';
    if (code.includes('permission-denied')) {
      /* Ventana de transición D→E: con las reglas anteriores el lote
         de registro se deniega atómicamente (no nace ningún dato).
         Se elimina la identidad recién creada para no dejar cuentas
         huérfanas y se informa del mantenimiento. */
      try { if (auth.currentUser) await deleteUser(auth.currentUser); } catch {}
      showRegError(t('sys.maintenance'));
      return;
    }
    showRegError(code.includes('email-already-in-use') ? t('err.emailInUse')
      : code.includes('weak-password') ? t('err.weakPw')
      : code.includes('invalid-email') ? t('err.badEmail')
      : t('err.createFail'));
  }
});
$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  showAuthError('');
  $('auth-error').classList.remove('show');
  try {
    await signInWithEmailAndPassword(auth, $('login-email').value.trim(), $('login-password').value);
  } catch {
    showAuthError(t('err.badCreds'));
  }
});
$('btn-logout').addEventListener('click', e => { e.preventDefault(); signOut(auth); });
$('link-forgot').addEventListener('click', async e => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  if (!email) { showAuthError(t('err.forgotNoEmail')); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    const ae = $('auth-error');
    ae.textContent = t('msg.resetSent');
    ae.classList.remove('err');
    ae.classList.add('show', 'ok');
    toast(t('msg.resetSent'), false);
  } catch (err) {
    const code = err.code || '';
    showAuthError(code.includes('invalid-email') ? t('err.badEmail')
      : t('err.resetFail'));
  }
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    stopUserDocWatch();
    $('auth-view').style.display = '';
    $('app-view').style.display = 'none';
    return;
  }
  if (suppressAuthCheck) return;
  UDATA = {};
  IS_OWNER = false;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) {
      /* Cierre veraz (A2): si existe el recibo de cierre, los
         datos ya se eliminaron en un intento anterior y solo
         falta borrar la identidad de Auth — se ofrece completar
         el cierre ahora (la sesión es reciente). */
      try {
        const rc = await getDoc(receiptRef(user.uid));
        if (rc.exists() && rc.data().type === 'account-closed') {
          if (confirm(t('priv.finishCloseAsk'))) {
            try { await deleteUser(user); toast(t('priv.deleted')); }
            catch { toast(t('priv.deleteFail'), true); }
          } else {
            toast(t('priv.dataDeletedFinish'), true);
          }
          await signOut(auth);
          return;
        }
      } catch {}
      await signOut(auth);
      showAuthError(t('err.noAccess'));
      return;
    }
    UDATA = snap.data();
    IS_OWNER = UDATA.isOwner === true;
    ROLE = deriveRole(UDATA, IS_OWNER);
    if (!IS_OWNER && UDATA.approved !== true) {
      if (!consentIsActive(UDATA)) { showRenewalGate(); return; }
      await signOut(auth);
      showAuthError(t('err.pending'));
      return;
    }
    GOALS = { ...(UDATA.goals || {}) }; // sin goals en el doc = sin metas (no hay repliegue a valores de la casa)
  } catch (e) {
    await signOut(auth);
    showAuthError(t(errCauseKey(e)));
    return;
  }
  $('who').textContent = UDATA.name ? UDATA.name : user.email;
  setAvatar(UDATA.photoURL || '');
  $('auth-view').style.display = 'none';
  $('app-view').style.display = '';
  $('main-tabs').style.display = ROLE === 'usuario' ? 'none' : '';
  const accTabBtn = document.querySelector('.main-tab[data-tab="access"]');
  if (accTabBtn) accTabBtn.style.display = ROLE === 'administrador' ? '' : 'none';
  switchTab('track');
  await loadAll();
  startUserDocWatch(user.uid);
});

/* ================= REACCIÓN EN VIVO DE LA SESIÓN (H-C2) =================
   Hallazgo H-C2: la app cargaba el documento del usuario UNA sola
   vez al iniciar sesión, así que una revocación de la aprobación o
   una retirada del consentimiento hechas desde OTRA sesión (u otro
   dispositivo) no afectaban a la sesión ya abierta hasta recargar.
   Ahora la sesión se suscribe a su propio documento y reevalúa el
   acceso con los campos que REALMENTE gobiernan cada estado:
     - isOwner: el propietario deriva su acceso de isOwner (como en
       la puerta de entrada) y NUNCA queda bloqueado por
       approved:false ni por el estado de su consentimiento.
     - approved (solo clientes): si pasa a false con el
       consentimiento general vigente → se cierra la sesión
       (pendiente de aprobación), igual que al iniciar sesión.
     - consentimiento general (acceptedTerms y la relación
       termsAcceptedAt/consentWithdrawnAt que evalúa
       consentIsActive): si deja de estar vigente → puerta de
       renovación, igual que al iniciar sesión.
   ALCANCE: esta suscripción corrige la reacción de la INTERFAZ.
   No cambia ningún permiso de las reglas: las reglas siguen
   evaluando cada petición por sí mismas, y las colecciones
   propias de un cliente se rigen por propiedad (uid) — un cliente
   revocado que llamara a la API directamente, fuera de esta
   interfaz, conservaría sobre sus propios datos la capacidad que
   las reglas le den; eso forma parte del diseño aprobado de las
   reglas y NO se presenta como eliminado por esta corrección. */
let userWatchUnsub = null;
let userWatchClass = null;
function sessionAccessClass(u) {
  if (!u) return 'none';
  if (u.isOwner === true) return 'owner';
  if (u.approved !== true) return consentIsActive(u) ? 'unapproved' : 'gate';
  return consentIsActive(u) ? 'client' : 'gate';
}
function startUserDocWatch(uid) {
  stopUserDocWatch();
  userWatchClass = sessionAccessClass(UDATA);
  userWatchUnsub = onSnapshot(doc(db, 'users', uid), snap => {
    if (!snap.exists()) return;
    const fresh = snap.data();
    const newClass = sessionAccessClass(fresh);
    UDATA = fresh;
    IS_OWNER = fresh.isOwner === true;
    if (newClass === userWatchClass) { renderPrivacy(); return; }
    userWatchClass = newClass;
    if (newClass === 'owner' || newClass === 'client') { renderPrivacy(); return; }
    /* La sesión pierde su clase de acceso: reacciona igual que
       en la puerta de entrada. */
    stopUserDocWatch();
    if (newClass === 'gate') {
      $('app-view').style.display = 'none';
      $('auth-view').style.display = '';
      showRenewalGate();
    } else { /* 'unapproved': aprobación retirada, consentimiento vigente */
      signOut(auth);
      showAuthError(t('err.pending'));
    }
  }, () => {});
}
function stopUserDocWatch() {
  if (userWatchUnsub) { try { userWatchUnsub(); } catch {} userWatchUnsub = null; }
  userWatchClass = null;
}

/* ================= ADMIN DE ACCESOS (solo dueño) ================= */
let ADMIN_USERS = [];
async function loadAdmin() {
  const sec = $('admin-section');
  if (!IS_OWNER) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  let users = [];
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach(d => users.push({ id: d.id, ...d.data() }));
  } catch { users = []; }
  ADMIN_USERS = users;
  const pending = users.filter(u => !u.isOwner && u.approved !== true);
  const active = users.filter(u => !u.isOwner && u.approved === true);
  const owners = users.filter(u => u.isOwner);
  $('pending-count').textContent = pending.length;
  $('pending-list').innerHTML = pending.length ? pending.map(u => `
    <div class="user-row">
      <div>${u.photoURL ? `<img class="avatar sm" src="${esc(u.photoURL)}" alt="">` : ''}<b>${esc(u.name || '—')}</b><br><span class="muted">${esc(u.email || '')}</span></div>
      <div class="user-actions">
        <button class="btn-primary btn-sm" data-approve="${u.id}">${t('admin.approve')}</button>
        <button class="btn-ghost btn-sm" data-reject="${u.id}">${t('admin.reject')}</button>
      </div>
    </div>`).join('') : `<div class="wempty">${t('admin.noPending')}</div>`;
  $('users-list').innerHTML =
    owners.map(u => `
    <div class="user-row"><div>${u.photoURL ? `<img class="avatar sm" src="${esc(u.photoURL)}" alt="">` : ''}<b>${esc(u.name || '—')}</b> <span class="owner-badge">${t('admin.owner')}</span><br><span class="muted">${esc(u.email || '')}</span></div>
    <div class="user-actions"><button class="btn-ghost btn-sm" data-profile="${u.id}">${t('admin.profile')}</button><button class="btn-ghost btn-sm" data-goals="${u.id}">${t('admin.goals')}</button></div></div>`).join('')
    + (active.length ? active.map(u => `
    <div class="user-row">
      <div>${u.photoURL ? `<img class="avatar sm" src="${esc(u.photoURL)}" alt="">` : ''}<b>${esc(u.name || '—')}</b><br><span class="muted">${esc(u.email || '')}</span></div>
      <div class="user-actions">
        <label class="muted">${t('roles.roleLabel')} <select data-role-for="${u.id}">${['usuario', 'entrenador'].map(r => `<option value="${r}"${(u.role === 'entrenador' ? 'entrenador' : 'usuario') === r ? ' selected' : ''}>${t('roles.' + r)}</option>`).join('')}</select></label>
        <button class="btn-ghost btn-sm" data-profile="${u.id}">${t('admin.profile')}</button>
        <button class="btn-ghost btn-sm" data-goals="${u.id}">${t('admin.goals')}</button>
        <button class="btn-ghost btn-sm" data-revoke="${u.id}">${t('admin.revoke')}</button>
      </div>
    </div>`).join('') : `<div class="wempty">${t('admin.noUsers')}</div>`);
  /* Roles: SOLO el administrador asigna o cambia el campo role
     (esta superficie entera ya es solo suya). */
  document.querySelectorAll('[data-role-for]').forEach(sel => sel.onchange = async () => {
    if (ROLE !== 'administrador') return;
    await setDoc(doc(db, 'users', sel.dataset.roleFor), { role: sel.value }, { merge: true });
    toast(t('roles.roleSaved'));
    await loadAdmin();
  });
  const dirBox = $('trainer-dir-box');
  if (dirBox) {
    dirBox.innerHTML = `<div class="eval-actions"><button type="button" class="btn-ghost btn-sm" id="btn-dir-update">${t('roles.dirUpdate')}</button></div>`;
    $('btn-dir-update').onclick = async () => {
      const trainers = ADMIN_USERS.filter(u => u.isOwner || u.role === 'entrenador')
        .map(u => ({ uid: u.id, name: u.name || u.email || u.id }));
      await setDoc(doc(db, 'trainer_directory', 'current'), { trainers, updatedAt: serverTimestamp() });
      toast(t('roles.dirUpdated'));
    };
  }
  /* N-07 (decisión de Ronald, 2026-10-23 19:39): el límite de
     aprobaciones por entrenador vive en app_settings/approvals y
     SOLO el administrador lo escribe (esta superficie ya es solo
     suya; el candidato de reglas lo exige). Sin límite fijado, el
     entrenador no puede aprobar (fail-closed en las reglas). */
  const apprBox = $('approvals-limit-box');
  if (apprBox) {
    (async () => {
      let lim = null;
      try { const s = await getDoc(doc(db, 'app_settings', 'approvals')); if (s.exists() && isFinite(Number(s.data().maxPerTrainer))) lim = Number(s.data().maxPerTrainer); } catch {}
      const trainers = ADMIN_USERS.filter(u => !u.isOwner && u.role === 'entrenador');
      apprBox.innerHTML = `
        <div class="user-row">
          <div><label class="muted">${t('appr.limitLabel')} <input type="number" id="appr-limit-input" min="0" step="1" value="${lim === null ? '' : lim}" style="width:90px"></label>
          ${lim === null ? `<br><span class="muted">${t('appr.noLimitSet')}</span>` : ''}</div>
          <div class="user-actions"><button class="btn-primary btn-sm" id="appr-limit-save">${t('form.save')}</button></div>
        </div>`
        + trainers.map(u => `<div class="user-row"><div><b>${esc(u.name || u.email || u.id)}</b></div><div class="user-actions"><span class="muted">${t('appr.usedOf', { used: Number(u.approvalsUsed) || 0, limit: lim === null ? '—' : lim })}</span></div></div>`).join('');
      const saveBtn = $('appr-limit-save');
      if (saveBtn) saveBtn.onclick = async () => {
        const v = parseInt(($('appr-limit-input') || {}).value, 10);
        if (!isFinite(v) || v < 0) { toast(t('appr.error')); return; }
        try {
          await setDoc(doc(db, 'app_settings', 'approvals'), { maxPerTrainer: v, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
          toast(t('appr.saved'));
          await loadAdmin();
        } catch { toast(t('appr.error')); }
      };
    })();
  }
  document.querySelectorAll('[data-goals]').forEach(b => b.onclick = () => {
    const u = ADMIN_USERS.find(x => x.id === b.dataset.goals);
    if (u) openGoals(u.id, u.name || u.email, u.goals);
  });
  document.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => openProfile(b.dataset.profile));
  document.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    await setDoc(doc(db, 'users', b.dataset.approve), { approved: true }, { merge: true });
    toast(t('msg.approved')); await loadAdmin();
  });
  document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
    if (!confirm(t('confirm.revoke'))) return;
    await setDoc(doc(db, 'users', b.dataset.revoke), { approved: false }, { merge: true });
    toast(t('msg.revoked')); await loadAdmin();
  });
  document.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
    if (!confirm(t('confirm.reject'))) return;
    await deleteDoc(doc(db, 'users', b.dataset.reject));
    toast(t('msg.rejected')); await loadAdmin();
  });
  /* Los límites se cargan SOLO con la pestaña de acceso en pantalla:
     loadAll() también llama a loadAdmin() al arrancar (con «track»
     visible) y el panel no debe disparar llamadas al Worker en frío. */
  const tabAccess = $('tab-access');
  if (tabAccess && tabAccess.style.display !== 'none') { loadLimits(); loadAccessLog(); }
}

/* ============ LÍMITES DE ANÁLISIS (solo dueño; Worker /admin/limits) ============
   Etapa 2026-10-19 (decisión de Ronald): SOLO el administrador fija los
   límites diarios de análisis de IA — el global, el de cada entrenador y
   el de cada usuario — y viven en el KV del Worker, no en Firestore.
   Resolución en el Worker: límite propio del usuario -> el de SU
   entrenador -> el global -> sin límite. Esta sección solo se pinta
   dentro de «Administración de accesos» (superficie ya exclusiva del
   dueño) y solo se carga si IS_OWNER. */
let LIMITS_STATE = null;
async function limitsCall(method, body) {
  const ep = aiEndpoint();
  if (!ep) throw new Error('ai-off');
  const idToken = await auth.currentUser.getIdToken();
  const r = method === 'GET'
    ? await fetch(ep + '/admin/limits', { headers: { Authorization: 'Bearer ' + idToken } })
    : await fetch(ep + '/admin/limits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, idToken }) });
  if (!r.ok) throw new Error('limits-' + r.status);
  return r.json();
}

/* El mapeo cliente->entrenador se deriva SOLO de datos ciertos de la
   propia app: los planes de entrenamiento guardan clientUid y createdBy
   (el entrenador que creó el plan). Al abrir el panel se registran en el
   Worker los mapeos que falten o difieran; nada se inventa. */
async function syncLimitMappings(state) {
  try {
    const snap = await getDocs(collection(db, 'training_plans'));
    const pairs = {};
    snap.forEach(d => { const v = d.data();
      /* VERSIONADO (§6.4): las instantáneas no alimentan el mapeo
         de límites — solo cuentan los planes vivos. */
      if (v.isSnapshot === true) return;
      if (v.clientUid && v.createdBy && v.clientUid !== v.createdBy) pairs[v.clientUid] = v.createdBy; });
    let changed = false;
    for (const [uid, tr] of Object.entries(pairs)) {
      if ((state.mappings || {})[uid] !== tr) {
        LIMITS_STATE = await limitsCall('POST', { nivel: 'mapeo', uid, entrenador: tr });
        changed = true;
      }
    }
    return changed;
  } catch { return false; }
}

async function loadLimits() {
  const box = $('limits-box');
  if (!box || !IS_OWNER) return;
  try {
    LIMITS_STATE = await limitsCall('GET');
    if (await syncLimitMappings(LIMITS_STATE)) LIMITS_STATE = await limitsCall('GET');
    renderLimits();
  } catch { box.innerHTML = `<div class="wempty">${t('limits.error')}</div>`; }
}

function limitRowHTML(nivel, uid, title, sub, isOwnerRow) {
  const st = LIMITS_STATE || {};
  const cur = nivel === 'global' ? st.global
    : nivel === 'entrenador' ? (st.trainers || {})[uid]
    : (st.users || {})[uid];
  const usage = uid ? (st.usage || {})[uid] : null;
  const key = nivel === 'global' ? 'global' : uid;
  return `<div class="user-row">
    <div><b>${esc(title)}</b>${isOwnerRow ? ` <span class="owner-badge">${t('admin.owner')}</span>` : ''}<br><span class="muted">${esc(sub || '')}</span>${usage != null ? `<br><span class="muted">${t('limits.usageToday', { n: usage })}</span>` : ''}</div>
    <div class="user-actions limits-actions">
      <input type="number" class="limits-input" id="lim-in-${key}" min="0" step="1" inputmode="numeric" value="${cur == null ? '' : cur}" placeholder="∞" ${cur == null ? 'disabled' : ''}>
      <span class="muted">${t('limits.perDay')}</span>
      <label class="limits-nolimit"><input type="checkbox" id="lim-nl-${key}" ${cur == null ? 'checked' : ''}> ${t('limits.noLimit')}</label>
      <button class="btn-primary btn-sm" data-limsave="${nivel}" data-limuid="${uid || ''}">${t('limits.save')}</button>
    </div>
  </div>`;
}

function renderLimits() {
  const box = $('limits-box');
  if (!box || !LIMITS_STATE) return;
  const trainers = ADMIN_USERS.filter(u => u.isOwner);
  const users = ADMIN_USERS.filter(u => !u.isOwner && u.approved === true);
  box.innerHTML =
    limitRowHTML('global', '', t('limits.global'), '', false)
    + `<h3 class="history-title">${t('limits.trainers')}</h3>`
    + (trainers.length ? trainers.map(u => limitRowHTML('entrenador', u.id, u.name || '—', u.email || '', true)).join('') : `<div class="wempty">${t('admin.noUsers')}</div>`)
    + `<h3 class="history-title">${t('limits.users')}</h3>`
    + (users.length ? users.map(u => limitRowHTML('usuario', u.id, u.name || '—', u.email || '', false)).join('') : `<div class="wempty">${t('admin.noUsers')}</div>`);
  box.querySelectorAll('[data-limsave]').forEach(b => b.onclick = () => saveLimit(b));
  box.querySelectorAll('.limits-nolimit input[type="checkbox"]').forEach(c => c.onchange = () => {
    const key = c.id.replace('lim-nl-', '');
    const inp = $('lim-in-' + key);
    if (inp) { inp.disabled = c.checked; if (c.checked) inp.value = ''; }
  });
}

async function saveLimit(btn) {
  const nivel = btn.dataset.limsave, uid = btn.dataset.limuid || '';
  const key = nivel === 'global' ? 'global' : uid;
  const nl = $('lim-nl-' + key), inp = $('lim-in-' + key);
  let limite = null;
  if (nl && !nl.checked) {
    const raw = (inp && inp.value || '').trim();
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) { toast(t('limits.invalid')); return; }
      limite = n;
    }
  }
  btn.disabled = true;
  try {
    LIMITS_STATE = await limitsCall('POST', nivel === 'global' ? { nivel, limite } : { nivel, uid, limite });
    toast(t('limits.saved'));
    renderLimits();
  } catch { toast(t('limits.error')); btn.disabled = false; }
}

/* ================= MIS CLIENTES (entrenador: ve y edita el peso semanal) ================= */
async function loadClients() {
  const sec = $('clients-section');
  if (ROLE === 'usuario') { sec.style.display = 'none'; return; }
  sec.style.display = '';
  let users = [];
  try {
    /* El entrenador SOLO lista a sus asignados (consulta acotada por
       trainerUid — las reglas por documento no actúan de filtro:
       un listado sin acotar se denegaría entero); el administrador
       lista a todos. */
    const snap = ROLE === 'entrenador'
      ? await getDocs(query(collection(db, 'users'), where('trainerUid', '==', auth.currentUser.uid)))
      : await getDocs(collection(db, 'users'));
    snap.forEach(d => users.push({ id: d.id, ...d.data() }));
  } catch { users = []; }
  /* Alcance por rol: el administrador ve a todos; el entrenador,
     SOLO a sus clientes asignados (trainerUid == su uid). Los de
     en espera NO son del entrenador hasta que se le asignen. */
  const clients = users.filter(u => !u.isOwner && (ROLE === 'administrador' || u.trainerUid === auth.currentUser.uid));
  renderWaitingTray(users);
  renderApprovalsTray(users);
  let weights = [];
  try {
    const clientIds = clients.map(u => u.id);
    const ws = (ROLE === 'entrenador' && clientIds.length)
      ? await getDocs(query(collection(db, 'nutrition_weight'), where('ownerUid', 'in', clientIds.slice(0, 30))))
      : await getDocs(collection(db, 'nutrition_weight'));
    ws.forEach(d => { const v = d.data();
      if (v.ownerUid && num(v.weight) > 0) weights.push({ uid: v.ownerUid, date: v.date, weight: num(v.weight) }); });
  } catch {}
  const lastByUid = {}, lastWByUid = {};
  weights.forEach(w => { if (!lastByUid[w.uid] || w.date > lastByUid[w.uid]) { lastByUid[w.uid] = w.date; lastWByUid[w.uid] = w.weight; } });
  let pendingFood = {};
  try {
    const clientIds2 = clients.map(u => u.id);
    const fs = (ROLE === 'entrenador' && clientIds2.length)
      ? await getDocs(query(collection(db, 'meal_help'), where('ownerUid', 'in', clientIds2.slice(0, 30))))
      : await getDocs(collection(db, 'meal_help'));
    fs.forEach(d => { const v = d.data();
      if (v.status === 'pending' && v.ownerUid) pendingFood[v.ownerUid] = (pendingFood[v.ownerUid] || 0) + 1; });
  } catch {}
  const daysAgo = iso => iso ? Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5) : null;
  $('clients-list').innerHTML = clients.length ? clients.map(u => {
    const d = daysAgo(lastByUid[u.id]);
    const hasHealth = false; // la salud ya no vive en users/{uid}: la insignia no puede saberlo desde el listado
    const badge = u.approved === true
      ? (d === null ? `<span class="warn-badge">${t('clients.noWeighins')}</span>`
        : d > 7 ? `<span class="warn-badge">${t('clients.daysAgo', { d })}</span>` : `<span class="ok-badge">${t('clients.daysAgoShort', { d })}</span>`)
      : `<span class="warn-badge">${t('clients.pending')}</span>`;
    const healthBadge = hasHealth ? ` <span class="warn-badge" title="${t('clients.healthTitle')}">🏥 ${t('clients.healthBadge')}</span>` : '';
    const foodBadge = pendingFood[u.id] ? ` <span class="warn-badge" title="${t('clients.foodTitle')}">📷 ${pendingFood[u.id]}</span>` : '';
    const lastW = lastWByUid[u.id] ? ` · <b>${lastWByUid[u.id]} kg</b>` : '';
    return `<div class="user-row">
      <div>${u.photoURL ? `<img class="avatar sm" src="${esc(u.photoURL)}" alt="">` : ''}<b>${esc(u.name || '—')}</b> ${badge}${healthBadge}${foodBadge}<br><span class="muted">${esc(u.email || '')}${u.phone ? ' · ' + esc(u.phone) : ''}${lastW}</span></div>
      <div class="user-actions">${u.approved === true ? `<button class="btn-primary btn-sm" data-client="${u.id}">${t('clients.view')}</button>` : ''}</div>
    </div>`;
  }).join('') : `<div class="wempty">${t('clients.empty')}</div>`;
  $('client-detail').style.display = 'none'; $('client-detail').innerHTML = '';
  document.querySelectorAll('[data-client]').forEach(b => b.onclick = () => openClient(b.dataset.client));
}
/* Bandeja de espera (SOLO administrador): clientes aprobados con
   assignmentStatus 'waiting'. Asignar escribe trainerUid +
   assignmentStatus 'assigned' en su documento (la rama de update
   del propietario en las reglas vigentes ya lo permite). */
function renderWaitingTray(users) {
  const box = $('waiting-box'); if (!box) return;
  if (ROLE !== 'administrador') { box.style.display = 'none'; box.innerHTML = ''; return; }
  const waiting = (users || []).filter(u => !u.isOwner && u.approved === true && u.assignmentStatus === 'waiting');
  const trainers = (users || []).filter(u => u.isOwner || u.role === 'entrenador');
  box.style.display = '';
  box.innerHTML = `<h3 class="history-title">${t('roles.waitingTitle')} (${waiting.length})</h3>
    <p class="progress-hint">${t('roles.waitingHint')}</p>`
    + (waiting.length ? waiting.map(u => `
    <div class="user-row">
      <div><b>${esc(u.name || '—')}</b><br><span class="muted">${esc(u.email || '')}</span></div>
      <div class="user-actions">
        <select id="assign-sel-${u.id}">${trainers.map(tr => `<option value="${tr.id}">${esc(tr.name || tr.email || tr.id)}</option>`).join('')}</select>
        <button class="btn-primary btn-sm" data-assign="${u.id}">${t('roles.assign')}</button>
      </div>
    </div>`).join('') : `<div class="wempty">${t('roles.noWaiting')}</div>`);
  box.querySelectorAll('[data-assign]').forEach(b => b.onclick = async () => {
    const sel = $('assign-sel-' + b.dataset.assign);
    if (!sel || !sel.value) return;
    await setDoc(doc(db, 'users', b.dataset.assign), { trainerUid: sel.value, assignmentStatus: 'assigned' }, { merge: true });
    toast(t('roles.assigned'));
    await loadClients();
  });
}

/* N-07 (decisión de Ronald, 2026-10-23 19:39): bandeja de cuentas
   NUEVAS del entrenador — sin aprobar, en espera de asignación o
   asignadas a él desde el registro. Aprobar (solo dentro del cupo
   que fija el administrador en app_settings/approvals) asigna la
   cuenta AL APROBADOR en un solo lote atómico con su contador
   approvalsUsed +1, como verifica el candidato de reglas. Sin
   límite fijado, la bandeja informa y los botones nacen
   deshabilitados (fail-closed, igual que las reglas). El
   administrador NO usa esta bandeja: la suya (Acceso) no tiene
   límite ni contador. */
async function renderApprovalsTray(myUsers) {
  const box = $('approvals-box'); if (!box) return;
  if (ROLE !== 'entrenador') { box.style.display = 'none'; box.innerHTML = ''; return; }
  const me = auth.currentUser.uid;
  let limit = null;
  try { const s = await getDoc(doc(db, 'app_settings', 'approvals')); if (s.exists() && isFinite(Number(s.data().maxPerTrainer))) limit = Number(s.data().maxPerTrainer); } catch {}
  let myUsed = isFinite(Number(UDATA && UDATA.approvalsUsed)) ? Number(UDATA.approvalsUsed) : 0;
  try { const mine = await getDoc(doc(db, 'users', me)); if (mine.exists() && isFinite(Number(mine.data().approvalsUsed))) myUsed = Number(mine.data().approvalsUsed); } catch {}
  let waiting = [];
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('assignmentStatus', '==', 'waiting'), where('approved', '==', false)));
    snap.forEach(d => waiting.push({ id: d.id, ...d.data() }));
  } catch {}
  const minePending = (myUsers || []).filter(u => !u.isOwner && u.approved !== true && u.trainerUid === me);
  const seen = new Set(); const pend = [];
  [...minePending, ...waiting.filter(u => !u.isOwner && u.approved !== true)].forEach(u => { if (!seen.has(u.id)) { seen.add(u.id); pend.push(u); } });
  const canApprove = limit !== null && myUsed < limit;
  box.style.display = '';
  box.innerHTML = `<h3 class="history-title">${t('appr.trayTitle')} (${pend.length})</h3>
    <p class="progress-hint">${t('appr.trayHint')}</p>
    <p class="progress-hint">${limit === null ? t('appr.noLimit') : (canApprove ? t('appr.usedOf', { used: myUsed, limit }) : t('appr.exhausted'))}</p>`
    + (pend.length ? pend.map(u => `
    <div class="user-row">
      <div><b>${esc(u.name || '—')}</b><br><span class="muted">${esc(u.email || '')}</span></div>
      <div class="user-actions"><button class="btn-primary btn-sm" data-trainer-approve="${u.id}"${canApprove ? '' : ' disabled'}>${t('admin.approve')}</button></div>
    </div>`).join('') : `<div class="wempty">${t('appr.none')}</div>`);
  box.querySelectorAll('[data-trainer-approve]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', b.dataset.trainerApprove),
        { approved: true, trainerUid: me, assignmentStatus: 'assigned', approvedBy: me, approvedAt: serverTimestamp() });
      batch.update(doc(db, 'users', me), { approvalsUsed: myUsed + 1 });
      await batch.commit();
      if (UDATA) UDATA.approvalsUsed = myUsed + 1;
      toast(t('appr.done'));
      await loadClients();
    } catch { toast(t('appr.error')); b.disabled = false; }
  });
}

/* ================= F-B3 · REFERENCIA DE PROTEÍNA B-1 (Etapa 1, desarrollo) =================
   Referencia educativa SOLO de lectura para el entrenador, en su espacio
   («Mis clientes» → ficha del cliente). Lee el último peso de la serie
   ÚNICA nutrition_weight (ya cargada por openClient) y muestra el rango
   B-1 aprobado: 1.4–2.0 g/kg/día (ISSN 2017, Jäger et al., DOI
   10.1186/s12970-017-0177-8). NO escribe nada: jamás toca
   users/{uid}.goals, no crea campos ni colecciones. Sin peso no hay
   referencia (nunca un número inventado). */
const FB3_STALE_DAYS = 30; // PROPUESTA de diseño: aviso de desactualización del pesaje
function fb3ProteinHTML(weights) {
  const last = weights && weights.length ? weights[weights.length - 1] : null;
  const head = `<div class="fb3-head"><h3 class="history-title" style="margin:0">${t('fb3.title')}</h3>
    <button type="button" class="fb3-helpbtn" id="fb3-help-btn" aria-expanded="false" title="${t('fb3.helpBtn')}">?</button></div>`;
  const help = `<div class="fb3-pop" id="fb3-help" style="display:none">${t('fb3.help')}</div>`;
  if (!last) return `<div class="fb3-card">${head}<div class="wempty">${t('fb3.noweight')}</div>${help}</div>`;
  const lo = Math.round(last.weight * 1.4), hi = Math.round(last.weight * 2.0);
  const days = Math.floor((Date.now() - new Date(last.date + 'T12:00:00').getTime()) / 864e5);
  return `<div class="fb3-card">${head}
    <div class="fb3-range">${t('fb3.range', { lo, hi })}</div>
    <div class="muted">${t('fb3.basis', { w: last.weight, date: dateName(last.date) })}</div>
    <div class="muted">${t('fb3.perkg')}</div>
    ${days > FB3_STALE_DAYS ? `<div class="fb3-stale">${t('fb3.stale', { d: days })}</div>` : ''}
    <div class="muted">${t('fb3.nogoals')}</div>${help}</div>`;
}

/* ================= F-A1/F-A2 · CÁLCULO ENERGÉTICO (Etapa 2, desarrollo) =================
   Motor de cálculo energético del entrenador (diseño aprobado por
   Ronald el 2026-10-20 01:49, tras ver la maqueta; Etapa 1 §3):
   - N-01: SIN ecuación por defecto. La elección la hace el
     entrenador por cliente, persiste y todo resultado la muestra.
     Única habilitada en v1: Mifflin-St Jeor (verificada contra la
     fuente primaria). Harris-Benedict revisada y Ten Haaf quedan
     «pendiente de verificación» y NO se pueden elegir.
   - La variable de sexo para el cálculo vive SOLO en
     users/{uid}/energyPrivate/sex (la lee únicamente el propio
     cliente; NUNCA se infiere de 'gender'). «Sin dato, sin
     cálculo». El entrenador ve la señal sexDataProvided (sí/no) y
     los RESULTADOS; nunca el valor DIRECTAMENTE — pero la
     constante aplicada es inferible de las entradas y el
     resultado (la ecuación es pública), y los textos al cliente
     lo dicen fielmente desde la corrección C-4 (revisión Santi
     2026-10-20). Matriz C-03.
   - El cálculo se ejecuta en la sesión del PROPIO cliente (su
     dispositivo sí puede leer su dato privado) y escribe solo el
     bloque de resultado + snapshot hist_* inmutable, exactamente
     lo que el candidato de reglas F-A1 v2 permite (la app y las
     reglas cuentan la misma historia). REGLAS: este código solo
     funciona en producción cuando Ronald publique el candidato
     (hasta entonces Firestore deniega estas rutas por defecto).
   - palBasal (A-3): 1,40–2,00 normal; 1,20–1,39 banda de
     excepción con advertencia y confirmación expresa registrada;
     <1,20 o >2,00 rechazados en la interfaz Y en las reglas. Los
     6 niveles de actividad son contexto descriptivo SIN números.
     La GUÍA junto al campo palBasal es descriptiva: explica qué
     cubre el multiplicador, NO rellena el campo, NO preselecciona
     y NO cambia validación ni datos. (La tabla numérica por
     categoría desplegada el 2026-10-20 se RETIRÓ con la
     corrección C-2 de la revisión Santi: asignaba por categoría
     los factores clásicos, que sí incluyen ejercicio, y por
     tanto contradecía el criterio A-3/palBasal aprobado.)
   - CORRECCIONES C-1…C-7 (revisión Santi 2026-10-20, desarrollo
     SIN publicar; matriz en MATRIZ-C1-C7-2026-10-20.md): el
     resultado se nombra «gasto estimado sin ejercicio
     estructurado» (C-1: no existe módulo de gasto por sesión y
     ningún texto lo promete); vigencia del resultado — si las
     entradas cambian, se muestra «pendiente de recálculo» y si
     se retiró el dato, el resultado anterior NO se presenta
     como vigente (C-3); ayuda en dos niveles (C-5); la
     confirmación de excepción está vinculada AL VALOR: cambiar
     el multiplicador dentro de la banda desmarca la casilla y
     exige confirmación nueva (C-6); el cálculo REVALIDA rangos
     y datos obligatorios antes de escribir (C-7).
   - Ningún cálculo escribe jamás users/{uid}.goals: las metas
     siguen siendo manuales del entrenador (invariante N-01/F-B3). */
const FA_EQUATION_VERSION = 'mifflin-st-jeor@1.0'; // cadena fijada en la Etapa 2 (la maqueta mostraba «versión 1»)
const FA_PURPOSE_VERSION = 'v1-2026-10-20';
const FA_UNCERTAINTY = {
  es: 'La incertidumbre es propia del método de estimación; no es una garantía individual.',
  en: 'Uncertainty is inherent to the estimation method; it is not an individual guarantee'
};
let MY_ENERGY = { state: 'loading', sex: null };  // energyPrivate propio (solo el propio usuario)
let MY_ASMT = { state: 'loading', doc: null };     // assessment/current propio (config + resultado)
let FA_CALC_ERR = null;                            // C-7: causa de «no calculado» por datos inválidos ({key, params} o null)
let FA_CARD = { uid: null, asmt: null };           // estado de la ficha abierta (entrenador)
const faRound10 = n => Math.round(n / 10) * 10;    // mostrar a 10 kcal; precisión completa dentro (Doc. 2 §7)
const faFmtTs = ts => { try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(LANG === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch { return ''; } };
const faEqName = id => id === 'mifflin-st-jeor' ? t('fa.eqMifflin') : (id || '—');

/* ---------- Vista del entrenador: tarjeta en la ficha del cliente ---------- */
/* Vigencia del resultado (C-3): un resultado solo está VIGENTE si
   sus entradas (snapshot) coinciden con las entradas ACTUALES —
   peso y su fecha, talla, edad derivada del año de nacimiento,
   multiplicador, ecuación y su versión. Si algo cambió, el
   resultado es el ANTERIOR y se muestra «pendiente de recálculo»;
   el historial (hist_*) no se toca jamás desde aquí. */
function faResultStale(a, last) {
  const s = a && a.inputsSnapshot;
  if (!s) return true;
  if (!last) return true;
  const ageNow = a.birthYear ? new Date().getFullYear() - parseInt(a.birthYear, 10) : null;
  if (num(s.weightKg) !== num(last.weight) || s.weightDate !== last.date) return true;
  if (num(s.heightCm) !== num(a.heightCm)) return true;
  if (s.ageYears !== ageNow) return true;
  if (num(s.palBasal) !== num(a.palBasal)) return true;
  if (a.equationUsed !== a.equation) return true;
  if (a.equationVersion && a.equationVersion !== FA_EQUATION_VERSION) return true;
  return false;
}
function faCardHTML(uid, a, weights) {
  const last = weights && weights.length ? weights[weights.length - 1] : null;
  const head = `<div class="fb3-head"><h3 class="history-title" style="margin:0">${t('fa.title')}</h3>
    <button type="button" class="fb3-helpbtn" id="fa-help-btn" aria-expanded="false" title="${t('fa.helpBtn')}">?</button></div>`;
  const help = `<div class="fb3-pop" id="fa-help" style="display:none"><div class="fa-help-l1">${t('fa.help')}</div><button type="button" class="fa-help-more" id="fa-help-more" aria-expanded="false">${t('fa.helpMore')}</button><div class="fa-help-detail" id="fa-help-detail" style="display:none">${t('fa.helpDetail')}</div></div>`;
  const eqSel = !!a && a.equation === 'mifflin-st-jeor';
  const signal = !!a && a.sexDataProvided === true;
  const selbox = eqSel
    ? `<div class="fa-selbox"><span class="fa-val">${t('fa.eqMifflin')}</span><span class="fa-oktag">${t('fa.selected')}</span><span class="fa-chev">▾</span></div>`
    : `<div class="fa-selbox"><span class="fa-ph">${t('fa.noEquation')}</span><span class="fa-chev">▾</span></div>`;
  const opts = `
    <div class="fa-opt${eqSel ? ' sel' : ''}" data-fa-eq="mifflin-st-jeor" role="button" tabindex="0"><span class="fa-radio"></span><span class="fa-nm">${t('fa.eqMifflin')}</span><span class="tag-ok">${t('fa.available')}</span></div>
    <div class="fa-opt off"><span class="fa-radio"></span><span class="fa-nm">${t('fa.eqHB')}</span><span class="tag-off">${t('fa.unavailable')}</span></div>
    <div class="fa-opt off"><span class="fa-radio"></span><span class="fa-nm">${t('fa.eqTenHaaf')}</span><span class="tag-off">${t('fa.unavailable')}</span></div>`;
  const actOpts = [1, 2, 3, 4, 5, 6].map(n =>
    `<option value="${n}"${a && a.activityCategoryId === n ? ' selected' : ''}>${n}. ${t('fa.act' + n)}</option>`).join('');
  const palVal = a && a.palBasal != null ? String(a.palBasal) : '';
  const palBlock = `
    <label class="fa-flabel">${t('fa.palLabel')}</label>
    <p class="fa-rules">${t('fa.palRules')}</p>
    <div class="fa-palguide" id="fa-pal-guide">${t('fa.palGuide')}</div>
    <input type="text" inputmode="decimal" class="fa-pal-input" id="fa-pal" value="${esc(palVal)}" placeholder="${t('fa.palPlaceholder')}">
    <div class="fa-warn" id="fa-pal-warn" style="display:none"><b>${t('fa.palWarn')}</b><br>${t('fa.palWarnBody')}
      <label class="fa-confirm"><input type="checkbox" id="fa-pal-confirm"${a && a.palExceptionConfirmed === true ? ' checked' : ''}> <span>${t('fa.palConfirm')}</span></label></div>
    <div class="fa-errbox" id="fa-pal-err" style="display:none">${t('fa.palError')}</div>`;
  let resultBlock;
  const hasRes = a && typeof a.rmrKcal === 'number' && typeof a.tdeeKcal === 'number';
  if (hasRes && !signal) {
    /* C-3: se retiró el dato necesario — el resultado anterior
       NO se presenta como vigente; el historial se conserva. */
    resultBlock = `<div class="fa-empty"><b>${t('fa.noResult')}</b><span>${t('fa.missSex')}</span></div>
    <div class="fa-stale-note">${t('fa.stalePrev', { date: faFmtTs(a.computedAt) || '—' })}</div>`;
  } else if (hasRes) {
    const s = a.inputsSnapshot || {};
    const ver = String(a.equationVersion || '').split('@')[1] || (a.equationVersion || '');
    const stale = faResultStale(a, last);
    resultBlock = `${stale ? `<div class="fa-stale">${t('fa.staleBanner')}</div>` : ''}
    <div class="fa-results">
      <div class="fa-stat"><div class="l">${t('fa.rmr')}</div><div class="v">${fmt(faRound10(a.rmrKcal))}</div><div class="u">${t('fa.kcalDay')}</div></div>
      <div class="fa-stat"><div class="l">${t('fa.tdee')}</div><div class="v">${fmt(faRound10(a.tdeeKcal))}</div><div class="u">${t('fa.kcalDay')}</div></div>
    </div>
    <div class="fa-trace"><h4>${t('fa.traceTitle')}</h4>
      <div class="fa-trow"><span class="k">${t('fa.trEq')}</span><span class="v">${esc(t('fa.trEqVal', { name: faEqName(a.equationUsed), ver }))}</span></div>
      <div class="fa-trow"><span class="k">${t('fa.trInputs')}</span><span class="v">${esc(t('fa.trInputsVal', { w: s.weightKg ?? '—', h: s.heightCm ?? '—', age: s.ageYears ?? '—' }))}</span></div>
      <div class="fa-trow"><span class="k">${t('fa.trWeight')}</span><span class="v">${esc(t('fa.trWeightVal', { w: s.weightKg ?? '—', date: s.weightDate ? dateName(s.weightDate) : '—' }))}</span></div>
      <div class="fa-trow"><span class="k">${t('fa.trPal')}</span><span class="v">${s.palBasal ?? '—'}</span></div>
      <div class="fa-trow"><span class="k">${t('fa.trConst')}</span><span class="v"><b>${a.sexConstantApplied ? t('fa.trConstYes') : t('fa.trConstNo')}</b></span></div>
      <div class="fa-trow"><span class="k">${t('fa.trWhen')}</span><span class="v">${esc(t('fa.trWhenVal', { date: faFmtTs(a.computedAt), who: a.computedBy === uid ? t('fa.whoClient') : t('fa.whoTrainer') }))}</span></div>
      ${a.uncertaintyNote ? `<div class="fa-tnote">${esc(a.uncertaintyNote)}</div>` : ''}
    </div>`;
  } else {
    const reason = !eqSel ? t('fa.missEq')
      : !signal ? t('fa.missSex')
      : !(a && a.birthYear && num(a.heightCm) > 0 && num(a.palBasal) > 0 && last) ? t('fa.missData')
      : t('fa.missPending');
    resultBlock = `<div class="fa-empty"><b>${t('fa.noResult')}</b><span>${reason}</span></div>`;
  }
  return `<div class="fb3-card fa-card">${head}${help}
    <div class="fa-signal">${t('fa.provided', { v: signal ? t('fa.yes') : t('fa.no') })}</div>
    <label class="fa-flabel">${t('fa.equation')}</label>
    ${selbox}${opts}
    <div class="fa-divider"></div>
    <div class="fa-frow">
      <div><label class="fa-flabel">${t('fa.birthYear')}</label><input type="text" inputmode="numeric" id="fa-by" value="${a && a.birthYear ? a.birthYear : ''}" placeholder="1996"></div>
      <div><label class="fa-flabel">${t('fa.height')}</label><input type="text" inputmode="decimal" id="fa-h" value="${a && a.heightCm ? a.heightCm : ''}" placeholder="175"></div>
    </div>
    <div class="basis">${last ? t('fa.weightBasis', { w: last.weight, date: dateName(last.date) }) : t('fa.noWeight')}</div>
    <label class="fa-flabel">${t('fa.actLabel')}</label>
    <select id="fa-act" class="fa-select"><option value="">${t('fa.actNone')}</option>${actOpts}</select>
    ${palBlock}
    <div class="fa-btnrow"><button type="button" class="btn-primary btn-sm" id="fa-save">${t('fa.saveConfig')}</button></div>
    ${resultBlock}
  </div>`;
}
function faPalSync() {
  const inp = $('fa-pal'); if (!inp) return;
  const warn = $('fa-pal-warn'), err = $('fa-pal-err'), save = $('fa-save');
  const raw = inp.value.trim(); const v = num(raw);
  let state = 'normal';
  if (!raw) state = 'empty';
  else if (!(v >= 1.20 && v <= 2.00)) state = 'invalid';
  else if (v < 1.40) state = 'exception';
  if (warn) warn.style.display = state === 'exception' ? '' : 'none';
  if (err) err.style.display = state === 'invalid' ? '' : 'none';
  if (save) save.disabled = state === 'invalid';
  /* C-6: la confirmación de la banda de excepción está vinculada
     AL VALOR. Si el valor actual difiere del valor confirmado
     guardado, la casilla se desmarca: cambiar el multiplicador
     dentro de la banda exige una confirmación NUEVA para el
     valor nuevo — la aceptación anterior no se hereda en
     silencio. (Al abrir, valor == valor confirmado → la casilla
     conserva su estado registrado.) */
  const conf = $('fa-pal-confirm');
  if (conf && state === 'exception') {
    const a = FA_CARD.asmt;
    if (!(a && a.palExceptionConfirmed === true && num(a.palBasal) === v)) conf.checked = false;
  }
}
async function faSetEquation(uid) {
  try {
    await setDoc(doc(db, 'users', uid, 'assessment', 'current'),
      { equation: 'mifflin-st-jeor', equationChosenBy: auth.currentUser.uid, equationChosenAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid }, { merge: true });
    toast(t('fa.configSaved'));
    openClient(uid);
  } catch (e) { failToast(e); }
}
async function faSaveConfig(uid) {
  const byRaw = $('fa-by').value.trim(), hRaw = $('fa-h').value.trim(), palRaw = $('fa-pal').value.trim();
  const act = $('fa-act').value;
  const payload = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid };
  if (byRaw) {
    const by = parseInt(byRaw, 10), maxY = new Date().getFullYear() - 18;
    if (!Number.isInteger(by) || by < 1900 || by > maxY) { toast(t('fa.errBy', { max: maxY }), true); return; }
    payload.birthYear = by;
  }
  if (hRaw) {
    const h = num(hRaw);
    if (!(h >= 50 && h <= 250)) { toast(t('fa.errH'), true); return; }
    payload.heightCm = h; payload.heightOriginal = h; payload.heightUnitOriginal = 'cm';
  }
  if (act) payload.activityCategoryId = parseInt(act, 10);
  if (palRaw) {
    const p = num(palRaw);
    if (!(p >= 1.20 && p <= 2.00)) { toast(t('fa.errPal'), true); return; }
    if (p < 1.40 && !($('fa-pal-confirm') && $('fa-pal-confirm').checked)) { toast(t('fa.errConfirm'), true); return; }
    payload.palBasal = p;
    payload.palExceptionConfirmed = p < 1.40;
  }
  try {
    await setDoc(doc(db, 'users', uid, 'assessment', 'current'), payload, { merge: true });
    toast(t('fa.configSaved'));
    openClient(uid);
  } catch (e) { failToast(e); }
}

/* ---------- Vista del cliente: su espacio privado y su cálculo ---------- */
function renderEnergyPanel() {
  const box = $('energy-panel-body');
  if (!box || !auth.currentUser) return;
  if (MY_ENERGY.state === 'loading') { box.innerHTML = `<div class="wempty">${t('train.loading')}</div>`; return; }
  if (MY_ENERGY.state === 'error') { box.innerHTML = `<div class="wempty">${t('fa.loadError')}</div>`; return; }
  const sex = MY_ENERGY.sex;
  const cur = sex ? `<div class="fa-current">${t('fa.current', { v: t(sex === 'female' ? 'fa.female' : 'fa.male') })}</div>` : '';
  const d = MY_ASMT.doc;
  /* Vigencia en el propio panel (C-3): sin dato, el resultado
     anterior no se presenta como vigente; con entradas cambiadas,
     se muestra identificado como ANTERIOR / pendiente de
     recálculo. Con datos inválidos (C-7), la causa, sin resultado. */
  let own = '';
  if (d && typeof d.rmrKcal === 'number') {
    if (!sex) {
      own = `<div class="fa-stale-note">${t('fa.stalePrev', { date: faFmtTs(d.computedAt) || '—' })}</div>`;
    } else {
      const lastW = WEIGHTS && WEIGHTS.length ? WEIGHTS[WEIGHTS.length - 1] : null;
      own = `<div class="fa-ownres">${t('fa.myResult', { rmr: fmt(faRound10(d.rmrKcal)), tdee: fmt(faRound10(d.tdeeKcal)), u: t('fa.kcalDay'), eq: faEqName(d.equationUsed) })}</div>`
        + (faResultStale(d, lastW) ? `<div class="fa-stale">${t('fa.staleBanner')}</div>` : '');
    }
  } else if (FA_CALC_ERR && sex && d && d.equation === 'mifflin-st-jeor') {
    own = `<div class="fa-empty"><span>${t('fa.calcInvalid', { cause: t(FA_CALC_ERR.key, FA_CALC_ERR.params || {}) })}</span></div>`;
  }
  box.innerHTML = `<div class="fa-privcard">
    <h3 class="history-title" style="margin-top:0">${t('fa.sexTitle')}</h3>
    <p class="fa-sextext">${t('fa.sexBody')}</p>
    ${cur}
    <div class="fa-opts">
      <label class="fa-opt2"><input type="radio" name="fa-sex" value="female"${sex === 'female' ? ' checked' : ''}> <span>${t('fa.female')}</span></label>
      <label class="fa-opt2"><input type="radio" name="fa-sex" value="male"${sex === 'male' ? ' checked' : ''}> <span>${t('fa.male')}</span></label>
    </div>
    <div class="fa-btnrow">
      <button type="button" class="btn-primary btn-sm" id="fa-sex-save">${t('fa.save')}</button>
      ${sex ? `<button type="button" class="btn-ghost btn-sm fa-delbtn" id="fa-sex-del">${t('fa.delete')}</button>` : ''}
    </div>
    <div class="fa-locknote">🔒 ${t('fa.lockNote')}</div>
    ${own}
  </div>`;
  const sv = $('fa-sex-save'); if (sv) sv.onclick = saveMySex;
  const dl = $('fa-sex-del'); if (dl) dl.onclick = deleteMySex;
}
/* La señal «dato aportado: sí/no» vive en assessment/current y SOLO
   la escribe la sesión del propio cliente (así lo exige el
   candidato de reglas). Si el documento aún no existe (el
   entrenador no ha creado la ficha), no hay señal que escribir. */
async function faSyncSignal(uid) {
  const a = MY_ASMT.doc; if (!a) return;
  const want = !!MY_ENERGY.sex;
  if (a.sexDataProvided === want) return;
  try {
    await setDoc(doc(db, 'users', uid, 'assessment', 'current'), { sexDataProvided: want }, { merge: true });
    MY_ASMT.doc = { ...a, sexDataProvided: want };
  } catch {}
}
/* Revalidación EN el cálculo (C-7): los mismos rangos del
   formulario se comprueban otra vez aquí, sobre los datos YA
   guardados — el formulario no basta, porque el documento pudo
   llegar por otra vía (semillas, datos antiguos, escritura
   directa dentro de lo que las reglas admiten). Devuelve null
   si todo es válido o {key, params} con la causa. Rangos:
   año 1900..(año actual − 18) —la app es 18+—, talla 50–250 cm,
   palBasal 1,20–2,00 (la confirmación de la banda de excepción
   es un control del GUARDADO de la configuración —formulario y
   reglas— y no se vuelve a exigir aquí: los casos tabulados
   aprobados §3f incluyen valores de banda), peso válido > 0. */
function faCalcCheck(cfg, last) {
  const maxY = new Date().getFullYear() - 18;
  const by = parseInt(cfg && cfg.birthYear, 10);
  if (!Number.isInteger(by) || by < 1900 || by > maxY) return { key: 'fa.errBy', params: { max: maxY } };
  const h = num(cfg && cfg.heightCm);
  if (!(h >= 50 && h <= 250)) return { key: 'fa.errH', params: {} };
  const pal = num(cfg && cfg.palBasal);
  if (!(pal >= 1.20 && pal <= 2.00)) return { key: 'fa.errPal', params: {} };
  if (!last || !(num(last.weight) > 0) || num(last.weight) > 1000) return { key: 'fa.errWeight', params: {} };
  return null;
}
/* El cálculo SOLO ocurre con ecuación elegida + datos completos +
   dato de sexo; en cualquier otro caso no hay resultado (estados
   vacíos honestos, N-01). Precisión completa dentro; el redondeo
   a 10 kcal es solo de presentación (faRound10). Sin cambios en
   las entradas no se reescribe (no se acuñan snapshots en balde).
   Con datos inválidos (C-7) NO se escribe resultado alguno y la
   causa queda visible en el panel (FA_CALC_ERR). */
async function faComputeMine(uid) {
  const cfg = MY_ASMT.doc; if (!cfg) return;
  const sex = MY_ENERGY.sex; if (!sex) return;
  if (cfg.equation !== 'mifflin-st-jeor') return;
  const by = parseInt(cfg.birthYear, 10), h = num(cfg.heightCm), pal = num(cfg.palBasal);
  const last = WEIGHTS && WEIGHTS.length ? WEIGHTS[WEIGHTS.length - 1] : null;
  const bad = faCalcCheck(cfg, last);
  if (bad) { if (!FA_CALC_ERR || FA_CALC_ERR.key !== bad.key) { FA_CALC_ERR = bad; renderEnergyPanel(); } return; }
  FA_CALC_ERR = null;
  const age = new Date().getFullYear() - by;
  const base = 10 * last.weight + 6.25 * h - 5 * age;
  const rmr = sex === 'male' ? base + 5 : base - 161;
  const snap = { weightKg: last.weight, weightDate: last.date, heightCm: h, ageYears: age, palBasal: pal };
  /* Sin cambios NO se reescribe — y el «sin cambios» incluye el
     resultado que corresponde al dato de sexo ACTUAL: el snapshot
     jamás guarda el valor del sexo, así que la igualdad del
     snapshot sola no basta (si el cliente corrige su dato con las
     mismas entradas, hay que recalcular: la constante cambia). */
  if (cfg.equationUsed === 'mifflin-st-jeor' && typeof cfg.rmrKcal === 'number'
      && Math.abs(cfg.rmrKcal - rmr) < 1e-9 && Math.abs(cfg.tdeeKcal - rmr * pal) < 1e-9
      && cfg.inputsSnapshot && JSON.stringify(cfg.inputsSnapshot) === JSON.stringify(snap)) return;
  const result = { rmrKcal: rmr, tdeeKcal: rmr * pal, equationUsed: 'mifflin-st-jeor', equationVersion: FA_EQUATION_VERSION,
    inputsSnapshot: snap, sexConstantApplied: true, uncertaintyNote: FA_UNCERTAINTY[LANG] || FA_UNCERTAINTY.en,
    computedAt: serverTimestamp(), computedBy: uid };
  try {
    await setDoc(doc(db, 'users', uid, 'assessment', 'current'), result, { merge: true });
    await setDoc(doc(db, 'users', uid, 'assessment', 'hist_' + Date.now()), result);
    MY_ASMT.doc = { ...cfg, rmrKcal: result.rmrKcal, tdeeKcal: result.tdeeKcal, equationUsed: result.equationUsed,
      equationVersion: result.equationVersion, inputsSnapshot: snap, sexConstantApplied: true };
    renderEnergyPanel();
  } catch {}
}
async function saveMySex() {
  const sel = document.querySelector('input[name="fa-sex"]:checked');
  if (!sel) { toast(t('fa.pickOne'), true); return; }
  const uid = auth.currentUser.uid;
  const data = { sexForCalc: sel.value, purposeVersion: FA_PURPOSE_VERSION, updatedAt: serverTimestamp() };
  if (!MY_ENERGY.sex) data.providedAt = serverTimestamp();
  try {
    await setDoc(doc(db, 'users', uid, 'energyPrivate', 'sex'), data, { merge: true });
    MY_ENERGY = { state: 'ok', sex: sel.value };
    toast(t('fa.saved'));
    renderEnergyPanel();
    await faSyncSignal(uid);
    await faComputeMine(uid);
  } catch (e) { failToast(e); }
}
async function deleteMySex() {
  if (!confirm(t('fa.deleteConfirm'))) return;
  const uid = auth.currentUser.uid;
  try {
    await deleteDoc(doc(db, 'users', uid, 'energyPrivate', 'sex'));
    MY_ENERGY = { state: 'ok', sex: null };
    toast(t('fa.deleted'));
    renderEnergyPanel();
    await faSyncSignal(uid);
  } catch (e) { failToast(e); }
}
async function loadMyEnergy() {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  try {
    const s = await getDoc(doc(db, 'users', uid, 'energyPrivate', 'sex'));
    MY_ENERGY = { state: 'ok', sex: s.exists() ? (s.data().sexForCalc || null) : null };
  } catch { MY_ENERGY = { state: 'error', sex: null }; }
  try {
    const s = await getDoc(doc(db, 'users', uid, 'assessment', 'current'));
    MY_ASMT = { state: 'ok', doc: s.exists() ? s.data() : null };
  } catch { MY_ASMT = { state: 'error', doc: null }; }
  renderEnergyPanel();
  if (MY_ENERGY.state === 'ok' && MY_ASMT.state === 'ok') { await faSyncSignal(uid); await faComputeMine(uid); }
}

async function openClient(uid) {
  const box = $('client-detail');
  let uname = t('client.fallbackName'), udata = null;
  try {
    const s = await getDoc(doc(db, 'users', uid));
    if (s.exists()) { uname = s.data().name || s.data().email || uname; udata = s.data(); }
  } catch {}
  /* Alcance del entrenador: la ficha de un cliente NO asignado no
     se abre (ni métricas, ni composición, ni planes). El
     administrador no tiene esta restricción. */
  if (ROLE === 'entrenador' && (!udata || udata.trainerUid !== auth.currentUser.uid)) {
    toast(t('roles.notYourClient'), true);
    box.style.display = 'none'; box.innerHTML = '';
    return;
  }
  /* Salud separada: el entrenador solo la obtiene si el consentimiento
     específico del cliente está activo (fetchClientHealth). */
  const clientHealth = await fetchClientHealth(uid, udata);
  /* F-A1/F-A2: la ficha de cálculo del cliente (assessment/current).
     El entrenador la lee entera — configuración, señal y resultado —
     pero jamás energyPrivate (eso ni se intenta: C-03). */
  let asmtDoc = null;
  try { const as = await getDoc(doc(db, 'users', uid, 'assessment', 'current')); if (as.exists()) asmtDoc = as.data(); } catch {}
  FA_CARD = { uid, asmt: asmtDoc };
  const data = [];
  try {
    const ws = await getDocs(query(collection(db, 'nutrition_weight'), where('ownerUid', '==', uid)));
    ws.forEach(d => { const v = d.data();
      if (v.ownerUid === uid && num(v.weight) > 0) data.push({ id: d.id, date: v.date, weight: num(v.weight),
        fat: num(v.fat), muscle: num(v.muscle), water: num(v.water), visceral: num(v.visceral), notes: v.notes || '' });
    });
  } catch {}
  data.sort((a, b) => a.date < b.date ? -1 : 1);
  const rows = data.map(d => `
    <tr><td>${dateName(d.date)}</td><td class="num"><b>${d.weight}</b></td>
    <td class="num">${d.fat || '—'}</td><td class="num">${d.muscle || '—'}</td>
    <td class="num">${d.water || '—'}</td><td class="num">${d.visceral || '—'}</td>
    <td>${esc(d.notes)}</td>
    <td><button class="btn-ghost btn-sm" data-c-edit="${d.id}">${t('client.edit')}</button></td></tr>`).join('');
  box.style.display = '';
  const healthAlert = clientHealth.decl
    ? declSummaryHTML(clientHealth.decl)
    : `<div class="health-alert">🏥 ${t('health.trainerNoAccess')}</div>`;
  let foodItems = [];
  try {
    const fs = await getDocs(query(collection(db, 'meal_help'), where('ownerUid', '==', uid), where('status', '==', 'pending')));
    fs.forEach(d => foodItems.push({ id: d.id, ...d.data() }));
  } catch {}
  const foodBlock = foodItems.length
    ? `<div class="mealhelp-list" style="margin-bottom:12px">${foodItems.map(m => `
      <div class="mealhelp-item">
        <img src="${m.photoURL}" alt="${t('mealhelp.foodAlt')}" data-food-view="${m.id}" title="${t('mealhelp.tapZoom')}">
        <div class="mealhelp-row"><button class="btn-ghost btn-sm" data-food-ok="${m.id}">${t('client.reviewed')}</button></div>
      </div>`).join('')}</div>`
    : '';
  box.innerHTML = `
    <h3 class="history-title">${t('client.weightLog', { name: esc(uname) })}</h3>
    ${healthAlert}
    ${foodItems.length ? `<h3 class="history-title">${t('client.foodReview', { n: foodItems.length })}</h3>${foodBlock}` : ''}
    <div style="margin-bottom:10px"><button class="btn-primary btn-sm" id="btn-client-add">${t('client.addWeight')}</button>
    <button class="btn-ghost btn-sm" id="btn-client-close" style="margin-left:8px">${t('client.close')}</button></div>
    ${data.length ? weightChartSVG([...data].reverse()) : `<div class="wempty">${t('client.noWeight')}</div>`}
    ${data.length ? `<div class="table-scroll"><table class="detail whist">
      <thead><tr><th>${t('form.date')}</th><th class="num">${t('form.weight')}</th><th class="num">${t('form.bodyfat')}</th><th class="num">${t('form.muscle')}</th><th class="num">${t('form.water')}</th><th class="num">${t('form.visceral')}</th><th>${t('form.notes')}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : ''}
    ${fb3ProteinHTML(data)}
    ${faCardHTML(uid, asmtDoc, data)}
    <div id="bt-card"></div>
    <div id="compacc-box"><div class="wempty">${t('access.loading')}</div></div>
    <div id="client-training"></div>
    <div id="client-evals"><div class="eval-actions"><button type="button" class="btn-ghost btn-sm" id="btn-client-evals">${t('teval.open')}</button></div><div id="client-evals-body" style="display:none"></div></div>`;
  $('btn-client-close').onclick = () => { box.style.display = 'none'; box.innerHTML = ''; };
  const fb3b = $('fb3-help-btn');
  if (fb3b) fb3b.onclick = () => { const p = $('fb3-help'); const open = p.style.display !== 'none'; p.style.display = open ? 'none' : ''; fb3b.setAttribute('aria-expanded', String(!open)); };
  const fah = $('fa-help-btn');
  if (fah) fah.onclick = () => { const p = $('fa-help'); const open = p.style.display !== 'none'; p.style.display = open ? 'none' : ''; fah.setAttribute('aria-expanded', String(!open)); };
  const fhm = $('fa-help-more');
  if (fhm) fhm.onclick = () => { const det = $('fa-help-detail'); const open = det.style.display !== 'none'; det.style.display = open ? 'none' : ''; fhm.setAttribute('aria-expanded', String(!open)); fhm.textContent = open ? t('fa.helpMore') : t('fa.helpLess'); };
  const faEq = box.querySelector('[data-fa-eq]');
  if (faEq) { faEq.onclick = () => faSetEquation(uid); faEq.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); faSetEquation(uid); } }; }
  const faSv = $('fa-save');
  if (faSv) faSv.onclick = () => faSaveConfig(uid);
  const faPal = $('fa-pal');
  if (faPal) { faPal.addEventListener('input', faPalSync); faPalSync(); }
  $('btn-client-add').onclick = () => openWeightModal({ uid, docId: null, rec: null });
  compAccLoadTrainer(uid);
  btLoadTrainerCard(uid, udata);
  box.querySelectorAll('[data-c-edit]').forEach(b => b.onclick = () => {
    const rec = data.find(w => w.id === b.dataset.cEdit);
    if (rec) openWeightModal({ uid, docId: rec.id, rec });
  });
  const foodById = id => foodItems.find(x => x.id === id);
  box.querySelectorAll('[data-food-view]').forEach(im => im.onclick = () => { const m = foodById(im.dataset.foodView); if (m) showLightbox(m.photoURL); });
  box.querySelectorAll('[data-food-ok]').forEach(b => b.onclick = async () => {
    await setDoc(doc(db, 'meal_help', b.dataset.foodOk), { status: 'reviewed' }, { merge: true });
    toast(t('msg.foodReviewed'));
    openClient(uid);
  });
  loadClientTraining(uid);
  const evBtn = $('btn-client-evals');
  if (evBtn) evBtn.onclick = () => tevalToggle(uid, data);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============ INTERRUPTOR DE COMPOSICIÓN (vista del entrenador) ============
   Lee el ajuste {uid}_compaccess del cliente y lo pinta con su
   historial. Alternar escribe mode + history (append) con quién
   (uid y nombre del entrenador) y cuándo (ISO). Si el documento
   aún no existe, el entrenador intenta crearlo; con las reglas
   vigentes la creación con ownerUid del cliente está reservada al
   propio cliente, así que el fallo se informa con su causa y su
   salida (que el cliente abra la app una vez) — nunca en silencio.
   El candidato de reglas del paquete levanta esa limitación. */
let COMPACC_CLIENT = null;   // { uid, mode, history, exists }
function compAccHTML(st) {
  const modeTx = st.mode === 'client' ? t('compacc.modeClient') : t('compacc.modeTrainer');
  const btnTx = st.mode === 'client' ? t('compacc.revoke') : t('compacc.grant');
  const hist = (st.history || []).slice().reverse().map(h => `
    <div class="compacc-hist-row"><span>${esc(h.mode === 'client' ? t('compacc.histClient') : t('compacc.histTrainer'))}</span>
    <span class="muted">${esc(t('compacc.histBy', { who: h.byName || h.by || '—', when: h.at ? String(h.at).slice(0, 10) : '—' }))}</span></div>`).join('');
  return `<div class="compacc-box">
    <h3 class="history-title">🔒 ${esc(t('compacc.title'))}</h3>
    <p class="progress-hint">${esc(modeTx)}</p>
    <div class="eval-actions"><button type="button" class="btn-primary btn-sm" id="compacc-toggle">${esc(btnTx)}</button></div>
    <p class="eval-cfg-group">${esc(t('compacc.history'))}</p>
    ${hist || `<p class="eval-detail">${esc(t('compacc.histEmpty'))}</p>`}
  </div>`;
}
async function compAccLoadTrainer(uid) {
  const box = $('compacc-box'); if (!box) return;
  let st = { mode: 'trainer', history: [], exists: false };
  try {
    const cs = await getDoc(compAccessRef(uid));
    if (cs.exists()) { const v = cs.data(); st = { mode: v.mode === 'client' ? 'client' : 'trainer', history: Array.isArray(v.history) ? v.history : [], exists: true }; }
  } catch {}
  COMPACC_CLIENT = { uid, ...st };
  box.innerHTML = compAccHTML(st);
  const btn = $('compacc-toggle');
  if (btn) btn.onclick = () => compAccToggle(uid);
}
async function compAccToggle(uid) {
  const st = COMPACC_CLIENT; if (!st || st.uid !== uid) return;
  const newMode = st.mode === 'client' ? 'trainer' : 'client';
  const entry = { mode: newMode, by: auth.currentUser.uid, byName: (UDATA && UDATA.name) || '', at: new Date().toISOString() };
  const history = [...(st.history || []), entry].slice(-50);
  try {
    if (st.exists) {
      await setDoc(compAccessRef(uid), { mode: newMode, history, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await setDoc(compAccessRef(uid), { kind: 'compAccess', uid, ownerUid: uid, mode: newMode, history, updatedAt: serverTimestamp() });
    }
    toast(t('compacc.saved'));
    await openClient(uid);
  } catch {
    toast(t('compacc.needClientOpen'), true);
  }
}

/* ================= METAS POR USUARIO (las establece el entrenador) ================= */
let goalsUid = null;
function openGoals(uid, name, goals) {
  goalsUid = uid;
  $('goals-modal-title').textContent = t('goals.for', { name });
  /* Sin metas fijadas, el editor abre VACÍO (campos en blanco): lo que
     se guarda es lo que el entrenador teclee, nunca valores de la casa. */
  const g = goals || {};
  $('g-kcal').value = g.kcal == null ? '' : g.kcal; $('g-prot').value = g.prot == null ? '' : g.prot; $('g-carb').value = g.carb == null ? '' : g.carb;
  $('g-azuc').value = g.azuc == null ? '' : g.azuc; $('g-gras').value = g.gras == null ? '' : g.gras;
  $('goals-modal').style.display = '';
}
$('goals-cancel').onclick = () => { $('goals-modal').style.display = 'none'; goalsUid = null; };
$('goals-modal').addEventListener('click', e => { if (e.target.id === 'goals-modal') { e.target.style.display = 'none'; goalsUid = null; } });
$('form-goals').addEventListener('submit', async e => {
  e.preventDefault();
  if (!goalsUid) return;
  const goals = { kcal: Math.max(0, num($('g-kcal').value)), prot: Math.max(0, num($('g-prot').value)), carb: Math.max(0, num($('g-carb').value)),
    azuc: Math.max(0, num($('g-azuc').value)), gras: Math.max(0, num($('g-gras').value)) };
  await setDoc(doc(db, 'users', goalsUid), { goals }, { merge: true });
  const mine = goalsUid === auth.currentUser.uid;
  goalsUid = null;
  $('goals-modal').style.display = 'none';
  toast(t('msg.goalsSaved'));
  if (mine) { GOALS = { ...goals }; render($('dateSel').value); }
  await loadAdmin();
});

/* Para usuarios no-dueños, las consultas van filtradas por ownerUid:
   las reglas por-documento rechazan los listados sin filtro. */
function colQuery(name) {
  const c = collection(db, name);
  return IS_OWNER ? c : query(c, where('ownerUid', '==', auth.currentUser.uid));
}

/* ================= PERFIL DEL CLIENTE (el entrenador completa en la 1ª entrevista) ================= */
let profileUid = null;
async function openProfile(uid) {
  const u = ADMIN_USERS.find(x => x.id === uid);
  if (!u) return;
  profileUid = uid;
  $('profile-modal-title').textContent = t('profile.for', { name: u.name || u.email });
  $('p-name').value = u.name || '';
  $('p-phone').value = u.phone || '';
  $('p-gender').value = u.gender || '';
  $('p-social').value = u.social || '';
  $('p-notes').value = u.trainerNotes || '';
  /* Salud: SOLO LECTURA para el entrenador y solo con consentimiento
     específico activo del cliente (Decisión 7). El guardado de este
     formulario ya no escribe salud: notas y salud van separados. */
  const body = $('p-health-body');
  if (body) {
    body.innerHTML = `<p class="health-hint">${t('train.loading')}</p>`;
    const ch = await fetchClientHealth(uid, u);
    body.innerHTML = (ch.decl ? declSummaryHTML(ch.decl) : `<p class="health-hint">${t('health.trainerNoAccess')}</p>`)
      + `<p class="health-hint">${t('health.trainerViewNote')}</p>`;
  }
  $('profile-modal').style.display = '';
}
$('profile-cancel').onclick = () => { $('profile-modal').style.display = 'none'; profileUid = null; };
$('profile-modal').addEventListener('click', e => { if (e.target.id === 'profile-modal') { e.target.style.display = 'none'; profileUid = null; } });
$('form-profile').addEventListener('submit', async e => {
  e.preventDefault();
  if (!profileUid) return;
  /* Escritura separada: este formulario guarda perfil y notas del
     entrenador; NUNCA respuestas de salud (pertenecen al cliente). */
  await setDoc(doc(db, 'users', profileUid), {
    name: $('p-name').value.trim(), phone: $('p-phone').value.trim(),
    gender: $('p-gender').value, social: $('p-social').value.trim(),
    trainerNotes: $('p-notes').value.trim()
  }, { merge: true });
  profileUid = null;
  $('profile-modal').style.display = 'none';
  toast(t('msg.profileSaved'));
  await loadAdmin();
  await loadClients();
});

/* ================= DATA ================= */
async function loadAll() {
  if (auth.currentUser && RULES_EPOCH === 'unknown') probeRulesEpoch(auth.currentUser.uid);
  /* Diario personal: siempre filtrado por el uid autenticado, también
     para el dueño (colQuery sin filtro dejaba ver las comidas de todos
     los clientes como propias). La administración no usa estas listas.
     CONSTRUCCIÓN LOCAL (corrección del duplicado, 2026-10-23): la lista
     se arma en un objeto LOCAL y se intercambia de una vez cuando la
     consulta vuelve. Antes se vaciaba y rellenaba el global MEALS a
     través del await: dos recargas solapadas (p. ej. dos cambios de
     idioma seguidos, o una recarga cruzada con el guardado) empujaban
     los MISMOS documentos dos veces sobre el mismo objeto y el diario
     pintaba cada comida duplicada hasta la siguiente recarga limpia
     (probado en batería: escenario D6). */
  const freshMeals = {};
  const ms = await getDocs(query(collection(db, 'nutrition_meals'), where('ownerUid', '==', auth.currentUser.uid)));
  ms.forEach(d => {
    const v = d.data();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) return;
    const m = { id: d.id, meal: v.meal || '', food: v.food || '', qty: v.qty || '',
      kcal: num(v.kcal), prot: num(v.prot), carb: num(v.carb),
      sugar: num(v.sugar), fat: num(v.fat), notes: v.notes || '',
      /* Procedencia (corrección «Repetir», 2026-10-19): loadAll conserva
         source/origin del documento para que repetir sepa de dónde viene
         el original; la renderización ordinaria no cambia. */
      source: v.source || '', origin: v.origin || '',
      /* Desglose por alimento (2026-10-21): viaja en el propio
         documento (campo items) cuando el guardado desde el análisis
         lo persistió; loadAll lo conserva tal cual — la ventana del
         anillo lo lee de aquí, sin lecturas extra a Firestore. */
      items: Array.isArray(v.items) ? v.items : null,
      /* Hora de REGISTRO (paquete «orden descendente + hora»,
         2026-10-23): el documento nace con createdAt (serverTimestamp)
         en TODAS las rutas de guardado de comidas (IA foto, IA texto,
         manual y repetir); se conserva en milisegundos para ordenar
         el detalle del día y mostrar la hora junto a la etiqueta. Es
         la hora de registro, NO una hora editable de la comida. */
      createdAtMs: (v.createdAt && v.createdAt.toMillis) ? v.createdAt.toMillis() : 0,
      photoURL: v.photoURL || '', photoPath: v.photoPath || '' };
    (freshMeals[v.date] = freshMeals[v.date] || []).push(m);
  });
  MEALS = freshMeals;
  Object.values(MEALS).forEach(arr =>
    arr.sort((a, b) => (MEAL_ORDER[a.meal] || 9) - (MEAL_ORDER[b.meal] || 9)));

  WEIGHTS = [];
  const ws = await getDocs(query(collection(db, 'nutrition_weight'), where('ownerUid', '==', auth.currentUser.uid)));
  ws.forEach(d => {
    const v = d.data();
    if (num(v.weight) > 0) WEIGHTS.push({ id: d.id, date: v.date, weight: num(v.weight),
      fat: num(v.fat), muscle: num(v.muscle), water: num(v.water),
      visceral: num(v.visceral), notes: v.notes || '' });
  });
  WEIGHTS.sort((a, b) => a.date < b.date ? -1 : 1);

  buildDateSelector();
  renderWeight();
  await loadProgress();
  await loadMealHelp();
  await loadMyTraining();
  loadPropClient();
  await loadPendings();
  renderPrivacy();
  await loadMyHealth();
  await loadMyEnergy();
  await loadAdmin();
  await loadClients();
  applyStorageFlag();
}

/* Oculta la opción de foto del formulario de comidas mientras Storage
   no esté activado (plan Blaze); en su lugar muestra la pista de que la
   foto se analiza desde «Ayuda con comidas». La zona de fotos de
   PROGRESO ya no se toca aquí: desde 2026-10-19 funciona sin Storage
   (dataURL comprimido en Firestore). */
function applyStorageFlag() {
  if (STORAGE_READY) {
    document.querySelectorAll('.photo-hint').forEach(el => el.style.display = 'none');
    return;
  }
  document.querySelectorAll('.photo-label').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.photo-hint').forEach(el => el.style.display = '');
}

function buildDateSelector() {
  const sel = $('dateSel');
  sel.innerHTML = '';
  const dates = Object.keys(MEALS).sort().reverse();
  const hoy = todayISO();
  {
    const o = document.createElement('option');
    o.value = hoy; o.textContent = dateName(hoy) + t('date.today');
    sel.appendChild(o);
  }
  dates.forEach(d => {
    if (d === hoy) return;
    const o = document.createElement('option');
    o.value = d; o.textContent = dateName(d);
    sel.appendChild(o);
  });
  sel.value = hoy;
  sel.onchange = e => render(e.target.value);
  render(sel.value);
}

/* ============ GRÁFICA SEMANAL DE CUMPLIMIENTO ============ */
function weekDates(iso) {
  const d = new Date(iso + 'T12:00:00');
  const day = (d.getDay() + 6) % 7; // lunes = 0
  const mon = new Date(d); mon.setDate(d.getDate() - day);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const t = new Date(mon); t.setDate(mon.getDate() + i);
    out.push(t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'));
  }
  return out;
}
function renderWeekChart(date) {
  const el = $('weekChart');
  if (!hasAnyGoal()) { // sin metas no hay cumplimiento que graficar: aviso explícito, ningún % fantasma
    el.innerHTML = `<p class="chart-note">${t('goals.none')}</p>`;
    return;
  }
  const days = weekDates(date);
  const dayNames = DAYNAMES[LANG] || DAYNAMES.en;
  const MAXP = 1.25;
  const series = METRICS.filter(m => goalOf(m.key) !== null).map(m => ({
    color: m.color, name: t('metric.' + m.key),
    pts: days.map(d => {
      const tot = totals(d);
      const g = goalOf(m.key);
      return Math.min((tot[m.key] || 0) / g, MAXP);
    })
  }));
  const W = 680, H = 280, P = { l: 46, r: 14, t: 14, b: 34 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const X = i => P.l + (i / 6) * iw;
  const Y = p => P.t + ih - (p / MAXP) * ih;
  const grid = [0, 0.25, 0.5, 0.75, 1, 1.25].map(f => {
    const y = Y(f);
    const lbl = Math.round(f * 100) + '%';
    return `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="${f === 1 ? '#94a3b8' : '#eef2f7'}" stroke-width="${f === 1 ? 1.5 : 1}" ${f === 1 ? 'stroke-dasharray="6 4"' : ''}/>
      <text x="${P.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${lbl}</text>`;
  }).join('');
  const selIdx = days.indexOf(date);
  const highlight = selIdx >= 0
    ? `<rect x="${X(selIdx) - iw / 14}" y="${P.t}" width="${iw / 7}" height="${ih}" fill="#0d9488" opacity="0.07" rx="6"/>` : '';
  const lines = series.map(s => {
    const pts = s.pts.map((p, i) => `${X(i).toFixed(1)},${Y(p).toFixed(1)}`).join(' ');
    const dots = s.pts.map((p, i) =>
      `<circle cx="${X(i)}" cy="${Y(p)}" r="4" fill="${s.color}" stroke="#fff" stroke-width="1.5"><title>${s.name}: ${Math.round(p * 100)}%</title></circle>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
  }).join('');
  const labels = days.map((d, i) =>
    `<text x="${X(i)}" y="${H - 16}" text-anchor="middle" font-size="10" fill="#9ca3af">${dayNames[i]}</text>
     <text x="${X(i)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#cbd5e1">${shortDate(d)}</text>`).join('');
  const legend = series.map((s, i) =>
    `<circle cx="${P.l + i * 128}" cy="8" r="4" fill="${s.color}"/><text x="${P.l + i * 128 + 8}" y="12" font-size="10" fill="#4b5563">${s.name}</text>`).join('');
  el.innerHTML = `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${legend}${grid}${highlight}${lines}${labels}</svg></div>
    <p class="chart-note">${t('chart.note')}</p>`;
}

/* ================= AYUDA CON COMIDAS (foto para análisis, sin Storage) ================= */
async function compressFoodPhoto(file, maxDim = 640) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
/* Retirada del bloque «Ayuda con comidas» de la vista de comida
   (Ronald, 2026-10-22): el encabezado y #mealhelp-content salieron
   del DOM, así que la lista #mealhelp-list ya no tiene casa y esta
   función queda sin efecto — su guarda ante nulo la hace inofensiva
   y se conserva por si la ruta manual volviera en otro paquete. La
   colección meal_help está retirada (la app no escribe en ella
   desde 2026-10-17); la revisión del entrenador pinta SU propia
   lista dentro de la ficha del cliente (openClient), intacta. El
   aviso «la foto no se almacena» vive ahora como nota en «Permisos
   y privacidad» (perm.photoNote). */
async function loadMealHelp() {
  const box = $('mealhelp-list');
  if (!box || !auth.currentUser) return;
  let items = [];
  try {
    const snap = await getDocs(query(collection(db, 'meal_help'), where('ownerUid', '==', auth.currentUser.uid)));
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
  } catch {}
  const ts = m => (m.createdAt && m.createdAt.toMillis) ? m.createdAt.toMillis() : 0;
  items.sort((a, b) => ts(b) - ts(a));
  box.innerHTML = items.length ? items.slice(0, 12).map(m => `
    <div class="mealhelp-item">
      <img src="${m.photoURL}" alt="${t('mealhelp.foodAlt')}" data-mh-view="${m.id}" title="${t('mealhelp.tapZoom')}">
      <div class="mealhelp-row"><span class="mealhelp-status">${m.status === 'reviewed' ? t('mealhelp.reviewed') : t('mealhelp.pending')}</span>
      <button class="btn-ghost btn-sm" data-mh-del="${m.id}">✕</button></div>
    </div>`).join('') : '';
  const byId = id => items.find(x => x.id === id);
  box.querySelectorAll('[data-mh-view]').forEach(im => im.onclick = () => { const m = byId(im.dataset.mhView); if (m) showLightbox(m.photoURL); });
  box.querySelectorAll('[data-mh-del]').forEach(b => b.onclick = async () => {
    if (!confirm(t('confirm.delPhoto'))) return;
    await deleteDoc(doc(db, 'meal_help', b.dataset.mhDel));
    toast(t('msg.photoDeleted')); loadMealHelp();
  });
}
/* Corrección del piloto (Ronald, 2026-10-17 21:59): UN SOLO botón de
   ingreso de comida por foto — «Analiza la comida» (flujo transitorio).
   La subida manual a meal_help ya no tiene botón ni handler: la lista
   de fotos ya guardadas sigue visible arriba (ver/borrar) vía
   loadMealHelp(), pero la app ya no escribe en meal_help. */

/* ================= M8 — REVISIÓN AUTOMÁTICA CON IA (Fase C, local) =====
   Flujo TRANSITORIO (corrección 2026-10-17, decisión de Ronald): la foto
   se captura y vive SOLO en memoria (aiState.dataUrl): captura temporal →
   análisis → borrador editable → confirmación → registro estructurado
   SIN imagen. La foto del análisis con IA no se escribe en meal_help,
   ni en Firestore, ni en Storage, ni en ningún registro. (La ruta manual
   de Meal help sigue como en producción, intacta.)
   Si la IA falla, el panel ofrece Reintentar (conservando respuestas) o
   Continuar manualmente (modal con lo conocido, guardado manual sin
   source:'ai'); un error nunca escribe nada ni muestra éxito.
   La clave de IA vive SOLO en el intermediario, nunca en esta app.
   AI_ENDPOINT queda vacío hasta la Fase D (URL del Worker); en pruebas
   locales puede fijarse con localStorage 'm8.endpoint'. */
const AI_ENDPOINT = 'https://ronbo-nutri-m8.hola-d30.workers.dev';
let aiDraft = null; // {model, rangeKcal} del borrador pendiente de guardar
let aiState = null; // {dataUrl, step, r1, answers, r2, errStage} — solo memoria
function aiEndpoint() {
  // Corrección B-1 (auditoría de seguridad Fase D, 2026-10-17): si el
  // endpoint compilado está fijado, manda SOLO ese y el override local se
  // ignora; el override solo funciona con AI_ENDPOINT vacío (desarrollo).
  if (AI_ENDPOINT) return AI_ENDPOINT;
  try { return localStorage.getItem('m8.endpoint') || ''; } catch { return ''; }
}
/* ENDURECIMIENTO ANTI-SILENCIO (Parte B, 2026-10-22 — caso real de
   Ronald: foto de una tortilla compuesta ~09:57 CDT; el diagnóstico de
   solo lectura probó que el Worker SÍ respondió y que la ruptura
   estaba en la app, DESPUÉS de la respuesta y ANTES del guardado.
   Tres huecos cerrados aquí y en aiStart/aiCalculate/aiRender:
   (1) fetch sin límite de tiempo: una petición colgada dejaba el
       indicador girando para siempre → ahora hay timeout (90 s) y su
       error cae en el aviso honesto como cualquier otro fallo.
   (2) el cuerpo 200 se aceptaba sin validar: vacío, no-JSON o con
       forma inesperada seguía aguas abajo y moría al pintar → ahora
       se valida en aiCall (objeto JSON parseable) y en aiShapeR1/
       aiShapeR2 (forma mínima por fase); lo inválido ES un fallo
       visible, jamás una desaparición del indicador.
   (3) una excepción AL PINTAR preguntas/resultado escapaba del flujo
       → aiRender queda envuelto: todo pintado que explota cae en el
       aviso de error honesto (ver aiRender/aiRenderErrorFallback). */
const AI_TIMEOUT_MS = 90000;
async function aiCall(path, body) {
  const ep = aiEndpoint();
  if (!ep) throw new Error('ai-off');
  const idToken = await auth.currentUser.getIdToken();
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch {} }, AI_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(ep + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, idToken }),
      signal: ctl.signal
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('ai-timeout');
    throw e;
  } finally { clearTimeout(timer); }
  if (r.status === 429) throw new Error('ai-cap'); // tope diario: mensaje específico, no genérico
  if (!r.ok) throw new Error('ai-' + r.status);
  let j = null;
  try { j = await r.json(); } catch { throw new Error('ai-badjson'); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('ai-badjson');
  return j;
}
/* Forma mínima de la identificación: foods = lista de objetos con
   nombre no vacío; questions = a lo sumo 3, con id y texto. Lo que no
   cumple se descarta; si no queda ningún alimento, aiRunIdentify lo
   trata como «sin identificación» (estado visible), no como fallo. */
function aiShapeR1(r1) {
  if (!r1 || !Array.isArray(r1.foods)) return null;
  const foods = r1.foods
    .filter(f => f && typeof f === 'object' && String(f.name || '').trim())
    .map(f => {
      const o = { ...f, name: String(f.name).trim() };
      /* Procedencia de la cantidad (fotos con báscula): solo pasan los
         dos valores del contrato; cualquier otra cosa se descarta y el
         alimento queda sin insignia, como en el flujo histórico. */
      if (o.quantitySource !== 'scale' && o.quantitySource !== 'estimate') delete o.quantitySource;
      return o;
    });
  const questions = (Array.isArray(r1.questions) ? r1.questions : [])
    .filter(q => q && typeof q === 'object' && q.id != null && String(q.text || '').trim())
    .slice(0, 3)
    .map(q => ({ id: String(q.id), text: String(q.text), options: Array.isArray(q.options) ? q.options.map(o => String(o)) : [] }));
  return { ...r1, foods, questions };
}
/* Forma mínima del cálculo: un objeto con totals objeto. */
function aiShapeR2(r2) {
  if (!r2 || typeof r2 !== 'object' || !r2.totals || typeof r2.totals !== 'object') return null;
  return r2;
}
function aiShow(html) { const p = $('ai-panel'); if (!p) return; const wasHidden = p.style.display === 'none'; p.style.display = ''; p.innerHTML = html; /* v4.2: el flujo arranca desde el dock flotante, lejos del panel: al MOSTRARSE (transición oculto→visible) se desplaza hasta él; los re-pintados con el panel ya visible no mueven la página. */ if (wasHidden) { try { p.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} } }
function aiClosePanel() { aiProgHide(); const p = $('ai-panel'); if (p) { p.style.display = 'none'; p.innerHTML = ''; } }
function aiDiscard() { aiState = null; aiClosePanel(); }
/* Indicador flotante de análisis (Ronald, 2026-10-21): el anillo de
   #ai-progress se completa POR ETAPAS reales del flujo M8, sin
   porcentajes ni temporizadores de progreso y sin llamadas extra —
   cada avance cuelga de un evento que ya existe:
     · aiProgShow()  — aiRender pinta el estado 'loading': la llamada
       (/identify o /calculate) está saliendo → anillo al 35%.
     · aiProgStage() — la llamada VOLVIÓ (r1/r2 en mano, justo antes
       de pintar) → anillo al 70%.
     · aiProgDone()  — aiRender pinta preguntas o el resultado → 100%
       y el disco se desvanece y se oculta.
     · aiProgHide()  — error (o descarte): se oculta SIN completar y
       manda el aviso honesto de error de siempre.
   pointer-events:none en CSS: el disco nunca intercepta un toque. */
const AI_PROG_C = 188.5; // 2π·30: circunferencia del anillo SVG
let aiProgOn = false, aiProgTimer = null;
function aiProgSet(frac) { const r = $('ai-progress-ring'); if (r) r.style.strokeDashoffset = String(AI_PROG_C * (1 - Math.max(0, Math.min(1, frac)))); }
function aiProgShow() {
  const el = $('ai-progress'); if (!el) return;
  if (aiProgTimer) { clearTimeout(aiProgTimer); aiProgTimer = null; }
  el.style.display = ''; aiProgOn = true;
  aiProgSet(0); // arranca vacío; la etapa de envío lo lleva al 35%
  requestAnimationFrame(() => { el.classList.add('on'); aiProgSet(0.35); });
}
function aiProgStage(frac) { if (aiProgOn) aiProgSet(frac); }
function aiProgDone() {
  if (!aiProgOn) return;
  const el = $('ai-progress'); aiProgOn = false;
  aiProgSet(1);
  aiProgTimer = setTimeout(() => { if (el) { el.classList.remove('on'); el.style.display = 'none'; } aiProgTimer = null; }, 480);
}
function aiProgHide() {
  const el = $('ai-progress'); aiProgOn = false;
  if (aiProgTimer) { clearTimeout(aiProgTimer); aiProgTimer = null; }
  if (el) { el.classList.remove('on'); el.style.display = 'none'; }
}
function aiCaptureAnswers() {
  if (!aiState || !aiState.r1) return;
  (aiState.r1.questions || []).slice(0, 3).forEach((q, i) => {
    const sel = document.querySelector(`input[name="aiq${i}"]:checked`);
    if (sel) aiState.answers[q.id] = sel.value;
    const oth = document.querySelector(`.ai-other[data-qi="${i}"]`);
    if (oth) { if (!aiState.other) aiState.other = {}; aiState.other[q.id] = oth.value; }
  });
}
/* Alimentos EDITABLES (corrección del piloto, Ronald 2026-10-17):
   aiState.foods = [{src, name, grams}] — src es el objeto identificado
   original (se conserva para el payload); name/grams son lo que la
   persona ve y puede corregir. Toda acción captura el DOM antes de
   tocar el estado, así la edición sobrevive a re-pintados y al cambio
   de idioma (mismo patrón que aiCaptureAnswers). */
function aiCaptureFoods() {
  if (!aiState || !aiState.foods) return;
  const p = $('ai-panel'); if (!p) return;
  const rows = p.querySelectorAll('.ai-food-row');
  if (!rows.length) return;
  const out = [];
  rows.forEach((row, i) => {
    const n = row.querySelector('.ai-food-name');
    const g = row.querySelector('.ai-food-grams');
    const u = row.querySelector('.ai-food-unit');
    const pp = row.querySelector('.ai-food-perpiece');
    const prev = aiState.foods[i] || {};
    const name = n ? n.value : (prev.name || '');
    const unit = u ? u.value : (prev.unit || 'g');
    const base = { src: prev.src || null, name, unit, pieces: prev.pieces ?? '', perPiece: prev.perPiece ?? '' };
    if (unit === 'unidad') {
      /* El campo de cantidad muestra PIEZAS; los gramos efectivos se
         derivan (pieces × perPiece). Si la unidad ACABA de cambiar
         desde g/ml, el valor visible aún está en gramos: se reparte
         con el peso por pieza (identificación → tabla); sin
         referencia, el peso por pieza queda vacío y el conteo en 1
         a la vista, para que la persona lo complete — no se inventa. */
      if (prev.unit !== 'unidad') {
        base.perPiece = aiSrcPerPiece(prev.src) || aiTablePerPiece(name) || '';
        const gv = num(g ? g.value : prev.grams);
        base.pieces = (base.perPiece && gv > 0) ? Math.max(1, Math.round(gv / base.perPiece)) : 1;
      } else {
        base.pieces = g ? g.value : (prev.pieces ?? '');
        base.perPiece = pp ? pp.value : (prev.perPiece ?? '');
      }
      const pn = num(base.pieces), gn = num(base.perPiece);
      base.grams = (pn > 0 && gn > 0) ? Math.round(pn * gn * 10) / 10 : '';
    } else {
      /* Hacia g/ml: si la fila venía de piezas, la cantidad visible
         aún es el conteo — mandan los gramos efectivos ya derivados;
         pieces/perPiece se conservan en memoria por si vuelve. */
      base.grams = prev.unit === 'unidad' ? (aiEffGrams(prev) || '') : (g ? g.value : (prev.grams ?? ''));
    }
    out.push(base);
  });
  aiState.foods = out;
}
function aiFoodRemove(i) {
  if (!aiState || !aiState.foods) return;
  aiCaptureFoods(); aiCaptureAnswers();
  aiState.foods.splice(i, 1);
  aiRender();
}
function aiFoodAdd() {
  if (!aiState || !aiState.foods) return;
  aiCaptureFoods(); aiCaptureAnswers();
  aiState.foods.push({ src: null, name: '', grams: '', unit: 'g', pieces: '', perPiece: '' });
  aiRender();
  const p = $('ai-panel');
  const ns = p ? p.querySelectorAll('.ai-food-name') : [];
  if (ns.length) { try { ns[ns.length - 1].focus(); } catch {} }
}
/* ============ UNIDADES POR PIEZA (desarrollo, 2026-10-24) ============
   Hallazgo de Ronald probando (2026-10-23 21:17): los alimentos
   contables (huevos — «ellos no los peso») no se podían registrar por
   unidades: el selector solo ofrecía g/ml. Ahora la fila admite una
   tercera unidad, «unidad»: la cantidad es un CONTEO de piezas y los
   gramos se derivan de un peso por pieza VISIBLE y corregible en la
   propia fila. Prioridad del peso por pieza: (1) el que devuelva la
   propia identificación, (2) la tabla breve de referencias comunes,
   (3) si no hay referencia, el campo queda VACÍO y el cálculo se
   bloquea con aviso — nunca se inventa en silencio.
   En aiState.foods, «grams» sigue siendo SIEMPRE los gramos efectivos
   (los que alimentan el cálculo, el desglose y los totales); la fila
   por piezas conserva además pieces y perPiece, y al guardar, el ítem
   del desglose lleva unit:'unidad' + pieces + gramsPerPiece +
   portion_g (los gramos derivados), para que anillos y totales
   cuadren con lo que la persona vio. En g/ml nada cambia. */
const AI_PIECE_UNITS = ['unidad', 'unidades', 'unit', 'units', 'piece', 'pieces', 'pz', 'pza'];
function aiIsPieceUnit(u) { return AI_PIECE_UNITS.includes(String(u || '').trim().toLowerCase()); }
function aiNormName(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
/* Tabla breve de referencias comunes (gramos por pieza). Son valores
   de REFERENCIA, editables en la propia fila — no mediciones. */
const AI_PIECE_TABLE = [
  [/huevo|huevos|egg|eggs/, 50],
  [/platano|banana/, 118],
  [/manzana|apple/, 182],
  [/naranja|orange/, 130],
  [/tortilla/, 30],
  [/rebanada|pan |bread|slice/, 30]
];
function aiTablePerPiece(name) {
  const n = aiNormName(name);
  for (const [re, g] of AI_PIECE_TABLE) if (re.test(n)) return g;
  return null;
}
/* Peso por pieza declarado por la identificación, si alguna vez
   llega: se aceptan los nombres de campo razonables del contrato y
   solo valores numéricos positivos. */
function aiSrcPerPiece(src) {
  if (!src || typeof src !== 'object') return null;
  for (const k of ['grams_per_piece', 'gramsPerPiece', 'per_piece_g', 'piece_g', 'g_per_piece']) {
    const v = num(src[k]);
    if (v > 0) return v;
  }
  return null;
}
/* Entrada de UN alimento identificado a la fila editable: normaliza
   la unidad (g / ml / unidad) y, si es contable, reparte lo
   identificado entre piezas y gramos por pieza sin inventar — lo que
   no se pueda derivar de lo identificado o de la tabla queda vacío
   para que la persona lo escriba. */
function aiFoodFromIdentify(f) {
  const name = f.name || '';
  const u = String(f.unit || '').toLowerCase();
  const total = Math.round(num(f.portion_g_estimate));
  if (u === 'ml') return { src: f, name, grams: total || '', unit: 'ml', pieces: '', perPiece: '' };
  if (aiIsPieceUnit(u)) {
    let pieces = num(f.pieces) || num(f.count) || num(f.units) || '';
    let perPiece = aiSrcPerPiece(f) || '';
    if (!perPiece && pieces && total > 0) perPiece = Math.round(total / pieces * 10) / 10;
    if (!pieces && perPiece && total > 0) pieces = Math.max(1, Math.round(total / perPiece));
    if (!perPiece) perPiece = aiTablePerPiece(name) || '';
    if (!pieces) pieces = 1;
    const grams = (pieces && perPiece) ? Math.round(pieces * perPiece * 10) / 10 : (total || '');
    return { src: f, name, grams, unit: 'unidad', pieces, perPiece };
  }
  return { src: f, name, grams: total || '', unit: 'g', pieces: '', perPiece: '' };
}
/* Gramos EFECTIVOS de una fila: en piezas, piezas × gramos por pieza;
   sin ambos datos no hay gramos (0) — el cálculo se bloquea antes. */
function aiEffGrams(f) {
  if (f && f.unit === 'unidad') {
    const p = num(f.pieces), g = num(f.perPiece);
    return (p > 0 && g > 0) ? Math.round(p * g * 10) / 10 : 0;
  }
  return num(f && f.grams);
}
/* Etiqueta de cantidad de UNA fila del resultado: en piezas se lee
   como conteo con su equivalencia («2 unidad (100 g)»); en g/ml, la
   histórica («240 g» / «414 ml»). */
function aiFoodQtyLabel(f) {
  if (!f) return '';
  if (f.unit === 'unidad') {
    const p = Number(f.pieces) || 0, g = Math.round(Number(f.grams) || 0);
    return p > 0 ? ` · ${p} ${t('ai.unitWord')} (${g} g)` : (g ? ` · ${g} g` : '');
  }
  return ` · ${Math.round(f.grams) || 0} ${f.unit}`;
}
/* Comida a la que pertenece el registro (PAQUETE 2, Ronald 2026-10-18):
   vive en aiState.meal, con selector VISIBLE en el flujo (preguntas y
   resultado), preselección razonable por hora y siempre cambiable. Se
   captura del DOM antes de cada acción — nunca se hereda en silencio
   el «Desayuno» del formulario. */
const AI_MEALS = ['Desayuno', 'Almuerzo', 'Cena', 'Merienda', 'Snack'];
function aiDefaultMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'Desayuno';
  if (h < 16) return 'Almuerzo';
  if (h < 22) return 'Cena';
  return 'Merienda';
}
function aiMealSelectHTML() {
  const cur = (aiState && aiState.meal) || aiDefaultMeal();
  return `<label class="ai-meal-row"><span>${t('ai.mealPrompt')}</span><select id="ai-meal">${AI_MEALS.map(v => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(mealName(v))}</option>`).join('')}</select></label>`;
}
function aiCaptureMeal() {
  if (!aiState) return;
  const sel = $('ai-meal');
  if (sel && sel.value) aiState.meal = sel.value;
}
function aiWireMeal() {
  const sel = $('ai-meal');
  if (sel) sel.addEventListener('change', () => { if (aiState) aiState.meal = sel.value; });
}
/* Métricas EDITABLES en el propio resultado (PAQUETE 2): aiState.metrics
   guarda los cinco valores tal como la persona los deja en el panel;
   el guardado (directo o vía borrador) usa ESTOS valores. Tocar un
   campo marca metricsEdited: un recálculo posterior avisa ANTES de
   reemplazar los ajustes manuales. */
function aiCaptureMetrics() {
  if (!aiState) return;
  const p = $('ai-panel'); if (!p) return;
  const inputs = p.querySelectorAll('.ai-m');
  if (!inputs.length) return;
  const m = { ...(aiState.metrics || {}) };
  inputs.forEach(inp => { m[inp.dataset.k] = inp.value; });
  aiState.metrics = m;
}
function aiMarkMetricsEdited() {
  if (!aiState) return;
  aiCaptureMetrics();
  aiState.metricsEdited = true;
}
/* NOMBRE DEL REGISTRO — FUENTE ÚNICA (Ronald, 2026-10-19: «que el nombre
   y todos los datos que salen cuando se le da continuar aparezcan de una
   vez como resultado del análisis», para no revisar dos veces).
   Antes el nombre NO se veía en el resultado: ambas rutas lo derivaban
   en silencio de los alimentos corregidos, y solo aparecía precargado
   en el formulario (m-food). Ahora el resultado lo muestra EDITABLE
   (aiState.name) y las DOS salidas usan EXACTAMENTE ese valor:
   aiRecordName() es la única derivación viva. La sugerencia inicial es
   la derivación histórica (alimentos corregidos, unidos con «, »);
   si la persona edita el nombre, su texto manda y sobrevive a un
   recálculo; si no lo toca, la sugerencia se refresca con los
   alimentos vigentes en cada cálculo. */
function aiCaptureName() {
  if (!aiState) return;
  const inp = $('ai-name');
  if (inp) aiState.name = inp.value;
}
function aiSuggestedName() {
  return aiKnownFoods().map(f => f.name).join(', ').slice(0, 120);
}
function aiRecordName() {
  aiCaptureName();
  const n = ((aiState && aiState.name) || '').trim().slice(0, 120);
  return n || aiSuggestedName();
}
/* Cantidad total del registro, UNA sola fórmula para ambas rutas
   (antes el borrador escribía siempre «g» aunque todo fuera ml;
   el guardado directo sí respetaba ml — inconsistencia corregida). */
function aiQtyString() {
  const foods = aiKnownFoods();
  const grams = foods.reduce((s, f) => s + (f.grams || 0), 0);
  if (!grams) return '';
  /* Si TODO el registro es por piezas, la cantidad se lee como
     conteo («2 unidad (100 g)») — formato que «Repetir» ya entiende
     como piezas (repeatParseQty). Mezclado con g/ml manda el total
     en gramos de siempre, con los gramos derivados de las piezas
     sumados: los totales cuadran igual. */
  if (foods.length > 0 && foods.every(f => f.unit === 'unidad')) {
    const pieces = foods.reduce((s, f) => s + (Number(f.pieces) || 0), 0);
    if (pieces > 0) return pieces + ' ' + t('ai.unitWord') + ' (' + Math.round(grams) + ' g)';
  }
  const allMl = foods.length > 0 && foods.every(f => f.unit === 'ml');
  return Math.round(grams) + (allMl ? ' ml' : ' g');
}
/* Respuestas finales: el texto libre de «Otro» manda sobre el radio. */
function aiFinalAnswers() {
  const out = { ...(aiState.answers || {}) };
  ((aiState.r1 && aiState.r1.questions) || []).slice(0, 3).forEach(q => {
    const o = ((aiState.other || {})[q.id] || '').trim();
    if (o) out[q.id] = o;
  });
  return out;
}
function aiOnLangChange() {
  /* Al cambiar ES/EN con el panel abierto: conserva las respuestas
     marcadas, los textos libres y los alimentos editados, y re-pinta
     el panel en el idioma nuevo desde aiState. */
  if (!aiState) return;
  aiCaptureAnswers();
  aiCaptureFoods();
  aiCaptureMeal();
  aiCaptureMetrics();
  aiCaptureName();
  aiRender();
}
/* IDENTIDAD DE GUARDADO (corrección del duplicado, 2026-10-23): cada
   revisión de un análisis tiene UN id de documento ESTABLE, nacido con
   el estado del análisis y compartido por las DOS salidas de guardado
   (directo y formulario del borrador). Las guardias en vuelo
   (aiSaving/mealSaving) solo bloquean intentos SIMULTÁNEOS; sin esta
   identidad, un intento SUCESIVO de la misma revisión — el formulario
   del borrador que quedó abierto tras completarse el guardado directo,
   o el reintento cuando la escritura confirmó pero el acuse se perdió —
   creaba un SEGUNDO documento con otro id (duplicado real en el
   diario, probado en batería: escenarios D4 y D5). Con el id estable,
   todo guardado de ESTA revisión reescribe el MISMO documento
   (setDoc): duplicar por esa vía queda cerrado por construcción. */
let aiSaveSeq = 0;
function aiNewSaveId() {
  aiSaveSeq += 1;
  return 'meal_' + Date.now().toString(36) + '_' + aiSaveSeq.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function aiFreshState(mode) {
  return { mode, dataUrl: null, photos: null, descText: '', step: 'loading', r1: null, answers: {}, other: {}, foods: null, r2: null, errStage: 'identify', meal: aiDefaultMeal(), metrics: null, metricsEdited: false, name: null, nameEdited: false, cap: false, saveError: false, saveId: aiNewSaveId() };
}
async function aiStart(dataUrl) {
  aiStartPhotos([dataUrl]);
}
/* FOTOS MÚLTIPLES CON BÁSCULA (Ronald, 2026-10-22): el análisis de una
   comida puede llevar de 1 a 5 fotos (el plato servido + los componentes
   pesados). aiState.photos es la lista completa (solo memoria, postura
   temporal intacta); dataUrl conserva la primera por compatibilidad.
   El cuerpo de la llamada conserva el formato histórico cuando hay UNA
   foto (imageDataUrl) y usa el arreglo «images» con 2–5 — el Worker
   acepta ambos, así la app nueva no depende del despliegue del Worker
   para el caso de una foto. */
function aiStartPhotos(urls) {
  aiState = aiFreshState('photo');
  aiState.photos = urls.slice();
  aiState.dataUrl = urls[0] || null;
  aiRunIdentify();
}
function aiIdentifyBody() {
  const photos = (aiState.photos && aiState.photos.length) ? aiState.photos : [aiState.dataUrl];
  return photos.length === 1
    ? { imageDataUrl: photos[0], lang: LANG }
    : { images: photos, lang: LANG };
}
/* Reconciliación determinista del lado de la app: si el MISMO alimento
   llega pesado en dos fotos (dos entradas con el mismo nombre, ambas
   con procedencia «scale»), el peso mostrado es la SUMA y queda UNA
   sola entrada. Si alguna de las dos no es «scale» no se fusiona nada:
   repartir una estimación sería inventar precisión. */
function aiMergeScaledDuplicates(foods) {
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const byName = new Map();
  const out = [];
  for (const f of foods) {
    const prev = byName.get(norm(f.name));
    if (prev && prev.quantitySource === 'scale' && f.quantitySource === 'scale') {
      prev.portion_g_estimate = Math.round(((Number(prev.portion_g_estimate) || 0) + (Number(f.portion_g_estimate) || 0)) * 10) / 10;
      continue;
    }
    const copy = { ...f };
    byName.set(norm(f.name), copy);
    out.push(copy);
  }
  return out;
}
/* INGRESO MANUAL CON AYUDA DE IA (Ronald, 2026-10-22): la descripción
   escrita hace de IDENTIFICACIÓN — sustituye a la foto — y todo lo
   demás (preguntas de cantidades, cálculo, revisión editable,
   guardado) es EXACTAMENTE el flujo del análisis de foto. La marca
   de origen distingue la vía al guardar: source 'ai-text' (ver
   aiSaveDirect y el envío de #form-meal vía aiUseDraft). */
async function aiStartText(desc) {
  aiState = aiFreshState('text');
  aiState.descText = desc;
  aiRunIdentify();
}
async function aiRunIdentify() {
  aiRender();
  try {
    const raw = aiState.mode === 'text'
      ? await aiCall('/identify-text', { description: aiState.descText, lang: LANG })
      : await aiCall('/identify', aiIdentifyBody());
    if (!aiState) return; // descartado mientras llamaba
    const r1 = aiShapeR1(raw);
    if (!r1) throw new Error('ai-badshape'); // forma inesperada → aviso honesto (Parte B)
    r1.foods = aiMergeScaledDuplicates(r1.foods);
    aiProgStage(0.7); // etapa real: la identificación volvió
    aiState.r1 = r1;
    aiState.foods = r1.foods.map(aiFoodFromIdentify);
    (r1.questions || []).slice(0, 3).forEach(q => { if (!(q.id in aiState.answers)) aiState.answers[q.id] = 'skipped'; });
    if (!aiState.foods.length) { aiState.step = 'notfound'; aiRender(); return; }
    aiState.step = 'questions';
    aiRender();
  } catch (e) { if (aiState) { aiState.step = 'error'; aiState.errStage = 'identify'; aiState.cap = !!(e && e.message === 'ai-cap'); aiRender(); } }
}
async function aiCalculate() {
  if (!aiState || !aiState.r1) return;
  aiCaptureAnswers();
  aiCaptureFoods();
  aiCaptureMeal();
  /* UNIDADES POR PIEZA: una fila contable sin piezas o sin peso por
     pieza NO tiene gramos que calcular y NO se inventan — se avisa
     nombrando el alimento y el flujo se queda en la revisión. */
  const namedFoods = (aiState.foods || []).filter(f => (f.name || '').trim());
  const missingPP = namedFoods.find(f => f.unit === 'unidad' && !(num(f.pieces) > 0 && num(f.perPiece) > 0));
  if (missingPP) { toast(t('ai.needPerPiece', { name: missingPP.name.trim() }), true); return; }
  /* Aviso previo (PAQUETE 2): si la persona ya ajustó las métricas a
     mano en el resultado, un recálculo las reemplazaría por el cálculo
     nuevo. Se avisa ANTES (paso 'warn') y solo se sigue con su
     confirmación expresa; si cancela, nada se recalcula. */
  if (aiState.metricsEdited && !aiState._recalcOk) { aiState.step = 'warn'; aiRender(); return; }
  /* El cálculo recibe la lista EDITADA por la persona. Si el nombre
     difiere del identificado (o el alimento es nuevo), el nombre
     editado es también el término de búsqueda USDA (usda_query). La
     unidad (g/ml) viaja con cada alimento; una fila por piezas viaja
     como su PESO EQUIVALENTE en gramos (el contrato del intermediario
     es g/ml): la equivalencia es exacta y es la que la persona vio
     en la fila («≈ N g en total»). */
  const foods = namedFoods.map(f => {
    const name = f.name.trim();
    const out = { ...(f.src || {}), name, portion_g_estimate: Math.max(0, Math.round(aiEffGrams(f))), unit: f.unit === 'ml' ? 'ml' : 'g' };
    if (!f.src || name !== (f.src.name || '') || !out.usda_query) out.usda_query = name;
    return out;
  });
  /* Sin alimentos con nombre no hay nada que calcular: se avisa y el
     flujo se queda en las preguntas (visible), sin llamar al proveedor. */
  if (!foods.length) { toast(t('err.mealMissing'), true); return; }
  aiState.step = 'loading'; aiState.errStage = 'calculate'; aiState.cap = false;
  aiRender();
  try {
    const raw2 = await aiCall('/calculate', { foods, answers: aiFinalAnswers(), lang: LANG });
    if (!aiState) return;
    const r2 = aiShapeR2(raw2);
    if (!r2) throw new Error('ai-badshape'); // forma inesperada → aviso honesto (Parte B)
    aiProgStage(0.7); // etapa real: el cálculo volvió
    aiState.r2 = r2; aiState.step = 'draft';
    /* Resultado nuevo: las métricas del panel parten de ESTOS totales;
       cualquier ajuste manual anterior quedó sustituido (con aviso). */
    aiState.metrics = null; aiState.metricsEdited = false; aiState._recalcOk = false; aiState.saveError = false;
    /* Nombre unificado: si la persona NO lo editó a mano, la sugerencia
       se refresca con los alimentos vigentes; si lo editó, se conserva. */
    if (!aiState.nameEdited) aiState.name = aiSuggestedName();
    aiRender();
  } catch (e) { if (aiState) { aiState.step = 'error'; aiState.cap = !!(e && e.message === 'ai-cap'); aiRender(); } }
}
/* REINTENTO DEL ANÁLISIS SIN RESULTADO (decisión de Ronald, correo
   2026-10-23 23:26 CDT): cuando el análisis de una comida no da
   resultado —la identificación volvió sin alimentos («notfound») o la
   llamada falló (red, tiempo agotado, HTTP, respuesta no
   interpretable)—, la tarjeta ofrece REINTENTAR con la MISMA entrada
   de la sesión: la foto sigue SOLO en memoria (postura M8 intacta:
   las fotos de comida no se persisten) o el texto del borrador. Y
   ofrece además la salida por texto DENTRO de la propia tarjeta
   (aiFailExtrasHTML): la línea que sugiere una foto más clara o
   describir la comida, con su caja accionable — no un letrero.
   El tope diario (429) NO es un «sin resultado»: su tarjeta es la del
   límite, sin Reintentar, porque el intermediario negaría el
   reintento igualmente; el reintento que SÍ se hace es una llamada
   más y cuenta contra ese tope como cualquier otra. */
function aiHasInput() {
  if (!aiState) return false;
  if (aiState.mode === 'text') return String(aiState.descText || '').trim().length > 0;
  const photos = (aiState.photos && aiState.photos.length) ? aiState.photos : (aiState.dataUrl ? [aiState.dataUrl] : []);
  return photos.length > 0 && !!photos[0];
}
/* Bloque de salidas reales tras un «sin resultado» en la etapa de
   identificación: sugerencia + caja de descripción accionable. En
   modo texto la caja nace con la descripción que falló, para
   corregirla y reanalizar sin reescribirla entera. Si la sesión ya
   no conserva entrada (withPhotoExit), se añade «Nueva foto», que
   abre el selector real de imágenes: sin entrada no hay Reintentar
   —sería un botón falso—, solo salidas que sí existen. */
function aiFailExtrasHTML(withPhotoExit) {
  const pre = aiState && aiState.mode === 'text' ? esc(aiState.descText || '') : '';
  return `<p class="progress-hint">${t('ai.retryHint')}</p><textarea id="ai-alt-desc" class="ai-alt-desc" rows="2" maxlength="600" placeholder="${t('aiText.ph')}">${pre}</textarea><div class="ai-actions"><button type="button" class="btn-ghost btn-sm" id="ai-alt-text">${t('aiText.button')}</button>${withPhotoExit ? `<button type="button" class="btn-ghost btn-sm" id="ai-alt-photo">${t('ai.newPhoto')}</button>` : ''}</div>`;
}
function aiWireFailExtras() {
  const btn = $('ai-alt-text');
  if (btn) btn.onclick = () => {
    const desc = (($('ai-alt-desc') && $('ai-alt-desc').value) || '').trim();
    if (desc.length < 2) { toast(t('aiText.tooShort'), true); return; }
    if (!aiEndpoint()) { toast(t('ai.unavailable'), true); return; }
    const keepMeal = aiState && aiState.meal;
    aiStartText(desc);
    if (keepMeal && aiState) aiState.meal = keepMeal;
  };
  const ph = $('ai-alt-photo');
  if (ph) ph.onclick = () => { aiDiscard(); const f = $('ai-file'); if (f) f.click(); };
}
/* Tarjeta de error del análisis: UN solo constructor para el pintado
   normal y para el respaldo anti-silencio (aiRenderErrorFallback) —
   ambas rutas muestran exactamente lo mismo. En identificación sin
   resultado se suman la sugerencia y la salida por texto; en CÁLCULO
   la identificación ya tuvo éxito (los alimentos quedaron capturados
   en el estado) y el reintento es recalcular con lo mismo: misma
   revisión y mismo saveId, porque aiCalculate no crea estado nuevo. */
function aiErrorCardHTML() {
  if (aiState.cap) {
    return { html: `<p class="progress-hint">${t('ai.capReached')}</p><p class="progress-hint">${t('ai.limitNote')}</p><div class="ai-actions"><button type="button" class="btn-main btn-sm" id="ai-manual">${t('ai.continueManual')}</button><button type="button" class="btn-ghost btn-sm" id="ai-cancel">${t('ai.discard')}</button></div>`, extras: false };
  }
  const identify = aiState.errStage === 'identify';
  const canRetry = !identify || aiHasInput();
  const retryBtn = canRetry ? `<button type="button" class="btn-main btn-sm" id="ai-retry">${t('ai.retry')}</button>` : '';
  const extras = identify ? aiFailExtrasHTML(!canRetry) : '';
  return { html: `<p class="progress-hint">${t('ai.failed')}</p><div class="ai-actions">${retryBtn}<button type="button" class="${canRetry ? 'btn-ghost' : 'btn-main'} btn-sm" id="ai-manual">${t('ai.continueManual')}</button><button type="button" class="btn-ghost btn-sm" id="ai-cancel">${t('ai.discard')}</button></div>${extras}`, extras: identify };
}
function aiWireErrorCard(extras) {
  const r = $('ai-retry'); if (r) r.onclick = aiRetry;
  const m = $('ai-manual'); if (m) m.onclick = aiContinueManual;
  const c = $('ai-cancel'); if (c) c.onclick = aiDiscard;
  if (extras) aiWireFailExtras();
}
function aiRetry() {
  if (!aiState) return;
  if (aiState.errStage === 'identify') {
    /* Sin entrada en la sesión no se finge una llamada: la tarjeta ya
       pintada ofrece las salidas reales (texto / nueva foto / manual). */
    if (!aiHasInput()) { aiRender(); return; }
    /* La comida elegida se conserva (mismo criterio que el botón de
       texto del formulario manual): el reintento no hereda otra en
       silencio — antes aiStartText/aiStartPhotos la reiniciaban. */
    const keepMeal = aiState.meal;
    if (aiState.mode === 'text') aiStartText(aiState.descText);
    else aiStartPhotos((aiState.photos && aiState.photos.length) ? aiState.photos : [aiState.dataUrl]);
    if (keepMeal && aiState) aiState.meal = keepMeal;
  }
  else aiCalculate();
}
function aiKnownFoods() {
  /* Lista {name, grams} con lo conocido: la EDITADA si existe; si no,
     la identificada tal cual llegó. qsrc = procedencia de la cantidad
     ('scale' | 'estimate' | null) tal como la declaró la identificación;
     vive en src y sobrevive a las ediciones (aiCaptureFoods lo conserva). */
  if (aiState && aiState.foods && aiState.foods.length)
    return aiState.foods.filter(f => (f.name || '').trim()).map(f => ({ name: f.name.trim(), grams: aiEffGrams(f), unit: f.unit === 'unidad' ? 'unidad' : (f.unit === 'ml' ? 'ml' : 'g'), pieces: f.pieces, perPiece: f.perPiece, qsrc: (f.src && f.src.quantitySource) || null }));
  return ((aiState && aiState.r1 && aiState.r1.foods) || []).map(f => { const d = aiFoodFromIdentify(f); return { name: d.name, grams: num(d.grams), unit: d.unit, pieces: d.pieces, perPiece: d.perPiece, qsrc: f.quantitySource || null }; });
}
/* UX10-5: ¿está el tema báscula/estimado en juego en el paso de
   preguntas? Sí si alguna cantidad trae procedencia declarada
   (scale/estimate, en los alimentos editables o en la identificación
   cruda) o si alguna pregunta rápida lo menciona en su texto o en
   sus opciones (la pregunta de la báscula la formula el modelo, así
   que la app la detecta por su contenido, no por un id fijo). */
function aiScaleNoteApplies() {
  if (!aiState || !aiState.r1) return false;
  const fromFoods = (aiState.foods && aiState.foods.length)
    ? aiState.foods.some(f => f.src && f.src.quantitySource)
    : (aiState.r1.foods || []).some(f => f.quantitySource);
  if (fromFoods) return true;
  const rx = /báscula|bascula|scale|pesaste|pesado|pesar|weighed|weigh/i;
  return (aiState.r1.questions || []).some(q => rx.test(String(q.text || '')) || (q.options || []).some(o => rx.test(String(o))));
}
/* Insignia de procedencia de UNA cantidad: solo se pinta cuando la
   identificación declaró procedencia (con el prompt histórico no llega
   ninguna y la vista queda exactamente como hoy). */
function aiQsrcBadge(qsrc) {
  if (qsrc === 'scale') return `<span class="ai-qsrc ai-qsrc-scale">${t('aiMulti.fromScale')}</span>`;
  if (qsrc === 'estimate') return `<span class="ai-qsrc ai-qsrc-est">${t('aiMulti.estimated')}</span>`;
  return '';
}
function aiContinueManual() {
  /* Salida manual tras un fallo: abre el modal con lo ya conocido
     (nombres y gramos si la identificación llegó) y aiDraft = null:
     el guardado será un registro manual ordinario, sin source:'ai',
     sin registro parcial creado por el error. */
  const foods = aiKnownFoods();
  aiClearDraft();
  $('m-date').value = $('dateSel').value || todayISO();
  if (foods.length) {
    /* Misma fuente única de nombre y cantidad que el resultado. */
    $('m-food').value = aiSuggestedName();
    $('m-qty').value = aiQtyString();
  } else if (aiState && aiState.mode === 'text' && aiState.descText) {
    /* Vía texto sin identificación utilizable: el formulario hereda
       las palabras del propio usuario como nombre del registro — su
       descripción ES la fuente de verdad de lo que comió. */
    $('m-food').value = aiState.descText.slice(0, 120);
  }
  aiDiscard();
  aiOpenMealModal();
}
/* aiRender queda ENVUELTO (Parte B, 2026-10-22): el cuerpo real vive
   en aiRenderInner; si CUALQUIER pintado explota (datos con forma
   inesperada al construir preguntas o la revisión — el tramo exacto
   donde murió el intento real de la tortilla), la caída es al aviso
   de error honesto, con el indicador oculto: nunca una desaparición
   silenciosa. El respaldo pinta el panel de error directamente, sin
   volver a pasar por aiRender (sin recursión). */
function aiRender() {
  try { aiRenderInner(); }
  catch (e) {
    try { aiRenderErrorFallback(); }
    catch { try { aiProgHide(); toast(t('ai.failed'), true); } catch {} }
  }
}
function aiRenderErrorFallback() {
  aiProgHide();
  if (!aiState) return;
  aiState.step = 'error';
  /* La misma tarjeta que pinta aiRenderInner (aiErrorCardHTML): el
     respaldo anti-silencio no puede ofrecer MENOS salidas que el
     flujo normal — ni un Reintentar sin la vía de texto. */
  const card = aiErrorCardHTML();
  aiShow(card.html);
  aiWireErrorCard(card.extras);
}
function aiRenderInner() {
  const p = $('ai-panel');
  if (!p || !aiState) return;
  if (aiState.step === 'loading') { aiShow(`<p class="progress-hint">${t('ai.analyzing')}</p>`); aiProgShow(); return; }
  if (aiState.step === 'error') {
    aiProgHide(); // sin completar: manda el aviso honesto de error
    /* Tope diario alcanzado (aiState.cap, PAQUETE 2): mensaje
       específico y comprensible; reintentar no sirve hasta el
       reinicio, así que la tarjeta del límite —que construye
       aiErrorCardHTML— no ofrece Reintentar: sí continuar
       manualmente. Sin tope: Reintentar + sugerencia y vía de texto
       si el fallo fue de identificación. */
    const card = aiErrorCardHTML();
    aiShow(card.html);
    aiWireErrorCard(card.extras);
    return;
  }
  if (aiState.step === 'notfound') {
    /* La identificación volvió VÁLIDA pero SIN alimentos (una foto que
       no es comida, una descripción sin alimentos reconocibles):
       estado VISIBLE y específico, con salida manual. Antes de la
       Parte B esto pintaba la pantalla de preguntas vacía — y si el
       pintado fallaba, el indicador «simplemente desaparecía».
       Desde la decisión de Ronald (2026-10-23 23:26 CDT) la tarjeta
       ofrece REINTENTAR con la misma entrada de la sesión y la
       salida por texto accionable (sugerencia + caja). Sin entrada
       conservada no se pinta Reintentar: salen las salidas reales
       (texto / nueva foto / manual). */
    aiProgHide();
    const canRetry = aiHasInput();
    const retryBtn = canRetry ? `<button type="button" class="btn-main btn-sm" id="ai-retry">${t('ai.retry')}</button>` : '';
    aiShow(`<p class="progress-hint">${t('aiText.notFound')}</p><div class="ai-actions">${retryBtn}<button type="button" class="${canRetry ? 'btn-ghost' : 'btn-main'} btn-sm" id="ai-manual">${t('ai.continueManual')}</button><button type="button" class="btn-ghost btn-sm" id="ai-cancel">${t('ai.discard')}</button></div>${aiFailExtrasHTML(!canRetry)}`);
    if (canRetry) $('ai-retry').onclick = aiRetry;
    $('ai-manual').onclick = aiContinueManual;
    $('ai-cancel').onclick = aiDiscard;
    aiWireFailExtras();
    return;
  }
  if (aiState.step === 'warn') {
    /* Aviso previo al recálculo con métricas ajustadas a mano. */
    aiProgHide();
    aiShow(`<p class="progress-hint">${t('ai.recalcWarn')}</p><div class="ai-actions"><button type="button" class="btn-main btn-sm" id="ai-warn-yes">${t('ai.recalcYes')}</button><button type="button" class="btn-ghost btn-sm" id="ai-warn-no">${t('form.cancel')}</button></div>`);
    $('ai-warn-yes').onclick = () => { aiState._recalcOk = true; aiCalculate(); };
    $('ai-warn-no').onclick = () => { aiState.step = 'draft'; aiRender(); };
    return;
  }
  if (aiState.step === 'questions') {
    aiProgDone(); // los resultados se pintan: el anillo se completa
    const r1 = aiState.r1, foods = aiState.foods || [], qs = (r1.questions || []).slice(0, 3);
    const list = foods.map((f, i) => {
      const qsrc = (f.src && f.src.quantitySource) || null;
      /* Con procedencia «scale», el peso leído viene PRE-RESPONDIDO en
         el campo de gramos (llega en portion_g_estimate) y su insignia
         sustituye a la de porción estimada; todo sigue editable. */
      const est = !qsrc && f.src && (f.src.portion_estimated === true || (typeof f.src.confidence === 'number' && f.src.confidence < 0.7));
      /* UNIDADES POR PIEZA: con «unidad» el campo de cantidad es el
         CONTEO y aparece la caja del peso por pieza (visible y
         corregible) con la equivalencia total derivada. */
      const isPz = f.unit === 'unidad';
      const qtyVal = isPz ? (f.pieces === '' || f.pieces == null ? '' : f.pieces) : (f.grams === '' || f.grams == null ? '' : f.grams);
      const pieceBox = isPz ? `<span class="ai-piece-box"><input type="number" class="ai-food-perpiece" data-fi="${i}" value="${f.perPiece === '' || f.perPiece == null ? '' : f.perPiece}" min="0" step="any" inputmode="decimal" placeholder="${t('ai.perPiecePh')}" aria-label="${t('ai.perPiece')}"><span class="ai-piece-lbl">${t('ai.perPiece')}</span>${num(f.grams) > 0 ? `<span class="ai-piece-total">${t('ai.piecesTotal', { g: Math.round(num(f.grams)) })}</span>` : ''}</span>` : '';
      return `<div class="ai-food-row"><input type="text" class="ai-food-name" data-fi="${i}" value="${esc(f.name)}" placeholder="${t('form.food')}"><input type="number" class="ai-food-grams" data-fi="${i}" value="${qtyVal}" min="0" step="any" inputmode="decimal"><select class="ai-food-unit" data-fi="${i}" aria-label="g/ml/${t('ai.unitWord')}"><option value="g"${f.unit === 'g' ? ' selected' : ''}>g</option><option value="ml"${f.unit === 'ml' ? ' selected' : ''}>ml</option><option value="unidad"${isPz ? ' selected' : ''}>${t('ai.unitWord')}</option></select>${pieceBox}${qsrc === 'scale' ? aiQsrcBadge('scale') : (est ? `<span class="ai-est">${t('ai.estPortion')}</span>` : '')}<button type="button" class="btn-ghost btn-sm ai-food-del" data-fi="${i}" title="${t('ai.removeFood')}">✕</button></div>`;
    }).join('');
    const qhtml = qs.map((q, i) => `<div class="ai-q"><p>${esc(q.text)}</p>${(q.options || []).map(o => `<label class="ai-opt"><input type="radio" name="aiq${i}" value="${esc(o)}"${aiState.answers[q.id] === o ? ' checked' : ''}> ${esc(o)}</label>`).join('')}<label class="ai-opt"><input type="radio" name="aiq${i}" value="skipped"${aiState.answers[q.id] === 'skipped' ? ' checked' : ''}> ${t('ai.skipOption')}</label><input type="text" class="ai-other" data-qi="${i}" placeholder="${t('ai.otherLabel')}" value="${esc((aiState.other || {})[q.id] || '')}"></div>`).join('');
    /* UX10-5 (piloto, 2026-10-23): si el tema báscula/estimado está
       en juego en ESTE paso (alguna cantidad trae procedencia o alguna
       pregunta lo menciona), se explica en el propio paso por qué
       importa: la báscula da el dato real; el estimado tiene más
       margen de error y la app lo trata con esa honestidad. */
    const scaleNote = aiScaleNoteApplies() ? `<p class="progress-hint">${t('ai.scaleWhy')}</p>` : '';
    aiShow(`<h3>${t('ai.foodsFound')}</h3><p class="progress-hint">${t('ai.foodsEditHint')}</p>${list}<button type="button" class="btn-ghost btn-sm" id="ai-addfood">${t('ai.addFood')}</button>${qs.length ? `<h3>${t('ai.questionsTitle')}</h3>${scaleNote}${qhtml}` : ''}${aiMealSelectHTML()}<div class="ai-actions"><button type="button" class="btn-main btn-sm" id="ai-continue">${t('ai.continue')}</button><button type="button" class="btn-ghost btn-sm" id="ai-cancel">${t('ai.discard')}</button></div>`);
    aiWireMeal();
    p.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', aiCaptureAnswers));
    p.querySelectorAll('.ai-other').forEach(r => r.addEventListener('input', aiCaptureAnswers));
    p.querySelectorAll('.ai-food-name, .ai-food-grams, .ai-food-perpiece').forEach(r => r.addEventListener('input', aiCaptureFoods));
    /* Cambiar la unidad re-pinta la fila (la caja de peso por pieza
       aparece/desaparece y la cantidad cambia de significado); el
       estado se captura ANTES de re-pintar, como en añadir/quitar. */
    p.querySelectorAll('.ai-food-unit').forEach(r => r.addEventListener('change', () => { aiCaptureFoods(); aiCaptureAnswers(); aiRender(); }));
    p.querySelectorAll('.ai-food-del').forEach(b => b.onclick = () => aiFoodRemove(+b.dataset.fi));
    $('ai-addfood').onclick = aiFoodAdd;
    $('ai-cancel').onclick = aiDiscard;
    $('ai-continue').onclick = aiCalculate;
    return;
  }
  if (aiState.step === 'draft') {
    aiProgDone(); // el resultado se pinta: el anillo se completa
    const r2 = aiState.r2, tot = r2.totals || {};
    /* Filas del resultado: nombre + CANTIDAD (con unidad) + kcal.
       El nombre y la cantidad son los de los alimentos CORREGIDOS
       (la fuente única que se guarda); las kcal por alimento vienen
       del cálculo, emparejadas por orden. */
    const known = aiKnownFoods();
    const items = r2.items || [];
    const rows = items.length
      ? items.map((it, i) => {
          const f = known[i];
          const nm = f ? f.name : it.name;
          const qty = f ? aiFoodQtyLabel(f) : (it.portion_g ? ` · ${Math.round(it.portion_g)} g` : '');
          return `<li>${esc(nm)}${qty} — ${Math.round(it.kcal || 0)} kcal${f ? ' ' + aiQsrcBadge(f.qsrc) : ''}</li>`;
        }).join('')
      : known.map(f => `<li>${esc(f.name)}${aiFoodQtyLabel(f)} ${aiQsrcBadge(f.qsrc)}</li>`).join('');
    const range = Array.isArray(tot.range_kcal) ? tot.range_kcal : null;
    /* PAQUETE 2: las cinco métricas (kcal, proteína, carbos, AZÚCARES,
       grasas) se muestran EDITABLES en el propio resultado y son las
       que se guardan; la comida elegida sigue visible y cambiable. */
    const mv = aiState.metrics || {};
    const mval = k => (mv[k] != null && mv[k] !== '') ? mv[k] : Math.round(tot[k] || 0);
    const mfield = (k, label) => `<label class="ai-metric"><span>${label}</span><input type="number" class="ai-m" data-k="${k}" value="${esc(String(mval(k)))}" min="0" step="any" inputmode="decimal"></label>`;
    aiShow(`<h3>${t('ai.draftTitle')}</h3><label class="ai-metric ai-name"><span>${t('form.food')}</span><input type="text" id="ai-name" value="${esc(aiState.name != null ? aiState.name : aiSuggestedName())}" maxlength="120" placeholder="${t('form.foodPh')}"></label><ul class="ai-foods">${rows}</ul>${range ? `<p class="progress-hint">${t('ai.range').replace('{a}', Math.round(range[0])).replace('{b}', Math.round(range[1]))}</p>` : ''}${aiMealSelectHTML()}<p class="ai-metrics-title">${t('ai.metricsTitle')}</p><div class="ai-metrics">${mfield('kcal', t('form.kcal'))}${mfield('prot', t('form.protein'))}${mfield('carb', t('form.carbs'))}${mfield('sugar', t('form.sugar'))}${mfield('fat', t('form.fat'))}</div>${aiState.saveError ? `<p class="ai-err">${t('ai.saveError')}</p>` : ''}<div class="ai-actions"><button type="button" class="btn-main btn-sm" id="ai-save">${t('ai.save')}</button><button type="button" class="btn-ghost btn-sm" id="ai-use">${t('ai.useDraft')}</button><button type="button" class="btn-ghost btn-sm" id="ai-foods">${t('ai.backToFoods')}</button><button type="button" class="btn-ghost btn-sm" id="ai-cancel2">${t('ai.discard')}</button></div>`);
    aiWireMeal();
    const nameInp = $('ai-name');
    if (nameInp) nameInp.addEventListener('input', () => { aiCaptureName(); if (aiState) aiState.nameEdited = true; });
    p.querySelectorAll('.ai-m').forEach(inp => inp.addEventListener('input', aiMarkMetricsEdited));
    $('ai-cancel2').onclick = aiDiscard;
    $('ai-save').onclick = aiSaveDirect;
    $('ai-foods').onclick = () => { aiCaptureMetrics(); aiCaptureMeal(); aiState.step = 'questions'; aiRender(); };
    $('ai-use').onclick = () => {
      /* Refuerzo H-2: este clic NUNCA puede morir en silencio. */
      try { aiUseDraft(aiState && aiState.r1, aiState && aiState.r2); }
      catch { aiDiscard(); aiOpenMealModal(); toast(t('ai.draftError'), true); }
    };
  }
}
/* ============ PREPARACIÓN DE FOTOS (fotos múltiples con báscula) ====
   aiStage = { photos: [dataUrl, …] } — SOLO memoria, como todo el flujo
   M8: las fotos jamás se persisten. La preparación (franja de
   miniaturas) aparece cuando la selección trae 2+ fotos o cuando se
   añaden a una preparación abierta; con UNA sola foto el flujo visible
   es el histórico: el análisis arranca al momento, sin paso intermedio.
   aiStageReplace = índice de la miniatura que la próxima foto elegida
   reemplaza (−1 = ninguna); tocar una miniatura ofrece reemplazarla y
   su ✕ la quita. A las 5 fotos (AI_MAX_PHOTOS) no se puede adjuntar
   una sexta: el botón de añadir desaparece, la selección se recorta y
   se dice con un toast. */
const AI_MAX_PHOTOS = 5;
let aiStage = null;
let aiStageReplace = -1;
async function aiCompressChecked(f) {
  const url = await compressFoodPhoto(f); // solo en memoria: NO se sube a meal_help
  if (url.length > 700000) { toast(t('mealhelp.tooBig'), true); return null; }
  return url;
}
function aiStageDiscard() {
  aiStage = null; aiStageReplace = -1;
  aiClosePanel();
}
function aiStageShow() {
  const p = $('ai-panel');
  if (!p || !aiStage) return;
  const photos = aiStage.photos;
  const thumbs = photos.map((u, i) => `<div class="ai-thumb"><img src="${u}" alt="" data-stage-view="${i}"><button type="button" class="ai-thumb-x" data-stage-del="${i}" title="${t('aiMulti.remove')}">✕</button></div>`).join('');
  const full = photos.length >= AI_MAX_PHOTOS;
  aiShow(`<h3>${t('aiMulti.title')}</h3><p class="progress-hint">${t('aiMulti.hint')}</p><div class="ai-stage-strip">${thumbs}</div>${full ? `<p class="progress-hint">${t('aiMulti.max')}</p>` : ''}<div class="ai-actions">${full ? '' : `<button type="button" class="btn-ghost btn-sm" id="ai-stage-add">${t('aiMulti.add')}</button>`}<button type="button" class="btn-main btn-sm" id="ai-stage-go">${t('aiMulti.analyze')}</button><button type="button" class="btn-ghost btn-sm" id="ai-stage-cancel">${t('ai.discard')}</button></div>`);
  p.querySelectorAll('[data-stage-del]').forEach(b => b.onclick = () => {
    if (!aiStage) return;
    aiStage.photos.splice(+b.dataset.stageDel, 1);
    if (!aiStage.photos.length) { aiStageDiscard(); return; } // conjunto vacío: nunca se llama con 0 fotos
    aiStageShow();
  });
  p.querySelectorAll('[data-stage-view]').forEach(im => im.onclick = () => {
    aiStageReplace = +im.dataset.stageView;
    const f = $('ai-file'); if (f) f.click();
  });
  const add = $('ai-stage-add');
  if (add) add.onclick = () => { aiStageReplace = -1; const f = $('ai-file'); if (f) f.click(); };
  $('ai-stage-go').onclick = () => {
    if (!aiStage || !aiStage.photos.length) return;
    const photos = aiStage.photos;
    aiStage = null; aiStageReplace = -1;
    aiStartPhotos(photos);
  };
  $('ai-stage-cancel').onclick = aiStageDiscard;
}
const aiFile = $('ai-file');
if (aiFile) {
  aiFile.addEventListener('cancel', () => { aiStageReplace = -1; });
  aiFile.addEventListener('change', async e => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    if (!files.length) return;
    if (!aiEndpoint()) { toast(t('ai.unavailable'), true); return; }
    /* Reemplazo de UNA miniatura: solo manda la primera foto elegida. */
    if (aiStage && aiStageReplace >= 0) {
      const idx = aiStageReplace; aiStageReplace = -1;
      try {
        const url = await aiCompressChecked(files[0]);
        if (url && aiStage) aiStage.photos[idx] = url;
      } catch { toast(t('ai.failed'), true); }
      if (aiStage) aiStageShow();
      return;
    }
    const urls = [];
    for (const f of files) {
      try { const url = await aiCompressChecked(f); if (url) urls.push(url); }
      catch { toast(t('ai.failed'), true); }
    }
    if (!urls.length) return;
    const had = aiStage ? aiStage.photos.length : 0;
    const room = AI_MAX_PHOTOS - had;
    if (urls.length > room) toast(t('aiMulti.max'), true); // la sexta NO entra, y se dice
    const take = urls.slice(0, Math.max(0, room));
    if (!take.length) { if (aiStage) aiStageShow(); return; }
    /* Una sola foto y sin preparación abierta: el flujo de siempre. */
    if (!aiStage && files.length === 1) { aiStartPhotos(take); return; }
    if (!aiStage) { aiDiscard(); aiStage = { photos: [] }; }
    aiStage.photos.push(...take);
    aiStageShow();
  });
}
/* UX10-4 + UX10-6 (piloto, 2026-10-23): el flujo de foto ARRANCA con
   una tarjeta previa, ANTES de capturar — el usuario del piloto se
   sorprendió de noche de que la foto del desayuno «ya no estaba»:
   la foto de comida NO se guarda y hay que saberlo antes de hacerla,
   no solo en «Permisos y privacidad» (perm.photoNote, que se queda).
   La misma tarjeta explica el tope diario de análisis tal como el
   Worker M8 lo aplica de verdad (verificado en su código): contador
   por usuario y día compartido por foto y texto (un análisis
   completo suele gastar 2 peticiones: /identify o /identify-text +
   /calculate); sin límite fijado en ningún nivel NO hay tope; al
   alcanzarlo, foto y texto se pausan hasta el día siguiente y el
   registro manual sigue disponible (no pasa por el Worker). */
function aiIntroShow() {
  if (!aiEndpoint()) { toast(t('ai.unavailable'), true); return; }
  aiShow(`<h3>${t('ai.introTitle')}</h3><p class="progress-hint">${t('ai.photoNotSaved')}</p><p class="progress-hint">${t('ai.limitNote')}</p><div class="ai-actions"><button type="button" class="btn-main btn-sm" id="ai-intro-take">${t('ai.introTake')}</button><button type="button" class="btn-ghost btn-sm" id="ai-intro-cancel">${t('ai.discard')}</button></div>`);
  const tk = $('ai-intro-take');
  if (tk) tk.onclick = () => { const f = $('ai-file'); if (f) f.click(); };
  const cc = $('ai-intro-cancel');
  if (cc) cc.onclick = () => { if (aiStage) aiStageDiscard(); else aiClosePanel(); };
}
/* El botón redondo «Comida» del dock es un <label> que envuelve el
   input de archivo: sin interceptar, tocarlo abre la cámara/galería
   al instante y no existe ningún «antes de capturar». Se intercepta
   SOLO el toque sobre el label (el target NO es el input); los clics
   cuyo target ES el input (el botón «Tomar o elegir la foto» de la
   tarjeta, «Añadir otra foto» y el reemplazo de miniaturas de la
   preparación, y las baterías que fijan archivos sobre el input)
   siguen el flujo de siempre, sin pasar por la tarjeta. */
const foodDockLabel = $('btn-round-food');
if (foodDockLabel) foodDockLabel.addEventListener('click', e => {
  if (e.target && e.target.id === 'ai-file') return;
  e.preventDefault();
  aiIntroShow();
});

/* «Analizar la descripción con IA» (formulario manual, Ronald
   2026-10-22): la descripción escrita pasa a ser la identificación
   (aiStartText) y el resto del flujo es el del análisis de foto.
   La comida elegida en el formulario se conserva como la comida del
   registro — no se hereda en silencio otra. Descripción vacía o de
   un solo carácter: NO se llama al proveedor y se avisa con toast.
   El espejo de borrador del formulario se desarma (como al cancelar)
   para que no siga copiando un formulario ya cerrado. */
const mAiTextBtn = $('m-ai-text-btn');
if (mAiTextBtn) mAiTextBtn.addEventListener('click', () => {
  const desc = (($('m-desc') && $('m-desc').value) || '').trim();
  if (desc.length < 2) { toast(t('aiText.tooShort'), true); return; }
  if (!aiEndpoint()) { toast(t('ai.unavailable'), true); return; }
  const mealSel = $('m-meal');
  const chosenMeal = mealSel && mealSel.value ? mealSel.value : null;
  try { pendDraftDisarm(); } catch {}
  const mm = $('meal-modal'); if (mm) mm.style.display = 'none';
  aiStartText(desc);
  if (chosenMeal && aiState) aiState.meal = chosenMeal;
});
/* Apertura del modal de comida con enfoque visible en el formulario. */
function aiOpenMealModal() {
  const m = $('meal-modal');
  if (m) {
    m.style.display = '';
    try { m.scrollIntoView({ block: 'center' }); } catch {}
  }
  const f = $('m-food');
  if (f) { try { f.focus({ preventScroll: true }); } catch {} }
}
/* ============ DESGLOSE POR ALIMENTO (Ronald, 2026-10-21) ============
   «Que no coloque la comida completa sino que sepa separar qué
   elemento provocó el aumento de ese valor»: el cálculo M8 devuelve
   valores POR ALIMENTO (r2.items), pero hasta hoy solo se guardaban
   los totales del registro y el desglose se perdía al guardar. Desde
   ahora, al guardar DESDE EL ANÁLISIS se persiste también el desglose
   en el propio documento (campo items: nombre + kcal/prot/carb/
   sugar/fat por alimento), con los valores FINALES que la persona
   dejó en la pantalla de resultado: el nombre es el corregido por
   ella (emparejado por orden con r2.items, igual que la lista del
   resultado), kcal entero como se muestra y el resto a 1 decimal.
   REGLA DE HONESTIDAD: el desglose SOLO se guarda si su suma iguala
   los totales que se guardan (las cinco métricas, con la tolerancia
   de redondeo de la propia pantalla — ±0,5 — porque el panel trabaja
   con totales enteros). Si la persona editó los totales y ya no
   cuadra, el registro nace SIN desglose y la leyenda de los anillos
   cae al modo por registro: nunca se reparte un total entre
   alimentos a ojo. */
function aiItemsCandidate() {
  const r2 = aiState && aiState.r2;
  if (!r2 || !Array.isArray(r2.items) || !r2.items.length) return null;
  const known = aiKnownFoods();
  /* Emparejar por orden exige correspondencia 1:1 con los alimentos
     conocidos (los mismos que alimentaron el cálculo); sin ella no
     se puede atribuir cada item a su alimento con certeza. */
  if (known.length !== r2.items.length) return null;
  const r1d = x => Math.round(num(x) * 10) / 10;
  const items = [];
  for (let i = 0; i < r2.items.length; i++) {
    const it = r2.items[i];
    const name = (known[i].name || '').trim();
    if (!name) return null;
    const item = { name, kcal: Math.round(num(it.kcal)), prot: r1d(it.prot), carb: r1d(it.carb), sugar: r1d(it.sugar), fat: r1d(it.fat) };
    /* UNIDADES POR PIEZA: el ítem conserva la forma en que se contó
       (unit/pieces/gramsPerPiece) y los gramos derivados en
       portion_g: el desglose que alimenta los anillos queda cuadrado
       con los totales Y con lo que la persona vio en la revisión.
       En g/ml el ítem queda EXACTAMENTE como siempre. */
    if (known[i].unit === 'unidad') {
      item.portion_g = Math.round(num(known[i].grams));
      item.unit = 'unidad';
      item.pieces = num(known[i].pieces);
      item.gramsPerPiece = num(known[i].perPiece);
    }
    items.push(item);
  }
  return items;
}
function itemsIfSquare(items, tot) {
  if (!items || !items.length) return null;
  const r1d = x => Math.round(x * 10) / 10;
  for (const k of ['kcal', 'prot', 'carb', 'sugar', 'fat']) {
    const sum = items.reduce((s, it) => s + num(it[k]), 0);
    if (Math.abs(r1d(sum) - r1d(num(tot[k]))) > 0.5) return null;
  }
  return items;
}
/* Refuerzo H-2 (defecto confirmado por Ronald en producción, 2026-10-17:
   tocó «Usar como borrador» y no pasó nada visible): el relleno es campo
   a campo y tolerante a fallos individuales; el modal se abre SIEMPRE,
   aunque un campo falle; y cualquier fallo muestra un toast de error
   en vez de silencio. El diagnóstico en motor real (390×844, formas del
   caso real) no reprodujo el fallo — ver h2-diagnostico.mjs. */
function aiUseDraft(r1, r2) {
  let failed = false;
  const set = (id, val) => {
    try { const el = $(id); if (el) el.value = val; else failed = true; }
    catch { failed = true; }
  };
  try {
    const tot = (r2 && r2.totals) || {};
    /* PAQUETE 2: el borrador hereda la comida ELEGIDA en el flujo y las
       métricas EDITADAS en el panel, si la persona las ajustó — el
       formulario recibe los valores confirmados, no los crudos. */
    aiCaptureMeal();
    aiCaptureMetrics();
    const mealSel = (typeof aiState !== 'undefined' && aiState && aiState.meal) || null;
    const mvals = (typeof aiState !== 'undefined' && aiState && aiState.metrics) || {};
    const mval = k => (mvals[k] != null && mvals[k] !== '') ? Math.round(num(mvals[k])) : Math.round(tot[k] || 0);
    set('m-date', ($('dateSel') && $('dateSel').value) || todayISO());
    if (mealSel) set('m-meal', mealSel);
    /* FUENTE ÚNICA: el formulario recibe el nombre y la cantidad TAL
       COMO se vieron y editaron en el resultado (aiRecordName /
       aiQtyString) — nada de una segunda derivación que revisar. */
    set('m-food', aiRecordName());
    set('m-qty', aiQtyString());
    set('m-kcal', mval('kcal'));
    set('m-prot', mval('prot'));
    set('m-carb', mval('carb'));
    set('m-sugar', mval('sugar'));
    set('m-fat', mval('fat'));
    /* SIN ECO EN NOTAS (Ronald, 2026-10-19: «Esta información está de
       más»): el borrador NO hereda el desglose «alimento: kcal · …» en
       las notas — ese detalle vive en la pantalla de resultado. El campo
       queda LIMPIO para lo que la persona quiera escribir a mano. */
    set('m-notes', '');
    /* El desglose por alimento viaja como CANDIDATO en el borrador:
       el guardado del formulario lo valida contra los totales
       FINALES (itemsIfSquare) antes de persistirlo. */
    /* Marca de origen VERAZ: el borrador conserva la vía de entrada
       (foto = 'ai', descripción = 'ai-text') y el envío del formulario
       la escribe tal cual en el registro. */
    const fromText = !!(typeof aiState !== 'undefined' && aiState && aiState.mode === 'text');
    /* La identidad de guardado de la revisión viaja al borrador: el
       envío del formulario escribirá el MISMO documento que el
       guardado directo de esta revisión (ver aiNewSaveId). */
    aiDraft = { model: (r2 && r2.model) || 'gemini', rangeKcal: Array.isArray(tot.range_kcal) ? tot.range_kcal : null, items: aiItemsCandidate(), src: fromText ? 'ai-text' : 'ai', saveId: (typeof aiState !== 'undefined' && aiState && aiState.saveId) || null };
    try {
      const b = $('m-ai-banner');
      if (b) {
        b.style.display = '';
        b.textContent = t(fromText ? 'aiText.banner' : 'ai.banner') + (aiDraft.rangeKcal ? ' ' + t('ai.range').replace('{a}', Math.round(aiDraft.rangeKcal[0])).replace('{b}', Math.round(aiDraft.rangeKcal[1])) : '');
      }
    } catch { failed = true; }
  } catch { failed = true; }
  aiDiscard();
  aiOpenMealModal();
  if (failed) toast(t('ai.draftError'), true);
}
function aiClearDraft() {
  aiDraft = null;
  const b = $('m-ai-banner');
  if (b) { b.style.display = 'none'; b.textContent = ''; }
}
let aiSaving = false; // guardia del guardado directo (se suma a mealSaving, la del formulario)
/* Guardado DIRECTO desde el resultado (PAQUETE 2, Ronald 2026-10-18):
   escribe el registro SIN pasar por otro formulario, con los valores
   CONFIRMADOS en el panel — métricas editadas, comida elegida en el
   flujo, alimentos corregidos — y la MISMA forma de documento que el
   envío de #form-meal (incl. source:'ai' y ai:{model, rangeKcal}).
   El éxito se anuncia SOLO tras confirmar la escritura, con las kcal
   guardadas y el total del día recalculado desde una recarga fresca
   (una sola actualización visible, sin doble conteo). Ante un fallo,
   el panel CONSERVA todos los cambios, muestra el error y permite
   reintentar: el reintento NO duplica porque la escritura usa el id
   estable de la revisión (aiState.saveId, setDoc), no un documento
   nuevo por intento. */
async function aiSaveDirect() {
  if (!aiState || aiState.step !== 'draft' || aiSaving || mealSaving) return;
  aiCaptureMetrics();
  aiCaptureMeal();
  const foods = aiKnownFoods();
  if (!foods.length) { toast(t('err.mealMissing'), true); return; }
  const tot = (aiState.r2 && aiState.r2.totals) || {};
  const m = aiState.metrics || {};
  const val = k => Math.max(0, num((m[k] != null && m[k] !== '') ? m[k] : (tot[k] || 0)));
  const data = {
    ownerUid: auth.currentUser.uid,
    date: ($('dateSel') && $('dateSel').value) || todayISO(),
    meal: aiState.meal || aiDefaultMeal(),
    /* FUENTE ÚNICA: el nombre y la cantidad son los del panel de
       resultado (vistos y editables allí), no una derivación oculta. */
    food: aiRecordName(),
    qty: aiQtyString(),
    kcal: val('kcal'), prot: val('prot'), carb: val('carb'), sugar: val('sugar'), fat: val('fat'),
    /* SIN ECO EN NOTAS (Ronald, 2026-10-19): el guardado directo ya NO
       escribe la cadena automática de desglose en `notes` — el registro
       nace sin notas; las notas son solo texto escrito a mano. */
    createdAt: serverTimestamp(),
    /* Marca de origen veraz: 'ai' si vino de una foto, 'ai-text' si
       vino de la descripción escrita (ingreso manual con ayuda de IA). */
    source: aiState.mode === 'text' ? 'ai-text' : 'ai',
    ai: { model: (aiState.r2 && aiState.r2.model) || 'gemini', rangeKcal: Array.isArray(tot.range_kcal) ? tot.range_kcal : null }
  };
  /* Desglose por alimento: solo si su suma iguala los totales que se
     guardan (regla de honestidad de aiItemsCandidate/itemsIfSquare). */
  const aiIts = itemsIfSquare(aiItemsCandidate(), data);
  if (aiIts) data.items = aiIts;
  aiSaving = true; mealSaving = true;
  const btn = $('ai-save'); if (btn) btn.disabled = true;
  try {
    /* Idempotencia (corrección del duplicado, 2026-10-23): con el id
       estable de la revisión se escribe SIEMPRE el mismo documento;
       sin id (un estado heredado) se crea como antes. */
    if (aiState.saveId) await setDoc(doc(db, 'nutrition_meals', aiState.saveId), data);
    else await addDoc(collection(db, 'nutrition_meals'), data);
    aiDiscard();
    await loadAllKeepDate(data.date);
    const dayTotal = (MEALS[data.date] || []).reduce((s, x) => s + (Number(x.kcal) || 0), 0);
    toast(t('ai.savedInfo', { kcal: Math.round(data.kcal), total: Math.round(dayTotal) }));
  } catch {
    if (aiState) { aiState.saveError = true; aiState.step = 'draft'; aiRender(); }
    toast(t('ai.saveError'), true);
  } finally {
    aiSaving = false; mealSaving = false;
  }
}

/* ================= PRIVACIDAD Y DATOS (cliente) =================
   Nota: si en el futuro se activa Firebase Storage (Blaze), la eliminación
   debe borrar también los objetos de Storage referenciados en photoPath. */
/* ============ CONSENTIMIENTO: estado y renovación (Fase 1 H-C1) ============
   El consentimiento es independiente de la aprobación (decisión del
   entrenador) y del rol de propietario. La renovación registra una
   aceptación NUEVA (fecha + versión) y CONSERVA consentWithdrawnAt
   como historial: nunca se borra ni se reescribe. */
const TERMS_VERSION = 'v3-2026-10-16'; // v3: cláusulas 6 y 8 corregidas (Paso C)
function tsMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const n = new Date(ts).getTime();
  return isNaN(n) ? 0 : n;
}
/* ===== Recibos de consentimiento (A2) =====
   Cada transición de consentimiento se escribe en UN solo lote
   con su recibo en consent_receipts/{uid}_{seq}; las reglas r3
   exigen ambas escrituras juntas (integridad bidireccional
   verificada en el experimento C2). El recibo lleva solo
   metadatos: uid, correo de la cuenta, tipo, versión y la marca
   del servidor — nunca respuestas de salud. */
const receiptRef = rid => doc(db, 'consent_receipts', rid);
async function freshUserDoc(uid) {
  const s = await getDoc(doc(db, 'users', uid));
  return s.exists() ? s.data() : null;
}
function consentBatch(uid, cur, cambios, type, version) {
  const prevSeq = cur && Number.isInteger(cur.consentSeq) ? cur.consentSeq : 0;
  const seq = prevSeq + 1;
  const rid = uid + '_' + seq;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), { ...cambios, consentSeq: seq, consentReceiptId: rid }, { merge: true });
  batch.set(receiptRef(rid), { uid, email: (cur && cur.email) || (auth.currentUser && auth.currentUser.email) || '', type, version, at: serverTimestamp() });
  return { batch, seq, rid };
}
/* === Protección de la ventana D→E (sonda de época de reglas) ===
   Las operaciones de consentimiento de A2 viajan acopladas a un
   recibo en consent_receipts. Con las reglas H-C1 esa colección no
   existe y todo lote acoplado se deniega; con r3, leer los recibos
   propios está permitido. La sonda distingue la época con SOLO
   LECTURAS: si la lectura se deniega, la app entra en mantenimiento
   para las operaciones de consentimiento y de cuenta (registro,
   renovar/retirar el general, otorgar/renovar/retirar el
   específico y cierre de cuenta) y las bloquea ANTES de cualquier
   escritura — en particular antes del paso 1 del cierre, que borra
   datos propios. Los datos ordinarios (comidas, peso, perfil) no se
   bloquean: funcionan igual bajo ambas reglas. */
let RULES_EPOCH = 'unknown';
async function probeRulesEpoch(uid) {
  /* La sonda se ejecuta SIEMPRE en el momento de la operación y
     SIEMPRE contra el servidor (FromServer): una detección anterior
     —o un resultado servido desde la caché local de Firestore— NO
     habilita nada, porque las reglas activas pueden haber cambiado
     desde entonces (p. ej., una reversión de E). RULES_EPOCH guarda
     solo el último resultado conocido, con fines informativos. */
  try {
    await getDocsFromServer(query(collection(db, 'consent_receipts'), where('uid', '==', uid), limit(1)));
    RULES_EPOCH = 'r3'; return true;
  } catch (e1) {
    try {
      await getDocFromServer(receiptRef(uid + '_1'));
      RULES_EPOCH = 'r3'; return true;
    } catch (e2) {
      if ((e1 && e1.code === 'permission-denied') || (e2 && e2.code === 'permission-denied')) {
        RULES_EPOCH = 'hc1'; return false;
      }
      return false; // sin confirmación del servidor: fail-closed
    }
  }
}
async function consentOpsAllowed() {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) return false;
  if (await probeRulesEpoch(uid)) return true;
  toast(t('sys.maintenance'), true);
  return false;
}
function consentIsActive(u) {
  if (!u || u.acceptedTerms !== true) return false;
  const w = tsMs(u.consentWithdrawnAt);
  if (!w) return true;
  return tsMs(u.termsAcceptedAt) >= w;
}
async function doRenewConsent() {
  if (!auth.currentUser) return false;
  if (!(await consentOpsAllowed())) return false;
  if (!confirm(t('priv.renewConfirm', { v: TERMS_VERSION }))) return false;
  const uid = auth.currentUser.uid;
  try {
    const cur = await freshUserDoc(uid);
    /* A2: la renovación viaja en un lote con su recibo
       'general-renewed'. Renovar restaura el consentimiento,
       nunca la aprobación (que no se toca) ni reactiva
       declaraciones bloqueadas. */
    const { batch, seq, rid } = consentBatch(uid, cur,
      { acceptedTerms: true, termsVersion: TERMS_VERSION, termsAcceptedAt: serverTimestamp() },
      'general-renewed', TERMS_VERSION);
    await batch.commit();
    if (UDATA) { UDATA.consentSeq = seq; UDATA.consentReceiptId = rid; UDATA.acceptedTerms = true; UDATA.termsVersion = TERMS_VERSION; }
    return true;
  } catch (e) { throw e; }
}
/* Simplificación visual (2026-10-18): numera en orden los chips de
   una lista «Gestionar…» contando SOLO los ítems visibles (p. ej.,
   «Renovar» solo cuenta cuando el estado real lo muestra). */
function renumberManageItems(list) {
  if (!list) return;
  let n = 0;
  list.querySelectorAll('.manage-item, .manage-details').forEach(el => {
    if (el.style.display === 'none') return;
    n++;
    const chip = el.querySelector('.menu-num');
    if (chip) chip.textContent = n;
  });
}
/* Botón único «Permisos y privacidad» (decisión de Ronald,
   2026-10-19 15:45): UN solo botón discreto despliega UN panel
   con la coletilla y las DOS secciones («Declaración de salud»
   y «Privacidad y datos»). permsOpen recuerda si el usuario lo
   desplegó, entre re-pintados (p. ej., al cambiar de idioma).
   El cuerpo del panel se muestra con el panel abierto O cuando
   la sección de salud está en un estado de TRABAJO sin vista
   colapsada (el formulario de declaración, siempre visible como
   hasta hoy); las listas de ambas secciones siguen ese estado
   efectivo, y el botón lo refleja (aria-expanded + chevron).
   Abrir/cerrar solo cambia la presentación: no escribe nada. */
let permsOpen = false;
function syncPermsPanel() {
  const body = $('perms-body'); if (!body) return;
  const working = !$('health-manage-list');
  const open = permsOpen || working;
  body.style.display = open ? '' : 'none';
  const hl = $('health-manage-list'); if (hl) hl.style.display = open ? '' : 'none';
  const pl = $('privacy-manage-list'); if (pl) pl.style.display = open ? '' : 'none';
  const btn = $('btn-perms'); if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  const chev = $('perms-chev'); if (chev) chev.textContent = open ? '▴' : '▾';
}
function renderPrivacy() {
  const st = $('privacy-status');
  if (!st) return;
  const fmtD = ts => {
    try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(LANG === 'es' ? 'es-MX' : 'en-US') : ''; } catch { return ''; }
  };
  const active = consentIsActive(UDATA);
  let html;
  if (active) {
    html = `<p class="progress-hint">${t('priv.statusAccepted', { v: esc(UDATA.termsVersion || ''), date: esc(fmtD(UDATA.termsAcceptedAt)) })}</p>`;
    if (UDATA.consentWithdrawnAt && UDATA.termsAcceptedAt)
      html += `<p class="progress-hint">${t('priv.statusHistory', { d: esc(fmtD(UDATA.consentWithdrawnAt)), d2: esc(fmtD(UDATA.termsAcceptedAt)) })}</p>`;
  } else {
    html = `<p class="progress-hint">${t('priv.statusNone')}</p>`;
    if (UDATA.consentWithdrawnAt) html += `<p class="progress-hint">${t('priv.statusWithdrawn')}</p>`;
  }
  st.innerHTML = html;
  /* Corrección A (Paso F, 17/10/2026): el botón de renovar también
     aparece con el consentimiento VIGENTE pero DESACTUALIZADO (la
     versión aceptada difiere de la vigente). Sin esto, una cuenta
     al día no tenía ninguna vía en la interfaz para renovar hacia
     la nueva versión: el botón solo aparecía con el
     consentimiento inactivo. La línea de estado sigue mostrando
     con verdad la versión guardada; la renovación escribe el
     lote acoplado 'general-renewed' de siempre. */
  const outdated = (UDATA.termsVersion || '') !== TERMS_VERSION;
  const rb = $('btn-renew'); if (rb) rb.style.display = (active && !outdated) ? 'none' : '';
  const ra = $('btn-renew-accept'); if (ra) ra.style.display = 'none';
  renumberManageItems($('privacy-manage-list'));
  syncPermsPanel();
}
const MY_DATA_COLLECTIONS = [
  ['nutrition_meals', 'ownerUid'], ['nutrition_weight', 'ownerUid'],
  ['nutrition_progress', 'ownerUid'], ['meal_help', 'ownerUid'],
  ['training_plans', 'clientUid'], ['training_logs', 'clientUid']
];
async function fetchMyDocs(uid) {
  const out = {};
  for (const [name, field] of MY_DATA_COLLECTIONS) {
    out[name] = [];
    try {
      const snap = await getDocs(query(collection(db, name), where(field, '==', uid)));
      /* VERSIONADO (§6.4): la exportación de datos del cliente
         excluye las instantáneas de planes — son historial del
         entrenador, no planes del cliente. */
      snap.forEach(d => { const v = d.data(); if (name === 'training_plans' && v && v.isSnapshot === true) return; out[name].push({ id: d.id, data: v }); });
    } catch {}
  }
  return out;
}
const tsEncode = (v) => {
  if (v && typeof v === 'object') {
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(tsEncode);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tsEncode(x)]));
  }
  return v;
};
/* Botón único «Permisos y privacidad»: SOLO abre/cierra el panel
   (las dos secciones a la vez). No escribe nada, no llama a
   ninguna función de consentimiento y no altera ningún estado. */
$('btn-perms') && $('btn-perms').addEventListener('click', () => {
  permsOpen = !permsOpen;
  syncPermsPanel();
});
syncPermsPanel();
/* Rediseño v2 (2026-10-19): tarjetas colapsables de la vista
   principal («Mi progreso» —que ahora contiene la evolución de
   peso como primer bloque y las fotos como segundo—, «Ayuda con
   comidas» y «Mi plan de entrenamiento»). La cabecera con el título
   (y la acción principal compacta, cuando la hay) queda siempre
   visible; todo el contenido vive en el área desplegable, cerrada
   por defecto. El chevron SOLO abre/cierra: no escribe nada. Las
   áreas son HTML estático que los renders no recrean (pintan en
   contenedores interiores), así que el estado abierto sobrevive a
   re-pintados y al cambio de idioma.
   Jerarquía v3 (2026-10-19): esas tres tarjetas son las
   protagonistas de la página — «Mi progreso» y «Mi plan de
   entrenamiento» tienen por cara un botón PRIMARIO a todo ancho
   (.btn-primary.face-toggle, sin chevron circular separado ni
   subtítulo en la cara) y «Analiza la comida» es primario a todo
   ancho bajo la fila tranquila de título de «Ayuda con comidas»;
   los botones «Gestionar…» bajan a SECUNDARIO (.btn-secondary:
   fondo blanco, borde y texto teal). Mismos ids y handlers: esta
   función sigue alternando el contenido de progreso y plan.
   Fila v4 (2026-10-19): las caras a todo ancho se retiran y las
   tres protagonistas viven en UNA fila horizontal de botones
   REDONDOS (.rounds-row dentro de .main-actions): 📸 «Progreso» y
   🏋️ «Entrenamiento» son botones que abren/cierran sus paneles
   (#progress-content / #train-content, bajo la fila) y 🍽️
   «Comida» es la etiqueta de siempre sobre #ai-file (un toque
   inicia el flujo «Analiza la comida»; no queda otro botón con
   ese nombre en la vista principal). El contenido secundario de
   «Ayuda con comidas» se abre con la fila de texto discreta
   #btn-toggle-mealhelp bajo los redondos; orden de paneles bajo
   la fila: progreso, ayuda, plan. Los ids de los toggles y esta
   función NO cambian: los chevrones ▾/▴ viven ahora en la leyenda
   bajo cada redondo (y en la fila discreta), y el estado abierto
   se enfatiza con CSS sobre [aria-expanded="true"] (anillo en el
   círculo). Las leyendas cortas usan las claves main.* y el
   nombre completo va en aria-label (data-i18n-aria).
   v4.2 (2026-10-19): la fila de redondos FLOTA en un dock fijo
   abajo (.actions-dock, dentro de #tab-track). Como el dock está
   lejos de los paneles, al ABRIR uno de sus paneles (progreso o
   plan, opts.scroll) la página se desplaza suave hasta el panel;
   al cerrar, no se mueve. El toggle de «Ayuda con comidas» sigue
   en su tarjeta, junto a su panel: sin scroll.
   Ajuste «zona del día» (Ronald, 2026-10-19 16:01: «Quita eso»
   sobre la flecha de la cabecera): el control de colapso de
   «Ayuda con comidas» DESAPARECE — ya no hay #btn-toggle-mealhelp
   ni #chev-mealhelp ni cableado en esta función; la sección es
   un encabezado fijo (.mealhelp-head) y #mealhelp-content se
   renderiza SIEMPRE abierto, como una tarjeta normal. Progreso
   y plan conservan sus redondos de siempre. */
function wireCardToggle(btnId, contentId, chevId, opts = {}) {
  const btn = $(btnId); if (!btn) return;
  btn.addEventListener('click', () => {
    const c = $(contentId); if (!c) return;
    const open = c.style.display === 'none';
    c.style.display = open ? '' : 'none';
    const ch = $(chevId); if (ch) ch.textContent = open ? '▴' : '▾';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && opts.scroll) { try { c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }
  });
}
wireCardToggle('btn-toggle-progress', 'progress-content', 'chev-progress', { scroll: true });
wireCardToggle('btn-toggle-train', 'train-content', 'chev-train', { scroll: true });
$('btn-view-notice') && $('btn-view-notice').addEventListener('click', () => {
  const n = $('privacy-notice');
  if (n.style.display === 'none') { n.innerHTML = t('terms.body'); n.style.display = ''; }
  else n.style.display = 'none';
});
$('btn-renew') && $('btn-renew').addEventListener('click', () => {
  const n = $('privacy-notice');
  n.innerHTML = t('terms.body');
  n.style.display = '';
  const ra = $('btn-renew-accept'); if (ra) ra.style.display = '';
});
$('btn-renew-accept') && $('btn-renew-accept').addEventListener('click', async () => {
  if (!auth.currentUser) return;
  try {
    if (!await doRenewConsent()) return;
    UDATA.acceptedTerms = true;
    UDATA.termsVersion = TERMS_VERSION;
    UDATA.termsAcceptedAt = new Date();
    toast(t('priv.renewed'));
    const n = $('privacy-notice'); if (n) n.style.display = 'none';
    renderPrivacy();
  } catch (e) { failToast(e); }
});
$('btn-gate-renew') && $('btn-gate-renew').addEventListener('click', () => {
  const n = $('renew-notice');
  n.innerHTML = t('terms.body');
  n.style.display = '';
  const ra = $('btn-gate-renew-accept'); if (ra) ra.style.display = '';
});
$('btn-gate-renew-accept') && $('btn-gate-renew-accept').addEventListener('click', async () => {
  if (!auth.currentUser) return;
  try {
    if (!await doRenewConsent()) return;
    toast(t('priv.renewed'));
    const box = $('renew-box'); if (box) box.style.display = 'none';
    await signOut(auth);
    showAuthError(t('err.pending'));
  } catch (e) { failToast(e); }
});
$('btn-my-data') && $('btn-my-data').addEventListener('click', async () => {
  if (!auth.currentUser) return;
  toast(t('priv.working'));
  const uid = auth.currentUser.uid;
  const mine = await fetchMyDocs(uid);
  const plain = {};
  for (const [name] of MY_DATA_COLLECTIONS) plain[name] = mine[name].map(x => ({ id: x.id, ...x.data }));
  /* La exportación del PROPIO cliente incluye sus declaraciones de
     salud (son sus datos). Las exportaciones del entrenador, en
     cambio, excluyen las respuestas bloqueadas (aprobación v1). */
  let myDecls = [];
  try { myDecls = await fetchDeclarations(uid); } catch {}
  const payload = { exportedAt: new Date().toISOString(), profile: { ...UDATA }, ...plain, healthDeclarations: myDecls };
  const blob = new Blob([JSON.stringify(tsEncode(payload), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ronbo-nutri-my-data.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t('priv.downloaded'));
});
$('btn-withdraw') && $('btn-withdraw').addEventListener('click', async () => {
  if (!auth.currentUser) return;
  if (!confirm(t('priv.withdrawConfirm'))) return;
  if (!(await consentOpsAllowed())) return;
  const uid = auth.currentUser.uid;
  try {
    const cur = await freshUserDoc(uid);
    const { batch } = consentBatch(uid, cur,
      { consentWithdrawnAt: serverTimestamp(), acceptedTerms: false, approved: false },
      'general-withdrawn', (cur && cur.termsVersion) || TERMS_VERSION);
    await batch.commit();
  } catch (e) { failToast(e); return; }
  toast(t('priv.withdrawn'));
  await signOut(auth);
});
$('btn-delete-account') && $('btn-delete-account').addEventListener('click', async () => {
  if (!auth.currentUser) return;
  if (!confirm(t('priv.deleteConfirm'))) return;
  if (!confirm(t('priv.deleteConfirm'))) return;
  if (!(await consentOpsAllowed())) return;
  const user = auth.currentUser;
  const uid = user.uid;
  toast(t('priv.working'));
  /* Orden de cierre (corregido tras la revisión de escenarios):
     1) se leen las listas de datos propios (solo lecturas);
     2) LOTE DE CIERRE ATÓMICO PRIMERO (recibo 'account-closed' +
     borrar el documento de usuario): si las reglas activas lo
     deniegan, NO se ha borrado nada y la cuenta sigue intacta —
     así, ni una reversión de reglas a mitad de sesión ni una app
     con la época en caché pueden producir un cierre parcial;
     3) borrado de datos propios y declaraciones (las reglas los
     permiten por uid/propietario aunque el documento de usuario ya
     no exista); los fallos se cuentan y se dicen con verdad;
     4) identidad de Auth, al final. */
  const mine = await fetchMyDocs(uid);
  let decls = [];
  try { decls = await fetchDeclarations(uid); } catch {}
  try {
    const cur = await freshUserDoc(uid);
    const closeBatch = writeBatch(db);
    closeBatch.set(receiptRef(uid),
      { uid, email: (cur && cur.email) || user.email || '', type: 'account-closed', version: (cur && cur.termsVersion) || TERMS_VERSION, at: serverTimestamp() });
    closeBatch.delete(doc(db, 'users', uid));
    await closeBatch.commit();
  } catch { toast(t('priv.deleteFail'), true); return; }
  let pending = 0;
  for (const [name] of MY_DATA_COLLECTIONS)
    for (const x of mine[name]) { try { await deleteDoc(doc(db, name, x.id)); } catch { pending++; } }
  /* Las subcolecciones no se borran al borrar el documento padre:
     las declaraciones se eliminan una a una. */
  for (const d of decls) { try { await deleteDoc(doc(declCol(uid), d.id)); } catch { pending++; } }
  try {
    await deleteUser(user);
    toast(pending ? t('priv.closedDataPending') : t('priv.deleted'), pending ? true : false);
  } catch {
    /* La identidad de Auth sigue viva (p. ej.,
       requires-recent-login): se dice la verdad y el cierre de la
       identidad se completa al volver a iniciar sesión; si quedó
       algún dato pendiente, lo completa el procedimiento manual. */
    toast(t('priv.dataDeletedFinish'), true);
    await signOut(auth);
  }
});

/* ================= DECLARACIÓN DE SALUD Y CONSENTIMIENTO ESPECÍFICO (v1) =================
   Las respuestas de salud viven FUERA del documento general, en la
   subcolección users/{uid}/healthDeclarations (Decisiones 6 y 7 +
   aprobación v1 del 16/10/2026). El estado del consentimiento
   específico (solo metadatos, sin respuestas) vive en
   users/{uid}.healthConsent. Principios de esta versión:
   - Renovar el específico permite una declaración NUEVA; nunca
     reactiva las anteriores (quedan 'blocked', inmutables).
   - La recuperación (consulta/reutilización de bloqueadas por el
     entrenador) NO existe en esta versión.
   - El cliente consulta sus bloqueadas; no puede modificarlas.
   - El entrenador solo lee la declaración VIGENTE y solo con
     consentimiento específico activo; nunca escribe respuestas.
   - Retirar el específico bloquea la vigente; no borra nada. */
const SPEC_VERSION = 'v1-2026-10-16';
const HEALTH_CONDITIONS = ['Hipertensión', 'Diabetes', 'Problemas del corazón',
  'Dolor de pecho al ejercitarse', 'Mareos o desmayos', 'Asma / problemas respiratorios',
  'Lesiones articulares o musculares', 'Cirugía reciente', 'Embarazo', 'Ninguna de las anteriores'];
let MY_DECLS = [];
/* Estado de la carga de declaraciones: 'loading' | 'ok' | 'error'.
   Distingue «cargado, sin declaraciones» de «no se pudo cargar»:
   un fallo de red jamás debe pintarse como ausencia de declaración. */
let declLoadState = 'loading';
let healthEditing = false;
/* El estado abierto del panel único «Permisos y privacidad»
   (permsOpen) se declara junto a syncPermsPanel, más arriba. */
const specOf = u => (u && u.healthConsent) || null;
const specIsActive = u => { const s = specOf(u); return !!s && s.status === 'accepted'; };
const declCol = uid => collection(db, 'users', uid, 'healthDeclarations');
const activeDecl = () => MY_DECLS.find(d => d.state === 'active') || null;
async function fetchDeclarations(uid) {
  const snap = await getDocs(declCol(uid));
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  out.sort((a, b) => (a.version || 0) - (b.version || 0));
  return out;
}
async function fetchClientHealth(uid, userData) {
  /* Consulta condicionada del entrenador: solo la declaración vigente
     y solo si el consentimiento específico del cliente está activo. */
  if (!userData || !specIsActive(userData)) return { available: false, decl: null };
  try {
    const snap = await getDocs(query(declCol(uid), where('state', '==', 'active')));
    let decl = null;
    snap.forEach(d => { decl = { id: d.id, ...d.data() }; });
    return { available: !!decl, decl };
  } catch { return { available: false, decl: null }; }
}
/* Resumen veraz de una declaración (corrección 2026-10-18): el «—»
   anterior mezclaba casos distintos. Diagnóstico: (a) declaración
   con condiciones → se listan (sin cambios); (b) declaración ACTIVA
   sin condiciones — p. ej., quien marcó solo «Ninguna de las
   anteriores», que saveDeclaration filtra de la lista — → texto
   propio «Activa · sin condiciones declaradas» (la etiqueta de la
   pastilla ya dice «Declaración de salud:»; pulido 2026-10-19);
   (c) declaración no activa (bloqueada) sin condiciones → «Sin
   condiciones declaradas»; (d) fallo de CARGA → nunca llega aquí:
   loadMyHealth marca declLoadState='error' y el panel muestra
   health.declLoadError, jamás una ausencia fingida. */
function declSummaryHTML(d) {
  const conds = (d.conditions || []).map(condName);
  let body;
  if (conds.length) body = esc(conds.join(', '));
  else if (d.state === 'active') body = esc(t('health.declActiveNoConds'));
  else body = esc(t('health.declNoConds'));
  return `<div class="health-alert">🏥 <b>${t('client.healthDecl')}</b> ${body}${d.details ? '<br>' + esc(d.details) : ''}</div>`;
}
function declFormHTML(d) {
  const sel = new Set((d && d.conditions) || []);
  const grid = HEALTH_CONDITIONS.map(v =>
    `<label><input type="checkbox" class="h-cond" value="${esc(v)}"${sel.has(v) ? ' checked' : ''}> ${esc(condName(v))}</label>`).join('');
  return `<p class="health-hint">${t('health.hint')}</p>
    <div class="health-grid">${grid}</div>
    <label><span>${t('health.details')}</span>
      <textarea id="h-details" rows="2" placeholder="${esc(t('health.detailsPh'))}">${esc((d && d.details) || '')}</textarea></label>
    <label class="consent-check"><input type="checkbox" id="h-truth"> <span>${t('health.ok')}</span></label>
    <button type="button" class="btn-primary btn-sm" id="btn-decl-save">${t('health.saveDecl')}</button>`;
}
function blockedListHTML() {
  const blocked = MY_DECLS.filter(d => d.state === 'blocked');
  if (!blocked.length) return '';
  const fmtD = ts => { try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(LANG === 'es' ? 'es-MX' : 'en-US') : ''; } catch { return ''; } };
  return `<h3 class="history-title">${t('health.blockedTitle')}</h3>
    <p class="progress-hint">${t('health.blockedNote')}</p>` +
    blocked.map(d => `<div class="wempty" style="text-align:left"><b>${t('health.versionLabel', { n: d.version || '?', date: esc(fmtD(d.declaredAt)) })}</b><br>${declSummaryHTML(d)}</div>`).join('');
}
/* Simplificación visual (2026-10-18): piezas de la lista
   «Gestionar mi declaración de salud». El botón solo abre/cierra la
   lista; las acciones conservan ids, textos, diálogos y efectos.
   El despliegue de las cuatro acciones conserva su texto íntegro y,
   como ítem de la lista, se sigue desplegando en su sitio. */
function fourActionsItemHTML() {
  return `<details class="spec-details manage-details"><summary><span class="menu-num"></span><span class="manage-label">${t('health.fourActionsTitle')}</span><span class="manage-go">›</span></summary><p class="progress-hint manage-details-body">${t('health.fourActions')}</p></details>`;
}
function fourActionsDetailsHTML() {
  return `<details class="spec-details"><summary>${t('health.fourActionsTitle')}</summary><p class="progress-hint">${t('health.fourActions')}</p></details>`;
}
/* Rediseño v2 (2026-10-19): TODA la información de la tarjeta vive
   DENTRO del área desplegada, sin título ni estados duplicados
   fuera. Al abrir: primero el bloque de información/estado
   (infoHTML), después la lista numerada de acciones (itemsHTML) y
   al final los anexos (extraHTML: sección legal del otorgamiento
   e historial de bloqueadas).
   Botón único (decisión de Ronald, 2026-10-19 15:45): ya no hay
   botón por tarjeta; la lista vive en la sección «Declaración de
   salud» del panel único «Permisos y privacidad» y su
   visibilidad la sincroniza syncPermsPanel con el estado del
   panel (permsOpen), como la de privacidad. */
function healthManageListHTML(infoHTML, itemsHTML, extraHTML = '') {
  return `<div class="manage-list" id="health-manage-list"${permsOpen ? '' : ' style="display:none"'}>${infoHTML ? `<div class="manage-info">${infoHTML}</div>` : ''}${itemsHTML}${extraHTML}</div>`;
}
/* La sección legal del otorgamiento (texto completo + casilla +
   botón principal) es EXACTAMENTE la de siempre; en los estados
   sin otorgar nace oculta y la revela el ítem de otorgar de la
   lista, sin cambiar su estructura ni su comportamiento (E1). */
function specLegalHTML(grantBtnId, grantLabel) {
  return `<div id="spec-legal" style="display:none">
      <details class="spec-details" id="spec-details">
        <summary>${t('health.specFullTitle')}</summary>
        <label class="consent-check"><input type="checkbox" id="spec-ok"> <span>${t('health.specText')}</span></label>
      </details>
      <button type="button" class="btn-primary btn-sm" id="${grantBtnId}">${grantLabel}</button>
    </div>`;
}
function renderHealthPanel() {
  const box = $('health-panel-body');
  if (!box || !auth.currentUser) return;
  const fmtD = ts => { try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(LANG === 'es' ? 'es-MX' : 'en-US') : ''; } catch { return ''; } };
  const spec = specOf(UDATA);
  const act = activeDecl();
  let html = '';
  let fourActionsInList = false;
  let blockedInList = false;
  const withdrawItem = `<button type="button" class="manage-item danger" id="btn-spec-withdraw"><span class="menu-num"></span><span class="manage-label">${t('health.withdrawSpec')}</span><span class="manage-go">›</span></button>`;
  if (specIsActive(UDATA)) {
    const statusP = `<p class="progress-hint">${t('health.statusActive', { v: esc(spec.version || ''), date: esc(fmtD(spec.acceptedAt)) })}</p>`;
    if (declLoadState === 'error') {
      /* Fallo de carga de las declaraciones: mensaje propio y
         veraz — nunca se pinta como «sin declaración» ni como un
         formulario vacío. En v2 el mensaje vive dentro del área
         desplegada y retirar el específico sigue disponible como
         ítem de la lista, con su confirmación de siempre; las
         cuatro acciones van como ítem, igual que en la vista
         normal (antes cerraban la tarjeta como despliegue suelto). */
      html += healthManageListHTML(
        statusP + `<div class="health-alert">⚠️ ${t('health.declLoadError')}</div>`,
        fourActionsItemHTML() + withdrawItem, '');
      fourActionsInList = true;
    } else if (act && !healthEditing) {
      html += healthManageListHTML(
        statusP + `<h3 class="history-title">${t('health.currentTitle')}</h3>${declSummaryHTML(act)}`,
        `<button type="button" class="manage-item" id="btn-decl-edit"><span class="menu-num"></span><span class="manage-label">${t('health.editDecl')}</span><span class="manage-go">›</span></button>`
        + fourActionsItemHTML()
        + withdrawItem,
        blockedListHTML());
      fourActionsInList = true;
      blockedInList = true;
    } else {
      /* Formulario de edición (o primera declaración): es un estado
         de TRABAJO al que se llega pulsando «Editar» u otorgando;
         no tiene vista colapsada y se renderiza como siempre —
         estado, formulario, retirar y cuatro acciones al final —
         para no tocar el flujo (v2 no cambia esta pantalla). */
      html += statusP;
      html += declFormHTML(act);
      html += `<div class="privacy-btns"><button type="button" class="btn-ghost btn-sm danger" id="btn-spec-withdraw">${t('health.withdrawSpec')}</button></div>`;
    }
  } else if (spec && spec.status === 'withdrawn') {
    html += healthManageListHTML(
      `<p class="progress-hint">${t('health.statusWithdrawnSpec')}</p>
      <p class="progress-hint">${t('health.specSummary')}</p>`,
      `<button type="button" class="manage-item" id="btn-grant-reveal"><span class="menu-num"></span><span class="manage-label">${t('health.renewSpec')}</span><span class="manage-go">›</span></button>`
      + fourActionsItemHTML(),
      specLegalHTML('btn-spec-renew', t('health.renewSpec')) + blockedListHTML());
    fourActionsInList = true;
    blockedInList = true;
  } else {
    html += healthManageListHTML(
      `<p class="progress-hint">${t('health.statusNone')}</p>
      <p class="progress-hint">${t('health.specSummary')}</p>`,
      `<button type="button" class="manage-item" id="btn-grant-reveal"><span class="menu-num"></span><span class="manage-label">${t('health.startBtn')}</span><span class="manage-go">›</span></button>`
      + fourActionsItemHTML(),
      specLegalHTML('btn-spec-start', t('health.startBtn')) + blockedListHTML());
    fourActionsInList = true;
    blockedInList = true;
  }
  if (!blockedInList) html += blockedListHTML();
  /* E1 (17/10/2026): las cuatro acciones, en un despliegue cerrado
     por defecto; el texto se conserva íntegro. El resumen del
     consentimiento específico se identifica como resumen y el
     texto completo —que es el que rige— va junto a la casilla
     dentro de su despliegue, sin premarcarla; al intentar otorgar
     con el despliegue cerrado, grantSpec lo abre primero.
     Simplificación visual (18/10/2026): en las vistas con lista
     «Gestionar…» el despliegue es un ítem más de la lista; en el
     formulario de edición (cuyo diseño no cambia) sigue al final,
     como hasta hoy.
     Rediseño v2 (19/10/2026): en las vistas con lista, la sección
     legal del otorgamiento y el historial de bloqueadas van como
     anexos DENTRO del área desplegada, tras las acciones. */
  if (!fourActionsInList) html += fourActionsDetailsHTML();
  box.innerHTML = html;
  /* Botón único «Permisos y privacidad»: ningún botón por tarjeta
     que pintar ni tarjeta que ocultar — el panel único sincroniza
     la visibilidad de su cuerpo y de ambas listas. En el estado
     de edición (sin lista) el cuerpo queda visible como estado
     de trabajo, igual que la tarjeta se veía siempre hasta hoy. */
  syncPermsPanel();
  const wire = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  wire('btn-spec-start', () => grantSpec(false));
  wire('btn-spec-renew', () => grantSpec(true));
  wire('btn-spec-withdraw', withdrawSpec);
  wire('btn-decl-edit', () => { healthEditing = true; renderHealthPanel(); });
  wire('btn-decl-save', saveDeclaration);
  wire('btn-grant-reveal', () => {
    const s = $('spec-legal'); if (!s) return;
    s.style.display = '';
    const det = $('spec-details'); if (det) det.scrollIntoView({ block: 'nearest' });
  });
  renumberManageItems($('health-manage-list'));
  /* Módulo Nivel 2 (desarrollo): la sección de estimación visual
     de tipo corporal vive en el mismo panel único y se repinta
     con él (también al cambiar de idioma). */
  try { renderBtPanel(); } catch {}
}
async function grantSpec(isRenew) {
  if (!auth.currentUser) return;
  /* E1: al otorgar, el texto completo debe estar desplegado junto
     a la casilla: si el despliegue está cerrado, se abre y se pide
     leer y marcar — la casilla nunca se premarca. */
  const det = $('spec-details');
  if (det && !det.open) { det.open = true; toast(t('health.needSpec'), true); return; }
  const ok = $('spec-ok');
  if (!ok || !ok.checked) { toast(t('health.needSpec'), true); return; }
  if (isRenew && !confirm(t('health.renewSpecConfirm'))) return;
  if (!(await consentOpsAllowed())) return;
  try {
    const uid = auth.currentUser.uid;
    const cur = await freshUserDoc(uid);
    const prev = specOf(cur) || {};
    const next = { status: 'accepted', version: SPEC_VERSION, acceptedAt: serverTimestamp() };
    if (prev.withdrawnAt) next.withdrawnAt = prev.withdrawnAt; // el historial de retirada se conserva
    /* A2: otorgar/renovar viaja en un lote con su recibo
       ('specific-granted' o 'specific-renewed', según el estado
       previo real). Renovar habilita una declaración NUEVA;
       nunca reactiva las bloqueadas. */
    const { batch, seq, rid } = consentBatch(uid, cur, { healthConsent: next },
      isRenew ? 'specific-renewed' : 'specific-granted', SPEC_VERSION);
    await batch.commit();
    UDATA.consentSeq = seq; UDATA.consentReceiptId = rid;
    UDATA.healthConsent = { status: 'accepted', version: SPEC_VERSION, acceptedAt: new Date(), ...(prev.withdrawnAt ? { withdrawnAt: prev.withdrawnAt } : {}) };
    healthEditing = true; // tras otorgar/renovar, se muestra el formulario de la declaración (nueva)
    toast(isRenew ? t('health.renewedSpec') : t('health.specGranted'));
    renderHealthPanel();
  } catch (e) { failToast(e); }
}
async function withdrawSpec() {
  if (!auth.currentUser) return;
  if (!confirm(t('health.withdrawSpecConfirm'))) return;
  if (!(await consentOpsAllowed())) return;
  try {
    const uid = auth.currentUser.uid;
    const cur = await freshUserDoc(uid);
    const prev = specOf(cur) || {};
    const next = { status: 'withdrawn', version: prev.version || SPEC_VERSION, withdrawnAt: serverTimestamp() };
    if (prev.acceptedAt) next.acceptedAt = prev.acceptedAt; // se conserva la fecha de aceptación como historial
    /* A2: UN solo lote — consentimiento retirado + su recibo
       'specific-withdrawn' + bloqueo de la declaración vigente. */
    const { batch, seq, rid } = consentBatch(uid, cur, { healthConsent: next }, 'specific-withdrawn', next.version);
    const act = activeDecl();
    if (act) batch.update(doc(declCol(uid), act.id), { state: 'blocked', blockedAt: serverTimestamp() });
    await batch.commit();
    UDATA.consentSeq = seq; UDATA.consentReceiptId = rid;
    UDATA.healthConsent = { status: 'withdrawn', version: next.version, withdrawnAt: new Date(), ...(prev.acceptedAt ? { acceptedAt: prev.acceptedAt } : {}) };
    if (act) { act.state = 'blocked'; }
    healthEditing = false;
    toast(t('health.withdrawnSpec'));
    renderHealthPanel();
  } catch (e) { failToast(e); }
}
/* ================= ESTIMACIÓN VISUAL DE TIPO CORPORAL (Nivel 2 — SOLO DESARROLLO) =================
   Autorización expresa de Ronald (correo memphis, 2026-10-23 21:37):
   implementar en DESARROLLO sin esperar al abogado, con D-06
   (validación jurídica) y D-14 (texto final del consentimiento)
   PENDIENTES: el texto que se muestra es el BORRADOR vigente y se
   etiqueta como borrador en pantalla, nunca como texto final.
   Nombre honesto SIEMPRE: «estimación visual de tipo corporal» —
   clasificación visual gruesa en 3 categorías; NO es medición
   Heath-Carter (faltan pliegues y diámetros) ni diagnóstico.
   D-09 (ACTUALIZADO por decisión expresa de Ronald, correo memphis
   2026-10-24 00:27): la retención cero DEJA de ser requisito
   eliminatorio y el proveedor de este módulo es el MISMO del M8:
   Google Gemini (nivel pagado, modelo gemini-3.8-flash) tras el
   Worker. Retención REAL, declarada sin suavizar en el propio
   consentimiento: en el nivel pagado Google NO usa prompts ni
   archivos para mejorar sus productos, pero SÍ registra prompts y
   respuestas — fotos incluidas — durante un periodo limitado, con
   el único fin de vigilar abusos; Google no publica la duración
   exacta. NO es retención cero. La transmisión vive tras la
   interfaz BT_PROVIDER (proveedor gemini-m8; ruta /bodytype del
   Worker: ruta /bodytype DESPLEGADA el 2026-10-24 junto a este
   paquete; sin esa ruta, la petición falla con el aviso honesto
   de siempre y no se guarda nada).
   Cadena CORTADA: la estimación jamás alimenta body_type_ratings,
   planes ni metas; es solo una referencia que lee el entrenador.
   Piloto (P11): la función solo se habilita para la cuenta del
   propietario y la cuenta de prueba «Prueba Ronald». */
const BT_VERSION = 'v1-2026-10-24';  /* Texto FINAL aprobado por Ronald el 2026-10-24 (el borrador era 'draft-2026-10-24': una aceptación bajo el borrador NO cuenta como aceptación del texto final — btIsActive exige esta versión exacta) */
const BT_PILOT_UIDS = ['sWfllr4HvYRFUP1T8B1gFGLYU2t2', 'p08nUuFPXkMMcKg3FalMKYs979p2'];
const btPilot = uid => BT_PILOT_UIDS.includes(uid || '');
const btOf = u => (u && u.bodyTypeConsent) || null;
const btIsActive = u => { const s = btOf(u); return !!s && s.status === 'accepted' && s.version === BT_VERSION; };
const btCol = () => collection(db, 'body_type_estimates');
/* Interfaz de proveedor: estimate({images, measures}) debe
   devolver { category, mix: {ectomorph, mesomorph, endomorph} }.
   El proveedor por defecto es el del M8 (Gemini, nivel pagado),
   aprobado para este módulo por la decisión D-09 de Ronald del
   2026-10-24: la llamada sale por el Worker (ruta /bodytype,
   propuesta en somatotipo-d09-m8-2026-10-24/, aún NO desplegada)
   y la clave jamás vive en la app. La batería de desarrollo puede
   inyectar un proveedor FICTICIO vía window.__BT_FIXTURE_PROVIDER__
   (objeto con fixture:true) para ejercitar el flujo con imágenes
   sintéticas; ese gancho nunca se activa solo y en producción no
   existe proveedor inyectado. */
const BT_PROVIDER_GEMINI = {
  id: 'gemini-m8', approved: true,
  estimate: async ({ images, measures }) => aiCall('/bodytype', { images, measures, lang: LANG })
};
function btResolveProvider() {
  const fx = (typeof window !== 'undefined' && window.__BT_FIXTURE_PROVIDER__) || null;
  if (fx && fx.fixture === true && typeof fx.estimate === 'function') return fx;
  return BT_PROVIDER_GEMINI;
}
function btValidateEstimate(r) {
  if (!r || typeof r !== 'object') return null;
  const cats = ['ectomorph', 'mesomorph', 'endomorph'];
  if (!cats.includes(r.category)) return null;
  const m = r.mix || {};
  const vals = cats.map(c => Number(m[c]));
  if (vals.some(v => !Number.isFinite(v) || v < 0 || v > 100)) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum < 90 || sum > 110) return null;
  const dom = cats[vals.indexOf(Math.max(...vals))];
  if (dom !== r.category) return null;
  return { category: r.category, mix: { ectomorph: vals[0], mesomorph: vals[1], endomorph: vals[2] } };
}
/* Prepara las fotos para un futuro proveedor (P9): redimensiona
   al lado mayor de 1024 px y recodifica a JPEG vía canvas, lo que
   elimina los metadatos EXIF. Las originales nunca salen de
   Firestore; con el proveedor por defecto esto ni se invoca. */
async function prepareBodyTypeImages(dataUrls) {
  const out = [];
  for (const url of dataUrls) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((img.naturalWidth || 1) * scale);
    canvas.height = Math.round((img.naturalHeight || 1) * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    out.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return out;
}
async function btLatestPhotoSet(uid) {
  const snap = await getDocs(query(collection(db, 'nutrition_progress'), where('ownerUid', '==', uid)));
  const byDate = {};
  snap.forEach(d => {
    const v = d.data();
    if (!v || !v.photo || !v.date || !['front', 'side', 'back'].includes(v.slot)) return;
    (byDate[v.date] = byDate[v.date] || {})[v.slot] = { id: d.id, photo: v.photo };
  });
  const dates = Object.keys(byDate).filter(dt => byDate[dt].front && byDate[dt].side && byDate[dt].back).sort();
  if (!dates.length) return null;
  const date = dates[dates.length - 1];
  const s = byDate[date];
  return { date, front: s.front, side: s.side, back: s.back, docIds: [s.front.id, s.side.id, s.back.id] };
}
async function btFetchEstimates(uid) {
  const snap = await getDocs(query(btCol(), where('clientUid', '==', uid)));
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  out.sort((a, b) => (tsMs(b.createdAt) || 0) - (tsMs(a.createdAt) || 0));
  return out;
}
const fmtBtDate = ts => { try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(LANG === 'es' ? 'es-MX' : 'en-US') : ''; } catch { return ''; } };
function btEstimateHTML(e, forClient) {
  return `<div class="bt-est">
    <b>${esc(t('bt.estimateLine', { category: t('bt.category.' + e.category), date: esc(fmtBtDate(e.createdAt)) }))}</b><br>
    <span>${esc(t('bt.mixLine', { e: Math.round(e.mix.ectomorph), m: Math.round(e.mix.mesomorph), n: Math.round(e.mix.endomorph) }))}</span><br>
    <span class="progress-hint">${esc(t('bt.margin'))} ${esc(t('bt.notDiagnosis'))}</span>
    ${forClient ? '' : `<br><span class="progress-hint">${e.shared ? esc(t('bt.sharedState')) : esc(t('bt.privateState'))}</span>
    <div class="privacy-btns"><button type="button" class="btn-ghost btn-sm" data-bt-share="${e.id}" data-bt-val="${e.shared ? '0' : '1'}">${e.shared ? esc(t('bt.unshare')) : esc(t('bt.share'))}</button></div>`}
  </div>`;
}
/* ---------- Consentimiento específico de fotos corporales (cliente) ---------- */
let BT_SHARED_CACHE = { uid: null, active: false, list: null };
function renderBtPanel() {
  const sec = $('bt-section'); const box = $('bt-panel-body');
  if (!sec || !box || !auth.currentUser) return;
  const me = auth.currentUser.uid;
  if (!btPilot(me)) { sec.style.display = 'none'; box.innerHTML = ''; return; }
  sec.style.display = '';
  const s = btOf(UDATA);
  const active = btIsActive(UDATA);
  let html = `<p class="progress-hint">${esc(t('bt.pilotNote'))}</p>
    <p class="progress-hint">${esc(t('bt.consentIntro'))}</p>`;
  if (active) {
    html += `<p class="progress-hint">${esc(t('bt.statusActive', { v: esc(s.version), date: esc(fmtBtDate(s.acceptedAt)) }))}</p>
      <h3 class="history-title">${esc(t('bt.sharedTitle'))}</h3><div id="bt-shared-list"><div class="wempty">${esc(t('train.loading'))}</div></div>
      <div class="privacy-btns"><button type="button" class="btn-ghost btn-sm danger" id="btn-bt-withdraw">${esc(t('bt.withdraw'))}</button></div>`;
  } else {
    if (s && s.status === 'accepted' && s.version !== BT_VERSION) html += `<p class="progress-hint">${esc(t('bt.versionMismatch'))}</p>`;
    else if (s && s.status === 'withdrawn') html += `<p class="progress-hint">${esc(t('bt.statusWithdrawn'))}</p><p class="progress-hint">${esc(t('bt.blockedNote'))}</p>`;
    else html += `<p class="progress-hint">${esc(t('bt.statusNone'))}</p>`;
    html += `<p class="progress-hint">${esc(t('bt.consentSummary'))}</p>
      <p class="progress-hint">${esc(t('bt.providerInfo'))}</p>
      <details class="spec-details" id="bt-details"><summary>${esc(t('bt.fullTextTitle'))}</summary>
        <label class="consent-check"><input type="checkbox" id="bt-ok"> <span>${esc(t('bt.consentText'))} ${esc(t('bt.consentCheck'))}</span></label>
      </details>
      <button type="button" class="btn-primary btn-sm" id="btn-bt-grant">${esc(s && s.status === 'withdrawn' ? t('bt.renew') : t('bt.grant'))}</button>`;
  }
  box.innerHTML = html;
  const wire = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  wire('btn-bt-grant', () => grantBt(!!(s && s.status === 'withdrawn')));
  wire('btn-bt-withdraw', withdrawBt);
  if (active) btLoadSharedIntoPanel(me);
}
async function btLoadSharedIntoPanel(me) {
  const box = $('bt-shared-list'); if (!box) return;
  if (BT_SHARED_CACHE.uid === me && BT_SHARED_CACHE.active && BT_SHARED_CACHE.list) {
    box.innerHTML = BT_SHARED_CACHE.list.length ? BT_SHARED_CACHE.list.map(e => btEstimateHTML(e, true)).join('') : `<div class="wempty">${esc(t('bt.noShared'))}</div>`;
    return;
  }
  try {
    const snap = await getDocs(query(btCol(), where('clientUid', '==', me), where('shared', '==', true)));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (tsMs(b.createdAt) || 0) - (tsMs(a.createdAt) || 0));
    BT_SHARED_CACHE = { uid: me, active: true, list };
    const cur = $('bt-shared-list');
    if (cur) cur.innerHTML = list.length ? list.map(e => btEstimateHTML(e, true)).join('') : `<div class="wempty">${esc(t('bt.noShared'))}</div>`;
  } catch { const cur = $('bt-shared-list'); if (cur) cur.innerHTML = `<div class="wempty">${esc(t('bt.loadError'))}</div>`; }
}
async function grantBt(isRenew) {
  if (!auth.currentUser) return;
  const det = $('bt-details');
  if (det && !det.open) { det.open = true; toast(t('bt.needConsent'), true); return; }
  const ok = $('bt-ok');
  if (!ok || !ok.checked) { toast(t('bt.needConsent'), true); return; }
  if (!(await consentOpsAllowed())) return;
  try {
    const uid = auth.currentUser.uid;
    const cur = await freshUserDoc(uid);
    const prev = btOf(cur) || {};
    const next = { status: 'accepted', version: BT_VERSION, acceptedAt: serverTimestamp() };
    if (prev.withdrawnAt) next.withdrawnAt = prev.withdrawnAt;
    const { batch, seq, rid } = consentBatch(uid, cur, { bodyTypeConsent: next },
      isRenew ? 'bodytype-renewed' : 'bodytype-granted', BT_VERSION);
    await batch.commit();
    UDATA.consentSeq = seq; UDATA.consentReceiptId = rid;
    UDATA.bodyTypeConsent = { status: 'accepted', version: BT_VERSION, acceptedAt: new Date(), ...(prev.withdrawnAt ? { withdrawnAt: prev.withdrawnAt } : {}) };
    BT_SHARED_CACHE = { uid, active: true, list: null };
    toast(isRenew ? t('bt.renewed') : t('bt.granted'));
    renderBtPanel();
  } catch (e) { failToast(e); }
}
async function withdrawBt() {
  if (!auth.currentUser) return;
  if (!confirm(t('bt.withdrawConfirm'))) return;
  if (!(await consentOpsAllowed())) return;
  try {
    const uid = auth.currentUser.uid;
    const cur = await freshUserDoc(uid);
    const prev = btOf(cur) || {};
    const next = { status: 'withdrawn', version: prev.version || BT_VERSION, withdrawnAt: serverTimestamp() };
    if (prev.acceptedAt) next.acceptedAt = prev.acceptedAt;
    const { batch, seq, rid } = consentBatch(uid, cur, { bodyTypeConsent: next }, 'bodytype-withdrawn', next.version);
    await batch.commit();
    UDATA.consentSeq = seq; UDATA.consentReceiptId = rid;
    UDATA.bodyTypeConsent = { status: 'withdrawn', version: next.version, withdrawnAt: new Date(), ...(prev.acceptedAt ? { acceptedAt: prev.acceptedAt } : {}) };
    BT_SHARED_CACHE = { uid, active: false, list: null };
    toast(t('bt.withdrawnToast'));
    renderBtPanel();
  } catch (e) { failToast(e); }
}
/* ---------- Tarjeta del entrenador (ficha del cliente) ---------- */
async function btLoadTrainerCard(uid, udata) {
  const box = $('bt-card'); if (!box) return;
  if (!btPilot(uid)) { box.innerHTML = ''; return; }
  const active = btIsActive(udata);
  let html = `<div class="compacc-box"><h3 class="history-title">🧍 ${esc(t('bt.trainerTitle'))}</h3>
    <p class="progress-hint">${esc(t('bt.consentSignal', { v: active ? t('bt.active') : t('bt.inactive') }))}</p>
    <p class="progress-hint">${esc(t('bt.trainerNote'))}</p>`;
  if (!active) {
    html += `<div class="health-alert">🔒 ${esc(t('bt.needConsent'))}</div></div>`;
    box.innerHTML = html; return;
  }
  html += `<div id="bt-trainer-body"><div class="wempty">${esc(t('train.loading'))}</div></div></div>`;
  box.innerHTML = html;
  const body = $('bt-trainer-body'); if (!body) return;
  let estimates = [], set = null, loadErr = false;
  try { estimates = await btFetchEstimates(uid); } catch { loadErr = true; }
  try { set = await btLatestPhotoSet(uid); } catch {}
  let inner = '';
  if (loadErr) inner += `<div class="wempty">${esc(t('bt.loadError'))}</div>`;
  inner += set
    ? `<p class="progress-hint">${esc(t('bt.sourceLine', { date: esc(set.date) }))}</p>`
    : `<p class="progress-hint">${esc(t('bt.noCompleteSet'))}</p>`;
  if (set) inner += `<div class="eval-actions"><button type="button" class="btn-primary btn-sm" id="btn-bt-request">${esc(t('bt.request'))}</button></div>`;
  inner += estimates.length ? estimates.map(e => btEstimateHTML(e, false)).join('') : `<div class="wempty">${esc(t('bt.noEstimates'))}</div>`;
  body.innerHTML = inner;
  const rq = $('btn-bt-request');
  if (rq) rq.onclick = () => btRequestEstimate(uid, udata);
  body.querySelectorAll('[data-bt-share]').forEach(b => b.onclick = () => btSetShared(b.dataset.btShare, b.dataset.btVal === '1', uid, udata));
}
async function btSetShared(estId, val, uid, udata) {
  try {
    await setDoc(doc(db, 'body_type_estimates', estId), { shared: val, sharedAt: serverTimestamp(), sharedBy: auth.currentUser.uid }, { merge: true });
    toast(t('bt.saved'));
    await btLoadTrainerCard(uid, udata);
  } catch (e) { failToast(e); }
}
async function btRequestEstimate(uid, udata) {
  const btn = $('btn-bt-request');
  if (!btIsActive(udata)) { toast(t('bt.needConsent'), true); return; }
  const provider = btResolveProvider();
  if (!provider || (provider.approved !== true && provider.fixture !== true)) { toast(t('bt.providerUnavailable'), true); return; }
  if (btn) { btn.disabled = true; btn.textContent = t('bt.requesting'); }
  try {
    const set = await btLatestPhotoSet(uid);
    if (!set) { toast(t('bt.noCompleteSet'), true); return; }
    const images = await prepareBodyTypeImages([set.front.photo, set.side.photo, set.back.photo]);
    let measures = {};
    try {
      const ws = await getDocs(query(collection(db, 'nutrition_weight'), where('ownerUid', '==', uid)));
      let latest = null;
      ws.forEach(d => { const v = d.data(); if (v && v.date && (!latest || v.date > latest.date)) latest = v; });
      if (latest) measures = { weightKg: num(latest.weight) || null, date: latest.date };
    } catch {}
    const raw = await provider.estimate({ images, measures });
    const est = btValidateEstimate(raw);
    if (!est) { toast(t('bt.invalidProvider'), true); return; }
    await setDoc(doc(db, 'body_type_estimates', `${uid}_bt_${Date.now()}`), {
      kind: 'bodyTypeEstimate', clientUid: uid, category: est.category, mix: est.mix,
      providerId: String(provider.id || 'unknown'), sourceDate: set.date, sourceDocIds: set.docIds,
      shared: false, requestedBy: auth.currentUser.uid, consentVersion: BT_VERSION, createdAt: serverTimestamp()
    });
    toast(t('bt.saved'));
    await btLoadTrainerCard(uid, udata);
  } catch (e) { failToast(e); }
  finally { const b = $('btn-bt-request'); if (b) { b.disabled = false; b.textContent = t('bt.request'); } }
}

async function saveDeclaration() {
  if (!auth.currentUser || !specIsActive(UDATA)) { toast(t('health.needSpec'), true); return; }
  if (!$('h-truth') || !$('h-truth').checked) { toast(t('err.health'), true); return; }
  const conditions = [...document.querySelectorAll('.h-cond:checked')].map(c => c.value)
    .filter(v => v !== 'Ninguna de las anteriores');
  const details = $('h-details').value.trim();
  const uid = auth.currentUser.uid;
  try {
    const act = activeDecl();
    if (act) {
      await setDoc(doc(declCol(uid), act.id), { conditions, details, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      const n = MY_DECLS.reduce((m, d) => Math.max(m, d.version || 0), 0) + 1;
      await setDoc(doc(declCol(uid), 'v' + n), {
        version: n, conditions, details, state: 'active',
        declaredAt: serverTimestamp(), updatedAt: serverTimestamp(), blockedAt: null
      });
    }
    MY_DECLS = await fetchDeclarations(uid);
    declLoadState = 'ok';
    healthEditing = false;
    toast(t('health.declSaved'));
    renderHealthPanel();
  } catch (e) { failToast(e); }
}
async function loadMyHealth() {
  if (!auth.currentUser) return;
  try { MY_DECLS = await fetchDeclarations(auth.currentUser.uid); declLoadState = 'ok'; }
  catch { MY_DECLS = []; declLoadState = 'error'; }
  renderHealthPanel();
}

/* ================= PLANES DE ENTRENAMIENTO (v1) =================
   training_plans { clientUid, title, notes, days: [{ label, exercises: [{ name, sets, reps, note }] }], active, createdBy, createdAt, updatedAt[, startsAt, endsAt, durationPreset — EDITOR-PLAN 2026-10-24, opcionales] }
   training_logs  { clientUid, planId, date, dayIndex, dayLabel, done, updatedAt } — id: {clientUid}_{planId}_{date}_{dayIndex} */
function mondayISO(iso) {
  const d = new Date(iso + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
async function fetchPlans(clientUid) {
  const out = [];
  try {
    const snap = await getDocs(query(collection(db, 'training_plans'), where('clientUid', '==', clientUid)));
    /* VERSIONADO (§6.4): las instantáneas viven en esta misma
       colección marcadas con isSnapshot — NUNCA son planes vivos y
       este es el punto central de exclusión del que heredan la
       vista del cliente, la lista del entrenador y la puerta
       PAR-Q. Su lectura es fetchSnapshots(). */
    snap.forEach(d => { const v = d.data(); if (v && v.isSnapshot === true) return; out.push({ id: d.id, ...v }); });
  } catch {}
  out.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  return out;
}
/* VERSIONADO (§6.4): lectura del historial de instantáneas de un
   cliente. Es SOLO lectura (getDocs): consultar el historial no
   escribe nada. Las instantáneas jamás pasan por fetchPlans. */
function snapMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') { try { return ts.toDate().getTime(); } catch { return 0; } }
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}
function snapDateLabel(ts) {
  const ms = snapMillis(ts);
  return ms ? dateName(new Date(ms).toISOString().slice(0, 10)) : '';
}
async function fetchSnapshots(clientUid) {
  const out = [];
  try {
    const snap = await getDocs(query(collection(db, 'training_plans'), where('clientUid', '==', clientUid)));
    snap.forEach(d => { const v = d.data(); if (v && v.isSnapshot === true) out.push({ id: d.id, ...v }); });
  } catch {}
  out.sort((a, b) => snapMillis(b.snapshotAt) - snapMillis(a.snapshotAt));
  return out;
}
async function fetchLogs(clientUid) {
  const out = [];
  try {
    const snap = await getDocs(query(collection(db, 'training_logs'), where('clientUid', '==', clientUid)));
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  } catch {}
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}
function trainExercisesHTML(day) {
  return (day.exercises || []).map(ex => `
    <div class="train-ex"><span>${esc(ex.name || '')}${ex.note ? ` <span class="muted">· ${esc(ex.note)}</span>` : ''}</span><span class="sx">${esc([ex.sets, ex.reps].filter(Boolean).join(' × '))}</span></div>`).join('');
}

/* --- Vista del cliente: su plan activo y registro de sesiones ---
   PAQUETE 6 (§5.3 / §4.6 / §4.2): tarjetas por ejercicio con foto,
   video y nombre resuelto por idioma desde la biblioteca (una sola
   lectura con caché, degradación honesta al nombre guardado); marcas
   por ejercicio con RPE opcional SOLO en estado local de la sesión —
   el registro en training_logs nace UNA vez, al cerrar el día, con el
   detalle exercisesDone (invariante aprobado); un día ya registrado se
   muestra como historial de solo lectura (las reglas no admiten
   update en training_logs); aviso de alineación no bloqueante entre
   los días del plan y su configuración de pendientes. */
let TRAIN_CHECKS = {};         // "di:ei" -> { rpe: n|null } — solo memoria de la sesión
let TRAIN_CHECKS_CTX = '';     // planId|fecha a la que pertenecen las marcas
let TRAIN_LIB_CTX = '';        // ctx ya re-pintado tras cargar la biblioteca
let TRAIN_ALIGN_DISMISSED = false;  // el aviso no insiste en la misma sesión

function trainExName(ex) {
  const entry = ex && ex.exerciseId ? LIB_BY_ID[ex.exerciseId] : null;
  return entry ? libNameOf(entry) : ((ex && ex.name) || '');
}
function trainExPhoto(ex) {
  if (!ex) return '';
  if (ex.photoUrl) return ex.photoUrl;
  const entry = ex.exerciseId ? LIB_BY_ID[ex.exerciseId] : null;
  return entry ? (entry.foto_url || '') : '';
}
function trainExVideo(ex) {
  if (!ex) return '';
  if (ex.videoUrl) return ex.videoUrl;
  const entry = ex.exerciseId ? LIB_BY_ID[ex.exerciseId] : null;
  return entry ? (entry.video_youtube_url || '') : '';
}
function trainExInfoHTML(ex) {
  const photo = trainExPhoto(ex), video = trainExVideo(ex);
  const spec = [ex.sets, ex.reps].filter(Boolean).join(' × ');
  const rest = LANG === 'es' ? (ex.rest || ex.rest_en || '') : (ex.rest_en || ex.rest || '');
  const warm = LANG === 'es' ? (ex.warmup || ex.warmup_en || '') : (ex.warmup_en || ex.warmup || '');
  const det = [];
  if (warm) det.push(`${t('train.view.warmup')}: ${warm}`);
  if (rest) det.push(`${t('train.view.rest')}: ${rest}`);
  return `${photo ? `<img class="train-ex-photo" src="${esc(photo)}" alt="" loading="lazy" data-train-photo="${esc(photo)}">` : ''}
    <div class="train-ex-info">
      <div class="train-ex-name">${esc(trainExName(ex))}${ex.note ? ` <span class="muted">· ${esc(ex.note)}</span>` : ''}</div>
      ${spec ? `<div class="train-ex-spec">${esc(spec)}</div>` : ''}
      ${det.length ? `<div class="train-ex-sub">${esc(det.join(' · '))}</div>` : ''}
      ${video ? `<a class="btn-ghost btn-sm train-ex-video" href="${esc(video)}" target="_blank" rel="noopener">▶ ${t('train.lib.video')}</a>` : ''}
    </div>`;
}
function trainExCardHTML(ex, di, ei) {
  const key = di + ':' + ei;
  const chk = TRAIN_CHECKS[key];
  return `<div class="train-ex-card${chk ? ' is-done' : ''}">${trainExInfoHTML(ex)}
    <div class="train-ex-side">
      <label class="train-ex-check"><input type="checkbox" data-train-check="${key}" ${chk ? 'checked' : ''}> <span>${t('train.view.exDone')}</span></label>
      <select class="train-ex-rpe" data-train-rpe="${key}" ${chk ? '' : 'disabled'} aria-label="${t('train.view.rpe')}">
        <option value="">${t('train.view.rpeNone')}</option>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${chk && chk.rpe === n ? 'selected' : ''}>${t('train.view.rpe')} ${n}</option>`).join('')}
      </select>
    </div>
  </div>`;
}
function trainDayHistHTML(day, log) {
  const doneList = (log && Array.isArray(log.exercisesDone)) ? log.exercisesDone : [];
  const byId = {}, byName = {};
  doneList.forEach(e => { if (!e) return; if (e.exerciseId) byId[e.exerciseId] = e; else if (e.name) byName[e.name] = e; });
  return (day.exercises || []).map(ex => {
    const de = (ex.exerciseId && byId[ex.exerciseId]) || (ex.name && byName[ex.name]) || null;
    return `<div class="train-ex-card is-hist">${trainExInfoHTML(ex)}
    <div class="train-ex-side">${de
      ? `<span class="ok-badge">✓ ${t('train.view.exDone')}${de.rpe ? ` · ${t('train.view.rpe')} ${esc(String(de.rpe))}` : ''}</span>`
      : '<span class="muted">—</span>'}</div>
  </div>`;
  }).join('');
}
function trainSessionHTML(day) {
  const blocks = Array.isArray(day.sessionBlocks) ? day.sessionBlocks : [];
  const rows = blocks.map(b => {
    const title = b['title_' + LANG] || b.title_es || b.title_en || '';
    const detail = b['detail_' + LANG] || b.detail_es || b.detail_en || '';
    if (!title && !detail) return '';
    return `<div class="train-block"><b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}</div>`;
  }).join('');
  if (!rows) return '';
  return `<div class="train-session"><h5>${t('train.view.session')}</h5>${rows}</div>`;
}

/* Alineación (Pregunta 10, mitad del cliente): los días de sesión del
   plan salen de sus etiquetas cuando TODAS nombran un día de semana
   (la alineación del editor, Paquete 5, las escribe «Lunes — …»);
   sin etiquetas completas solo se compara el CONTEO semanal. El aviso
   es sugerente: aceptar escribe por el camino existente de su
   configuración de pendientes (pendSaveCfg) cuando los días se
   conocen, o abre ese mismo formulario cuando solo se conoce el
   conteo — nunca se inventan días. Ignorar no escribe nada y el
   aviso no vuelve en la misma sesión. */
const TRAIN_WD_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TRAIN_WD_ES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
function trainPlanWeekdays(days) {
  const out = [];
  for (const d of days) {
    const lab = libNorm((d && d.label) || '').trim();
    let found = -1;
    for (let wd = 0; wd < 7; wd++) {
      if (lab === TRAIN_WD_EN[wd] || lab.startsWith(TRAIN_WD_EN[wd] + ' ') ||
          lab === TRAIN_WD_ES[wd] || lab.startsWith(TRAIN_WD_ES[wd] + ' ')) { found = wd; break; }
    }
    if (found < 0 || out.includes(found)) return null;
    out.push(found);
  }
  return out.sort((a, b) => a - b);
}
function trainWdName(wd) {
  return new Intl.DateTimeFormat(LANG === 'es' ? 'es' : 'en', { weekday: 'long' }).format(new Date(2024, 0, 7 + wd));
}
function trainAlignRender() {
  const slot = $('train-align-slot');
  if (!slot) return;
  slot.innerHTML = '';
  if (TRAIN_ALIGN_DISMISSED) return;
  const cfg = PEND_CFG, plan = MY_PLAN;
  if (!cfg || cfg.__error || !cfg.activated || !cfg.trainOn || !plan) return;
  const days = plan.days || [];
  if (!days.length) return;
  const cur = [...new Set((cfg.trainDays || []).map(Number))].sort((a, b) => a - b);
  const W = trainPlanWeekdays(days);
  const misaligned = W ? JSON.stringify(W) !== JSON.stringify(cur) : cur.length !== days.length;
  if (!misaligned) return;
  const planTxt = W ? W.map(trainWdName).join(', ') : t('train.view.sessionsWeek', { n: days.length });
  const cfgTxt = cur.length ? cur.map(trainWdName).join(', ') : t('train.view.noDays');
  slot.innerHTML = `<div class="train-align-note">
    <p>${t('train.view.alignBody', { plan: planTxt, cfg: cfgTxt })}</p>
    <div class="train-align-actions">
      <button type="button" class="btn-primary btn-sm" id="train-align-yes">${W ? t('train.view.alignYes') : t('train.view.alignOpen')}</button>
      <button type="button" class="btn-ghost btn-sm" id="train-align-no">${t('train.view.alignNo')}</button>
    </div></div>`;
  $('train-align-no').onclick = () => { TRAIN_ALIGN_DISMISSED = true; slot.innerHTML = ''; };
  $('train-align-yes').onclick = async (evYes) => {
    /* Sin esto, el mismo toque que abre la tarjeta de pendientes la
       cerraría al instante: el cierre por «toque fuera» escucha en
       document y este botón vive fuera de la tarjeta. */
    if (evYes) evYes.stopPropagation();
    if (W) {
      const next = Object.assign({}, PEND_CFG);
      delete next.kind; delete next.uid; delete next.ownerUid; delete next.updatedAt;
      next.trainOn = true; next.trainDays = W;
      await pendSaveCfg(next);
      toast(t('train.view.alignDone'));
      renderPendings();
      trainAlignRender();
    } else {
      TRAIN_ALIGN_DISMISSED = true;
      slot.innerHTML = '';
      PEND_UI.configOpen = true;
      pendSetFloat(true);
      renderPendings();
    }
  };
}

/* TARJETA IMPRIMIBLE (§6.2): generación EN CLIENTE desde el plan
   activo — sin datos ni reglas nuevas y sin ninguna escritura: se
   rellena la hoja #print-card (visible solo al imprimir, CSS @media
   print) con título, días, ejercicios (nombre resuelto por idioma
   si la biblioteca está cargada), series × reps, descanso,
   aproximación, notas y bloques de sesión, y se abre el diálogo de
   impresión del navegador (guardar como PDF incluido). */
function printCardRender(plan) {
  const pc = $('print-card');
  if (!pc || !plan) return;
  const days = (plan.days || []).map(day => {
    const exs = (day.exercises || []).map(ex => `<tr><td>${esc(trainExName(ex) || ex.name || '')}</td><td>${esc([ex.sets, ex.reps].filter(Boolean).join(' × '))}</td><td>${esc(LANG === 'es' ? (ex.rest || ex.rest_en || '') : (ex.rest_en || ex.rest || ''))}</td><td>${esc(LANG === 'es' ? (ex.warmup || ex.warmup_en || '') : (ex.warmup_en || ex.warmup || ''))}</td><td>${esc(ex.note || '')}</td></tr>`).join('');
    const blocks = (day.sessionBlocks || []).map(b => `<div class="pc-block"><b>${t('train.print.session')}:</b> ${esc(LANG === 'es' ? (b.title_es || b.title_en || '') : (b.title_en || b.title_es || ''))}${(b.detail_es || b.detail_en) ? ' — ' + esc(LANG === 'es' ? (b.detail_es || b.detail_en || '') : (b.detail_en || b.detail_es || '')) : ''}</div>`).join('');
    return `<h4 class="pc-day">${esc(day.label || '')}</h4><table class="pc-table"><tbody>${exs}</tbody></table>${blocks}`;
  }).join('');
  pc.innerHTML = `<h2 class="pc-title">${esc(plan.title || '')}</h2><p class="pc-sub">${t('train.print.title')} · ${esc(dateName(todayISO()))}</p>${plan.notes ? `<p class="pc-notes">${esc(plan.notes)}</p>` : ''}${days}`;
  window.print();
}
async function loadMyTraining() {
  const box = $('my-training');
  if (!box || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const plans = await fetchPlans(uid);
  const plan = plans.find(p => p.active === true) || null;
  if (!plan) { MY_PLAN = null; MY_LOGS = []; box.innerHTML = `<div class="wempty compact">${t('train.none')}</div>`; return; }
  const logs = (await fetchLogs(uid)).filter(l => l.planId === plan.id);
  MY_PLAN = plan; MY_LOGS = logs;
  const today = todayISO();
  const weekStart = mondayISO(today);
  const doneToday = new Set(logs.filter(l => l.date === today).map(l => l.dayIndex));
  const weekCount = logs.filter(l => l.date >= weekStart && l.date <= today).length;
  const ctx = plan.id + '|' + today;
  if (TRAIN_CHECKS_CTX !== ctx) { TRAIN_CHECKS = {}; TRAIN_CHECKS_CTX = ctx; }
  const logByDay = {};
  logs.filter(l => l.date === today).forEach(l => { logByDay[l.dayIndex] = l; });
  box.innerHTML = `
    <h3 class="history-title">${esc(plan.title || '')}</h3>
    ${plan.notes ? `<p class="progress-hint">${esc(plan.notes)}</p>` : ''}
    ${planPeriodText(plan) ? `<p class="progress-hint">${t('train.dates.clientLine', { period: esc(planPeriodText(plan)) })}</p>` : ''}
    <p class="progress-hint">${t('train.planFreq', { n: (plan.days || []).length })}</p>
    <p class="progress-hint">${t('train.weekDone', { n: weekCount })}</p>
    <div style="margin:6px 0"><button class="btn-ghost btn-sm" id="btn-print-card">${t('train.print.btn')}</button></div>
    <div id="train-align-slot"></div>
    ${(plan.days || []).map((day, di) => {
      const label = day.label || ('Día ' + (di + 1));
      const done = doneToday.has(di);
      const exHtml = done
        ? trainDayHistHTML(day, logByDay[di])
        : (day.exercises || []).map((ex, ei) => trainExCardHTML(ex, di, ei)).join('');
      return `<div class="train-day"><h4>${esc(label)}</h4>${exHtml}${trainSessionHTML(day)}
        <div style="margin-top:8px">${done
          ? `<span class="ok-badge">${t('train.doneToday')}</span> <button class="btn-ghost btn-sm" data-train-undo="${di}">${t('train.undo')}</button>`
          : `<button class="btn-primary btn-sm" data-train-done="${di}">${t('train.markDone')}</button>`}</div>
      </div>`;
    }).join('')}`;
  const pcBtn = $('btn-print-card');
  if (pcBtn) pcBtn.onclick = () => printCardRender(plan);
  box.querySelectorAll('img.train-ex-photo').forEach(img => {
    img.onerror = () => img.remove();
    img.onclick = () => showLightbox(img.dataset.trainPhoto);
  });
  box.querySelectorAll('[data-train-check]').forEach(c => c.onchange = () => {
    const key = c.dataset.trainCheck;
    const card = c.closest('.train-ex-card');
    const sel = card ? card.querySelector('[data-train-rpe]') : null;
    if (c.checked) {
      TRAIN_CHECKS[key] = { rpe: sel && sel.value ? Number(sel.value) : null };
      if (card) card.classList.add('is-done');
      if (sel) sel.disabled = false;
    } else {
      delete TRAIN_CHECKS[key];
      if (card) card.classList.remove('is-done');
      if (sel) { sel.disabled = true; sel.value = ''; }
    }
  });
  box.querySelectorAll('[data-train-rpe]').forEach(s => s.onchange = () => {
    const key = s.dataset.trainRpe;
    if (TRAIN_CHECKS[key]) TRAIN_CHECKS[key].rpe = s.value ? Number(s.value) : null;
  });
  box.querySelectorAll('[data-train-done]').forEach(b => b.onclick = async () => {
    const di = Number(b.dataset.trainDone);
    const day = (plan.days || [])[di] || {};
    const data = { clientUid: uid, planId: plan.id, date: today, dayIndex: di, dayLabel: day.label || '', done: true, updatedAt: serverTimestamp() };
    /* Detalle por ejercicio (§4.6): SOLO lo marcado en la sesión, en
       el orden del plan; sin marcas, el registro nace como hasta hoy. */
    const doneList = [];
    (day.exercises || []).forEach((ex, ei) => {
      const c = TRAIN_CHECKS[di + ':' + ei];
      if (!c) return;
      const e = { done: true };
      if (ex.exerciseId) e.exerciseId = ex.exerciseId; else if (ex.name) e.name = ex.name;
      if (c.rpe) e.rpe = c.rpe;
      doneList.push(e);
    });
    if (doneList.length) data.exercisesDone = doneList;
    await setDoc(doc(db, 'training_logs', `${uid}_${plan.id}_${today}_${di}`), data);
    Object.keys(TRAIN_CHECKS).forEach(k => { if (k.split(':')[0] === String(di)) delete TRAIN_CHECKS[k]; });
    loadMyTraining();
  });
  box.querySelectorAll('[data-train-undo]').forEach(b => b.onclick = async () => {
    await deleteDoc(doc(db, 'training_logs', `${uid}_${plan.id}_${today}_${Number(b.dataset.trainUndo)}`));
    loadMyTraining();
  });
  trainAlignRender();
  /* Biblioteca (una sola lectura con caché por sesión de página): al
     llegar, se re-pinta UNA vez por plan/día para resolver nombres y
     fotos por idioma; si no se puede leer, la vista queda con los
     nombres guardados, sin error (degradación honesta). */
  libEnsure().then(() => {
    if (LIB_STATE === 'ok' && TRAIN_LIB_CTX !== ctx && $('my-training') === box) { TRAIN_LIB_CTX = ctx; loadMyTraining(); }
  });
}

/* ================= PAQUETE 7 — PLANTILLAS VISIBLES AL CLIENTE +
   PROPUESTAS DE CAMBIO (§4.8) =================
   Diseño: DISENO-DETALLADO-P7-PROPUESTAS-2026-10-22.md.
   Casa de datos: nutrition_progress con kind 'planProposal' — las
   reglas vivas (2a1e98c1) ya conceden cada operación del flujo:
   el cliente aprobado crea con ownerUid propio (L568-569) y lee
   las suyas (L576-581); el propietario lee y decide (L576-583);
   un tercero no tiene ninguna rama aplicable. Aprobar escribe
   SOLO el estado de la propuesta (un setDoc merge sobre su propio
   documento): este flujo jamás emite una escritura sobre
   training_plans (L601-604) — el entrenador aplica el cambio a
   mano en el editor si lo decide. Las plantillas y la biblioteca
   se leen con las cachés de siempre (tplEnsure/libEnsure). */
let PROP_TPL_OPEN = new Set();   // plantillas expandidas en la zona del cliente
let PROP_FORM = null;            // { exerciseId, fromTemplateId, type } | null
let PROP_TRAY = { uid: null, plans: [] };

const propTs = (v, f) => { const c = v && v[f]; if (!c) return 0; if (typeof c.toMillis === 'function') return c.toMillis(); if (typeof c === 'number') return c; return 0; };
const propTime = v => propTs(v, 'createdAt');
const propDecidedTime = v => propTs(v, 'decidedAt');
function propDate(ms) { return ms ? new Intl.DateTimeFormat(LANG === 'es' ? 'es' : 'en', { dateStyle: 'medium' }).format(new Date(ms)) : ''; }
function propExName(p) {
  const entry = p && p.exerciseId ? LIB_BY_ID[p.exerciseId] : null;
  if (entry) return libNameOf(entry);
  return (LANG === 'es' ? (p && p.exerciseName_es) : (p && p.exerciseName_en)) || (p && p.exerciseName_es) || (p && p.exerciseName_en) || (p && p.exerciseId) || '';
}
function propStatusBadge(st) {
  const cls = st === 'approved' ? 'is-approved' : st === 'rejected' ? 'is-rejected' : 'is-pending';
  const lbl = st === 'approved' ? t('train.prop.stApproved') : st === 'rejected' ? t('train.prop.stRejected') : t('train.prop.stPending');
  return `<span class="prop-badge ${cls}">${lbl}</span>`;
}
/* UX10-10 (piloto, 2026-10-23): la insignia DEL CLIENTE distingue si
   su entrenador ya vio la propuesta. El campo seenAt lo escribe el
   entrenador al abrir la bandeja de propuestas del cliente
   (loadClientProposals); sin seenAt y pendiente = «Enviada»; con
   seenAt y pendiente = «Vista»; aprobada/rechazada mandan sobre el
   visto (la decisión implica la lectura). La insignia de la bandeja
   (propStatusBadge) no cambia: para el entrenador «Pendiente» sigue
   siendo el estado accionable. */
function propClientStatusBadge(p) {
  if (p.status === 'approved') return propStatusBadge('approved');
  if (p.status === 'rejected') return propStatusBadge('rejected');
  if (propTs(p, 'seenAt')) return `<span class="prop-badge is-seen">${t('train.prop.stSeen')}</span>`;
  return `<span class="prop-badge is-pending">${t('train.prop.stSent')}</span>`;
}
function propDetailLine(p) {
  return p.type === 'change'
    ? t('train.prop.changeLine', { old: p.targetName || '', ex: propExName(p), day: p.dayLabel || '' })
    : t('train.prop.addLine', { ex: propExName(p), day: p.dayLabel || '' });
}

/* --- Zona del cliente: plantillas explorables + sus propuestas --- */
function loadPropClient() {
  if (!$('my-templates') && !$('my-proposals')) return;
  renderPropTemplates();
  renderMyProposals();
  /* Lecturas únicas con caché (las mismas del editor): al llegar,
     la zona se re-pinta una vez con los nombres resueltos. */
  tplEnsure().then(() => renderPropTemplates());
  libEnsure().then(() => { renderPropTemplates(); renderMyProposals(); });
}
function renderPropTemplates() {
  const box = $('my-templates'); if (!box) return;
  let inner = `<h3 class="history-title">${t('train.prop.tplTitle')}</h3><p class="progress-hint">${t('train.prop.tplIntro')}</p>`;
  if (TPL_STATE === 'unavailable') inner += `<div class="wempty compact">${t('train.prop.tplUnavailable')}</div>`;
  else if (TPL_STATE === 'ok' && TPL) {
    if (!MY_PLAN) inner += `<div class="prop-note">${t('train.prop.noPlanNote')}</div>`;
    inner += TPL.map(tpl => propTplCardHTML(tpl)).join('');
  } else inner += `<div class="wempty compact">${t('train.loading')}</div>`;
  box.innerHTML = inner;
  box.querySelectorAll('[data-prop-tpl-toggle]').forEach(b => b.onclick = () => {
    const id = b.dataset.propTplToggle;
    if (PROP_TPL_OPEN.has(id)) PROP_TPL_OPEN.delete(id); else PROP_TPL_OPEN.add(id);
    renderPropTemplates();
  });
  box.querySelectorAll('[data-prop-ex]').forEach(b => b.onclick = () => propOpenForm({ exerciseId: b.dataset.propEx, fromTemplateId: b.dataset.propTpl || null }));
}
function propTplCardHTML(tpl) {
  const open = PROP_TPL_OPEN.has(tpl.id);
  const meta = [tplField(tpl, 'nivel'), t('train.tpl.perWeek', { n: tpl.dias_por_semana }), tplField(tpl, 'objetivo')].filter(Boolean).join(' · ');
  let detail = '';
  if (open) {
    detail = (tpl.days || []).map(d => {
      const dName = LANG === 'es' ? (d.dia_nombre_es || d.dia_nombre_en || '') : (d.dia_nombre_en || d.dia_nombre_es || '');
      const exs = (d.exercises || []).map(te => {
        const entry = te.exerciseId ? LIB_BY_ID[te.exerciseId] : null;
        const name = entry ? libNameOf(entry) : (te.exerciseId || '');
        const sx = [te.series, te.repeticiones].filter(Boolean).join(' × ');
        return `<div class="train-ex"><span>${esc(name)}</span><span class="sx">${esc(sx)}</span>${MY_PLAN ? `<button type="button" class="btn-ghost btn-sm" data-prop-ex="${esc(te.exerciseId || '')}" data-prop-tpl="${esc(tpl.id)}">${t('train.prop.proposeBtn')}</button>` : ''}</div>`;
      }).join('');
      return `<div class="prop-tpl-day"><h5>${esc(dName)}</h5>${exs}</div>`;
    }).join('');
  }
  return `<div class="prop-tpl-card"><div class="prop-tpl-info"><b>${esc(tplField(tpl, 'nombre'))}</b><span class="prop-tpl-meta">${esc(meta)}</span></div><button type="button" class="btn-ghost btn-sm" data-prop-tpl-toggle="${esc(tpl.id)}">${open ? t('train.prop.hide') : t('train.prop.details')}</button>${detail}</div>`;
}

/* --- Formulario de propuesta (cliente) --- */
function propOpenForm(init) {
  if (!MY_PLAN) return;
  PROP_FORM = { exerciseId: (init && init.exerciseId) || '', fromTemplateId: (init && init.fromTemplateId) || null, type: 'add' };
  renderPropForm();
  const slot = $('prop-form-slot'); if (slot) slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function propCloseForm() { PROP_FORM = null; renderPropForm(); }
function renderPropForm() {
  const slot = $('prop-form-slot'); if (!slot) return;
  if (!PROP_FORM || !MY_PLAN) { slot.innerHTML = ''; return; }
  const days = MY_PLAN.days || [];
  const chosenEntry = PROP_FORM.exerciseId ? LIB_BY_ID[PROP_FORM.exerciseId] : null;
  const chosen = PROP_FORM.exerciseId ? (chosenEntry ? libNameOf(chosenEntry) : PROP_FORM.exerciseId) : '';
  const tplName = PROP_FORM.fromTemplateId && TPL_BY_ID[PROP_FORM.fromTemplateId] ? tplField(TPL_BY_ID[PROP_FORM.fromTemplateId], 'nombre') : '';
  slot.innerHTML = `<div class="prop-form">
    <h4>${t('train.prop.formTitle')}</h4>
    ${tplName ? `<p class="progress-hint">${t('train.prop.fromTpl', { name: tplName })}</p>` : ''}
    <div class="prop-form-row">
      <label><input type="radio" name="prop-type" value="add" ${PROP_FORM.type === 'add' ? 'checked' : ''}> ${t('train.prop.typeAdd')}</label>
      <label><input type="radio" name="prop-type" value="change" ${PROP_FORM.type === 'change' ? 'checked' : ''}> ${t('train.prop.typeChange')}</label>
    </div>
    <label class="prop-lab">${t('train.prop.day')}</label>
    <select id="prop-day">${days.map((d, i) => `<option value="${i}">${esc(d.label || ('Día ' + (i + 1)))}</option>`).join('')}</select>
    <div id="prop-target-wrap" style="display:none">
      <label class="prop-lab">${t('train.prop.currentEx')}</label>
      <select id="prop-target"></select>
    </div>
    <label class="prop-lab">${t('train.prop.newEx')}</label>
    <div id="prop-chosen" class="prop-chosen">${chosen ? esc(chosen) : ''}</div>
    <input type="text" id="prop-search" placeholder="${t('train.prop.searchPh')}" autocomplete="off">
    <div id="prop-sug" class="prop-sug"></div>
    <label class="prop-lab">${t('train.prop.note')}</label>
    <textarea id="prop-note" maxlength="300" rows="2" placeholder="${t('train.prop.notePh')}"></textarea>
    <div class="prop-form-actions">
      <button type="button" class="btn-primary btn-sm" id="prop-send">${t('train.prop.send')}</button>
      <button type="button" class="btn-ghost btn-sm" id="prop-cancel">${t('train.prop.cancel')}</button>
    </div>
  </div>`;
  const daySel = $('prop-day');
  const syncTarget = () => {
    const isChange = PROP_FORM.type === 'change';
    $('prop-target-wrap').style.display = isChange ? '' : 'none';
    if (isChange) {
      const di = Number(daySel.value || 0);
      const exs = (days[di] && days[di].exercises) || [];
      $('prop-target').innerHTML = exs.map((ex, ei) => `<option value="${ei}">${esc(ex.name || ex.exerciseId || '')}</option>`).join('');
    }
  };
  slot.querySelectorAll('input[name="prop-type"]').forEach(r => r.onchange = () => { PROP_FORM.type = r.value; syncTarget(); });
  daySel.onchange = syncTarget;
  syncTarget();
  const sug = $('prop-sug');
  $('prop-search').oninput = e => {
    const res = libSearch(e.target.value);
    sug.innerHTML = res.map(ex => `<button type="button" class="prop-sug-item" data-sug-id="${esc(ex.id)}">${esc(libNameOf(ex))}</button>`).join('');
    sug.querySelectorAll('[data-sug-id]').forEach(b => b.onclick = () => {
      PROP_FORM.exerciseId = b.dataset.sugId;
      $('prop-chosen').textContent = libNameOf(LIB_BY_ID[PROP_FORM.exerciseId]) || PROP_FORM.exerciseId;
      sug.innerHTML = '';
    });
  };
  $('prop-cancel').onclick = propCloseForm;
  $('prop-send').onclick = propSend;
}
async function propSend() {
  if (!PROP_FORM || !MY_PLAN || !auth.currentUser) return;
  if (!PROP_FORM.exerciseId) { toast(t('train.prop.needEx')); return; }
  const uid = auth.currentUser.uid;
  const plan = MY_PLAN;
  const di = Number(($('prop-day') || {}).value || 0);
  const day = (plan.days || [])[di] || {};
  const entry = LIB_BY_ID[PROP_FORM.exerciseId] || null;
  const data = {
    kind: 'planProposal', ownerUid: uid, uid,
    planId: plan.id, planTitle: plan.title || '',
    type: PROP_FORM.type === 'change' ? 'change' : 'add',
    dayIndex: di, dayLabel: day.label || '',
    exerciseId: PROP_FORM.exerciseId,
    exerciseName_es: entry ? (entry.nombre_es || '') : '',
    exerciseName_en: entry ? (entry.nombre_en || '') : '',
    note: (($('prop-note') || {}).value || '').trim().slice(0, 300),
    status: 'pending', createdAt: serverTimestamp(),
  };
  if (PROP_FORM.fromTemplateId) data.sourceTemplateId = PROP_FORM.fromTemplateId;
  if (data.type === 'change') {
    const ei = Number(($('prop-target') || {}).value || 0);
    const cur = (day.exercises || [])[ei] || {};
    data.targetName = cur.name || cur.exerciseId || '';
    data.targetExerciseId = cur.exerciseId || null;
  }
  await setDoc(doc(db, 'nutrition_progress', `${uid}_prop_${Date.now()}`), data);
  propCloseForm();
  toast(t('train.prop.sent'));
  renderMyProposals();
}
async function renderMyProposals() {
  const box = $('my-proposals'); if (!box || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const mine = [];
  try {
    const snap = await getDocs(query(collection(db, 'nutrition_progress'), where('ownerUid', '==', uid)));
    snap.forEach(d => { const v = d.data(); if (v && v.kind === 'planProposal') mine.push({ id: d.id, ...v }); });
  } catch {}
  mine.sort((a, b) => propTime(b) - propTime(a));
  box.innerHTML = `<h3 class="history-title">${t('train.prop.myTitle')}</h3>
    <p class="progress-hint">${t('train.prop.statusHint')}</p>
    <div id="prop-form-slot"></div>
    ${MY_PLAN ? `<div style="margin-bottom:10px"><button type="button" class="btn-primary btn-sm" id="prop-new">${t('train.prop.formTitle')}</button></div>` : ''}
    ${mine.length ? mine.map(p => `<div class="user-row prop-row"><div><b>${esc(propDetailLine(p))}</b> ${propClientStatusBadge(p)}<br><span class="muted">${t('train.prop.sentOn', { date: propDate(propTime(p)) })}${p.status === 'pending' && propTs(p, 'seenAt') ? ` · ${t('train.prop.seenOn', { date: propDate(propTs(p, 'seenAt')) })}` : ''}${p.status !== 'pending' && propDecidedTime(p) ? ` · ${t('train.prop.decidedOn', { date: propDate(propDecidedTime(p)) })}` : ''}</span>${p.note ? `<div class="prop-note">“${esc(p.note)}”</div>` : ''}</div></div>`).join('')
      : `<div class="wempty compact">${t('train.prop.myEmpty')}</div>`}`;
  const nb = $('prop-new'); if (nb) nb.onclick = () => propOpenForm({});
  if (PROP_FORM) renderPropForm();
}

/* --- Bandeja del entrenador (dentro de la ficha del cliente) --- */
async function loadClientProposals(uid, plans) {
  const box = $('client-proposals'); if (!box) return;
  PROP_TRAY = { uid, plans: plans || [] };
  const list = [];
  try {
    const snap = await getDocs(query(collection(db, 'nutrition_progress'), where('ownerUid', '==', uid)));
    snap.forEach(d => { const v = d.data(); if (v && v.kind === 'planProposal') list.push({ id: d.id, ...v }); });
  } catch {}
  const rank = s => s === 'pending' ? 0 : 1;
  list.sort((a, b) => rank(a.status) - rank(b.status) || propTime(b) - propTime(a));
  /* UX10-10: abrir la bandeja MARCA como vistas las propuestas
     pendientes que aún no lo están (seenAt + seenBy, merge sobre el
     propio documento — el mismo documento que la decisión ya
     actualiza; jamás toca training_plans). Es la señal que el
     cliente lee como «Vista». Si la escritura falla (p. ej. reglas
     vivas sin la rama del entrenador asignado: ver el delta propio
     ux10), la bandeja sigue funcionando igual y la marca simplemente
     no persiste — no se finge un visto que no quedó escrito. */
  list.filter(p => p.status === 'pending' && !propTs(p, 'seenAt')).forEach(p => {
    p.seenAt = { toMillis: () => Date.now() };
    try {
      setDoc(doc(db, 'nutrition_progress', p.id), { seenAt: serverTimestamp(), seenBy: auth.currentUser.uid }, { merge: true }).catch(() => {});
    } catch {}
  });
  box.innerHTML = `<h3 class="history-title">${t('train.prop.trayTitle')}</h3>
    ${list.length ? list.map(p => propTrayCardHTML(p)).join('') : `<div class="wempty">${t('train.prop.trayEmpty')}</div>`}`;
  box.querySelectorAll('[data-prop-decide]').forEach(b => b.onclick = async () => {
    const parts = b.dataset.propDecide.split('|');
    await setDoc(doc(db, 'nutrition_progress', parts[0]), { status: parts[1], decidedAt: serverTimestamp(), decidedBy: auth.currentUser.uid }, { merge: true });
    loadClientProposals(PROP_TRAY.uid, PROP_TRAY.plans);
  });
  box.querySelectorAll('[data-prop-open]').forEach(b => b.onclick = () => {
    const p = list.find(x => x.id === b.dataset.propOpen); if (!p) return;
    const plan = PROP_TRAY.plans.find(x => x.id === p.planId); if (plan) openPlanEditor(PROP_TRAY.uid, plan);
  });
}
function propTrayCardHTML(p) {
  const plan = PROP_TRAY.plans.find(x => x.id === p.planId);
  const tplName = p.sourceTemplateId ? ((TPL_BY_ID[p.sourceTemplateId] && tplField(TPL_BY_ID[p.sourceTemplateId], 'nombre')) || p.sourceTemplateId) : '';
  return `<div class="user-row prop-row"><div><b>${esc(propDetailLine(p))}</b> ${propStatusBadge(p.status)}<br>
    <span class="muted">${esc(p.planTitle || '')} · ${t('train.prop.byClient', { date: propDate(propTime(p)) })}${tplName ? ` · ${t('train.prop.fromTpl', { name: tplName })}` : ''}</span>
    ${p.note ? `<div class="prop-note">${t('train.prop.noteLabel')} “${esc(p.note)}”</div>` : ''}
    ${p.status === 'approved' ? `<div class="prop-note">${t('train.prop.approvedNote')}</div>` : ''}
  </div><div class="user-actions">
    ${p.status === 'pending' ? `<button class="btn-primary btn-sm" data-prop-decide="${esc(p.id)}|approved">${t('train.prop.approve')}</button><button class="btn-ghost btn-sm" data-prop-decide="${esc(p.id)}|rejected">${t('train.prop.reject')}</button>` : ''}
    ${p.status === 'approved' ? (plan ? `<button class="btn-ghost btn-sm" data-prop-open="${esc(p.id)}">${t('train.prop.openEditor')}</button>` : `<span class="muted">${t('train.prop.planGone')}</span>`) : ''}
  </div></div>`;
}

/* --- Vista del entrenador (dentro del detalle del cliente) --- */
async function loadClientTraining(uid) {
  const box = $('client-training');
  if (!box) return;
  const plans = await fetchPlans(uid);
  const logs = await fetchLogs(uid);
  const planRows = plans.length ? plans.map(p => `
    <div class="user-row"><div><b>${esc(p.title || '')}</b>${p.active === true ? ` <span class="ok-badge">${t('train.activeBadge')}</span>` : ''}${p.active === true && planIsExpired(p) ? ` <span class="exp-badge">${t('train.dates.expired')}</span>` : ''}<br><span class="muted">${t('train.daysCount', { n: (p.days || []).length })} · ${t('train.exCount', { n: (p.days || []).reduce((n, d) => n + (d.exercises || []).length, 0) })}${planPeriodText(p) ? ' · ' + esc(planPeriodText(p)) : ''}</span></div>
    <div class="user-actions">
      <button class="btn-ghost btn-sm" data-plan-edit="${p.id}">${t('client.edit')}</button>
      <button class="btn-ghost btn-sm" data-plan-toggle="${p.id}">${p.active === true ? t('train.deactivate') : t('train.activate')}</button>
      <button class="btn-ghost btn-sm" data-plan-history="${p.id}">${t('train.snap.btn')}</button>
      <button class="btn-ghost btn-sm" data-plan-del="${p.id}">${t('train.delete')}</button>
    </div></div><div class="plan-history" id="ph-${p.id}" style="display:none"></div>`).join('') : `<div class="wempty">${t('train.noPlan')}</div>`;
  const logRows = logs.slice(0, 8).map(l => `<div class="train-ex"><span>${esc(l.dayLabel || '')}</span><span class="sx">${dateName(l.date)} ✓</span></div>`).join('');
  box.innerHTML = `
    <h3 class="history-title">${t('train.section')}</h3>
    <div style="margin-bottom:10px"><button class="btn-primary btn-sm" id="btn-plan-new">${t('train.new')}</button></div>
    ${planRows}
    <div id="client-proposals"></div>
    <h3 class="history-title">${t('train.recent')}</h3>
    ${logRows || `<div class="wempty">${t('train.noLogs')}</div>`}`;
  $('btn-plan-new').onclick = () => openPlanEditor(uid, null);
  box.querySelectorAll('[data-plan-edit]').forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.planEdit); if (p) openPlanEditor(uid, p); });
  box.querySelectorAll('[data-plan-toggle]').forEach(b => b.onclick = async () => {
    const p = plans.find(x => x.id === b.dataset.planToggle); if (!p) return;
    if (p.active === true) {
      await setDoc(doc(db, 'training_plans', p.id), { active: false, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      for (const o of plans) if (o.id !== p.id && o.active === true)
        await setDoc(doc(db, 'training_plans', o.id), { active: false, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(db, 'training_plans', p.id), { active: true, updatedAt: serverTimestamp() }, { merge: true });
    }
    loadClientTraining(uid);
  });
  box.querySelectorAll('[data-plan-del]').forEach(b => b.onclick = async () => {
    if (!confirm(t('train.deleteConfirm'))) return;
    await deleteDoc(doc(db, 'training_plans', b.dataset.planDel));
    toast(t('train.deleted'));
    loadClientTraining(uid);
  });
  loadClientProposals(uid, plans);
  /* VERSIONADO (§6.4): el historial se carga perezosamente al abrir
     y es SOLO LECTURA — ver una instantánea no escribe nada y el
     plan vivo no se toca desde aquí. */
  box.querySelectorAll('[data-plan-history]').forEach(b => b.onclick = async () => {
    const boxH = $('ph-' + b.dataset.planHistory);
    if (!boxH) return;
    if (boxH.style.display !== 'none') { boxH.style.display = 'none'; return; }
    boxH.style.display = '';
    if (boxH.dataset.loaded) return;
    boxH.dataset.loaded = '1';
    const snaps = (await fetchSnapshots(uid)).filter(s => s.sourcePlanId === b.dataset.planHistory);
    boxH.innerHTML = `<h4 class="history-title">${t('train.snap.title')}</h4>` + (snaps.length ? snaps.map(s => `
      <div class="train-ex"><span>${esc(t('train.snap.at', { d: snapDateLabel(s.snapshotAt) }))} · <b>${esc(s.title || '')}</b></span><button class="btn-ghost btn-sm" data-snap-view="${s.id}">${t('train.snap.view')}</button></div>
      <div class="snap-detail" id="sd-${s.id}" style="display:none">${(s.days || []).map(d => `<div class="snap-day"><b>${esc(d.label || '')}</b>${trainExercisesHTML(d)}</div>`).join('')}</div>`).join('')
      : `<div class="wempty">${t('train.snap.empty')}</div>`);
    boxH.querySelectorAll('[data-snap-view]').forEach(vb => vb.onclick = () => {
      const det = $('sd-' + vb.dataset.snapView);
      if (!det) return;
      const open = det.style.display !== 'none';
      det.style.display = open ? 'none' : '';
      vb.textContent = open ? t('train.snap.view') : t('train.snap.hide');
    });
  });
}

/* ================= PUERTA PAR-Q (§4.5) — guarda de INTERFAZ =================
   Cambio de comportamiento de seguridad decidido por el propietario
   (2026-10-22; pregunta 5 de OBSERVACIONES-ENTRENAMIENTO-2026-10-22 y
   §2(b) de ese documento): al guardar el PRIMER plan de un cliente
   (el cliente no tiene ningún plan previo) se exige que exista una
   declaración de salud activa válida de ese cliente, legible por la
   vía del propietario (fetchClientHealth: solo la declaración activa
   y solo con el consentimiento específico aceptado — la misma lectura
   condicionada de la ficha del cliente, reglas 356-362).
   - FALLO CERRADO: si no se puede comprobar una declaración válida
     (no existe, o el consentimiento específico está retirado o nunca
     se otorgó, o la lectura falla), el primer plan NO se guarda y no
     se escribe nada. Coherente con la Decisión 6.
   - La puerta comprueba SOLO existencia/estado: usa
     fetchClientHealth(...).available y DESCARTA el contenido; el
     contenido de la declaración NUNCA se renderiza en el editor.
   - En guardados posteriores (el cliente ya tiene ≥1 plan) NO
     bloquea: el editor muestra un aviso visible si falta la
     declaración, y el guardado la recuerda en su confirmación.
   - ES UNA GUARDA DE INTERFAZ, NO una barrera de servidor: las reglas
     no atan planes a declaraciones y el único escritor de planes es
     el propio entrenador. El hallazgo S-1 sigue ABIERTO: esta puerta
     ni lo cierra ni lo agrava — lee ESTADO por la vía del propietario
     (reglas 356-362), no la rama de actualización de la declaración
     activa señalada por S-1. */
async function planGateState(clientUid) {
  /* Devuelve 'valid' | 'missing'. Cualquier fallo de lectura cuenta
     como 'missing' (fallo cerrado). Nunca devuelve contenido. */
  let udata = null;
  try {
    const s = await getDoc(doc(db, 'users', clientUid));
    if (s.exists()) udata = s.data();
  } catch { return 'missing'; }
  if (!udata || !specIsActive(udata)) return 'missing';
  try {
    const ch = await fetchClientHealth(clientUid, udata);
    return ch && ch.available ? 'valid' : 'missing';
  } catch { return 'missing'; }
}
function planGateRender(state, isFirst) {
  const box = $('pl-gate');
  if (!box) return;
  if (state === 'checking') { box.className = 'pl-gate'; box.textContent = t('train.gate.checking'); return; }
  if (state === 'valid') { box.className = 'pl-gate ok'; box.textContent = t('train.gate.ok'); return; }
  box.className = 'pl-gate ' + (isFirst ? 'block' : 'warn');
  box.textContent = isFirst ? t('train.gate.blockFirst') : t('train.gate.warnLater');
}
let planGateSeq = 0;
async function planGateRefresh() {
  if (!planCtx) return;
  const seq = ++planGateSeq;
  const cuid = planCtx.clientUid;
  planGateRender('checking', !planCtx.planId);
  const existing = await fetchPlans(cuid);
  const state = await planGateState(cuid);
  if (seq !== planGateSeq || !planCtx || planCtx.clientUid !== cuid) return;
  planGateRender(state, !planCtx.planId && existing.length === 0);
}

/* ================= BIBLIOTECA EN EL EDITOR (§4.1) =================
   Paquete 4 de la integración de entrenamiento (diseño cerrado en la
   propuesta v1.1 §4.1/§4.6; decisión del propietario, pregunta 7: el
   nombre mostrado se resuelve por exerciseId contra la biblioteca en
   el idioma de quien mira, con el name guardado como respaldo; y «el
   entrenador siempre decide»: la biblioteca AYUDA, no encierra).
   - Al abrir el editor se lee UNA vez la colección exercise_library
     (103 documentos) y queda en memoria para la sesión de la página;
     si la lectura ya tuvo éxito NO se repite. Si falla o la colección
     viene vacía, el editor sigue en modo texto libre y lo avisa de
     forma visible y honesta (#pl-lib-note), SIN bloquear el guardado:
     la única puerta dura sigue siendo la PAR-Q (§4.5), intacta.
   - Cada fila de ejercicio trae buscador con autocompletado: la
     búsqueda cubre nombre, grupo muscular, equipo y nivel en AMBOS
     idiomas (insensible a acentos y mayúsculas); la presentación va
     siempre en el idioma activo de la interfaz.
   - Al elegir una sugerencia la fila queda VINCULADA: al guardar se
     persisten exerciseId + photoUrl/videoUrl COPIADOS de la ficha
     (una recarga futura de la biblioteca no reescribe planes vivos,
     §4.6) y el name que el entrenador ve en su idioma. Si el
     entrenador edita el nombre y deja de coincidir con la ficha (en
     cualquiera de los dos idiomas), la fila se DESVINCULA y vuelve a
     ser texto libre, sin error ni bloqueo: el texto libre intacto.
   - Al reabrir un plan, las filas con exerciseId muestran el nombre
     resuelto por idioma; si ese id ya no existe en una biblioteca
     CARGADA, la fila degrada a texto libre con el name guardado
     (degradación honesta, sin romper el plan) y al guardar se
     conserva como texto libre, sin el id muerto. */
let LIB = null;            // documentos de exercise_library (cada uno con su id)
let LIB_BY_ID = {};        // id -> documento de la biblioteca
let LIB_STATE = 'idle';    // 'idle' | 'loading' | 'ok' | 'unavailable'
let LIB_PROMISE = null;
function libEnsure() {
  if (LIB_STATE === 'ok') return Promise.resolve();
  if (LIB_STATE === 'loading' && LIB_PROMISE) return LIB_PROMISE;
  LIB_STATE = 'loading';
  LIB_PROMISE = (async () => {
    try {
      const snap = await getDocs(collection(db, 'exercise_library'));
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      LIB = docs; LIB_BY_ID = {};
      docs.forEach(x => { if (x && x.id) LIB_BY_ID[x.id] = x; });
      LIB_STATE = docs.length ? 'ok' : 'unavailable';
    } catch { LIB = []; LIB_BY_ID = {}; LIB_STATE = 'unavailable'; }
    libRenderNotice();
  })();
  return LIB_PROMISE;
}
function libRenderNotice() {
  const box = $('pl-lib-note');
  if (!box) return;
  box.textContent = LIB_STATE === 'unavailable' ? t('train.lib.unavailable') : '';
}
const libNorm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function libField(ex, base) { return ex ? (ex[base + '_' + LANG] || ex[base + '_es'] || ex[base + '_en'] || '') : ''; }
function libNameOf(ex) { return libField(ex, 'nombre') || (ex ? ex.id : ''); }
function libSearch(q) {
  if (LIB_STATE !== 'ok' || !LIB) return [];
  const nq = libNorm(q).trim();
  if (nq.length < 2) return [];
  const terms = nq.split(/\s+/);
  const scored = [];
  for (const ex of LIB) {
    const hay = libNorm([ex.nombre_es, ex.nombre_en, ex.grupo_muscular_es, ex.grupo_muscular_en, ex.equipo_es, ex.equipo_en, ex.nivel_es, ex.nivel_en].join(' '));
    if (!terms.every(tm => hay.includes(tm))) continue;
    const nA = libNorm(LANG === 'es' ? ex.nombre_es : ex.nombre_en);
    const nO = libNorm(LANG === 'es' ? ex.nombre_en : ex.nombre_es);
    let rank = 3;
    if (nA.startsWith(nq)) rank = 0; else if (nA.includes(nq)) rank = 1; else if (nO.includes(nq)) rank = 2;
    scored.push([rank, ex]);
  }
  scored.sort((a, b) => a[0] - b[0] || libNameOf(a[1]).localeCompare(libNameOf(b[1])));
  return scored.slice(0, 8).map(x => x[1]);
}
function libLinksHTML(ex) {
  /* Enlaces foto/video de una fila vinculada: salen de lo COPIADO en
     la fila al asignar (photoUrl/videoUrl) y, si falta, de la ficha
     viva de la biblioteca. Sin exerciseId no hay enlaces. */
  if (!ex || !ex.exerciseId) return '';
  const entry = LIB_BY_ID[ex.exerciseId];
  const photo = ex.photoUrl || (entry ? entry.foto_url : '') || '';
  const video = ex.videoUrl || (entry ? entry.video_youtube_url : '') || '';
  if (!photo && !video) return '';
  return `<div class="pl-ex-links">${photo ? `<button type="button" class="btn-ghost btn-sm pl-ex-photo" data-url="${esc(photo)}">📷 ${t('train.lib.photo')}</button>` : ''}${video ? `<a class="btn-ghost btn-sm pl-ex-video" href="${esc(video)}" target="_blank" rel="noopener">▶ ${t('train.lib.video')}</a>` : ''}</div>`;
}
function wireLibLinks(scope) {
  scope.querySelectorAll('.pl-ex-photo').forEach(b => { if (!b.dataset.wired) { b.dataset.wired = '1'; b.onclick = () => showLightbox(b.dataset.url); } });
}
/* CONSTRUCTOR VISUAL (§5.1): la fila vinculada muestra la MINIATURA
   de la foto de la ficha (la misma URL copiada en photoUrl): se ve
   al instante en la lista del día, también al añadir desde la
   rejilla. Sin foto conocida, la miniatura no ocupa espacio. */
function libRowThumb(row, url) {
  const th = row.querySelector('.pl-ex-thumb');
  const btn = row.querySelector('.pl-ex-media-btn');
  if (btn) btn.classList.toggle('has-photo', !!url);
  if (!th) return;
  if (url) { th.src = url; th.style.display = ''; }
  else { th.removeAttribute('src'); th.style.display = 'none'; }
}
/* FLOTANTE MULTIMEDIA (rediseño de la fila, 2026-10-24): al tocar la
   miniatura se abre un desplegable flotante sobre la pantalla con el
   complemento multimedia REAL del ejercicio. La resolución es la
   misma de siempre: lo copiado en la fila (data-photo/data-video al
   vincular o aplicar plantilla) y, si falta, la ficha viva de la
   biblioteca (foto_url / video_youtube_url). Sin exerciseId o sin
   media conocida, el flotante lo dice — no inventa nada: hoy la
   biblioteca solo guarda UNA foto (foto_url) y UN enlace de video de
   YouTube por ejercicio; no existe campo de GIF en la ficha (el set
   GIF de desarrollo no está conectado a la app). */
function exMediaForRow(row) {
  if (!row) return { name: '', photo: '', video: '' };
  const entry = row.dataset.exid ? LIB_BY_ID[row.dataset.exid] : null;
  const nameIn = row.querySelector('.pl-ex-name');
  return {
    name: (nameIn && nameIn.value) || (entry ? libNameOf(entry) : ''),
    photo: row.dataset.photo || (entry ? entry.foto_url : '') || '',
    video: row.dataset.video || (entry ? entry.video_youtube_url : '') || '',
  };
}
function exMediaOpen(row) {
  const pop = $('ex-media-pop'); if (!pop || !row) return;
  const m = exMediaForRow(row);
  $('ex-media-name').textContent = m.name || t('train.lib.media');
  $('ex-media-body').innerHTML =
    (m.photo ? `<img class="ex-media-img" src="${esc(m.photo)}" alt="">` : '')
    + (m.video ? `<a class="btn-primary ex-media-video" href="${esc(m.video)}" target="_blank" rel="noopener">▶ ${t('train.lib.video')}</a>` : '')
    + (!m.photo && !m.video ? `<p class="muted">${t('train.lib.noMedia')}</p>` : '');
  pop.style.display = '';
}
function exMediaClose() { const pop = $('ex-media-pop'); if (pop) pop.style.display = 'none'; }
function wirePlanExMedia(scope) {
  scope.querySelectorAll('.pl-ex-media-btn').forEach(b => {
    if (b.dataset.mediaWired) return; b.dataset.mediaWired = '1';
    b.onclick = () => exMediaOpen(b.closest('.pl-ex-row'));
  });
  scope.querySelectorAll('.pl-ex-more').forEach(b => {
    if (b.dataset.moreWired) return; b.dataset.moreWired = '1';
    b.onclick = () => { const x = b.closest('.pl-ex-row').querySelector('.pl-ex-extra'); if (x) x.style.display = x.style.display === 'none' ? '' : 'none'; };
  });
}
function libCloseSug(row) { const sug = row.querySelector('.pl-ex-sug'); if (sug) sug.innerHTML = ''; }
function libUnlinkRow(row) {
  row.removeAttribute('data-exid');
  row.removeAttribute('data-saved-name');
  row.removeAttribute('data-photo');
  row.removeAttribute('data-video');
  /* PLANTILLAS (§4.2): al desvincular se descartan también las copias
     en data-* de descanso/aproximación (los textos del OTRO idioma
     que traía la fila de plantilla): lo que el entrenador ve en los
     campos visibles es lo único que persiste. */
  row.removeAttribute('data-rest');
  row.removeAttribute('data-rest-en');
  row.removeAttribute('data-warmup');
  row.removeAttribute('data-warmup-en');
  libRowThumb(row, '');
  const wrap = row.querySelector('.pl-ex-links-wrap');
  if (wrap) wrap.innerHTML = '';
}
function libLinkRow(row, ex) {
  const nameIn = row.querySelector('.pl-ex-name');
  row.dataset.exid = ex.id;
  if (ex.foto_url) row.dataset.photo = ex.foto_url; else row.removeAttribute('data-photo');
  if (ex.video_youtube_url) row.dataset.video = ex.video_youtube_url; else row.removeAttribute('data-video');
  nameIn.value = libNameOf(ex);
  row.dataset.savedName = nameIn.value;
  libRowThumb(row, ex.foto_url || '');
  const wrap = row.querySelector('.pl-ex-links-wrap');
  if (wrap) { wrap.innerHTML = libLinksHTML({ exerciseId: ex.id, photoUrl: ex.foto_url, videoUrl: ex.video_youtube_url }); wireLibLinks(row); }
  libCloseSug(row);
}
function wireLibRow(row) {
  if (row.dataset.libWired) return;
  row.dataset.libWired = '1';
  const nameIn = row.querySelector('.pl-ex-name');
  const sug = row.querySelector('.pl-ex-sug');
  if (!nameIn || !sug) return;
  nameIn.addEventListener('input', () => {
    /* Si la fila estaba vinculada y el texto deja de coincidir con
       la ficha (en cualquiera de los dos idiomas), se desvincula:
       pasa a texto libre, sin error ni bloqueo. */
    const exid = row.dataset.exid;
    if (exid) {
      const entry = LIB_BY_ID[exid];
      const v = nameIn.value.trim();
      if (!entry || (v !== (entry.nombre_es || '') && v !== (entry.nombre_en || ''))) libUnlinkRow(row);
    }
    if (LIB_STATE !== 'ok') { sug.innerHTML = ''; return; }
    const hits = libSearch(nameIn.value);
    sug.innerHTML = hits.map(ex => `<button type="button" class="pl-sug-item" data-lib-id="${esc(ex.id)}"><span class="sg-name">${esc(libNameOf(ex))}</span><span class="sg-meta">${esc([libField(ex, 'grupo_muscular'), libField(ex, 'equipo'), libField(ex, 'nivel')].filter(Boolean).join(' · '))}</span></button>`).join('');
    sug.querySelectorAll('.pl-sug-item').forEach(b => b.addEventListener('mousedown', ev => {
      ev.preventDefault();
      const ex = LIB_BY_ID[b.dataset.libId];
      if (ex) libLinkRow(row, ex);
    }));
  });
  nameIn.addEventListener('focus', () => { if (LIB_STATE === 'ok' && !row.dataset.exid && nameIn.value.trim().length >= 2) nameIn.dispatchEvent(new Event('input')); });
  nameIn.addEventListener('blur', () => setTimeout(() => libCloseSug(row), 150));
  nameIn.addEventListener('keydown', ev => { if (ev.key === 'Escape') libCloseSug(row); });
}
function wirePlanExRows(scope) {
  wirePlanExDel(scope);
  wirePlanExMedia(scope);
  scope.querySelectorAll('.pl-ex-row').forEach(wireLibRow);
  scope.querySelectorAll('.pl-ex-row').forEach(r => { wireSubstRow(r); wireBtrRow(r); });
  wireLibLinks(scope);
}

/* ================= SUSTITUTO INTELIGENTE (§5.2/§6.7) =================
   Al editar una fila, «Sustituir» sugiere ejercicios de la biblioteca
   del MISMO grupo muscular que el ejercicio actual (grupo canónico
   grupo_muscular_es), con los de equipo igual al actual primero
   («equipo afín si consta»: el equipo sale de la propia ficha, no de
   ningún dato del cliente). Sugerir NUNCA sustituye solo: el
   entrenador toca una sugerencia y la fila se vincula con el
   mecanismo del Paquete 4 (libLinkRow), igual que si la hubiera
   elegido del autocompletado. Sin biblioteca legible o sin grupo
   conocido, no hay sugerencias y NO hay error: la fila sigue en
   texto libre. La pieza §5.2 plena (filtrar por el equipo QUE EL
   CLIENTE TIENE) depende del perfil de equipo (§6.5), que es su
   propio paquete — aquí no se captura ningún dato del cliente. */
function substCurrentEntry(row) {
  if (LIB_STATE !== 'ok' || !LIB) return null;
  const exid = row.dataset.exid;
  if (exid && LIB_BY_ID[exid]) return LIB_BY_ID[exid];
  const nameIn = row.querySelector('.pl-ex-name');
  const v = libNorm(nameIn ? nameIn.value : '');
  if (!v) return null;
  return LIB.find(e => libNorm(e.nombre_es) === v || libNorm(e.nombre_en) === v) || null;
}
function substRender(row) {
  const box = row.querySelector('.pl-ex-subst-box');
  if (!box) return;
  if (box.dataset.open === '1') { box.innerHTML = ''; box.dataset.open = ''; return; }
  box.dataset.open = '1';
  const cur = substCurrentEntry(row);
  if (!cur || !cur.grupo_muscular_es) { box.innerHTML = `<div class="pl-sub-note">${t('train.sub.none')}</div>`; return; }
  const cands = LIB.filter(e => e.grupo_muscular_es === cur.grupo_muscular_es && e.id !== cur.id);
  cands.sort((a, b) => ((b.equipo_es === cur.equipo_es ? 1 : 0) - (a.equipo_es === cur.equipo_es ? 1 : 0)) || libNameOf(a).localeCompare(libNameOf(b)));
  if (!cands.length) { box.innerHTML = `<div class="pl-sub-note">${t('train.sub.none')}</div>`; return; }
  box.innerHTML = `<div class="pl-sub-title">${t('train.sub.title')}</div>` + cands.slice(0, 8).map(ex => `
    <button type="button" class="pl-sug-item" data-sub-id="${esc(ex.id)}"><span class="sg-name">${esc(libNameOf(ex))}</span><span class="sg-meta">${esc([libField(ex, 'grupo_muscular'), libField(ex, 'equipo'), libField(ex, 'nivel')].filter(Boolean).join(' · '))}${ex.equipo_es === cur.equipo_es ? ' · ' + t('train.sub.sameEq') : ''}</span></button>`).join('');
  box.querySelectorAll('[data-sub-id]').forEach(b => b.onclick = () => {
    const ex = LIB_BY_ID[b.dataset.subId];
    if (ex) libLinkRow(row, ex);
    box.innerHTML = ''; box.dataset.open = '';
  });
}
function wireSubstRow(row) {
  if (row.dataset.substWired) return;
  row.dataset.substWired = '1';
  const b = row.querySelector('.pl-ex-subst');
  if (b) b.onclick = () => substRender(row);
}

/* ================= PANEL DE AYUDA POR TIPO DE CUERPO (§4.3) =========
   Consulta POR EJERCICIO de las calificaciones cargadas en
   body_type_ratings (Paquete 3-C): al consultar un ejercicio
   vinculado, el entrenador ve su Alto/Medio/Bajo para cada tipo de
   cuerpo con su fundamento en el idioma activo, la nota honesta
   íntegra de la guía C y el recordatorio de que es referencia
   general. REGLAS DE ORO (v1.1 §4.3/§7): el panel muestra datos de
   consulta genéricos — JAMÁS etiqueta a una persona con un
   somatotipo, JAMÁS preselecciona ni asigna nada por tipo de
   cuerpo, y ningún flujo lee tipo de cuerpo alguno de un cliente
   (ese dato ni siquiera se captura). La colección se lee UNA vez
   por sesión de página, con la misma disciplina que la biblioteca;
   si no se puede leer o está vacía, estado honesto y el editor
   sigue como siempre. */
let BTR = null;            // documentos de body_type_ratings
let BTR_BY_ID = {};        // id de ejercicio -> documento de calificación
let BTR_STATE = 'idle';    // 'idle' | 'loading' | 'ok' | 'unavailable'
let BTR_PROMISE = null;
function btrEnsure() {
  if (BTR_STATE === 'ok') return Promise.resolve();
  if (BTR_STATE === 'loading' && BTR_PROMISE) return BTR_PROMISE;
  BTR_STATE = 'loading';
  BTR_PROMISE = (async () => {
    try {
      const snap = await getDocs(collection(db, 'body_type_ratings'));
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      BTR = docs; BTR_BY_ID = {};
      docs.forEach(x => { if (x && x.id) BTR_BY_ID[x.id] = x; });
      BTR_STATE = docs.length ? 'ok' : 'unavailable';
    } catch { BTR = []; BTR_BY_ID = {}; BTR_STATE = 'unavailable'; }
  })();
  return BTR_PROMISE;
}
function btrGrade(v) {
  return v === 'Alto' ? t('train.btr.high') : v === 'Medio' ? t('train.btr.med') : v === 'Bajo' ? t('train.btr.low') : (v || '');
}
function btrRender(row) {
  const box = row.querySelector('.pl-ex-btr-box');
  if (!box) return;
  if (box.dataset.open === '1') { box.innerHTML = ''; box.dataset.open = ''; return; }
  box.dataset.open = '1';
  const exid = row.dataset.exid;
  if (!exid) { box.innerHTML = `<div class="pl-sub-note">${t('train.btr.needLink')}</div>`; return; }
  btrEnsure().then(() => {
    if (box.dataset.open !== '1') return;
    if (BTR_STATE !== 'ok') { box.innerHTML = `<div class="pl-sub-note">${t('train.btr.unavailable')}</div>`; return; }
    const d = BTR_BY_ID[exid];
    if (!d || !d.calificaciones) { box.innerHTML = `<div class="pl-sub-note">${t('train.btr.noData')}</div>`; return; }
    const c = d.calificaciones;
    const entry = LIB_BY_ID[exid];
    const name = entry ? libNameOf(entry) : exid;
    const fundamento = LANG === 'es' ? (d.fundamento_es || d.fundamento_en || '') : (d.fundamento_en || d.fundamento_es || '');
    box.innerHTML = `<div class="pl-btr">
      <div class="pl-sub-title">${esc(t('train.btr.title', { name }))}</div>
      <div class="pl-btr-row"><span>${t('train.btr.ecto')}</span><span class="btr-badge">${esc(btrGrade(c.ectomorfo))}</span></div>
      <div class="pl-btr-row"><span>${t('train.btr.meso')}</span><span class="btr-badge">${esc(btrGrade(c.mesomorfo))}</span></div>
      <div class="pl-btr-row"><span>${t('train.btr.endo')}</span><span class="btr-badge">${esc(btrGrade(c.endomorfo))}</span></div>
      ${fundamento ? `<p class="pl-btr-why"><b>${t('train.btr.why')}:</b> ${esc(fundamento)}</p>` : ''}
      <p class="pl-btr-note">${t('train.btr.note')}</p>
      <p class="pl-btr-note"><b>${t('train.btr.disclaimer')}</b></p>
    </div>`;
  });
}
function wireBtrRow(row) {
  if (row.dataset.btrWired) return;
  row.dataset.btrWired = '1';
  const b = row.querySelector('.pl-ex-btr');
  if (b) b.onclick = () => btrRender(row);
}
function libRefreshOpenRows() {
  /* Al terminar la carga de la biblioteca con el editor abierto: las
     filas vinculadas muestran el nombre resuelto por idioma (sin
     tocar lo que el entrenador ya haya escrito distinto) y las que
     apunten a un id ya inexistente degradan a texto libre. */
  document.querySelectorAll('#pl-days .pl-ex-row').forEach(row => {
    const exid = row.dataset.exid;
    if (!exid || LIB_STATE !== 'ok') return;
    const entry = LIB_BY_ID[exid];
    if (!entry) { libUnlinkRow(row); return; }
    const nameIn = row.querySelector('.pl-ex-name');
    if (nameIn && nameIn.value === (row.dataset.savedName || '')) {
      nameIn.value = libNameOf(entry);
      row.dataset.savedName = nameIn.value;
    }
    if (!row.dataset.photo && entry.foto_url) row.dataset.photo = entry.foto_url;
    if (row.dataset.photo) libRowThumb(row, row.dataset.photo);
    if (!row.dataset.video && entry.video_youtube_url) row.dataset.video = entry.video_youtube_url;
    const wrap = row.querySelector('.pl-ex-links-wrap');
    if (wrap && !wrap.innerHTML) { wrap.innerHTML = libLinksHTML({ exerciseId: exid, photoUrl: row.dataset.photo, videoUrl: row.dataset.video }); wireLibLinks(row); }
  });
}

/* ================= PLANTILLAS EN EL EDITOR (§4.2) =================
   Paquete 5 de la integración de entrenamiento (propuesta v1.1
   §4.2/§4.6; decisiones del propietario: pregunta 1 — las plantillas
   las ven entrenador, administrador y clientes aprobados — y
   pregunta 10 — la app SUGIERE alinear los días; la sugerencia
   nunca cambia días por sí sola).
   - Al abrir el editor se lee UNA vez la colección routine_templates
     (8 documentos) y queda en memoria para la sesión de la página,
     con la misma disciplina que la biblioteca (§4.1). Si la lectura
     falla o la colección viene vacía, aviso discreto y honesto
     (#pl-tpl-note) y el editor sigue como hoy, a mano: NADA se
     bloquea (la única puerta dura sigue siendo la PAR-Q, intacta).
   - «Usar esta plantilla» genera un BORRADOR en el editor: título,
     días y ejercicios programados de la plantilla se vuelcan en las
     filas del editor — cada ejercicio vinculado por su exerciseId
     con el mecanismo de la biblioteca (§4.1), series/repeticiones
     como texto tal cual vienen, descanso/aproximación en sus campos
     (§4.6) y los bloques de sesión del día en sessionBlocks. El
     borrador es editable por completo (quitar, añadir, reordenar,
     ajustar) y NADA se guarda hasta que el entrenador guarda el
     plan por el camino de guardado actual: lo guardado es un plan
     normal de training_plans — una COPIA, nunca una referencia viva
     a la plantilla. La plantilla es punto de partida, no decisión
     automática (y la pregunta 12 sigue fuera: nada se asigna por
     tipo de cuerpo).
   - Procedencia (opcional y veraz, §4.6): si el plan nace de una
     plantilla aplicada en esta sesión del editor, el guardado
     registra sourceRoutineId + sourceRoutineVersion (y
     libraryVersion si la biblioteca está cargada). Es trazabilidad:
     no crea ningún vínculo vivo ni comportamiento automático.
   - ALINEACIÓN DE DÍAS (pregunta 10): con el borrador generado, el
     editor ofrece fijar una fecha de inicio; a partir de ella
     SUGIERE alinear los días de sesión de la plantilla con los días
     de semana reales (reparto semanal según los días/semana de la
     plantilla). La sugerencia se muestra; el entrenador la APLICA
     (reescribe las etiquetas de los días) o la IGNORA (no cambia
     nada). Jamás se aplica en silencio. */
let TPL = null;            // documentos de routine_templates (cada uno con su id)
let TPL_BY_ID = {};        // id -> documento de la plantilla
let TPL_STATE = 'idle';    // 'idle' | 'loading' | 'ok' | 'unavailable'
let TPL_PROMISE = null;
let tplAlignState = { tpl: null, dismissed: false, aligned: false };
function tplEnsure() {
  if (TPL_STATE === 'ok') return Promise.resolve();
  if (TPL_STATE === 'loading' && TPL_PROMISE) return TPL_PROMISE;
  TPL_STATE = 'loading';
  TPL_PROMISE = (async () => {
    try {
      const snap = await getDocs(collection(db, 'routine_templates'));
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      docs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      TPL = docs; TPL_BY_ID = {};
      docs.forEach(x => { if (x && x.id) TPL_BY_ID[x.id] = x; });
      TPL_STATE = docs.length ? 'ok' : 'unavailable';
    } catch { TPL = []; TPL_BY_ID = {}; TPL_STATE = 'unavailable'; }
    tplRenderTplUI();
  })();
  return TPL_PROMISE;
}
const tplField = (tpl, base) => tpl ? (tpl[base + '_' + LANG] || tpl[base + '_es'] || tpl[base + '_en'] || '') : '';
function tplRenderNotice() {
  const box = $('pl-tpl-note');
  if (!box) return;
  box.textContent = TPL_STATE === 'unavailable' ? t('train.tpl.unavailable') : '';
}
function tplRenderList() {
  const box = $('pl-tpl-list');
  if (!box) return;
  if (TPL_STATE !== 'ok' || !TPL) { box.innerHTML = ''; return; }
  box.innerHTML = TPL.map(tpl => `
    <div class="pl-tpl-card">
      <div class="pl-tpl-info"><b>${esc(tplField(tpl, 'nombre'))}</b>
      <span class="pl-tpl-meta">${esc([tplField(tpl, 'nivel'), t('train.tpl.perWeek', { n: tpl.dias_por_semana }), tplField(tpl, 'objetivo')].filter(Boolean).join(' · '))}</span></div>
      <button type="button" class="btn-primary btn-sm pl-tpl-use" data-tpl-id="${esc(tpl.id)}">${t('train.tpl.use')}</button>
    </div>`).join('');
  box.querySelectorAll('.pl-tpl-use').forEach(b => b.onclick = () => tplApply(b.dataset.tplId));
}
function tplRenderTplUI() { tplRenderNotice(); tplRenderList(); }
const TPL_BLOCK_TITLES = {
  cardio_pre: { es: 'Cardio antes', en: 'Cardio before' },
  cardio_post: { es: 'Cardio después', en: 'Cardio after' },
  sauna: { es: 'Sauna', en: 'Sauna' },
};
function tplSessionBlocks(s) {
  /* Bloques de sesión del día (§4.6): de la fila session[] de la
     plantilla a sessionBlocks del plan, como COPIA bilingüe. */
  const out = [];
  const add = (kind, dEs, dEn) => {
    const a = (dEs || '').trim(), b = (dEn || '').trim();
    if (!a && !b) return;
    out.push({ kind, title_es: TPL_BLOCK_TITLES[kind].es, title_en: TPL_BLOCK_TITLES[kind].en, detail_es: a, detail_en: b });
  };
  add('cardio_pre', s.cardio_antes_es, s.cardio_antes_en);
  add('cardio_post', s.cardio_despues_es, s.cardio_despues_en);
  add('sauna', s.sauna_es, s.sauna_en);
  return out;
}
function tplEditorIsDirty() {
  if (($('pl-title').value || '').trim()) return true;
  if (document.querySelectorAll('#pl-days .pl-day').length > 1) return true;
  return [...document.querySelectorAll('#pl-days .pl-ex-name')].some(i => i.value.trim());
}
async function tplApply(id) {
  const tpl = TPL_BY_ID[id];
  if (!tpl) return;
  if (tplEditorIsDirty() && !confirm(t('train.tpl.replaceConfirm'))) return;
  /* La biblioteca resuelve nombres y enlaces (las plantillas NO
     guardan nombres de ejercicio: se resuelven por exerciseId,
     §3.2 del mapeo de carga); se asegura su carga antes de volcar. */
  await libEnsure();
  const blocksByDay = {};
  (tpl.session || []).forEach(s => { blocksByDay[Number(s.dia_num)] = tplSessionBlocks(s); });
  const daysBox = $('pl-days');
  daysBox.innerHTML = '';
  (tpl.days || []).forEach(d => {
    daysBox.appendChild(planDayRow({
      label: LANG === 'es' ? (d.dia_nombre_es || d.dia_nombre_en || '') : (d.dia_nombre_en || d.dia_nombre_es || ''),
      sessionBlocks: blocksByDay[Number(d.dia_num)] || [],
      exercises: (d.exercises || []).map(te => {
        const entry = LIB_BY_ID[te.exerciseId] || null;
        return {
          name: entry ? libNameOf(entry) : (te.exerciseId || ''),
          sets: te.series || '', reps: te.repeticiones || '', note: '',
          exerciseId: te.exerciseId || '',
          photoUrl: entry ? (entry.foto_url || '') : '',
          videoUrl: entry ? (entry.video_youtube_url || '') : '',
          rest: te.descanso_es || '', rest_en: te.descanso_en || '',
          warmup: te.aproximacion_es || '', warmup_en: te.aproximacion_en || '',
        };
      }),
    }));
  });
  $('pl-title').value = tplField(tpl, 'nombre');
  if (planCtx) planCtx.tplSource = { id: tpl.id, version: tpl.version || '' };
  tplAlignState = { tpl, dismissed: false, aligned: false };
  tplRenderAlign();
  toast(t('train.tpl.applied'));
}
/* Reparto semanal de la sugerencia de alineación: desplazamientos
   (en días desde la fecha de inicio) según los días/semana de la
   plantilla — p. ej. 3 días → inicio, +2 y +4 (lunes/miércoles/
   viernes si se empieza un lunes). Es SOLO una sugerencia visible. */
const TPL_WEEK_OFFSETS = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
function tplAlignDates() {
  const inp = $('pl-tpl-start');
  const v = inp ? inp.value : '';
  if (!v || !tplAlignState.tpl) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d);
  const n = Math.min(Math.max(Number(tplAlignState.tpl.dias_por_semana) || (tplAlignState.tpl.days || []).length || 1, 1), 7);
  return TPL_WEEK_OFFSETS[n].map(o => { const dt = new Date(start); dt.setDate(dt.getDate() + o); return dt; });
}
function tplRenderAlign() {
  const area = $('pl-tpl-align'), body = $('pl-tpl-align-list');
  if (!area || !body) return;
  if (!tplAlignState.tpl || tplAlignState.dismissed) { area.style.display = 'none'; return; }
  area.style.display = '';
  const note = $('pl-tpl-align-applied');
  if (note) note.style.display = tplAlignState.aligned ? '' : 'none';
  const applyBtn = $('pl-tpl-align-apply');
  const dates = tplAlignDates();
  const loc = LANG === 'es' ? 'es' : 'en';
  if (!dates) {
    body.innerHTML = `<div class="pl-tpl-align-hint">${t('train.tpl.alignHint')}</div>`;
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }
  if (applyBtn) applyBtn.style.display = '';
  const dayEls = [...document.querySelectorAll('#pl-days .pl-day')];
  const startTxt = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).format(dates[0]);
  body.innerHTML = `<div class="pl-tpl-align-title">${t('train.tpl.alignTitle', { date: startTxt })}</div>` + dates.map((dt, i) => {
    const label = dayEls[i] ? (dayEls[i].querySelector('.pl-day-label').value.trim() || '—') : '—';
    const wd = new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(dt);
    const ds = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(dt);
    return `<div class="pl-tpl-align-row"><span>${esc(label)}</span><span class="pl-tpl-align-arrow">→</span><b>${esc(wd)} ${esc(ds)}</b></div>`;
  }).join('');
}
function tplApplyAlign() {
  const dates = tplAlignDates();
  if (!dates) return;
  const loc = LANG === 'es' ? 'es' : 'en';
  const dayEls = [...document.querySelectorAll('#pl-days .pl-day')];
  dates.forEach((dt, i) => {
    const el = dayEls[i];
    if (!el) return;
    const input = el.querySelector('.pl-day-label');
    const cur = input.value.trim();
    const tail = cur.includes('—') ? cur.split('—').slice(1).join('—').trim() : cur;
    let wd = new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(dt);
    wd = wd.charAt(0).toUpperCase() + wd.slice(1);
    input.value = tail ? `${wd} — ${tail}` : wd;
  });
  tplAlignState.aligned = true;
  tplRenderAlign();
}
function tplOnEditorOpen() {
  tplAlignState = { tpl: null, dismissed: false, aligned: false };
  const start = $('pl-tpl-start');
  if (start) start.value = '';
  tplRenderAlign();
  tplRenderTplUI();
  tplEnsure();
}
if ($('pl-tpl-start')) $('pl-tpl-start').addEventListener('change', () => tplRenderAlign());
if ($('pl-tpl-align-apply')) $('pl-tpl-align-apply').onclick = () => tplApplyAlign();
if ($('pl-tpl-align-ignore')) $('pl-tpl-align-ignore').onclick = () => { tplAlignState.dismissed = true; tplRenderAlign(); };

/* ================= CONSTRUCTOR VISUAL (§5.1) =================
   Paquete 9 de la integración de entrenamiento (propuesta v1.1
   §5.1): un MODO VISUAL dentro del editor de planes existente — no
   un editor paralelo. Explorador de la biblioteca en rejilla de
   tarjetas (foto, nombre en el idioma activo, grupo · equipo ·
   nivel) con filtro por grupo muscular y buscador de texto con el
   MISMO criterio bilingüe insensible a acentos de la biblioteca del
   P4 (§4.1): se reutilizan libEnsure/libNorm/libField/libNameOf y
   la caché de sesión — la colección se sigue leyendo UNA sola vez
   por sesión, la lea quien la lea primero.
   - «Añadir» crea la fila en el día destino con el mecanismo de
     siempre (planExRow + wirePlanExRows) y la VINCULA con
     libLinkRow: al guardar persiste exerciseId + photoUrl/videoUrl
     copiados (§4.6), exactamente igual que eligiéndola desde el
     autocompletado. Añadir dos veces el mismo ejercicio crea dos
     filas: lo decide el entrenador, sin bloqueos.
   - El día destino se elige en el propio panel (selector con las
     etiquetas vivas de los días del editor) y se sincroniza al
     tocar un día del editor; el selector se reconstruye al abrir el
     panel, al añadir un día y antes de cada «Añadir» — nunca apunta
     a un día que ya no existe.
   - Si la biblioteca no se puede leer, el panel muestra el aviso
     honesto de la biblioteca (el mismo texto del P4) y la rejilla
     queda vacía: el editor clásico sigue plenamente usable y NADA
     se bloquea — la única puerta dura sigue siendo la PAR-Q (§4.5),
     intacta: el guardado es el camino existente, sin cambios.
   - Diferencia deliberada frente al autocompletado: en un
     explorador, un texto de 0–1 caracteres NO filtra (se navega la
     rejilla completa o el grupo elegido); con 2+ caracteres filtra
     con el mismo criterio de términos y orden del P4. */
function vizGroups() {
  const seen = new Map();
  for (const ex of (LIB || [])) {
    const key = ex.grupo_muscular_es || ex.grupo_muscular_en || '';
    if (key && !seen.has(key)) seen.set(key, libField(ex, 'grupo_muscular') || key);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}
function vizFilter() {
  if (LIB_STATE !== 'ok' || !LIB) return [];
  const g = ($('pl-viz-group') || {}).value || '';
  const q = libNorm((($('pl-viz-q') || {}).value || '')).trim();
  const inGroup = LIB.filter(ex => !g || (ex.grupo_muscular_es || ex.grupo_muscular_en || '') === g);
  if (q.length < 2) return [...inGroup].sort((a, b) => libNameOf(a).localeCompare(libNameOf(b)));
  const terms = q.split(/\s+/);
  const scored = [];
  for (const ex of inGroup) {
    const hay = libNorm([ex.nombre_es, ex.nombre_en, ex.grupo_muscular_es, ex.grupo_muscular_en, ex.equipo_es, ex.equipo_en, ex.nivel_es, ex.nivel_en].join(' '));
    if (!terms.every(tm => hay.includes(tm))) continue;
    const nA = libNorm(LANG === 'es' ? ex.nombre_es : ex.nombre_en);
    const nO = libNorm(LANG === 'es' ? ex.nombre_en : ex.nombre_es);
    let rank = 3;
    if (nA.startsWith(q)) rank = 0; else if (nA.includes(q)) rank = 1; else if (nO.includes(q)) rank = 2;
    scored.push([rank, ex]);
  }
  scored.sort((a, b) => a[0] - b[0] || libNameOf(a[1]).localeCompare(libNameOf(b[1])));
  return scored.map(x => x[1]);
}
function vizRenderGroups() {
  const sel = $('pl-viz-group');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">${esc(t('train.viz.allGroups'))}</option>` + vizGroups().map(gr => `<option value="${esc(gr.key)}">${esc(gr.label)}</option>`).join('');
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}
function vizRenderGrid() {
  const grid = $('pl-viz-grid'), note = $('pl-viz-note'), empty = $('pl-viz-empty');
  if (!grid) return;
  if (LIB_STATE !== 'ok') {
    grid.innerHTML = '';
    if (note) note.textContent = LIB_STATE === 'unavailable' ? t('train.lib.unavailable') : '';
    if (empty) empty.style.display = 'none';
    return;
  }
  if (note) note.textContent = '';
  const list = vizFilter();
  grid.innerHTML = list.map(ex => {
    const meta = [libField(ex, 'grupo_muscular'), libField(ex, 'equipo'), libField(ex, 'nivel')].filter(Boolean).join(' · ');
    return `<div class="pl-viz-card">
      ${ex.foto_url ? `<img class="pl-viz-img" src="${esc(ex.foto_url)}" alt="${esc(libNameOf(ex))}" loading="lazy">` : `<div class="pl-viz-img pl-viz-noimg">🏋️</div>`}
      <div class="pl-viz-name">${esc(libNameOf(ex))}</div>
      <div class="pl-viz-meta">${esc(meta)}</div>
      <button type="button" class="btn-primary btn-sm pl-viz-add" data-viz-id="${esc(ex.id)}">${t('train.viz.add')}</button>
    </div>`;
  }).join('');
  grid.querySelectorAll('.pl-viz-add').forEach(b => b.onclick = () => vizAddToDay(b.dataset.vizId));
  if (empty) empty.style.display = list.length ? 'none' : '';
}
function vizRefreshDays(keepIdx) {
  const sel = $('pl-viz-day');
  if (!sel) return;
  const days = [...document.querySelectorAll('#pl-days .pl-day')];
  const prev = keepIdx != null ? keepIdx : Number(sel.value || 0);
  sel.innerHTML = days.map((d, i) => {
    const lab = (d.querySelector('.pl-day-label').value || '').trim();
    return `<option value="${i}">${esc(lab || t('train.viz.dayN', { n: i + 1 }))}</option>`;
  }).join('');
  sel.value = String(Math.min(Math.max(Number.isFinite(prev) ? prev : 0, 0), Math.max(days.length - 1, 0)));
}
function vizRenderAll() { vizRenderGroups(); vizRenderGrid(); vizRefreshDays(); }
function vizAddToDay(exId) {
  const ex = LIB_BY_ID[exId];
  if (!ex) return;
  vizRefreshDays();
  const idx = Number(($('pl-viz-day') || {}).value || 0);
  const dayEl = document.querySelectorAll('#pl-days .pl-day')[idx];
  if (!dayEl) return;
  const d = document.createElement('div');
  d.innerHTML = planExRow({});
  const row = d.firstElementChild;
  dayEl.querySelector('.pl-exs').appendChild(row);
  wirePlanExRows(dayEl);
  libLinkRow(row, ex);
  row.classList.add('pl-ex-just-added');
  setTimeout(() => row.classList.remove('pl-ex-just-added'), 1500);
  if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  toast(t('train.viz.added', { name: libNameOf(ex) }));
}
function vizOnEditorOpen() {
  const body = $('pl-viz-body');
  if (body) body.style.display = 'none';
  const q = $('pl-viz-q');
  if (q) q.value = '';
  vizRefreshDays(0);
}
if ($('pl-viz-toggle')) $('pl-viz-toggle').onclick = () => {
  const body = $('pl-viz-body');
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  if (open) { vizRenderAll(); libEnsure().then(() => vizRenderAll()); }
};
if ($('pl-viz-q')) $('pl-viz-q').addEventListener('input', () => vizRenderGrid());
if ($('pl-viz-group')) $('pl-viz-group').addEventListener('change', () => vizRenderGrid());
if ($('pl-days')) $('pl-days').addEventListener('click', e => {
  const d = e.target.closest('.pl-day');
  if (!d) return;
  const idx = [...document.querySelectorAll('#pl-days .pl-day')].indexOf(d);
  const sel = $('pl-viz-day');
  if (sel && Number(sel.value) !== idx) vizRefreshDays(idx);
});

/* --- Editor de planes (entrenador) --- */
let planCtx = null;
function wirePlanExDel(scope) { scope.querySelectorAll('.pl-ex-del').forEach(b => b.onclick = () => b.closest('.pl-ex-row').remove()); }
function planExRow(ex) {
  ex = ex || {};
  /* Fila vinculada (§4.1): si la biblioteca ya está cargada y la
     ficha existe, el nombre visible se resuelve por idioma; si la
     ficha aún no se conoce (biblioteca cargando) o ya no existe, se
     muestra el name guardado como respaldo y la carga lo confirma o
     lo degrada a texto libre (libRefreshOpenRows). La vinculación y
     las URLs copiadas viajan en data-* de la fila hasta el guardado. */
  const entry = ex.exerciseId ? LIB_BY_ID[ex.exerciseId] : null;
  const shown = entry ? libNameOf(entry) : (ex.name || '');
  const linked = ex.exerciseId ? ` data-exid="${esc(ex.exerciseId)}" data-saved-name="${esc(ex.name || '')}" data-photo="${esc(ex.photoUrl || '')}" data-video="${esc(ex.videoUrl || '')}"` : '';
  /* PLANTILLAS (§4.2/§4.6): descanso y aproximación viajan como
     campos del ejercicio (rest/rest_en, warmup/warmup_en). El campo
     visible muestra el texto del idioma activo (con el otro como
     respaldo) y es editable; AMBOS textos viajan en data-* hasta el
     guardado, que persiste cada uno en su campo. */
  const rw = `${ex.rest ? ` data-rest="${esc(ex.rest)}"` : ''}${ex.rest_en ? ` data-rest-en="${esc(ex.rest_en)}"` : ''}${ex.warmup ? ` data-warmup="${esc(ex.warmup)}"` : ''}${ex.warmup_en ? ` data-warmup-en="${esc(ex.warmup_en)}"` : ''}`;
  const restShown = LANG === 'es' ? (ex.rest || ex.rest_en || '') : (ex.rest_en || ex.rest || '');
  const warmShown = LANG === 'es' ? (ex.warmup || ex.warmup_en || '') : (ex.warmup_en || ex.warmup || '');
  /* CONSTRUCTOR VISUAL (§5.1): miniatura de la fila — la foto de la
     ficha (o la photoUrl copiada) cuando se conoce; si no, el
     elemento nace oculto y libLinkRow/libUnlinkRow lo mantienen. */
  const thumb = (entry ? entry.foto_url : '') || ex.photoUrl || '';
  /* REDISEÑO DE LA FILA (correo de Ronald, 2026-10-24 00:05 CDT): la
     fila en reposo es UNA sola línea compacta — miniatura, nombre,
     SE, REP, nota, eliminar — con títulos cortos. Los botones de
     Foto/Video SALEN de la fila: la multimedia vive en el flotante
     que abre la miniatura (exMediaOpen). Aproximación/descanso y las
     herramientas (sustituto, tipo de cuerpo) NO se pierden: quedan
     en la franja auxiliar «⋯» de la propia fila, cerrada por
     defecto. Nada cambia en el guardado: lee los mismos campos. */
  return `<div class="pl-ex-row"${linked}${rw}>
    <div class="pl-ex-line">
      <button type="button" class="pl-ex-media-btn${thumb ? ' has-photo' : ''}" title="${t('train.lib.media')}"><img class="pl-ex-thumb" alt=""${thumb ? ` src="${esc(thumb)}"` : ' style="display:none"'}><span class="pl-ex-media-ico" aria-hidden="true">🖼</span></button>
      <div class="pl-ex-main">
        <input type="text" class="pl-ex-name" placeholder="${t('train.f.exPh')}" value="${esc(shown)}" autocomplete="off">
        <div class="pl-ex-sug"></div>
      </div>
      <input type="text" class="pl-ex-sets" placeholder="${t('train.f.sePh')}" title="${t('train.f.setsPh')}" value="${esc(ex.sets || '')}">
      <input type="text" class="pl-ex-reps" placeholder="${t('train.f.repPh')}" title="${t('train.f.repsPh')}" value="${esc(ex.reps || '')}">
      <input type="text" class="pl-ex-note" placeholder="${t('train.f.notePh')}" value="${esc(ex.note || '')}">
      <button type="button" class="btn-ghost btn-sm pl-ex-more" title="${t('train.f.more')}">⋯</button>
      <button type="button" class="btn-ghost btn-sm pl-ex-del" title="${t('train.f.remove')}">×</button>
    </div>
    <div class="pl-ex-extra" style="display:none">
      <div class="pl-ex-sub">
        <input type="text" class="pl-ex-warmup" placeholder="${t('train.f.warmupPh')}" value="${esc(warmShown)}">
        <input type="text" class="pl-ex-rest" placeholder="${t('train.f.restPh')}" value="${esc(restShown)}">
      </div>
      <div class="pl-ex-tools">
        <button type="button" class="btn-ghost btn-sm pl-ex-subst">⇄ ${t('train.sub.btn')}</button>
        <button type="button" class="btn-ghost btn-sm pl-ex-btr">🧍 ${t('train.btr.btn')}</button>
      </div>
    </div>
    <div class="pl-ex-subst-box"></div>
    <div class="pl-ex-btr-box"></div>
  </div>`;
}
/* PLANTILLAS (§4.2/§4.6): los bloques de sesión del día
   (sessionBlocks: cardio previo/posterior y sauna) se muestran en
   el editor como fichas visibles bajo la etiqueta del día — el
   entrenador los ve y puede quitar los que no quiera — y viajan en
   una propiedad del elemento del día hasta el guardado, que los
   persiste como COPIA en el plan (sin referencia viva a la
   plantilla). Al reabrir un plan que los trae, se conservan. */
function renderDayBlocks(wrap) {
  const box = wrap.querySelector('.pl-day-blocks');
  if (!box) return;
  const blocks = wrap._sessionBlocks || [];
  box.innerHTML = blocks.map((b, i) => {
    const title = b['title_' + LANG] || b.title_es || b.title_en || '';
    const detail = b['detail_' + LANG] || b.detail_es || b.detail_en || '';
    return `<span class="pl-block-chip"><span><b>${esc(title)}</b>${detail ? ` · ${esc(detail)}` : ''}</span><button type="button" class="pl-block-del" data-bi="${i}" title="${t('train.f.remove')}">×</button></span>`;
  }).join('');
  box.querySelectorAll('.pl-block-del').forEach(btn => btn.onclick = () => {
    wrap._sessionBlocks.splice(Number(btn.dataset.bi), 1);
    renderDayBlocks(wrap);
  });
}
function planDayRow(day) {
  day = day || { label: '', exercises: [{}] };
  const wrap = document.createElement('div');
  wrap.className = 'pl-day';
  wrap.innerHTML = `
    <div class="frow"><label style="flex:1"><input type="text" class="pl-day-label" placeholder="${t('train.f.dayPh')}" value="${esc(day.label || '')}"></label>
    <button type="button" class="btn-ghost btn-sm pl-day-del">${t('train.f.remove')}</button></div>
    <div class="pl-day-blocks"></div>
    <div class="pl-exs">${(day.exercises && day.exercises.length ? day.exercises : [{}]).map(planExRow).join('')}</div>
    <button type="button" class="btn-ghost btn-sm pl-ex-add">${t('train.f.addEx')}</button>`;
  wrap._sessionBlocks = Array.isArray(day.sessionBlocks) ? day.sessionBlocks.map(b => ({ ...b })) : [];
  renderDayBlocks(wrap);
  wrap.querySelector('.pl-day-del').onclick = () => wrap.remove();
  wrap.querySelector('.pl-ex-add').onclick = () => {
    const d = document.createElement('div'); d.innerHTML = planExRow({});
    wrap.querySelector('.pl-exs').appendChild(d.firstElementChild); wirePlanExRows(wrap);
  };
  wirePlanExRows(wrap);
  return wrap;
}
/* ================= EDITOR DEL PLAN: FECHAS Y PLAN ACTIVO =================
   Ajuste del editor (correo de Ronald, memphis, 2026-10-23 23:58 CDT;
   SOLO desarrollo):
   - Si el cliente YA tiene un plan activo, el editor NO muestra el
     catálogo de plantillas al abrir: muestra la TARJETA del plan
     activo (nombre, días/ejercicios, inicio, fin y estado derivado
     por fecha) y el catálogo solo se abre al tocar «Cambiar plan».
     Sin plan activo, el flujo es el de siempre (catálogo visible).
   - El plan gana tres campos OPCIONALES en training_plans:
     startsAt / endsAt ('YYYY-MM-DD', cadenas como las fechas de
     training_logs) y durationPreset ('weekly' | 'fortnightly' |
     'monthly' | 'bimonthly' | 'quarterly'). Las reglas vivas no
     tienen lista blanca de campos en training_plans: los admiten
     tal cual, sin delta. Los planes legados no los traen y todo
     lector los trata como «sin fechas», sin migración.
   - ARITMÉTICA DECLARADA: la fecha de fin es el ÚLTIMO día de
     vigencia (inclusive): semanal = inicio + 7 días − 1; quincenal
     = + 14 − 1; mensual/bimensual/trimestral = + 1/2/3 MESES de
     calendario − 1 día (con el día anclado al último día del mes
     destino si no existe: 31 ene + 1 mes = 28/29 feb). Cambiar el
     inicio o la duración recalcula el fin; el fin editado a mano se
     respeta hasta que el inicio o la duración cambien otra vez.
   - VENCIMIENTO SOLO DE PRESENTACIÓN: un plan activo con endsAt
     anterior a hoy se muestra «Vencido» (entrenador), pero NADIE lo
     desactiva, lo borra ni deja de mostrárselo al cliente: el campo
     active manda como siempre y no existe ningún comportamiento
     automático por fechas en la app. */
function planISOAddDays(iso, n) {
  const d = new Date(iso + 'T12:00:00'); if (isNaN(d)) return '';
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function planISOAddMonths(iso, n) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
  const first = new Date(y, mo + n, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const d = new Date(first.getFullYear(), first.getMonth(), Math.min(da, lastDay));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const PLAN_PRESET_SPAN = { weekly: ['d', 7], fortnightly: ['d', 14], monthly: ['m', 1], bimonthly: ['m', 2], quarterly: ['m', 3] };
function planEndFromPreset(startIso, preset) {
  const span = PLAN_PRESET_SPAN[preset];
  if (!startIso || !span) return '';
  const raw = span[0] === 'd' ? planISOAddDays(startIso, span[1]) : planISOAddMonths(startIso, span[1]);
  return raw ? planISOAddDays(raw, -1) : '';
}
function planIsExpired(p) { return !!(p && p.endsAt && String(p.endsAt) < todayISO()); }
function planPeriodText(p) {
  if (!p) return '';
  const s = p.startsAt ? dateName(p.startsAt) : '', e = p.endsAt ? dateName(p.endsAt) : '';
  if (s && e) return s + ' – ' + e;
  if (s) return t('train.dates.fromOnly', { d: s });
  if (e) return t('train.dates.untilOnly', { d: e });
  return '';
}
function planDatesSync() {
  const st = $('pl-start'), pr = $('pl-preset'), en = $('pl-end');
  if (!st || !pr || !en) return;
  const end = planEndFromPreset(st.value, pr.value);
  if (end) en.value = end;
}
if ($('pl-start')) $('pl-start').addEventListener('change', planDatesSync);
if ($('pl-preset')) $('pl-preset').addEventListener('change', planDatesSync);
function planCurrentCardHTML(p) {
  const expired = planIsExpired(p);
  const period = planPeriodText(p);
  return `<div class="pl-current-head">🗓 ${t('train.dates.currentTitle')}</div>
    <div><b>${esc(p.title || '')}</b> <span class="ok-badge">${t('train.activeBadge')}</span>${expired ? ` <span class="exp-badge">${t('train.dates.expired')}</span>` : ''}</div>
    <div class="pl-current-meta">${t('train.daysCount', { n: (p.days || []).length })} · ${t('train.exCount', { n: (p.days || []).reduce((n, d) => n + (d.exercises || []).length, 0) })}</div>
    <div class="pl-current-meta">${period ? esc(period) : t('train.dates.none')}</div>
    <button type="button" class="btn-primary btn-sm" id="pl-change-plan">${t('train.dates.change')}</button>`;
}
let planCurrentSeq = 0;
async function planCurrentInit(clientUid) {
  const seq = ++planCurrentSeq;
  let active = null;
  try { active = (await fetchPlans(clientUid)).find(p => p.active === true) || null; } catch { active = null; }
  if (seq !== planCurrentSeq || !planCtx || planCtx.clientUid !== clientUid) return;
  const cur = $('pl-current'), tpl = $('pl-tpl');
  if (!cur || !tpl) return;
  if (!active) { cur.style.display = 'none'; cur.innerHTML = ''; tpl.style.display = ''; return; }
  cur.innerHTML = planCurrentCardHTML(active);
  cur.style.display = '';
  tpl.style.display = 'none';
  const btn = $('pl-change-plan');
  if (btn) btn.onclick = () => { tpl.style.display = ''; btn.style.display = 'none'; tpl.scrollIntoView({ block: 'nearest' }); };
}

function openPlanEditor(clientUid, plan) {
  planCtx = { clientUid, planId: plan ? plan.id : null, tplSource: null };
  $('pl-title').value = plan ? (plan.title || '') : '';
  $('pl-notes').value = plan ? (plan.notes || '') : '';
  $('pl-active').checked = plan ? plan.active === true : true;
  /* EDITOR-PLAN (2026-10-24): fechas del plan que se crea/edita —
     inicio por defecto HOY en un plan nuevo; en uno existente, sus
     fechas guardadas. El catálogo nace OCULTO en cada apertura (sin
     destello): planCurrentInit lo muestra solo si el cliente NO
     tiene plan activo, o cuando el entrenador toca «Cambiar plan». */
  $('pl-start').value = plan ? (plan.startsAt || '') : todayISO();
  $('pl-end').value = plan ? (plan.endsAt || '') : '';
  $('pl-preset').value = plan ? (plan.durationPreset || '') : '';
  $('pl-current').style.display = 'none'; $('pl-current').innerHTML = '';
  $('pl-tpl').style.display = 'none';
  planCurrentInit(clientUid);
  const daysBox = $('pl-days'); daysBox.innerHTML = '';
  const days = plan && plan.days && plan.days.length ? plan.days : [{ label: '', exercises: [{}] }];
  days.forEach(d => daysBox.appendChild(planDayRow(d)));
  $('plan-modal').style.display = '';
  planGateRefresh();
  /* BIBLIOTECA (§4.1): una sola lectura por sesión de página, en
     segundo plano; al llegar, las filas abiertas se resuelven. Si la
     biblioteca no está disponible, el aviso queda visible y el
     editor sigue en texto libre (sin bloquear nada). */
  libRenderNotice();
  libEnsure().then(() => libRefreshOpenRows());
  /* PLANTILLAS (§4.2): el selector se ofrece en el mismo editor; la
     lectura es única por sesión y el estado de alineación nace
     limpio en cada apertura. */
  tplOnEditorOpen();
  /* CONSTRUCTOR VISUAL (§5.1): el panel nace cerrado y con el día
     destino en el primer día en cada apertura del editor. */
  vizOnEditorOpen();
}
$('pl-add-day').onclick = () => { $('pl-days').appendChild(planDayRow(null)); vizRefreshDays(document.querySelectorAll('#pl-days .pl-day').length - 1); };
$('plan-cancel').onclick = () => { $('plan-modal').style.display = 'none'; planCtx = null; };
if ($('ex-media-x')) $('ex-media-x').onclick = exMediaClose;
if ($('ex-media-pop')) $('ex-media-pop').addEventListener('click', e => { if (e.target.id === 'ex-media-pop') exMediaClose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') exMediaClose(); });
$('plan-modal').addEventListener('click', e => { if (e.target.id === 'plan-modal') { $('plan-modal').style.display = 'none'; planCtx = null; } });
$('form-plan').addEventListener('submit', async e => {
  e.preventDefault();
  if (!planCtx) return;
  const days = [];
  document.querySelectorAll('#pl-days .pl-day').forEach(dEl => {
    const label = dEl.querySelector('.pl-day-label').value.trim();
    const exercises = [];
    dEl.querySelectorAll('.pl-ex-row').forEach(r => {
      const name = r.querySelector('.pl-ex-name').value.trim();
      if (!name) return;
      const ex = { name, sets: r.querySelector('.pl-ex-sets').value.trim(), reps: r.querySelector('.pl-ex-reps').value.trim(), note: r.querySelector('.pl-ex-note').value.trim() };
      /* BIBLIOTECA (§4.1/§4.6): solo las filas VINCULADAS (data-exid)
         persisten exerciseId y las URLs copiadas de la ficha; las de
         texto libre se guardan exactamente como hasta hoy. */
      if (r.dataset.exid) {
        ex.exerciseId = r.dataset.exid;
        if (r.dataset.photo) ex.photoUrl = r.dataset.photo;
        if (r.dataset.video) ex.videoUrl = r.dataset.video;
      }
      /* PLANTILLAS (§4.2/§4.6): descanso y aproximación — el campo
         visible manda en su idioma y el texto del otro idioma viaja
         en data-*; solo se persisten los textos no vacíos. */
      const restIn = r.querySelector('.pl-ex-rest'), warmIn = r.querySelector('.pl-ex-warmup');
      let rest = r.dataset.rest || '', restEn = r.dataset.restEn || '', warm = r.dataset.warmup || '', warmEn = r.dataset.warmupEn || '';
      if (restIn) { if (LANG === 'es') rest = restIn.value.trim(); else restEn = restIn.value.trim(); }
      if (warmIn) { if (LANG === 'es') warm = warmIn.value.trim(); else warmEn = warmIn.value.trim(); }
      if (rest) ex.rest = rest;
      if (restEn) ex.rest_en = restEn;
      if (warm) ex.warmup = warm;
      if (warmEn) ex.warmup_en = warmEn;
      exercises.push(ex);
    });
    if (exercises.length) {
      const dayObj = { label, exercises };
      /* PLANTILLAS (§4.2/§4.6): los bloques de sesión del día se
         persisten como copia en el plan, sin referencia viva. */
      if (dEl._sessionBlocks && dEl._sessionBlocks.length) dayObj.sessionBlocks = dEl._sessionBlocks.map(b => ({ ...b }));
      days.push(dayObj);
    }
  });
  const title = $('pl-title').value.trim();
  if (!title || !days.length) { toast(t('train.err'), true); return; }
  /* PUERTA PAR-Q: la comprobación corre ANTES de cualquier escritura.
     Primer plan (sin planId y sin planes previos del cliente) sin
     declaración válida comprobable → bloqueo duro y CERO escrituras
     (el modal queda abierto y planCtx intacto). Guardados posteriores
     no se bloquean: se completan y dejan el aviso en la confirmación. */
  const gateExisting = planCtx.planId ? null : await fetchPlans(planCtx.clientUid);
  const isFirstSave = !planCtx.planId && gateExisting.length === 0;
  const gateState = await planGateState(planCtx.clientUid);
  if (isFirstSave && gateState !== 'valid') {
    planGateRender('missing', true);
    toast(t('train.gate.blockFirst'), true);
    return;
  }
  const gateWarnAfter = !isFirstSave && gateState !== 'valid';
  const active = $('pl-active').checked;
  const data = { clientUid: planCtx.clientUid, title, notes: $('pl-notes').value.trim(), days, active, updatedAt: serverTimestamp() };
  /* EDITOR-PLAN (2026-10-24): fechas de la rutina. Sin fecha elegida
     se escribe null — todos los lectores tratan null y ausente
     igual — para que una fecha BORRADA al editar desaparezca de
     verdad del documento fusionado, sin necesitar deleteField. */
  data.startsAt = $('pl-start').value || null;
  data.endsAt = $('pl-end').value || null;
  data.durationPreset = $('pl-preset').value || null;
  /* PLANTILLAS (§4.2/§4.6): procedencia OPCIONAL y veraz — solo si
     en ESTA sesión del editor se aplicó una plantilla. Es
     trazabilidad (qué plantilla y qué versión originaron el
     borrador); el plan guardado es una copia independiente, sin
     vínculo vivo con la plantilla. */
  if (planCtx.tplSource) {
    data.sourceRoutineId = planCtx.tplSource.id;
    if (planCtx.tplSource.version) data.sourceRoutineVersion = planCtx.tplSource.version;
    const lv = (LIB && LIB.length && LIB[0].version) || '';
    if (lv) data.libraryVersion = lv;
  }
  let planId = planCtx.planId;
  if (planId) {
    /* VERSIONADO (§6.4, pregunta 13 aceptada): antes de sobrescribir
       un plan existente, su versión ANTERIOR se conserva como
       instantánea en la misma colección — copia fiel marcada
       (isSnapshot, sourcePlanId, snapshotAt) y jamás activa. La
       instantánea se escribe SOLO tras pasar la puerta PAR-Q: un
       guardado bloqueado no escribe nada, como siempre. Crear un
       plan nuevo no genera instantánea (no hay versión anterior). */
    const prevSnap = await getDoc(doc(db, 'training_plans', planId));
    if (prevSnap.exists()) {
      await addDoc(collection(db, 'training_plans'), { ...prevSnap.data(), isSnapshot: true, sourcePlanId: planId, snapshotAt: serverTimestamp(), active: false });
    }
    await setDoc(doc(db, 'training_plans', planId), data, { merge: true });
  } else {
    data.createdBy = auth.currentUser.uid; data.createdAt = serverTimestamp();
    planId = (await addDoc(collection(db, 'training_plans'), data)).id;
  }
  if (active) {
    const others = await fetchPlans(planCtx.clientUid);
    for (const o of others) if (o.id !== planId && o.active === true)
      await setDoc(doc(db, 'training_plans', o.id), { active: false, updatedAt: serverTimestamp() }, { merge: true });
  }
  const cuid = planCtx.clientUid;
  planCtx = null;
  $('plan-modal').style.display = 'none';
  toast(gateWarnAfter ? t('train.gate.savedWithWarning') : t('train.saved'), gateWarnAfter);
  if ($('client-training')) loadClientTraining(cuid);
  if (cuid === auth.currentUser.uid) loadMyTraining();
});

/* ================= PESTAÑAS PRINCIPALES ================= */
function switchTab(name) {
  document.querySelectorAll('.main-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => { p.style.display = (p.id === 'tab-' + name) ? '' : 'none'; });
  if (IS_OWNER && name === 'access') loadAdmin();
  if (ROLE !== 'usuario' && name === 'clients') loadClients();
}
document.querySelectorAll('.main-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

/* Lightbox simple para ampliar fotos */
function showLightbox(url) {
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox'; lb.className = 'lightbox';
    lb.innerHTML = `<img id="lightbox-img" alt="${t('ui.photoAlt')}">`;
    lb.addEventListener('click', () => { lb.style.display = 'none'; });
    document.body.appendChild(lb);
  }
  document.getElementById('lightbox-img').src = url;
  lb.style.display = 'flex';
}

/* ================= RENDER (igual que la versión anterior) ================= */
function totals(date) {
  const t = { kcal: 0, prot: 0, carb: 0, azuc: 0, gras: 0 };
  (MEALS[date] || []).forEach(m => { t.kcal += m.kcal; t.prot += m.prot; t.carb += m.carb; t.azuc += m.sugar; t.gras += m.fat; });
  return t;
}
function ringSVG(m, val) {
  const goal = goalOf(m.key);
  if (goal === null) {
    /* Sin meta para esta métrica: anillo neutro SOLO con el consumo
       (sin %, sin «/ meta», sin comparación fantasma). */
    return `<svg class="ring-svg" viewBox="0 0 150 150">
    <circle cx="75" cy="75" r="62" fill="none" stroke="#E9ECEF" stroke-width="16"/>
    <text x="75" y="80" text-anchor="middle" font-size="26" font-weight="800" fill="${m.color}">${fmt(val)}</text>
    <text x="75" y="102" text-anchor="middle" font-size="11" fill="#9ca3af">${m.unit}</text>
  </svg>`;
  }
  const pct = val / goal;
  const shown = Math.min(pct, 1);
  const C = 2 * Math.PI * 62;
  const dash = (shown * C).toFixed(1);
  return `<svg class="ring-svg" viewBox="0 0 150 150">
    <circle cx="75" cy="75" r="62" fill="none" stroke="#E9ECEF" stroke-width="16"/>
    <circle cx="75" cy="75" r="62" fill="none" stroke="${m.color}" stroke-width="16"
      stroke-linecap="round" stroke-dasharray="${dash} ${C.toFixed(1)}"
      transform="rotate(-90 75 75)"/>
    <text x="75" y="70" text-anchor="middle" font-size="26" font-weight="800" fill="${m.color}">${Math.round(pct*100)}%</text>
    <text x="75" y="92" text-anchor="middle" font-size="12" fill="#6b7280">${fmt(val)} / ${fmt(goal)}</text>
    <text x="75" y="108" text-anchor="middle" font-size="11" fill="#9ca3af">${m.unit}</text>
  </svg>`;
}
function statusBox(m, val) {
  const goal = goalOf(m.key);
  if (goal === null) return ''; // sin meta no hay estado que comparar
  const pct = val / goal;
  const over = pct >= 1;
  const diff = Math.abs(val - goal);
  if (m.max) {
    if (!over) return `<div class="ring-box ok"><b>${t('status.left')}</b>${fmt(diff)} g<br>(${Math.round((1-pct)*100)}% ${t('status.available')})</div>`;
    return `<div class="ring-box over"><b>${t('status.overLimit')}</b>+${fmt(diff)} g<br>(${Math.round((pct-1)*100)}% ${t('status.above')})</div>`;
  }
  if (!over) return `<div class="ring-box ok"><b>${t('status.left')}</b>${fmt(diff)} ${m.unit}<br>(${Math.round((1-pct)*100)}% ${t('status.available')})</div>`;
  return `<div class="ring-box over"><b>${t('status.overGoal')}</b>+${fmt(diff)} ${m.unit}<br>(${Math.round((pct-1)*100)}% ${t('status.above')})</div>`;
}
/* ============ ANILLOS EN FILA + VENTANA DE DETALLE (Ronald, 2026-10-21) ============
   La vista diaria ya no apila cinco tarjetas grandes: una FILA en el
   flujo normal de la página (no flotante) con los 5 anillos pequeños,
   al estilo visual del dock pero estáticos. Al tocar uno se abre la
   ventana flotante #ring-detail con el anillo GRANDE de esa métrica
   (ringSVG + statusBox, los de siempre) y la leyenda de aportes.
   Sin cambios de datos ni de cálculo: la fila se alimenta de los
   mismos totales de totals() y la leyenda lee MEALS[fecha], ya
   cargado — cero lecturas nuevas a Firestore, cero llamadas. */
/* Campo del registro de comida que alimenta cada métrica. La leyenda
   es por ELEMENTO cuando el registro trae desglose GUARDADO (items,
   persistido al guardar desde el análisis con su suma cuadrada a los
   totales) y por REGISTRO cuando no lo trae (históricos y manuales):
   momento + texto completo del registro y su total. Granularidad
   honesta: jamás se reparte un total entre alimentos sin desglose
   guardado. */
const MEAL_FIELD = { kcal: 'kcal', prot: 'prot', carb: 'carb', azuc: 'sugar', gras: 'fat' };
function ringMiniSVG(m, val) {
  const goal = goalOf(m.key);
  const C = 2 * Math.PI * 30;
  if (goal === null) {
    /* Sin meta: anillo neutro con SOLO el consumo, igual que el grande. */
    return `<svg class="ring-mini-svg" viewBox="0 0 72 72" aria-hidden="true">
    <circle cx="36" cy="36" r="30" fill="none" stroke="#E9ECEF" stroke-width="7"/>
    <text x="36" y="41" text-anchor="middle" font-size="15" font-weight="800" fill="${m.color}">${fmt(val)}</text>
  </svg>`;
  }
  const pct = val / goal;
  const dash = (Math.min(pct, 1) * C).toFixed(1);
  return `<svg class="ring-mini-svg" viewBox="0 0 72 72" aria-hidden="true">
    <circle cx="36" cy="36" r="30" fill="none" stroke="#E9ECEF" stroke-width="7"/>
    <circle cx="36" cy="36" r="30" fill="none" stroke="${m.color}" stroke-width="7"
      stroke-linecap="round" stroke-dasharray="${dash} ${C.toFixed(1)}"
      transform="rotate(-90 36 36)"/>
    <text x="36" y="41" text-anchor="middle" font-size="16" font-weight="800" fill="${m.color}">${Math.round(pct * 100)}%</text>
  </svg>`;
}
function openRingDetail(key, date) {
  const m = METRICS.find(x => x.key === key);
  if (!m) return;
  const val = totals(date)[m.key];
  const field = MEAL_FIELD[m.key];
  const dayRows = MEALS[date] || [];
  const contrib = dayRows
    .map(r => ({ r, v: num(r[field]) }))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const pctOf = v => `${val > 0 ? Math.round(v / val * 100) : 0}% ${t('rings.ofDay')}`;
  /* Elementos de un registro: SOLO su desglose guardado (items), y
     solo los que aportan a ESTA métrica, de mayor a menor. */
  const elemsOf = r => (Array.isArray(r.items) ? r.items : [])
    .map(it => ({ name: it.name || '', v: num(it[field]) }))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v);
  /* Mayor aporte del día en esta métrica: el elemento individual más
     alto entre los registros CON desglose (un registro sin desglose
     no atribuye su total a ningún elemento). */
  let top = null;
  contrib.forEach(({ r }) => elemsOf(r).forEach(e => { if (!top || e.v > top.v) top = { name: e.name, v: e.v, meal: r.meal }; }));
  const topLine = top
    ? `<div class="ring-top-contrib">⭐ ${t('rings.topContrib')}: <b>${esc(top.name)}</b> (${esc(mealName(top.meal))}) — ${fmt(top.v)} ${m.unit} · ${pctOf(top.v)}</div>`
    : '';
  const legend = !dayRows.length
    ? `<p class="ring-detail-empty">${t('track.emptyDay')}</p>`
    : contrib.length
      ? topLine + `<div class="ring-contrib-list">${contrib.map(({ r, v }) => {
          const elems = elemsOf(r);
          /* Sin desglose guardado: la línea por registro de siempre. */
          if (!elems.length)
            return `<div class="ring-contrib"><span class="rc-food"><b>${esc(mealName(r.meal))}</b> — ${esc(r.food)}</span><span class="rc-val">${fmt(v)} ${m.unit} · ${pctOf(v)}</span></div>`;
          /* Con desglose: encabezado del registro (momento + su
             total) y debajo sus elementos, de mayor a menor. */
          const head = `<div class="ring-contrib"><span class="rc-food"><b>${esc(mealName(r.meal))}</b></span><span class="rc-val">${fmt(v)} ${m.unit} · ${pctOf(v)}</span></div>`;
          const rows = elems.map(e =>
            `<div class="ring-contrib item"><span class="rc-food">${esc(e.name)}</span><span class="rc-val">${fmt(e.v)} ${m.unit} · ${pctOf(e.v)}</span></div>`).join('');
          return head + rows;
        }).join('')}
          <div class="ring-contrib total"><span class="rc-food"><b>TOTAL</b></span><span class="rc-val">${fmt(val)} ${m.unit}</span></div></div>`
      : `<p class="ring-detail-empty">${t('rings.noContrib')}</p>`;
  $('ring-detail-title').innerHTML = `${m.icon} ${t('metric.' + m.key)}`;
  $('ring-detail-body').innerHTML = ringSVG(m, val) + statusBox(m, val) +
    `<h3 class="ring-contrib-title">${t('rings.contributions')}</h3>` + legend;
  $('ring-detail-backdrop').style.display = '';
  $('ring-detail').style.display = '';
}
function closeRingDetail() {
  const d = $('ring-detail'), b = $('ring-detail-backdrop');
  if (d) d.style.display = 'none';
  if (b) b.style.display = 'none';
}
$('btn-ring-detail-close').addEventListener('click', closeRingDetail);
$('ring-detail-backdrop').addEventListener('click', closeRingDetail);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRingDetail(); });
function notesFor(tot) {
  /* MOTOR CONSERVADO (2026-10-21): la vista principal ya no lo emite
     por instrucción de Ronald («por ahora»); la función y sus textos
     quedan intactos para poder reactivar el bloque. Ver render(). */
  /* Solo se genera la nota de una métrica si TIENE meta fijada: sin
     meta no hay comparación (nada de divisiones por undefined/NaN).
     Sin ninguna meta, la lista queda vacía y render() muestra el
     estado explícito «Sin metas fijadas todavía». */
  const n = [];
  const gk = goalOf('kcal'), gp = goalOf('prot'), gc = goalOf('carb'), ga = goalOf('azuc'), gg = goalOf('gras');
  if (gk !== null) { const pc = tot.kcal / gk; n.push(pc < 1 ? t('note.kcalIn', { left: fmt(gk - tot.kcal) }) : t('note.kcalOver', { over: fmt(tot.kcal - gk) })); }
  if (gp !== null) { const pp = tot.prot / gp; n.push(pp >= 1 ? t('note.protOver', { over: fmt(tot.prot - gp) }) : pp >= .8 ? t('note.protNear', { pct: Math.round(pp*100) }) : t('note.protUnder', { pct: Math.round(pp*100) })); }
  if (gc !== null) { const pb = tot.carb / gc; n.push(pb >= 1 ? t('note.carbOver', { over: fmt(tot.carb - gc) }) : pb >= .7 ? t('note.carbNear', { pct: Math.round(pb*100) }) : t('note.carbUnder', { pct: Math.round(pb*100) })); }
  if (ga !== null) { const pa = tot.azuc / ga; n.push(pa <= 1 ? t('note.sugarIn', { v: fmt(tot.azuc), g: ga }) : t('note.sugarOver', { over: fmt(tot.azuc - ga) })); }
  if (gg !== null) { const pg = tot.gras / gg; n.push(pg <= 1 ? t('note.fatIn', { pct: Math.round(pg*100) }) : pg <= 1.1 ? t('note.fatSlight', { over: fmt(tot.gras - gg) }) : t('note.fatOver', { over: fmt(tot.gras - gg) })); }
  return n;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Comprime una imagen a JPEG (máx 1280px) para no saturar el almacenamiento. */
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (blob) return blob;
  } catch { /* usa el original */ }
  return file;
}
/* Foto de perfil: pequeña (256px), se guarda como dataURL en el doc del usuario. No requiere Storage. */
async function compressAvatar(file) {
  const bmp = await createImageBitmap(file);
  const maxDim = 256;
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
function setAvatar(url) {
  const img = $('avatar');
  if (url) { img.src = url; }
  else {
    const nm = (typeof UDATA !== 'undefined' && UDATA && UDATA.name) || '';
    const initial = (nm.trim().charAt(0) || '•').toUpperCase();
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="#0d9488"/>' +
      '<text x="32" y="43" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">' + initial + '</text></svg>');
  }
  img.style.display = '';
  img.title = t('avatar.change');
}
$('avatar').addEventListener('click', () => $('avatar-file').click());
$('avatar-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    toast(t('msg.uploading'));
    const url = await compressAvatar(f);
    if (url.length > 400000) { toast(t('msg.tooBig'), true); return; }
    await setDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: url }, { merge: true });
    UDATA.photoURL = url;
    setAvatar(url);
    toast(t('msg.avatarSaved'));
  } catch { toast(t('msg.uploadFail'), true); }
});
async function uploadPhoto(file, path) {
  const blob = await compressImage(file);
  const r = sRef(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return { url: await getDownloadURL(r), path };
}

/* Hora de registro en formato hh:mm (24 h) en la zona del usuario
   (America/Chicago, la misma con la que la app calcula «hoy»). */
const MEAL_TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const mealTimeStr = ms => MEAL_TIME_FMT.format(new Date(ms));

function render(date) {
  $('dateTitle').textContent = dateName(date);
  if (!hasAnyGoal()) {
    $('goals-row').innerHTML = `<span class="goals-none">${t('goals.none')}</span>`;
  } else {
    const gv = (key, suffix, prefix = '') => { const g = goalOf(key); return g === null ? '<b>—</b>' : `<b>${prefix}${fmt(g)}${suffix}</b>`; };
    $('goals-row').innerHTML =
      `<span>${t('metric.kcal')}: ${gv('kcal', ' kcal')}</span>` +
      `<span>${t('metric.prot')}: ${gv('prot', ' g')}</span>` +
      `<span>${t('metric.carb')}: ${gv('carb', ' g')}</span>` +
      `<span>${t('metric.azuc')}: ${gv('azuc', ' g', '≤ ')}</span>` +
      `<span>${t('metric.gras')}: ${gv('gras', ' g')}</span>`;
  }
  const tot = totals(date);
  const vals = { kcal: tot.kcal, prot: tot.prot, carb: tot.carb, azuc: tot.azuc, gras: tot.gras };
  closeRingDetail(); // un re-render (otra fecha, otro idioma) cierra el detalle abierto: no queda ventana con datos de otro día
  $('rings').innerHTML = METRICS.map(m => {
    const goal = goalOf(m.key);
    /* Sub compacto: con meta «consumo/meta» (la unidad solo en gramos;
       en calorías el rótulo ya dice la métrica y «kcal» no cabe a
       390 px); sin meta, consumo + unidad, como el anillo grande. */
    const sub = goal === null
      ? `${fmt(vals[m.key])} ${m.unit}`
      : `${fmt(vals[m.key])}/${fmt(goal)}${m.key === 'kcal' ? '' : ' ' + m.unit}`;
    return `<button type="button" class="ring-mini" data-ring="${m.key}" aria-haspopup="dialog" aria-label="${esc(t('metric.' + m.key))}">${ringMiniSVG(m, vals[m.key])}<span class="ring-mini-name">${t('metric.' + m.key)}</span><span class="ring-mini-sub">${sub}</span></button>`;
  }).join('');
  document.querySelectorAll('[data-ring]').forEach(b =>
    b.onclick = () => openRingDetail(b.dataset.ring, date));
  /* UX10-3 (piloto, 2026-10-23): con el día en cero (el primer día,
     antes de registrar nada), una explicación corta y no invasiva de
     qué es cada anillo, bajo la fila de anillos. En cuanto el día
     tiene cualquier consumo, la nota desaparece. */
  const rn = $('rings-note');
  if (rn) {
    const allZero = METRICS.every(m => !(vals[m.key] > 0));
    rn.textContent = allZero ? t('rings.firstNote') : '';
    rn.style.display = allZero ? '' : 'none';
  }
  renderWeekChart(date);
  /* ORDEN DESCENDENTE + HORA (Ronald, 2026-10-23): el «Detalle de lo
     consumido» se pinta de la comida registrada MÁS RECIENTE a la más
     antigua, con su hora de registro junto a la etiqueta. Se ordena
     una COPIA: MEALS conserva su orden por tipo de comida para los
     demás consumidores (anillos, pendientes, totales). Una fila sin
     createdAt conocido (0) va al final y no muestra hora inventada. */
  const rows = (MEALS[date] || []).slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  let html = rows.map(m =>
    `<tr><td>${esc(mealName(m.meal))}${m.createdAtMs ? ` <span class="meal-time">${mealTimeStr(m.createdAtMs)}</span>` : ''}</td><td>${esc(m.food)}${m.photoURL ? ` <a href="${esc(m.photoURL)}" target="_blank" rel="noopener" title="${t('track.viewPhoto')}">📷</a>` : ''}</td><td>${esc(m.qty)}</td>` +
    `<td class="num">${fmt(m.kcal)}</td><td class="num">${fmt(m.prot)}</td><td class="num">${fmt(m.carb)}</td>` +
    `<td class="num">${fmt(m.sugar)}</td><td class="num">${fmt(m.fat)}</td>` +
    `<td class="meal-actions"><button class="rep-btn" data-repeat-meal="${m.id}" title="${t('track.repeat')}">↻ ${t('track.repeat')}</button><button class="del-btn" data-del-meal="${m.id}" title="${t('track.delete')}">×</button></td></tr>`
  ).join('');
  if (rows.length) html += `<tr class="total"><td colspan="3">TOTAL</td><td class="num" style="color:#16A34A">${fmt(tot.kcal)}</td><td class="num" style="color:#2563EB">${fmt(tot.prot)}</td><td class="num" style="color:#D97706">${fmt(tot.carb)}</td><td class="num" style="color:#9333EA">${fmt(tot.azuc)}</td><td class="num" style="color:#DC2626">${fmt(tot.gras)}</td><td></td></tr>`;
  $('detailBody').innerHTML = html || `<tr><td colspan="9" class="wempty">${t('track.emptyDay')}</td></tr>`;
  /* SIN TABLA «RESUMEN VS. METAS» EN LA VISTA PRINCIPAL (Ronald,
     2026-10-21 20:47: «Quiero ocultar esto mientras tanto también»,
     sobre la captura de la tabla): la tabla (Indicador / Consumo /
     Meta / Progreso con sus barras de colores) ya NO se emite en esta
     vista — ni el <h2> ni el contenedor #vsRows en index.html ni esta
     emisión. Retirada REVERSIBLE («mientras tanto»): el cálculo sigue
     intacto —totals(), goalOf() y METRICS alimentan igual la fila de
     anillos y su ventana de detalle, que sigue mostrando consumo y
     meta con normalidad— y los textos track.summary / vs.* y las
     clases .vsrow / .bar-* se conservan en el código; para
     reactivarla basta reponer el <h2> y el <div id="vsRows"> en
     index.html y la emisión que había aquí. El panel conserva SOLO el
     botón «Añadir comida manualmente» (#btn-add-meal-manual): no
     forma parte de la tabla —es la única entrada manual de la vista—
     y por instrucción anterior de Ronald vive en esta fila; no se
     toca. */
  /* SIN BLOQUE «NOTAS» EN LA VISTA PRINCIPAL (Ronald, 2026-10-21:
     «Por ahora tampoco quiero esto en mi vista principal»): el bloque
     «📝 Notas» ya NO se emite en esta vista — ni el contenedor en
     index.html ni esta emisión. Retirada REVERSIBLE («por ahora»):
     el motor notesFor() y los textos note.* / track.notes se conservan
     intactos; para reactivarlo basta reponer el <div class="notes">
     en index.html y la emisión de dos líneas que había aquí. Las
     notas de cada comida siguen viviendo en su registro y en el
     formulario de la comida; no se borra ningún dato guardado. */

  document.querySelectorAll('[data-repeat-meal]').forEach(b =>
    b.onclick = () => {
      const row = rows.find(r => r.id === b.dataset.repeatMeal);
      if (row) openRepeatMeal(row, date);
    });
  document.querySelectorAll('[data-del-meal]').forEach(b =>
    b.onclick = async () => {
      if (!confirm(t('confirm.delMeal'))) return;
      const row = rows.find(r => r.id === b.dataset.delMeal);
      await deleteDoc(doc(db, 'nutrition_meals', b.dataset.delMeal));
      if (row && row.photoPath) { try { await deleteObject(sRef(storage, row.photoPath)); } catch {} }
      toast(t('msg.mealDeleted'));
      await loadAllKeepDate(date);
    });
}
async function loadAllKeepDate(date) {
  await loadAll();
  const sel = $('dateSel');
  if ([...sel.options].some(o => o.value === date)) { sel.value = date; render(date); }
}

/* ================= PESO ================= */
function weightChartSVG(data) {
  const W = 640, H = 260, P = { l: 46, r: 46, t: 18, b: 30 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const pesos = data.map(d => d.weight);
  let mn = Math.min(...pesos), mx = Math.max(...pesos);
  if (mn === mx) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * 0.25; mn -= pad; mx += pad;
  const X = i => P.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const Y = v => P.t + ih - ((v - mn) / (mx - mn)) * ih;
  const pts = data.map((d, i) => `${X(i).toFixed(1)},${Y(d.weight).toFixed(1)}`).join(' ');
  let grasaLine = '', grasaDots = '';
  const grasas = data.map(d => d.fat).filter(g => g > 0);
  if (grasas.length >= 2) {
    let gmin = Math.min(...grasas), gmax = Math.max(...grasas);
    if (gmin === gmax) { gmin -= 1; gmax += 1; }
    const GY = v => P.t + ih - ((v - gmin) / (gmax - gmin)) * ih;
    const gpts = data.map((d, i) => d.fat > 0 ? `${X(i).toFixed(1)},${GY(d.fat).toFixed(1)}` : '').filter(Boolean).join(' ');
    grasaLine = `<polyline points="${gpts}" fill="none" stroke="#A855F7" stroke-width="2" stroke-dasharray="6 4" opacity="0.85"/>`;
    grasaDots = data.map((d, i) => d.fat > 0
      ? `<circle cx="${X(i)}" cy="${GY(d.fat)}" r="4" fill="#A855F7"><title>Grasa ${d.fat}% · ${dateName(d.date)}</title></circle>` : '').join('');
  }
  const dots = data.map((d, i) =>
    `<circle cx="${X(i)}" cy="${Y(d.weight)}" r="5" fill="#0d9488" stroke="#fff" stroke-width="2"><title>${d.weight} kg · ${dateName(d.date)}</title></circle>
     <text x="${X(i)}" y="${Y(d.weight) - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#0f766e">${d.weight}</text>
     <text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#9ca3af">${shortDate(d.date)}</text>`).join('');
  const grid = [0, 0.5, 1].map(f => {
    const v = mn + (mx - mn) * f, y = Y(v);
    return `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="#eef2f7" stroke-width="1"/>
            <text x="${P.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${v.toFixed(1)}</text>`;
  }).join('');
  const legend = grasas.length >= 2
    ? `<g font-size="11"><circle cx="${P.l}" cy="10" r="4" fill="#0d9488"/><text x="${P.l + 8}" y="14" fill="#4b5563">${t('weight.chartWeight')}</text>
       <circle cx="${P.l + 110}" cy="10" r="4" fill="#A855F7"/><text x="${P.l + 118}" y="14" fill="#4b5563">${t('weight.chartFat')}</text></g>` : '';
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${legend}${grid}
    <polyline points="${pts}" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round"/>${grasaLine}${grasaDots}${dots}</svg></div>`;
}

function renderWeight() {
  const body = $('weightBody');
  const data = WEIGHTS;
  if (!data.length) {
    body.innerHTML = `<div class="wempty">${t('weight.empty', { btn: t('weight.add') })}</div>`;
    return;
  }
  const last = data[data.length - 1], first = data[0];
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const dW = prev ? last.weight - prev.weight : 0;
  const dT = last.weight - first.weight;
  const dCls = v => v < 0 ? 'down' : v > 0 ? 'up' : 'flat';
  const dTxt = v => `${v < 0 ? '▼' : v > 0 ? '▲' : '●'} ${v > 0 ? '+' : ''}${v.toFixed(1)} kg`;
  // Recordatorio: el pesaje es semanal
  const daysSince = Math.floor((Date.now() - new Date(last.date + 'T12:00:00').getTime()) / 864e5);
  const reminder = daysSince > 7
    ? `<div class="weigh-reminder">${t('weight.reminder', { d: daysSince })}</div>` : '';
  let grasaCard = '';
  if (last.fat > 0) {
    const dg = prev && prev.fat > 0 ? last.fat - prev.fat : 0;
    grasaCard = `<div class="wstat"><div class="lbl">${t('weight.bodyFat')}</div><div class="val">${last.fat}<small> %</small></div>
      <div class="delta ${dCls(dg)}">${prev && prev.fat > 0 ? dTxt(dg).replace('kg','pp') : '—'}</div></div>`;
  }
  /* Redefinición 18:23: editar/borrar el propio pesaje siempre
     disponible (el modal abre con los porcentajes según permiso). */
  const delBtn = `<div style="text-align:center;margin-top:8px"><button class="btn-ghost btn-sm" id="btn-del-weight">${t('weight.delLast', { date: shortDate(last.date) })}</button></div>`;
  const histRows = [...data].reverse().map(d => `
    <tr><td>${dateName(d.date)}</td><td class="num"><b>${d.weight}</b></td>
    <td class="num">${d.fat || '—'}</td><td class="num">${d.muscle || '—'}</td>
    <td class="num">${d.water || '—'}</td><td class="num">${d.visceral || '—'}</td>
    <td>${esc(d.notes)}</td>
    <td><button class="btn-ghost btn-sm" data-edit-weight="${d.id}">${t('client.edit')}</button></td></tr>`).join('');
  body.innerHTML = `
    ${reminder}
    <div class="wstats">
      <div class="wstat"><div class="lbl">${t('weight.current')}</div><div class="val">${last.weight}<small> kg</small></div>
        <div class="delta flat">${shortDate(last.date)}</div></div>
      <div class="wstat"><div class="lbl">${t('weight.vsPrev')}</div><div class="val">${prev ? dTxt(dW).split(' ')[0] : '—'}<small> ${prev ? 'kg' : ''}</small></div>
        <div class="delta ${dCls(dW)}">${prev ? dTxt(dW) : t('weight.firstRecord')}</div></div>
      <div class="wstat"><div class="lbl">${t('weight.totalChange')}</div><div class="val">${dT > 0 ? '+' : ''}${dT.toFixed(1)}<small> kg</small></div>
        <div class="delta ${dCls(dT)}">${t('weight.since', { d: shortDate(first.date), n: data.length, s: data.length > 1 ? 's' : '' })}</div></div>
      ${grasaCard}
    </div>
    ${weightChartSVG(data)}
    <h3 class="history-title">${t('weight.history')}</h3>
    <div class="table-scroll"><table class="detail whist">
      <thead><tr><th>${t('form.date')}</th><th class="num">${t('form.weight')}</th><th class="num">${t('form.bodyfat')}</th><th class="num">${t('form.muscle')}</th><th class="num">${t('form.water')}</th><th class="num">${t('form.visceral')}</th><th>${t('form.notes')}</th><th></th></tr></thead>
      <tbody>${histRows}</tbody>
    </table></div>
    ${delBtn}`;
  const dw = $('btn-del-weight');
  if (dw) dw.onclick = async () => {
    if (!confirm(t('confirm.delWeight', { date: dateName(last.date) }))) return;
    await deleteDoc(doc(db, 'nutrition_weight', last.id));
    toast(t('msg.weightDeleted'));
    await loadAll();
  };
  body.querySelectorAll('[data-edit-weight]').forEach(b => b.onclick = () => {
    const rec = WEIGHTS.find(w => w.id === b.dataset.editWeight);
    if (rec) openWeightModal({ uid: auth.currentUser.uid, docId: rec.id, rec });
  });
}

/* ================= MI PROGRESO (evaluaciones fotográficas cada 15 días) =================
   Desde 2026-10-19 las fotos de progreso NO usan Firebase Storage ni
   Blaze: cada foto se comprime en el navegador (lado mayor máx.
   1024 px, JPEG 0.72 — mismo patrón canvas que compressAvatar, con
   tamaño mayor) y se guarda como dataURL en UN documento por foto de
   la colección nutrition_progress:
     id: `${uid}_${fecha}_${slot}`  (fecha = yyyy-mm-dd del set)
     campos: uid, ownerUid, date, slot ('front'|'side'|'back'),
             photo (dataURL), updatedAt
   El id determinista hace que subir el mismo slot el mismo día
   REEMPLACE la foto sin duplicar el set; un documento por foto
   mantiene cada documento muy por debajo del límite de 1 MiB.
   El campo ownerUid acompaña a uid porque las reglas r4
   (match /nutrition_progress/{docId}) exigen
   request.resource.data.ownerUid == request.auth.uid al crear, y la
   exportación y el borrado de cuenta filtran por ownerUid.
   Los documentos semanales antiguos (weekId/frontURL, de la época de
   Storage) no traen slot/photo/date: esta lectura los ignora.
   Privacidad: solo se leen los documentos del propio usuario; en
   esta etapa no hay vista de entrenador para estas fotos. */
const PROGRESS_SLOTS = ['front', 'side', 'back'];
let PROG = {};          // fecha -> { front: {id, photo}, side: {...}, back: {...} }
let PROG_TARGET = null; // fecha del set mostrado en el área principal
/* Estado de la EVALUACIÓN DE PROGRESO (bloque más abajo): se carga
   en la misma pasada de loadProgress() desde nutrition_progress. */
let EVALS = {};         // fecha -> { measures:{}, comp:{}, completedAt }
let EVAL_CYCLE = { omitted: [], closedSets: [] };
let EVAL_CFG = { requiredMeasures: [], units: 'metric' };
/* ============ COMPOSICIÓN CORPORAL SOLO POR EL ENTRENADOR ============
   Requisito de Ronald (correo expreso 2026-10-23 17:48, SOLO
   desarrollo): los datos de composición corporal (peso, grasa %,
   masa muscular %, agua %, grasa visceral y notas — el registro de
   nutrition_weight, más el peso y la composición del chequeo) los
   ingresa POR DEFECTO el entrenador/administrador, desde el primer
   chequeo y siempre. El entrenador puede habilitar o retirar, POR
   CLIENTE y de forma expresa, que el cliente los ingrese (caso
   remoto incluido: el mismo interruptor). Cada cambio queda
   registrado con quién y cuándo.
   Casa de datos (patrón del proyecto, sin colección nueva): el
   documento {uid}_compaccess de nutrition_progress, kind
   'compAccess': { mode: 'trainer'|'client', history: [...] }.
   SIN documento = modo 'trainer' (defecto seguro). El cliente crea
   el suyo al abrir la app (ensureCompAccess); el entrenador lo
   ACTUALIZA (la rama de update del propietario en las reglas
   vigentes lo permite, como la nota de fase). Como la puerta PAR-Q,
   esto es un guard de UI/ruta: la barrera de servidor exige el
   candidato de reglas del paquete (no publicado). */
let COMP_ACCESS = { mode: 'trainer', history: [], exists: false };
function compAccessRef(uid) { return doc(db, 'nutrition_progress', `${uid}_compaccess`); }
function compClientCanEdit() { return IS_OWNER || COMP_ACCESS.mode === 'client'; }
async function ensureCompAccess() {
  if (!auth.currentUser || IS_OWNER || COMP_ACCESS.exists) return;
  try {
    await setDoc(compAccessRef(auth.currentUser.uid),
      { kind: 'compAccess', uid: auth.currentUser.uid, ownerUid: auth.currentUser.uid, mode: 'trainer', history: [], updatedAt: serverTimestamp() });
    COMP_ACCESS = { mode: 'trainer', history: [], exists: true };
  } catch {}
}
function applyCompAccessUI() {
  /* Redefinición 2026-10-23 18:23: el botón de pesaje NUNCA se
     oculta (el peso lo ingresa siempre el usuario); el aviso bajo
     el historial pasa a nombrar solo porcentajes y notas. */
  const blocked = !compClientCanEdit();
  const btn = $('btn-add-weight');
  if (btn) btn.style.display = '';
  const nb = $('compacc-notice');
  if (nb) { nb.style.display = blocked ? '' : 'none'; nb.textContent = t('compacc.pctNote'); }
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function progressDates() { return Object.keys(PROG).sort(); }
function progressSetComplete(s) { return !!(s && s.front && s.side && s.back); }
/* Set MOSTRADO en el área principal: el de HOY si ya existe; si no,
   la ÚLTIMA evaluación (completa o no), con su fecha. Sin ningún set,
   se muestra el de hoy vacío. */
function progressTargetDate() {
  const today = todayISO();
  if (PROG[today]) return today;
  const dates = progressDates();
  return dates.length ? dates[dates.length - 1] : today;
}
/* Fecha a la que escriben las subidas: la del set mostrado, SALVO si
   ese set ya está completo y no es de hoy — una evaluación cerrada no
   se sobrescribe: subir una foto abre la evaluación de hoy. */
function progressUploadDate() {
  const target = PROG_TARGET || progressTargetDate();
  if (target !== todayISO() && progressSetComplete(PROG[target])) return todayISO();
  return target;
}
async function loadProgress() {
  PROG = {};
  EVALS = {}; EVAL_CYCLE = { omitted: [], closedSets: [] }; EVAL_CFG = { requiredMeasures: [], units: 'metric' }; EVAL_CTX_PLANS = null;
  COMP_ACCESS = { mode: 'trainer', history: [], exists: false };
  try {
    /* Progreso personal: filtrado por el uid autenticado, también para
       el dueño. Sin relación con Storage. */
    const snap = await getDocs(query(collection(db, 'nutrition_progress'), where('ownerUid', '==', auth.currentUser.uid)));
    snap.forEach(d => { const v = d.data(); if (!v) return;
      if (v.slot && v.photo && v.date) { (PROG[v.date] = PROG[v.date] || {})[v.slot] = { id: d.id, photo: v.photo }; }
      /* Documentos de la evaluación (ver el bloque EVALUACIÓN DE
         PROGRESO): viven en la misma colección con discriminador
         kind; la lectura de fotos los ignora porque no traen
         slot/photo. */
      else if (v.kind === 'evaluation' && v.date) EVALS[v.date] = { measures: v.measures || {}, comp: v.comp || null, completedAt: v.completedAt || null, planContext: v.planContext || null, phaseNote: v.phaseNote || null, phaseNoteAt: v.phaseNoteAt || null };
      else if (v.kind === 'evalCycle') EVAL_CYCLE = { omitted: Array.isArray(v.omitted) ? v.omitted : [], closedSets: Array.isArray(v.closedSets) ? v.closedSets : [] };
      else if (v.kind === 'evalConfig') EVAL_CFG = { requiredMeasures: Array.isArray(v.requiredMeasures) ? v.requiredMeasures : [], units: v.units === 'imperial' ? 'imperial' : 'metric' };
      else if (v.kind === 'compAccess') COMP_ACCESS = { mode: v.mode === 'client' ? 'client' : 'trainer', history: Array.isArray(v.history) ? v.history : [], exists: true };
    });
  } catch { /* sin acceso o sin docs */ }
  await ensureCompAccess();
  renderProgress();
  applyCompAccessUI();
}
function setSlot(which, url) {
  const img = $('preview-' + which), empty = $('empty-' + which), act = $('actions-' + which);
  if (!img || !empty) return;
  if (url) { img.src = url; img.style.display = 'block'; empty.style.display = 'none'; if (act) act.style.display = ''; }
  else { img.removeAttribute('src'); img.style.display = 'none'; empty.style.display = ''; if (act) act.style.display = 'none'; }
}
function findProgressPhoto(id) {
  for (const d of progressDates()) for (const s of PROGRESS_SLOTS) {
    const r = (PROG[d] || {})[s];
    if (r && r.id === id) return { date: d, slot: s, id: r.id, photo: r.photo };
  }
  return null;
}
function renderProgress() {
  const label = $('progress-week-label'); if (!label) return;
  const target = progressTargetDate(); PROG_TARGET = target;
  const set = PROG[target] || {};
  label.textContent = target === todayISO()
    ? t('progress.evalLabel', { date: dateName(target) }) + t('date.today')
    : t('progress.lastLabel', { date: dateName(target) });
  PROGRESS_SLOTS.forEach(s => setSlot(s, set[s] ? set[s].photo : null));
  const missing = PROGRESS_SLOTS.filter(s => !set[s]);
  $('progress-status').textContent = missing.length === 0 ? t('progress.complete')
    : missing.length === 3 ? t('progress.none')
    : t('progress.missingList', { list: missing.map(s => t('progress.' + s)).join(', ') });
  const dates = progressDates();
  const next = $('progress-next');
  if (next) next.textContent = dates.length ? t('progress.next', { date: dateName(addDaysISO(dates[dates.length - 1], 15)) }) : '';
  const hist = dates.filter(d => d !== target).reverse();
  $('progress-history').innerHTML = hist.length ? hist.map(d => {
    const s = PROG[d];
    return `<div class="hist-week"><div class="hist-label">${esc(dateName(d))}</div>
      <div class="hist-imgs">
        ${PROGRESS_SLOTS.map(sl => s[sl]
          ? `<div class="hist-item"><img src="${esc(s[sl].photo)}" alt="${t('progress.' + sl)}" loading="lazy" data-hist-zoom="${esc(s[sl].id)}"><button type="button" class="hist-del" data-hist-del="${esc(s[sl].id)}" title="${t('progress.delete')}">✕</button></div>`
          : `<span class="wempty">${t('progress.' + sl)}: ${t('progress.noPhoto')}</span>`).join('')}
      </div></div>`;
  }).join('') : `<div class="wempty">${t('progress.emptyHistory')}</div>`;
  $('progress-history').querySelectorAll('[data-hist-zoom]').forEach(im => im.addEventListener('click', () => {
    const rec = findProgressPhoto(im.getAttribute('data-hist-zoom')); if (rec) showLightbox(rec.photo);
  }));
  $('progress-history').querySelectorAll('[data-hist-del]').forEach(b => b.addEventListener('click', () => deleteProgressPhoto(b.getAttribute('data-hist-del'))));
  try { renderEval(); } catch {}
}
/* Compresión de la foto de progreso en memoria: lado mayor máx.
   1024 px y JPEG calidad 0.72; el resultado típico queda en
   ~150–350 KB de dataURL, muy por debajo del límite por documento. */
async function compressProgressPhoto(file) {
  const bmp = await createImageBitmap(file);
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}
async function uploadProgressPhoto(which, file) {
  const date = progressUploadDate();
  toast(t('msg.uploading'));
  try {
    const url = await compressProgressPhoto(file);
    if (url.length > 950000) { toast(t('msg.tooBig'), true); return; }
    const uid = auth.currentUser.uid;
    await setDoc(doc(db, 'nutrition_progress', `${uid}_${date}_${which}`), {
      uid, ownerUid: uid, date, slot: which, photo: url, updatedAt: serverTimestamp()
    });
    toast(t('msg.photoSaved'));
    await loadProgress();
    await evalReconcile(date);
  } catch { toast(t('msg.uploadFail'), true); }
}
async function deleteProgressPhoto(id) {
  const rec = findProgressPhoto(id); if (!rec) return;
  if (!confirm(t('progress.delConfirm'))) return;
  try {
    await deleteDoc(doc(db, 'nutrition_progress', rec.id));
    toast(t('msg.photoDeleted'));
    await loadProgress();
    await evalReconcile(rec.date);
  } catch { toast(t('msg.uploadFail'), true); }
}
PROGRESS_SLOTS.forEach(s => {
  const inp = $('photo-' + s);
  if (inp) inp.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    /* Con el paso de encuadre abierto para este slot, el archivo se
       PREVISUALIZA bajo la silueta antes de guardarse; sin paso
       abierto, sube directo como siempre. */
    if (FRAME.slot === s && $('frame-modal').style.display !== 'none') frameStageFile(f);
    else uploadProgressPhoto(s, f); });
  const del = $('del-' + s);
  if (del) del.addEventListener('click', () => { const set = PROG[PROG_TARGET] || {}; if (set[s]) deleteProgressPhoto(set[s].id); });
  const img = $('preview-' + s);
  if (img) img.addEventListener('click', () => { const src = img.getAttribute('src'); if (src) showLightbox(src); });
});

/* ============ FOTOS DE PROGRESO: PASO DE ENCUADRE (2026-10-23) ====
   Guías de encuadre con silueta (frente / costado / espalda) y
   TEMPORIZADOR, SOLO desarrollo. SIN análisis de las fotos: la
   captura termina en uploadProgressPhoto, la ruta de siempre.
   Flujo: tocar «Subir foto»/«Reemplazar» abre el paso; la foto
   elegida se previsualiza BAJO la silueta del ángulo antes de
   guardarse. Si el navegador ofrece cámara en vivo (getUserMedia,
   contexto seguro), el paso la usa con temporizador real
   (0/3/5/10 s) y captura a canvas; donde la plataforma no la
   ofrece, queda la elección de archivo con la misma previsualización
   (límite real de la web: un input file con capture no admite
   temporizador programable). */
const FRAME_SILHOUETTES = {
  front: '<svg viewBox="0 0 100 200" aria-hidden="true"><g fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 5" opacity="0.95"><circle cx="50" cy="18" r="11"/><path d="M34 38 Q50 31 66 38 L72 62 L65 64 L63 50 L62 108 L59 178 L52 178 L50 122 L48 178 L41 178 L38 108 L37 50 L35 64 L28 62 Z"/></g></svg>',
  side: '<svg viewBox="0 0 100 200" aria-hidden="true"><g fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 5" opacity="0.95"><circle cx="52" cy="18" r="11"/><path d="M44 36 Q58 32 62 44 L64 62 L59 63 L57 50 L58 106 Q58 118 57 128 L58 178 L51 178 L47 128 L44 108 L42 62 L40 40 Z"/></g></svg>',
  back: '<svg viewBox="0 0 100 200" aria-hidden="true"><g fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 5" opacity="0.95"><circle cx="50" cy="18" r="11"/><path d="M34 38 Q50 31 66 38 L72 62 L65 64 L63 50 L62 108 L59 178 L52 178 L50 122 L48 178 L41 178 L38 108 L37 50 L35 64 L28 62 Z"/><line x1="50" y1="34" x2="50" y2="106"/><line x1="39" y1="76" x2="61" y2="76"/></g></svg>'
};
let FRAME = { slot: null, file: null, url: null, stream: null, timerId: null };
function frameStopCamera() {
  if (FRAME.timerId) { clearInterval(FRAME.timerId); FRAME.timerId = null; }
  if (FRAME.stream) { try { FRAME.stream.getTracks().forEach(tr => tr.stop()); } catch {} FRAME.stream = null; }
  const v = $('frame-video'); if (v) { v.srcObject = null; v.style.display = 'none'; }
  const c = $('frame-capture'); if (c) c.style.display = 'none';
  const n = $('frame-count'); if (n) n.style.display = 'none';
}
function openFrameModal(slot) {
  FRAME.slot = slot; FRAME.file = null;
  if (FRAME.url) { URL.revokeObjectURL(FRAME.url); FRAME.url = null; }
  $('frame-title').textContent = t('frame.title') + ' · ' + t('progress.' + slot);
  $('frame-guide').textContent = t('frame.guide.' + slot);
  $('frame-silhouette').innerHTML = FRAME_SILHOUETTES[slot] || '';
  const img = $('frame-preview'); img.removeAttribute('src'); img.style.display = 'none';
  $('frame-save').style.display = 'none';
  frameStopCamera();
  $('frame-modal').style.display = '';
}
function closeFrameModal() {
  frameStopCamera();
  FRAME.slot = null; FRAME.file = null;
  if (FRAME.url) { URL.revokeObjectURL(FRAME.url); FRAME.url = null; }
  $('frame-modal').style.display = 'none';
}
function frameStageFile(file) {
  FRAME.file = file;
  if (FRAME.url) URL.revokeObjectURL(FRAME.url);
  FRAME.url = URL.createObjectURL(file);
  frameStopCamera();
  const img = $('frame-preview'); img.src = FRAME.url; img.style.display = '';
  $('frame-save').style.display = '';
}
async function frameStartCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast(t('frame.noCam'), true); return; }
  try {
    FRAME.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('frame-video'); v.srcObject = FRAME.stream; v.style.display = '';
    $('frame-preview').style.display = 'none';
    $('frame-save').style.display = 'none';
    $('frame-capture').style.display = '';
  } catch { toast(t('frame.noCam'), true); }
}
function frameShoot() {
  const v = $('frame-video'); if (!FRAME.stream || !v.videoWidth) return;
  const canvas = document.createElement('canvas');
  const targetRatio = 3 / 4;
  let w = v.videoWidth, h = v.videoHeight;
  if (w / h > targetRatio) w = Math.round(h * targetRatio); else h = Math.round(w / targetRatio);
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, w, h);
  canvas.toBlob(b => { if (b) frameStageFile(new File([b], 'progress-' + FRAME.slot + '.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
}
function frameCapture() {
  const secs = num($('frame-timer').value);
  if (!secs) { frameShoot(); return; }
  let left = secs;
  const n = $('frame-count'); n.textContent = left; n.style.display = '';
  FRAME.timerId = setInterval(() => {
    left--;
    if (left <= 0) { clearInterval(FRAME.timerId); FRAME.timerId = null; n.style.display = 'none'; frameShoot(); }
    else n.textContent = left;
  }, 1000);
}
document.querySelectorAll('label[for^="photo-"]').forEach(l => l.addEventListener('click', e => {
  e.preventDefault();
  openFrameModal(l.getAttribute('for').slice('photo-'.length));
}));
$('frame-cancel').onclick = closeFrameModal;
$('frame-modal').addEventListener('click', e => { if (e.target.id === 'frame-modal') closeFrameModal(); });
$('frame-pick').onclick = () => { const inp = $('photo-' + FRAME.slot); if (inp) inp.click(); };
$('frame-cam').onclick = frameStartCamera;
$('frame-capture').onclick = frameCapture;
$('frame-save').onclick = () => { const f = FRAME.file, s = FRAME.slot; closeFrameModal(); if (f && s) uploadProgressPhoto(s, f); };

/* ================= EVALUACIÓN DE PROGRESO (ciclo quincenal) =================
   Lleva a la app real el sistema del prototipo aprobado por Ronald
   (2026-10-19 20:28, sobre las capturas del prototipo y la propuesta
   consolidada v2, §6–§7): tarjeta del ciclo con fecha prevista,
   lista exacta de lo que falta, avance parcial que NUNCA se presenta
   como evaluación completa, ficha comparativa de DATOS MEDIDOS y
   composición corporal opcional registrada a mano.

   MODELO DE DATOS — veredicto de reglas r4 (sin cambio de reglas):
   las reglas publicadas (match /nutrition_progress/{docId},
   firestore.rules.propuesta-r4 líneas 368–377) no imponen esquema
   de campos: crear exige cuenta aprobada y ownerUid == uid, y el
   catch-all final deniega cualquier colección nueva. El documento
   de usuario tampoco sirve para la configuración: la rama de
   auto-actualización del cliente solo permite campos de perfil.
   Por eso TODO vive en nutrition_progress, con discriminador kind:
     · fotos: {uid}_{fecha}_{slot} — SIN cambios (sistema en prod.).
     · evaluación por set: {uid}_{fecha}_eval, kind 'evaluation':
       { measures: {cintura: cm, …} (canónico cm; el peso NO se
       guarda aquí), comp: {fat, muscle}, completedAt }.
     · ciclo: {uid}_evalcycle, kind 'evalCycle':
       { omitted: [fechas previstas omitidas], closedSets: [fechas] }.
     · configuración: {uid}_evalconfig, kind 'evalConfig':
       { requiredMeasures: [ids], units: 'metric'|'imperial' }.
   La lectura de fotos ignora estos documentos (no traen slot/photo).

   CICLO (propuesta v2 §6, una sola regla): próxima fecha prevista =
   (último EVENTO) + 15 días; el evento es una evaluación completada
   (ancla: su fecha de COMPLETITUD, completedAt) o un ciclo omitido
   (ancla: su fecha prevista). La primera evaluación no tiene fecha
   punitiva. Un ciclo atrasado es EL MISMO pendiente único, con su
   antigüedad; nunca nace una copia por día. Omitir cierra el ciclo
   sin crear ninguna evaluación (0 documentos de evaluación nuevos).
   COMPLETITUD de un set: las 3 fotos + SOLO las medidas configuradas
   como requeridas con valor; las opcionales vacías nunca bloquean.
   El peso se reutiliza de nutrition_weight (no se duplica): para la
   completitud cuenta el pesaje DEL DÍA del set; en la ficha se
   muestra el último pesaje hasta esa fecha.
   UNIDADES: el dato guardado es único y canónico (kg/cm); el
   selector solo cambia la PRESENTACIÓN (conversión al mostrar y al
   capturar, redondeo solo visual): la ida y vuelta no deriva. */
/* Guía VISUAL de medidas con cinta (2026-10-23, SOLO desarrollo):
   ilustración SVG simple generada en la propia app — una figura de
   frente con la banda de la cinta sobre el sitio exacto. Solo UI
   educativa junto a la guía en texto (eval.guide.*): sin cálculos. */
function tapeSVG(id) {
  const band = { hombros: [16, 24, 28, 4], pecho: [17, 36, 26, 4], cintura: [19, 50, 22, 4],
    caderas: [18, 61, 24, 4], muslos: [21, 76, 18, 4], pantorrillas: [22, 95, 16, 4], brazos: [12.5, 36, 5, 12] }[id];
  if (!band) return '';
  const [x, y, w, h] = band;
  return `<svg class="tape-svg" viewBox="0 0 60 120" aria-hidden="true"><circle cx="30" cy="9" r="6" fill="none" stroke="#64748b" stroke-width="1.6"/><path d="M20 23 Q30 18 40 23 L44 35 L40.5 37 L39.5 30 L38.5 57 L36.5 97 L32.5 97 L30.8 66 L29.2 66 L27.5 97 L23.5 97 L21.5 57 L20.5 30 L19.5 37 L16 35 Z" fill="#eef7f5" stroke="#64748b" stroke-width="1.6"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#f59e0b" opacity="0.92"/></svg>`;
}
const EVAL_MEASURES = [
  { id: 'peso', kind: 'w' },
  { id: 'cintura', kind: 'l' }, { id: 'caderas', kind: 'l' },
  { id: 'muslos', kind: 'l' }, { id: 'pantorrillas', kind: 'l' },
  { id: 'brazos', kind: 'l' }, { id: 'hombros', kind: 'l' },
  { id: 'pecho', kind: 'l' }
];
let EVAL_OK_MSG = '';   // confirmación transitoria tras guardar

function evalDocRef(date) { return doc(db, 'nutrition_progress', `${auth.currentUser.uid}_${date}_eval`); }
function evalWeightOn(date) { const r = WEIGHTS.find(w => w.date === date); return r ? r.weight : null; }
function evalWeightUpTo(date) { let v = null; for (const w of WEIGHTS) { if (w.date <= date) v = w.weight; else break; } return v; }
/* Valor a efectos de COMPLETITUD (el peso exige pesaje del día). */
function evalMeasureValue(date, id) {
  if (id === 'peso') return evalWeightOn(date);
  const e = EVALS[date];
  return (e && e.measures && e.measures[id] != null) ? e.measures[id] : null;
}
/* Valor a efectos de FICHA (el peso muestra el último hasta la fecha). */
function evalDisplayValue(date, id) {
  if (id === 'peso') return evalWeightUpTo(date);
  return evalMeasureValue(date, id);
}
function evalMissingItems(date) {
  const items = [];
  PROGRESS_SLOTS.forEach(s => { if (!((PROG[date] || {})[s])) items.push({ kind: 'photo', id: s }); });
  (EVAL_CFG.requiredMeasures || []).forEach(m => { if (evalMeasureValue(date, m) == null) items.push({ kind: 'measure', id: m }); });
  return items;
}
function evalSetComplete(date) {
  if (!date || (EVAL_CYCLE.closedSets || []).includes(date)) return false;
  if (!PROG[date] && !EVALS[date]) return false;
  return evalMissingItems(date).length === 0;
}
function evalCompleteDates() {
  const ds = new Set([...Object.keys(PROG), ...Object.keys(EVALS)]);
  return [...ds].filter(d => evalSetComplete(d)).sort();
}
function evalAnchorOf(date) { const e = EVALS[date]; return (e && e.completedAt) || date; }
function evalLastCompleteDate() { const ds = evalCompleteDates(); return ds.length ? ds[ds.length - 1] : null; }
function evalNextDue() {
  const ev = evalCompleteDates().map(evalAnchorOf).concat(EVAL_CYCLE.omitted || []);
  if (!ev.length) return null;
  ev.sort();
  return addDaysISO(ev[ev.length - 1], 15);
}
function evalPrevCompleteDate(before) {
  const ds = evalCompleteDates().filter(d => d < before);
  return ds.length ? ds[ds.length - 1] : null;
}
/* Set sobre el que trabaja la tarjeta: el mostrado en el área de
   fotos, SALVO si ya está completo (o su ciclo se omitió) y no es de
   hoy — una evaluación cerrada no se reabre: se trabaja en la de hoy. */
function evalTargetDate() {
  const tday = todayISO();
  const t = PROG_TARGET || progressTargetDate();
  if (t !== tday && (evalSetComplete(t) || (EVAL_CYCLE.closedSets || []).includes(t))) return tday;
  return t;
}
function evalHasAdvance(date) {
  const e = EVALS[date];
  return !!((PROG[date] && Object.keys(PROG[date]).length)
    || (e && ((e.measures && Object.keys(e.measures).length) || e.comp)));
}
function evalDaysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
/* ---------- Contexto de plan (Paquete 8 · Pregunta 8 · v1.1 §4.4) ----------
   Foto de contexto del plan activo, INMUTABLE: se adjunta en la
   PRIMERA escritura que crea el documento de evaluación (medidas,
   composición o sello de completitud) si aún no la lleva; jamás se
   sobrescribe una existente ni se le inventa contexto a una
   evaluación pasada (las anteriores a este paquete se etiquetan
   «sin anclaje de plan»). Forma §4.6: { planId, title,
   sourceRoutineId?, planCreatedAt }. Sin plan activo no hay
   anclaje: la evaluación nace sin planContext. La escribe el
   propio cliente en su documento (permitido por las reglas
   vigentes de nutrition_progress: sin reglas nuevas). */
let EVAL_CTX_PLANS = null;   // caché de planes propios (se refresca en loadProgress)
function evalCtxDate(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (typeof v.toDate === 'function') { try { return v.toDate().toISOString().slice(0, 10); } catch { return null; } }
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString().slice(0, 10);
  return null;
}
async function evalFreshContext(date) {
  const e = EVALS[date];
  if (e && e.planContext) return null;              // ya anclada: inmutable
  if (!EVAL_CTX_PLANS) EVAL_CTX_PLANS = await fetchPlans(auth.currentUser.uid);
  const act = (EVAL_CTX_PLANS || []).find(p => p.active === true);
  if (!act) return null;                            // sin plan activo: sin anclaje
  const ctx = { planId: act.id, title: act.title || '' };
  if (act.sourceRoutineId) ctx.sourceRoutineId = act.sourceRoutineId;
  const cd = evalCtxDate(act.createdAt); if (cd) ctx.planCreatedAt = cd;
  return ctx;
}
/* Sella (o desella) la fecha de completitud cuando un flujo de
   ESCRITURA cambia la completitud de un set. Nunca se llama desde
   el render: abrir la vista no escribe nada. */
async function evalReconcile(date) {
  if (!auth.currentUser || !date) return;
  const complete = evalSetComplete(date);
  const e = EVALS[date];
  try {
    if (complete && !(e && e.completedAt)) {
      const ctx = await evalFreshContext(date);
      const payload = { kind: 'evaluation', uid: auth.currentUser.uid, ownerUid: auth.currentUser.uid, date, completedAt: todayISO(), updatedAt: serverTimestamp() };
      if (ctx) payload.planContext = ctx;
      await setDoc(evalDocRef(date), payload, { merge: true });
      EVALS[date] = Object.assign({}, e, { completedAt: todayISO() });
      if (ctx) EVALS[date].planContext = ctx;
      renderEval();
    } else if (!complete && e && e.completedAt) {
      await setDoc(evalDocRef(date), { completedAt: null, updatedAt: serverTimestamp() }, { merge: true });
      EVALS[date] = Object.assign({}, e, { completedAt: null });
      renderEval();
    }
  } catch {}
}
/* ---------- Unidades: presentación sobre el dato canónico ---------- */
function evalFmtNum(v) { const r = Math.round(v * 10) / 10; return r % 1 === 0 ? String(Math.round(r)) : String(r); }
function evalMeasureStr(kind, v) {
  if (EVAL_CFG.units === 'imperial') return kind === 'w' ? evalFmtNum(v * 2.20462) + ' lb' : evalFmtNum(v / 2.54) + ' in';
  return kind === 'w' ? evalFmtNum(v) + ' kg' : evalFmtNum(v) + ' cm';
}
function evalMeasureDiffStr(kind, d) {
  const conv = EVAL_CFG.units === 'imperial' ? (kind === 'w' ? d * 2.20462 : d / 2.54) : d;
  const unit = EVAL_CFG.units === 'imperial' ? (kind === 'w' ? ' lb' : ' in') : (kind === 'w' ? ' kg' : ' cm');
  const r = Math.round(conv * 10) / 10;
  return (r > 0 ? '+' : r < 0 ? '−' : '') + evalFmtNum(Math.abs(r)) + unit;
}
/* De la unidad de presentación al canónico (al capturar un valor). */
function evalToCanonical(kind, v) {
  if (EVAL_CFG.units !== 'imperial') return Math.round(v * 10) / 10;
  return Math.round((kind === 'w' ? v / 2.20462 : v * 2.54) * 10) / 10;
}
function evalToDisplay(kind, v) {
  if (v == null) return '';
  if (EVAL_CFG.units !== 'imperial') return String(Math.round(v * 10) / 10);
  return String(Math.round((kind === 'w' ? v * 2.20462 : v / 2.54) * 10) / 10);
}
/* ---------- Ficha y composición ---------- */
function evalFichaHTML(S) {
  const prev = evalPrevCompleteDate(S);
  const req = EVAL_CFG.requiredMeasures || [];
  const rows = EVAL_MEASURES.map(m => {
    const now = evalDisplayValue(S, m.id);
    const before = prev ? evalDisplayValue(prev, m.id) : null;
    let diffTx = '—';
    if (now != null && before != null) diffTx = evalMeasureDiffStr(m.kind, Math.round((now - before) * 10) / 10);
    const reqTag = req.includes(m.id) ? ` <span class="req-tag">${esc(t('eval.reqTag'))}</span>` : '';
    return `<tr><td>${esc(t('eval.measure.' + m.id))}${reqTag}</td><td class="num">${before == null ? '—' : esc(evalMeasureStr(m.kind, before))}</td><td class="num">${now == null ? '—' : esc(evalMeasureStr(m.kind, now))}</td><td class="num">${diffTx}</td></tr>`;
  }).join('');
  return `<div class="eval-ficha"><p class="eval-ficha-title">${esc(t('eval.fichaTitle'))}</p>`
    + `<div class="table-scroll"><table class="eval-table"><thead><tr><th>${esc(t('eval.colMeasure'))}</th><th class="num">${esc(t('eval.colPrev'))}</th><th class="num">${esc(t('eval.colNow'))}</th><th class="num">${esc(t('eval.colDiff'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p class="eval-detail">${esc(t('eval.fichaObsNote'))}</p>`
    + `<p class="eval-detail">${esc(t('eval.pechoNote'))}</p></div>`;
}
function evalCompEntryText(e) {
  if (!e) return t('eval.compNone');
  const parts = [evalFmtNum(e.value) + ' ' + e.unit, t('eval.method.' + (e.method || 'other'))];
  if (e.estimate) parts.push(t('eval.compEstTag'));
  if (e.dateISO) parts.push(dateName(e.dateISO));
  return parts.join(' · ');
}
function evalCompRow(kind, prevE, nowE) {
  let diff = '—'; const notes = [];
  if (prevE && nowE) {
    if (prevE.unit !== nowE.unit) notes.push(t('eval.compUnitDiff'));
    else {
      const d = Math.round((nowE.value - prevE.value) * 10) / 10;
      diff = (d > 0 ? '+' : d < 0 ? '−' : '') + evalFmtNum(Math.abs(d)) + ' ' + nowE.unit;
      if ((prevE.method || '') !== (nowE.method || '')) notes.push(t('eval.compMethodDiff'));
    }
  }
  const label = kind === 'fat' ? t('eval.compFat') : t('eval.compMuscle');
  return { html: `<tr><td>${esc(label)}</td><td class="num">${esc(evalCompEntryText(prevE))}</td><td class="num">${esc(evalCompEntryText(nowE))}</td><td class="num">${esc(diff)}</td></tr>`, notes };
}
function evalCompHTML(S) {
  const prev = evalPrevCompleteDate(S);
  const prevComp = (prev && EVALS[prev] && EVALS[prev].comp) || {};
  const nowComp = (EVALS[S] && EVALS[S].comp) || {};
  const fat = evalCompRow('fat', prevComp.fat, nowComp.fat), mus = evalCompRow('muscle', prevComp.muscle, nowComp.muscle);
  const notes = [...fat.notes, ...mus.notes];
  const methodOpts = ['bio', 'caliper', 'scan', 'other'].map(m => `<option value="${m}">${esc(t('eval.method.' + m))}</option>`).join('');
  return `<div class="eval-comp"><p class="eval-ficha-title">${esc(t('eval.compTitle'))}</p>`
    + `<p class="eval-detail">${esc(t('eval.compNote'))}</p>`
    + `<div class="table-scroll"><table class="eval-table"><thead><tr><th>${esc(t('eval.colMeasure'))}</th><th class="num">${esc(t('eval.colPrev'))}</th><th class="num">${esc(t('eval.colNow'))}</th><th class="num">${esc(t('eval.colDiff'))}</th></tr></thead><tbody>${fat.html}${mus.html}</tbody></table></div>`
    + notes.map(n => `<p class="eval-detail eval-comp-note">⚠️ ${esc(n)}</p>`).join('')
    + `<p class="eval-detail">${esc(t('eval.compMuscleNote'))}</p>`
    + (compClientCanEdit() ? '' : `<p class="eval-detail">🔒 ${esc(t('compacc.notice'))}</p>`)
    + (compClientCanEdit() ? `<div class="eval-comp-form">`
    + `<div class="eval-comp-row"><span class="eval-comp-name">${esc(t('eval.compFat'))} (%)</span><input type="number" id="eval-comp-fat-value" min="0" step="0.1" placeholder="${esc(t('eval.compValuePh'))}"><select id="eval-comp-fat-method" aria-label="${esc(t('eval.compMethod'))}">${methodOpts}</select><label class="eval-check"><input type="checkbox" id="eval-comp-fat-est"> ${esc(t('eval.compEstimate'))}</label><button type="button" class="btn-ghost btn-sm" id="eval-comp-fat-btn">${esc(t('eval.compRegister'))}</button></div>`
    + `<div class="eval-comp-row"><span class="eval-comp-name">${esc(t('eval.compMuscle'))}</span><input type="number" id="eval-comp-muscle-value" min="0" step="0.1" placeholder="${esc(t('eval.compValuePh'))}"><select id="eval-comp-muscle-unit" aria-label="kg / %"><option value="kg">kg</option><option value="%">%</option></select><select id="eval-comp-muscle-method" aria-label="${esc(t('eval.compMethod'))}">${methodOpts}</select><label class="eval-check"><input type="checkbox" id="eval-comp-muscle-est"> ${esc(t('eval.compEstimate'))}</label><button type="button" class="btn-ghost btn-sm" id="eval-comp-muscle-btn">${esc(t('eval.compRegister'))}</button></div>`
    + `</div>` : '')
    + `</div>`;
}
/* ---------- Tarjeta del ciclo + formulario + configuración ---------- */
function renderEval() {
  const root = $('eval-root');
  if (!root || !auth.currentUser) return;
  const S = evalTargetDate();
  const today = todayISO();
  const due = evalNextDue();
  const lastC = evalLastCompleteDate();
  const missing = evalMissingItems(S);
  const complete = evalSetComplete(S);
  const isFirst = !lastC && !(EVAL_CYCLE.omitted || []).length;
  let card = '';
  if (complete) {
    card = `<p class="eval-card-title">${esc(t('eval.completeTitle'))}</p>`;
  } else if (isFirst) {
    card = `<p class="eval-card-title">${esc(t('eval.firstTitle'))}</p>`
      + `<p class="eval-detail">${esc(t('eval.firstNote'))}</p>`;
  } else {
    let dueLine = '';
    if (due) {
      if (today > due) dueLine = `<p class="eval-detail eval-due">${esc(t('eval.overdue', { date: dateName(due), n: evalDaysBetween(due, today) }))}</p>`;
      else if (today === due) dueLine = `<p class="eval-detail eval-due">${esc(t('eval.dueToday', { date: dateName(due) }))}</p>`;
      else dueLine = `<p class="eval-detail eval-due">${esc(t('eval.dueFuture', { date: dateName(due) }))}</p>`;
    }
    card = `<p class="eval-card-title">${today >= (due || today) ? `<span class="eval-badge">${esc(t('eval.badgePending'))}</span> ` : ''}${esc(today < (due || today) ? t('eval.upcomingTitle') : t('eval.dueTitle'))}</p>`
      + dueLine
      + (lastC ? `<p class="eval-detail">${esc(t('eval.nextCalc', { last: dateName(evalAnchorOf(lastC)) }))}</p>` : '');
  }
  if (!complete) {
    const haveNames = PROGRESS_SLOTS.filter(s => (PROG[S] || {})[s]).map(s => t('eval.reqPhoto.' + s) + ' ✓').join(' · ');
    const missNames = missing.map(it => it.kind === 'photo' ? t('eval.reqPhoto.' + it.id) : t('eval.measure.' + it.id)).join(' · ');
    card += `<p class="eval-detail eval-have">${esc(t('eval.haveLead'))} ${esc(haveNames)}</p>`
      + `<p class="eval-detail eval-missing">${esc(t('eval.missingLead'))} ${esc(missNames)}</p>`
      + (evalHasAdvance(S) ? `<p class="eval-detail eval-partial">${esc(t('eval.partialSaved'))}</p>` : '')
      + `<p class="eval-detail">${esc(t('eval.optionalNote'))}</p>`;
  }
  const cycleLast = lastC ? dateName(lastC) : t('eval.cycleLastNone');
  const cycleNext = due ? dateName(due) : t('eval.cycleNextFirst');
  card += `<p class="eval-detail eval-cycle">${esc(t('eval.cycleLine', { last: cycleLast, next: cycleNext }))}</p>`;
  /* UX10-7 (piloto, 2026-10-23): la explicación del ciclo, en la app:
     cada 15 días toca evaluación con fotos y medidas, contados desde
     la última COMPLETA (así lo calcula evalNextDue: ancla + 15 días);
     la primera no tiene fecha límite. Va en la tarjeta del ciclo,
     junto a las fechas, no escondida en una ayuda. */
  card += `<p class="eval-detail">${esc(t('eval.cycleExplain'))}</p>`;
  const canOmit = !complete && (isFirst || (due && today >= due));
  if (canOmit) card += `<div class="eval-actions"><button type="button" class="btn-ghost btn-sm" id="eval-omit-btn">${esc(t('eval.omitBtn'))}</button></div>`;

  const compBlocked = !compClientCanEdit();
  const formRows = EVAL_MEASURES.map(m => {
    const cur = m.id === 'peso' ? evalWeightOn(S) : evalMeasureValue(S, m.id);
    const unitLbl = EVAL_CFG.units === 'imperial' ? (m.kind === 'w' ? 'lb' : 'in') : (m.kind === 'w' ? 'kg' : 'cm');
    const dis = '';
    return `<div class="eval-field"><label for="eval-m-${m.id}">${esc(t('eval.measure.' + m.id))} <span class="eval-unit">(${unitLbl})</span></label>`
      + `<input type="number" id="eval-m-${m.id}" step="0.1" min="0" value="${esc(evalToDisplay(m.kind, cur))}"${dis}>`
      + (m.kind === 'l' ? `<span class="eval-tape">${tapeSVG(m.id)}</span>` : '')
      + `<span class="eval-guide">${esc(t('eval.guide.' + m.id))}</span></div>`;
  }).join('');
  const reqChecks = EVAL_MEASURES.map(m => `<label class="eval-check"><input type="checkbox" data-eval-req="${m.id}" ${(EVAL_CFG.requiredMeasures || []).includes(m.id) ? 'checked' : ''}> ${esc(t('eval.measure.' + m.id))}</label>`).join('');
  /* UX10-MÁS (piloto, 2026-10-23): el comparador del cliente sube a
     justo después de la tarjeta del ciclo — antes vivía al FINAL de
     toda la vista (tras medidas, ficha, composición y configuración)
     y había que cavar para encontrarlo. renderCmpClient() lo rellena
     igual: solo cambia su posición en el DOM. */
  root.innerHTML = `<div class="eval-card" id="eval-card">${card}</div>`
    + `<div id="cmp-root"></div>`
    + `<div class="eval-block"><p class="eval-ficha-title">${esc(t('eval.measuresTitle'))} · ${esc(dateName(S))}</p>`
    + `<div class="eval-form">${formRows}</div>`
    + (compBlocked ? `<p class="eval-detail">${esc(t('compacc.pctNote'))}</p>` : '')
    + `<div class="eval-actions"><button type="button" class="btn-primary btn-sm" id="eval-save-measures">${esc(t('eval.saveMeasures'))}</button>${EVAL_OK_MSG ? `<span class="eval-ok">${esc(EVAL_OK_MSG)}</span>` : ''}</div></div>`
    + evalFichaHTML(S)
    + evalCompHTML(S)
    + `<div class="eval-block eval-config"><p class="eval-ficha-title">${esc(t('eval.cfgTitle'))}</p>`
    + `<p class="eval-cfg-group">${esc(t('eval.cfgRequired'))}</p>${reqChecks}`
    + `<p class="eval-detail">${esc(t('eval.cfgReqNote'))}</p>`
    + `<p class="eval-cfg-group">${esc(t('eval.cfgUnits'))}</p>`
    + `<label class="eval-check"><input type="radio" name="eval-units" value="metric" ${EVAL_CFG.units !== 'imperial' ? 'checked' : ''}> ${esc(t('eval.unitsMetric'))}</label>`
    + `<label class="eval-check"><input type="radio" name="eval-units" value="imperial" ${EVAL_CFG.units === 'imperial' ? 'checked' : ''}> ${esc(t('eval.unitsImperial'))}</label>`
    + `<div class="eval-actions"><button type="button" class="btn-ghost btn-sm" id="eval-save-config">${esc(t('eval.cfgSave'))}</button></div></div>`;
  const omitBtn = $('eval-omit-btn'); if (omitBtn) omitBtn.onclick = evalOmitCycle;
  const saveBtn = $('eval-save-measures'); if (saveBtn) saveBtn.onclick = evalSaveMeasures;
  const cfgBtn = $('eval-save-config'); if (cfgBtn) cfgBtn.onclick = evalSaveConfig;
  const fatBtn = $('eval-comp-fat-btn'); if (fatBtn) fatBtn.onclick = () => evalRegisterComp('fat');
  const musBtn = $('eval-comp-muscle-btn'); if (musBtn) musBtn.onclick = () => evalRegisterComp('muscle');
  try { renderCmpClient(); } catch {}
}
/* Guardar las medidas del set: las de contorno van al documento de
   evaluación (canónico cm); el peso va a nutrition_weight con el
   esquema del propio registro de peso (merge: conserva grasa,
   músculo, agua… si ese día ya tenía pesaje). Vaciar un contorno lo
   borra; vaciar el peso no borra ningún pesaje (no-op declarado). */
async function evalSaveMeasures() {
  const S = evalTargetDate();
  const uid = auth.currentUser.uid;
  const measures = {};
  EVAL_MEASURES.filter(m => m.id !== 'peso').forEach(m => {
    const el = $('eval-m-' + m.id);
    const raw = el ? String(el.value).trim() : '';
    if (raw !== '') { const v = num(raw); if (v > 0) measures[m.id] = evalToCanonical(m.kind, v); }
  });
  try {
    const ctxM = await evalFreshContext(S);
    const payloadM = { kind: 'evaluation', uid, ownerUid: uid, date: S, measures, updatedAt: serverTimestamp() };
    if (ctxM) payloadM.planContext = ctxM;
    await setDoc(evalDocRef(S), payloadM, { merge: true });
    const prev = EVALS[S] || {};
    EVALS[S] = Object.assign({}, prev, { measures });
    if (ctxM) EVALS[S].planContext = ctxM;
    const pesoEl = $('eval-m-peso');
    const pesoRaw = pesoEl ? String(pesoEl.value).trim() : '';
    if (pesoRaw !== '') {
      const v = num(pesoRaw);
      if (v > 0) {
        const kg = evalToCanonical('w', v);
        await setDoc(doc(db, 'nutrition_weight', `${uid}_${S}`), { ownerUid: uid, date: S, weight: kg, updatedAt: serverTimestamp() }, { merge: true });
        const ix = WEIGHTS.findIndex(w => w.date === S);
        const rec = { id: `${uid}_${S}`, date: S, weight: kg, fat: ix >= 0 ? WEIGHTS[ix].fat : 0, muscle: ix >= 0 ? WEIGHTS[ix].muscle : 0, water: ix >= 0 ? WEIGHTS[ix].water : 0, visceral: ix >= 0 ? WEIGHTS[ix].visceral : 0, notes: ix >= 0 ? WEIGHTS[ix].notes : '' };
        if (ix >= 0) WEIGHTS[ix] = rec; else { WEIGHTS.push(rec); WEIGHTS.sort((a, b) => a.date < b.date ? -1 : 1); }
        try { renderWeight(); } catch {}
      }
    }
    EVAL_OK_MSG = t('eval.savedOk');
    await evalReconcile(S);
    renderEval();
    setTimeout(() => { EVAL_OK_MSG = ''; const ok = document.querySelector('.eval-ok'); if (ok) ok.remove(); }, 3000);
  } catch { toast(t('msg.uploadFail'), true); }
}
async function evalRegisterComp(kind) {
  if (!compClientCanEdit()) { toast(t('compacc.blocked'), true); return; }
  const S = evalTargetDate();
  const vEl = $('eval-comp-' + kind + '-value'); if (!vEl) return;
  const value = num(vEl.value);
  if (!(value > 0)) return;
  const unit = kind === 'fat' ? '%' : ((($('eval-comp-muscle-unit') || {}).value) || 'kg');
  const method = (($('eval-comp-' + kind + '-method') || {}).value) || 'bio';
  const estimate = !!(($('eval-comp-' + kind + '-est') || {}).checked);
  const comp = Object.assign({}, (EVALS[S] || {}).comp || {}, { [kind]: { value, unit, method, estimate, dateISO: todayISO() } });
  try {
    const ctxC = await evalFreshContext(S);
    const payloadC = { kind: 'evaluation', uid: auth.currentUser.uid, ownerUid: auth.currentUser.uid, date: S, comp, updatedAt: serverTimestamp() };
    if (ctxC) payloadC.planContext = ctxC;
    await setDoc(evalDocRef(S), payloadC, { merge: true });
    EVALS[S] = Object.assign({}, EVALS[S] || {}, { comp });
    if (ctxC) EVALS[S].planContext = ctxC;
    EVAL_OK_MSG = t('eval.savedOk');
    renderEval();
  } catch { toast(t('msg.uploadFail'), true); }
}
async function evalSaveConfig() {
  const requiredMeasures = [...document.querySelectorAll('[data-eval-req]')].filter(c => c.checked).map(c => c.getAttribute('data-eval-req'));
  const unitsEl = document.querySelector('input[name="eval-units"]:checked');
  const units = unitsEl && unitsEl.value === 'imperial' ? 'imperial' : 'metric';
  try {
    await setDoc(doc(db, 'nutrition_progress', `${auth.currentUser.uid}_evalconfig`), { kind: 'evalConfig', uid: auth.currentUser.uid, ownerUid: auth.currentUser.uid, requiredMeasures, units, updatedAt: serverTimestamp() }, { merge: true });
    EVAL_CFG = { requiredMeasures, units };
    EVAL_OK_MSG = t('eval.savedOk');
    /* La completitud puede cambiar con la nueva configuración:
       reconcilia el sello de los sets con actividad reciente. */
    await evalReconcile(evalTargetDate());
    renderEval();
  } catch { toast(t('msg.uploadFail'), true); }
}
/* Omitir el ciclo: cierra ESTE ciclo como omitido (propuesta v2
   §6.2b). No crea ninguna evaluación; el ancla es la fecha prevista
   omitida (o la de hoy, si era la primera) y el set en curso queda
   cerrado: sus ítems quedan en el historial, sin completar nada. */
async function evalOmitCycle() {
  const due = evalNextDue();
  const anchor = due || todayISO();
  const S = evalTargetDate();
  const omitted = [...(EVAL_CYCLE.omitted || []), anchor];
  const closedSets = [...(EVAL_CYCLE.closedSets || [])];
  if (!evalSetComplete(S) && !closedSets.includes(S)) closedSets.push(S);
  try {
    await setDoc(doc(db, 'nutrition_progress', `${auth.currentUser.uid}_evalcycle`), { kind: 'evalCycle', uid: auth.currentUser.uid, ownerUid: auth.currentUser.uid, omitted, closedSets, updatedAt: serverTimestamp() }, { merge: true });
    EVAL_CYCLE = { omitted, closedSets };
    toast(t('eval.omittedNote'));
    renderEval();
  } catch { toast(t('msg.uploadFail'), true); }
}

/* ================= COMPARADOR + BITÁCORA ND-2 (Paquete 8) =================
   Comparador visual de evaluaciones (v1.1 §4.4/§5.4): frente, costado
   y espalda de DOS evaluaciones completas lado a lado, con las
   medidas de ambas fechas junto a las fotos, la etiqueta de anclaje
   de plan de cada fecha (Pregunta 8) y la nota de fase del entrenador
   (Pregunta 9). Comparar es SOLO LECTURA: no escribe nada. Las dos
   únicas escrituras de este bloque son la nota de fase (update del
   entrenador sobre el documento de evaluación del cliente, la vía
   que las reglas vigentes sí permiten) y el registro ND-2.
   Regla dura intacta: las fotos informan el ojo humano; jamás
   generan composición corporal, porcentajes ni diagnósticos.

   BITÁCORA ND-2 (requisito vinculante adoptado el 2026-10-20,
   Ficha 6): la vista del entrenador sobre las evaluaciones/fotos de
   un cliente NACE con su registro de accesos. Casa de datos:
   colección NUEVA access_log (candidato de reglas del paquete:
   create solo del propietario y solo de sí mismo, lectura solo del
   propietario, update denegado a todos —append-only, como
   consent_receipts— y delete solo del propietario para la purga de
   retención). NO vive en nutrition_progress: allí las ramas
   genéricas dejarían al propio autor del registro reescribirlo o
   borrarlo, y una bitácora que el auditado puede alterar no audita.
   SEMÁNTICA DE APERTURA (exacta): UNA apertura = pasar la sección
   «Ver evaluaciones y fotos» de la ficha de un cliente de cerrada a
   abierta. Cada apertura escribe EXACTAMENTE un registro
   { viewerUid, clientUid, zone: 'evaluations', at }. Los
   re-pintados internos (cambiar fechas del comparador, guardar una
   nota, ampliar una foto) NO son aperturas y no escriben registros.
   Cerrar y reabrir SÍ es otra apertura. Ver la propia ficha no
   registra (no es acceso a datos de un tercero). Si la escritura
   del registro falla (p. ej. reglas aún sin publicar), la vista se
   abre igual pero muestra el aviso nd2.logFail: el fallo nunca es
   silencioso. */
function cmpCompleteDates(P, E, cfg, W, cycle) {
  const req = (cfg && cfg.requiredMeasures) || [];
  const closed = (cycle && cycle.closedSets) || [];
  const ds = new Set([...Object.keys(P || {}), ...Object.keys(E || {})]);
  return [...ds].filter(d => {
    if (closed.includes(d)) return false;
    if (!P[d] && !E[d]) return false;
    for (const s of PROGRESS_SLOTS) if (!((P[d] || {})[s])) return false;
    for (const m of req) {
      if (m === 'peso') { if (!(W || []).some(w => w.date === d && num(w.weight) > 0)) return false; }
      else if (!E[d] || !E[d].measures || E[d].measures[m] == null) return false;
    }
    return true;
  }).sort();
}
function cmpMeasureStr(units, kind, v) {
  if (units === 'imperial') return kind === 'w' ? evalFmtNum(v * 2.20462) + ' lb' : evalFmtNum(v / 2.54) + ' in';
  return kind === 'w' ? evalFmtNum(v) + ' kg' : evalFmtNum(v) + ' cm';
}
function cmpWeightUpTo(W, date) {
  let v = null;
  for (const w of (W || [])) { if (w.date <= date) { if (num(w.weight) > 0) v = w.weight; } else break; }
  return v;
}
function cmpValue(E, W, date, id) {
  if (id === 'peso') return cmpWeightUpTo(W, date);
  const e = E[date];
  return (e && e.measures && e.measures[id] != null) ? e.measures[id] : null;
}
function cmpAnchorHTML(E, date) {
  const ctx = E[date] && E[date].planContext;
  if (!ctx) return `<p class="cmp-anchor">${esc(t('cmp.noAnchor'))}</p>`;
  return `<p class="cmp-anchor">📌 ${esc(t('cmp.planCtx', { title: ctx.title || ctx.planId || '' }))}${ctx.sourceRoutineId ? ` · ${esc(t('cmp.planRoutine', { id: ctx.sourceRoutineId }))}` : ''}</p>`;
}
/* notesMode: 'ro' = el cliente ve la nota de su entrenador (solo
   lectura); 'edit' = el entrenador la escribe dentro de la
   evaluación (solo si el documento de evaluación existe). */
function cmpHTML(P, E, W, cfg, cycle, sel, prefix, notesMode) {
  const dates = cmpCompleteDates(P, E, cfg, W, cycle);
  const title = `<p class="eval-ficha-title">${esc(t('cmp.title'))}</p>`;
  if (dates.length < 2) return `<div class="cmp-block">${title}<p class="eval-detail">${esc(t('cmp.needTwo'))}</p></div>`;
  if (!dates.includes(sel.a)) sel.a = dates[dates.length - 1];
  if (!dates.includes(sel.b) || sel.b === sel.a) sel.b = [...dates].reverse().find(d => d !== sel.a);
  const units = (cfg && cfg.units) || 'metric';
  const opts = cur => dates.map(d => `<option value="${d}"${d === cur ? ' selected' : ''}>${esc(dateName(d))}</option>`).join('');
  const noteHTML = d => {
    const e = E[d];
    if (notesMode === 'edit') {
      if (!e) return `<p class="eval-detail">${esc(t('teval.noteNoDoc'))}</p>`;
      return `<div class="cmp-note"><label class="cmp-note-title" for="${prefix}-note-${d}">✉️ ${esc(t('teval.noteLabel'))}</label>`
        + `<textarea id="${prefix}-note-${d}" rows="2" placeholder="${esc(t('teval.notePh'))}">${esc(e.phaseNote || '')}</textarea>`
        + `<div class="eval-actions"><button type="button" class="btn-ghost btn-sm" data-note-save="${d}">${esc(t('teval.noteSave'))}</button></div></div>`;
    }
    if (e && e.phaseNote) return `<div class="cmp-note"><p class="cmp-note-title">✉️ ${esc(t('cmp.phaseNote'))}</p><p class="cmp-note-text">${esc(e.phaseNote)}</p></div>`;
    return '';
  };
  const head = d => `<div class="cmp-head"><p class="cmp-date">${esc(dateName(d))}</p>${cmpAnchorHTML(E, d)}${noteHTML(d)}</div>`;
  const cell = (d, s) => { const r = (P[d] || {})[s]; return r ? `<img class="cmp-img" src="${esc(r.photo)}" alt="${esc(t('progress.' + s))}" data-cmp-zoom="${d}|${s}">` : `<span class="wempty">${esc(t('progress.' + s))}: ${esc(t('progress.noPhoto'))}</span>`; };
  const slotRows = PROGRESS_SLOTS.map(s => `<div class="cmp-row"><span class="cmp-slot">${esc(t('progress.' + s))}</span><div class="cmp-cells"><div class="cmp-cell">${cell(sel.a, s)}</div><div class="cmp-cell">${cell(sel.b, s)}</div></div></div>`).join('');
  const mRows = EVAL_MEASURES.map(m => {
    const va = cmpValue(E, W, sel.a, m.id), vb = cmpValue(E, W, sel.b, m.id);
    return `<tr><td>${esc(t('eval.measure.' + m.id))}</td><td class="num">${va == null ? '—' : esc(cmpMeasureStr(units, m.kind, va))}</td><td class="num">${vb == null ? '—' : esc(cmpMeasureStr(units, m.kind, vb))}</td></tr>`;
  }).join('');
  return `<div class="cmp-block">${title}`
    + `<div class="cmp-selects"><label>${esc(t('cmp.first'))} <select id="${prefix}-a">${opts(sel.a)}</select></label>`
    + `<label>${esc(t('cmp.second'))} <select id="${prefix}-b">${opts(sel.b)}</select></label></div>`
    + `<div class="cmp-heads">${head(sel.a)}${head(sel.b)}</div>`
    + slotRows
    + `<div class="table-scroll"><table class="eval-table"><thead><tr><th>${esc(t('eval.colMeasure'))}</th><th class="num">${esc(dateName(sel.a))}</th><th class="num">${esc(dateName(sel.b))}</th></tr></thead><tbody>${mRows}</tbody></table></div>`
    + `</div>`;
}
function cmpWire(root, P, sel, prefix, rerender) {
  if (!root) return;
  const sa = root.querySelector('#' + prefix + '-a'), sb = root.querySelector('#' + prefix + '-b');
  if (sa) sa.onchange = () => { sel.a = sa.value; rerender(); };
  if (sb) sb.onchange = () => { sel.b = sb.value; rerender(); };
  root.querySelectorAll('[data-cmp-zoom]').forEach(im => im.addEventListener('click', () => {
    const parts = im.getAttribute('data-cmp-zoom').split('|');
    const rec = (P[parts[0]] || {})[parts[1]];
    if (rec) showLightbox(rec.photo);
  }));
}
/* ---------- El comparador del cliente (sus propias evaluaciones) ---------- */
let CMP_SEL = { a: null, b: null };
function renderCmpClient() {
  const root = $('cmp-root'); if (!root) return;
  root.innerHTML = cmpHTML(PROG, EVALS, WEIGHTS, EVAL_CFG, EVAL_CYCLE, CMP_SEL, 'cmp', 'ro');
  cmpWire(root, PROG, CMP_SEL, 'cmp', renderCmpClient);
}
/* ---------- La vista del entrenador sobre un cliente (con ND-2) ---------- */
let CEV = null;   // { uid, prog, evals, cfg, cycle, weights, cmp }
async function nd2LogView(clientUid) {
  if (!IS_OWNER || !auth.currentUser || clientUid === auth.currentUser.uid) return true;
  try {
    await addDoc(collection(db, 'access_log'), { viewerUid: auth.currentUser.uid, clientUid, zone: 'evaluations', at: serverTimestamp() });
    return true;
  } catch { return false; }
}
async function tevalToggle(uid, weightsData) {
  const body = $('client-evals-body'), btn = $('btn-client-evals');
  if (!body) return;
  if (body.style.display !== 'none') { body.style.display = 'none'; if (btn) btn.textContent = t('teval.open'); return; }
  body.style.display = '';
  if (btn) btn.textContent = t('teval.close');
  const logged = await nd2LogView(uid);
  await tevalLoad(uid, weightsData);
  if (!logged) {
    const w = document.createElement('p');
    w.className = 'eval-detail eval-due'; w.textContent = t('nd2.logFail');
    body.prepend(w);
  }
}
async function tevalLoad(uid, weightsData) {
  const prog = {}, evals = {};
  let cfg = { requiredMeasures: [], units: 'metric' }, cycle = { omitted: [], closedSets: [] };
  try {
    const snap = await getDocs(query(collection(db, 'nutrition_progress'), where('ownerUid', '==', uid)));
    snap.forEach(d => { const v = d.data(); if (!v) return;
      if (v.slot && v.photo && v.date) { (prog[v.date] = prog[v.date] || {})[v.slot] = { id: d.id, photo: v.photo }; }
      else if (v.kind === 'evaluation' && v.date) evals[v.date] = { measures: v.measures || {}, comp: v.comp || null, completedAt: v.completedAt || null, planContext: v.planContext || null, phaseNote: v.phaseNote || null, phaseNoteAt: v.phaseNoteAt || null };
      else if (v.kind === 'evalCycle') cycle = { omitted: Array.isArray(v.omitted) ? v.omitted : [], closedSets: Array.isArray(v.closedSets) ? v.closedSets : [] };
      else if (v.kind === 'evalConfig') cfg = { requiredMeasures: Array.isArray(v.requiredMeasures) ? v.requiredMeasures : [], units: v.units === 'imperial' ? 'imperial' : 'metric' };
    });
  } catch {}
  CEV = { uid, prog, evals, cfg, cycle, weights: (weightsData || []).map(w => ({ date: w.date, weight: w.weight })), cmp: { a: null, b: null } };
  renderCmpTrainer();
}
function renderCmpTrainer() {
  const body = $('client-evals-body'); if (!body || !CEV) return;
  const hasAny = Object.keys(CEV.prog).length || Object.keys(CEV.evals).length;
  body.innerHTML = hasAny ? cmpHTML(CEV.prog, CEV.evals, CEV.weights, CEV.cfg, CEV.cycle, CEV.cmp, 'tcmp', 'edit')
    : `<div class="wempty">${esc(t('teval.empty'))}</div>`;
  cmpWire(body, CEV.prog, CEV.cmp, 'tcmp', renderCmpTrainer);
  body.querySelectorAll('[data-note-save]').forEach(b => b.onclick = () => tevalSaveNote(b.getAttribute('data-note-save')));
}
/* Nota de fase (Pregunta 9): vive DENTRO del documento de
   evaluación del cliente; el entrenador la escribe con un update
   (setDoc con merge sobre un documento EXISTENTE: la rama
   «allow update: if isOwnerUser()» de las reglas vigentes — sin
   reglas nuevas) y el cliente la lee en su propio comparador. El
   editor solo se pinta si el documento existe: el entrenador no
   puede crearlo (el create exige ownerUid propio). */
async function tevalSaveNote(date) {
  if (!CEV) return;
  const ta = document.getElementById('tcmp-note-' + date); if (!ta) return;
  const text = ta.value.trim();
  try {
    await setDoc(doc(db, 'nutrition_progress', `${CEV.uid}_${date}_eval`), { phaseNote: text, phaseNoteAt: todayISO(), updatedAt: serverTimestamp() }, { merge: true });
    if (CEV.evals[date]) { CEV.evals[date].phaseNote = text; CEV.evals[date].phaseNoteAt = todayISO(); }
    toast(t('teval.noteSaved'));
  } catch { toast(t('msg.uploadFail'), true); }
}
/* ---------- Bitácora ND-2: vista de auditoría (solo propietario) ---------- */
function nd2When(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') { try { return v.toDate(); } catch { return null; } }
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d) ? null : d; }
  return null;
}
async function loadAccessLog() {
  const box = $('nd2-box');
  if (!box || !IS_OWNER) return;
  try {
    const snap = await getDocs(collection(db, 'access_log'));
    const rows = [];
    snap.forEach(d => { const v = d.data() || {}; rows.push({ id: d.id, viewerUid: v.viewerUid || '', clientUid: v.clientUid || '', zone: v.zone || '', at: nd2When(v.at) }); });
    rows.sort((a, b) => (b.at ? b.at.getTime() : 0) - (a.at ? a.at.getTime() : 0));
    const nameOf = u2 => { const u = (ADMIN_USERS || []).find(x => x.id === u2); return u ? (u.name || u.email || u2) : u2; };
    box.innerHTML = rows.length ? `<div class="table-scroll"><table class="detail whist"><thead><tr><th>${esc(t('nd2.when'))}</th><th>${esc(t('nd2.viewer'))}</th><th>${esc(t('nd2.client'))}</th><th>${esc(t('nd2.zone'))}</th></tr></thead><tbody>`
      + rows.slice(0, 50).map(r => `<tr><td>${r.at ? esc(r.at.toLocaleString()) : '—'}</td><td>${esc(nameOf(r.viewerUid))}</td><td>${esc(nameOf(r.clientUid))}</td><td>${esc(t('nd2.zone.' + r.zone))}</td></tr>`).join('')
      + `</tbody></table></div>` : `<div class="wempty">${esc(t('nd2.empty'))}</div>`;
  } catch { box.innerHTML = `<div class="wempty">${esc(t('nd2.unavailable'))}</div>`; }
}

/* ================= FORMULARIOS ================= */
/* El botón «+ Registrar comida» de la cabecera (junto a la fecha) se
   eliminó (Ronald, 2026-10-19 12:27: «Ese botón no es necesario que
   esté allí»): duplicaba la entrada manual. La comida se apunta por
   UN solo lugar según la vía: foto con el botón COMIDA del dock, o
   manual desde «Resumen vs. metas» (#btn-add-meal-manual, abajo). */
/* «Añadir comida manualmente» (Ronald, 2026-10-19 12:06: «si ya
   comí y olvidé tomar la foto puede servir para apuntarlo
   manual»): abre el MISMO formulario de siempre en modo manual
   EN BLANCO — sin borrador de IA (aiClearDraft), formulario
   reiniciado y comida preseleccionada por la hora con
   aiDefaultMeal() (la misma del flujo de análisis), ambos
   editables en el propio formulario. El guardado es el del
   formulario: sin source:'ai', un registro manual normal.
   Ajuste «zona del día» (Ronald, 2026-10-19 16:02–16:04: «Lo
   quiero a lado de meta alineados a la derecha»): el botón se
   muda de «Ayuda con comidas» a la fila del título de «Resumen
   vs. metas», alineado a la DERECHA, como pastilla compacta con
   su texto íntegro; sigue existiendo UNA sola vez en el DOM.
   Única adaptación de comportamiento: la fecha preseleccionada
   es la del DÍA EN PANTALLA (la que resume esa tarjeta, vía
   #dateSel — el mismo patrón que ya usan otras rutas del
   formulario), no siempre hoy. */
const btnMealManual = $('btn-add-meal-manual');
if (btnMealManual) btnMealManual.onclick = () => {
  aiClearDraft();
  const form = $('form-meal');
  if (form) form.reset();
  const prev = $('m-photo-preview');
  if (prev) { prev.style.display = 'none'; prev.src = ''; }
  $('m-date').value = ($('dateSel') && $('dateSel').value) || todayISO();
  $('m-meal').value = aiDefaultMeal();
  /* Espejo de borrador (REC-D D3): la vía manual ARMA el espejo —
     si ya había un borrador sin guardar, el formulario lo restaura
     en vez de abrir en blanco. */
  try { pendDraftArm(); pendDraftRestore(); } catch {}
  aiOpenMealModal();
};
/* «Repetir una comida anterior» (tercera pieza del trío de registro:
   foto / escribir / repetir; candidato bcfe957 integrado sobre
   bb2be02). Cada registro de la lista del día lleva su acción
   «Repetir» (en render): abre el MISMO formulario de comida precargado
   con los datos GUARDADOS de ese registro — nombre, cantidad, macros y
   su tipo de comida como preselección; las notas escritas a mano del
   original también se precargan, editables — pero la FECHA es la del
   DÍA EN PANTALLA (la misma regla del botón manual: repetir es
   registrarla en el día que estás viendo, no resucitar la fecha
   original; sigue editable antes de guardar). Guardar crea un registro
   NUEVO (el addDoc de #form-meal, con su guardia mealSaving
   anti-doble-clic): el original no se toca y abrir no escribe nada.

   DOS CORRECCIONES NUEVAS (Ronald, 2026-10-19 19:44, puntos 3a/3b):
   (a) CANTIDAD Y MÉTRICAS ACOPLADAS: si al repetir se cambia la
       cantidad, las 5 métricas se reescalan en proporción (regla de
       tres sobre la cantidad y las métricas ORIGINALES del registro)
       en cuanto el campo de cantidad pierde el foco o cambia; tras el
       reescalado la persona puede seguir editando cualquier cifra a
       mano (editar una métrica NO vuelve a disparar el reescalado:
       solo lo dispara cambiar la cantidad). EXCEPCIÓN documentada: si
       la cantidad original no es una magnitud proporcional (conteo por
       unidades — «2 uds» — o texto sin número inicial), NO hay
       reescalado silencioso: el formulario avisa con el banner de
       unidades que los valores no se recalculan y deben revisarse a
       mano (la cantidad nueva con cifras antiguas nunca queda en
       silencio: o escala o avisa).
   (b) PROCEDENCIA CONSERVADA: la copia NO se disfraza de alta manual
       exacta. Lleva origin:{kind, fromId, fromDate} — kind
       'repeat-manual' si el original era manual (o una copia manual) y
       'repeat-ai' si el original era una estimación de IA (source
       'ai', o una copia repeat-ai: la estimación no se «lava»
       repitiéndola dos veces). NO se resucita el payload de IA: sin
       bloque ai, sin source:'ai' y sin llamada nueva al proveedor;
       el banner del formulario declara la procedencia («Copia de una
       estimación de IA…» / «Copia de otro registro…»). */
let repeatCtx = null; // {kind, fromId, fromDate, qtyText, scaledTo, base:{num,unit,kcal,prot,carb,sugar,fat}, items} — solo memoria
function repeatParseQty(q) {
  const m = String(q || '').trim().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return null;
  const unit = (m[2] || '').trim().toLowerCase();
  return { num: parseFloat(m[1]), unit, pieces: /^(u|ud|uds|unidad|unidades|unit|units|piece|pieces|pz|pza|huevo|huevos)\b/.test(unit) };
}
function repeatSetBanner() {
  const b = $('m-rep-banner'); if (!b) return;
  if (!repeatCtx) { b.style.display = 'none'; b.textContent = ''; return; }
  const p = repeatParseQty(repeatCtx.qtyText);
  b.style.display = '';
  b.textContent = (!p || p.pieces) ? t('repeat.bannerPieces')
    : (repeatCtx.kind === 'repeat-ai' ? t('repeat.bannerAi') : t('repeat.bannerQty'));
}
function repeatAttachScaling() {
  const q = $('m-qty'); if (!q || q.dataset.repWired) return;
  q.dataset.repWired = '1';
  q.addEventListener('change', () => {
    if (!repeatCtx) return;
    const pNew = repeatParseQty(q.value);
    if (!pNew || pNew.pieces || !(pNew.num > 0)) { repeatSetBanner(); return; }
    const b0 = repeatCtx.base;
    if (!b0 || !(b0.num > 0) || b0.pieces) { repeatSetBanner(); return; }
    if (pNew.unit !== b0.unit) { repeatSetBanner(); return; }
    /* Solo se reescala cuando la cantidad CAMBIA de verdad respecto a
       la última cantidad ya reescalada (scaledTo, que arranca en la
       del original): un 'change' sin cambio numérico (p. ej. salir y
       volver al campo) NO debe pisar las métricas que la persona
       editó a mano tras el reescalado. */
    const last = (repeatCtx.scaledTo != null) ? repeatCtx.scaledTo : b0.num;
    if (pNew.num === last) { repeatSetBanner(); return; }
    const f = pNew.num / b0.num;
    /* El texto de la cantidad se conserva tal como lo escribió la
       persona; solo cambian las métricas, siempre desde el ORIGINAL. */
    $('m-kcal').value = Math.round(b0.kcal * f);
    $('m-prot').value = Math.round(b0.prot * f * 10) / 10;
    $('m-carb').value = Math.round(b0.carb * f * 10) / 10;
    $('m-sugar').value = Math.round(b0.sugar * f * 10) / 10;
    $('m-fat').value = Math.round(b0.fat * f * 10) / 10;
    repeatCtx.scaledTo = pNew.num;
    toast(t('repeat.scaled'));
    repeatSetBanner();
  });
}
function openRepeatMeal(rec, viewDate) {
  aiClearDraft();
  /* Repetir NO es la vía manual: el espejo de borrador (D3) se
     desarma para que lo tecleado aquí no sobrescriba el borrador
     manual sin guardar (que sigue reflejado en «Pendientes»). */
  try { pendDraftDisarm(); } catch {}
  const form = $('form-meal');
  if (form) form.reset();
  const prev = $('m-photo-preview');
  if (prev) { prev.style.display = 'none'; prev.src = ''; }
  $('m-date').value = viewDate || ($('dateSel') && $('dateSel').value) || todayISO();
  const sel = $('m-meal');
  if (sel && [...sel.options].some(o => o.value === rec.meal)) sel.value = rec.meal;
  $('m-food').value = rec.food || '';
  $('m-qty').value = rec.qty || '';
  $('m-kcal').value = rec.kcal || 0;
  $('m-prot').value = rec.prot || 0;
  $('m-carb').value = rec.carb || 0;
  $('m-sugar').value = rec.sugar || 0;
  $('m-fat').value = rec.fat || 0;
  $('m-notes').value = rec.notes || '';
  /* Procedencia: estimación de IA si el documento trae source:'ai'
     (foto) o 'ai-text' (descripción), o si ya era una copia de una
     estimación (origin.kind 'repeat-ai'). */
  const aiOrigin = rec.source === 'ai' || rec.source === 'ai-text' || (rec.origin && rec.origin.kind === 'repeat-ai');
  const pq = repeatParseQty(rec.qty);
  repeatCtx = {
    kind: aiOrigin ? 'repeat-ai' : 'repeat-manual',
    fromId: rec.id || '', fromDate: rec.date || viewDate || '',
    qtyText: rec.qty || '',
    scaledTo: pq ? pq.num : null,
    base: pq ? { num: pq.num, unit: pq.unit, pieces: pq.pieces, kcal: num(rec.kcal), prot: num(rec.prot), carb: num(rec.carb), sugar: num(rec.sugar), fat: num(rec.fat) } : null,
    /* El desglose del original viaja TAL CUAL como candidato: la
       copia lo persiste solo si los totales finales siguen
       cuadrando con él (misma regla de honestidad del análisis:
       si la cantidad se reescala, los totales cambian y el desglose
       sin tocar ya no cuadra — la copia nace sin él). */
    items: (Array.isArray(rec.items) && rec.items.length) ? rec.items.map(it => ({ ...it })) : null
  };
  repeatAttachScaling();
  repeatSetBanner();
  aiOpenMealModal();
}
function repeatClear() {
  repeatCtx = null;
  const b = $('m-rep-banner'); if (b) { b.style.display = 'none'; b.textContent = ''; }
}
$('meal-cancel').onclick = () => { $('meal-modal').style.display = 'none'; aiClearDraft(); repeatClear(); try { pendDraftDisarm(); } catch {} };
$('meal-modal').addEventListener('click', e => { if (e.target.id === 'meal-modal') { e.target.style.display = 'none'; repeatClear(); } });

$('m-photo').addEventListener('change', e => {
  const f = e.target.files[0];
  const prev = $('m-photo-preview');
  if (f) { prev.src = URL.createObjectURL(f); prev.style.display = 'block'; }
  else { prev.src = ''; prev.style.display = 'none'; }
});

let mealSaving = false; // guardia anti-duplicado del guardado de comidas (M8, 2026-10-17)
$('form-meal').addEventListener('submit', async e => {
  e.preventDefault();
  if (mealSaving) return; // ya hay un guardado en curso: el segundo envío se ignora
  const data = {
    ownerUid: auth.currentUser.uid,
    date: $('m-date').value, meal: $('m-meal').value,
    food: $('m-food').value.trim(), qty: $('m-qty').value.trim(),
    kcal: Math.max(0, num($('m-kcal').value)), prot: Math.max(0, num($('m-prot').value)),
    carb: Math.max(0, num($('m-carb').value)), sugar: Math.max(0, num($('m-sugar').value)),
    fat: Math.max(0, num($('m-fat').value)), notes: $('m-notes').value.trim(),
    createdAt: serverTimestamp()
  };
  if (!data.date || !data.food) { toast(t('err.mealMissing'), true); return; }
  mealSaving = true;
  const saveBtn = e.target.querySelector('button[type="submit"]');
  if (saveBtn) saveBtn.disabled = true;
  try {
    const photoFile = $('m-photo').files[0];
    if (photoFile) {
      try {
        toast(t('msg.uploading'));
        const path = `nutrition/${auth.currentUser.uid}/meals/${Date.now()}.jpg`;
        const up = await uploadPhoto(photoFile, path);
        data.photoURL = up.url; data.photoPath = up.path;
      } catch (err) { toast(t('err.mealPhotoFail'), true); }
    }
    if (aiDraft) { data.source = aiDraft.src || 'ai'; data.ai = { model: aiDraft.model, rangeKcal: aiDraft.rangeKcal }; }
    /* Procedencia de la repetición (corrección 2026-10-19, punto 3b):
       si el guardado viene de «Repetir», la copia lleva su origin
       (kind/fromId/fromDate) — visible en los datos, sin bloque ai ni
       source:'ai': la estimación no se convierte en medición exacta
       ni se resucita su foto. repeatCtx se limpia tras la escritura;
       la ruta de IA es incompatible (aiClearDraft y repeatCtx nunca
       conviven: repetir limpia el borrador y viceversa). */
    if (repeatCtx) data.origin = { kind: repeatCtx.kind, fromId: repeatCtx.fromId, fromDate: repeatCtx.fromDate };
    /* Desglose por alimento (2026-10-21): el candidato viene del
       borrador de análisis o de la repetición, y SOLO se persiste si
       su suma sigue igualando los totales FINALES del formulario —
       cualquier edición que descuadre lo descarta en silencio y el
       registro queda en el modo por registro de siempre. */
    const candItems = (aiDraft && aiDraft.items) || (repeatCtx && repeatCtx.items) || null;
    const formIts = itemsIfSquare(candItems, data);
    if (formIts) data.items = formIts;
    const wasDraft = !!aiDraft;
    /* Identidad de guardado del borrador de IA (corrección del
       duplicado, 2026-10-23): si el formulario viene de una revisión
       de análisis, escribe el MISMO documento que el guardado directo
       de esa revisión — nunca un segundo registro del mismo plato. */
    if (aiDraft && aiDraft.saveId) await setDoc(doc(db, 'nutrition_meals', aiDraft.saveId), data);
    else await addDoc(collection(db, 'nutrition_meals'), data);
    aiClearDraft();
    repeatClear();
    /* El registro YA se guardó: el espejo de borrador (D3) se
       limpia — lo escrito no debe seguir figurando como sin guardar
       ni escribirse dos veces. */
    try { pendDraftClear(); pendDraftDisarm(); } catch {}
    $('meal-modal').style.display = 'none';
    e.target.reset();
    $('m-photo-preview').style.display = 'none'; $('m-photo-preview').src = '';
    await loadAllKeepDate(data.date);
    if (wasDraft) {
      /* Confirmación visible del borrador (H-2): las kcal guardadas y el
         total del día YA incluyéndolas — que «sí suma» sea evidente. */
      const dayTotal = (MEALS[data.date] || []).reduce((s, m) => s + (Number(m.kcal) || 0), 0);
      toast(t('ai.savedInfo', { kcal: Math.round(data.kcal), total: Math.round(dayTotal) }));
    } else {
      toast(t('msg.mealSaved'));
    }
  } finally {
    mealSaving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
});

/* weightCtx: null = pesaje propio nuevo; {uid, docId, rec} = editar (propio o de un cliente, solo dueño) */
let weightCtx = null;
function openWeightModal(ctx) {
  weightCtx = ctx || null;
  const rec = ctx && ctx.rec;
  $('w-date').value = (rec && rec.date) || todayISO();
  $('w-weight').value = (rec && rec.weight) || '';
  $('w-fat').value = (rec && rec.fat) || '';
  $('w-muscle').value = (rec && rec.muscle) || '';
  $('w-water').value = (rec && rec.water) || '';
  $('w-visceral').value = (rec && rec.visceral) || '';
  $('w-notes').value = (rec && rec.notes) || '';
  /* Formulario POR ROL (correo 2026-10-23 18:23, que REDEFINE el
     de 17:48 en lo solapado): el PESO lo ingresa SIEMPRE el
     usuario; los PORCENTAJES (grasa, músculo, agua, visceral) y
     las NOTAS quedan deshabilitados para el usuario SIN permiso
     expreso de su entrenador (el interruptor compAccess), con la
     nota visible. En la vista del entrenador (contexto de cliente)
     todo queda habilitado. */
  const pctLocked = (!ctx || ctx.uid === auth.currentUser.uid) && !compClientCanEdit();
  ['w-fat', 'w-muscle', 'w-water', 'w-visceral', 'w-notes'].forEach(idF => { const el = $(idF); if (el) el.disabled = pctLocked; });
  const pn = $('w-pct-note'); if (pn) { pn.style.display = pctLocked ? '' : 'none'; pn.textContent = t('compacc.pctNote'); }
  $('weight-modal').style.display = '';
}
$('btn-add-weight').onclick = () => openWeightModal(null);
$('weight-cancel').onclick = () => { $('weight-modal').style.display = 'none'; weightCtx = null; };
$('weight-modal').addEventListener('click', e => { if (e.target.id === 'weight-modal') { e.target.style.display = 'none'; weightCtx = null; } });

$('form-weight').addEventListener('submit', async e => {
  e.preventDefault();
  const date = $('w-date').value;
  const uid = (weightCtx && weightCtx.uid) || auth.currentUser.uid;
  const docId = (weightCtx && weightCtx.docId) || `${uid}_${date}`;
  /* Con los porcentajes bloqueados, el guardado del usuario escribe
     su PESO y CONSERVA los porcentajes/notas ya registrados por el
     entrenador (del registro que se edita): nunca los pisa a cero. */
  const pctLocked = uid === auth.currentUser.uid && !compClientCanEdit();
  const prevRec = (weightCtx && weightCtx.rec) || {};
  const data = { ownerUid: uid, date, weight: num($('w-weight').value),
    fat: pctLocked ? Math.max(0, num(prevRec.fat)) : Math.max(0, num($('w-fat').value)),
    muscle: pctLocked ? Math.max(0, num(prevRec.muscle)) : Math.max(0, num($('w-muscle').value)),
    water: pctLocked ? Math.max(0, num(prevRec.water)) : Math.max(0, num($('w-water').value)),
    visceral: pctLocked ? Math.max(0, num(prevRec.visceral)) : Math.max(0, num($('w-visceral').value)),
    notes: pctLocked ? String(prevRec.notes || '') : $('w-notes').value.trim(),
    updatedAt: serverTimestamp() };
  if (!date || data.weight <= 0) { toast(t('err.weightMissing'), true); return; }
  /* Aviso HONESTO (corrección «Registrar pesaje», 2026-10-23): si el
     guardado es rechazado (p. ej. las reglas vivas aún no admiten que
     el entrenador cree el primer pesaje de un cliente), el error se
     MUESTRA con su causa (patrón errCauseKey/failToast de 2026-10-20)
     y el modal queda ABIERTO con los datos intactos: nunca más un
     fallo en silencio que parece un guardado. */
  try {
    await setDoc(doc(db, 'nutrition_weight', docId), data);
  } catch (err) {
    failToast(err);
    return;
  }
  $('weight-modal').style.display = 'none';
  e.target.reset();
  const wasClient = weightCtx && weightCtx.uid !== auth.currentUser.uid;
  const clientUid = weightCtx && weightCtx.uid;
  weightCtx = null;
  toast(t('msg.weightSaved'));
  if (wasClient) await openClient(clientUid); else { await loadAll(); try { await evalReconcile(date); } catch {} }
});

/* Mostrar/ocultar la contraseña (ojito discreto junto al campo) */
document.querySelectorAll('.pw-eye').forEach(b => b.addEventListener('click', () => {
  const inp = document.getElementById(b.getAttribute('data-pw'));
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  b.classList.toggle('on', show);
  b.title = t(show ? 'pw.hide' : 'pw.show');
}));

/* ================= LANGUAGE TOGGLE WIRING ================= */
document.querySelectorAll('.lang-toggle button').forEach(b =>
  b.addEventListener('click', () => setLang(b.getAttribute('data-lang'))));
applyI18n();

/* ================= PENDIENTES DE ACTIVIDADES PROGRAMADAS (REC-D) ==
   Construcción en DESARROLLO autorizada por Ronald (2026-10-20,
   decisiones D1–D6 de la Ficha 4): la línea de pendientes de la
   PROPUESTA CONSOLIDADA v2 (2026-10-19) llevada a la app real.
     D1 — Fase 1 primero: avisos SOLO dentro de la app.
     D2 — Panel propio y visible en «Mi registro» (#pend-panel).
     D3 — El estado «registro sin guardar» se refleja también aquí
          (espejo del borrador del formulario manual de comidas).
     D4 — Fase 2 (push) NO se ejecuta: la colección push_subscriptions
          NO se crea ni se escribe; espera su propio checkpoint de
          reglas, no autorizado.
     D5 — Fase 2 (barrido horario del Worker) NO se toca: el Worker
          no se modifica y no se activa ninguna suscripción.
     D6 — Corte del día: 04:00 como SUGERENCIA por usuario que cada
          quien confirma o cambia (decidido 2026-10-20); nunca una
          regla universal impuesta.
   PRESENTACIÓN (2026-10-21, pedido expreso de Ronald): el panel en
   línea SALE de «Mi registro» (D2 queda histórico en ese punto). Los
   pendientes viven SOLO en el cuarto botón del dock flotante
   (PENDIENTES, idéntico a los otros tres) y en su tarjeta flotante
   #pend-float, que la página no aloja en su flujo. El botón se
   pinta ROJO (#7f1d1d, el rojo de peligro de la casa: fondo del
   toast de error) cuando pendCompute() lista ≥1 pendiente vigente,
   y vuelve a teal al resolverse; el error de carga y la falta de
   activación NUNCA se pintan de rojo ni se disfrazan de «sin
   pendientes». Sin cambios de semántica, de cómputo ni de
   persistencia: solo cambia dónde y cómo se presenta.
   D7/D8/D9 están MOOT: el sistema de evaluaciones desplegado ya los
   resolvió; este módulo NO reimplementa el ciclo — solo REFLEJA su
   pendiente en el panel cuando el ciclo tiene fecha prevista.

   PERSISTENCIA (veredicto contra las reglas r5 vigentes, idéntico al
   del módulo de evaluaciones): nutrition_progress no impone esquema
   de campos y el catch-all deniega colecciones nuevas; el documento
   de usuario no admite campos nuevos en auto-actualización. Por eso:
     · configuración: {uid}_pendconfig, kind 'pendConfig'.
     · marcas (posponer/omitir/descartar por ocasión):
       {uid}_pendstate, kind 'pendState': { marks: { <id>: {...} } }.
   Ninguna colección nueva → NINGÚN cambio de reglas requerido.
   Los pendientes se CALCULAN desde los registros reales (MEALS,
   WEIGHTS, MY_LOGS y el estado del ciclo de evaluación): registrar
   la actividad resuelve su pendiente por sí mismo, sin marcas.

   REGLAS DE COMPORTAMIENTO (propuesta v2 §2–§5):
     · Lenguaje de REGISTRO pendiente: jamás se afirma que la persona
       no comió / no entrenó / no se pesó.
     · Nada nace sin activación CONFIRMADA: la activación presenta
       valores sugeridos editables y solo al confirmar existen.
     · Identidad única por ocasión (tipo + comida + fecha): posponer
       conserva identidad y FECHA ORIGINAL; un vencido queda visible
       con su fecha, sin culpa, y nunca se auto-resuelve; el sistema
       no genera una copia nueva por día.
     · «Hoy no corresponde» omite SOLO esa ocasión.
     · El entrenamiento vencido puede DESCARTARSE expresamente (queda
       registrado como descartado por el usuario).
     · Posponer dentro del descanso se mueve al final del descanso y
       el sistema LO DICE.
     · Abrir la vista no escribe nada.
   ND-2 (2026-10-20): este panel es SOLO del propio usuario; no toca
   ninguna vista de terceros. La futura vista del entrenador nacerá
   con bitácora de accesos por decisión vinculante — gancho de diseño
   anotado aquí: cualquier lectura futura de estos datos por un
   tercero deberá registrarse en esa bitácora (no se construye ahora).
   ================================================================== */
let PEND_CFG = null;            // null = aún no cargado; {activated:false} = sin activar
let PEND_STATE = { marks: {} }; // marcas por ocasión (pospuesto/omitido/descartado)
let PEND_UI = { configOpen: false, floatOpen: false };
let MY_PLAN = null, MY_LOGS = [];   // los rellena loadMyTraining()

const PEND_MEAL_NAMES = ['Desayuno', 'Almuerzo', 'Cena', 'Merienda', 'Snack'];
/* Comidas «principales» (instrucción de Ronald, 2026-10-21): las
   únicas que generan pendiente. Los nombres se guardan siempre en
   su forma canónica ES (la configuración itera PEND_MEAL_NAMES),
   así que la clase se decide por nombre, sin depender del idioma;
   cualquier nombre fuera de esta lista se trata como no principal. */
const PEND_MAIN_MEALS = ['Desayuno', 'Almuerzo', 'Cena'];
function pendCfgRef() { return doc(db, 'nutrition_progress', `${auth.currentUser.uid}_pendconfig`); }
function pendStateRef() { return doc(db, 'nutrition_progress', `${auth.currentUser.uid}_pendstate`); }
function pendDefaults() {
  return { activated: false, activatedAt: null,
    meals: [
      { name: 'Desayuno', on: true, time: '08:00' },
      { name: 'Almuerzo', on: true, time: '13:30' },
      { name: 'Cena', on: true, time: '20:00' },
      { name: 'Merienda', on: false, time: '10:30' },
      { name: 'Snack', on: false, time: '16:00' }
    ],
    weightOn: true, weightFreq: 7,
    trainOn: true, trainDays: [1, 3, 5],
    quietOn: true, quietFrom: '22:00', quietTo: '07:00',
    cutoff: '04:00' };
}

/* ---------- tiempo local y día de registro ---------- */
function pendParseHM(hm) { const m = String(hm || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
function pendFmtHM(mins) { mins = ((mins % 1440) + 1440) % 1440; return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); }
function pendISOof(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function pendDateTime(iso, hm) { const p = iso.split('-').map(Number); const mins = pendParseHM(hm); return new Date(p[0], p[1] - 1, p[2], Math.floor(mins / 60), mins % 60); }
function pendDaysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
/* El día de registro empieza a la hora de corte confirmada por el
   usuario: antes del corte, «hoy» (a efectos de registro) es el día
   que empezó la víspera. */
function pendRegDay(now, cutoff) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = pendISOof(now);
  return mins < pendParseHM(cutoff || '04:00') ? addDaysISO(today, -1) : today;
}
/* Instante de una ocasión de comida del día de registro `regDate`:
   si su hora cae ANTES del corte, pertenece al día calendario
   siguiente (la cena de las 00:30 es del día que termina). */
function pendMealWhen(regDate, time, cutoff) {
  const cal = pendParseHM(time) < pendParseHM(cutoff || '04:00') ? addDaysISO(regDate, 1) : regDate;
  return pendDateTime(cal, time);
}
function pendWhenText(dt, now) {
  const time = pendFmtHM(dt.getHours() * 60 + dt.getMinutes());
  const dISO = pendISOof(dt), nISO = pendISOof(now);
  if (dISO === nISO) return t('pend.whenToday', { time });
  if (dISO === addDaysISO(nISO, 1)) return t('pend.whenTomorrow', { time });
  return t('pend.whenDate', { date: dateName(dISO), time });
}
function pendDateTag(iso, regDay) {
  if (iso === regDay) return t('pend.todayWord');
  if (iso === addDaysISO(regDay, -1)) return t('pend.yesterday');
  return dateName(iso);
}

/* ---------- carga (solo lectura; abrir la vista no escribe) ------ */
async function loadPendings() {
  if (!$('pend-body') || !auth.currentUser) return;
  try {
    const [cs, ss] = await Promise.all([getDoc(pendCfgRef()), getDoc(pendStateRef())]);
    PEND_CFG = cs.exists() ? Object.assign(pendDefaults(), cs.data()) : { activated: false };
    PEND_STATE = { marks: (ss.exists() && ss.data() && ss.data().marks) || {} };
  } catch { PEND_CFG = { __error: true }; }
  renderPendings();
  trainAlignRender();
}
async function pendSaveCfg(cfg) {
  await setDoc(pendCfgRef(), Object.assign({ kind: 'pendConfig', uid: auth.currentUser.uid, ownerUid: auth.currentUser.uid, updatedAt: serverTimestamp() }, cfg), { merge: true });
  PEND_CFG = Object.assign(pendDefaults(), cfg);
  trainAlignRender();
}
async function pendMark(id, mark) {
  PEND_STATE.marks = PEND_STATE.marks || {};
  if (mark) PEND_STATE.marks[id] = mark; else delete PEND_STATE.marks[id];
  try {
    await setDoc(pendStateRef(), { kind: 'pendState', uid: auth.currentUser.uid, ownerUid: auth.currentUser.uid, marks: PEND_STATE.marks, updatedAt: serverTimestamp() }, { merge: true });
  } catch {}
  renderPendings();
}

/* ---------- cálculo de pendientes (puro, desde los registros) ---- */
function pendCompute() {
  const cfg = PEND_CFG, now = new Date();
  const out = { items: [], traces: [], regDay: null, now };
  if (!cfg || !cfg.activated) return out;
  const regDay = pendRegDay(now, cfg.cutoff);
  out.regDay = regDay;
  const marks = (PEND_STATE && PEND_STATE.marks) || {};
  const winStart = addDaysISO(regDay, -30);
  const start = (cfg.activatedAt && cfg.activatedAt > winStart) ? cfg.activatedAt : winStart;
  const traceFrom = addDaysISO(regDay, -7);
  const classify = id => {
    const mk = marks[id];
    if (!mk) return { st: 'active' };
    if (mk.st === 'omitted') return { st: 'omitted', mk };
    if (mk.st === 'discarded') return { st: 'discarded', mk };
    if (mk.st === 'snoozed') return (mk.until && new Date(mk.until) > now) ? { st: 'snoozed', mk } : { st: 'active', mk };
    return { st: 'active', mk };
  };
  const labelOf = it => it.type === 'meal' ? t('pend.mealName.' + it.meal)
    : it.type === 'weight' ? t('pend.label.weight')
    : it.type === 'training' ? t('pend.label.training') : '';
  const settle = (it) => {
    const c = classify(it.id);
    if (c.st === 'active') out.items.push(it);
    else if (it.date >= traceFrom || c.st === 'snoozed') out.traces.push({ kind: c.st, item: it, mk: c.mk, label: labelOf(it) });
  };

  /* Comidas — SOLO las principales (Desayuno, Almuerzo, Cena) y SOLO
     del día de registro en curso (instrucción de Ronald, 2026-10-21:
     «los recordatorios inmediatos tengan que ver con las comidas
     principales, luego que correspondan al día»). Merienda, Snack o
     cualquier otro nombre NO generan pendiente aunque estén activos,
     y una ocasión de un día pasado ya no se emite: ni tarjeta ni
     contador; sus marcas quedan en el estado, sin efecto visible. */
  (cfg.meals || []).filter(m => m && m.on && PEND_MAIN_MEALS.includes(m.name)).forEach(m => {
    for (let d = regDay; d <= regDay; d = addDaysISO(d, 1)) {
      if (pendMealWhen(d, m.time, cfg.cutoff) > now) continue;
      const it = { id: `meal|${m.name}|${d}`, type: 'meal', meal: m.name, time: m.time, date: d, overdue: d < regDay, age: pendDaysBetween(d, regDay) };
      if ((MEALS[d] || []).some(x => x.meal === m.name)) {
        if (d === regDay) out.traces.push({ kind: 'done', item: it, label: labelOf(it) });
        continue;
      }
      settle(it);
    }
  });

  /* Peso — una sola ocasión viva: la fecha de vencimiento vigente.
     La frecuencia corre desde el último pesaje (o la activación);
     omitir avanza a la siguiente fecha SIN desactivar la frecuencia. */
  if (cfg.weightOn) {
    const freq = Number(cfg.weightFreq) || 7;
    const weighDates = WEIGHTS.map(w => w.date).filter(d => d && d <= regDay).sort();
    const lastWeigh = weighDates.length ? weighDates[weighDates.length - 1] : null;
    let due = addDaysISO(lastWeigh || cfg.activatedAt || regDay, freq);
    let guard = 0;
    while (due <= regDay && guard++ < 400) {
      const it = { id: `weight|${due}`, type: 'weight', date: due, overdue: due < regDay, age: pendDaysBetween(due, regDay), lastWeigh, freq };
      const c = classify(it.id);
      if (c.st === 'omitted') { due = addDaysISO(due, freq); continue; }
      if (c.st === 'active') out.items.push(it);
      else out.traces.push({ kind: c.st, item: it, mk: c.mk, label: labelOf(it) });
      break;
    }
    if (weighDates.includes(regDay)) out.traces.push({ kind: 'done', item: { id: `weight|${regDay}`, type: 'weight', date: regDay }, label: t('pend.label.weight') });
  }

  /* Entrenamiento — días de semana configurados, con plan activo.
     La sesión se registra en «Mi entrenamiento»; el vencido puede
     descartarse expresamente (queda la marca). */
  if (cfg.trainOn && MY_PLAN) {
    for (let d = start; d <= regDay; d = addDaysISO(d, 1)) {
      const dow = new Date(d + 'T12:00:00').getDay();
      if (!(cfg.trainDays || []).includes(dow)) continue;
      const it = { id: `training|${d}`, type: 'training', date: d, overdue: d < regDay, age: pendDaysBetween(d, regDay), canDiscard: true };
      if (MY_LOGS.some(l => l.date === d)) {
        if (d === regDay) out.traces.push({ kind: 'done', item: it, label: labelOf(it) });
        continue;
      }
      settle(it);
    }
  }

  /* Evaluación — REFLEJO del ciclo ya desplegado (no se reimplementa):
     aparece cuando el ciclo tiene fecha prevista vencida o de hoy y
     la lista requerida de ESE set sigue incompleta. Su omitir y su
     registro viven en la tarjeta de «Mi progreso». */
  try {
    const due = (typeof evalNextDue === 'function') ? evalNextDue() : null;
    if (due && due <= regDay && !((EVAL_CYCLE && EVAL_CYCLE.omitted) || []).includes(due)) {
      const missing = evalMissingItems(due);
      if (missing.length) out.items.push({ id: `eval|${due}`, type: 'eval', date: due, overdue: due < regDay, age: pendDaysBetween(due, regDay), missing });
    }
  } catch {}

  /* Energía — pendiente SOLO del propio cliente (pendCompute corre
     únicamente sobre los datos del usuario en sesión: el entrenador
     nunca ve este pendiente). Aparece cuando el cálculo de energía
     no puede hacerse por faltar el dato privado que SOLO el cliente
     puede aportar: la evaluación existe, el entrenador ya eligió la
     ecuación (Mifflin-St Jeor) y la señal sexDataProvided no está
     aportada — el mismo hueco que la tarjeta del entrenador muestra
     como «sin resultado» por fa.missSex (o el caso C-3, dato
     retirado). Sin marcas (no es una ocasión): está mientras falte
     el dato y desaparece al aportarlo; si falta la ecuación o
     cualquier otro dato, el bloqueo no es del cliente y NO se
     genera pendiente. La redacción en superficies del entrenador no
     cambia: allí sigue solo la señal sí/no de siempre. */
  try {
    const a = (typeof MY_ASMT !== 'undefined' && MY_ASMT) ? MY_ASMT.doc : null;
    if (a && a.equation === 'mifflin-st-jeor' && a.sexDataProvided !== true)
      out.items.push({ id: 'energy|private-data', type: 'energy', date: regDay, overdue: false, age: 0 });
  } catch {}

  const order = { meal: 1, weight: 2, training: 3, eval: 4, energy: 5 };
  out.items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (order[a.type] || 9) - (order[b.type] || 9)));
  return out;
}

/* ---------- posponer: elección, descanso y desplazamiento -------- */
function pendSnoozeTarget(opt, now) {
  const cfg = PEND_CFG;
  let chosen;
  if (opt === '1h') chosen = new Date(now.getTime() + 3600e3);
  else if (opt === '3h') chosen = new Date(now.getTime() + 3 * 3600e3);
  else if (opt === 'tomorrowSame') chosen = new Date(now.getTime() + 86400e3);
  else chosen = pendDateTime(addDaysISO(pendISOof(now), 1), '09:00');
  let target = chosen, shifted = false;
  if (cfg && cfg.quietOn) {
    const from = pendParseHM(cfg.quietFrom), to = pendParseHM(cfg.quietTo);
    const mins = chosen.getHours() * 60 + chosen.getMinutes();
    const inQuiet = from === to ? false : (from < to ? (mins >= from && mins < to) : (mins >= from || mins < to));
    if (inQuiet) {
      shifted = true;
      const endDate = (from > to && mins >= from) ? addDaysISO(pendISOof(chosen), 1) : pendISOof(chosen);
      target = pendDateTime(endDate, cfg.quietTo);
    }
  }
  const local = d => `${pendISOof(d)}T${pendFmtHM(d.getHours() * 60 + d.getMinutes())}`;
  return { until: local(target), when: pendWhenText(target, now), shifted,
    chosenHM: pendFmtHM(chosen.getHours() * 60 + chosen.getMinutes()),
    quietFrom: cfg ? cfg.quietFrom : '', quietTo: cfg ? cfg.quietTo : '' };
}

/* ---------- espejo de borrador sin guardar (D3) -------------------
   El formulario manual de comidas, cuando se abre por la vía manual
   o desde un pendiente, ARMA el espejo: lo tecleado se guarda en
   localStorage al escribir; guardar el registro lo limpia; cancelar
   NO lo borra (ese es el punto: lo sin guardar sobrevive y se
   refleja aquí). Repetir y el borrador de IA NO arman el espejo. */
let PEND_DRAFT_ARM = false;
const PEND_DRAFT_KEY = 'ronbo-pend-draft-v1';
function pendDraftArm() { PEND_DRAFT_ARM = true; }
function pendDraftDisarm() { PEND_DRAFT_ARM = false; }
function pendDraftLive(d) {
  return !!d && (((d.food || '').trim() !== '') || ((d.qty || '').trim() !== '') || ((d.notes || '').trim() !== '') ||
    ['kcal', 'prot', 'carb', 'sugar', 'fat'].some(k => Number(d[k]) > 0));
}
function pendDraftGet() {
  try { const s = localStorage.getItem(PEND_DRAFT_KEY); const d = s ? JSON.parse(s) : null; return pendDraftLive(d) ? d : null; }
  catch { return null; }
}
function pendDraftSave() {
  if (!PEND_DRAFT_ARM) return;
  const v = id => { const el = $(id); return el ? el.value : ''; };
  const d = { date: v('m-date'), meal: v('m-meal'), food: v('m-food'), qty: v('m-qty'), kcal: v('m-kcal'), prot: v('m-prot'), carb: v('m-carb'), sugar: v('m-sugar'), fat: v('m-fat'), notes: v('m-notes'), at: Date.now() };
  try {
    if (pendDraftLive(d)) localStorage.setItem(PEND_DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(PEND_DRAFT_KEY);
  } catch {}
  renderPendings();
}
function pendDraftClear() { try { localStorage.removeItem(PEND_DRAFT_KEY); } catch {} }
function pendDraftRestore() {
  const d = pendDraftGet(); if (!d) return;
  const set = (id, val) => { const el = $(id); if (el && val !== undefined && val !== null) el.value = val; };
  set('m-date', d.date); set('m-meal', d.meal); set('m-food', d.food); set('m-qty', d.qty);
  set('m-kcal', d.kcal); set('m-prot', d.prot); set('m-carb', d.carb); set('m-sugar', d.sugar); set('m-fat', d.fat); set('m-notes', d.notes);
}
{ const fm = document.getElementById('form-meal'); if (fm) fm.addEventListener('input', () => { try { pendDraftSave(); } catch {} }); }

/* ---------- botón PENDIENTES del dock y tarjeta flotante --------
   El color del botón es SOLO un reflejo del cómputo local: rojo
   #7f1d1d (fondo del toast de error) si pendCompute() lista ≥1
   pendiente vigente; teal en cualquier otro caso. El error de
   carga (PEND_CFG.__error) y el estado sin activar devuelven 0 a
   propósito: el botón no finge «sin pendientes» con rojo ni con
   ninguna otra señal — al abrir la tarjeta se ve el estado real. */
function pendActiveCount() {
  const cfg = PEND_CFG;
  if (!cfg || cfg.__error || !cfg.activated) return 0;
  try { return pendCompute().items.length; } catch { return 0; }
}
function pendSyncDock() {
  const b = $('btn-toggle-pend'); if (!b) return;
  b.classList.toggle('pend-alert', pendActiveCount() > 0);
}
function pendSetFloat(open) {
  PEND_UI.floatOpen = !!open;
  const f = $('pend-float'), b = $('btn-toggle-pend');
  if (f) f.style.display = open ? '' : 'none';
  if (b) b.setAttribute('aria-expanded', String(!!open));
  /* Al abrir se refresca el contenido, salvo si hay un formulario
     de pendientes en pantalla (activación o configuración): un
     re-render lo reiniciaría y perdería lo tecleado sin guardar. */
  if (open && !document.getElementById('pc-cutoff')) renderPendings();
  pendSyncDock();
}
/* Recálculo sin recargar (al volver a primer plano y cada 60 s):
   pinta el botón a la hora en punto de un pendiente y refresca la
   lista si la tarjeta está abierta, sin tocar formularios. Solo
   cómputo local: ninguna lectura de red nueva. */
function pendDockTick() {
  if (!auth.currentUser || !PEND_CFG) return;
  if (PEND_UI.floatOpen && !document.getElementById('pc-cutoff')) renderPendings();
  pendSyncDock();
}

/* ---------- render del panel ---------- */
function pendMealLabel(name) { return t('pend.mealName.' + name); }
function pendItemHTML(it, regDay) {
  /* Tarjeta VENCIDA (su fecha es anterior al día de registro): el
     título lleva la fecha en pasado (rama de cada tipo) y la línea
     secundaria ya no añade el sufijo «· ayer» / «· <fecha>» — la
     fecha manda en el título (hallazgo de Ronald, 2026-10-21: la
     tarjeta en presente con el «ayer» escondido se leía como
     contradicción junto a «Estados: … registrado ✓» de hoy). */
  const tag = it.overdue ? '' : (it.date !== regDay ? ` · ${esc(pendDateTag(it.date, regDay))}` : '');
  let title = '', detail = '', go = '';
  if (it.type === 'meal') {
    title = t('pend.mealTitle', { meal: pendMealLabel(it.meal) });
    detail = `${esc(t('pend.mealDetail', { time: it.time }))}${tag}`;
    go = `<button type="button" class="btn-primary btn-sm" data-pend-act="go" data-type="meal" data-date="${it.date}" data-meal="${esc(it.meal)}">${esc(t('pend.goMeal', { meal: pendMealLabel(it.meal) }))}</button>`;
  } else if (it.type === 'weight') {
    title = !it.overdue ? t('pend.weightTitle')
      : it.age === 1 ? t('pend.weightTitlePastYday')
      : t('pend.weightTitlePastDate', { date: dateName(it.date) });
    const when = it.lastWeigh ? (it.lastWeigh === regDay ? t('pend.todayWord') : t('pend.daysAgo', { d: pendDaysBetween(it.lastWeigh, regDay) })) : t('pend.weightNever');
    detail = `${esc(t('pend.weightDetail', { when, freq: t('pend.freq.' + it.freq) }))}${tag}`;
    go = `<button type="button" class="btn-primary btn-sm" data-pend-act="go" data-type="weight" data-date="${it.date}">${esc(t('pend.goWeight'))}</button>`;
  } else if (it.type === 'training') {
    title = !it.overdue ? t('pend.trainTitle')
      : it.age === 1 ? t('pend.trainTitlePastYday')
      : t('pend.trainTitlePastDate', { date: dateName(it.date) });
    detail = `${esc(dateName(it.date))}${it.overdue ? ` · ${esc(t('pend.daysAgo', { d: it.age }))}` : ''}`;
    go = `<button type="button" class="btn-primary btn-sm" data-pend-act="go" data-type="training" data-date="${it.date}">${esc(t('pend.goTraining'))}</button>`;
  } else if (it.type === 'eval') {
    title = t('pend.evalTitle', { date: dateName(it.date) });
    const items = it.missing.map(m2 => m2.kind === 'photo' ? t('eval.reqPhoto.' + m2.id) : t('eval.measure.' + m2.id)).join(' · ');
    detail = `${esc(t('pend.evalMissing', { items }))}${it.overdue ? ` · ${esc(t('pend.daysAgo', { d: it.age }))}` : ''}`;
    go = `<button type="button" class="btn-primary btn-sm" data-pend-act="go" data-type="eval" data-date="${it.date}">${esc(t('pend.goEval'))}</button>`;
  } else if (it.type === 'energy') {
    title = t('pend.energyTitle');
    detail = t('pend.energyDetail');
    go = `<button type="button" class="btn-primary btn-sm" data-pend-act="go" data-type="energy" data-date="${it.date}">${esc(t('pend.goEnergy'))}</button>`;
  }
  const now = new Date();
  const hm = d => pendFmtHM(d.getHours() * 60 + d.getMinutes());
  const opts = [
    ['1h', t('pend.snooze.1h', { time: hm(new Date(now.getTime() + 3600e3)) })],
    ['3h', t('pend.snooze.3h', { time: hm(new Date(now.getTime() + 3 * 3600e3)) })],
    ['tomorrowSame', t('pend.snooze.tomorrowSame', { time: hm(now) })],
    ['tomorrow9', t('pend.snooze.tomorrow9')]
  ].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  const snooze = (it.type === 'eval' || it.type === 'energy') ? '' : `<label class="pend-snooze"><span>${esc(t('pend.snooze'))}</span><select data-pend-snooze="${esc(it.id)}"><option value="">—</option>${opts}</select></label>`;
  const omit = (it.type === 'eval' || it.type === 'energy') ? '' : `<button type="button" class="btn-ghost btn-sm" data-pend-act="omit" data-id="${esc(it.id)}">${esc(t(it.overdue ? 'pend.omitOccasionPast' : 'pend.omitOccasion'))}</button>`;
  const discard = it.canDiscard ? `<button type="button" class="btn-ghost btn-sm pend-danger" data-pend-act="discard" data-id="${esc(it.id)}">${esc(t('pend.discard'))}</button>` : '';
  return `<div class="pend-item${it.overdue ? ' pend-overdue' : ''}" data-pend-item="${esc(it.id)}">
    <p class="pend-text"><b>${esc(title)}</b><br><span class="pend-detail">${detail}</span></p>
    <div class="pend-actions">${go}${snooze}${omit}${discard}</div>
  </div>`;
}
function pendCfgFormHTML(cfg, first) {
  const defMeals = pendDefaults().meals;
  const mealRows = PEND_MEAL_NAMES.map(name => {
    const m = (cfg.meals || []).find(x => x.name === name) || defMeals.find(x => x.name === name) || { name, on: false, time: '12:00' };
    return `<div class="pend-cfg-row"><label class="check-row"><input type="checkbox" id="pc-on-${name}" ${m.on ? 'checked' : ''}> <span>${esc(pendMealLabel(name))}</span></label><input type="time" id="pc-time-${name}" value="${esc(m.time || '12:00')}"></div>`;
  }).join('');
  const wd = [0, 1, 2, 3, 4, 5, 6].map(d => `<label class="pend-wd"><input type="checkbox" id="pc-wd-${d}" ${(cfg.trainDays || []).includes(d) ? 'checked' : ''}> <span>${esc(t('pend.wd.' + d))}</span></label>`).join('');
  const freqOpts = [1, 3, 7, 15].map(f => `<option value="${f}" ${Number(cfg.weightFreq) === f ? 'selected' : ''}>${esc(t('pend.freq.' + f))}</option>`).join('');
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  return `<div class="pend-cfg">
    <p class="pend-cfg-title">${esc(first ? t('pend.actTitle') : t('pend.cfgTitle'))}</p>
    <p class="progress-hint">${esc(t(first ? 'pend.actIntro' : 'pend.phaseNote'))}</p>
    <p class="pend-cfg-h">${esc(t('pend.meals'))}</p>${mealRows}
    <div class="pend-cfg-row"><label class="check-row"><input type="checkbox" id="pc-weight-on" ${cfg.weightOn ? 'checked' : ''}> <span>${esc(t('pend.weightOn'))}</span></label>
    <label class="pend-sel"><span>${esc(t('pend.weightFreq'))}</span><select id="pc-weight-freq">${freqOpts}</select></label></div>
    <div class="pend-cfg-row"><label class="check-row"><input type="checkbox" id="pc-train-on" ${cfg.trainOn ? 'checked' : ''}> <span>${esc(t('pend.trainOn'))}</span></label></div>
    <p class="pend-cfg-h">${esc(t('pend.trainDays'))}</p><div class="pend-wds">${wd}</div>
    <div class="pend-cfg-row"><label class="check-row"><input type="checkbox" id="pc-quiet-on" ${cfg.quietOn ? 'checked' : ''}> <span>${esc(t('pend.quietOn'))}</span></label>
    <label class="pend-sel"><span>${esc(t('pend.quietFrom'))}</span><input type="time" id="pc-quiet-from" value="${esc(cfg.quietFrom || '22:00')}"></label>
    <label class="pend-sel"><span>${esc(t('pend.quietTo'))}</span><input type="time" id="pc-quiet-to" value="${esc(cfg.quietTo || '07:00')}"></label></div>
    <div class="pend-cfg-row"><label class="pend-sel"><span>${esc(t('pend.cutoff'))}</span><input type="time" id="pc-cutoff" value="${esc(cfg.cutoff || '04:00')}"></label></div>
    <p class="progress-hint">${esc(t('pend.cutoffHelp'))}</p>
    <p class="progress-hint">${esc(t('pend.tz', { tz }))}</p>
    ${first ? `<p class="progress-hint">${esc(t('pend.phaseNote'))}</p>` : ''}
    <div class="pend-actions">
      <button type="button" class="btn-primary btn-sm" data-pend-act="confirm">${esc(t(first ? 'pend.confirm' : 'pend.saveCfg'))}</button>
      ${first ? '' : `<button type="button" class="btn-ghost btn-sm" data-pend-act="cancelcfg">${esc(t('pend.cancel'))}</button>
      <button type="button" class="btn-ghost btn-sm pend-danger" data-pend-act="deactivate">${esc(t('pend.deactivate'))}</button>`}
    </div>
  </div>`;
}
function renderPendings() {
  const body = $('pend-body'); if (!body) return;
  const count = $('pend-count'), cfgBtn = $('btn-pend-config');
  const cfg = PEND_CFG;
  if (!cfg) { body.innerHTML = `<div class="wempty">${esc(t('train.loading'))}</div>`; pendSyncDock(); return; }
  if (cfg.__error) { body.innerHTML = `<p class="progress-hint">${esc(t('pend.loadError'))}</p>`; if (count) count.style.display = 'none'; if (cfgBtn) cfgBtn.style.display = 'none'; pendSyncDock(); return; }
  if (!cfg.activated) {
    if (count) count.style.display = 'none';
    if (cfgBtn) cfgBtn.style.display = 'none';
    /* Sin activar: el formulario trae los valores SUGERIDOS — o los
       que el usuario ya guardó si desactivó antes (no se le borra
       su configuración al apagar). */
    body.innerHTML = pendCfgFormHTML(cfg.meals ? cfg : pendDefaults(), true);
    pendSyncDock();
    return;
  }
  if (cfgBtn) cfgBtn.style.display = '';
  if (PEND_UI.configOpen) {
    if (count) count.style.display = 'none';
    body.innerHTML = pendCfgFormHTML(cfg, false);
    pendSyncDock();
    return;
  }
  const { items, traces, regDay } = pendCompute();
  if (count) {
    if (items.length) { count.textContent = items.length; count.style.display = ''; }
    else count.style.display = 'none';
  }
  let html = `<p class="progress-hint">${esc(t('pend.intro'))}</p>`;
  const draft = pendDraftGet();
  if (draft) {
    html += `<div class="pend-item pend-draft">
      <p class="pend-text"><b>${esc(t('pend.draftTitle'))}</b><br><span class="pend-detail">${esc(t('pend.draftBody', { food: (draft.food || '').trim() || '—' }))}</span></p>
      <div class="pend-actions">
        <button type="button" class="btn-primary btn-sm" data-pend-act="draft-continue">${esc(t('pend.draftContinue'))}</button>
        <button type="button" class="btn-ghost btn-sm pend-danger" data-pend-act="draft-discard">${esc(t('pend.draftDiscard'))}</button>
      </div></div>`;
  }
  if (!items.length && !draft) html += `<p class="pend-none">${esc(t('pend.none'))}</p>`;
  html += items.map(it => pendItemHTML(it, regDay)).join('');
  if (traces.length) {
    const lines = traces.map(tr => {
      if (tr.kind === 'done') return `<li>${esc(t('pend.traceDone', { label: tr.label }))}</li>`;
      if (tr.kind === 'omitted') return `<li>${esc(t('pend.traceOmitted', { label: tr.label }))}</li>`;
      if (tr.kind === 'discarded') return `<li>${esc(t('pend.traceDiscarded', { label: tr.label }))}</li>`;
      if (tr.kind === 'snoozed') {
        let s = t('pend.traceSnoozed', { label: tr.label, when: tr.mk.whenText || '' });
        if (tr.mk.shifted) s += ' ' + t('pend.snoozeQuietShift', { time: tr.mk.chosenHM || '', from: tr.mk.quietFrom || '', to: tr.mk.quietTo || '' });
        return `<li>${esc(s)}</li>`;
      }
      return '';
    }).join('');
    html += `<div class="pend-traces"><p class="pend-cfg-h">${esc(t('pend.traceTitle'))}</p><ul>${lines}</ul></div>`;
  }
  body.innerHTML = html;
  pendSyncDock();
}

/* ---------- acciones del panel ---------- */
function pendReadForm() {
  const v = id => { const el = $(id); return el ? el.value : ''; };
  const c = id => { const el = $(id); return !!(el && el.checked); };
  return {
    meals: PEND_MEAL_NAMES.map(name => ({ name, on: c('pc-on-' + name), time: v('pc-time-' + name) || '12:00' })),
    weightOn: c('pc-weight-on'), weightFreq: Number(v('pc-weight-freq')) || 7,
    trainOn: c('pc-train-on'), trainDays: [0, 1, 2, 3, 4, 5, 6].filter(d => c('pc-wd-' + d)),
    quietOn: c('pc-quiet-on'), quietFrom: v('pc-quiet-from') || '22:00', quietTo: v('pc-quiet-to') || '07:00',
    cutoff: v('pc-cutoff') || '04:00'
  };
}
{ const b = document.getElementById('btn-pend-config');
  if (b) b.onclick = () => { PEND_UI.configOpen = !PEND_UI.configOpen; renderPendings(); }; }
{ const b = document.getElementById('btn-toggle-pend');
  if (b) b.onclick = () => pendSetFloat(!PEND_UI.floatOpen); }
{ const c = document.getElementById('btn-pend-close');
  if (c) c.onclick = () => pendSetFloat(false); }
/* Cierre tocando fuera de la tarjeta (el botón del dock se excluye:
   su propio onclick ya alterna). */
document.addEventListener('click', e => {
  if (!PEND_UI.floatOpen) return;
  const f = $('pend-float'), b = $('btn-toggle-pend');
  if (f && f.contains(e.target)) return;
  if (b && b.contains(e.target)) return;
  pendSetFloat(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && PEND_UI.floatOpen) pendSetFloat(false); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { pendDockTick(); } catch {} } });
setInterval(() => { try { pendDockTick(); } catch {} }, 60000);
{ const body = document.getElementById('pend-body');
  if (body) {
    body.addEventListener('change', e => {
      const s = e.target.closest('[data-pend-snooze]');
      if (!s || !s.value) return;
      const res = pendSnoozeTarget(s.value, new Date());
      pendMark(s.dataset.pendSnooze, { st: 'snoozed', until: res.until, whenText: res.when, shifted: res.shifted, chosenHM: res.chosenHM, quietFrom: res.quietFrom, quietTo: res.quietTo });
    });
    body.addEventListener('click', async e => {
      const b = e.target.closest('[data-pend-act]');
      if (!b) return;
      const act = b.dataset.pendAct;
      if (act === 'confirm') {
        const first = !(PEND_CFG && PEND_CFG.activated);
        const cfg = Object.assign({}, PEND_CFG || {}, pendReadForm(), { activated: true });
        if (first || !cfg.activatedAt) cfg.activatedAt = pendRegDay(new Date(), cfg.cutoff);
        try { await pendSaveCfg(cfg); PEND_UI.configOpen = false; renderPendings(); toast(t(first ? 'pend.activatedOk' : 'pend.savedOk')); }
        catch { toast(t('pend.loadError'), true); }
      } else if (act === 'cancelcfg') {
        PEND_UI.configOpen = false; renderPendings();
      } else if (act === 'deactivate') {
        if (!confirm(t('pend.deactivateConfirm'))) return;
        try { await pendSaveCfg(Object.assign({}, PEND_CFG, { activated: false })); PEND_UI.configOpen = false; renderPendings(); toast(t('pend.offOk')); } catch {}
      } else if (act === 'omit') {
        pendMark(b.dataset.id, { st: 'omitted', at: todayISO() });
      } else if (act === 'discard') {
        if (!confirm(t('pend.discardConfirm'))) return;
        pendMark(b.dataset.id, { st: 'discarded', at: todayISO() });
      } else if (act === 'draft-discard') {
        if (!confirm(t('pend.draftDiscardConfirm'))) return;
        pendDraftClear(); renderPendings();
      } else if (act === 'draft-continue') {
        pendSetFloat(false);
        aiClearDraft(); repeatClear();
        const form = $('form-meal'); if (form) form.reset();
        pendDraftArm(); pendDraftRestore();
        aiOpenMealModal();
      } else if (act === 'go') {
        /* «Ir a…» navega fuera de la tarjeta: se cierra para dejar
           ver el destino (modal de comida/peso o sección expandida). */
        pendSetFloat(false);
        const type = b.dataset.type, date = b.dataset.date;
        if (type === 'meal') {
          aiClearDraft(); repeatClear();
          const form = $('form-meal'); if (form) form.reset();
          $('m-date').value = date;
          const sel = $('m-meal'); if (sel && [...sel.options].some(o => o.value === b.dataset.meal)) sel.value = b.dataset.meal;
          pendDraftArm();
          aiOpenMealModal();
        } else if (type === 'weight') {
          /* Redefinición 18:23: el peso lo ingresa el usuario, así
             que el pendiente vuelve a abrir el modal de pesaje (los
             porcentajes quedan según su permiso, como en el
             formulario). El pendiente sigue calculándose de los
             registros reales. */
          openWeightModal(null);
          $('w-date').value = date;
        } else if (type === 'training') {
          const c = $('train-content');
          if (c && c.style.display === 'none') { const tb = $('btn-toggle-train'); if (tb) tb.click(); }
          else if (c) { try { c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }
        } else if (type === 'eval') {
          const c = $('progress-content');
          if (c && c.style.display === 'none') { const pb = $('btn-toggle-progress'); if (pb) pb.click(); }
          const r = $('eval-root'); if (r) { try { r.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }
        } else if (type === 'energy') {
          /* El dato privado se aporta en «Permisos y privacidad»,
             sección de energía: se abre el panel si está cerrado y
             se desplaza hasta la tarjeta del propio cliente. */
          const pb = $('btn-perms');
          if (pb && !permsOpen) pb.click();
          const r = $('energy-section'); if (r) { try { r.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }
        }
      }
    });
  }
}
