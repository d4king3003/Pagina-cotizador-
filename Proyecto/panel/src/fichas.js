// Las fichas se incluyen en el HTML; no se guardan en el espacio de clientes.
let technicalSheetCatalog;
const technicalSheetImages = new Map();

function technicalSheets() {
 if (!technicalSheetCatalog) {
  technicalSheetCatalog = JSON.parse($('technical-sheets-catalog')?.textContent || '[]');
 }
 return technicalSheetCatalog;
}

function technicalSheet(id) {
 return technicalSheets().find(sheet => sheet.id === id);
}

function technicalSheetImage(id) {
 if (technicalSheetImages.has(id)) return technicalSheetImages.get(id);
 const sheet = technicalSheet(id);
 const source = $('technical-sheet-' + id);
 if (!sheet || !source) throw new Error('No se encontró la imagen de esta ficha.');
 const raw = atob(source.textContent.trim());
 const bytes = new Uint8Array(raw.length);
 for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
 const blob = new Blob([bytes], {type: 'image/png'});
 const image = {blob, url: URL.createObjectURL(blob)};
 technicalSheetImages.set(id, image);
 return image;
}

function renderTechnicalSheets() {
 const catalog = technicalSheets();
 const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
 const query = normalize(ui.sheetSearch || '').trim();
 const filtered = catalog.filter(sheet => normalize(sheet.title + ' ' + sheet.category + ' ' + sheet.id).includes(query));
 let selected = filtered.find(sheet => sheet.id === ui.sheetId) || filtered[0];
 if (selected) ui.sheetId = selected.id;
 const count = query ? filtered.length + ' de ' + catalog.length : String(catalog.length);
 $('view-fichas').innerHTML = heading('Fichas técnicas', 'Elegí el modelo, copiá su ficha y pegala en el chat de WhatsApp.', badge(catalog.length + ' modelos', 'green')) +
 `<div class="sheet-layout">
  <aside class="card sheet-library" aria-label="Elegir ficha técnica">
   <div class="sheet-library-top"><h2>Modelos disponibles</h2><p class="subtext">${count} fichas para compartir</p>${searchBox('sheet-search', ui.sheetSearch || '', 'Buscar modelo…')}</div>
   <div class="sheet-models" aria-label="Modelos con ficha técnica">${filtered.map(sheet => `<button type="button" class="sheet-model${sheet.id === selected?.id ? ' selected' : ''}" data-action="select-sheet" data-id="${esc(sheet.id)}" aria-pressed="${sheet.id === selected?.id}"><img src="${sheet.thumbnail}" width="80" height="62" alt="" loading="lazy"><span><strong>${esc(sheet.title)}</strong><small>${esc(sheet.category)}</small></span>${sheet.id === selected?.id ? icon('check') : ''}</button>`).join('') || `<p class="sheet-no-results">No hay fichas con ese nombre. Probá con Apache, Raider, Sport o King.</p>`}</div>
  </aside>
  <div class="sheet-workspace">${selected ? technicalSheetPreview(selected) : `<div class="card">${empty('Buscá otro modelo', 'Borrá la búsqueda para ver las fichas disponibles.')}</div>`}</div>
 </div>`;
}

function technicalSheetPreview(sheet) {
 const image = technicalSheetImage(sheet.id);
 return `<section class="card sheet-preview" aria-labelledby="sheet-title">
  <div class="sheet-preview-top"><div><p class="eyebrow">FICHA TÉCNICA</p><h2 id="sheet-title">${esc(sheet.title)}</h2><p class="subtext">Imagen completa · ${sheet.width} × ${sheet.height} px · PNG</p></div><div class="sheet-actions"><button type="button" class="btn btn-primary" data-action="copy-sheet" data-id="${esc(sheet.id)}">${icon('copy')}Copiar imagen</button><button type="button" class="btn" data-action="download-sheet" data-id="${esc(sheet.id)}">${icon('download')}Descargar PNG</button></div></div>
  <button type="button" class="sheet-canvas" data-action="preview-sheet" data-id="${esc(sheet.id)}" aria-label="Ver ficha ampliada de ${esc(sheet.title)}"><img id="technical-sheet-preview" src="${image.url}" width="${sheet.width}" height="${sheet.height}" alt="Ficha técnica completa de ${esc(sheet.title)}" decoding="async"></button>
  <div class="sheet-preview-bottom"><span>${icon('document')}Ficha original del catálogo</span><button type="button" class="text-button" data-action="preview-sheet" data-id="${esc(sheet.id)}">Ver en grande ↗</button></div>
 </section>
 <div class="sheet-instructions"><span class="sheet-instructions-icon">${icon('chat')}</span><div><strong>Lista para tu conversación</strong><p>Presioná <b>Copiar imagen</b>, abrí el chat en WhatsApp Web o WhatsApp para PC y pegá con <kbd>Ctrl</kbd> + <kbd>V</kbd>. Si usás el teléfono, descargá el PNG y adjuntalo desde tu galería.</p><p id="sheet-copy-status" class="sheet-copy-status" role="status" aria-live="polite"></p></div></div>`;
}

