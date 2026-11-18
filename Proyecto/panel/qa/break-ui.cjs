// Revisión break-ui: carga datos extremos (qa/worst-case-data.py) en un navegador de prueba y revisa cada vista.
// Uso: node qa/break-ui.cjs <dist/index.html> <carpeta-datos> <carpeta-capturas> [worst|empty|one|huge]
// Carga cada conjunto de datos en un navegador de prueba y revisa las vistas.
const {chromium}=require('playwright');const fs=require('fs');
const [file,dataDir,out,only]=process.argv.slice(2);
const VIEWS=['resumen','oficina','clientes','financieras','reportes','ajustes'];
const setups=[['worst',{width:1440,height:900},1,'light'],['worst',{width:1280,height:800},1,'light'],['worst',{width:720,height:450},2,'light'],['worst',{width:1440,height:900},1,'dark'],['empty',{width:1440,height:900},1,'light'],['one',{width:1440,height:900},1,'light'],['huge',{width:1440,height:900},1,'light']].filter(s=>!only||s[0]===only);
(async()=>{const b=await chromium.launch();
for(const [set,vp,dsf,theme] of setups){
 const data=JSON.parse(fs.readFileSync(`${dataDir}/${set}.json`,'utf8'));data.settings.theme=theme;
 const ctx=await b.newContext({viewport:vp,deviceScaleFactor:dsf,acceptDownloads:true});
 await ctx.addInitScript(d=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem('tvs-daniel-panel-v1',d);sessionStorage.setItem('seeded','1');}},JSON.stringify(data));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const t0=Date.now();await p.goto('file://'+file);await p.waitForTimeout(2500);
 const banner=await p.$eval('#storage-banner',e=>e.hidden?'':e.textContent);
 const tag=`${set}-${vp.width}${dsf>1?'z200':''}-${theme}`;console.log('\n==',tag,'carga',Date.now()-t0,'ms',banner?'BANNER: '+banner:'');
 for(const v of VIEWS){const t=Date.now();await p.evaluate(v=>location.hash=v,v);await p.waitForTimeout(v==='oficina'?1600:600);
  await p.screenshot({path:`${out}/${tag}-${v}.png`,fullPage:v!=='oficina'});
  const issues=await p.evaluate(()=>{const r=[],vw=document.documentElement.clientWidth;
   if(document.documentElement.scrollWidth>vw+1)r.push('página más ancha que la ventana: '+document.documentElement.scrollWidth);
   for(const el of document.querySelectorAll('main *')){if(el.closest('.table-wrap,canvas,svg,iframe,select,input,textarea')||!el.offsetParent)continue;const cs=getComputedStyle(el);
    if(el.children.length===0&&el.textContent.trim()&&el.scrollWidth>el.clientWidth+2&&cs.overflow!=='visible'&&cs.textOverflow!=='ellipsis')r.push('texto cortado: '+el.className+' «'+el.textContent.trim().slice(0,50)+'»');
    const rc=el.getBoundingClientRect();if(rc.right>vw+2&&rc.width>0)r.push('se sale por la derecha: '+el.tagName+'.'+el.className+' «'+el.textContent.trim().slice(0,40)+'»');}
   for(const n of document.querySelectorAll('main')){const tx=n.innerText;for(const bad of ['NaN','undefined','null','$NaN','Infinity'])if(new RegExp('(^|[^A-Za-z])'+bad.replace('$','\\$')+'([^A-Za-z]|$)').test(tx))r.push('valor crudo en pantalla: '+bad);}
   return [...new Set(r)].slice(0,12);});
  console.log(' ',v,(Date.now()-t)+'ms',issues.length?issues:'ok');}
 if(set==='worst'&&vp.width===1440&&theme==='light'){
  await p.evaluate(()=>location.hash='financieras');await p.waitForTimeout(600);
  const rows=await p.$$('.credit-panel tbody tr');
  for(let i=0;i<rows.length;i++)for(const doc of ['buro','cotizador','solicitud']){
   const btn=(await p.$$('.credit-panel tbody tr'))[i];if(!btn)continue;
   const dl=p.waitForEvent('download',{timeout:2500}).catch(()=>null);await (await btn.$(`[data-doc="${doc}"]`)).click();const d=await dl;
   if(d){const f=`${out}/pdf-${i}-${doc}.pdf`;await d.saveAs(f);console.log('  PDF',i,doc,'descargado');}else{console.log('  PDF',i,doc,'bloqueado:',(await p.$eval('#toast',e=>e.textContent)).slice(0,90));}
   if(await p.$eval('#modal',m=>m.open))await p.click('#modal [data-close]');await p.waitForTimeout(250);}
  await p.evaluate(()=>location.hash='clientes');await p.waitForTimeout(600);
  const names=await p.$$eval('.leads-table tbody tr td:first-child strong',l=>l.slice(0,6).map(x=>x.textContent));console.log('  primeros clientes:',names);
  await p.click('.leads-table tbody tr [data-action="view-client"]');await p.waitForTimeout(500);await p.screenshot({path:`${out}/${tag}-ficha.png`});
  console.log('  iniciales en ficha:',await p.$eval('#modal .avatar',e=>e.textContent));await p.click('#modal [data-close]');
 }
 console.log('  errores JS:',errs.length?errs:'ninguno');await ctx.close();}
await b.close();})().catch(e=>{console.error(e);process.exit(1);});
