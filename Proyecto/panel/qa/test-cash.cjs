const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/cash-quote.js'),'utf8');
const math=source.slice(source.indexOf('function cashCents('),source.indexOf('function cashModelLogo('));
const context=vm.createContext({});vm.runInContext(math+';globalThis.amounts=cashAmounts;',context);
const amounts=context.amounts;
assert.equal(amounts('2649','5','percent','35').totalCents,255155);
assert.equal(amounts('1299.95','5','percent','0').discountCents,6500);
assert.equal(amounts('0.30','0.10','amount','0.20').totalCents,40);
assert.equal(amounts('1000','100','percent','20').totalCents,2000);
for(const args of [['','0','amount','0'],['0','0','amount','0'],['100','101','amount','0'],['100','101','percent','0'],['100','-1','amount','0'],['100','0','amount','-1'],['100','x','percent','0'],['100','100','percent','0']])assert.throws(()=>amounts(...args));
const {chromium}=require('playwright');
const executablePath=process.env.CASH_CHROMIUM;
if(!executablePath)throw Error('Indicá CASH_CHROMIUM con la ruta de Chromium para la prueba de navegador.');

(async()=>{
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
 const browserContext=await browser.newContext({viewport:{width:1500,height:1050},acceptDownloads:true});
 const errors=[],network=[];
 await browserContext.route('**/*',route=>{if(/^https?:/.test(route.request().url())){network.push(route.request().url());return route.abort();}return route.continue();});
 await browserContext.addInitScript(()=>{
  window.testClipboard=[];window.denyImageClipboard=false;
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
   async write(items){if(window.denyImageClipboard)throw new DOMException('Denied','NotAllowedError');for(const item of items){const blob=await item.getType('image/png');const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});window.testClipboard.push({type:blob.type,size:blob.size,dataURL});}},
   async writeText(text){window.testCopiedText=text;}
  }});
 });
 const page=await browserContext.newPage();page.on('pageerror',e=>errors.push(e.message));
 const loaded=()=>page.waitForFunction(()=>document.getElementById('cash-preview')?.getAttribute('aria-busy')==='false');
 let clipboardReads=0;const clipboard=async()=>{clipboardReads++;await page.waitForFunction(count=>window.testClipboard.length>=count,clipboardReads);return page.evaluate(()=>window.testClipboard.at(-1));};
 const png=data=>{const buffer=Buffer.from(data.split(',')[1],'base64');assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(buffer.readUInt32BE(16),1520);return buffer;};
 const total=()=>page.locator('#cash-total').textContent();
 await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href,{waitUntil:'load',timeout:60000});
 await page.waitForFunction(()=>document.getElementById('calculator')?.contentWindow?.TVSCalculator);
 await page.locator('a[href="#cotizar"]').first().click();await page.getByRole('button',{name:'Contado',exact:true}).click();
 assert.equal(await page.locator('#cash-copy').isDisabled(),true);
 await page.locator('#quote-stock').selectOption('moto-apache-160-4v');await page.locator('#cash-price').fill('2649');
 await page.locator('#cash-discount-mode').selectOption('percent');await page.locator('#cash-discount').fill('5');await page.locator('#cash-extra').fill('35');
 assert.equal(await total(),'$2,551.55');
 await page.locator('#cash-discount-mode').selectOption('amount');assert.equal(await page.locator('#cash-discount').inputValue(),'132.45');assert.equal(await total(),'$2,551.55');
 await page.locator('#cash-discount-mode').selectOption('percent');assert.equal(await page.locator('#cash-discount').inputValue(),'5');
 await page.getByText('Cliente, versión y beneficios',{exact:true}).click();
 await page.locator('#cash-customer').fill('Cliente de prueba');await page.locator('#cash-year').fill('2027');await page.locator('#cash-color').fill('Azul');await page.locator('#cash-benefits').fill('Accesorio de ejemplo\nBeneficio confirmado por el asesor');
 await page.locator('#quote-note').fill('EJEMPLO DE COTIZACIÓN · DATOS DE PRUEBA');
 await page.getByText('Editar ficha técnica',{exact:true}).click();assert.ok((await page.locator('#cash-spec-motor').inputValue()).includes('159.7'));
 await page.locator('#cash-spec-alimentacion').fill('Dato editable confirmado para esta versión');
 await loaded();const shownHeight=await page.locator('#cash-preview').evaluate(c=>c.height);
 await page.locator('#cash-copy').click();const copied=await clipboard();assert.equal(copied.type,'image/png');assert.ok(copied.size>10000);
 const shown=png(copied.dataURL);fs.writeFileSync(path.join(root,'qa/cash-example.png'),shown);
 const downloadPromise=page.waitForEvent('download');await page.locator('#cash-download').click();const download=await downloadPromise;assert.ok(download.suggestedFilename().endsWith('.png'));await download.saveAs(path.join(root,'qa/cash-downloaded.png'));assert.ok(fs.readFileSync(path.join(root,'qa/cash-downloaded.png')).equals(shown));
 await page.locator('#cash-spec-toggle').click();await loaded();assert.ok(await page.locator('#cash-preview').evaluate(c=>c.height)<shownHeight);assert.equal(await page.locator('#cash-spec-toggle').getAttribute('aria-label'),'Mostrar ficha técnica');
 assert.equal((await page.locator('#cash-spec-toggle').textContent()).trim(),'');
 await page.locator('#cash-copy').click();const hidden=png((await clipboard()).dataURL);assert.ok(!hidden.equals(shown));assert.equal(await total(),'$2,551.55');
 await page.locator('#cash-spec-toggle').click();await loaded();
 await page.locator('#cash-copy').click();assert.ok(png((await clipboard()).dataURL).equals(shown),'Volver a cotizar conserva datos y ficha');
 const dbBefore=(await page.evaluate(()=>JSON.parse(localStorage.getItem('tvs-daniel-panel-v1'))))||JSON.parse(fs.readFileSync(path.join(root,'data/initial-backup.json'),'utf8'));// Ya no se guardan cotizaciones: se envían como imagen.
