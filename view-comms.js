/*
 * RONBO FIT — vista «Comunicaciones» (view-comms.js)
 *
 * L-2 «Arranque por vistas» · FASE 1 (AUTH-553, 2026-11-22): primera
 * vista partida del monolito. Este archivo es el bloque COMUNICACIONES
 * de app.js (AUTH-2026-11-01-141) trasladado BYTE A BYTE — mismas
 * funciones, mismo estado (COMMS y sus constantes), mismos textos y
 * mismas rutas de datos —; lo único añadido es esta cabecera y la
 * línea de exportación del final.
 *
 * CÓMO VIVE: app.js lo importa con viewLoad('comms') la primera vez
 * que la vista se abre (pastilla «Comunicaciones») o cuando el
 * barrido del propietario se calienta tras un registro; el service
 * worker lo precarga en segundo plano con el sello de la versión,
 * así que la primera apertura es normalmente instantánea y, sin
 * precarga, se pide una sola vez y queda en la caché de la cáscara.
 *
 * PUENTE: la vista usa del núcleo SOLO nombres de lectura, publicados
 * por el anfitrión de vistas de app.js como accesos VIVOS en el
 * ámbito global (funciones de la casa — $, t, esc, toast, mailSend,
 * mailRecordNotice, mailReasonText, nudgeMailLangOf,
 * dosProfileComplete, libNorm, clientProfileChecklist —; enlaces del
 * SDK — getDoc, getDocs, setDoc, doc, collection, serverTimestamp,
 * deleteField —; y estado/constantes — IS_OWNER, db, auth,
 * ESC_MODALITIES, TRAIN_WD_EN, TRAIN_WD_ES —). La vista no escribe
 * en ninguno: su estado es suyo y vive aquí dentro.
 */

/* ═══════════ COMUNICACIONES (AUTH-2026-11-01-141) ═══════════
   La sección de correo del propietario (diseño aprobado
   DISENO-COMUNICACIONES-2026-10-28 + decisiones de Ronald del
   2026-10-28: arquitectura A, pools y plantillas como LISTAS
   DESPLEGABLES, barrido SEGÚN SU TOQUE Y CON PREVIA, plantillas
   solo de administración). Los textos viven en UNA fuente:
   app_settings/mail_templates (solo el propietario lo lee/escribe
   por reglas); el Worker compone cada correo desde ese documento
   y jamás acepta texto en la petición. La app solo pide envíos
   {uid, template} por la ruta de AUTH-061 y anota notices.* al
   éxito, como siempre. Sin proceso servidor nuevo: el «barrido»
   detecta al abrir la app del administrador o al entrar aquí.
   La puerta del entrenador para planLoaded (automática e
   invisible) quedó aprobada COMO FASE 2: no vive en este paquete;
   aquí planLoaded sale por el barrido diferido del administrador. */
const COMMS_SYSTEM_KEYS = ['welcome', 'trainer', 'eval', 'meals', 'membership', 'dossier',
  'install', 'planLoaded', 'metrics', 'benefits', 'bodyImages', 'trainerPitch', 'aiDay3',
  /* AUTH-2026-11-02-172 (punto 18): la plantilla del resumen diario
     de entreno — fija del sistema (desactivar sí, borrar no), con
     sus textos editables aquí como las demás; su envío lo hará el
     despertador del Worker cuando el paquete completo se apruebe. */
  'daySummary'];
const COMMS_CAP = 450; /* tope prudente bajo el límite ~500/día del buzón (§4.6) */
let COMMS = null;

