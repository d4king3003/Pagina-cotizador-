// Exportación local de la tabla y la tarjeta: usa los resultados del cotizador.
let quoteImageBusy = false;
const QUOTE_IMAGE_BRANDING = /*QUOTE_IMAGE_BRANDING*/null;
let quoteImageModelContext = null;

function quoteImageModelLogo(id, label) {
 const logos = QUOTE_IMAGE_BRANDING?.models || {};
 if (logos[id]) return logos[id];
 const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^tvs/, '');
 const normalized = normalize(label);
 return Object.values(logos).find(logo => logo.aliases?.some(alias => normalized.startsWith(normalize(alias)))) || null;
}

function quoteImageAvailable() {
 return Boolean(currentQuote?.valid && currentQuote.fee !== null && currentQuote.selected && currentQuote.selected.eligible !== false);
}

function quoteImageSnapshot() {
 if (!quoteImageAvailable()) throw new Error('Completá el precio y elegí un plazo disponible.');
 const model = getModel(state.model);
 const quote = JSON.parse(JSON.stringify(currentQuote));
 const modelId = model?.id || quoteImageModelContext?.id || '';
 const modelLabel = model?.label || quoteImageModelContext?.label || '';
 return {
  quote, model: model ? {...model} : null,
  modelId, modelLabel,
  tvsLogo: QUOTE_IMAGE_BRANDING?.tvs || null,
  modelLogo: quoteImageModelLogo(modelId, modelLabel),
  detailsVisible: state.detailsVisible !== false,
  dark: state.theme === 'dark',
  terms: availableTerms(state).slice(),
  initialNote: $('initial-payment-note').textContent,
  interestLabel: $('interest-label').textContent,
  date: new Intl.DateTimeFormat('es-SV', {day:'2-digit', month:'2-digit', year:'numeric', timeZone:'America/El_Salvador'}).format(new Date())
 };
}

function quoteImagePath(ctx, x, y, width, height, radius) {
 const r = Math.min(radius, width / 2, height / 2);
 ctx.beginPath();
 ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y);
 ctx.quadraticCurveTo(x + width, y, x + width, y + r);
 ctx.lineTo(x + width, y + height - r);
 ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
 ctx.lineTo(x + r, y + height);
 ctx.quadraticCurveTo(x, y + height, x, y + height - r);
 ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
 ctx.closePath();
}

function quoteImageLines(ctx, value, width) {
 const words = String(value || '').split(/\s+/).filter(Boolean);
 const lines = []; let line = '';
 for (const word of words) {
  const trial = line ? line + ' ' + word : word;
  if (line && ctx.measureText(trial).width > width) { lines.push(line); line = word; }
  else line = trial;
 }
 if (line) lines.push(line);
 return lines;
}

function quoteImageLoadPhoto(source) {
 return new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('No se pudo cargar una imagen de la cotización. Volvé a seleccionar el modelo.'));
  image.src = source;
 });
}

