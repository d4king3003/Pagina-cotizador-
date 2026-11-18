// Ejecutar desde Proyecto tras build.py. Requiere @napi-rs/canvas para QA.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const canvasPackage = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
 ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/@napi-rs/canvas' : '@napi-rs/canvas';
const {createCanvas, Image} = require(canvasPackage);
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'qa/embedded-calculator.html'), 'utf8');
const source = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes = new Map(), storage = new Map(), urls = new Map();
const canvases = [], messages = [], downloads = [];
let copied = [], denyClipboard = false, sequence = 0;
class Element {
 constructor(id = '') { Object.assign(this, {id, value:'', textContent:'', innerHTML:'', dataset:{}, style:{}, hidden:false, attributes:{}, children:[], listeners:{}}); this.classList={toggle(){},add(){},remove(){}}; }
 setAttribute(key,value) { this.attributes[key]=String(value); if(key==='hidden')this.hidden=true; }
 getAttribute(key) { return this.attributes[key] ?? null; }
 removeAttribute(key) { delete this.attributes[key]; if(key==='hidden')this.hidden=false; }
 append(...items) { this.children.push(...items); }
 replaceChildren(...items) { this.children=items; }
 addEventListener(type,fn) { (this.listeners[type] ||= []).push(fn); }
 click() { if(this.download)downloads.push({name:this.download,blob:urls.get(this.href)}); }
 focus(){} select(){} remove(){} showModal(){} getBoundingClientRect(){return {height:1000};}
}
const element = id => { if(!nodes.has(id))nodes.set(id,new Element(id)); return nodes.get(id); };
const makeCanvas = () => {
 const canvas=createCanvas(300,150), ctx=canvas.getContext('2d'), text=[], images=[], fills=ctx.fillText.bind(ctx), draw=ctx.drawImage.bind(ctx);
 ctx.fillText=(...args)=>{text.push({value:String(args[0]),font:ctx.font,x:args[1],y:args[2]});return fills(...args);};
 ctx.drawImage=(image,...args)=>{images.push({width:image.width,height:image.height,x:args[0],y:args[1],targetWidth:args[2],targetHeight:args[3]});return draw(image,...args);};
 canvas.toBlob=(callback)=>callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));
 canvases.push({canvas,text,images}); return canvas;
};
const context={console,Intl,Date,Math,JSON,Number,String,Uint8Array,Blob,Image,atob,btoa,TextEncoder,TextDecoder,
 setTimeout:()=>++sequence,clearTimeout(){},ResizeObserver:class{observe(){}},
 navigator:{clipboard:{async write(items){if(denyClipboard)throw new Error('NotAllowedError');copied=await Promise.all(items.map(item=>item.data['image/png']));}}},
 ClipboardItem:class{constructor(data){this.data=data;}},
 URL:{createObjectURL(blob){const url='blob:test-'+ ++sequence;urls.set(url,blob);return url;},revokeObjectURL(url){urls.delete(url);}},
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 document:{getElementById:element,documentElement:element('html'),body:element('body'),createTextNode:text=>({textContent:text}),createElement:tag=>tag==='canvas'?makeCanvas():new Element()},
 window:{addEventListener(){},parent:{postMessage(message){messages.push(message);}}}
};
vm.createContext(context);vm.runInContext(source,context);
const api=context.window.TVSCalculator;
const click=async id=>{for(const fn of element(id).listeners.click||[])await fn({target:element(id)});};
const png=async blob=>{assert.equal(blob.type,'image/png');const bytes=Buffer.from(await blob.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),1360);return bytes;};
const drew=value=>canvases.at(-1).text.some(item=>item.value===value);