function commsMonth() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function commsTodayKey() { const d = new Date(); return 'ronbofit-comms-sent-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function commsTodayCount() { try { return parseInt(localStorage.getItem(commsTodayKey()) || '0', 10) || 0; } catch { return 0; } }
function commsBumpToday() { try { localStorage.setItem(commsTodayKey(), String(commsTodayCount() + 1)); } catch {} }
function commsBanned(s) { return /nutrici|nutrition/i.test(String(s || '')); }

async function commsLoadData() {
  if (!IS_OWNER) return null;
  const c = { users: [], rels: {}, membs: {}, plans: [], profiles: {}, aiDays: {}, latestReq: {}, checks: {}, err: {}, templates: null, rev: 0 };
  try { const s = await getDoc(doc(db, 'app_settings', 'mail_templates')); if (s.exists()) { const d = s.data(); c.templates = d.templates || {}; c.rev = d.rev || 0; c.updatedAt = d.updatedAt || null; } } catch { c.err.templates = true; }
  try { const s = await getDocs(collection(db, 'users')); s.forEach(d => c.users.push({ id: d.id, ...d.data() })); } catch { c.err.users = true; }
  try { const s = await getDocs(collection(db, 'trainer_relations')); s.forEach(d => { c.rels[d.id] = d.data(); }); } catch { c.err.rels = true; }
  try { const s = await getDocs(collection(db, 'memberships')); s.forEach(d => { c.membs[d.id] = d.data(); }); } catch { c.err.membs = true; }
  try { const s = await getDocs(collection(db, 'training_plans')); s.forEach(d => c.plans.push({ id: d.id, ...d.data() })); } catch { c.err.plans = true; }
  try { const s = await getDocs(collection(db, 'trainer_profiles')); s.forEach(d => { c.profiles[d.id] = d.data(); }); } catch { c.err.profiles = true; }
  try {
    const s = await getDocs(collection(db, 'nutrition_meals'));
    const days = {};
    s.forEach(d => { const m = d.data(); if (m && m.ownerUid && m.date && (m.source === 'ai' || m.source === 'ai-text' || m.source === 'ai-audio')) { (days[m.ownerUid] = days[m.ownerUid] || new Set()).add(m.date); } });
    for (const k of Object.keys(days)) c.aiDays[k] = days[k].size;
  } catch { c.err.meals = true; }
  try {
    const s = await getDocs(collection(db, 'meal_requests'));
    const reqMs = x => (x && x.requestedAt && x.requestedAt.toMillis) ? x.requestedAt.toMillis() : 0;
    s.forEach(d => { const r = { id: d.id, ...d.data() }; if (r.alumnoUid && (!c.latestReq[r.alumnoUid] || reqMs(r) >= reqMs(c.latestReq[r.alumnoUid]))) c.latestReq[r.alumnoUid] = r; });
  } catch { c.err.reqs = true; }
  COMMS = c;
  return c;
}

/* Relación efectiva: la canónica (trainer_relations) primero y los
   campos espejo del usuario como caída — la misma precedencia de
   la app; los pools no inventan una tercera verdad (diseño §2). */
function commsEffRel(u) {
  const r = COMMS.rels[u.id];
  if (r && typeof r === 'object' && ('trainerUid' in r)) {
    return { trainerUid: r.trainerUid || null, active: r.status === 'activa' };
  }
  return { trainerUid: u.trainerUid || null, active: u.assignmentStatus === 'assigned' };
}
function commsActivePlan(uid) {
  let best = null;
  for (const p of COMMS.plans) {
    if (p.clientUid !== uid || p.active !== true || p.isSnapshot === true) continue;
    const ms = (p.createdAt && p.createdAt.toMillis) ? p.createdAt.toMillis() : 0;
    if (!best || ms >= best.ms) best = { plan: p, ms };
  }
  return best ? best.plan : null;
}
function commsPlanByTrainer(u) {
  const rel = commsEffRel(u);
  if (!rel.trainerUid) return null;
  let best = null;
  for (const p of COMMS.plans) {
    if (p.clientUid !== u.id || p.active !== true || p.isSnapshot === true || p.createdBy !== rel.trainerUid) continue;
    const ms = (p.createdAt && p.createdAt.toMillis) ? p.createdAt.toMillis() : 0;
    if (!best || ms >= best.ms) best = { plan: p, ms };
  }
  return best ? best.plan : null;
}
function commsTrainerName(tuid) {
  const prof = COMMS.profiles[tuid];
  if (prof && prof.displayName) return prof.displayName;
  const tu = COMMS.users.find(x => x.id === tuid);
  return (tu && (tu.name || tu.email)) || 'RONBO FIT';
}
function commsTrainerPct(u) {
  const prof = COMMS.profiles[u.id] || null;
  const base = dosProfileComplete(prof);
  const memb = COMMS.membs[u.id];
  const noCerts = !prof || !Array.isArray(prof.certifications) || !prof.certifications.length;
  const mods = prof && Array.isArray(prof.modalities) && prof.modalities.length ? prof.modalities : ESC_MODALITIES;
  const noPlaces = !!prof && mods.includes('presencial') && (!Array.isArray(prof.places) || !prof.places.length);
  const rows = [
    { done: base },
    { done: !!(memb && (memb.status === 'pendiente' || memb.status === 'activa')) },
    { done: base && !(noCerts || noPlaces) },
  ];
  const done = rows.filter(r => r.done).length;
  return Math.round(done / rows.length * 100);
}

const COMMS_POOLS = [
  { id: 'trainers', needs: [], fn: u => u.role === 'entrenador' },
  { id: 'noTrainer', needs: ['rels'], fn: u => u.role !== 'entrenador' && (u.role || 'usuario') === 'usuario' && u.approved === true && !commsEffRel(u).trainerUid },
  { id: 'withTrainer', needs: ['rels'], fn: u => (u.role || 'usuario') === 'usuario' && u.approved === true && !!commsEffRel(u).trainerUid },
  { id: 'withTrainerActive', needs: ['rels'], fn: u => (u.role || 'usuario') === 'usuario' && u.approved === true && !!commsEffRel(u).trainerUid && commsEffRel(u).active },
  { id: 'withTrainerWaiting', needs: ['rels'], fn: u => (u.role || 'usuario') === 'usuario' && u.approved === true && !!commsEffRel(u).trainerUid && !commsEffRel(u).active },
  { id: 'mealsOnly', needs: [], fn: u => { const f = (u.features && typeof u.features === 'object') ? u.features : null; return !!f && f.meals === true && f.training !== true; } },
  { id: 'trainingOnly', needs: [], fn: u => { const f = (u.features && typeof u.features === 'object') ? u.features : null; return !!f && f.training === true && f.meals !== true; } },
  { id: 'allApproved', needs: [], fn: u => u.approved === true },
  { id: 'pendingApproval', needs: [], fn: u => u.approved !== true },
  { id: 'noInstall', needs: [], fn: u => u.approved === true && !(u.appInstall && u.appInstall.everInstalled === true) },
  { id: 'installSignal', needs: [], fn: u => !!(u.appInstall && u.appInstall.everInstalled === true) },
  { id: 'activePlan', needs: ['plans'], fn: u => !!commsActivePlan(u.id) },
  { id: 'trainerNoPlan', needs: ['rels', 'plans'], fn: u => (u.role || 'usuario') === 'usuario' && u.approved === true && !!commsEffRel(u).trainerUid && !commsActivePlan(u.id) },
  { id: 'checklist', needs: ['checks'], fn: u => { const p = COMMS.checks[u.id]; return typeof p === 'number' && p < 100; } },
  { id: 'benefitsPending', needs: [], fn: u => u.approved === true && !(u.notices && u.notices.benefits) },
  { id: 'trainersNoMembership', needs: ['membs'], fn: u => u.role === 'entrenador' && !(COMMS.membs[u.id] && COMMS.membs[u.id].status === 'activa') },
  { id: 'aiDay3', needs: ['meals'], fn: u => (COMMS.aiDays[u.id] || 0) >= 3 && !(u.notices && u.notices.aiDay3) },
  { id: 'planNoticePending', needs: ['rels', 'plans'], fn: u => { const p = commsPlanByTrainer(u); return !!p && !(u.notices && u.notices.planLoaded && u.notices.planLoaded.planId === p.id); } },
];
function commsPoolReady(p) { return !p.needs.some(n => COMMS.err[n]); }
function commsPoolMembers(id) {
  const p = COMMS_POOLS.find(x => x.id === id);
  if (!p || !commsPoolReady(p)) return [];
  return COMMS.users.filter(u => !u.isOwner && u.email && p.fn(u));
}

/* Detecciones del barrido (diseño §4.4): T1, T2, T6, T7 y la oferta
   de T4. Cada grupo nace de su pool y de su anotación: lo ya
   avisado no se detecta dos veces. */
function commsSweepGroups() {
  if (!COMMS || !COMMS.templates) return [];
  const g = [];
  const add = (tplKey, labelKey, members) => { const tpl = COMMS.templates[tplKey]; if (tpl && tpl.enabled !== false && members.length) g.push({ tplKey, labelKey, members, trigger: tpl.trigger || 'manual' }); };
  add('install', 'comms.sweepInstall', commsPoolMembers('noInstall').filter(u => !(u.notices && u.notices.install)).map(u => ({ u })));
  add('planLoaded', 'comms.sweepPlan', commsPoolMembers('planNoticePending').map(u => ({ u, plan: commsPlanByTrainer(u) })));
  add('trainerPitch', 'comms.sweepPitch', commsPoolMembers('noTrainer').filter(u => !(u.notices && u.notices.trainerPitch && u.notices.trainerPitch.month === commsMonth())).map(u => ({ u })));
  add('aiDay3', 'comms.sweepAi', commsPoolMembers('aiDay3').map(u => ({ u })));
  add('benefits', 'comms.sweepBenefits', commsPoolMembers('benefitsPending').map(u => ({ u })));
  return g;
}

async function commsAnnotate(uid, tplKey, res) {
  try {
    if (tplKey === 'planLoaded') {
      const u = COMMS.users.find(x => x.id === uid);
      const p = u ? commsPlanByTrainer(u) : null;
      const pid = (res && res.planId) || (p && p.id) || '';
      await setDoc(doc(db, 'users', uid), { notices: { planLoaded: { at: serverTimestamp(), by: auth.currentUser.uid, template: 'planLoaded', planId: pid } } }, { merge: true });
      if (u) { u.notices = u.notices || {}; u.notices.planLoaded = { planId: pid }; }
    } else if (tplKey === 'trainerPitch') {
      await setDoc(doc(db, 'users', uid), { notices: { trainerPitch: { at: serverTimestamp(), by: auth.currentUser.uid, template: 'trainerPitch', month: commsMonth() } } }, { merge: true });
      const u = COMMS.users.find(x => x.id === uid); if (u) { u.notices = u.notices || {}; u.notices.trainerPitch = { month: commsMonth() }; }
    } else {
      await mailRecordNotice(uid, tplKey);
      const u = COMMS.users.find(x => x.id === uid); if (u) { u.notices = u.notices || {}; u.notices[tplKey] = { template: tplKey }; }
    }
  } catch {}
}

/* Cola secuencial 1 a 1 (diseño §4.6): progreso visible, pausa y
   reanudación; el contador del día detiene la corrida al acercarse
   al tope del buzón y las anotaciones hacen el resto (nadie recibe
   dos veces lo de un solo uso). */
async function commsRunQueue(tplKey, members, ui) {
  const run = { tplKey, total: members.length, done: 0, sent: 0, failed: 0, paused: false, stopped: false, capped: false };
  COMMS.run = run;
  ui.onProgress(run, null);
  for (const m of members) {
    if (run.stopped) break;
    while (run.paused && !run.stopped) { await new Promise(r => setTimeout(r, 250)); }
    if (run.stopped) break;
    if (commsTodayCount() >= COMMS_CAP) { run.capped = true; break; }
    /* AUTH-2026-11-03-198: cada correo sale en el idioma GUARDADO
       del destinatario (su mailLang → su lang), como ya hace el
       «✉ Avisar» desde AUTH-169 — nunca en el de la sesión que
       envía. El Worker repite la misma cadena sobre el documento
       y la vista previa del panel pinta ese mismo idioma. */
    const res = await mailSend(m.u.id, tplKey, nudgeMailLangOf(m.u));
    run.done++;
    if (res.ok) { run.sent++; commsBumpToday(); await commsAnnotate(m.u.id, tplKey, res); }
    else run.failed++;
    ui.onProgress(run, { u: m.u, res });
  }
  run.finished = true;
  ui.onProgress(run, null);
  return run;
}
function commsReasonText(res) {
  if (res && res.error === 'templates-unavailable') return t('comms.reasonTemplates');
  if (res && res.error === 'plan-context') return t('comms.reasonPlan');
  return mailReasonText(res);
}
function commsQueueUI(box) {
  return {
    onProgress(run, item) {
      if (!box) return;
      const head = box.querySelector('.comms-run-head');
      if (head) head.innerHTML = `<b>${esc(t('comms.progress', { done: run.done, total: run.total }))}</b>
        ${run.paused ? ` · ${esc(t('comms.paused'))}` : ''}${run.capped ? ` · ${esc(t('comms.capStop', { n: commsTodayCount(), cap: COMMS_CAP }))}` : ''}
        ${run.finished ? ` · ${esc(t('comms.doneOk', { sent: run.sent, failed: run.failed }))}` : ''}`;
      const list = box.querySelector('.comms-run-list');
      if (list && item) {
        const line = document.createElement('div');
        line.className = 'comms-run-line';
        line.textContent = item.res.ok
          ? `✓ ${item.u.name || item.u.email} → ${item.res.to || item.u.email}`
          : `✗ ${item.u.name || item.u.email} — ${commsReasonText(item.res)}`;
        list.appendChild(line);
      }
      const pb = box.querySelector('[data-run-pause]'); if (pb) pb.textContent = run.paused ? t('comms.resumeBtn') : t('comms.pauseBtn');
      const sb = box.querySelector('[data-run-stop]'); if (sb) sb.disabled = !!run.finished;
      if (pb) pb.disabled = !!run.finished;
    }
  };
}
function commsRunControlsHTML() {
  return `<div class="eval-actions"><button type="button" class="btn-ghost btn-sm" data-run-pause>${esc(t('comms.pauseBtn'))}</button>
    <button type="button" class="btn-ghost btn-sm" data-run-stop>${esc(t('comms.stopBtn'))}</button></div>`;
}
function commsWireRunControls(box) {
  const pb = box.querySelector('[data-run-pause]');
  if (pb) pb.onclick = () => { if (COMMS.run) { COMMS.run.paused = !COMMS.run.paused; commsQueueUI(box).onProgress(COMMS.run, null); } };
  const sb = box.querySelector('[data-run-stop]');
  if (sb) sb.onclick = () => { if (COMMS.run) COMMS.run.stopped = true; };
}

function commsTplTitle(key) {
  const k = 'comms.tpl.' + key;
  const v = t(k);
  return v !== k ? v : t('comms.tplCustom', { key });
}
function commsTriggerLabel(tr) {
  return tr === 'sweep-auto' ? t('comms.triggerAuto') : tr === 'sweep-ask' ? t('comms.triggerAsk') : t('comms.triggerManual');
}
/* AUTH-2026-11-02-170 — LA MARCA {planSummary} DE planLoaded (punto
   17 de la cola; contenido aprobado por Ronald el 2026-11-02 10:56
   CST): ESPEJO del armado del Worker (planSummaryText), que es quien
   compone el correo real; esta copia solo pinta la VISTA PREVIA de
   Comunicaciones con el plan que el barrido ya cargó. Sin plan (la
   previa del editor), la marca se pinta con el bloque de EJEMPLO
   aprobado en la propuesta, para que el propietario vea el bloque
   tal cual saldrá. Degradación honesta, la aprobada: día sin
   etiqueta → «Día N · X ejercicios»; sin fecha → «Tu plan ya está
   activo». */
const COMMS_PLAN_SUMMARY_SAMPLE = {
  es: 'Tu plan en resumen\n3 días por semana.\nLunes: Pecho y tríceps · Miércoles: Piernas · Viernes: Espalda y bíceps.\nRige desde el lunes 9 de noviembre de 2026.',
  en: 'Your plan at a glance\n3 days a week.\nMonday: Chest and triceps · Wednesday: Legs · Friday: Back and biceps.\nIt starts on Monday, November 9, 2026.'
};
/* AUTH-2026-11-02-172 (punto 18): las marcas propias del resumen
   diario ({dayLabel}, {dayDate}, {exercises}, {link}) en la VISTA
   PREVIA de Comunicaciones — el ejemplo aprobado en la propuesta
   (PROPUESTA-RESUMEN-DIARIO-ENTRENO-2026-11-02), para que el
   propietario vea la plantilla tal cual saldrá. El correo real lo
   compondrá el despertador del Worker con la sesión de ese día. */
const COMMS_DAY_SUMMARY_SAMPLE = {
  es: { dayLabel: 'Piernas', dayDate: 'miércoles 11 de noviembre de 2026',
    exercises: 'Sentadilla — 4 × 8-10\nPrensa de piernas — 3 × 12\nPeso muerto rumano — 3 × 10\nElevación de talones — 4 × 15',
    link: 'https://fit.ronbo.store/?dia=2026-11-11' },
  en: { dayLabel: 'Legs', dayDate: 'Wednesday, November 11, 2026',
    exercises: 'Squat — 4 × 8-10\nLeg press — 3 × 12\nRomanian deadlift — 3 × 10\nCalf raises — 4 × 15',
    link: 'https://fit.ronbo.store/?dia=2026-11-11' }
};
const PS_WD_SHOW = {
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};
function commsPsSplitWeekday(label) {
  const raw = String(label || '').trim();
  if (!raw) return { wd: -1, rest: '' };
  const norm = libNorm(raw).trim();
  for (let wd = 0; wd < 7; wd++) {
    for (const key of [TRAIN_WD_EN[wd], TRAIN_WD_ES[wd]]) {
      if (norm === key) return { wd, rest: '' };
      if (norm.startsWith(key)) {
        const next = norm.charAt(key.length);
        if (next === ' ' || next === '—' || next === '-' || next === ':' || next === '|' || next === '·') {
          return { wd, rest: raw.slice(key.length).replace(/^[\s—\-:|·]+/, '').trim() };
        }
      }
    }
  }
  return { wd: -1, rest: raw };
}
function commsPlanSummary(plan, lang) {
  const L = lang === 'es' ? 'es' : 'en';
  const days = (plan && Array.isArray(plan.days)) ? plan.days : [];
  const spwNum = plan ? Number(plan.sessionsPerWeek) : NaN;
  const spw = (isFinite(spwNum) && spwNum > 0) ? Math.round(spwNum) : days.length;
  const entry = (day, idx) => {
    const label = String((day && day.label) || '').trim();
    const count = (day && Array.isArray(day.exercises)) ? day.exercises.length : 0;
    const exWord = L === 'es' ? (count === 1 ? 'ejercicio' : 'ejercicios') : (count === 1 ? 'exercise' : 'exercises');
    const dayWord = L === 'es' ? 'Día' : 'Day';
    const parts = commsPsSplitWeekday(label);
    if (parts.wd >= 0 && parts.rest) return PS_WD_SHOW[L][parts.wd] + ': ' + parts.rest;
    if (parts.wd >= 0) return PS_WD_SHOW[L][parts.wd] + ' · ' + count + ' ' + exWord;
    if (label) return dayWord + ' ' + (idx + 1) + ': ' + label;
    return dayWord + ' ' + (idx + 1) + ' · ' + count + ' ' + exWord;
  };
  const lines = [L === 'es' ? 'Tu plan en resumen' : 'Your plan at a glance'];
  lines.push(L === 'es'
    ? spw + ' ' + (spw === 1 ? 'día' : 'días') + ' por semana.'
    : spw + ' ' + (spw === 1 ? 'day' : 'days') + ' a week.');
  if (days.length) lines.push(days.map(entry).join(' · ') + '.');
  const s = String((plan && plan.startsAt) || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T12:00:00');
    if (L === 'es') {
      const p = {};
      for (const part of new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d)) p[part.type] = part.value;
      lines.push('Rige desde el ' + p.weekday + ' ' + p.day + ' de ' + p.month + ' de ' + p.year + '.');
    } else {
      lines.push('It starts on ' + new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d) + '.');
    }
  } else {
    lines.push(L === 'es' ? 'Tu plan ya está activo.' : 'Your plan is already active.');
  }
  return lines.join('\n');
}
function commsFillPreview(tpl, lang, u, plan) {
  const name = (u && (u.name || (u.email || '').split('@')[0])) || '';
  let s = tpl.body[lang] || '';
  let subj = tpl.subject[lang] || '';
  const rel = u ? commsEffRel(u) : { trainerUid: null };
  const tn = rel.trainerUid ? commsTrainerName(rel.trainerUid) : 'RONBO FIT';
  const pt = plan ? (plan.title || '') : '';
  const ps = plan ? commsPlanSummary(plan, lang) : (COMMS_PLAN_SUMMARY_SAMPLE[lang] || '');
  const ds = COMMS_DAY_SUMMARY_SAMPLE[lang] || COMMS_DAY_SUMMARY_SAMPLE.en;
  const fill = x => x.split('{name}').join(name).split('{trainerName}').join(tn).split('{trainer}').join(tn).split('{planTitle}').join(pt).split('{planSummary}').join(ps)
    .split('{dayLabel}').join(ds.dayLabel).split('{dayDate}').join(ds.dayDate).split('{exercises}').join(ds.exercises).split('{link}').join(ds.link);
  return { subject: fill(subj), body: fill(s) };
}

