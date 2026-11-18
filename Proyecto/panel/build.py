from pathlib import Path
import base64, re, json, hashlib
from restore_assets import restore_assets
from bundle_office import office_bundle

ROOT = Path(__file__).resolve().parent
restore_assets(ROOT)
SOURCE = ROOT.parent / 'originales/Cotizador-TVS-Offline.html'
original = SOURCE.read_text()
bridge = r'''
// Panel bridge: the financing functions and plan tables above are unchanged.
window.TVSCalculator = {
  snapshot() {
    const complete = Boolean(currentQuote && currentQuote.valid && currentQuote.fee !== null && currentQuote.selected && currentQuote.selected.eligible !== false);
    return JSON.parse(JSON.stringify({state, quote: currentQuote, complete,
      text: complete ? financeQuoteText(currentQuote, getModel(state.model)?.label || '') : ''}));
  },
  models() { return MODELS.map(model => ({...model})); },
  logo() { return $('brand-logo').src; },
  apply(values) {
    const allowed = ['financierId','bacProfile','income','bacExtra','planId','mongePlanId','price','down','downMode','months','model','detailsVisible'];
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(values,key)) state[key] = values[key];
    state.months = Number(state.months); state.touched = true;
    const controls = {financierId:'financier',bacProfile:'bac-profile',income:'income',bacExtra:'bac-extra',planId:'plan',mongePlanId:'monge-plan',price:'price',down:'down',model:'model'};
    for (const [key,id] of Object.entries(controls)) if ($(id)) setValue($(id),state[key]);
    render();
  },
  makeImage() { return makePanelQuoteImage(quoteImageSnapshot()); },
  setImageModel(model) {
    quoteImageModelContext = model && typeof model === 'object' ? {id:String(model.id || ''), label:String(model.label || '')} : null;
  },
  setTheme(theme) { if (state.theme !== theme) { state.theme = theme; render(); } }
};
const renderForPanel = render;
render = function () {
  renderForPanel();
  const detailsLabel = $('details-toggle-label');
  if (detailsLabel) detailsLabel.textContent = state.detailsVisible ? 'Ocultar intereses y total' : 'Mostrar intereses y total';
  const ready=window.TVSCalculator.snapshot().complete;
  if($('panel-save-bottom')) $('panel-save-bottom').disabled=!ready;
  for (const id of ['panel-copy-quote-image', 'panel-download-quote-image']) {
    if ($(id)) $(id).disabled = !ready || quoteImageBusy;
  }
  window.parent.postMessage({type:'tvs-calc-change'}, '*');
};
$('panel-copy-quote-image').addEventListener('click', copyPanelQuoteImage);
$('panel-download-quote-image').addEventListener('click', downloadPanelQuoteImage);
// A new panel starts with no assumed current price and has separate preferences.
state.price = ''; setValue($('price'),'');
render();
window.parent.postMessage({type:'tvs-calc-ready'}, '*');
$('panel-save-bottom').addEventListener('click',()=>window.parent.postMessage({type:'tvs-calc-save'},'*'));
let heightTimer;
const resizeForPanel = () => { clearTimeout(heightTimer); heightTimer = setTimeout(() => window.parent.postMessage({type:'tvs-calc-height',height:document.body.getBoundingClientRect().height+14}, '*'), 30); };
new ResizeObserver(resizeForPanel).observe(document.body);
resizeForPanel();
'''
needle="window.addEventListener('beforeprint', preparePrint);\nrender();"
assert original.count(needle)==1
branding = json.loads((ROOT/'data/logos.json').read_text())
for asset in [branding['tvs'], *branding['models'].values()]:
    file = ROOT/'assets/logos'/asset.pop('file')
    mime = 'image/jpeg' if file.suffix.lower() in ['.jpg', '.jpeg'] else 'image/png' if file.suffix.lower() == '.png' else 'image/webp'
    asset['src'] = 'data:'+mime+';base64,'+base64.b64encode(file.read_bytes()).decode()
