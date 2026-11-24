/*
 * RONBO FIT — vista «Biblioteca» (view-library.js)
 *
 * L-2 «Arranque por vistas» · FASE 2 (P6 «Pintado por trozos y
 * arranque por vistas», 2026-11-23): segunda vista partida del
 * monolito, tras Comunicaciones (fase 1, AUTH-553). Este archivo es
 * el bloque BIBLIOTECA (vista propia) de app.js trasladado BYTE A
 * BYTE — mismas funciones, mismo estado (LIBADM_F), mismos textos
 * y mismas rutas de datos — con SOLO estos cambios declarados:
 * (a) el pintado por tramos del catálogo (40 + «ver más», clase C3
 * de la auditoría de repintado: libAdminChunkHTML y compañía, y el
 * reinicio del tramo al cambiar el contexto de filtro); (b) esta
 * cabecera y la línea de exportación del final.
 *
 * CÓMO VIVE: app.js lo importa con viewLoad('library') la primera
 * vez que la vista se abre (la pastilla «Biblioteca» de switchTab
 * sigue llamando renderLibrary(), sin saber que detrás hay una
 * carga); el service worker lo precarga en segundo plano con el
 * sello de la versión, así que la primera apertura es normalmente
 * instantánea y, sin precarga, se pide una sola vez y queda en la
 * caché de la cáscara.
 *
 * PUENTE: la vista usa del núcleo SOLO nombres publicados por el
 * anfitrión de vistas de app.js como accesos VIVOS en el ámbito
 * global — funciones de la casa ($, t, esc, toast, failToast,
 * libEnsure, libField, libNameOf, libByLineHTML, libStateBadge,
 * gripPendMarkHTML, libNorm, libGroupKey, libFacetKey, libSections,
 * libGroupCounts, libChipsHTML, libWireChips, libFacetSheetOpen,
 * libFacetCounted, libFacetBtnFace, libFacetBtnWire,
 * libFacetValueLabel, libThumbSrc, ytThumbOf, libCardOpen,
 * libOpenEditor, libMemPut, libMemDrop), enlaces del SDK (auth, db,
 * setDoc, deleteDoc, doc, serverTimestamp) y estado/constantes
 * (ROLE, LANG, LIB, LIB_BY_ID, LIB_OWN, LIB_PENDING, LIB_STATE,
 * LIBADM_WRITE_ENABLED, LIB_CAT_ORDER, LIB_LEVEL_ORDER) —. La
 * vista no escribe en ninguno: su estado (LIBADM_F y el tramo) es
 * suyo y vive aquí dentro. El estado y la carga del catálogo, el
 * editor de la ficha y «Asignar desde la Biblioteca» se quedan en
 * el núcleo: son maquinaria compartida, no la vista de consulta.
 */

/* ================= BIBLIOTECA (vista propia) =================
   Nació en la corrección de la reprueba (2026-10-24) como la mesa de
   trabajo del administrador sobre el catálogo de fábrica, y la
   decisión de Ronald de esa misma noche (20:57) la hizo COMUNITARIA:
   la píldora y la vista las tienen el administrador Y el entrenador.
   - El catálogo compartido (fábrica + aportes aprobados) se busca y
     se consulta aquí; el administrador edita cualquier ficha y da de
     alta ejercicios que nacen aprobados con su firma; el entrenador
     lo consulta en lectura.
   - «Mis aportes»: los ejercicios del propio usuario con su estado;
     el autor edita y borra lo suyo en pendiente/rechazado, y al
     guardar un rechazado lo REENVÍA a revisión.
   - «Crear ejercicio» (entrenador): el mismo formulario completo del
     administrador; el aporte nace 'pendiente' con su autoría y solo
     lo ven él y el administrador hasta la aprobación.
   - La BANDEJA del administrador: los pendientes con su conteo;
     aprobar firma la decisión (approvedBy/approvedAt) y el ejercicio
     entra en el catálogo de todos (esta lista, el navegador del
     editor de planes y el catálogo del cliente, que leen de LIB);
     rechazar lo devuelve al autor con su nota suave.
   Todo ejercicio comunitario aprobado lleva en su tarjeta la marca
   «Creado por {nombre} · {fecha}»; la fábrica, sin marca. NO es el
   explorador visual del editor de planes (ese queda intacto): esto
   escribe en exercise_library, y la memoria de la sesión
   (LIB/LIB_BY_ID/LIB_OWN/LIB_PENDING) se actualiza en el acto. El
   guardado usa merge: los campos que el formulario no trae quedan
   como estaban. Las reglas del paquete son la barrera real; la
   interfaz solo ofrece lo que cada rol puede hacer. */
