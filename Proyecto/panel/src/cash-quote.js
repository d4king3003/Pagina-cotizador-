// Cotización al contado: usa el catálogo del panel y genera un PNG local.
const CASH_SPEC_DATA = /*CASH_SPEC_DATA*/null;
const CASH_BRANDING = /*CASH_BRANDING*/null;
const CASH_FIELDS = [['motor','Motor'],['potencia','Potencia'],['alimentacion','Alimentación'],['transmision','Transmisión'],['frenos','Frenos'],['tanque','Tanque'],['refrigeracion','Refrigeración'],['arranque','Arranque']];
const CASH_SHEET_MAP = {'apache-160-2v-ref':'apache-rtr-160-2v-refresh','apache-160-4v':'apache-rtr-160-4v','apache-180':'apache-rtr-180','apache-200-4v':'apache-rtr-200-4v','apache-200-fi':'apache-rtr-200-4v-fi','apache-310':'apache-rr-310','raider-125':'raider-125','sport-100':'sport-100'};
let cashDraft = null, cashPreviewRevision = 0, cashBusy = false;
const cashImages = new Map();
PATHS.eye = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6';
PATHS.eyeClosed = 'm3 3 18 18M10.6 5.1A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 4M6 6A22 22 0 0 0 2 12s3.5 7 10 7c1.6 0 3.1-.4 4.5-1.2';

