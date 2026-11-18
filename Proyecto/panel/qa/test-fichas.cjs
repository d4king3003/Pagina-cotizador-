// Ejecutar desde Proyecto: node panel/qa/test-fichas.cjs (después de build.py).
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const crypto = require('crypto');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const nodes = new Map();
const storage = new Map();
const blobs = new Map();
const downloads = [];
let written = [];
let denyClipboard = false;
let sequence = 0;
const element = id => {
 if (!nodes.has(id)) nodes.set(id, {
  id, innerHTML: '', textContent: '', value: '', hidden: false, dataset: {}, style: {},
  addEventListener() {}, append() {}, remove() {}, setAttribute() {}, removeAttribute() {},
  close() { this.open = false; }, showModal() { this.open = true; },
  click() { if (this.download) downloads.push({name: this.download, blob: blobs.get(this.href)}); },
  classList: {toggle() {}, add() {}, remove() {}},
  querySelector() { return null; }, querySelectorAll() { return []; }
 });
 return nodes.get(id);
};
for (const [, id, body] of html.matchAll(/<script[^>]*id="(technical-(?:sheets-catalog|sheet-[^"]+))"[^>]*>([\s\S]*?)<\/script>/g)) {
 element(id).textContent = body;
}
const context = {
 console, Intl, Date, Math, JSON, Number, String, Uint8Array, TextEncoder, TextDecoder,
 Blob, Response, DecompressionStream, atob, btoa, crypto: crypto.webcrypto,
 setTimeout: () => ++sequence, clearTimeout() {},
 URL: {createObjectURL(blob) { const url = 'blob:test-' + ++sequence; blobs.set(url, blob); return url; }, revokeObjectURL(url) { blobs.delete(url); }},
 ClipboardItem: class { constructor(data) { this.data = data; } },
 navigator: {clipboard: {async write(items) { if (denyClipboard) throw new Error('NotAllowedError'); written = items; }}},
 localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
 document: {getElementById: element, documentElement: {dataset: {}}, body: element('body'), addEventListener() {}, createElement: () => element('new-' + ++sequence)},
 window: {addEventListener() {}, scrollTo() {}}, location: {hash: '#fichas'}
};
let source = fs.readFileSync(path.join(root, 'qa/app-compiled.js'), 'utf8');
const cut = source.lastIndexOf('\ninitializeMonthlyData();');
assert(cut > 0);
source = source.slice(0, cut) + ';globalThis.t={technicalSheets,technicalSheetImage,renderTechnicalSheets,copyTechnicalSheet,downloadTechnicalSheet,navigate,ui,NAV,getDB:()=>db};})();';
vm.createContext(context);
vm.runInContext(source, context);
const t = context.t;
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

(async () => {
 const catalog = t.technicalSheets();
 assert.equal(catalog.length, 10);
 assert.equal(new Set(catalog.map(sheet => sheet.id)).size, 10);
 assert.deepEqual(Array.from(catalog, sheet => sheet.page), [2,3,4,5,6,7,8,9,10,11]);
 assert(html.includes('id="view-fichas"'));
 assert(t.NAV.some(item => item[0] === 'fichas'));
 const before = JSON.stringify(t.getDB());
 const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/fichas.json'), 'utf8'));
 for (const sheet of catalog) {
  t.ui.sheetId = sheet.id;
  t.navigate('fichas');
  const markup = element('view-fichas').innerHTML;
  assert(markup.includes(sheet.title));
  assert.equal((markup.match(/data-action="select-sheet"/g) || []).length, 10);
  assert(markup.includes('Copiar imagen'));
  const image = t.technicalSheetImage(sheet.id);
  assert.equal(image.blob.type, 'image/png');
  const bytes = Buffer.from(await image.blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 2400);
  assert.equal(bytes.readUInt32BE(20), 1855);
  const original = fs.readFileSync(path.join(root, 'assets/fichas', manifest.find(item => item.id === sheet.id).file));
  assert.equal(sha(bytes), sha(original), sheet.title + ': no se alteró la imagen');
  const button = element('copy-' + sheet.id);
  button.innerHTML = 'Copiar imagen';
  await t.copyTechnicalSheet(sheet.id, button);
  assert.equal(button.disabled, false);
  assert.equal(written.length, 1);
  assert.equal(sha(Buffer.from(await written[0].data['image/png'].arrayBuffer())), sha(original));
  t.downloadTechnicalSheet(sheet.id);
  const download = downloads.at(-1);
  assert.equal(download.name, 'Ficha-TVS-' + sheet.id + '.png');
  assert.equal(sha(Buffer.from(await download.blob.arrayBuffer())), sha(original));
 }
 t.ui.sheetSearch = 'raider';
 t.renderTechnicalSheets();
 assert.equal((element('view-fichas').innerHTML.match(/data-action="select-sheet"/g) || []).length, 1);
 assert.equal(t.ui.sheetId, 'raider-125');
 t.ui.sheetSearch = 'modelo inexistente';
 t.renderTechnicalSheets();
 assert(element('view-fichas').innerHTML.includes('No hay fichas con ese nombre'));
 t.ui.sheetSearch = '';
 t.renderTechnicalSheets();
 const button = element('copy-denied');
 button.innerHTML = 'Copiar imagen';
 denyClipboard = true;
 await t.copyTechnicalSheet('raider-125', button);
 assert.equal(element('modal').open, true);
 assert(element('modal').innerHTML.includes('clic derecho'));
 assert(element('modal').innerHTML.includes('Descargar PNG'));
 assert.equal(button.disabled, false);
 context.ClipboardItem = undefined;
 await t.copyTechnicalSheet('sport-100', button);
 assert(element('modal').innerHTML.includes('Sport 100'));
 assert.equal(JSON.stringify(t.getDB()), before, 'Consultar/copiar fichas no modifica clientes ni ventas');
 assert.equal(storage.size, 0, 'Las imágenes no usan localStorage');
 console.log(JSON.stringify({sheets: catalog.length, resolution: '2400x1855', exactPNGBytes: 'passed for all 10', clipboardImagePayload: 'passed for all 10', download: 'passed for all 10', search: 'passed', clipboardDeniedFallback: 'passed', missingClipboardFallback: 'passed', clientDataUnchanged: true}));
})().catch(error => { console.error(error); process.exit(1); });