const LIBADM_F = { group: '', cat: '', level: '' }; // facetas de la vista (paquete de categorías): grupo (chip) + categoría + nivel
async function renderLibrary() {
  const sec = $('library-section'); if (!sec) return;
  if (ROLE !== 'administrador' && ROLE !== 'entrenador') { sec.style.display = 'none'; return; }
  sec.style.display = '';
  const sub = $('lib-role-sub');
  if (sub) sub.textContent = t(ROLE === 'administrador' ? 'libcom.subAdmin' : 'libcom.subTrainer');
  const hint = $('lib-hint');
  if (hint) hint.textContent = t(ROLE === 'administrador' ? 'libadm.hint' : 'libcom.hintTrainer');
  const nb = $('lib-admin-new');
  if (nb) nb.textContent = t(ROLE === 'administrador' ? 'libadm.new' : 'libcom.createBtn');
  if (nb && !nb.dataset.wired) {
    nb.dataset.wired = '1';
    nb.onclick = () => libOpenEditor(null, ROLE === 'administrador' ? 'admin' : 'mine');
  }
  const q = $('lib-admin-q');
  if (q && !q.dataset.wired) { q.dataset.wired = '1'; q.addEventListener('input', () => libAdminListReset()); }
  await libEnsure();
  LIBADM_SHOWN = LIB_CHUNK;
  libRenderTray();
  libAdminRenderList();
  libRenderMine();
}
/* BANDEJA DEL ADMINISTRADOR: los aportes en 'pendiente', con su
   conteo. Aprobar firma la decisión y el ejercicio entra en el
   catálogo de todos; rechazar se lo devuelve a su autor. */
/* TARJETA DE BIBLIOTECA CON FOTO GRANDE (2026-10-30, orden directa
   de Ronald con captura): la miniatura redonda pequeña da paso a un
   CUADRADO grande (84×84) alineado a la IZQUIERDA de la tarjeta, con
   el texto — y el botón donde la vista lo tenga — en la columna de
   su derecha. Sin foto, el cuadrado lleva la MINIATURA TEMPORAL
   del video de la ficha (puntos 94/95: la sirve el propio YouTube
   y solo aparece sin foto propia; si no carga, ytThumbErr la
   devuelve a este bloque); sin video utilizable, el bloque suave
   de la ficha (AUTH-087): mismo tamaño y posición, con la marca de
   video si la ficha lo tiene; la marca es SOLO visual (un span): el
   toque de la tarjeta sigue haciendo lo que hacía en cada vista
   (abrir la ficha en el catálogo; nada en bandeja y aportes, cuyos
   botones viven dentro de la columna). */
