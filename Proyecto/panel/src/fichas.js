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
