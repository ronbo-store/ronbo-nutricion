/* Mi Nutrición — app privada multiusuario. Cada cuenta ve solo sus datos. */
import { initializeApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, collection, getDocs, addDoc,
  setDoc, deleteDoc, serverTimestamp, query, where,
} from "firebase/firestore";
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject,
} from "firebase/storage";

/* La apiKey se completa al subir el repo (copiar el bloque firebaseConfig
   del repo ronbo-store/ronbo-admin). Es la misma app Firebase. */
const firebaseConfig = {
  apiKey: "AIzaSyCGE8t2Rz_ty9fC3cRctoQ7pNEVlS2ow3w",
  authDomain: "ronbo-store-admin.firebaseapp.com",
  projectId: "ronbo-store-admin",
  storageBucket: "ronbo-store-admin.firebasestorage.app",
  messagingSenderId: "413083237162",
  appId: "1:413083237162:web:3a17f678a4377a026d3c53"
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
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MEAL_ORDER = { 'Desayuno': 1, 'Merienda': 2, 'Almuerzo': 3, 'Snack': 4, 'Cena': 5 };

let MEALS = {};   // fecha -> [{id, meal, food, qty, kcal, prot, carb, sugar, fat, notes}]
let WEIGHTS = []; // [{id, date, weight, fat, muscle, notes}]

const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });
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
  el.classList.add('show');
}
function dateName(iso) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${parseInt(m[3],10)} de ${MESES[parseInt(m[2],10)-1]} de ${m[1]}`;
}
function shortDate(iso) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${parseInt(m[3],10)}/${parseInt(m[2],10)}` : iso;
}
function todayISO() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
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
  const name = $('reg-name').value.trim(), email = $('reg-email').value.trim(), pw = $('reg-password').value;
  if (!name) { showRegError('Escribe tu nombre.'); return; }
  try {
    suppressAuthCheck = true;
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, email, role: 'user', isOwner: false, approved: false,
      goals: { ...DEFAULT_GOALS }, createdAt: serverTimestamp()
    });
    await signOut(auth);
    suppressAuthCheck = false;
    showRegError('');
    toast('Cuenta creada. El dueño debe aprobarla antes de que puedas entrar.', false);
    $('tab-login').click();
  } catch (err) {
    suppressAuthCheck = false;
    const code = err.code || '';
    showRegError(code.includes('email-already-in-use') ? 'Ese correo ya tiene cuenta. Entra con "Entrar".'
      : code.includes('weak-password') ? 'La contraseña debe tener al menos 6 caracteres.'
      : code.includes('invalid-email') ? 'El correo no es válido.'
      : 'No se pudo crear la cuenta. Intenta de nuevo.');
  }
});
$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  showAuthError('');
  $('auth-error').classList.remove('show');
  try {
    await signInWithEmailAndPassword(auth, $('login-email').value.trim(), $('login-password').value);
  } catch {
    showAuthError('Credenciales incorrectas.');
  }
});
$('btn-logout').addEventListener('click', e => { e.preventDefault(); signOut(auth); });

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
      showAuthError('Esta cuenta no tiene acceso.');
      return;
    }
    UDATA = snap.data();
    IS_OWNER = UDATA.isOwner === true;
    if (!IS_OWNER && UDATA.approved !== true) {
      await signOut(auth);
      showAuthError('Tu cuenta está pendiente de aprobación por el dueño.');
      return;
    }
    GOALS = { ...DEFAULT_GOALS, ...(UDATA.goals || {}) };
    $('import-wrap').style.display = IS_OWNER ? '' : 'none';
  } catch {
    await signOut(auth);
    showAuthError('No se pudo verificar el acceso.');
    return;
  }
  $('who').textContent = UDATA.name ? UDATA.name : user.email;
  setAvatar(UDATA.photoURL || '');
  $('auth-view').style.display = 'none';
  $('app-view').style.display = '';
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
        <button class="btn-primary btn-sm" data-approve="${u.id}">Aprobar</button>
        <button class="btn-ghost btn-sm" data-reject="${u.id}">Rechazar</button>
      </div>
    </div>`).join('') : '<div class="wempty">Sin solicitudes pendientes.</div>';
  $('users-list').innerHTML =
    owners.map(u => `
    <div class="user-row"><div>${u.photoURL ? `<img class="avatar sm" src="${esc(u.photoURL)}" alt="">` : ''}<b>${esc(u.name || '—')}</b> <span class="owner-badge">dueño</span><br><span class="muted">${esc(u.email || '')}</span></div>
    <div class="user-actions"><button class="btn-ghost btn-sm" data-goals="${u.id}">Metas</button></div></div>`).join('')
    + (active.length ? active.map(u => `
    <div class="user-row">
      <div>${u.photoURL ? `<img class="avatar sm" src="${esc(u.photoURL)}" alt="">` : ''}<b>${esc(u.name || '—')}</b><br><span class="muted">${esc(u.email || '')}</span></div>
      <div class="user-actions">
        <button class="btn-ghost btn-sm" data-goals="${u.id}">Metas</button>
        <button class="btn-ghost btn-sm" data-revoke="${u.id}">Quitar acceso</button>
      </div>
    </div>`).join('') : '<div class="wempty">Aún no hay usuarios aprobados.</div>');
  document.querySelectorAll('[data-goals]').forEach(b => b.onclick = () => {
    const u = ADMIN_USERS.find(x => x.id === b.dataset.goals);
    if (u) openGoals(u.id, u.name || u.email, u.goals);
  });
  document.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    await setDoc(doc(db, 'users', b.dataset.approve), { approved: true }, { merge: true });
    toast('Usuario aprobado.'); await loadAdmin();
  });
  document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Quitar el acceso a este usuario? No podrá volver a entrar.')) return;
    await setDoc(doc(db, 'users', b.dataset.revoke), { approved: false }, { merge: true });
    toast('Acceso retirado.'); await loadAdmin();
  });
  document.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Rechazar y eliminar esta solicitud?')) return;
    await deleteDoc(doc(db, 'users', b.dataset.reject));
    toast('Solicitud eliminada.'); await loadAdmin();
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
      if (v.ownerUid && num(v.weight) > 0) weights.push({ uid: v.ownerUid, date: v.date }); });
  } catch {}
  const lastByUid = {};
  weights.forEach(w => { if (!lastByUid[w.uid] || w.date > lastByUid[w.uid]) lastByUid[w.uid] = w.date; });
  const daysAgo = iso => iso ? Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5) : null;
  $('clients-list').innerHTML = clients.length ? clients.map(u => {
    const d = daysAgo(lastByUid[u.id]);
    const badge = u.approved === true
      ? (d === null ? '<span class="warn-badge">sin pesajes</span>'
        : d > 7 ? `<span class="warn-badge">hace ${d} días</span>` : `<span class="ok-badge">hace ${d} d</span>`)
      : '<span class="warn-badge">pendiente</span>';
    return `<div class="user-row">
      <div><b>${esc(u.name || '—')}</b> ${badge}<br><span class="muted">${esc(u.email || '')}</span></div>
      <div class="user-actions">${u.approved === true ? `<button class="btn-primary btn-sm" data-client="${u.id}">Ver registro</button>` : ''}</div>
    </div>`;
  }).join('') : '<div class="wempty">Aún no hay clientes registrados.</div>';
  $('client-detail').style.display = 'none'; $('client-detail').innerHTML = '';
  document.querySelectorAll('[data-client]').forEach(b => b.onclick = () => openClient(b.dataset.client));
}

async function openClient(uid) {
  const box = $('client-detail');
  let uname = 'Cliente';
  try {
    const s = await getDoc(doc(db, 'users', uid));
    if (s.exists()) uname = s.data().name || s.data().email || uname;
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
    <td><button class="btn-ghost btn-sm" data-c-edit="${d.id}">Editar</button></td></tr>`).join('');
  box.style.display = '';
  box.innerHTML = `
    <h3 class="history-title">Registro de peso · ${esc(uname)}</h3>
    <div style="margin-bottom:10px"><button class="btn-primary btn-sm" id="btn-client-add">＋ Agregar pesaje</button>
    <button class="btn-ghost btn-sm" id="btn-client-close" style="margin-left:8px">Cerrar</button></div>
    ${data.length ? weightChartSVG([...data].reverse()) : '<div class="wempty">Este cliente aún no sube su peso.</div>'}
    ${data.length ? `<div class="table-scroll"><table class="detail whist">
      <thead><tr><th>Fecha</th><th class="num">Peso (kg)</th><th class="num">Grasa %</th><th class="num">Músculo %</th><th class="num">Agua %</th><th class="num">Visc.</th><th>Notas</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : ''}`;
  $('btn-client-close').onclick = () => { box.style.display = 'none'; box.innerHTML = ''; };
  $('btn-client-add').onclick = () => openWeightModal({ uid, docId: null, rec: null });
  box.querySelectorAll('[data-c-edit]').forEach(b => b.onclick = () => {
    const rec = data.find(w => w.id === b.dataset.cEdit);
    if (rec) openWeightModal({ uid, docId: rec.id, rec });
  });
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================= METAS POR USUARIO (las establece el entrenador) ================= */
let goalsUid = null;
function openGoals(uid, name, goals) {
  goalsUid = uid;
  $('goals-modal-title').textContent = 'Metas · ' + name;
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
  const goals = { kcal: num($('g-kcal').value), prot: num($('g-prot').value), carb: num($('g-carb').value),
    azuc: num($('g-azuc').value), gras: num($('g-gras').value) };
  await setDoc(doc(db, 'users', goalsUid), { goals }, { merge: true });
  const mine = goalsUid === auth.currentUser.uid;
  goalsUid = null;
  $('goals-modal').style.display = 'none';
  toast('Metas actualizadas.');
  if (mine) { GOALS = { ...goals }; render($('dateSel').value); }
  await loadAdmin();
});

/* Para usuarios no-dueños, las consultas van filtradas por ownerUid:
   las reglas por-documento rechazan los listados sin filtro. */
function colQuery(name) {
  const c = collection(db, name);
  return IS_OWNER ? c : query(c, where('ownerUid', '==', auth.currentUser.uid));
}

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
  await loadAdmin();
  await loadClients();
  applyStorageFlag();
}

/* Oculta las opciones de foto mientras Storage no esté activado (plan Blaze). */
function applyStorageFlag() {
  if (STORAGE_READY) return;
  document.querySelectorAll('.photo-label').forEach(el => el.style.display = 'none');
  const pu = document.querySelector('.progress-uploads');
  if (pu) pu.innerHTML = '<div class="wempty">Las fotos de progreso se activarán próximamente.</div>';
}

function buildDateSelector() {
  const sel = $('dateSel');
  sel.innerHTML = '';
  const dates = Object.keys(MEALS).sort().reverse();
  const t = todayISO();
  if (!MEALS[t]) {
    const o = document.createElement('option');
    o.value = t; o.textContent = dateName(t) + ' (hoy)';
    sel.appendChild(o);
  }
  dates.forEach(d => {
    if (d === t) return;
    const o = document.createElement('option');
    o.value = d; o.textContent = dateName(d);
    sel.appendChild(o);
  });
  if (!dates.length) { const o = document.createElement('option'); o.value = t; o.textContent = dateName(t); sel.appendChild(o); }
  sel.value = t;
  sel.onchange = e => render(e.target.value);
  render(sel.value);
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
    if (!over) return `<div class="ring-box ok"><b>Te quedan</b>${fmt(diff)} g<br>(${Math.round((1-pct)*100)}% disponible)</div>`;
    return `<div class="ring-box over"><b>Excediste el límite</b>+${fmt(diff)} g<br>(${Math.round((pct-1)*100)}% por encima)</div>`;
  }
  if (!over) return `<div class="ring-box ok"><b>Te quedan</b>${fmt(diff)} ${m.unit}<br>(${Math.round((1-pct)*100)}% disponible)</div>`;
  return `<div class="ring-box over"><b>Excediste la meta</b>+${fmt(diff)} ${m.unit}<br>(${Math.round((pct-1)*100)}% por encima)</div>`;
}
function notesFor(t) {
  const n = [];
  const pc = t.kcal/GOALS.kcal, pp = t.prot/GOALS.prot, pb = t.carb/GOALS.carb, pa = t.azuc/GOALS.azuc, pg = t.gras/GOALS.gras;
  n.push(pc < 1 ? `🔥 Calorías dentro del rango; quedan ${fmt(GOALS.kcal - t.kcal)} kcal.` : `🔥 Calorías por encima de la meta (+${fmt(t.kcal - GOALS.kcal)} kcal).`);
  n.push(pp >= 1 ? `💪 Proteína por encima de la meta (+${fmt(t.prot - GOALS.prot)} g).` : pp >= .8 ? `💪 Proteína cerca de la meta (${Math.round(pp*100)}%).` : `💪 Proteína por debajo de la meta (${Math.round(pp*100)}%).`);
  n.push(pb >= 1 ? `🌾 Carbohidratos por encima de la meta (+${fmt(t.carb - GOALS.carb)} g).` : pb >= .7 ? `🌾 Carbohidratos cerca de la meta (${Math.round(pb*100)}%).` : `🌾 Carbohidratos por debajo de la meta (${Math.round(pb*100)}%).`);
  n.push(pa <= 1 ? `🍬 Azúcares dentro del límite (${fmt(t.azuc)} de ${GOALS.azuc} g).` : `🍬 Azúcares por encima del límite (+${fmt(t.azuc - GOALS.azuc)} g).`);
  n.push(pg <= 1 ? `🫀 Grasas dentro de la meta (${Math.round(pg*100)}%).` : pg <= 1.1 ? `🫀 Grasas ligeramente por encima de la meta (+${fmt(t.gras - GOALS.gras)} g).` : `🫀 Grasas por encima de la meta (+${fmt(t.gras - GOALS.gras)} g).`);
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
  if (url) { img.src = url; img.style.display = ''; }
  else { img.src = ''; img.style.display = 'none'; }
}
$('avatar').addEventListener('click', () => $('avatar-file').click());
$('avatar-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    toast('Subiendo foto…');
    const url = await compressAvatar(f);
    if (url.length > 400000) { toast('La imagen es muy pesada, prueba con otra.', true); return; }
    await setDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: url }, { merge: true });
    UDATA.photoURL = url;
    setAvatar(url);
    toast('Foto de perfil actualizada.');
  } catch { toast('No se pudo subir la foto.', true); }
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
    `<span>Calorías: <b>${fmt(GOALS.kcal)} kcal</b></span>` +
    `<span>Proteína: <b>${fmt(GOALS.prot)} g</b></span>` +
    `<span>Carbohidratos: <b>${fmt(GOALS.carb)} g</b></span>` +
    `<span>Azúcares: <b>≤ ${fmt(GOALS.azuc)} g</b></span>` +
    `<span>Grasas: <b>${fmt(GOALS.gras)} g</b></span>`;
  const t = totals(date);
  const vals = { kcal: t.kcal, prot: t.prot, carb: t.carb, azuc: t.azuc, gras: t.gras };
  $('rings').innerHTML = METRICS.map(m =>
    `<div class="ring-card"><h3>${m.icon} ${m.name}</h3>${ringSVG(m, vals[m.key])}${statusBox(m, vals[m.key])}</div>`
  ).join('');
  const rows = MEALS[date] || [];
  let html = rows.map(m =>
    `<tr><td>${esc(m.meal)}</td><td>${esc(m.food)}${m.photoURL ? ` <a href="${esc(m.photoURL)}" target="_blank" rel="noopener" title="Ver foto">📷</a>` : ''}</td><td>${esc(m.qty)}</td>` +
    `<td class="num">${fmt(m.kcal)}</td><td class="num">${fmt(m.prot)}</td><td class="num">${fmt(m.carb)}</td>` +
    `<td class="num">${fmt(m.sugar)}</td><td class="num">${fmt(m.fat)}</td>` +
    `<td><button class="del-btn" data-del-meal="${m.id}" title="Borrar">×</button></td></tr>`
  ).join('');
  html += `<tr class="total"><td colspan="3">TOTAL</td><td class="num" style="color:#16A34A">${fmt(t.kcal)}</td><td class="num" style="color:#2563EB">${fmt(t.prot)}</td><td class="num" style="color:#D97706">${fmt(t.carb)}</td><td class="num" style="color:#9333EA">${fmt(t.azuc)}</td><td class="num" style="color:#DC2626">${fmt(t.gras)}</td><td></td></tr>`;
  $('detailBody').innerHTML = html || `<tr><td colspan="9" class="wempty">Sin registros este día. Usa "＋ Registrar comida".</td></tr>`;
  const vsNames = { kcal:'Calorías', prot:'Proteína', carb:'Carbohidratos', azuc:'Azúcares', gras:'Grasas' };
  $('vsRows').innerHTML =
    `<div class="vsrow head"><span>Indicador</span><span>Consumo</span><span>Meta</span><span>Progreso</span><span></span></div>` +
    METRICS.map(m => {
      const v = vals[m.key], pct = GOALS[m.key] ? v / GOALS[m.key] : 0;
      const w = Math.min(pct, 1) * 100;
      return `<div class="vsrow"><span>${vsNames[m.key]}</span><span><b>${fmt(v)}</b></span><span>${fmt(GOALS[m.key])}</span><span class="bar-track"><div class="bar-fill" style="width:${w.toFixed(0)}%;background:${m.color}"></div></span><span>${Math.round(pct*100)}%</span></div>`;
    }).join('');
  const noteSet = [];
  rows.forEach(m => { if (m.notes) noteSet.push(`<b>${esc(m.meal)}:</b> ${esc(m.notes)}`); });
  $('notesList').innerHTML = notesFor(t).map(x => `<li>${x}</li>`).join('') + noteSet.map(x => `<li>${x}</li>`).join('');

  document.querySelectorAll('[data-del-meal]').forEach(b =>
    b.onclick = async () => {
      if (!confirm('¿Borrar este registro?')) return;
      const row = rows.find(r => r.id === b.dataset.delMeal);
      await deleteDoc(doc(db, 'nutrition_meals', b.dataset.delMeal));
      if (row && row.photoPath) { try { await deleteObject(sRef(storage, row.photoPath)); } catch {} }
      toast('Registro borrado.');
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
    ? `<g font-size="11"><circle cx="${P.l}" cy="10" r="4" fill="#0d9488"/><text x="${P.l + 8}" y="14" fill="#4b5563">Peso (kg)</text>
       <circle cx="${P.l + 110}" cy="10" r="4" fill="#A855F7"/><text x="${P.l + 118}" y="14" fill="#4b5563">Grasa (%)</text></g>` : '';
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:480px;display:block">${legend}${grid}
    <polyline points="${pts}" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round"/>${grasaLine}${grasaDots}${dots}</svg></div>`;
}