quote_image_source = (ROOT/'src/quote-image.js').read_text().replace('/*QUOTE_IMAGE_BRANDING*/null', json.dumps(branding,ensure_ascii=False).replace('</','<\\/'))
embedded = original.replace(needle,"window.addEventListener('beforeprint', preparePrint);\n"+quote_image_source+'\n'+bridge)
embedded = embedded.replace('crediopciones-android-v1','tvs-daniel-panel-calculator-v1')
# Reuse the calculator's existing visibility control outside its hidden header.
toggle = re.search(r'<button\b[^>]*id="details-toggle"[^>]*>.*?</button>', embedded, re.S)
assert toggle is not None
toggle_markup = toggle.group(0).replace('class="details-toggle"', 'class="details-toggle quote-visibility-toggle"')
toggle_markup = toggle_markup.replace('</button>', '<span class="sr-only" id="details-toggle-label">Ocultar intereses y total</span></button>')
embedded = embedded[:toggle.start()] + embedded[toggle.end():]
term_card = '<div class="card term-card">'
assert embedded.count(term_card) == 1
image_buttons = '<button type="button" class="details-toggle details-toggle-labeled quote-image-button" id="panel-copy-quote-image" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span>Copiar cotización como imagen</span></button><button type="button" class="details-toggle details-toggle-labeled" id="panel-download-quote-image" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg><span>Descargar PNG</span></button>'
embedded = embedded.replace(term_card, '<div class="panel-details-toolbar">'+toggle_markup+image_buttons+'</div><p class="panel-quote-image-status" id="panel-quote-image-status" role="status" aria-live="polite" hidden></p>\n          '+term_card)
embedded = embedded.replace('</head>', '''<style>
body{background:transparent!important}.topbar,footer,.actions{display:none!important}.workspace{max-width:none;padding:0 4px}.financial-nav{height:64px}.financial-active{height:64px}.page-heading{margin:24px 0}.page-heading h1{font-size:25px}.page-heading .intro{font-size:11px}.page-heading .eyebrow{font-size:8px}.calculator-grid{gap:22px}.workspace>main{padding:0}.quote-result{margin-bottom:12px}
.results{width:100%;max-width:680px;min-width:0;justify-self:start}
.panel-details-toolbar{display:flex;justify-content:flex-start;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.panel-details-toolbar .details-toggle-labeled{width:auto;max-width:100%;min-height:38px;height:auto;gap:8px;padding:10px 12px;font-size:11px;font-weight:500;white-space:normal}
.panel-details-toolbar .details-toggle-labeled svg{flex:none;width:18px;height:18px}
.panel-details-toolbar .quote-visibility-toggle{width:38px;height:38px;min-height:38px;flex:none;padding:8px}
.panel-details-toolbar .quote-image-button{background:#185cc4;border-color:#185cc4;color:#fff}
.panel-details-toolbar .quote-image-button:hover{background:#134d9e;color:#fff}
.panel-details-toolbar button:disabled{cursor:not-allowed;opacity:.5}
.panel-quote-image-status{margin:0 0 14px;padding:11px 13px;border:1px solid var(--line);border-radius:9px;color:var(--ink);font-size:11px;line-height:1.7;background:var(--paper)}
@media(max-width:720px){.workspace{padding:0 4px}.page-heading h1{font-size:23px}.financial-active select{max-width:160px}.internal-label{font-size:9px}}
</style></head>''')
panel_footer = '<div style="margin:18px 4px 8px;padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--paper);display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap"><p style="font-size:11px;color:var(--muted);margin:0">Guardá la propuesta para compartirla o descargar su PDF.</p><button type="button" id="panel-save-bottom" class="button button-primary" style="flex:none">Guardar cotización</button></div>'
embedded = embedded.replace("<script>\n'use strict';", panel_footer + "<script>\n'use strict';")
# Verify that no financing function or plan table was edited by integration.
def engine(html):
    script=re.findall(r'<script[^>]*>(.*?)</script>',html,re.S)[-1]
    return script[script.index('const TERMS'):script.index('const $ = id')]
