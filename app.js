/* ronbo.nutri — app privada multiusuario. Cada cuenta ve solo sus datos. */
import { initializeApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, deleteUser,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, collection, getDocs, addDoc,
  setDoc, deleteDoc, serverTimestamp, query, where,
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
/* Las fotos (comidas y progreso semanal) requieren Firebase Storage (plan Blaze).
   STORAGE_READY = false las oculta; cuando el dueño active Blaze, poner true y desplegar. */
const STORAGE_READY = false;

let UDATA = {};      // users/{uid}: {name, email, role, isOwner, approved}
let IS_OWNER = false;
let suppressAuthCheck = false; // evita el chequeo durante el registro (el doc aún se está creando)

const DEFAULT_GOALS = { kcal: 1900, prot: 170, carb: 185, azuc: 45, gras: 53 };
let GOALS = { ...DEFAULT_GOALS }; // el entrenador puede personalizarlas por usuario
const METRICS = [
  { key: 'kcal', name: 'CALORÍAS',     icon: '🔥', color: '#22C55E', unit: 'kcal' },
  { key: 'prot', name: 'PROTEÍNA',      icon: '💪', color: '#3B82F6', unit: 'g' },
  { key: 'carb', name: 'CARBOHIDRATOS', icon: '🌾', color: '#F59E0B', unit: 'g' },
  { key: 'azuc', name: 'AZÚCARES',      icon: '🍬', color: '#A855F7', unit: 'g', max: true },
  { key: 'gras', name: 'GRASAS',        icon: '🫀', color: '#EF4444', unit: 'g' },
];
const MEAL_ORDER = { 'Desayuno': 1, 'Merienda': 2, 'Almuerzo': 3, 'Snack': 4, 'Cena': 5 };

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
  'terms.accept': 'I have read and accept the privacy notice.',
  'terms.body': '<b>PRIVACY NOTICE AND CONSENT FOR THE PROCESSING OF PERSONAL DATA</b><br><br>When you create your account at <b>ronbo.nutri</b>, you agree to the following:<br><br><b>1. Controller.</b> ronbo.nutri is responsible for your data.<br><br><b>2. Data we collect.</b> Name, email, phone, sex/gender, social media (optional), health condition declaration, food logs, weight and body composition, profile, progress and food photos (for nutritional analysis), and your nutrition goals.<br><br><b>3. Purpose.</b> To provide personalized training and nutrition coaching services, track your progress, and communicate with you.<br><br><b>4. Storage.</b> Your data is stored securely in Google Firebase (United States), with restricted access: only you and your trainer can see it.<br><br><b>5. Your rights.</b> You may at any time request to view, correct, or delete your data. Deleting your account erases your records.<br><br><b>6. Retention.</b> We keep your data while you are a client and up to 2 years after your last activity, unless you request deletion sooner.<br><br><b>7. Minors.</b> This service is for adults 18 and older only.<br><br><b>8. Revocation.</b> You may withdraw your consent at any time by writing to your trainer; doing so will delete your data and close your account.<br><br><b>9. Health and exercise.</b> The trainer is an ISSA-certified fitness professional, not a medical professional. Consult your doctor before starting any exercise or nutrition program, especially if you declared a health condition.<br><br>By checking the box and creating your account, you declare that you read this notice and consent to the processing of your data for the purposes described.',
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
  'track.emptyDay': 'No entries this day. Use "{btn}".',
  'track.viewPhoto': 'View photo',
  'track.delete': 'Delete',
  'vs.indicator': 'Metric', 'vs.intake': 'Intake', 'vs.goal': 'Goal', 'vs.progress': 'Progress',
  'metric.kcal': 'CALORIES', 'metric.prot': 'PROTEIN', 'metric.carb': 'CARBS', 'metric.azuc': 'SUGAR', 'metric.gras': 'FAT',
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
  'progress.title': '📸 My progress',
  'progress.sub': '· weekly photo: front and side',
  'progress.hint': 'Upload your photos every week. They\'re private: only you see them. Anytime, ask your assistant to compare two weeks and tell you what change it notices.',
  'progress.week': 'This week',
  'progress.thisWeek': ' (this week)',
  'progress.front': 'Front',
  'progress.side': 'Side',
  'progress.upload': '＋ Upload photo',
  'progress.loading': 'Loading photos…',
  'progress.complete': '✅ Week complete.',
  'progress.missingOne': 'You\'re missing one photo this week.',
  'progress.none': 'You haven\'t uploaded photos this week.',
  'progress.noPhoto': 'no photo',
  'progress.history': 'Previous weeks',
  'progress.emptyHistory': 'Your previous weeks will appear here.',
  'mealhelp.title': '📷 Meal help',
  'mealhelp.hint': 'Don\'t know a food\'s nutrition values? Use the 📷 Take a photo button at the top and <b>let me know in the chat</b>: I\'ll analyze it and ask for the details I need (weight, cooking method).',
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
  'meal.photoHint': '📷 Don\'t know a food\'s values? Upload it in <b>📷 Meal help</b> and let me know in the chat so I can analyze it.',
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
  'err.pending': 'Your account is pending administrator approval.',
  'err.verifyFail': 'Couldn\'t verify access.',
  'err.badCreds': 'Incorrect credentials.',
  'err.tooHeavy': 'The image is too heavy, try another one.',
  'err.uploadFail': 'Couldn\'t upload the photo.',
  'err.mealMissing': 'Missing date or food.',
  'err.mealPhotoFail': 'Couldn\'t upload the photo; saved without photo.',
  'err.weightMissing': 'Missing date or valid weight.',
  'msg.accountCreated': 'Account created. The administrator must approve it before you can sign in.',
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
  'train.markDone': 'Mark as done today', 'train.doneToday': 'Done today ✓', 'train.undo': 'Undo',
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
  'form.dob': 'Date of birth', 'form.dobHint': '(to verify you are 18+; it is not stored)',
  'err.underage': 'You must be 18 or older to create an account.',
  'priv.title': '🔒 Privacy & Data',
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
  'priv.recentLogin': 'Your data was deleted, but Google needs a recent sign-in to delete the account itself: sign out, sign back in, and repeat the deletion. If you get stuck, ask your trainer.',
  'priv.working': 'Working…',
  'msg.photoSaved': 'Photo saved.',
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
  'terms.accept': 'He leído y acepto el aviso de privacidad.',
  'terms.body': '<b>AVISO DE PRIVACIDAD Y CONSENTIMIENTO PARA EL TRATAMIENTO DE DATOS PERSONALES</b><br><br>Al crear tu cuenta en <b>ronbo.nutri</b>, aceptas lo siguiente:<br><br><b>1. Responsable.</b> ronbo.nutri es responsable de tus datos.<br><br><b>2. Datos que recogemos.</b> Nombre, correo, teléfono, sexo/género, redes sociales (opcional), declaración de condiciones de salud, registros de alimentación, peso y composición corporal, fotos de perfil, de progreso y de alimentos (para análisis nutricional), y tus metas nutricionales.<br><br><b>3. Finalidad.</b> Prestar servicios de entrenamiento y asesoría nutricional personalizada, dar seguimiento a tu progreso y comunicarnos contigo.<br><br><b>4. Almacenamiento.</b> Tus datos se guardan de forma segura en Google Firebase (Estados Unidos), con acceso restringido: solo tú y tu entrenador pueden verlos.<br><br><b>5. Tus derechos.</b> Puedes pedir en cualquier momento ver, corregir o eliminar tus datos. Eliminar tu cuenta borra tus registros.<br><br><b>6. Conservación.</b> Guardamos tus datos mientras seas cliente y hasta 2 años después de tu última actividad, salvo que pidas eliminarlos antes.<br><br><b>7. Menores.</b> Este servicio es solo para personas mayores de 18 años.<br><br><b>8. Revocación.</b> Puedes retirar tu consentimiento en cualquier momento escribiendo a tu entrenador; al hacerlo se eliminarán tus datos y se cerrará tu cuenta.<br><br><b>9. Salud y ejercicio.</b> El entrenador es un profesional del fitness certificado (ISSA), no un profesional médico. Consulta a tu médico antes de iniciar cualquier programa de ejercicio o nutrición, especialmente si declaraste alguna condición de salud.<br><br>Al marcar la casilla y crear tu cuenta, declaras que leíste este aviso y das tu consentimiento para el tratamiento de tus datos con las finalidades descritas.',
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
  'track.emptyDay': 'Sin registros este día. Usa "{btn}".',
  'track.viewPhoto': 'Ver foto',
  'track.delete': 'Borrar',
  'vs.indicator': 'Indicador', 'vs.intake': 'Consumo', 'vs.goal': 'Meta', 'vs.progress': 'Progreso',
  'metric.kcal': 'CALORÍAS', 'metric.prot': 'PROTEÍNA', 'metric.carb': 'CARBOHIDRATOS', 'metric.azuc': 'AZÚCARES', 'metric.gras': 'GRASAS',
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
  'progress.title': '📸 Mi progreso',
  'progress.sub': '· foto semanal: frente y lado',
  'progress.hint': 'Sube tus fotos cada semana. Son privadas: solo tú las ves. Cuando quieras, pídele a tu asistente que compare dos semanas y te diga qué cambio nota.',
  'progress.week': 'Esta semana',
  'progress.thisWeek': ' (esta semana)',
  'progress.front': 'Frente',
  'progress.side': 'Lado',
  'progress.upload': '＋ Subir foto',
  'progress.loading': 'Cargando fotos…',
  'progress.complete': '✅ Semana completa.',
  'progress.missingOne': 'Te falta una foto esta semana.',
  'progress.none': 'Aún no subes fotos esta semana.',
  'progress.noPhoto': 'sin foto',
  'progress.history': 'Semanas anteriores',
  'progress.emptyHistory': 'Tus semanas anteriores aparecerán aquí.',
  'mealhelp.title': '📷 Ayuda con comidas',
  'mealhelp.hint': '¿No sabes los valores de un alimento? Usa el botón 📷 Tomar una foto de arriba y <b>avísame por el chat</b>: la analizo y te pregunto las medidas necesarias (peso, forma de cocción).',
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
  'meal.photoHint': '📷 ¿No sabes los valores de un alimento? Súbelo en <b>📷 Ayuda con comidas</b> y avísame por el chat para analizarlo.',
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
  'err.pending': 'Tu cuenta está pendiente de aprobación por el administrador.',
  'err.verifyFail': 'No se pudo verificar el acceso.',
  'err.badCreds': 'Credenciales incorrectas.',
  'err.tooHeavy': 'La imagen es muy pesada, prueba con otra.',
  'err.uploadFail': 'No se pudo subir la foto.',
  'err.mealMissing': 'Faltan fecha o alimento.',
  'err.mealPhotoFail': 'No se pudo subir la foto; se guarda sin foto.',
  'err.weightMissing': 'Faltan fecha o peso válido.',
  'msg.accountCreated': 'Cuenta creada. El administrador debe aprobarla antes de que puedas entrar.',
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
  'train.markDone': 'Marcar como hecho hoy', 'train.doneToday': 'Hecho hoy ✓', 'train.undo': 'Deshacer',
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
  'form.dob': 'Fecha de nacimiento', 'form.dobHint': '(para verificar que eres mayor de 18; no se guarda)',
  'err.underage': 'Debes tener 18 años o más para crear una cuenta.',
  'priv.title': '🔒 Privacidad y datos',
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
  'priv.recentLogin': 'Tus datos se eliminaron, pero Google necesita un inicio de sesión reciente para borrar la cuenta en sí: cierra sesión, vuelve a entrar y repite la eliminación. Si te atascas, pide ayuda a tu entrenador.',
  'priv.working': 'Procesando…',
  'msg.photoSaved': 'Foto guardada.',
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
  document.querySelectorAll('.lang-toggle button').forEach(b => b.classList.toggle('active', b.getAttribute('data-lang') === LANG));
  document.documentElement.lang = LANG;
  document.title = t('app.title');
  const mm = document.getElementById('m-meal');
  if (mm) mm.querySelectorAll('option').forEach(o => { o.textContent = mealName(o.value); });
  ['reg-gender','p-gender'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.querySelectorAll('option').forEach(o => { if (o.value) o.textContent = genderName(o.value); });
  });
  document.querySelectorAll('.reg-cond, .p-cond').forEach(c => {
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
  if (typeof auth !== 'undefined' && auth && auth.currentUser) refreshDynamic();
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
function showAuthError(msg) {
  const el = $('auth-error');
  el.textContent = msg;
  el.classList.remove('ok');
  el.classList.add('show');
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
};
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
  if (!$('reg-health-ok').checked) { showRegError(t('err.health')); return; }
  const age = ageOn($('reg-dob').value, todayISO());
  if (!(age >= 18 && age <= 120)) { showRegError(t('err.underage')); return; }
  const conditions = [...document.querySelectorAll('.reg-cond:checked')].map(c => c.value)
    .filter(v => v !== 'Ninguna de las anteriores');
  const healthDetail = $('reg-health-detail').value.trim();
  try {
    suppressAuthCheck = true;
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, email, phone, gender, social: social || '',
      role: 'user', isOwner: false, approved: false,
      goals: { ...DEFAULT_GOALS },
      health: { conditions, details: healthDetail, declaredAt: serverTimestamp() },
      acceptedTerms: true, termsVersion: 'v2-2026-10-14', termsAcceptedAt: serverTimestamp(),
      adultConfirmed: true, adultConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });
    await signOut(auth);
    suppressAuthCheck = false;
    showRegError('');
    toast(t('msg.accountCreated'), false);
    $('tab-login').click();
  } catch (err) {
    suppressAuthCheck = false;
    const code = err.code || '';
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
      await signOut(auth);
      showAuthError(t('err.noAccess'));
      return;
    }
    UDATA = snap.data();
    IS_OWNER = UDATA.isOwner === true;
    if (!IS_OWNER && UDATA.approved !== true) {
      await signOut(auth);
      showAuthError(t('err.pending'));
      return;
    }
    GOALS = { ...DEFAULT_GOALS, ...(UDATA.goals || {}) };
  } catch {
    await signOut(auth);
    showAuthError(t('err.verifyFail'));
    return;
  }
  $('who').textContent = UDATA.name ? UDATA.name : user.email;
  setAvatar(UDATA.photoURL || '');
  $('auth-view').style.display = 'none';
  $('app-view').style.display = '';
  $('main-tabs').style.display = IS_OWNER ? '' : 'none';
  switchTab('track');
  await loadAll();
});

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
        <button class="btn-ghost btn-sm" data-profile="${u.id}">${t('admin.profile')}</button>
        <button class="btn-ghost btn-sm" data-goals="${u.id}">${t('admin.goals')}</button>
        <button class="btn-ghost btn-sm" data-revoke="${u.id}">${t('admin.revoke')}</button>
      </div>
    </div>`).join('') : `<div class="wempty">${t('admin.noUsers')}</div>`);
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
}

/* ================= MIS CLIENTES (entrenador: ve y edita el peso semanal) ================= */
async function loadClients() {
  const sec = $('clients-section');
  if (!IS_OWNER) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  let users = [];
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach(d => users.push({ id: d.id, ...d.data() }));
  } catch { users = []; }
  const clients = users.filter(u => !u.isOwner);
  let weights = [];
  try {
    const ws = await getDocs(collection(db, 'nutrition_weight'));
    ws.forEach(d => { const v = d.data();
      if (v.ownerUid && num(v.weight) > 0) weights.push({ uid: v.ownerUid, date: v.date, weight: num(v.weight) }); });
  } catch {}
  const lastByUid = {}, lastWByUid = {};
  weights.forEach(w => { if (!lastByUid[w.uid] || w.date > lastByUid[w.uid]) { lastByUid[w.uid] = w.date; lastWByUid[w.uid] = w.weight; } });
  let pendingFood = {};
  try {
    const fs = await getDocs(collection(db, 'meal_help'));
    fs.forEach(d => { const v = d.data();
      if (v.status === 'pending' && v.ownerUid) pendingFood[v.ownerUid] = (pendingFood[v.ownerUid] || 0) + 1; });
  } catch {}
  const daysAgo = iso => iso ? Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5) : null;
  $('clients-list').innerHTML = clients.length ? clients.map(u => {
    const d = daysAgo(lastByUid[u.id]);
    const hasHealth = u.health && u.health.conditions && u.health.conditions.length > 0;
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

async function openClient(uid) {
  const box = $('client-detail');
  let uname = t('client.fallbackName'), uhealth = null;
  try {
    const s = await getDoc(doc(db, 'users', uid));
    if (s.exists()) { uname = s.data().name || s.data().email || uname; uhealth = s.data().health || null; }
  } catch {}
  const data = [];
  try {
    const ws = await getDocs(collection(db, 'nutrition_weight'));
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
  const healthAlert = (uhealth && uhealth.conditions && uhealth.conditions.length)
    ? `<div class="health-alert">🏥 <b>${t('client.healthDecl')}</b> ${esc(uhealth.conditions.map(condName).join(', '))}${uhealth.details ? '<br>' + esc(uhealth.details) : ''}</div>`
    : '';
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
    <div id="client-training"></div>`;
  $('btn-client-close').onclick = () => { box.style.display = 'none'; box.innerHTML = ''; };
  $('btn-client-add').onclick = () => openWeightModal({ uid, docId: null, rec: null });
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
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================= METAS POR USUARIO (las establece el entrenador) ================= */
let goalsUid = null;
function openGoals(uid, name, goals) {
  goalsUid = uid;
  $('goals-modal-title').textContent = t('goals.for', { name });
  const g = { ...DEFAULT_GOALS, ...(goals || {}) };
  $('g-kcal').value = g.kcal; $('g-prot').value = g.prot; $('g-carb').value = g.carb;
  $('g-azuc').value = g.azuc; $('g-gras').value = g.gras;
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
function openProfile(uid) {
  const u = ADMIN_USERS.find(x => x.id === uid);
  if (!u) return;
  profileUid = uid;
  $('profile-modal-title').textContent = t('profile.for', { name: u.name || u.email });
  $('p-name').value = u.name || '';
  $('p-phone').value = u.phone || '';
  $('p-gender').value = u.gender || '';
  $('p-social').value = u.social || '';
  $('p-notes').value = u.trainerNotes || '';
  const hconds = (u.health && u.health.conditions) || [];
  document.querySelectorAll('.p-cond').forEach(c => { c.checked = hconds.includes(c.value); });
  $('p-health-detail').value = (u.health && u.health.details) || '';
  $('profile-modal').style.display = '';
}
$('profile-cancel').onclick = () => { $('profile-modal').style.display = 'none'; profileUid = null; };
$('profile-modal').addEventListener('click', e => { if (e.target.id === 'profile-modal') { e.target.style.display = 'none'; profileUid = null; } });
$('form-profile').addEventListener('submit', async e => {
  e.preventDefault();
  if (!profileUid) return;
  await setDoc(doc(db, 'users', profileUid), {
    name: $('p-name').value.trim(), phone: $('p-phone').value.trim(),
    gender: $('p-gender').value, social: $('p-social').value.trim(),
    trainerNotes: $('p-notes').value.trim(),
    health: {
      conditions: [...document.querySelectorAll('.p-cond:checked')].map(c => c.value),
      details: $('p-health-detail').value.trim(),
      updatedAt: serverTimestamp()
    }
  }, { merge: true });
  profileUid = null;
  $('profile-modal').style.display = 'none';
  toast(t('msg.profileSaved'));
  await loadAdmin();
  await loadClients();
});

/* ================= DATA ================= */
async function loadAll() {
  MEALS = {};
  const ms = await getDocs(colQuery('nutrition_meals'));
  ms.forEach(d => {
    const v = d.data();
    const m = { id: d.id, meal: v.meal || '', food: v.food || '', qty: v.qty || '',
      kcal: num(v.kcal), prot: num(v.prot), carb: num(v.carb),
      sugar: num(v.sugar), fat: num(v.fat), notes: v.notes || '',
      photoURL: v.photoURL || '', photoPath: v.photoPath || '' };
    (MEALS[v.date] = MEALS[v.date] || []).push(m);
  });
  Object.values(MEALS).forEach(arr =>
    arr.sort((a, b) => (MEAL_ORDER[a.meal] || 9) - (MEAL_ORDER[b.meal] || 9)));

  WEIGHTS = [];
  const ws = await getDocs(colQuery('nutrition_weight'));
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
  renderPrivacy();
  await loadAdmin();
  await loadClients();
  applyStorageFlag();
}

/* Oculta las opciones de foto mientras Storage no esté activado (plan Blaze).
   En su lugar muestra una pista: la foto se usa solo para identificar el alimento por el chat. */
function applyStorageFlag() {
  if (STORAGE_READY) {
    document.querySelectorAll('.photo-hint').forEach(el => el.style.display = 'none');
    return;
  }
  document.querySelectorAll('.photo-label').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.photo-hint').forEach(el => el.style.display = '');
  const pu = document.querySelector('.progress-uploads');
  if (pu) pu.innerHTML = `<div class="wempty">${t('msg.storageSoon')}</div>`;
}

function buildDateSelector() {
  const sel = $('dateSel');
  sel.innerHTML = '';
  const dates = Object.keys(MEALS).sort().reverse();
  const hoy = todayISO();
  if (!MEALS[hoy]) {
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
  if (!dates.length) { const o = document.createElement('option'); o.value = hoy; o.textContent = dateName(hoy); sel.appendChild(o); }
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
  const days = weekDates(date);
  const dayNames = DAYNAMES[LANG] || DAYNAMES.en;
  const MAXP = 1.25;
  const series = METRICS.map(m => ({
    color: m.color, name: t('metric.' + m.key),
    pts: days.map(d => {
      const tot = totals(d);
      const g = GOALS[m.key] || 1;
      return Math.min((t[m.key] || 0) / g, MAXP);
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
  el.innerHTML = `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:520px;display:block">${legend}${grid}${highlight}${lines}${labels}</svg></div>
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
    </div>`).join('') : `<div class="wempty">${t('mealhelp.empty')}</div>`;
  const byId = id => items.find(x => x.id === id);
  box.querySelectorAll('[data-mh-view]').forEach(im => im.onclick = () => { const m = byId(im.dataset.mhView); if (m) showLightbox(m.photoURL); });
  box.querySelectorAll('[data-mh-del]').forEach(b => b.onclick = async () => {
    if (!confirm(t('confirm.delPhoto'))) return;
    await deleteDoc(doc(db, 'meal_help', b.dataset.mhDel));
    toast(t('msg.photoDeleted')); loadMealHelp();
  });
}
const mhFile = $('mealhelp-file');
if (mhFile) mhFile.addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    toast(t('mealhelp.uploading'));
    const url = await compressFoodPhoto(f);
    if (url.length > 700000) { toast(t('mealhelp.tooBig'), true); return; }
    await addDoc(collection(db, 'meal_help'), {
      ownerUid: auth.currentUser.uid, photoURL: url, status: 'pending', createdAt: serverTimestamp()
    });
    toast(t('mealhelp.uploaded'));
    loadMealHelp();
  } catch { toast(t('mealhelp.uploadFail'), true); }
});

/* ================= PRIVACIDAD Y DATOS (cliente) =================
   Nota: si en el futuro se activa Firebase Storage (Blaze), la eliminación
   debe borrar también los objetos de Storage referenciados en photoPath. */
function renderPrivacy() {
  const st = $('privacy-status');
  if (!st) return;
  let when = '';
  try { if (UDATA.termsAcceptedAt && UDATA.termsAcceptedAt.toDate) when = UDATA.termsAcceptedAt.toDate().toLocaleDateString(LANG === 'es' ? 'es-MX' : 'en-US'); } catch {}
  let html = UDATA.acceptedTerms
    ? `<p class="progress-hint">${t('priv.statusAccepted', { v: esc(UDATA.termsVersion || ''), date: esc(when) })}</p>`
    : `<p class="progress-hint">${t('priv.statusNone')}</p>`;
  if (UDATA.consentWithdrawnAt) html += `<p class="progress-hint">${t('priv.statusWithdrawn')}</p>`;
  st.innerHTML = html;
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
      snap.forEach(d => out[name].push({ id: d.id, data: d.data() }));
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
$('btn-view-notice') && $('btn-view-notice').addEventListener('click', () => {
  const n = $('privacy-notice');
  if (n.style.display === 'none') { n.innerHTML = t('terms.body'); n.style.display = ''; }
  else n.style.display = 'none';
});
$('btn-my-data') && $('btn-my-data').addEventListener('click', async () => {
  if (!auth.currentUser) return;
  toast(t('priv.working'));
  const uid = auth.currentUser.uid;
  const mine = await fetchMyDocs(uid);
  const plain = {};
  for (const [name] of MY_DATA_COLLECTIONS) plain[name] = mine[name].map(x => ({ id: x.id, ...x.data }));
  const payload = { exportedAt: new Date().toISOString(), profile: { ...UDATA }, ...plain };
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
  await setDoc(doc(db, 'users', auth.currentUser.uid),
    { consentWithdrawnAt: serverTimestamp(), acceptedTerms: false, approved: false }, { merge: true });
  toast(t('priv.withdrawn'));
  await signOut(auth);
});
$('btn-delete-account') && $('btn-delete-account').addEventListener('click', async () => {
  if (!auth.currentUser) return;
  if (!confirm(t('priv.deleteConfirm'))) return;
  if (!confirm(t('priv.deleteConfirm'))) return;
  const user = auth.currentUser;
  const uid = user.uid;
  toast(t('priv.working'));
  const mine = await fetchMyDocs(uid);
  for (const [name] of MY_DATA_COLLECTIONS)
    for (const x of mine[name]) { try { await deleteDoc(doc(db, name, x.id)); } catch {} }
  try { await deleteDoc(doc(db, 'users', uid)); } catch {}
  try {
    await deleteUser(user);
    toast(t('priv.deleted'));
  } catch (err) {
    if (err && err.code === 'auth/requires-recent-login') { toast(t('priv.recentLogin'), true); await signOut(auth); }
    else toast(t('priv.deleted'));
  }
});

/* ================= PLANES DE ENTRENAMIENTO (v1) =================
   training_plans { clientUid, title, notes, days: [{ label, exercises: [{ name, sets, reps, note }] }], active, createdBy, createdAt, updatedAt }
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
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  } catch {}
  out.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
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

/* --- Vista del cliente: su plan activo y registro de sesiones --- */
async function loadMyTraining() {
  const box = $('my-training');
  if (!box || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const plans = await fetchPlans(uid);
  const plan = plans.find(p => p.active === true) || null;
  if (!plan) { box.innerHTML = `<div class="wempty">${t('train.none')}</div>`; return; }
  const logs = (await fetchLogs(uid)).filter(l => l.planId === plan.id);
  const today = todayISO();
  const weekStart = mondayISO(today);
  const doneToday = new Set(logs.filter(l => l.date === today).map(l => l.dayIndex));
  const weekCount = logs.filter(l => l.date >= weekStart && l.date <= today).length;
  box.innerHTML = `
    <h3 class="history-title">${esc(plan.title || '')}</h3>
    ${plan.notes ? `<p class="progress-hint">${esc(plan.notes)}</p>` : ''}
    <p class="progress-hint">${t('train.weekDone', { n: weekCount })}</p>
    ${(plan.days || []).map((day, di) => {
      const label = day.label || ('Día ' + (di + 1));
      const done = doneToday.has(di);
      return `<div class="train-day"><h4>${esc(label)}</h4>${trainExercisesHTML(day)}
        <div style="margin-top:8px">${done
          ? `<span class="ok-badge">${t('train.doneToday')}</span> <button class="btn-ghost btn-sm" data-train-undo="${di}">${t('train.undo')}</button>`
          : `<button class="btn-primary btn-sm" data-train-done="${di}">${t('train.markDone')}</button>`}</div>
      </div>`;
    }).join('')}`;
  box.querySelectorAll('[data-train-done]').forEach(b => b.onclick = async () => {
    const di = Number(b.dataset.trainDone);
    const day = (plan.days || [])[di] || {};
    await setDoc(doc(db, 'training_logs', `${uid}_${plan.id}_${today}_${di}`),
      { clientUid: uid, planId: plan.id, date: today, dayIndex: di, dayLabel: day.label || '', done: true, updatedAt: serverTimestamp() });
    loadMyTraining();
  });
  box.querySelectorAll('[data-train-undo]').forEach(b => b.onclick = async () => {
    await deleteDoc(doc(db, 'training_logs', `${uid}_${plan.id}_${today}_${Number(b.dataset.trainUndo)}`));
    loadMyTraining();
  });
}

/* --- Vista del entrenador (dentro del detalle del cliente) --- */
async function loadClientTraining(uid) {
  const box = $('client-training');
  if (!box) return;
  const plans = await fetchPlans(uid);
  const logs = await fetchLogs(uid);
  const planRows = plans.length ? plans.map(p => `
    <div class="user-row"><div><b>${esc(p.title || '')}</b>${p.active === true ? ` <span class="ok-badge">${t('train.activeBadge')}</span>` : ''}<br><span class="muted">${t('train.daysCount', { n: (p.days || []).length })} · ${t('train.exCount', { n: (p.days || []).reduce((n, d) => n + (d.exercises || []).length, 0) })}</span></div>
    <div class="user-actions">
      <button class="btn-ghost btn-sm" data-plan-edit="${p.id}">${t('client.edit')}</button>
      <button class="btn-ghost btn-sm" data-plan-toggle="${p.id}">${p.active === true ? t('train.deactivate') : t('train.activate')}</button>
      <button class="btn-ghost btn-sm" data-plan-del="${p.id}">${t('train.delete')}</button>
    </div></div>`).join('') : `<div class="wempty">${t('train.noPlan')}</div>`;
  const logRows = logs.slice(0, 8).map(l => `<div class="train-ex"><span>${esc(l.dayLabel || '')}</span><span class="sx">${dateName(l.date)} ✓</span></div>`).join('');
  box.innerHTML = `
    <h3 class="history-title">${t('train.section')}</h3>
    <div style="margin-bottom:10px"><button class="btn-primary btn-sm" id="btn-plan-new">${t('train.new')}</button></div>
    ${planRows}
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
}

/* --- Editor de planes (entrenador) --- */
let planCtx = null;
function wirePlanExDel(scope) { scope.querySelectorAll('.pl-ex-del').forEach(b => b.onclick = () => b.closest('.pl-ex-row').remove()); }
function planExRow(ex) {
  ex = ex || {};
  return `<div class="pl-ex-row">
    <input type="text" class="pl-ex-name" placeholder="${t('train.f.exPh')}" value="${esc(ex.name || '')}">
    <input type="text" class="pl-ex-sets" placeholder="${t('train.f.setsPh')}" value="${esc(ex.sets || '')}">
    <input type="text" class="pl-ex-reps" placeholder="${t('train.f.repsPh')}" value="${esc(ex.reps || '')}">
    <input type="text" class="pl-ex-note" placeholder="${t('train.f.notePh')}" value="${esc(ex.note || '')}">
    <button type="button" class="btn-ghost btn-sm pl-ex-del" title="${t('train.f.remove')}">×</button>
  </div>`;
}
function planDayRow(day) {
  day = day || { label: '', exercises: [{}] };
  const wrap = document.createElement('div');
  wrap.className = 'pl-day';
  wrap.innerHTML = `
    <div class="frow"><label style="flex:1"><input type="text" class="pl-day-label" placeholder="${t('train.f.dayPh')}" value="${esc(day.label || '')}"></label>
    <button type="button" class="btn-ghost btn-sm pl-day-del">${t('train.f.remove')}</button></div>
    <div class="pl-exs">${(day.exercises && day.exercises.length ? day.exercises : [{}]).map(planExRow).join('')}</div>
    <button type="button" class="btn-ghost btn-sm pl-ex-add">${t('train.f.addEx')}</button>`;
  wrap.querySelector('.pl-day-del').onclick = () => wrap.remove();
  wrap.querySelector('.pl-ex-add').onclick = () => {
    const d = document.createElement('div'); d.innerHTML = planExRow({});
    wrap.querySelector('.pl-exs').appendChild(d.firstElementChild); wirePlanExDel(wrap);
  };
  wirePlanExDel(wrap);
  return wrap;
}
function openPlanEditor(clientUid, plan) {
  planCtx = { clientUid, planId: plan ? plan.id : null };
  $('pl-title').value = plan ? (plan.title || '') : '';
  $('pl-notes').value = plan ? (plan.notes || '') : '';
  $('pl-active').checked = plan ? plan.active === true : true;
  const daysBox = $('pl-days'); daysBox.innerHTML = '';
  const days = plan && plan.days && plan.days.length ? plan.days : [{ label: '', exercises: [{}] }];
  days.forEach(d => daysBox.appendChild(planDayRow(d)));
  $('plan-modal').style.display = '';
}
$('pl-add-day').onclick = () => $('pl-days').appendChild(planDayRow(null));
$('plan-cancel').onclick = () => { $('plan-modal').style.display = 'none'; planCtx = null; };
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
      exercises.push({ name, sets: r.querySelector('.pl-ex-sets').value.trim(), reps: r.querySelector('.pl-ex-reps').value.trim(), note: r.querySelector('.pl-ex-note').value.trim() });
    });
    if (exercises.length) days.push({ label, exercises });
  });
  const title = $('pl-title').value.trim();
  if (!title || !days.length) { toast(t('train.err'), true); return; }
  const active = $('pl-active').checked;
  const data = { clientUid: planCtx.clientUid, title, notes: $('pl-notes').value.trim(), days, active, updatedAt: serverTimestamp() };
  let planId = planCtx.planId;
  if (planId) {
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
  toast(t('train.saved'));
  if ($('client-training')) loadClientTraining(cuid);
  if (cuid === auth.currentUser.uid) loadMyTraining();
});

/* ================= PESTAÑAS PRINCIPALES ================= */
function switchTab(name) {
  document.querySelectorAll('.main-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => { p.style.display = (p.id === 'tab-' + name) ? '' : 'none'; });
  if (IS_OWNER && name === 'access') loadAdmin();
  if (IS_OWNER && name === 'clients') loadClients();
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
  const pct = GOALS[m.key] ? val / GOALS[m.key] : 0;
  const shown = Math.min(pct, 1);
  const C = 2 * Math.PI * 62;
  const dash = (shown * C).toFixed(1);
  return `<svg class="ring-svg" viewBox="0 0 150 150">
    <circle cx="75" cy="75" r="62" fill="none" stroke="#E9ECEF" stroke-width="16"/>
    <circle cx="75" cy="75" r="62" fill="none" stroke="${m.color}" stroke-width="16"
      stroke-linecap="round" stroke-dasharray="${dash} ${C.toFixed(1)}"
      transform="rotate(-90 75 75)"/>
    <text x="75" y="70" text-anchor="middle" font-size="26" font-weight="800" fill="${m.color}">${Math.round(pct*100)}%</text>
    <text x="75" y="92" text-anchor="middle" font-size="12" fill="#6b7280">${fmt(val)} / ${fmt(GOALS[m.key])}</text>
    <text x="75" y="108" text-anchor="middle" font-size="11" fill="#9ca3af">${m.unit}</text>
  </svg>`;
}
function statusBox(m, val) {
  const pct = GOALS[m.key] ? val / GOALS[m.key] : 0;
  const over = pct >= 1;
  const diff = Math.abs(val - GOALS[m.key]);
  if (m.max) {
    if (!over) return `<div class="ring-box ok"><b>${t('status.left')}</b>${fmt(diff)} g<br>(${Math.round((1-pct)*100)}% ${t('status.available')})</div>`;
    return `<div class="ring-box over"><b>${t('status.overLimit')}</b>+${fmt(diff)} g<br>(${Math.round((pct-1)*100)}% ${t('status.above')})</div>`;
  }
  if (!over) return `<div class="ring-box ok"><b>${t('status.left')}</b>${fmt(diff)} ${m.unit}<br>(${Math.round((1-pct)*100)}% ${t('status.available')})</div>`;
  return `<div class="ring-box over"><b>${t('status.overGoal')}</b>+${fmt(diff)} ${m.unit}<br>(${Math.round((pct-1)*100)}% ${t('status.above')})</div>`;
}
function notesFor(t) {
  const n = [];
  const pc = t.kcal/GOALS.kcal, pp = t.prot/GOALS.prot, pb = t.carb/GOALS.carb, pa = t.azuc/GOALS.azuc, pg = t.gras/GOALS.gras;
  n.push(pc < 1 ? t('note.kcalIn', { left: fmt(GOALS.kcal - t.kcal) }) : t('note.kcalOver', { over: fmt(t.kcal - GOALS.kcal) }));
  n.push(pp >= 1 ? t('note.protOver', { over: fmt(t.prot - GOALS.prot) }) : pp >= .8 ? t('note.protNear', { pct: Math.round(pp*100) }) : t('note.protUnder', { pct: Math.round(pp*100) }));
  n.push(pb >= 1 ? t('note.carbOver', { over: fmt(t.carb - GOALS.carb) }) : pb >= .7 ? t('note.carbNear', { pct: Math.round(pb*100) }) : t('note.carbUnder', { pct: Math.round(pb*100) }));
  n.push(pa <= 1 ? t('note.sugarIn', { v: fmt(t.azuc), g: GOALS.azuc }) : t('note.sugarOver', { over: fmt(t.azuc - GOALS.azuc) }));
  n.push(pg <= 1 ? t('note.fatIn', { pct: Math.round(pg*100) }) : pg <= 1.1 ? t('note.fatSlight', { over: fmt(t.gras - GOALS.gras) }) : t('note.fatOver', { over: fmt(t.gras - GOALS.gras) }));
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

function render(date) {
  $('dateTitle').textContent = dateName(date);
  $('goals-row').innerHTML =
    `<span>${t('metric.kcal')}: <b>${fmt(GOALS.kcal)} kcal</b></span>` +
    `<span>${t('metric.prot')}: <b>${fmt(GOALS.prot)} g</b></span>` +
    `<span>${t('metric.carb')}: <b>${fmt(GOALS.carb)} g</b></span>` +
    `<span>${t('metric.azuc')}: <b>≤ ${fmt(GOALS.azuc)} g</b></span>` +
    `<span>${t('metric.gras')}: <b>${fmt(GOALS.gras)} g</b></span>`;
  const tot = totals(date);
  const vals = { kcal: tot.kcal, prot: tot.prot, carb: tot.carb, azuc: tot.azuc, gras: tot.gras };
  $('rings').innerHTML = METRICS.map(m =>
    `<div class="ring-card"><h3>${m.icon} ${t('metric.' + m.key)}</h3>${ringSVG(m, vals[m.key])}${statusBox(m, vals[m.key])}</div>`
  ).join('');
  renderWeekChart(date);
  const rows = MEALS[date] || [];
  let html = rows.map(m =>
    `<tr><td>${esc(mealName(m.meal))}</td><td>${esc(m.food)}${m.photoURL ? ` <a href="${esc(m.photoURL)}" target="_blank" rel="noopener" title="${t('track.viewPhoto')}">📷</a>` : ''}</td><td>${esc(m.qty)}</td>` +
    `<td class="num">${fmt(m.kcal)}</td><td class="num">${fmt(m.prot)}</td><td class="num">${fmt(m.carb)}</td>` +
    `<td class="num">${fmt(m.sugar)}</td><td class="num">${fmt(m.fat)}</td>` +
    `<td><button class="del-btn" data-del-meal="${m.id}" title="${t('track.delete')}">×</button></td></tr>`
  ).join('');
  html += `<tr class="total"><td colspan="3">TOTAL</td><td class="num" style="color:#16A34A">${fmt(tot.kcal)}</td><td class="num" style="color:#2563EB">${fmt(tot.prot)}</td><td class="num" style="color:#D97706">${fmt(tot.carb)}</td><td class="num" style="color:#9333EA">${fmt(tot.azuc)}</td><td class="num" style="color:#DC2626">${fmt(tot.gras)}</td><td></td></tr>`;
  $('detailBody').innerHTML = html || `<tr><td colspan="9" class="wempty">${t('track.emptyDay', { btn: t('track.addMeal') })}</td></tr>`;
  $('vsRows').innerHTML =
    `<div class="vsrow head"><span>${t('vs.indicator')}</span><span>${t('vs.intake')}</span><span>${t('vs.goal')}</span><span>${t('vs.progress')}</span><span></span></div>` +
    METRICS.map(m => {
      const v = vals[m.key], pct = GOALS[m.key] ? v / GOALS[m.key] : 0;
      const w = Math.min(pct, 1) * 100;
      return `<div class="vsrow"><span>${t('metric.' + m.key)}</span><span><b>${fmt(v)}</b></span><span>${fmt(GOALS[m.key])}</span><span class="bar-track"><div class="bar-fill" style="width:${w.toFixed(0)}%;background:${m.color}"></div></span><span>${Math.round(pct*100)}%</span></div>`;
    }).join('');
  const noteSet = [];
  rows.forEach(m => { if (m.notes) noteSet.push(`<b>${esc(mealName(m.meal))}:</b> ${esc(m.notes)}`); });
  $('notesList').innerHTML = notesFor(t).map(x => `<li>${x}</li>`).join('') + noteSet.map(x => `<li>${x}</li>`).join('');

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
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:480px;display:block">${legend}${grid}
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

/* ================= MI PROGRESO (fotos semanales frente/lado) ================= */
function weekId(d) {
  const dt = d ? new Date(d + 'T12:00:00') : new Date();
  const day = (dt.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(dt); monday.setDate(dt.getDate() - day);
  const year = monday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week1 = new Date(jan4); week1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = Math.round((monday - week1) / (7 * 24 * 3600 * 1000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}
function weekLabel(wid) {
  const m = String(wid).match(/(\d{4})-W(\d{2})/);
  return m ? t('date.weekLabel', { n: parseInt(m[2], 10), y: m[1] }) : wid;
}
let PROGRESS = {}; // weekId -> doc
async function loadProgress() {
  PROGRESS = {};
  try {
    const snap = await getDocs(colQuery('nutrition_progress'));
    snap.forEach(d => { const v = d.data(); if (v.weekId) PROGRESS[v.weekId] = { id: d.id, ...v }; });
  } catch { /* sin acceso o sin docs */ }
  renderProgress();
}
function setSlot(which, url) {
  const img = $('preview-' + which), empty = $('empty-' + which);
  if (url) { img.src = url; img.style.display = 'block'; empty.style.display = 'none'; }
  else { img.src = ''; img.style.display = 'none'; empty.style.display = ''; }
}
function renderProgress() {
  const wid = weekId();
  $('progress-week-label').textContent = weekLabel(wid) + t('progress.thisWeek');
  const cur = PROGRESS[wid] || {};
  setSlot('front', cur.frontURL); setSlot('side', cur.sideURL);
  const hasF = !!cur.frontURL, hasS = !!cur.sideURL;
  $('progress-status').textContent = hasF && hasS ? t('progress.complete')
    : (hasF || hasS) ? t('progress.missingOne') : t('progress.none');
  const weeks = Object.keys(PROGRESS).filter(w => w !== wid).sort().reverse();
  $('progress-history').innerHTML = weeks.length ? weeks.map(w => {
    const p = PROGRESS[w];
    return `<div class="hist-week"><div class="hist-label">${weekLabel(w)}</div>
      <div class="hist-imgs">
        ${p.frontURL ? `<a href="${esc(p.frontURL)}" target="_blank" rel="noopener"><img src="${esc(p.frontURL)}" alt="${t('progress.front')}" loading="lazy"></a>` : `<span class="wempty">${t('progress.noPhoto')}</span>`}
        ${p.sideURL ? `<a href="${esc(p.sideURL)}" target="_blank" rel="noopener"><img src="${esc(p.sideURL)}" alt="${t('progress.side')}" loading="lazy"></a>` : `<span class="wempty">${t('progress.noPhoto')}</span>`}
      </div></div>`;
  }).join('') : `<div class="wempty">${t('progress.emptyHistory')}</div>`;
}
async function uploadProgressPhoto(which, file) {
  const wid = weekId();
  toast(t('msg.uploading'));
  try {
    const path = `nutrition/${auth.currentUser.uid}/progress/${wid}-${which}.jpg`;
    const up = await uploadPhoto(file, path);
    const data = { ownerUid: auth.currentUser.uid, weekId: wid, updatedAt: serverTimestamp() };
    data[which === 'front' ? 'frontURL' : 'sideURL'] = up.url;
    data[which === 'front' ? 'frontPath' : 'sidePath'] = up.path;
    await setDoc(doc(db, 'nutrition_progress', `${auth.currentUser.uid}_${wid}`), data, { merge: true });
    toast(t('msg.photoSaved'));
    await loadProgress();
  } catch { toast(t('msg.uploadFail'), true); }
}
$('photo-front').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadProgressPhoto('front', f); });
$('photo-side').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadProgressPhoto('side', f); });

/* ================= FORMULARIOS ================= */
$('btn-add-meal').onclick = () => { $('m-date').value = $('dateSel').value || todayISO(); $('meal-modal').style.display = ''; };
$('meal-cancel').onclick = () => $('meal-modal').style.display = 'none';
$('meal-modal').addEventListener('click', e => { if (e.target.id === 'meal-modal') e.target.style.display = 'none'; });

$('m-photo').addEventListener('change', e => {
  const f = e.target.files[0];
  const prev = $('m-photo-preview');
  if (f) { prev.src = URL.createObjectURL(f); prev.style.display = 'block'; }
  else { prev.src = ''; prev.style.display = 'none'; }
});

$('form-meal').addEventListener('submit', async e => {
  e.preventDefault();
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
  const photoFile = $('m-photo').files[0];
  if (photoFile) {
    try {
      toast(t('msg.uploading'));
      const path = `nutrition/${auth.currentUser.uid}/meals/${Date.now()}.jpg`;
      const up = await uploadPhoto(photoFile, path);
      data.photoURL = up.url; data.photoPath = up.path;
    } catch (err) { toast(t('err.mealPhotoFail'), true); }
  }
  await addDoc(collection(db, 'nutrition_meals'), data);
  $('meal-modal').style.display = 'none';
  e.target.reset();
  $('m-photo-preview').style.display = 'none'; $('m-photo-preview').src = '';
  toast(t('msg.mealSaved'));
  await loadAllKeepDate(data.date);
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
  const data = { ownerUid: uid, date, weight: num($('w-weight').value), fat: Math.max(0, num($('w-fat').value)),
    muscle: Math.max(0, num($('w-muscle').value)), water: Math.max(0, num($('w-water').value)), visceral: Math.max(0, num($('w-visceral').value)),
    notes: $('w-notes').value.trim(), updatedAt: serverTimestamp() };
  if (!date || data.weight <= 0) { toast(t('err.weightMissing'), true); return; }
  await setDoc(doc(db, 'nutrition_weight', docId), data);
  $('weight-modal').style.display = 'none';
  e.target.reset();
  const wasClient = weightCtx && weightCtx.uid !== auth.currentUser.uid;
  const clientUid = weightCtx && weightCtx.uid;
  weightCtx = null;
  toast(t('msg.weightSaved'));
  if (wasClient) await openClient(clientUid); else await loadAll();
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