(async()=>{
 assert.equal((html.match(/id="details-toggle"/g)||[]).length,1);
 assert.equal((html.match(/id="panel-copy-quote-image"/g)||[]).length,1);
 assert(!html.match(/<header[\s\S]*?<\/header>/)?.[0].includes('id="details-toggle"'));
 assert.equal(element('panel-copy-quote-image').disabled,true);
 api.apply({financierId:'crediopciones',price:'2649',down:'100',months:40,model:'apache-160-4v',detailsVisible:true});
 assert.equal(element('panel-copy-quote-image').disabled,false);
 const initial=api.snapshot();
 const shown=await png(await api.makeImage());
 assert(!drew('TVS ROOSEVELT SAN MIGUEL'));
 assert(!canvases.at(-1).text.some(item=>item.value.startsWith('Precio de la moto:')));
 assert(!canvases.at(-1).text.some(item=>item.value.includes('Siete Tres')));
 assert.equal(canvases.at(-1).images[0].width,2048);
 assert.equal(canvases.at(-1).images[1].width,500);
 assert(canvases.at(-1).images[0].x<canvases.at(-1).images[1].x);
 assert(html.includes('class="details-toggle quote-visibility-toggle"'));
 assert(html.includes('class="sr-only" id="details-toggle-label"'));
 assert(drew('Intereses estimados'));assert(drew('Total estimado a pagar'));
 for(const row of initial.quote.rows)assert(drew(row.months+' meses'));
 fs.writeFileSync(path.join(root,'qa/quote-image-visible.png'),shown);
 await click('details-toggle');
 assert.equal(element('interest-detail').hidden,true);assert.equal(element('total-detail').hidden,true);
 assert.equal(element('details-toggle-label').textContent,'Mostrar intereses y total');
 assert.equal(JSON.parse(storage.get('tvs-daniel-panel-calculator-v1')).detailsVisible,false);
 const hidden=await png(await api.makeImage());
 assert(!drew('Intereses estimados'));assert(!drew('Total estimado a pagar'));assert(drew('Prima total'));
 assert(hidden.readUInt32BE(20)<shown.readUInt32BE(20));
 fs.writeFileSync(path.join(root,'qa/quote-image-hidden.png'),hidden);
 assert.equal(api.snapshot().quote.selected.monthly,initial.quote.selected.monthly);
 assert.equal(api.snapshot().quote.selected.total,initial.quote.selected.total);
 await click('panel-copy-quote-image');assert.equal(copied.length,1);await png(copied[0]);
 assert(element('panel-quote-image-status').textContent.includes('Imagen copiada'));
 denyClipboard=true;await click('panel-copy-quote-image');
 const fallback=messages.findLast(message=>message.type==='tvs-calc-image-fallback');
 assert(fallback);await png(fallback.blob);assert(fallback.filename.endsWith('.png'));
 assert.equal(element('panel-copy-quote-image').disabled,false);
 await click('panel-download-quote-image');assert.equal(downloads.length,1);await png(downloads[0].blob);
 const financiers=[];
 for(const financierId of ['flexiplan','bac','monge']){
  api.apply({financierId,price:'2649',down:'600',income:'1200',bacProfile:'otro',bacExtra:'0',months:24,detailsVisible:false});
  assert(api.snapshot().complete,financierId+' válido');
  await png(await api.makeImage());assert(!drew('Total estimado a pagar'));
  assert(drew(api.snapshot().quote.selected.months+' meses'));
  financiers.push(financierId);
 }
 const logoManifest=JSON.parse(fs.readFileSync(path.join(root,'data/logos.json'),'utf8'));
 const modelIDs=new Set(api.models().map(model=>model.id));
 const logoMappings=[];
 for(const [id,spec] of Object.entries(logoManifest.models)){
  api.apply({financierId:'crediopciones',price:'2149',down:'0',months:40,model:modelIDs.has(id)?id:'',detailsVisible:false});
  api.setImageModel(modelIDs.has(id)?null:{id,label:'NTORQ 125'});
  const image=await png(await api.makeImage());
  const source=fs.readFileSync(path.join(root,'assets/logos',spec.file));
  assert(html.includes(source.toString('base64')),id+' incluye los bytes del logo entregado');
  const drawn=canvases.at(-1).images;
  assert.equal(drawn[0].width,logoManifest.tvs.width);
  assert.equal(drawn[1].width,spec.width);assert.equal(drawn[1].height,spec.height);
  assert(drawn[0].x+drawn[0].targetWidth<drawn[1].x,id+' mantiene TVS a la izquierda');
  assert(drawn[0].x<=75,id+' alinea el grupo hacia la izquierda como la referencia');
  assert(Math.abs(drawn[0].y+drawn[0].targetHeight/2-drawn[1].y-drawn[1].targetHeight/2)<0.01,id+' alinea ambos logos');
  assert(drawn[0].targetWidth<=150.01 && drawn[1].targetWidth<=210.01 && drawn[1].targetHeight<=66.01,id+' usa logos compactos');
  assert(!canvases.at(-1).text.some(item=>item.value.startsWith('Precio de la moto:')));
  fs.writeFileSync(path.join(root,'qa/branding-'+id+'.png'),image);
  logoMappings.push(id);
 }
 api.setImageModel(null);
 api.apply({model:'sport-100'});await png(await api.makeImage());assert(drew('SPORT 100'));
 api.apply({financierId:'crediopciones',model:'',price:'2649',down:'100',months:40,detailsVisible:true});
 await png(await api.makeImage());assert(drew('Modelo por definir'));
 api.apply({price:''});assert.equal(element('panel-copy-quote-image').disabled,true);
 await assert.rejects(async()=>api.makeImage());
 console.log(JSON.stringify({resolution:'1360px',allTermsIncluded:true,shownAndHiddenPNG:'passed',clipboardPNG:'passed',clipboardDeniedFallback:'passed',downloadPNG:'passed',visibilityPreference:'passed',calculationsUnchanged:true,otherFinanciers:financiers,missingPhoto:'passed',invalidQuoteBlocked:'passed',tvsBeforeModelLogo:'passed',modelLogoMappings:logoMappings,oldHeaderRemoved:true,eyeIconOnly:true}));
})().catch(error=>{console.error(error);process.exit(1);});