/* ═══════════ AUTH-597 · PLIEGUES Nº15 — Comunicaciones ═══════════
   Barrido, Plantillas y Enviar dejan de apilarse en la vista:
   son tres PUERTAS (líneas .pl-fold en el HTML) y cada bloque
   vive en su almacén oculto y VIAJA a su pantalla propia
   (.adm597-sheet de index.html, z-index 44, con ✕ y «‹ Volver»)
   al patrón del bloque viajero de la casa (595/597 en app.js);
   los pintores de siempre pintan por id, esté el bloque donde
   esté. Hay UN solo «Enviar»: la puerta de envío, y dentro de
   su pantalla se elige pool o una persona (el bloque de una
   persona, que vivía dentro de la tarjeta de «beneficios», vive
   ahora en el panel de envío). La previa y la lista de
   destinatarios del envío nacen tras «Ver más». */
const COMMS597 = {
  'comms-sweep': { block: 'comms-sweep', store: 'adm597-store-comms-sweep', titleKey: 'comms.sweepTitle' },
  'comms-tpl': { block: 'adm597-unit-comms-tpl', store: 'adm597-store-comms-tpl', titleKey: 'comms.tplTitle' },
  'comms-send': { block: 'adm597-unit-comms-send', store: 'adm597-store-comms-send', titleKey: 'comms.sendTitle' }
};
function comms597Open(key) {
  const c = COMMS597[key]; if (!c) return;
  const f = document.getElementById('adm597-float-' + key), body = document.getElementById('adm597-' + key + '-body'), block = document.getElementById(c.block);
  if (!f || !body || !block) return;
  const ttl = document.getElementById('adm597-' + key + '-title'); if (ttl) ttl.textContent = t(c.titleKey);
  if (block.parentElement !== body) body.appendChild(block);
  f.style.display = '';
  try { coverSync(); } catch {}
}
function comms597Close(key) {
  const c = COMMS597[key]; if (!c) return;
  const f = document.getElementById('adm597-float-' + key), store = document.getElementById(c.store), block = document.getElementById(c.block);
  if (block && store && block.parentElement !== store) store.appendChild(block);
  if (f && f.style.display !== 'none') { f.style.display = 'none'; try { coverSync(); } catch {} }
}
Object.keys(COMMS597).forEach(k => {
  const x = document.getElementById('adm597-' + k + '-x'); if (x) x.onclick = () => comms597Close(k);
  const bk = document.getElementById('adm597-' + k + '-back'); if (bk) bk.onclick = () => comms597Close(k);
});
document.addEventListener('click', e => {
  const b = e.target && e.target.closest ? e.target.closest('[data-comms597-open]') : null;
  if (b) comms597Open(b.dataset.comms597Open);
});