function libCardMediaHTML(ex) {
  if (ex.foto_url) {
    const th = libThumbSrc(ex.foto_url);
    if (th !== ex.foto_url) return `<img class="lib-thumb" src="${esc(th)}" alt="" loading="lazy" decoding="async" data-full="${esc(ex.foto_url)}" onerror="libThumbErr(this)">`;
    return `<img class="lib-thumb" src="${esc(ex.foto_url)}" alt="" loading="lazy" decoding="async">`;
  }
  const th = ytThumbOf(ex.video_youtube_url);
  if (th) return `<img class="lib-thumb" src="${esc(th)}" alt="" loading="lazy" data-yt-fb="lib" onerror="ytThumbErr(this)">`;
  return `<div class="lib-thumb lib-thumb-soft" aria-hidden="true">${ex.video_youtube_url ? `<span class="lib-thumb-play">▶</span><span class="lib-thumb-lab">${esc(t('train.lib.video'))}</span>` : `<span class="lib-thumb-glyph">🏋️</span>`}</div>`;
}
function libRenderTray() {
  const box = $('lib-pending-box'); if (!box) return;
  if (ROLE !== 'administrador' || !LIB_PENDING || !LIB_PENDING.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = '';
  const rows = [...LIB_PENDING].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  box.innerHTML = `<h3 class="history-title">${esc(t('libcom.trayTitle', { n: rows.length }))}</h3>` + rows.map(ex => `
    <div class="user-row lib-ex-row">
      ${libCardMediaHTML(ex)}
      <div class="lib-card-main"><div><b>${esc(libNameOf(ex))}</b>${gripPendMarkHTML(ex)}<br><span class="muted">${esc(libField(ex, 'grupo_muscular'))}${(ex.equipo_es || ex.equipo_en) ? ' · ' + esc(libField(ex, 'equipo')) : ''}</span>${libByLineHTML(ex)}</div>
      <div class="user-actions"><button type="button" class="btn-primary btn-sm" data-lib-approve="${esc(ex.id)}">${esc(t('libcom.approve'))}</button><button type="button" class="btn-ghost btn-sm" data-lib-reject="${esc(ex.id)}">${esc(t('libcom.reject'))}</button></div></div>
    </div>`).join('');
  box.querySelectorAll('[data-lib-approve]').forEach(b => b.onclick = () => libDecide(b.dataset.libApprove, true));
  box.querySelectorAll('[data-lib-reject]').forEach(b => b.onclick = () => libDecide(b.dataset.libReject, false));
}
async function libDecide(id, approve) {
  if (ROLE !== 'administrador') return;
  const ex = LIB_BY_ID[id]; if (!ex) return;
  const uid = auth.currentUser.uid;
  const patch = approve
    ? { estado: 'aprobado', approvedAt: serverTimestamp(), approvedBy: uid, updatedAt: serverTimestamp(), updatedBy: uid }
    : { estado: 'rechazado', updatedAt: serverTimestamp(), updatedBy: uid };
  try {
    await setDoc(doc(db, 'exercise_library', id), patch, { merge: true });
    const merged = { ...ex, estado: approve ? 'aprobado' : 'rechazado', updatedBy: uid };
    if (approve) { merged.approvedBy = uid; merged.approvedAt = new Date(); }
    libMemPut(merged);
    toast(t(approve ? 'libcom.approvedToast' : 'libcom.rejectedToast'));
    libRenderTray(); libAdminRenderList(); libRenderMine();
  } catch (e) { failToast(e); }
}
/* «MIS APORTES»: lo del propio usuario con su estado. El autor
   edita/borra lo suyo en pendiente o rechazado (las reglas ponen el
   mismo límite); lo aprobado ya es de la comunidad y aquí solo se
   muestra, con su insignia. */
function libRenderMine() {
  const box = $('lib-mine-box'); if (!box) return;
  const rows = [...(LIB_OWN || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  box.innerHTML = `<h3 class="history-title">${esc(t('libcom.mineTitle'))}</h3>
    <p class="progress-hint">${esc(t('libcom.mineHint'))}</p>` + (rows.length ? rows.map(ex => {
    const editable = ex.estado === 'pendiente' || ex.estado === 'rechazado';
    const note = ex.estado === 'rechazado' ? `<br><span class="muted">${esc(t('libcom.rejectedNote'))}</span>`
      : ex.estado === 'pendiente' ? `<br><span class="muted">${esc(t('libcom.pendingNote'))}</span>` : '';
    return `
    <div class="user-row lib-ex-row">
      ${libCardMediaHTML(ex)}
      <div class="lib-card-main"><div><b>${esc(libNameOf(ex))}</b>${libStateBadge(ex)}${gripPendMarkHTML(ex)}<br><span class="muted">${esc(libField(ex, 'grupo_muscular'))}${(ex.equipo_es || ex.equipo_en) ? ' · ' + esc(libField(ex, 'equipo')) : ''}</span>${libByLineHTML(ex)}${note}</div>
      ${(editable && LIBADM_WRITE_ENABLED) || ex.estado === 'aprobado' ? `<div class="user-actions">${ex.estado === 'aprobado' ? `<button type="button" class="btn-ghost btn-sm" data-lib-assign="${esc(ex.id)}">${esc(t('lib.assign.btn'))}</button>` : ''}${editable && LIBADM_WRITE_ENABLED ? `<button type="button" class="btn-ghost btn-sm" data-lib-mine-edit="${esc(ex.id)}">${esc(t('libadm.edit'))}</button><button type="button" class="btn-ghost btn-sm" data-lib-mine-del="${esc(ex.id)}">${esc(t('libcom.del'))}</button>` : ''}</div>` : ''}</div>
    </div>`;
  }).join('') : `<div class="wempty">${esc(t('libcom.mineEmpty'))}</div>`);
  box.querySelectorAll('[data-lib-mine-edit]').forEach(b => b.onclick = () => libOpenEditor(b.dataset.libMineEdit, 'mine'));
  box.querySelectorAll('[data-lib-mine-del]').forEach(b => b.onclick = () => libDeleteOwn(b.dataset.libMineDel));
}
async function libDeleteOwn(id) {
  const ex = LIB_BY_ID[id]; if (!ex) return;
  if (ex.createdBy !== auth.currentUser.uid) return;
  if (!window.confirm(t('libcom.delConfirm'))) return;
  try {
    await deleteDoc(doc(db, 'exercise_library', id));
    libMemDrop(id);
    toast(t('libcom.deletedToast'));
    libRenderMine(); libAdminRenderList(); libRenderTray();
  } catch (e) { failToast(e); }
}
function libAdminFiltered() {
  if (LIB_STATE !== 'ok' || !LIB) return [];
  const q = libNorm(($('lib-admin-q') || {}).value || '').trim();
  const all = [...LIB].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!q) return all;
  const terms = q.split(/\s+/);
  return all.filter(ex => terms.every(tm => libNorm([ex.nombre_es, ex.nombre_en, ex.grupo_muscular_es, ex.grupo_muscular_en, ex.equipo_es, ex.equipo_en, ex.id].join(' ')).includes(tm)));
}
/* La búsqueda primero (libAdminFiltered); encima, las facetas. Con
   ignore se obtiene el contexto de conteo de una faceta (los chips
   cuentan sin el grupo; cada selector no se filtra a sí mismo). */
function libAdminFaceted(ignore) {
  let rows = libAdminFiltered();
  if (ignore !== 'cat' && LIBADM_F.cat) rows = rows.filter(ex => libFacetKey(ex, 'categoria') === LIBADM_F.cat);
  if (ignore !== 'level' && LIBADM_F.level) rows = rows.filter(ex => libFacetKey(ex, 'nivel') === LIBADM_F.level);
  if (ignore !== 'group' && LIBADM_F.group) rows = rows.filter(ex => libGroupKey(ex) === LIBADM_F.group);
  return rows;
}
function libAdminRowHTML(ex) {
  return `
    <div class="user-row lib-ex-row lib-card-row" data-lib-card="${esc(ex.id)}">
      ${libCardMediaHTML(ex)}
      <div class="lib-card-main"><div><b>${esc(libNameOf(ex))}</b>${gripPendMarkHTML(ex)} <span class="muted">${esc(ex.id)}</span><br><span class="muted">${esc(libField(ex, 'grupo_muscular'))}${(ex.equipo_es || ex.equipo_en) ? ' · ' + esc(libField(ex, 'equipo')) : ''}</span>${libByLineHTML(ex)}</div>
      <div class="user-actions"><button type="button" class="btn-ghost btn-sm" data-lib-assign="${esc(ex.id)}">${esc(t('lib.assign.btn'))}</button>${ROLE === 'administrador' && LIBADM_WRITE_ENABLED ? `<button type="button" class="btn-ghost btn-sm" data-lib-edit="${esc(ex.id)}">${esc(t('libadm.edit'))}</button>` : ''}</div></div>
    </div>`;
}
/* Las caras de los dos botones del catálogo: se repintan con
   cada pintado de la lista — el mismo latido con el que antes
   se rellenaban los selectores — y su toque abre la hoja. */
function libAdminFacetBtns() {
  const catBtn = $('lib-admin-cat-btn'), lvlBtn = $('lib-admin-level-btn');
  libFacetBtnWire(catBtn, () => libAdminFacetOpen('cat'));
  libFacetBtnWire(lvlBtn, () => libAdminFacetOpen('level'));
  libFacetBtnFace(catBtn, 'libcat.category', libFacetValueLabel('categoria', LIB_CAT_ORDER, t('libcat.allCategories'), LIBADM_F.cat), !!LIBADM_F.cat);
  libFacetBtnFace(lvlBtn, 'libcat.level', libFacetValueLabel('nivel', LIB_LEVEL_ORDER, t('libcat.allLevels'), LIBADM_F.level), !!LIBADM_F.level);
}
function libAdminRenderList() {
  const box = $('lib-admin-list'); if (!box) return;
  const cnt = $('lib-admin-count');
  const chipsBox = $('lib-admin-chips');
  if (LIB_STATE !== 'ok') { box.innerHTML = `<div class="wempty">${esc(t('train.lib.unavailable'))}</div>`; if (cnt) cnt.textContent = ''; if (chipsBox) chipsBox.innerHTML = ''; return; }
  if (chipsBox) {
    const ctx = libAdminFaceted('group');
    chipsBox.innerHTML = libChipsHTML(libGroupCounts(ctx), ctx.length, LIBADM_F.group);
    libWireChips(chipsBox, k => { LIBADM_F.group = k; libAdminListReset(); });
  }
  libAdminFacetBtns();
  const rows = libAdminFaceted();
  if (cnt) cnt.textContent = t('libadm.count', { n: rows.length });
  const gateNote = LIBADM_WRITE_ENABLED ? '' : `<div class="wempty">${esc(t('libadm.readonlyNote'))}</div>`;
  box.innerHTML = gateNote + (rows.length ? libAdminChunkHTML(rows, 0, LIBADM_SHOWN) + libAdminMoreHTML(rows.length) : `<div class="wempty">${esc(t('libadm.empty'))}</div>`);
  libAdminWireRows(box);
  libAdminWireMore(box);
  /* LA FICHA DESDE LA BIBLIOTECA (D6, 2026-10-30): tocar el cuerpo
     de una fila del catálogo (fuera de sus botones) abre la ficha
     del ejercicio en solo lectura. Delegación ÚNICA sobre el
     contenedor: sobrevive a los re-pintados de la lista (filtros,
     «mostrar más») sin duplicar escuchas. */
  if (!box.dataset.cardWired) {
    box.dataset.cardWired = '1';
    box.addEventListener('click', e => {
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      const row = e.target.closest('[data-lib-card]');
      if (row) libCardOpen(row.dataset.libCard);
    });
  }
}
/* Las dos puertas de la hoja: el contexto de conteo es el de
   cada superficie sin la propia faceta (libAdminFaceted /
   vizFiltered con ignore), como contaban los chips. */
function libAdminFacetOpen(facet) {
  const isCat = facet === 'cat';
  const base = isCat ? 'categoria' : 'nivel';
  const order = isCat ? LIB_CAT_ORDER : LIB_LEVEL_ORDER;
  const c = libFacetCounted(libAdminFaceted(facet), base, order);
  libFacetSheetOpen({
    title: t(isCat ? 'libcat.category' : 'libcat.level'),
    allLabel: t(isCat ? 'libcat.allCategories' : 'libcat.allLevels'),
    total: c.total, options: c.options,
    current: isCat ? LIBADM_F.cat : LIBADM_F.level,
    onPick: key => { if (isCat) LIBADM_F.cat = key; else LIBADM_F.level = key; libAdminListReset(); }
  });
}
/* PINTADO POR TRAMOS DEL CATÁLOGO (P6, clase C3 de la auditoría
   de repintado): la lista pinta LIB_CHUNK filas y un botón
   «Mostrar más (quedan {n})» — el marcado y la clave de Recetas
   (.rcp-more + recipes.moreBtn) —; cada toque AÑADE el tramo
   siguiente sin tocar los nodos ya pintados. El tramo se
   reinicia cuando cambia el contexto (abrir la vista, buscar,
   chip de grupo, faceta): libAdminListReset es esa puerta; las
   repintadas por decisión de la bandeja, borrado propio o
   guardado de ficha llaman a libAdminRenderList a secas y
   conservan el tramo abierto. */
const LIB_CHUNK = 40;
let LIBADM_SHOWN = LIB_CHUNK;
function libAdminListReset() { LIBADM_SHOWN = LIB_CHUNK; libAdminRenderList(); }
/* El HTML de las filas [from, to) de la lista filtrada, con la
   cabecera de cada sección SOLO si su primera fila cae dentro
   del tramo (la cabecera dice el total de la sección, como
   siempre). */
function libAdminChunkHTML(rows, from, to) {
  let idx = 0, html = '';
  for (const sec of libSections(rows)) {
    const start = idx, end = idx + sec.items.length; idx = end;
    const a = Math.max(from, start), b = Math.min(to, end);
    if (a >= b) continue;
    if (a === start) html += `<div class="libcat-sec">${esc(sec.label)} <span class="libcat-sec-n">${sec.items.length}</span></div>`;
    html += sec.items.slice(a - start, b - start).map(libAdminRowHTML).join('');
  }
  return html;
}
function libAdminMoreHTML(total) {
  return LIBADM_SHOWN < total ? `<div class="rcp-more lib-more-wrap"><button type="button" class="btn-secondary" data-lib-more="1">${esc(t('recipes.moreBtn', { n: total - LIBADM_SHOWN }))}</button></div>` : '';
}
function libAdminWireRows(scope) {
  scope.querySelectorAll('[data-lib-edit]').forEach(b => b.onclick = () => libOpenEditor(b.dataset.libEdit, 'admin'));
}
function libAdminWireMore(box) {
  box.querySelectorAll('[data-lib-more]').forEach(b => b.onclick = () => libAdminShowMore());
}
/* «Ver más»: nace SOLO el tramo nuevo y se inserta antes del
   botón; las tarjetas ya pintadas conservan su nodo byte a byte
   y el desplazamiento no se mueve. El botón se repinta a sí
   mismo: su etiqueta ES su estado (cuántas quedan), como el
   botón «ver más» de Recetas. */
function libAdminShowMore() {
  const box = $('lib-admin-list'); if (!box) return;
  const rows = libAdminFaceted();
  const from = Math.min(LIBADM_SHOWN, rows.length);
  LIBADM_SHOWN = Math.min(rows.length, LIBADM_SHOWN + LIB_CHUNK);
  if (LIBADM_SHOWN <= from) return;
  const wrap = box.querySelector('.lib-more-wrap');
  const tmp = document.createElement('div');
  tmp.innerHTML = libAdminChunkHTML(rows, from, LIBADM_SHOWN);
  const frag = document.createDocumentFragment();
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  if (wrap) box.insertBefore(frag, wrap); else box.appendChild(frag);
  libAdminWireRows(box);
  if (wrap) { wrap.outerHTML = libAdminMoreHTML(rows.length); libAdminWireMore(box); }
}

/* El repintado de la vista que el núcleo invoca por su puerta
   (libViewRepaint): la revalidación del catálogo con la sección
   visible y el guardado de una ficha repintan bandeja, lista y
   aportes, como hacían las tres llamadas directas de antes. */
function libViewRepaint() { libRenderTray(); libAdminRenderList(); libRenderMine(); }

/* Únicas exportaciones de la vista: las dos puertas que el núcleo
   conoce (renderLibrary para switchTab y libViewRepaint para la
   revalidación del catálogo y el guardado de fichas). */
export { renderLibrary, libViewRepaint };