function cashDefaultSheet(s) {
 if (!s) return '';
 if (CASH_SHEET_MAP[s.calcModelId]) return CASH_SHEET_MAP[s.calcModelId];
 const n=s.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(n.includes('kingkargo')||n.includes('kingcargo'))return 'king-kargo-225';
 if(n.includes('duramaxplus'))return 'king-duramax-plus-225';
 return '';
}
function ensureCashDraft() {
 const s=stock(ui.quoteStockId);
 if(!cashDraft || cashDraft.stockId!==ui.quoteStockId){
  const sheetId=cashDefaultSheet(s), customerName=cashDraft?.customerName??null;
  cashDraft={stockId:ui.quoteStockId,sheetId,specs:{...(CASH_SPEC_DATA[sheetId]||{})},discountMode:'amount',discount:'0',extra:'0',extraLabel:'Placas / trámites',benefits:'',year:s?.year||'',color:'',customerName,showSpecs:true,showDates:true,touched:false};
 }
 return cashDraft;
}
function cashCents(value,label,required=false) {
 if(value===''||value==null){if(required)throw Error('Ingresá el precio de contado.');return 0;}
 const number=Number(value);
 if(!Number.isFinite(number)||number<0||number>1e10)throw Error(label+' debe ser un monto válido, igual o mayor que cero.');
 return Math.round((number+Number.EPSILON)*100);
}
function cashAmounts(price,discount,mode,extra) {
 const baseCents=cashCents(price,'El precio',true);
 if(baseCents<=0)throw Error('Ingresá un precio de contado mayor que cero.');
 let discountCents;
 if(mode==='percent'){
  const percent=discount===''?0:Number(discount);
  if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('El descuento debe estar entre 0% y 100%.');
  discountCents=Math.round(baseCents*percent/100);
 }else if(mode==='amount')discountCents=cashCents(discount,'El descuento');
 else throw Error('Elegí el formato del descuento.');
 if(discountCents>baseCents)throw Error('El descuento no puede superar el precio de la moto.');
 const extraCents=cashCents(extra,'Los gastos adicionales'),totalCents=baseCents-discountCents+extraCents;
 if(totalCents<=0||totalCents>1e12)throw Error('El total a pagar debe ser mayor que cero y estar dentro del rango permitido.');
 return {baseCents,discountCents,extraCents,totalCents};
}
function cashModelLogo(s) {
 if(!s)return null;
 if(CASH_BRANDING.models[s.calcModelId])return CASH_BRANDING.models[s.calcModelId];
 const normal=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const name=normal(s.label);
 return Object.values(CASH_BRANDING.models).find(x=>x.aliases?.some(a=>name.startsWith(normal(a))))||null;
}
function cashSnapshot() {
 const draft=ensureCashDraft(),s=stock(ui.quoteStockId);
 const name=draft.customerName??client(ui.quoteClientId)?.name??'';
 const result={mode:'cash',modelId:s?.calcModelId||'',stockId:s?.id||'',modelLabel:s?.label||'Elegí el modelo',year:draft.year.trim(),color:draft.color.trim(),customerName:String(name).trim(),date:today(),validUntil:$('quote-valid-until')?.value||ui.quoteValidUntil||addDays(today(),db.settings.validDays),note:($('quote-note')?.value??ui.quoteNote??'').trim(),benefits:draft.benefits.trim(),extraLabel:draft.extraLabel.trim()||'Gastos adicionales',showSpecs:draft.showSpecs,showDates:draft.showDates,sheetId:draft.sheetId,specs:CASH_FIELDS.filter(([k])=>String(draft.specs[k]||'').trim()).map(([k,label])=>({key:k,label,value:String(draft.specs[k]).trim()})),photo:s?imageFor(s.id):'',modelLogo:cashModelLogo(s),tvsLogo:CASH_BRANDING.tvs,advisor:db.settings.advisor,agency:db.settings.agency,phone:db.settings.phone,location:db.settings.location,discountMode:draft.discountMode,discountValue:draft.discount,extraValue:draft.extra,valid:false,error:'',amounts:null};
 // No se usa la foto de Duramax como si fuera King Kargo.
 if(draft.sheetId==='king-kargo-225'&&s?.calcModelId==='king-gd')result.photo='';
 try{
  if(!s)throw Error('Elegí una moto para preparar la cotización.');
  result.amounts=cashAmounts($('cash-price')?.value??ui.cashPrice??s.price??'',draft.discount,draft.discountMode,draft.extra);
  if(result.showDates && (!/^\d{4}-\d{2}-\d{2}$/.test(result.validUntil)||result.validUntil<result.date))throw Error('Elegí una vigencia de hoy o una fecha posterior.');
  result.valid=true;
 }catch(error){result.error=error.message;}
 return result;
}
function renderCashQuote() {
 const s=stock(ui.quoteStockId),d=ensureCashDraft();
 $('cash-quote').innerHTML=`<div class="cash-layout">
 <section class="card cash-editor" aria-labelledby="cash-editor-title"><div class="card-head"><div><p class="eyebrow">CONTADO</p><h2 id="cash-editor-title">Prepará tu propuesta</h2></div>${badge('USD','green')}</div><div class="card-body">
 <div class="field"><label for="cash-price">Precio al contado *</label><input id="cash-price" type="number" inputmode="decimal" min="0.01" step="0.01" value="${esc(ui.cashPrice??s?.price??'')}" placeholder="Ingresá el precio vigente"></div>
 <div class="cash-discount-row"><div class="field"><label for="cash-discount">Descuento opcional</label><input id="cash-discount" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(d.discount)}"></div><div class="field"><label for="cash-discount-mode">Formato</label><select id="cash-discount-mode">${options([['amount','Dólares ($)'],['percent','Porcentaje (%)']],d.discountMode)}</select></div></div>
 <div class="cash-discount-row"><div class="field"><label for="cash-extra">Gastos adicionales</label><input id="cash-extra" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(d.extra)}"></div><div class="field"><label for="cash-extra-label">Concepto</label><input id="cash-extra-label" maxlength="80" value="${esc(d.extraLabel)}"></div></div>
 <div class="cash-total-editor"><span>Total a pagar</span><strong id="cash-total">—</strong></div><p id="cash-form-status" class="cash-form-status" role="status"></p>
 <details class="cash-details"><summary>Cliente, versión y beneficios</summary><div class="cash-detail-fields"><div class="field"><label for="cash-customer">Cliente (opcional)</label><input id="cash-customer" maxlength="150" value="${esc(d.customerName??client(ui.quoteClientId)?.name??'')}" placeholder="Nombre para la cotización"></div><div class="cash-discount-row"><div class="field"><label for="cash-year">Año / versión</label><input id="cash-year" maxlength="40" value="${esc(d.year)}" placeholder="Opcional"></div><div class="field"><label for="cash-color">Color</label><input id="cash-color" maxlength="80" value="${esc(d.color)}" placeholder="Opcional"></div></div><div class="field"><label for="cash-benefits">Beneficios o accesorios incluidos</label><textarea id="cash-benefits" maxlength="1000" rows="3" placeholder="Agregá los beneficios que correspondan">${esc(d.benefits)}</textarea></div><label class="check"><input id="cash-show-dates" type="checkbox" ${d.showDates?'checked':''}> Mostrar fecha y vigencia en la imagen</label></div></details>
 <details class="cash-details"><summary>Editar ficha técnica</summary><div class="cash-detail-fields"><div class="field"><label for="cash-sheet">Ficha del catálogo</label><select id="cash-sheet">${options(technicalSheets().map(x=>[x.id,x.title]),d.sheetId,'Ficha manual / elegir versión exacta')}</select><small>Podés ajustar los datos para la versión que estás cotizando. Los campos vacíos no se muestran.</small></div>${CASH_FIELDS.map(([key,label])=>`<div class="field"><label for="cash-spec-${key}">${label}</label><input id="cash-spec-${key}" data-cash-spec="${key}" maxlength="160" value="${esc(d.specs[key]||'')}" placeholder="Opcional"></div>`).join('')}</div></details>
 <button type="button" class="btn btn-quiet cash-reset" data-action="cash-new">${icon('plus')}Nueva cotización al contado</button>
 </div></section>
 <section class="cash-preview-workspace" aria-label="Vista previa para compartir"><div class="cash-preview-toolbar"><div class="cash-preview-title"><span class="eyebrow">ASÍ SE ENVÍA</span><span class="subtext">Cotización completa en una imagen</span></div><div class="cash-image-actions"><button type="button" id="cash-spec-toggle" class="icon-button" data-action="cash-toggle-specs" aria-label="Ocultar ficha técnica" title="Ocultar ficha técnica" aria-pressed="true">${icon('eye')}</button><button type="button" id="cash-copy" class="btn btn-primary" data-action="cash-copy-image">${icon('copy')}Copiar como imagen</button><button type="button" id="cash-download" class="btn" data-action="cash-download-image">${icon('download')}Descargar PNG</button></div></div><p id="cash-image-status" class="cash-image-status" role="status" aria-live="polite" hidden></p><div class="cash-preview-paper"><canvas id="cash-preview" role="img" aria-label="Vista previa de la cotización al contado"></canvas></div><p class="subtext cash-preview-help">Copiá la imagen y pegala en WhatsApp con Ctrl+V. También podés descargar el PNG.</p></section></div>`;
 cashRefreshPreview();
}
function cashImage(src) {
 if(!src)return Promise.resolve(null);
 if(!cashImages.has(src))cashImages.set(src,loadImage(src).catch(()=>null));
 return cashImages.get(src);
}
function cashWrap(ctx,value,width) {
 const lines=[];
 for(const paragraph of String(value||'').split('\n')){
  if(!paragraph.trim()){lines.push('');continue;}
  let line='';
  for(const word of paragraph.split(/\s+/)){
   if(ctx.measureText(word).width>width){
    if(line){lines.push(line);line='';}
    let part='';for(const char of word){if(part&&ctx.measureText(part+char).width>width){lines.push(part);part='';}part+=char;}line=part;continue;
   }
   const test=line?line+' '+word:word;if(line&&ctx.measureText(test).width>width){lines.push(line);line=word;}else line=test;
  }
  if(line)lines.push(line);
 }
 return lines;
}
async function drawCashQuote(snapshot,canvas=document.createElement('canvas')) {
 const [tvs,modelLogo,photo]=await Promise.all([cashImage(snapshot.tvsLogo?.src),cashImage(snapshot.modelLogo?.src),cashImage(snapshot.photo)]);
 const W=760,pad=36,inner=W-pad*2,scale=2,ctx=canvas.getContext('2d');if(!ctx)throw Error('Este navegador no pudo preparar la imagen.');
 const font='"Segoe UI", Arial, sans-serif';
 const setFont=(size,weight=400)=>ctx.font=weight+' '+size+'px '+font;
 const rows=snapshot.showSpecs?snapshot.specs:[];
 const cellWidth=(inner-14)/2,grid=[];
 for(let i=0;i<rows.length;i+=2){
  const pair=rows.slice(i,i+2);setFont(14,500);
  grid.push({pair,height:Math.max(66,...pair.map(row=>38+cashWrap(ctx,row.value,cellWidth-28).length*20))});
 }
 const textHeight=(value,size,width,lineHeight)=>{setFont(size);return value?cashWrap(ctx,value,width).length*lineHeight:0;};
 const titleHeight=textHeight(snapshot.modelLabel,27,inner,33);
 const customerHeight=textHeight(snapshot.customerName,14,inner,20);
 const versionLine=[snapshot.year,snapshot.color].filter(Boolean).join(' · '),versionHeight=textHeight(versionLine,14,inner,20);
 const photoHeight=photo?248:0;
 const benefitsHeight=textHeight(snapshot.benefits,14,inner-32,21);
 const noteHeight=textHeight(snapshot.note,12,inner,18);
 const footer=[snapshot.advisor,snapshot.agency].filter(Boolean).join(' · '),footerContact=[snapshot.phone,snapshot.location].filter(Boolean).join(' · ');
 const footerHeight=textHeight(footer,12,inner,18)+textHeight(footerContact,11,inner,17);
 const pricing=[['Precio al contado',snapshot.amounts?money(snapshot.amounts.baseCents/100):'—'],...(snapshot.amounts?.discountCents>0?[['Descuento','− '+money(snapshot.amounts.discountCents/100)]]:[]),...(snapshot.amounts?.extraCents>0?[[snapshot.extraLabel,money(snapshot.amounts.extraCents/100)]]:[])];
 const pricingHeight=pricing.reduce((height,[label])=>height+Math.max(32,textHeight(label,13,inner-210,18)+12),0);
 const H=Math.ceil(164+titleHeight+versionHeight+customerHeight+photoHeight+(grid.length?34+grid.reduce((n,r)=>n+r.height+10,0):0)+(benefitsHeight?benefitsHeight+56:0)+pricingHeight+100+(noteHeight?noteHeight+24:0)+footerHeight+68);
 if(H>7000)throw Error('La nota es demasiado extensa para una sola imagen. Resumila antes de copiar.');
 canvas.width=W*scale;canvas.height=H*scale;ctx.scale(scale,scale);ctx.textBaseline='top';ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
 const text=(value,x,y,size=14,color='#163458',weight=400,align='left')=>{setFont(size,weight);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(value),x,y);};
 const block=(value,x,y,width,size=14,color='#163458',weight=400,lineHeight=21)=>{setFont(size,weight);const lines=cashWrap(ctx,value,width);lines.forEach((line,i)=>text(line,x,y+i*lineHeight,size,color,weight));return lines.length*lineHeight;};
 const box=(x,y,w,h,color,r=12)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill();};
 const contain=(image,x,y,w,h)=>{const ratio=Math.min(w/image.width,h/image.height);ctx.drawImage(image,x+(w-image.width*ratio)/2,y+(h-image.height*ratio)/2,image.width*ratio,image.height*ratio);};
 ctx.fillStyle='#174d91';ctx.fillRect(0,0,W,6);ctx.fillStyle='#e52d45';ctx.fillRect(W*.72,0,W*.28,6);
 if(tvs)contain(tvs,pad,26,150,43);else text('TVS',pad,30,32,'#174d91',700);
 if(modelLogo)contain(modelLogo,pad+180,19,220,58);
 if(snapshot.showDates){text(fmtDate(snapshot.date),W-pad,29,11,'#77869b',400,'right');text('Vigente al '+fmtDate(snapshot.validUntil),W-pad,47,10,'#77869b',400,'right');}
 let y=102;text('COTIZACIÓN AL CONTADO',pad,y,11,'#d52e46',650);y+=25;
 y+=block(snapshot.modelLabel,pad,y,inner,27,'#153655',600,33)+5;
 if(versionLine)y+=block(versionLine,pad,y,inner,14,'#60758f',400,20)+7;
 if(snapshot.customerName)y+=block('Para: '+snapshot.customerName,pad,y,inner,14,'#60758f',400,20)+9;
 if(photo){contain(photo,pad+20,y,inner-40,photoHeight-16);y+=photoHeight;}
 if(grid.length){text('FICHA TÉCNICA',pad,y+5,11,'#40648c',650);y+=30;
  for(const row of grid){row.pair.forEach((item,i)=>{const x=pad+i*(cellWidth+14);box(x,y,cellWidth,row.height,'#f2f5fa',8);text(item.label.toUpperCase(),x+14,y+11,9,'#6e7e95',600);block(item.value,x+14,y+29,cellWidth-28,14,'#183856',500,20);});y+=row.height+10;}
  y+=8;
 }
 if(snapshot.benefits){box(pad,y,inner,benefitsHeight+43,'#edf6f1',9);text('INCLUYE',pad+16,y+11,9,'#258164',650);block(snapshot.benefits,pad+16,y+28,inner-32,14,'#245d4e',400,21);y+=benefitsHeight+56;}
 const amount=snapshot.amounts;
 for(const [label,value] of pricing){const height=block(label,pad,y,inner-210,13,'#6b7d94',400,18);text(value,W-pad,y,16,'#17385d',550,'right');y+=Math.max(32,height+12);}
 box(pad,y,inner,88,'#153a67',12);text('TOTAL A PAGAR',pad+22,y+17,10,'#ccdaee',600);text(amount?money(amount.totalCents/100):'—',W-pad-22,y+27,40,'#ffffff',600,'right');y+=108;
 if(snapshot.note){y+=block(snapshot.note,pad,y,inner,12,'#6b7d94',400,18)+22;}
 ctx.strokeStyle='#dce5f0';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke();y+=18;
 y+=block(footer,pad,y,inner,12,'#31567e',600,18)+5;if(footerContact)y+=block(footerContact,pad,y,inner,11,'#8793a5',400,17);
 return canvas;
}
function cashRefreshPreview() {
 if(ui.quoteMode!=='cash'||!$('cash-preview'))return;
 const snapshot=cashSnapshot(),d=ensureCashDraft(),revision=++cashPreviewRevision;
 $('cash-total').textContent=snapshot.valid?money(snapshot.amounts.totalCents/100):'—';
 $('cash-form-status').textContent=snapshot.valid?'Los campos opcionales vacíos no aparecen en la imagen.':snapshot.error;
 $('cash-form-status').classList.toggle('error',!snapshot.valid&&d.touched);
 const toggle=$('cash-spec-toggle'),label=d.showSpecs?'Ocultar ficha técnica':'Mostrar ficha técnica';toggle.setAttribute('aria-label',label);toggle.setAttribute('title',label);toggle.setAttribute('aria-pressed',String(d.showSpecs));toggle.innerHTML=icon(d.showSpecs?'eye':'eyeClosed');
 for(const id of ['cash-copy','cash-download','save-quote-button'])if($(id))$(id).disabled=!snapshot.valid||cashBusy;
 const canvas=$('cash-preview');canvas.setAttribute('aria-busy','true');
 drawCashQuote(snapshot).then(rendered=>{if(revision!==cashPreviewRevision||!canvas.isConnected)return;canvas.width=rendered.width;canvas.height=rendered.height;canvas.getContext('2d').drawImage(rendered,0,0);canvas.setAttribute('aria-busy','false');}).catch(error=>{if(revision===cashPreviewRevision)canvas.setAttribute('aria-busy','false');cashImageStatus(error.message,true);});
}
function cashImageStatus(message,error=false){const el=$('cash-image-status');if(el){el.textContent=message;el.hidden=!message;el.classList.toggle('error',error);}}
async function cashPNG(snapshot) {const canvas=await drawCashQuote(snapshot);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo generar el PNG.')),'image/png'));}
function cashFileName(snapshot){return 'Cotizacion-contado-'+snapshot.modelLabel.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+snapshot.date+'.png';}
function cashManualImage(blob,snapshot) {
 const url=URL.createObjectURL(blob);
 openModal('Tu cotización como imagen',`<p class="subtext">El navegador no permitió copiar automáticamente. Hacé clic derecho sobre la imagen y elegí «Copiar imagen», o descargá el PNG para adjuntarlo en WhatsApp.</p><div class="cash-fallback"><img src="${url}" alt="Cotización al contado de ${esc(snapshot.modelLabel)}"></div>`,`<a class="btn btn-primary" href="${url}" download="${esc(cashFileName(snapshot))}">${icon('download')}Descargar PNG</a><button class="btn" data-close>Cerrar</button>`,850);
 $('modal').addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
}
async function exportCashImage(kind,savedQuote=null) {
 if(cashBusy)return;
 const snapshot=savedQuote?cashSnapshotFromSaved(savedQuote):cashSnapshot();
 if(!snapshot.valid){cashImageStatus(snapshot.error,true);return;}
 cashBusy=true;cashRefreshPreview();cashImageStatus(kind==='copy'?'Preparando la imagen para copiar…':'Preparando el PNG…');
 try{
  const pending=cashPNG(snapshot);
  if(kind==='copy'&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
   try{await navigator.clipboard.write([new ClipboardItem({'image/png':pending})]);cashImageStatus('Imagen copiada. Pegala en WhatsApp con Ctrl+V.');toast('Cotización copiada como imagen.');}
   catch{const blob=await pending;cashManualImage(blob,snapshot);cashImageStatus('Usá clic derecho → Copiar imagen, o descargá el PNG.');}
  }else{const blob=await pending;if(kind==='copy')cashManualImage(blob,snapshot);else{download(cashFileName(snapshot),blob,'image/png');cashImageStatus('PNG descargado. Ya podés adjuntarlo en WhatsApp.');}}
 }catch(error){cashImageStatus('No se pudo preparar la imagen. '+error.message,true);toast('No se pudo generar la cotización como imagen.',true);}
 finally{cashBusy=false;cashRefreshPreview();}
}
function cashDataForSave(snapshot){const d=ensureCashDraft();return {version:1,modelLabel:snapshot.modelLabel,basePrice:snapshot.amounts.baseCents/100,discountMode:d.discountMode,discountValue:d.discount,discountAmount:snapshot.amounts.discountCents/100,extraAmount:snapshot.amounts.extraCents/100,total:snapshot.amounts.totalCents/100,extraLabel:snapshot.extraLabel,benefits:snapshot.benefits,year:snapshot.year,color:snapshot.color,sheetId:d.sheetId,specs:snapshot.specs,showSpecs:d.showSpecs,showDates:d.showDates};}
function validateCashRecord(q){
 const d=q.cashData,str=(v,max)=>typeof v==='string'&&v.length<=max;
 if(d.version!==1||(d.modelLabel!==undefined&&!str(d.modelLabel,150))||!str(d.discountValue,80)||!str(d.extraLabel,80)||!str(d.benefits,1000)||!str(d.year,40)||!str(d.color,80)||!str(d.sheetId,100)||typeof d.showSpecs!=='boolean'||typeof d.showDates!=='boolean'||!Array.isArray(d.specs)||d.specs.length>8)throw Error('La cotización al contado tiene datos incompletos.');
 const amounts=cashAmounts(d.basePrice,d.discountValue,d.discountMode,d.extraAmount);
 if(amounts.totalCents!==Math.round(q.price*100)||amounts.totalCents!==Math.round(d.total*100)||amounts.discountCents!==Math.round(d.discountAmount*100))throw Error('El total de la cotización al contado no coincide con su desglose.');
 const keys=new Set();for(const row of d.specs){const field=CASH_FIELDS.find(([key])=>key===row.key);if(!field||row.label!==field[1]||!str(row.value,160)||keys.has(row.key))throw Error('La ficha técnica guardada no es válida.');keys.add(row.key);}
}
function cashSnapshotFromSaved(q){
 const d=q.cashData||{},s={calcModelId:q.calcModelId,label:q.modelLabel};
 return {valid:true,modelLabel:d.modelLabel||(d.year&&q.modelLabel.endsWith(' · '+d.year)?q.modelLabel.slice(0,-(' · '+d.year).length):q.modelLabel),year:d.year||'',color:d.color||'',customerName:q.customerName||'',date:q.date,validUntil:q.validUntil,note:q.note||'',benefits:d.benefits||'',extraLabel:d.extraLabel||'Gastos adicionales',showSpecs:d.showSpecs!==false,showDates:d.showDates!==false,specs:clone(d.specs||[]),photo:d.sheetId==='king-kargo-225'&&q.calcModelId==='king-gd'?'':photoForQuote(q),modelLogo:cashModelLogo(s),tvsLogo:CASH_BRANDING.tvs,advisor:q.advisor,agency:q.agency,phone:q.advisorPhone,location:q.location,amounts:{baseCents:Math.round((d.basePrice??q.price)*100),discountCents:Math.round((d.discountAmount||0)*100),extraCents:Math.round((d.extraAmount||0)*100),totalCents:Math.round(q.price*100)}};
}
function cashSavedDetails(q){const d=q.cashData;if(!d)return '';
 return `${d.color?`<p class="subtext">Color: ${esc(d.color)}</p>`:''}${d.showSpecs!==false&&d.specs?.length?`<div class="cash-saved-specs">${d.specs.map(s=>`<div><small>${esc(s.label)}</small><strong>${esc(s.value)}</strong></div>`).join('')}</div>`:''}${d.benefits?`<p class="document-notes"><strong>Incluye:</strong> ${esc(d.benefits)}</p>`:''}`;
}
function restoreCashDraft(q){if(q.mode!=='cash')return;const d=q.cashData;
 cashDraft=null;const draft=ensureCashDraft();
 if(d){Object.assign(draft,{discountMode:d.discountMode,discount:String(d.discountValue),extra:String(d.extraAmount||0),extraLabel:d.extraLabel||'Gastos adicionales',benefits:d.benefits||'',year:d.year||'',color:d.color||'',sheetId:d.sheetId||'',specs:Object.fromEntries((d.specs||[]).map(s=>[s.key,s.value])),showSpecs:d.showSpecs!==false,showDates:d.showDates!==false,customerName:q.customerName||''});ui.cashPrice=d.basePrice;}
 else{ui.cashPrice=q.price;draft.customerName=q.customerName||'';}
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='cash-toggle-specs'){ensureCashDraft().showSpecs=!ensureCashDraft().showSpecs;cashRefreshPreview();}
 else if(action==='cash-copy-image')exportCashImage('copy');
 else if(action==='cash-download-image')exportCashImage('download');
 else if(action==='cash-saved-copy'||action==='cash-saved-download'){const q=db.quotes.find(q=>q.id===button.dataset.id);if(q)exportCashImage(action==='cash-saved-copy'?'copy':'download',q);}
 else if(action==='cash-new'){ui.quoteStockId='';ui.quoteClientId='';ui.quoteNote='';ui.cashPrice='';ui.quoteValidUntil='';cashDraft=null;renderCalculator();}
});
document.addEventListener('input',event=>{
 if(ui.quoteMode!=='cash')return;const t=event.target,d=ensureCashDraft();
 const fields={'cash-discount':'discount','cash-extra':'extra','cash-extra-label':'extraLabel','cash-benefits':'benefits','cash-year':'year','cash-color':'color','cash-customer':'customerName'};
 if(fields[t.id])d[fields[t.id]]=t.value;else if(t.dataset.cashSpec)d.specs[t.dataset.cashSpec]=t.value;else if(!['cash-price','quote-note'].includes(t.id))return;
 d.touched=true;cashRefreshPreview();
});
document.addEventListener('change',event=>{
 if(ui.quoteMode!=='cash')return;const t=event.target,d=ensureCashDraft();
 if(t.id==='cash-sheet'){d.sheetId=t.value;d.specs={...(CASH_SPEC_DATA[t.value]||{})};renderCashQuote();}
 else if(t.id==='cash-discount-mode'){
  try{const a=cashAmounts($('cash-price')?.value??ui.cashPrice,d.discount,d.discountMode,d.extra);d.discount=t.value==='percent'?String(Number((a.discountCents/a.baseCents*100).toFixed(12))):String(a.discountCents/100);}catch{d.discount='0';}
  d.discountMode=t.value;if($('cash-discount'))$('cash-discount').value=d.discount;cashRefreshPreview();
 }else if(t.id==='cash-show-dates'){d.showDates=t.checked;cashRefreshPreview();}
 else if(t.id==='quote-client'){ui.quoteClientId=t.value;d.customerName=null;renderCashQuote();}
 else if(t.id==='quote-valid-until')cashRefreshPreview();
});