async function renderComms() {
  const sec = $('comms-section');
  if (!sec) return;
  if (!IS_OWNER) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  if (!COMMS) await commsLoadData();
  if (!COMMS) return;
  /* El % del checklist por persona (pool T3): alumnos con la misma
     clientProfileChecklist de la casa; entrenadores con sus 3
     filas. Se calcula una vez por carga de la sección. */
  if (!COMMS.err.users) {
    for (const u of COMMS.users) {
      if (u.isOwner || COMMS.checks[u.id] !== undefined) continue;
      if (u.role === 'entrenador') COMMS.checks[u.id] = commsTrainerPct(u);
      else {
        try { const chk = await clientProfileChecklist(u, COMMS.latestReq[u.id] || null); COMMS.checks[u.id] = chk ? chk.pct : null; }
        catch { COMMS.checks[u.id] = null; }
      }
    }
  }
  const revEl = $('comms-rev');
  if (revEl) {
    revEl.textContent = COMMS.err.templates
      ? t('comms.loadError', { reason: 'templates' })
      : (COMMS.templates ? t('comms.rev', { rev: COMMS.rev, date: COMMS.updatedAt && COMMS.updatedAt.toDate ? COMMS.updatedAt.toDate().toLocaleDateString() : '' }) : t('comms.revNone'));
  }
  commsRenderTplSelect();
  commsRenderSweep();
  commsRenderSendPanel();
}