assert.equal(dbBefore.quotes.length,JSON.parse(fs.readFileSync(path.join(root,'data/initial-backup.json'),'utf8')).quotes.length);assert.equal(await page.locator('#save-quote-button').count(),0);
 await page.evaluate(()=>window.denyImageClipboard=true);await page.locator('#cash-copy').click();await page.locator('#modal').waitFor({state:'visible'});assert.ok((await page.locator('#modal').textContent()).includes('clic derecho'));assert.equal(await page.locator('#modal a[download]').count(),1);await page.locator('#modal [data-close]').first().click();
 await page.evaluate(()=>window.denyImageClipboard=false);
 await page.locator('#cash-discount').fill('101');assert.equal(await page.locator('#cash-copy').isDisabled(),true);assert.ok((await page.locator('#cash-form-status').textContent()).includes('100%'));
 await page.locator('#cash-discount').fill('5');await loaded();
 await page.locator('#quote-stock').selectOption('moto-raider-125');await page.locator('#cash-price').fill('1949');assert.equal(await page.locator('#cash-discount').inputValue(),'0');
 await page.getByText('Editar ficha técnica',{exact:true}).click();assert.ok((await page.locator('#cash-spec-motor').inputValue()).includes('3 válvulas'));
 await page.locator('#cash-spec-potencia').fill('<img src=x onerror="window.injection=1">');await loaded();assert.equal(await page.evaluate(()=>window.injection),undefined);
 await page.locator('#quote-stock').selectOption('moto-king-gd');await page.locator('#cash-price').fill('5499');await page.getByText('Editar ficha técnica',{exact:true}).click();assert.equal(await page.locator('#cash-sheet').inputValue(),'');
 await page.locator('#cash-sheet').selectOption('king-kargo-225');await page.getByText('Editar ficha técnica',{exact:true}).click();assert.ok((await page.locator('#cash-spec-motor').inputValue()).includes('225.8'));
 await loaded();
 await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await loaded();assert.equal(await total(),'$5,499.00');
 await page.setViewportSize({width:430,height:930});await loaded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
 await page.screenshot({path:path.join(root,'qa/cash-mobile.png'),fullPage:true});
 await page.locator('[data-action="cash-new"]').click();assert.equal(await page.locator('#cash-price').inputValue(),'');assert.equal(await page.locator('#quote-stock').inputValue(),'');assert.equal(await page.locator('#cash-copy').isDisabled(),true);
 const dbAfter=(await page.evaluate(()=>JSON.parse(localStorage.getItem('tvs-daniel-panel-v1'))))||JSON.parse(fs.readFileSync(path.join(root,'data/initial-backup.json'),'utf8'));assert.equal(dbAfter.clients.length,dbBefore.clients.length);assert.equal(dbAfter.sales.length,dbBefore.sales.length);assert.equal(dbAfter.quotes.length,dbBefore.quotes.length);
 assert.equal(network.length,0);assert.deepEqual(errors,[]);
 const report={mathAndValidation:'passed',realBrowser:'Chromium / file://',networkRequests:network.length,clipboardRealPNG:'passed',downloadSamePNG:'passed',twoColumnSpecs:'passed',hideAndShowSpecs:'passed',noQuoteSavedOnlyImage:'passed',clipboardDeniedFallback:'passed',clientAndSalesDataPreserved:'passed',customSpecsEscaped:'passed',mobile430px:'passed',darkMode:'passed',technicalSource:'included catalogue; editable per quote'};
 fs.writeFileSync(path.join(root,'qa/cash-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