function technicalSheetStatus(text, error = false, id = '') {
 if (id && ui.sheetId !== id) return;
 const status = $('sheet-copy-status');
 if (status) {
  status.textContent = text;
  status.classList.toggle('error', error);
 }
}

function showTechnicalSheet(sheet, manualCopy = false) {
 const image = technicalSheetImage(sheet.id);
 const description = manualCopy
  ? 'El navegador no permitió copiar automáticamente. Hacé clic derecho sobre la ficha y elegí «Copiar imagen»; después pegala en WhatsApp con Ctrl+V. También podés descargar el PNG y adjuntarlo.'
  : 'Esta es la imagen completa que se copia y descarga. Podés abrirla en tamaño original para acercar los detalles.';
 openModal(sheet.title, `<p class="subtext sheet-modal-description">${description}</p><div class="sheet-large"><img src="${image.url}" width="${sheet.width}" height="${sheet.height}" alt="Ficha técnica completa de ${esc(sheet.title)}"></div>`, `<a class="btn" href="${image.url}" target="_blank" rel="noopener noreferrer">Ver tamaño original ↗</a><button type="button" class="btn" data-action="download-sheet" data-id="${esc(sheet.id)}">${icon('download')}Descargar PNG</button>${manualCopy ? '' : `<button type="button" class="btn btn-primary" data-action="copy-sheet" data-id="${esc(sheet.id)}">${icon('copy')}Copiar imagen</button>`}<button type="button" class="btn" data-close>Cerrar</button>`, 1250);
}

async function copyTechnicalSheet(id, button) {
 const sheet = technicalSheet(id);
 if (!sheet) return;
 const label = button.innerHTML;
 button.disabled = true;
 button.setAttribute('aria-busy', 'true');
 button.textContent = 'Copiando…';
 try {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('clipboard-unavailable');
  // PNG real en el portapapeles; funciona sin conexiones ni capturas de pantalla.
  const image = technicalSheetImage(id);
  await navigator.clipboard.write([new ClipboardItem({'image/png': image.blob})]);
  technicalSheetStatus('Imagen copiada. Pegala en WhatsApp con Ctrl+V.', false, id);
  toast('Imagen copiada. Abrí el chat de WhatsApp y pegala con Ctrl+V.');
 } catch (error) {
  technicalSheetStatus('Podés copiarla con clic derecho o descargar el PNG.', true, id);
  try { showTechnicalSheet(sheet, true); }
  catch { toast('No se pudo abrir la ficha. Volvé a seleccionar el modelo.', true); }
 } finally {
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.innerHTML = label;
 }
}

function downloadTechnicalSheet(id) {
 const sheet = technicalSheet(id);
 if (!sheet) return;
 try {
  download('Ficha-TVS-' + sheet.id + '.png', technicalSheetImage(id).blob, 'image/png');
  technicalSheetStatus('PNG descargado. Ya podés adjuntarlo en WhatsApp.', false, id);
  toast('Ficha descargada como imagen PNG.');
 } catch {
  toast('No se pudo descargar la ficha. Volvé a seleccionar el modelo.', true);
 }
}