async function makePanelQuoteImage(snapshot) {
 const {quote, model, detailsVisible, dark} = snapshot;
 const canvas = document.createElement('canvas');
 const ctx = canvas.getContext('2d');
 if (!ctx) throw new Error('Este navegador no pudo generar la imagen.');
 const palette = dark
  ? {bg:'#111725', paper:'#192131', ink:'#ecf1fa', muted:'#b9afcc', line:'#393451', head:'#171627', selected:'#282344'}
  : {bg:'#f4f6fb', paper:'#ffffff', ink:'#102d52', muted:'#5e718f', line:'#d9e3f5', head:'#f6f8fd', selected:'#eaf1ff'};
 const font = '"Segoe UI", Arial, "DejaVu Sans", sans-serif';
 const setFont = (size, weight = 400) => { ctx.font = weight + ' ' + size + 'px ' + font; };
 const text = (value, x, y, size = 12, color = palette.ink, align = 'left', weight = 400) => {
  setFont(size, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y);
 };
 const block = (value, x, y, width, size, lineHeight, color, weight = 400) => {
  setFont(size, weight);
  const lines = quoteImageLines(ctx, value, width);
  for (let i = 0; i < lines.length; i++) text(lines[i], x, y + i * lineHeight, size, color, 'left', weight);
  return lines.length * lineHeight;
 };
 const W = 680, pad = 18, content = W - pad * 2;
 canvas.width = W * 2;
 // Los logos reemplazan el encabezado de texto únicamente en el PNG exportado.
 const [tvsLogo, modelLogo] = await Promise.all([
  snapshot.tvsLogo ? quoteImageLoadPhoto(snapshot.tvsLogo.src) : Promise.resolve(null),
  snapshot.modelLogo ? quoteImageLoadPhoto(snapshot.modelLogo.src) : Promise.resolve(null)
 ]);
 const tvsSize = tvsLogo ? Math.min(150 / tvsLogo.width, 34 / tvsLogo.height) : 0;
 const tvsW = tvsLogo ? tvsLogo.width * tvsSize : 110;
 const tvsH = tvsLogo ? tvsLogo.height * tvsSize : 28;
 const modelSize = modelLogo ? Math.min(210 / modelLogo.width, 66 / modelLogo.height) : 0;
 const modelW = modelLogo ? modelLogo.width * modelSize : 210;
 setFont(18, 600);
 const titleLines = modelLogo ? [] : quoteImageLines(ctx, snapshot.modelLabel || 'Cotización de motocicleta', modelW);
 const modelH = modelLogo ? modelLogo.height * modelSize : titleLines.length * 22;
 const brandingHeight = Math.max(66, tvsH, modelH);
 const brandingCenterY = 26 + brandingHeight / 2;
 const tvsX = pad + 50;
 const modelX = tvsX + tvsW + 28;
 const tvsY = brandingCenterY - tvsH / 2, modelY = brandingCenterY - modelH / 2;
 const brandingBottom = 26 + brandingHeight;
 const tableY = Math.ceil(brandingBottom + 21);
 const tableH = 40 + snapshot.terms.length * 46;
 const cardY = tableY + tableH + 18;
 const photoH = model ? 224 : 54;
 const detailsY = cardY + 98 + photoH + 20;
 const cardBottom = detailsY + (detailsVisible ? 130 : 62) + 18;
 const estimatedTerms = quote.rows.some(row => row.estimated);
 const note = (estimatedTerms || quote.estimated ? 'Los plazos marcados «est.» y las cuotas indicadas como estimadas son referenciales. Confirmá cuota final, cargos y seguros con la financiera. ' : '') + 'Cotización sujeta a evaluación y condiciones de la financiera. El último pago puede variar por redondeo.';
 setFont(10);
 const noteLines = quoteImageLines(ctx, note, content);
 canvas.height = Math.ceil(cardBottom + 34 + noteLines.length * 15 + 54) * 2;
 ctx.scale(2, 2);
 ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, W, canvas.height / 2);
 quoteImagePath(ctx, pad, 12, content, tableY - 25, 14); ctx.fillStyle = '#ffffff'; ctx.fill();
 if (tvsLogo) ctx.drawImage(tvsLogo, tvsX, tvsY, tvsW, tvsH);
 else text('TVS', tvsX + tvsW / 2, tvsY + 24, 24, '#245789', 'center', 600);
 text(snapshot.date, W - pad - 12, 32, 9, '#5e718f', 'right');
 if (modelLogo) ctx.drawImage(modelLogo, modelX, modelY, modelW, modelH);
 else titleLines.forEach((line, i) => text(line, modelX + modelW / 2, modelY + 18 + i * 22, 18, '#102d52', 'center', 600));

 ctx.save();
 quoteImagePath(ctx, pad, tableY, content, tableH, 14); ctx.clip();
 ctx.fillStyle = palette.paper; ctx.fillRect(pad, tableY, content, tableH);
 ctx.fillStyle = palette.head; ctx.fillRect(pad, tableY, content, 40);
 text('Plazo', pad + 22, tableY + 25, 10, palette.muted);
 text('Cuota mensual', W - pad - 22, tableY + 25, 10, palette.muted, 'right');
 for (let i = 0; i < snapshot.terms.length; i++) {
  const months = snapshot.terms[i];
  const row = quote.rows.find(item => item.months === months);
  const y = tableY + 40 + i * 46;
  const selected = months === quote.selected.months;
  if (selected) { ctx.fillStyle = palette.selected; ctx.fillRect(pad, y, content, 46); }
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
  ctx.beginPath(); ctx.arc(pad + 26, y + 23, 6, 0, Math.PI * 2);
  ctx.strokeStyle = selected ? '#df2447' : '#a8bce5';
  ctx.lineWidth = selected ? 3 : 1; ctx.stroke();
  if (selected) { ctx.beginPath(); ctx.arc(pad + 26, y + 23, 2, 0, Math.PI * 2); ctx.fillStyle = '#df2447'; ctx.fill(); }
  text(months + ' meses', pad + 46, y + 27, 12, palette.ink, 'left', selected ? 600 : 400);
  if (row && row.eligible !== false) {
   text(money(row.monthly) + (row.estimated ? ' · est.' : ''), W - pad - 22, y + 28, 15, palette.ink, 'right', 500);
  } else {
   const reason = row?.reason || 'No disponible';
   setFont(10);
   const lines = quoteImageLines(ctx, reason, content - 170);
   lines.forEach((line, lineIndex) => text(line, W - pad - 22, y + (lines.length > 1 ? 18 : 27) + lineIndex * 13, 10, palette.muted, 'right'));
  }
 }
 ctx.restore();
 quoteImagePath(ctx, pad, tableY, content, tableH, 14); ctx.lineWidth = 1; ctx.strokeStyle = palette.line; ctx.stroke();
 ctx.save(); quoteImagePath(ctx, pad, tableY, content, tableH, 14); ctx.clip();
 ctx.fillStyle = '#e3294a'; ctx.fillRect(pad, tableY, content, 2); ctx.restore();

 const gradient = ctx.createLinearGradient(pad, cardY, W - pad, cardBottom);
 gradient.addColorStop(0, dark ? '#182a52' : '#143668'); gradient.addColorStop(1, dark ? '#292044' : '#1b2550');
 quoteImagePath(ctx, pad, cardY, content, cardBottom - cardY, 15); ctx.fillStyle = gradient; ctx.fill();
 ctx.save(); quoteImagePath(ctx, pad, cardY, content, cardBottom - cardY, 15); ctx.clip();
 ctx.fillStyle = '#e3294a'; ctx.fillRect(pad, cardY, content, 2); ctx.restore();
 const left = pad + 23, right = W - pad - 23;
 text('CUOTA MENSUAL', left, cardY + 29, 9, '#c4d4f1', 'left', 500);
 text(money(quote.selected.monthly), left, cardY + 73, 43, '#ffffff', 'left', 400);
 const termLabel = quote.selected.months + ' meses' + (quote.selected.estimated ? ' · est.' : '');
 setFont(10); const termWidth = Math.max(74, ctx.measureText(termLabel).width + 22);
 quoteImagePath(ctx, right - termWidth, cardY + 34, termWidth, 31, 6); ctx.strokeStyle = '#8096be'; ctx.lineWidth = .7; ctx.stroke();
 text(termLabel, right - termWidth / 2, cardY + 54, 10, '#ffffff', 'center', 500);

 const photoY = cardY + 98, photoW = right - left;
 if (model) {
  quoteImagePath(ctx, left, photoY, photoW, photoH, 10); ctx.fillStyle = '#ffffff'; ctx.fill();
  const photo = await quoteImageLoadPhoto(model.image);
  const ratio = Math.min((photoW - 30) / photo.width, 174 / photo.height);
  const width = photo.width * ratio, height = photo.height * ratio;
  ctx.drawImage(photo, left + (photoW - width) / 2, photoY + 10 + (174 - height) / 2, width, height);
  ctx.strokeStyle = '#e4ebf8'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(left + 16, photoY + 193); ctx.lineTo(right - 16, photoY + 193); ctx.stroke();
  text(model.label, left + 16, photoY + 211, 9, '#173d70', 'left', 500);
  text('Imagen de referencia', right - 16, photoY + 211, 8, '#61718c', 'right');
 } else {
  quoteImagePath(ctx, left, photoY, photoW, photoH, 9); ctx.strokeStyle = '#6c85ad'; ctx.lineWidth = 1; ctx.stroke();
  text(snapshot.modelLabel || 'Modelo por definir', (left + right) / 2, photoY + 32, 12, '#c4d4f1', 'center');
 }
 if (detailsVisible) {
  text(snapshot.interestLabel || 'Intereses estimados', left, detailsY + 5, 9, '#bacce9');
  text(money(quote.selected.interest), left, detailsY + 28, 14, '#ffffff', 'left', 500);
  text('Prima total', right, detailsY + 5, 9, '#bacce9', 'right');
  text(money(quote.initialPayment), right, detailsY + 32, 22, '#e2ecff', 'right');
  text(snapshot.initialNote, right, detailsY + 50, 8, '#bacce9', 'right');
  ctx.strokeStyle = '#829ac050'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(left, detailsY + 69); ctx.lineTo(right, detailsY + 69); ctx.stroke();
  text('Total estimado a pagar', left, detailsY + 94, 11, '#ffffff', 'left', 500);
  text('Incluye prima, cuotas y gastos.', left, detailsY + 112, 9, '#bacce9');
  text(money(quote.selected.total), right, detailsY + 107, 24, '#ffd0d8', 'right', 400);
 } else {
  text('Prima total', left, detailsY + 14, 11, '#d5e2fa', 'left', 500);
  text(snapshot.initialNote, left, detailsY + 35, 9, '#bacce9');
  text(money(quote.initialPayment), right, detailsY + 31, 27, '#e2ecff', 'right', 400);
 }
 block(note, pad, cardBottom + 27, content, 10, 15, palette.muted);
 const footerY = cardBottom + 34 + noteLines.length * 15;
 ctx.strokeStyle = palette.line; ctx.lineWidth = 1;
 ctx.beginPath(); ctx.moveTo(pad, footerY + 3); ctx.lineTo(W - pad, footerY + 3); ctx.stroke();
 text('Daniel Campos · Asesor de ventas', pad, footerY + 27, 11, palette.ink, 'left', 500);
 text('TVS Roosevelt San Miguel', W - pad, footerY + 27, 10, palette.muted, 'right');
 return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar el PNG.')), 'image/png'));
}