function commsRenderTplSelect() {
  const sel = $('comms-tpl-sel');
  if (!sel || !COMMS.templates) return;
  const keys = Object.keys(COMMS.templates).sort((a, b) => {
    const ia = COMMS_SYSTEM_KEYS.indexOf(a), ib = COMMS_SYSTEM_KEYS.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const cur = COMMS.selTpl && COMMS.templates[COMMS.selTpl] ? COMMS.selTpl : (keys[0] || '');
  COMMS.selTpl = cur;
  sel.innerHTML = keys.map(k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(commsTplTitle(k))} (${esc(k)})${COMMS.templates[k].enabled === false ? ' — ' + esc(t('comms.tplOff')) : ''}</option>`).join('');
  sel.onchange = () => { COMMS.selTpl = sel.value; commsRenderTplCard(); commsRenderSendPanel(); };
  const add = $('comms-tpl-add');
  if (add) add.onclick = () => {
    const key = (prompt(t('comms.keyPrompt')) || '').trim();
    if (!key) return;
    if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(key)) { toast(t('comms.errKey')); return; }
    if (COMMS.templates[key]) { toast(t('comms.keyExists')); return; }
    COMMS.templates[key] = { subject: { en: '', es: '' }, body: { en: '', es: '' }, artUrl: '', mediaUrl: '', mediaKind: '', videoUrl: '', trigger: 'manual', enabled: true };
    COMMS.selTpl = key;
    commsRenderTplSelect();
    commsOpenEditor(key);
  };
  commsRenderTplCard();
}

function commsRenderTplCard() {
  const box = $('comms-tpl-card');
  if (!box || !COMMS.templates) return;
  const key = COMMS.selTpl;
  const tpl = COMMS.templates[key];
  if (!tpl) { box.innerHTML = ''; return; }
  /* AUTH-597 (pliegues nº 15): la tarjeta ya no lleva el botón
     «Enviar a un pool» ni el bloque de envío a una persona: hay
     UN solo «Enviar» (la puerta de la pantalla de envío) y el
     bloque de una persona vive en esa pantalla
     (commsRenderOneBox). */
  box.innerHTML = `<div class="panel comms-card">
    <div class="comms-card-head">
      ${tpl.artUrl ? `<img class="comms-thumb" src="${esc(tpl.artUrl)}" alt="">` : `<div class="comms-thumb comms-thumb-none">✉️</div>`}
      <div><b>${esc(commsTplTitle(key))}</b> <span class="muted">(${esc(key)})</span><br>
      <span class="muted">${esc(commsTriggerLabel(tpl.trigger))} · ${tpl.enabled === false ? esc(t('comms.tplOff')) : esc(t('comms.tplOn'))}</span></div>
    </div>
    <div class="eval-actions">
      <button type="button" class="btn-primary btn-sm" id="comms-tpl-edit">${esc(t('comms.editBtn'))}</button>
    </div>
  </div>`;
  const ed = $('comms-tpl-edit'); if (ed) ed.onclick = () => commsOpenEditor(key);
}

/* AUTH-597: el envío a UNA persona (la plantilla «beneficios»,
   como siempre) vive en la pantalla de envío, junto a la
   elección de pool: un solo sitio para enviar. Mismo gesto,
   misma vía (mailSend con el idioma guardado de esa persona). */
function commsRenderOneBox() {
  const box = $('comms-one-box');
  if (!box || !COMMS || !COMMS.templates) return;
  const key = COMMS.selTpl;
  if (key !== 'benefits' || !COMMS.templates[key]) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="comms-oneperson">
      <label class="muted">${esc(t('comms.onePersonLabel'))} <select id="comms-one-user">${COMMS.users.filter(u => !u.isOwner && u.email && u.approved === true).map(u => `<option value="${esc(u.id)}">${esc(u.name || u.email)} (${esc(u.email)})</option>`).join('')}</select></label>
      <button type="button" class="btn-ghost btn-sm" id="comms-one-send">${esc(t('comms.onePersonBtn'))}</button>
      <span class="muted" id="comms-one-status"></span>
    </div>`;
  const os = $('comms-one-send');
  if (os) os.onclick = async () => {
    const uid = ($('comms-one-user') || {}).value || '';
    const st = $('comms-one-status');
    if (!uid) return;
    os.disabled = true;
    /* AUTH-2026-11-03-198: también el envío a UNA persona sale en
       el idioma guardado de ESA persona (mailLang → lang). */
    const res = await mailSend(uid, key, nudgeMailLangOf((COMMS.users || []).find(x => x.id === uid) || {}));
    if (res.ok) { commsBumpToday(); await commsAnnotate(uid, key, res); if (st) st.textContent = t('mail.sentOk', { email: res.to }); }
    else if (st) st.textContent = t('mail.sendFailed', { reason: commsReasonText(res) });
    os.disabled = false;
  };
}

function commsOpenEditor(key) {
  const box = $('comms-editor');
  if (!box || !COMMS.templates) return;
  const tpl = COMMS.templates[key] || { subject: { en: '', es: '' }, body: { en: '', es: '' }, artUrl: '', mediaUrl: '', mediaKind: '', videoUrl: '', trigger: 'manual', enabled: true };
  const isSystem = COMMS_SYSTEM_KEYS.includes(key);
  box.style.display = '';
  box.innerHTML = `<div class="panel comms-editor">
    <h3 class="history-title">${esc(t('comms.editTitle', { key }))}</h3>
    <label>${esc(t('comms.subjEn'))}<input type="text" id="ce-subj-en" value="${esc(tpl.subject.en || '')}"></label>
    <label>${esc(t('comms.subjEs'))}<input type="text" id="ce-subj-es" value="${esc(tpl.subject.es || '')}"></label>
    <label>${esc(t('comms.bodyEn'))}<textarea id="ce-body-en" rows="9">${esc(tpl.body.en || '')}</textarea></label>
    <label>${esc(t('comms.bodyEs'))}<textarea id="ce-body-es" rows="9">${esc(tpl.body.es || '')}</textarea></label>
    <label>${esc(t('comms.artLabel'))}<input type="text" id="ce-art" value="${esc(tpl.artUrl || '')}" placeholder="https://"></label>
    <label>${esc(t('comms.mediaLabel'))}<input type="text" id="ce-media" value="${esc(tpl.mediaUrl || '')}" placeholder="https://"></label>
    <label>${esc(t('comms.mediaKindLabel'))}<select id="ce-mkind">
      <option value=""${!tpl.mediaKind ? ' selected' : ''}>${esc(t('comms.mediaKindNone'))}</option>
      <option value="image"${tpl.mediaKind === 'image' ? ' selected' : ''}>${esc(t('comms.mediaKindImage'))}</option>
      <option value="video"${tpl.mediaKind === 'video' ? ' selected' : ''}>${esc(t('comms.mediaKindVideo'))}</option></select></label>
    <label>${esc(t('comms.videoLabel'))}<input type="text" id="ce-video" value="${esc(tpl.videoUrl || '')}" placeholder="https://"></label>
    <label>${esc(t('comms.triggerLabel'))}<select id="ce-trigger">
      <option value="manual"${tpl.trigger === 'manual' ? ' selected' : ''}>${esc(t('comms.triggerManual'))}</option>
      <option value="sweep-ask"${tpl.trigger === 'sweep-ask' ? ' selected' : ''}>${esc(t('comms.triggerAsk'))}</option>
      <option value="sweep-auto"${tpl.trigger === 'sweep-auto' ? ' selected' : ''}>${esc(t('comms.triggerAuto'))}</option></select></label>
    <label class="comms-check"><input type="checkbox" id="ce-enabled"${tpl.enabled !== false ? ' checked' : ''}> ${esc(t('comms.enabledLabel'))}</label>
    <p class="progress-hint" id="ce-error" style="display:none"></p>
    <div class="eval-actions">
      <button type="button" class="btn-primary btn-sm" id="ce-save">${esc(t('comms.saveBtn'))}</button>
      <button type="button" class="btn-ghost btn-sm" id="ce-preview">${esc(t('comms.previewBtn'))}</button>
      <button type="button" class="btn-ghost btn-sm" id="ce-cancel">${esc(t('comms.cancelBtn'))}</button>
      <button type="button" class="btn-ghost btn-sm" id="ce-delete">${esc(isSystem ? t('comms.disableBtn') : t('comms.deleteBtn'))}</button>
    </div>
    <div id="ce-preview-box" style="display:none"></div>
  </div>`;
  const err = (msg) => { const e = $('ce-error'); if (e) { e.textContent = msg; e.style.display = ''; } };
  const read = () => ({
    subject: { en: ($('ce-subj-en').value || '').trim(), es: ($('ce-subj-es').value || '').trim() },
    body: { en: $('ce-body-en').value || '', es: $('ce-body-es').value || '' },
    artUrl: ($('ce-art').value || '').trim(), mediaUrl: ($('ce-media').value || '').trim(),
    mediaKind: $('ce-mkind').value || '', videoUrl: ($('ce-video').value || '').trim(),
    trigger: $('ce-trigger').value || 'manual', enabled: $('ce-enabled').checked,
  });
  $('ce-preview').onclick = () => {
    const v = read();
    const pv = $('ce-preview-box');
    const u = COMMS.users.find(x => !x.isOwner && x.email) || null;
    const en = commsFillPreview(v, 'en', u, null);
    pv.style.display = '';
    pv.innerHTML = `<div class="comms-preview"><b>${esc(en.subject)}</b><pre>${esc(en.body)}</pre></div>`;
  };
  $('ce-cancel').onclick = () => { box.style.display = 'none'; box.innerHTML = ''; };
  $('ce-delete').onclick = async () => {
    if (isSystem) {
      if (!confirm(t('comms.confirmDisable', { key }))) return;
      await commsSaveTpl(key, { ...tpl, enabled: false });
    } else {
      if (!confirm(t('comms.confirmDelete', { key }))) return;
      try {
        await setDoc(doc(db, 'app_settings', 'mail_templates'), { templates: { [key]: deleteField() }, rev: (COMMS.rev || 0) + 1, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid }, { merge: true });
        delete COMMS.templates[key]; COMMS.rev = (COMMS.rev || 0) + 1; COMMS.selTpl = 'welcome';
        toast(t('comms.deletedOk'));
      } catch { toast(t('comms.saveError')); return; }
    }
    box.style.display = 'none'; box.innerHTML = '';
    renderComms();
  };
  $('ce-save').onclick = async () => {
    const v = read();
    if (!v.subject.en || !v.subject.es || !v.body.en.trim() || !v.body.es.trim()) { err(t('comms.errRequired')); return; }
    if ([v.subject.en, v.subject.es, v.body.en, v.body.es].some(commsBanned)) { err(t('comms.errBanned')); return; }
    for (const url of [v.artUrl, v.mediaUrl, v.videoUrl]) { if (url && !url.startsWith('https://')) { err(t('comms.errUrl')); return; } }
    const ok = await commsSaveTpl(key, v);
    if (ok) { box.style.display = 'none'; box.innerHTML = ''; renderComms(); }
    else err(t('comms.saveError'));
  };
}
async function commsSaveTpl(key, tpl) {
  try {
    await setDoc(doc(db, 'app_settings', 'mail_templates'),
      { templates: { [key]: tpl }, rev: (COMMS.rev || 0) + 1, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid }, { merge: true });
    COMMS.templates[key] = tpl;
    COMMS.rev = (COMMS.rev || 0) + 1;
    toast(t('comms.savedOk', { rev: COMMS.rev }));
    return true;
  } catch { return false; }
}

function commsRenderSweep() {
  const box = $('comms-sweep');
  if (!box || !COMMS.templates) return;
  const groups = commsSweepGroups();
  if (!groups.length) { box.innerHTML = `<div class="panel"><b>${esc(t('comms.sweepTitle'))}</b><p class="progress-hint">${esc(t('comms.sweepEmpty'))}</p></div>`; return; }
  box.innerHTML = `<div class="panel"><b>${esc(t('comms.sweepTitle'))}</b>
    <p class="progress-hint">${esc(t('comms.todayCount', { n: commsTodayCount(), cap: COMMS_CAP }))}</p>
    ${groups.map((g, gi) => `<div class="comms-sweep-group" data-sweep="${gi}">
      <span><b>${esc(t(g.labelKey))}</b> — ${esc(t('comms.detected', { n: g.members.length }))} · ${esc(commsTriggerLabel(g.trigger))}</span>
      <div class="eval-actions">
        <button type="button" class="btn-ghost btn-sm" data-sweep-preview="${gi}">${esc(t('comms.previewBtn'))}</button>
        ${g.trigger === 'sweep-auto' ? '' : `<button type="button" class="btn-primary btn-sm" data-sweep-send="${gi}">${esc(t('comms.sendTheseBtn', { n: g.members.length }))}</button>`}
      </div>
      <div class="comms-preview-list" data-sweep-list="${gi}" style="display:none"></div>
      <div class="comms-run" data-sweep-run="${gi}" style="display:none"><div class="comms-run-head"></div>${commsRunControlsHTML()}<div class="comms-run-list"></div></div>
    </div>`).join('')}
  </div>`;
  groups.forEach((g, gi) => {
    const pv = box.querySelector(`[data-sweep-preview="${gi}"]`);
    if (pv) pv.onclick = () => {
      const list = box.querySelector(`[data-sweep-list="${gi}"]`);
      if (!list) return;
      if (list.style.display !== 'none') { list.style.display = 'none'; return; }
      list.innerHTML = g.members.map(m => `<div class="comms-run-line">${esc(m.u.name || m.u.email)} (${esc(m.u.email)})${m.plan ? ' · ' + esc(t('comms.planBy', { title: m.plan.title || m.plan.id, trainer: commsTrainerName(commsEffRel(m.u).trainerUid) })) : ''}</div>`).join('');
      list.style.display = '';
    };
    const sd = box.querySelector(`[data-sweep-send="${gi}"]`);
    if (sd) sd.onclick = async () => {
      const runBox = box.querySelector(`[data-sweep-run="${gi}"]`);
      if (runBox) { runBox.style.display = ''; commsWireRunControls(runBox); }
      sd.disabled = true;
      await commsRunQueue(g.tplKey, g.members, commsQueueUI(runBox));
      commsRenderSweep();
      commsRenderSendPanel();
    };
  });
}

function commsRenderSendPanel() {
  const sel = $('comms-pool-sel');
  const box = $('comms-send-box');
  if (!sel || !box || !COMMS.templates) return;
  /* AUTH-597: el bloque de envío a una persona vive en esta
     misma pantalla, sobre el panel de pool. */
  commsRenderOneBox();
  const cur = COMMS.selPool && COMMS_POOLS.some(p => p.id === COMMS.selPool) ? COMMS.selPool : 'allApproved';
  COMMS.selPool = cur;
  sel.innerHTML = COMMS_POOLS.map(p => {
    const ready = commsPoolReady(p);
    const n = ready ? commsPoolMembers(p.id).length : '—';
    return `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(t('comms.pool.' + p.id))} (${n})</option>`;
  }).join('');
  sel.onchange = () => { COMMS.selPool = sel.value; commsRenderSendPanel(); };
  const sendBtn = $('comms-send-btn');
  const members = commsPoolMembers(cur).map(u => ({ u, plan: commsPlanByTrainer(u) }));
  const tpl = COMMS.templates[COMMS.selTpl];
  if (!tpl) { box.innerHTML = ''; return; }
  const first = members[0];
  /* AUTH-2026-11-03-198: la vista previa se pinta en el idioma
     guardado del primer destinatario — el correo exacto que
     recibirá — y no en el idioma de la sesión del propietario. */
  const pv = first ? commsFillPreview(tpl, nudgeMailLangOf(first.u), first.u, first.plan) : null;
  /* AUTH-597 (pliegues nº 15): la previa y la lista de
     destinatarios nacen recogidas tras «Ver más»; la línea de
     cuenta queda a la vista como resumen. */
  box.innerHTML = `<p class="progress-hint">${esc(t('comms.recipients', { n: members.length }))} · ${esc(commsTplTitle(COMMS.selTpl))} · ${esc(t('comms.todayCount', { n: commsTodayCount(), cap: COMMS_CAP }))}</p>
    ${first ? `<div class="comms597-morewrap"><button type="button" class="eval-more-btn" id="comms597-more-btn" aria-expanded="false">${esc(t('prof595.more'))} <span aria-hidden="true">▾</span></button>
    <div id="comms597-more-body" style="display:none"><div class="comms-preview"><div class="muted">${esc(t('comms.previewFor', { name: first.u.name || first.u.email }))}</div><b>${esc(pv.subject)}</b><pre>${esc(pv.body)}</pre></div>
    <div class="comms-preview-list">${members.map(m => `<div class="comms-run-line">${esc(m.u.name || m.u.email)} (${esc(m.u.email)})</div>`).join('')}</div></div></div>`
    : `<p class="progress-hint">${esc(t('comms.noRecipients'))}</p>`}
    <div class="comms-run" id="comms-send-run" style="display:none"><div class="comms-run-head"></div>${commsRunControlsHTML()}<div class="comms-run-list"></div></div>`;
  const moreBtn = $('comms597-more-btn');
  if (moreBtn) moreBtn.onclick = () => {
    const mb = $('comms597-more-body'); if (!mb) return;
    const open = mb.style.display !== 'none';
    mb.style.display = open ? 'none' : '';
    moreBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
    moreBtn.innerHTML = `${esc(t(open ? 'prof595.more' : 'prof595.less'))} <span aria-hidden="true">${open ? '▾' : '▴'}</span>`;
  };
  if (sendBtn) {
    sendBtn.disabled = !members.length || tpl.enabled === false;
    sendBtn.onclick = async () => {
      const runBox = $('comms-send-run');
      if (runBox) { runBox.style.display = ''; commsWireRunControls(runBox); }
      sendBtn.disabled = true;
      await commsRunQueue(COMMS.selTpl, members, commsQueueUI(runBox));
      commsRenderSendPanel();
      commsRenderSweep();
    };
  }
}

/* Barrido al abrir la app del administrador (diseño §4.4): detecta
   en silencio y, SOLO para las plantillas en modo automático, envía
   y deja el resultado en la bandeja. En modo «pide tu toque» (el
   aprobado por Ronald) nada sale sin su toque con previa. */
async function commsWarm() {
  if (!IS_OWNER) return;
  try {
    if (!COMMS) await commsLoadData();
    if (!COMMS || !COMMS.templates) return;
    const groups = commsSweepGroups().filter(g => g.trigger === 'sweep-auto');
    for (const g of groups) {
      await commsRunQueue(g.tplKey, g.members, { onProgress() {} });
    }
  } catch {}
}

/* Únicas exportaciones de la vista: las dos puertas que el núcleo
   llama por su nombre de siempre (renderComms en switchTab y
   commsWarm tras el registro), ahora tras el cargador de vistas. */
export { renderComms, commsWarm };