assert engine(original)==engine(embedded)
(ROOT/'qa').mkdir(exist_ok=True)
(ROOT/'qa'/'financing-engine.js').write_text(engine(original))
(ROOT/'qa'/'embedded-calculator.html').write_text(embedded)
shell=(ROOT/'src/shell.html').read_text()
app_source=(ROOT/'src/app.js').read_text()
monthly=(ROOT/'src/monthly.js').read_text().replace('/*LEADS_DATA*/null',(ROOT/'data/leads-import.json').read_text().replace('</','<\\/'))
technical=(ROOT/'src/fichas.js').read_text()
office=(ROOT/'src/office.js').read_text()
quick_lead=(ROOT/'src/quick-lead.js').read_text()+'\n'+(ROOT/'src/client-actions.js').read_text()
credit_logos={'credi':'data:image/png;base64,'+base64.b64encode((ROOT/'assets/credit/crediopciones.png').read_bytes()).decode(),'buro':'data:image/jpeg;base64,'+base64.b64encode((ROOT/'assets/credit/crediopciones-buro.jpg').read_bytes()).decode()}
credit_docs=(ROOT/'src/credit-docs.js').read_text().replace('/*CREDIT_LOGOS*/null',json.dumps(credit_logos))
app_source=app_source.replace('/*INITIAL_BACKUP*/null',(ROOT/'data/initial-backup.json').read_text().replace('</','<\\/'))
cash=(ROOT/'src/cash-quote.js').read_text().replace('/*CASH_SPEC_DATA*/null',(ROOT/'data/cash-specs.json').read_text().replace('</','<\\/')).replace('/*CASH_BRANDING*/null',json.dumps(branding,ensure_ascii=False).replace('</','<\\/'))
catalog=json.loads((ROOT/'data/fichas.json').read_text())
assets=[]
for sheet in catalog:
    image=(ROOT/'assets/fichas'/sheet.pop('file')).read_bytes()
    preview=(ROOT/'assets/fichas'/sheet.pop('preview')).read_bytes()
    sheet['thumbnail']='data:image/jpeg;base64,'+base64.b64encode(preview).decode()
    assets.append('<script type="application/octet-stream" id="technical-sheet-'+sheet['id']+'">'+base64.b64encode(image).decode()+'</script>')
assets.insert(0,'<script type="application/json" id="technical-sheets-catalog">'+json.dumps(catalog,ensure_ascii=False).replace('</','<\\/')+'</script>')
app_source=app_source.replace('let db=loadDB();',monthly+'\n'+technical+'\n'+cash+'\n'+office+'\n'+quick_lead+'\n'+credit_docs+'\nlet db=loadDB();')
(ROOT/'qa/app-compiled.js').write_text(app_source)
office_render_source=office_bundle()
(ROOT/'qa/office-renderer.js').write_text(office_render_source)
html=shell.replace('/*APP_CSS*/',(ROOT/'src/style.css').read_text()+'\n'+(ROOT/'src/fichas.css').read_text()+'\n'+(ROOT/'src/cash-quote.css').read_text()+'\n'+(ROOT/'src/office-scene.css').read_text()+'\n'+(ROOT/'src/office.css').read_text()+'\n'+(ROOT/'src/quick-lead.css').read_text()+'\n'+(ROOT/'src/refresh.css').read_text()+'\n'+(ROOT/'src/credit-docs.css').read_text()).replace('/*CALCULATOR_BASE64*/',base64.b64encode(embedded.encode()).decode()).replace('/*TECHNICAL_ASSETS*/','\n'.join(assets)).replace('/*APP_JS*/',app_source).replace('/*JSPDF_JS*/',(ROOT/'src/vendor/jspdf.umd.min.js').read_text()).replace('/*OFFICE_SCENE_JS*/',office_render_source)
(ROOT/'dist').mkdir(exist_ok=True)
(ROOT/'dist/index.pending').write_text(html)
(ROOT/'dist/index.pending').replace(ROOT/'dist/index.html')
print(json.dumps({'output':str(ROOT/'dist/index.html'),'bytes':len(html.encode()),'original_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'engine_unchanged':True}))