function setQuoteImageBusy(busy) {
 quoteImageBusy = busy;
 for (const id of ['panel-copy-quote-image', 'panel-download-quote-image']) {
  const button = $(id);
  if (button) { button.disabled = busy || !quoteImageAvailable(); button.setAttribute('aria-busy', String(busy)); }
 }
}

function quoteImageStatus(message) {
 const status = $('panel-quote-image-status');
 if (status) { status.textContent = message; status.hidden = false; }
}

function quoteImageFilename(snapshot) {
 const date = new Intl.DateTimeFormat('en-CA', {year:'numeric', month:'2-digit', day:'2-digit', timeZone:'America/El_Salvador'}).format(new Date());
 return 'Cotizacion-TVS-' + (snapshot.modelId || snapshot.model?.id || 'moto') + '-' + date + '.png';
}

async function copyPanelQuoteImage() {
 if (quoteImageBusy || !quoteImageAvailable()) return;
 const snapshot = quoteImageSnapshot();
 setQuoteImageBusy(true); quoteImageStatus('Preparando tu cotización como imagen…');
 const image = makePanelQuoteImage(snapshot);
 try {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('clipboard-unavailable');
  // Entregar la promesa durante el clic conserva la activación del usuario.
  await navigator.clipboard.write([new ClipboardItem({'image/png': image})]);
  quoteImageStatus('Imagen copiada. Abrí el chat de WhatsApp y pegala con Ctrl+V.');
 } catch (error) {
  try {
   const blob = await image;
   window.parent.postMessage({type:'tvs-calc-image-fallback', blob, filename:quoteImageFilename(snapshot)}, '*');
   quoteImageStatus('Tu imagen está lista: podés copiarla con clic derecho o descargar el PNG.');
  } catch (imageError) { quoteImageStatus(imageError.message || 'No se pudo preparar la imagen. Volvé a intentarlo.'); }
 } finally { setQuoteImageBusy(false); }
}

async function downloadPanelQuoteImage() {
 if (quoteImageBusy || !quoteImageAvailable()) return;
 const snapshot = quoteImageSnapshot();
 setQuoteImageBusy(true); quoteImageStatus('Preparando tu cotización como imagen…');
 try {
  const blob = await makePanelQuoteImage(snapshot);
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = quoteImageFilename(snapshot); document.body.append(link); link.click();
  setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 60000);
  quoteImageStatus('Cotización descargada como PNG. Ya podés adjuntarla en WhatsApp.');
 } catch (error) { quoteImageStatus(error.message || 'No se pudo descargar la imagen.'); }
 finally { setQuoteImageBusy(false); }
}