// ===== Visor con zoom: para enseñarle la ficha al cliente =====
// Pellizcar con dos dedos o la rueda del mouse acerca; arrastrar mueve; doble toque acerca o vuelve a la vista completa.
function openSheetZoom(id) {
 const sheet = technicalSheet(id);
 if (!sheet) return;
 let image;
 try { image = technicalSheetImage(id); } catch { toast('No se pudo abrir la ficha. Volvé a seleccionar el modelo.', true); return; }
 document.querySelector('.sheet-zoom')?.remove();
 const W = sheet.width, H = sheet.height;
 const box = document.createElement('div');
 box.className = 'sheet-zoom';
 box.setAttribute('role', 'dialog');
 box.setAttribute('aria-modal', 'true');
 box.setAttribute('aria-label', 'Ficha técnica de ' + sheet.title);
 box.innerHTML = `<div class="sheet-zoom-stage"><img src="${image.url}" width="${W}" height="${H}" alt="Ficha técnica completa de ${esc(sheet.title)}" draggable="false"></div>
 <div class="sheet-zoom-top"><strong>${esc(sheet.title)}</strong><button type="button" class="sheet-zoom-btn" data-zoom="close" aria-label="Cerrar visor">✕</button></div>
 <div class="sheet-zoom-bar">
  <button type="button" class="sheet-zoom-btn" data-zoom="out" aria-label="Alejar">−</button>
  <button type="button" class="sheet-zoom-btn sheet-zoom-level" data-zoom="fit" aria-label="Ver la ficha completa">100%</button>
  <button type="button" class="sheet-zoom-btn" data-zoom="in" aria-label="Acercar">+</button>
  <span class="sheet-zoom-sep"></span>
  <button type="button" class="sheet-zoom-btn" data-action="copy-sheet" data-id="${esc(sheet.id)}" aria-label="Copiar imagen">${icon('copy')}</button>
  <button type="button" class="sheet-zoom-btn" data-action="download-sheet" data-id="${esc(sheet.id)}" aria-label="Guardar imagen">${icon('download')}</button>
 </div>
 <p class="sheet-zoom-hint">Pellizcá con dos dedos o tocá dos veces para acercar</p>`;
 document.body.append(box);
 const stage = box.querySelector('.sheet-zoom-stage'), img = stage.querySelector('img'), level = box.querySelector('.sheet-zoom-level');
 let fit = 1, s = 1, x = 0, y = 0;
 const view = () => stage.getBoundingClientRect();
 const clamp = () => {
  const r = view(), w = W * s, h = H * s;
  x = w <= r.width ? (r.width - w) / 2 : Math.min(0, Math.max(r.width - w, x));
  y = h <= r.height ? (r.height - h) / 2 : Math.min(0, Math.max(r.height - h, y));
 };
 const apply = (animate = false) => {
  clamp();
  img.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
  img.style.transform = `translate(${x}px,${y}px) scale(${s})`;
  level.textContent = Math.round(s / fit * 100) + '%';
  box.classList.toggle('zoomed', s > fit * 1.01);
 };
 const fitView = () => { const r = view(); fit = Math.min(r.width / W, r.height / H); s = fit; x = 0; y = 0; apply(); };
 // Acercar manteniendo fijo el punto (cx, cy) de la pantalla
 const zoomAt = (ns, cx, cy, animate = false) => {
  const r = view(); ns = Math.min(fit * 8, Math.max(fit, ns));
  const px = cx - r.left, py = cy - r.top;
  x = px - (px - x) * ns / s; y = py - (py - y) * ns / s; s = ns; apply(animate);
 };
 const center = () => { const r = view(); return [r.left + r.width / 2, r.top + r.height / 2]; };
 fitView();
 const onResize = () => { const rel = s / fit; const r = view(); fit = Math.min(r.width / W, r.height / H); s = fit * rel; apply(); };
 window.addEventListener('resize', onResize);

 // Toques y mouse
 const pts = new Map();
 let start = null, lastTap = 0, moved = false;
 const snapshot = () => {
  const p = [...pts.values()];
  if (p.length >= 2) {
   const [a, b] = p;
   start = {two: true, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s, x, y};
  } else if (p.length === 1) start = {two: false, px: p[0].x, py: p[0].y, x, y};
  else start = null;
 };
 stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (pts.size === 1) moved = false;
  snapshot(); box.classList.add('touched');
 });
 stage.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId) || !start) return;
  pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
  const p = [...pts.values()];
  if (start.two && p.length >= 2) {
   const [a, b] = p, d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
   const r = view(), ns = Math.min(fit * 8, Math.max(fit * .9, start.s * d / start.d));
   const px = start.mx - r.left, py = start.my - r.top;
   x = mx - r.left - (px - start.x) * ns / start.s; y = my - r.top - (py - start.y) * ns / start.s; s = ns;
   moved = true; apply();
  } else if (!start.two) {
   const dx = e.clientX - start.px, dy = e.clientY - start.py;
   if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
   x = start.x + dx; y = start.y + dy; apply();
  }
 });
 const end = e => {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  if (s < fit) { s = fit; apply(true); }
  snapshot();
  if (e.type === 'pointerup' && pts.size === 0 && !moved) {
   const now = Date.now();
   if (now - lastTap < 320) { lastTap = 0; s > fit * 1.05 ? zoomAt(fit, e.clientX, e.clientY, true) : zoomAt(fit * 2.5, e.clientX, e.clientY, true); }
   else lastTap = now;
  }
 };
 stage.addEventListener('pointerup', end);
 stage.addEventListener('pointercancel', end);
 stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * .0018), e.clientX, e.clientY); }, {passive: false});

 // Cerrar: botón, Esc o el botón «atrás» del teléfono
 let closed = false;
 const close = fromHistory => {
  if (closed) return; closed = true;
  window.removeEventListener('resize', onResize); window.removeEventListener('popstate', onPop); document.removeEventListener('keydown', onKey, true);
  box.remove();
  if (!fromHistory && history.state?.sheetZoom) history.back();
 };
 const onPop = () => close(true);
 const onKey = e => {
  if (e.key === 'Escape') { e.preventDefault(); close(false); }
  else if (e.key === '+' || e.key === '=') zoomAt(s * 1.5, ...center(), true);
  else if (e.key === '-') zoomAt(s / 1.5, ...center(), true);
 };
 history.pushState({sheetZoom: true}, '');
 window.addEventListener('popstate', onPop);
 document.addEventListener('keydown', onKey, true);
 box.addEventListener('click', e => {
  const b = e.target.closest('[data-zoom]'); if (!b) return;
  const z = b.dataset.zoom;
  if (z === 'close') close(false);
  else if (z === 'in') zoomAt(s * 1.6, ...center(), true);
  else if (z === 'out') zoomAt(s / 1.6, ...center(), true);
  else if (z === 'fit') { s = fit; apply(true); }
 });
 box.querySelector('[data-zoom="close"]').focus({preventScroll: true});
}
