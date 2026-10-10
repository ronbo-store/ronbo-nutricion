/* Mi Nutrición — app privada. Solo el dueño (isOwner) puede entrar y ver datos. */
import { initializeApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, collection, getDocs, addDoc,
  setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";

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

const GOALS = { kcal: 1900, prot: 170, carb: 185, azuc: 45, gras: 53 };
const METRICS = [
  { key: 'kcal', name: 'CALORÍAS',     icon: '🔥', color: '#22C55E', unit: 'kcal', goal: GOALS.kcal },
  { key: 'prot', name: 'PROTEÍNA',      icon: '💪', color: '#3B82F6', unit: 'g',    goal: GOALS.prot },
  { key: 'carb', name: 'CARBOHIDRATOS', icon: '🌾', color: '#F59E0B', unit: 'g',    goal: GOALS.carb },
  { key: 'azuc', name: 'AZÚCARES',      icon: '🍬', color: '#A855F7', unit: 'g',    goal: GOALS.azuc, max: true },
  { key: 'gras', name: 'GRASAS',        icon: '🫀', color: '#EF4444', unit: 'g',    goal: GOALS.gras },
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

/* ================= AUTH (solo dueño) ================= */
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
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const isOwner = snap.exists() && snap.data().isOwner === true;
    if (!isOwner) {
      await signOut(auth);
      showAuthError('Esta cuenta no tiene acceso.');
      return;
    }
  } catch {
    await signOut(auth);
    showAuthError('No se pudo verificar el acceso.');
    return;
  }
  $('who').textContent = user.email;
  $('auth-view').style.display = 'none';
  $('app-view').style.display = '';
  await loadAll();
});