function renderWeight() {
  const body = $('weightBody');
  const data = WEIGHTS;
  if (!data.length) {
    body.innerHTML = `<div class="wempty">Aún no hay pesajes registrados.<br>Usa "＋ Registrar pesaje" cuando te peses — la gráfica se dibuja sola.</div>`;
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
    ? `<div class="weigh-reminder">⚠️ Llevas ${daysSince} días sin pesarte. Recuerda subir tu peso cada semana.</div>` : '';
  let grasaCard = '';
  if (last.fat > 0) {
    const dg = prev && prev.fat > 0 ? last.fat - prev.fat : 0;
    grasaCard = `<div class="wstat"><div class="lbl">GRASA CORPORAL</div><div class="val">${last.fat}<small> %</small></div>
      <div class="delta ${dCls(dg)}">${prev && prev.fat > 0 ? dTxt(dg).replace('kg','pp') : '—'}</div></div>`;
  }
  const delBtn = `<div style="text-align:center;margin-top:8px"><button class="btn-ghost btn-sm" id="btn-del-weight">Borrar último pesaje (${shortDate(last.date)})</button></div>`;
  const histRows = [...data].reverse().map(d => `
    <tr><td>${dateName(d.date)}</td><td class="num"><b>${d.weight}</b></td>
    <td class="num">${d.fat || '—'}</td><td class="num">${d.muscle || '—'}</td>
    <td class="num">${d.water || '—'}</td><td class="num">${d.visceral || '—'}</td>
    <td>${esc(d.notes)}</td>
    <td><button class="btn-ghost btn-sm" data-edit-weight="${d.id}">Editar</button></td></tr>`).join('');
  body.innerHTML = `
    ${reminder}
    <div class="wstats">
      <div class="wstat"><div class="lbl">PESO ACTUAL</div><div class="val">${last.weight}<small> kg</small></div>
        <div class="delta flat">${shortDate(last.date)}</div></div>
      <div class="wstat"><div class="lbl">VS PESAJE ANTERIOR</div><div class="val">${prev ? dTxt(dW).split(' ')[0] : '—'}<small> ${prev ? 'kg' : ''}</small></div>
        <div class="delta ${dCls(dW)}">${prev ? dTxt(dW) : 'primer registro'}</div></div>
      <div class="wstat"><div class="lbl">CAMBIO TOTAL</div><div class="val">${dT > 0 ? '+' : ''}${dT.toFixed(1)}<small> kg</small></div>
        <div class="delta ${dCls(dT)}">desde ${shortDate(first.date)} · ${data.length} pesaje${data.length > 1 ? 's' : ''}</div></div>
      ${grasaCard}
    </div>
    ${weightChartSVG(data)}
    <h3 class="history-title">Historial de pesajes</h3>
    <div class="table-scroll"><table class="detail whist">
      <thead><tr><th>Fecha</th><th class="num">Peso (kg)</th><th class="num">Grasa %</th><th class="num">Músculo %</th><th class="num">Agua %</th><th class="num">Visc.</th><th>Notas</th><th></th></tr></thead>
      <tbody>${histRows}</tbody>
    </table></div>
    ${delBtn}`;
  const dw = $('btn-del-weight');
  if (dw) dw.onclick = async () => {
    if (!confirm(`¿Borrar el pesaje del ${dateName(last.date)}?`)) return;
    await deleteDoc(doc(db, 'nutrition_weight', last.id));
    toast('Pesaje borrado.');
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
  return m ? `Semana ${parseInt(m[2], 10)} · ${m[1]}` : wid;
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
  $('progress-week-label').textContent = weekLabel(wid) + ' (esta semana)';
  const cur = PROGRESS[wid] || {};
  setSlot('front', cur.frontURL); setSlot('side', cur.sideURL);
  const hasF = !!cur.frontURL, hasS = !!cur.sideURL;
  $('progress-status').textContent = hasF && hasS ? '✅ Semana completa.'
    : (hasF || hasS) ? 'Te falta una foto esta semana.' : 'Aún no subes fotos esta semana.';
  const weeks = Object.keys(PROGRESS).filter(w => w !== wid).sort().reverse();
  $('progress-history').innerHTML = weeks.length ? weeks.map(w => {
    const p = PROGRESS[w];
    return `<div class="hist-week"><div class="hist-label">${weekLabel(w)}</div>
      <div class="hist-imgs">
        ${p.frontURL ? `<a href="${esc(p.frontURL)}" target="_blank" rel="noopener"><img src="${esc(p.frontURL)}" alt="Frente" loading="lazy"></a>` : '<span class="wempty">sin foto</span>'}
        ${p.sideURL ? `<a href="${esc(p.sideURL)}" target="_blank" rel="noopener"><img src="${esc(p.sideURL)}" alt="Lado" loading="lazy"></a>` : '<span class="wempty">sin foto</span>'}
      </div></div>`;
  }).join('') : '<div class="wempty">Tus semanas anteriores aparecerán aquí.</div>';
}
async function uploadProgressPhoto(which, file) {
  const wid = weekId();
  toast('Subiendo foto…');
  try {
    const path = `nutrition/${auth.currentUser.uid}/progress/${wid}-${which}.jpg`;
    const up = await uploadPhoto(file, path);
    const data = { ownerUid: auth.currentUser.uid, weekId: wid, updatedAt: serverTimestamp() };
    data[which === 'front' ? 'frontURL' : 'sideURL'] = up.url;
    data[which === 'front' ? 'frontPath' : 'sidePath'] = up.path;
    await setDoc(doc(db, 'nutrition_progress', `${auth.currentUser.uid}_${wid}`), data, { merge: true });
    toast('Foto guardada.');
    await loadProgress();
  } catch { toast('No se pudo subir la foto.', true); }
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
    kcal: num($('m-kcal').value), prot: num($('m-prot').value),
    carb: num($('m-carb').value), sugar: num($('m-sugar').value),
    fat: num($('m-fat').value), notes: $('m-notes').value.trim(),
    createdAt: serverTimestamp()
  };
  if (!data.date || !data.food) { toast('Faltan fecha o alimento.', true); return; }
  const photoFile = $('m-photo').files[0];
  if (photoFile) {
    try {
      toast('Subiendo foto…');
      const path = `nutrition/${auth.currentUser.uid}/meals/${Date.now()}.jpg`;
      const up = await uploadPhoto(photoFile, path);
      data.photoURL = up.url; data.photoPath = up.path;
    } catch (err) { toast('No se pudo subir la foto; se guarda sin foto.', true); }
  }
  await addDoc(collection(db, 'nutrition_meals'), data);
  $('meal-modal').style.display = 'none';
  e.target.reset();
  $('m-photo-preview').style.display = 'none'; $('m-photo-preview').src = '';
  toast('Comida registrada.');
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
  const data = { ownerUid: uid, date, weight: num($('w-weight').value), fat: num($('w-fat').value),
    muscle: num($('w-muscle').value), water: num($('w-water').value), visceral: num($('w-visceral').value),
    notes: $('w-notes').value.trim(), updatedAt: serverTimestamp() };
  if (!date || data.weight <= 0) { toast('Faltan fecha o peso válido.', true); return; }
  await setDoc(doc(db, 'nutrition_weight', docId), data);
  $('weight-modal').style.display = 'none';
  e.target.reset();
  const wasClient = weightCtx && weightCtx.uid !== auth.currentUser.uid;
  const clientUid = weightCtx && weightCtx.uid;
  weightCtx = null;
  toast('Pesaje registrado.');
  if (wasClient) await openClient(clientUid); else await loadAll();
});

/* ================= IMPORTAR CSV (una sola vez) ================= */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i+1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
$('import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const rows = parseCSV(await f.text());
    // "1.034" en la hoja significa 1034 (separador de miles)
    const numSmart = v => {
      let s = String(v || '').trim();
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      return num(s);
    };
    let n = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const fecha = (r[0] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      await addDoc(collection(db, 'nutrition_meals'), {
        ownerUid: auth.currentUser.uid,
        date: fecha, meal: (r[1]||'').trim(), food: (r[2]||'').trim(), qty: (r[3]||'').trim(),
        kcal: numSmart(r[4]), prot: numSmart(r[5]), carb: numSmart(r[6]),
        sugar: numSmart(r[9]), fat: numSmart(r[7]),
        notes: (r[8]||'').trim(), createdAt: serverTimestamp()
      });
      n++;
    }
    toast(`Importados ${n} registros.`);
    await loadAll();
  } catch (err) {
    toast('Error al importar: ' + err.message, true);
  }
  e.target.value = '';
});
