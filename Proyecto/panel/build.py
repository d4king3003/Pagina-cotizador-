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
$('panel-save-bottom')?.addEventListener('click',()=>window.parent.postMessage({type:'tvs-calc-save'},'*'));
let heightTimer;
const resizeForPanel = () => { clearTimeout(heightTimer); heightTimer = setTimeout(() => window.parent.postMessage({type:'tvs-calc-height',height:document.body.getBoundingClientRect().height+14}, '*'), 30); };
new ResizeObserver(resizeForPanel).observe(document.body);
resizeForPanel();
'''
# Prima total (Siete Tres y Cinco Cinco): se conecta antes del primer render del panel.
assert bridge.count('// A new panel starts')==1
bridge=bridge.replace('// A new panel starts',(ROOT/'src/calc-prima-total.js').read_text()+'\n// A new panel starts')
needle="window.addEventListener('beforeprint', preparePrint);\nrender();"
assert original.count(needle)==1
branding = json.loads((ROOT/'data/logos.json').read_text())
for asset in [branding['tvs'], *branding['models'].values()]:
    file = ROOT/'assets/logos'/asset.pop('file')
    mime = 'image/jpeg' if file.suffix.lower() in ['.jpg', '.jpeg'] else 'image/png' if file.suffix.lower() == '.png' else 'image/webp'
    asset['src'] = 'data:'+mime+';base64,'+base64.b64encode(file.read_bytes()).decode()
quote_image_source = (ROOT/'src/quote-image.js').read_text().replace('/*QUOTE_IMAGE_BRANDING*/null', json.dumps(branding,ensure_ascii=False).replace('</','<\\/'))
calc_font=lambda name:'data:font/woff2;base64,'+base64.b64encode((ROOT/'src/vendor/fonts'/name).read_bytes()).decode()
embedded = original.replace(needle,"window.addEventListener('beforeprint', preparePrint);\n"+quote_image_source+'\n'+bridge)
embedded = embedded.replace('crediopciones-android-v1','tvs-daniel-panel-calculator-v1')
# Modo oscuro del cotizador: los tonos morados pasan a azul zafiro (misma luminosidad), solo en sus reglas de estilo oscuras.
import colorsys
def _sapphire(m):
    h=m.group(1)
    if len(h) in (3,4): h=''.join(c*2 for c in h)
    rgb,alpha=h[:6],h[6:]
    r,g,b=(int(rgb[i:i+2],16)/255 for i in (0,2,4))
    hh,ll,ss=colorsys.rgb_to_hls(r,g,b)
    if .64<=hh<=.86 and ss>.08:
        r,g,b=colorsys.hls_to_rgb(.62,ll,min(ss,.55))
    return '#'+''.join('%02x'%round(v*255) for v in (r,g,b))+alpha
def _dark_rule(m):
    return re.sub(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b',_sapphire,m.group(0))
_head_end=embedded.index('</head>')
embedded=re.sub(r'html\[data-theme="dark"\][^{}]*\{[^{}]*\}',_dark_rule,embedded[:_head_end])+embedded[_head_end:]
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
embedded = embedded.replace('</head>', '<style>@font-face{font-family:"Inter Panel";src:url('+calc_font('inter-latin-wght-normal.woff2')+') format("woff2");font-weight:100 900}@font-face{font-family:"Jakarta Panel";src:url('+calc_font('plus-jakarta-sans-latin-wght-normal.woff2')+') format("woff2");font-weight:200 800}body,button,input,select,textarea{font-family:"Inter Panel",ui-sans-serif,"Segoe UI",sans-serif!important}h1,h2,h3{font-family:"Jakarta Panel","Inter Panel",sans-serif!important;letter-spacing:-.4px}</style>'+'''<style>
body{background:transparent!important}.topbar,footer,.actions{display:none!important}.workspace{max-width:none;padding:0 4px}.financial-nav{height:64px}.financial-active{height:64px}.page-heading{margin:24px 0}.page-heading h1{font-size:25px}.page-heading .intro{font-size:11px}.page-heading .eyebrow{font-size:8px}.calculator-grid{gap:22px}.workspace>main{padding:0}.quote-result{margin-bottom:12px}
.results{width:100%;max-width:680px;min-width:0;justify-self:start}
.panel-details-toolbar{display:flex;justify-content:flex-start;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.panel-details-toolbar .details-toggle-labeled{width:auto;max-width:100%;min-height:38px;height:auto;gap:8px;padding:10px 12px;font-size:11px;font-weight:500;white-space:normal}
.panel-details-toolbar .details-toggle-labeled svg{flex:none;width:18px;height:18px}
.panel-details-toolbar .quote-visibility-toggle{width:38px;height:38px;min-height:38px;flex:none;padding:8px}
.panel-details-toolbar .quote-image-button{background:#13285A;border-color:#13285A;color:#fff}
.panel-details-toolbar .quote-image-button:hover{background:#0D1D45;color:#fff}
.panel-details-toolbar button:disabled{cursor:not-allowed;opacity:.5}
.panel-quote-image-status{margin:0 0 14px;padding:11px 13px;border:1px solid var(--line);border-radius:9px;color:var(--ink);font-size:11px;line-height:1.7;background:var(--paper)}
@media(max-width:720px){.workspace{padding:0 4px}.page-heading h1{font-size:23px}.financial-active select{max-width:160px}.internal-label{font-size:9px}}
/* Colores de marca del panel: Zafiro Profundo, Blanco Perla y rojo carmín */
html[data-theme="dark"]{--ink:#ECE6DC;--muted:#B3B4BC;--primary:#9DB4EC;--dark:#0E1F47;--line:#24365E;--paper:#111D38;--bg:#0A1328;--soft:#17264A;--accent:#E0626A;--brand-blue:#9DB4EC;--brand-red:#E0626A;--rule-start:#9DB4EC;--rule-end:#E0626A}
html:not([data-theme="dark"]){--ink:#13213D;--muted:#5D6478;--primary:#13285A;--dark:#13285A;--line:#DDD4C6;--paper:#F7F3EC;--bg:#ECE6DC;--soft:#E6DFD3;--brand-blue:#13285A;--brand-red:#B4232C;--rule-start:#13285A;--rule-end:#B4232C;--accent:#F3DCD8}
</style></head>''')
panel_footer = '<div style="margin:18px 4px 8px;padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--paper);display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap"><p style="font-size:11px;color:var(--muted);margin:0">Guardá la propuesta para compartirla o descargar su PDF.</p><button type="button" id="panel-save-bottom" class="button button-primary" style="flex:none">Guardar cotización</button></div>'

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
extras=(ROOT/'src/extras.js').read_text()+'\n'+(ROOT/'src/charts.js').read_text()+'\n'+(ROOT/'src/deductions.js').read_text()
credit_docs=(ROOT/'src/credit-docs.js').read_text().replace('/*CREDIT_LOGOS*/null',json.dumps(credit_logos))
# Documentos originales de Crediopciones (los prepara tools/prep_credit_templates.py)
TPL=ROOT/'assets/credit/templates'
credit_originals={'templates':{k:json.loads((TPL/f'{k}.json').read_text()) for k in ('buro','cotizador','solicitud')},
 'layouts':{k:json.loads((TPL/f'{k}-layout.json').read_text()) for k in ('buro','cotizador','solicitud')},
 'images':{k:'data:image/jpeg;base64,'+base64.b64encode((TPL/f'{k}-fondo.jpg').read_bytes()).decode() for k in ('buro','cotizador','solicitud')},
 'fonts':json.loads((TPL/'fonts.json').read_text())}
credit_docs+='\n'+(ROOT/'src/credit-originals.js').read_text().replace('/*CREDIT_ORIGINALS*/null',json.dumps(credit_originals,separators=(',',':')))
# Entrega de la moto (los prepara tools/prep_delivery_templates.py)
DLV=ROOT/'assets/delivery'
delivery_docs={'templates':{k:json.loads((DLV/f'{k}.json').read_text()) for k in ('carta','matricula','exoneracion','compraventa')},
 'layouts':{k:json.loads((DLV/f'{k}-layout.json').read_text()) for k in ('carta','matricula','exoneracion','compraventa')},
 'fonts':json.loads((DLV/'gothic.json').read_text())}
delivery_docs['layouts']['placa']=json.loads((DLV/'placa-layout.json').read_text())
delivery_docs['images']={k:['data:image/jpeg;base64,'+base64.b64encode((DLV/n).read_bytes()).decode() for n in delivery_docs['layouts'][k]['images']] for k in ('carta','matricula','exoneracion','placa')}
credit_docs+='\n'+(ROOT/'src/delivery-docs.js').read_text().replace('/*DELIVERY_DOCS*/null',json.dumps(delivery_docs,separators=(',',':'),ensure_ascii=False)).replace('/*SV_MUNICIPIOS*/null',(ROOT/'data/sv-municipios.json').read_text().strip())
# Lector de capturas (OCR) sin internet: se guarda como texto y solo se usa al pegar una captura de SAP.
OCR=ROOT/'src/vendor/ocr'
ocr_tags=''.join(f'<script type="text/plain" id="{i}">'+base64.b64encode((OCR/n).read_bytes()).decode()+'</script>' for i,n in (('tvs-ocr-worker','worker.min.js'),('tvs-ocr-core','tesseract-core-simd-lstm.wasm.js'),('tvs-ocr-eng','eng.traineddata.gz')))
ocr_tags+='<script type="text/plain" id="tvs-ocr-lib">'+(OCR/'tesseract.min.js').read_text().replace('</','<\\/')+'</script>'
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
app_source=app_source.replace('let db=loadDB();',monthly+'\n'+technical+'\n'+cash+'\n'+office+'\n'+quick_lead+'\n'+credit_docs+'\n'+extras+'\nlet db=loadDB();')
(ROOT/'qa/app-compiled.js').write_text(app_source)
office_render_source=office_bundle()
(ROOT/'qa/office-renderer.js').write_text(office_render_source)
png_url=lambda name:'data:image/png;base64,'+base64.b64encode((ROOT/'assets/brand'/name).read_bytes()).decode()
font_url=lambda name:'data:font/woff2;base64,'+base64.b64encode((ROOT/'src/vendor/fonts'/name).read_bytes()).decode()
theme_css=(ROOT/'src/theme.css').read_text().replace('/*FONT_INTER*/',font_url('inter-latin-wght-normal.woff2')).replace('/*FONT_JAKARTA*/',font_url('plus-jakarta-sans-latin-wght-normal.woff2'))
def assemble(app_source,office_render_source):
    return shell.replace('/*APP_CSS*/',(ROOT/'src/style.css').read_text()+'\n'+(ROOT/'src/fichas.css').read_text()+'\n'+(ROOT/'src/cash-quote.css').read_text()+'\n'+(ROOT/'src/office-scene.css').read_text()+'\n'+(ROOT/'src/office.css').read_text()+'\n'+(ROOT/'src/quick-lead.css').read_text()+'\n'+(ROOT/'src/refresh.css').read_text()+'\n'+(ROOT/'src/credit-docs.css').read_text()+'\n'+theme_css).replace('/*CALCULATOR_BASE64*/',base64.b64encode(embedded.encode()).decode()).replace('/*TECHNICAL_ASSETS*/','\n'.join(assets)).replace('/*APP_JS*/',app_source).replace('/*BRAND_LOGO*/',png_url('tvs-logo.png')).replace('/*ICON_32*/',png_url('tvs-icon-32.png')).replace('/*ICON_64*/',png_url('tvs-icon-64.png')).replace('/*ICON_180*/',png_url('tvs-icon-180.png')).replace('/*JSPDF_JS*/',(ROOT/'src/vendor/jspdf.umd.min.js').read_text()).replace('/*OFFICE_SCENE_JS*/',office_render_source)
html=assemble(app_source,office_render_source)
(ROOT/'dist').mkdir(exist_ok=True)
_end=html.rindex('</body>')
html=html[:_end]+ocr_tags+html[_end:]
(ROOT/'dist/index.pending').write_text(html)
(ROOT/'dist/index.pending').replace(ROOT/'dist/index.html')
print(json.dumps({'output':str(ROOT/'dist/index.html'),'bytes':len(html.encode()),'original_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'engine_unchanged':True}))


# ===== App de Android: solo Cotizar y Fichas técnicas (dist/app.html) =====
# Sin oficina 3D, lector de capturas ni documentos de crédito y entrega, para que la app pese menos.
app_mode=(ROOT/'src/app-mode.js').read_text()
credit_light=(ROOT/'src/credit-docs.js').read_text().replace('/*CREDIT_LOGOS*/null','null')+'\n'+(ROOT/'src/credit-originals.js').read_text()+'\n'+(ROOT/'src/delivery-docs.js').read_text()
app_only=(ROOT/'src/app.js').read_text().replace('/*INITIAL_BACKUP*/null',(ROOT/'data/initial-backup.json').read_text().replace('</','<\\/'))
_start="applyTheme();navigate(location.hash.slice(1)||'resumen');"
assert app_only.count(_start)==1
app_only=app_only.replace(_start,app_mode+"\napplyTheme();navigate(['cotizar','fichas'].includes(location.hash.slice(1))?location.hash.slice(1):'cotizar');")
app_only=app_only.replace('let db=loadDB();',monthly+'\n'+technical+'\n'+cash+'\n'+office+'\n'+quick_lead+'\n'+credit_light+'\n'+extras+'\nlet db=loadDB();')
app_html=assemble(app_only,'').replace('<title>','<title>TVS Cotizador · ',1)
(ROOT/'dist/app.html').write_text(app_html)
print(json.dumps({'app':str(ROOT/'dist/app.html'),'bytes':len(app_html.encode())}))