/* ================= DATA ================= */
async function loadAll() {
  MEALS = {};
  const ms = await getDocs(collection(db, 'nutrition_meals'));
  ms.forEach(d => {
    const v = d.data();
    const m = { id: d.id, meal: v.meal || '', food: v.food || '', qty: v.qty || '',
      kcal: num(v.kcal), prot: num(v.prot), carb: num(v.carb),
      sugar: num(v.sugar), fat: num(v.fat), notes: v.notes || '' };
    (MEALS[v.date] = MEALS[v.date] || []).push(m);
  });
  Object.values(MEALS).forEach(arr =>
    arr.sort((a, b) => (MEAL_ORDER[a.meal] || 9) - (MEAL_ORDER[b.meal] || 9)));

  WEIGHTS = [];
  const ws = await getDocs(collection(db, 'nutrition_weight'));
  ws.forEach(d => {
    const v = d.data();
    if (num(v.weight) > 0) WEIGHTS.push({ id: d.id, date: v.date, weight: num(v.weight),
      fat: num(v.fat), muscle: num(v.muscle), notes: v.notes || '' });
  });
  WEIGHTS.sort((a, b) => a.date < b.date ? -1 : 1);

  buildDateSelector();
  renderWeight();
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
  const pct = m.goal ? val / m.goal : 0;
  const shown = Math.min(pct, 1);
  const C = 2 * Math.PI * 62;
  const dash = (shown * C).toFixed(1);
  return `<svg class="ring-svg" viewBox="0 0 150 150">
    <circle cx="75" cy="75" r="62" fill="none" stroke="#E9ECEF" stroke-width="16"/>
    <circle cx="75" cy="75" r="62" fill="none" stroke="${m.color}" stroke-width="16"
      stroke-linecap="round" stroke-dasharray="${dash} ${C.toFixed(1)}"
      transform="rotate(-90 75 75)"/>
    <text x="75" y="70" text-anchor="middle" font-size="26" font-weight="800" fill="${m.color}">${Math.round(pct*100)}%</text>
    <text x="75" y="92" text-anchor="middle" font-size="12" fill="#6b7280">${fmt(val)} / ${fmt(m.goal)}</text>
    <text x="75" y="108" text-anchor="middle" font-size="11" fill="#9ca3af">${m.unit}</text>
  </svg>`;
}
function statusBox(m, val) {
  const pct = m.goal ? val / m.goal : 0;
  const over = pct >= 1;
  const diff = Math.abs(val - m.goal);
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

function render(date) {
  $('dateTitle').textContent = dateName(date);
  const t = totals(date);
  const vals = { kcal: t.kcal, prot: t.prot, carb: t.carb, azuc: t.azuc, gras: t.gras };
  $('rings').innerHTML = METRICS.map(m =>
    `<div class="ring-card"><h3>${m.icon} ${m.name}</h3>${ringSVG(m, vals[m.key])}${statusBox(m, vals[m.key])}</div>`
  ).join('');
  const rows = MEALS[date] || [];
  let html = rows.map(m =>
    `<tr><td>${esc(m.meal)}</td><td>${esc(m.food)}</td><td>${esc(m.qty)}</td>` +
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
      const v = vals[m.key], pct = m.goal ? v / m.goal : 0;
      const w = Math.min(pct, 1) * 100;
      return `<div class="vsrow"><span>${vsNames[m.key]}</span><span><b>${fmt(v)}</b></span><span>${fmt(m.goal)}</span><span class="bar-track"><div class="bar-fill" style="width:${w.toFixed(0)}%;background:${m.color}"></div></span><span>${Math.round(pct*100)}%</span></div>`;
    }).join('');
  const noteSet = [];
  rows.forEach(m => { if (m.notes) noteSet.push(`<b>${esc(m.meal)}:</b> ${esc(m.notes)}`); });
  $('notesList').innerHTML = notesFor(t).map(x => `<li>${x}</li>`).join('') + noteSet.map(x => `<li>${x}</li>`).join('');

  document.querySelectorAll('[data-del-meal]').forEach(b =>
    b.onclick = async () => {
      if (!confirm('¿Borrar este registro?')) return;
      await deleteDoc(doc(db, 'nutrition_meals', b.dataset.delMeal));
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
  let grasaCard = '';
  if (last.fat > 0) {
    const dg = prev && prev.fat > 0 ? last.fat - prev.fat : 0;
    grasaCard = `<div class="wstat"><div class="lbl">GRASA CORPORAL</div><div class="val">${last.fat}<small> %</small></div>
      <div class="delta ${dCls(dg)}">${prev && prev.fat > 0 ? dTxt(dg).replace('kg','pp') : '—'}</div></div>`;
  }
  const delBtn = `<div style="text-align:center;margin-top:8px"><button class="btn-ghost btn-sm" id="btn-del-weight">Borrar último pesaje (${shortDate(last.date)})</button></div>`;
  body.innerHTML = `
    <div class="wstats">
      <div class="wstat"><div class="lbl">PESO ACTUAL</div><div class="val">${last.weight}<small> kg</small></div>
        <div class="delta flat">${shortDate(last.date)}</div></div>
      <div class="wstat"><div class="lbl">VS PESAJE ANTERIOR</div><div class="val">${prev ? dTxt(dW).split(' ')[0] : '—'}<small> ${prev ? 'kg' : ''}</small></div>
        <div class="delta ${dCls(dW)}">${prev ? dTxt(dW) : 'primer registro'}</div></div>
      <div class="wstat"><div class="lbl">CAMBIO TOTAL</div><div class="val">${dT > 0 ? '+' : ''}${dT.toFixed(1)}<small> kg</small></div>
        <div class="delta ${dCls(dT)}">desde ${shortDate(first.date)} · ${data.length} pesaje${data.length > 1 ? 's' : ''}</div></div>
      ${grasaCard}
    </div>
    ${weightChartSVG(data)}${delBtn}`;
  const dw = $('btn-del-weight');
  if (dw) dw.onclick = async () => {
    if (!confirm(`¿Borrar el pesaje del ${dateName(last.date)}?`)) return;
    await deleteDoc(doc(db, 'nutrition_weight', last.id));
    toast('Pesaje borrado.');
    await loadAll();
  };
}

/* ================= FORMULARIOS ================= */
$('btn-add-meal').onclick = () => { $('m-date').value = $('dateSel').value || todayISO(); $('meal-modal').style.display = ''; };
$('meal-cancel').onclick = () => $('meal-modal').style.display = 'none';
$('meal-modal').addEventListener('click', e => { if (e.target.id === 'meal-modal') e.target.style.display = 'none'; });

$('form-meal').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    date: $('m-date').value, meal: $('m-meal').value,
    food: $('m-food').value.trim(), qty: $('m-qty').value.trim(),
    kcal: num($('m-kcal').value), prot: num($('m-prot').value),
    carb: num($('m-carb').value), sugar: num($('m-sugar').value),
    fat: num($('m-fat').value), notes: $('m-notes').value.trim(),
    createdAt: serverTimestamp()
  };
  if (!data.date || !data.food) { toast('Faltan fecha o alimento.', true); return; }
  await addDoc(collection(db, 'nutrition_meals'), data);
  $('meal-modal').style.display = 'none';
  e.target.reset();
  toast('Comida registrada.');
  await loadAllKeepDate(data.date);
});

$('btn-add-weight').onclick = () => { $('w-date').value = todayISO(); $('weight-modal').style.display = ''; };
$('weight-cancel').onclick = () => $('weight-modal').style.display = 'none';
$('weight-modal').addEventListener('click', e => { if (e.target.id === 'weight-modal') e.target.style.display = 'none'; });

$('form-weight').addEventListener('submit', async e => {
  e.preventDefault();
  const date = $('w-date').value;
  const data = { date, weight: num($('w-weight').value), fat: num($('w-fat').value),
    muscle: num($('w-muscle').value), notes: $('w-notes').value.trim(), updatedAt: serverTimestamp() };
  if (!date || data.weight <= 0) { toast('Faltan fecha o peso válido.', true); return; }
  await setDoc(doc(db, 'nutrition_weight', date), data);
  $('weight-modal').style.display = 'none';
  e.target.reset();
  toast('Pesaje registrado.');
  await loadAll();
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
