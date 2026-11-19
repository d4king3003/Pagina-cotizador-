// Entrega de la moto: carta de entrega (4 hojas) y autorización para pago en línea del impuesto de primera matrícula.
// Los datos de la moto (motor, chasis, póliza, color) se pegan desde SAP: como texto o como captura (se lee sin internet).
const DELIVERY_DOCS=/*DELIVERY_DOCS*/null;
const DELIVERY_TEXT=['creditId','clientId','name','dui','occupation','municipio','departamento','model','color','year','motor','chasis','poliza','prima','plan','payment','months','balance','deliveryDate','matriculaDate','purchaseDate','age'];
const DELIVERY_KINDS={placa:{label:'Póliza (placa)',file:'Poliza placa',pdfOnly:true},carta:{label:'Carta de entrega',file:'Carta de entrega'},matricula:{label:'IPM',file:'IPM'},exoneracion:{label:'Carta de exoneración',file:'Carta de exoneracion'},compraventa:{label:'Compraventa',file:'Compraventa contado',contadoOnly:true}};
// Documentos que corresponden a la entrega: la compraventa solo en ventas de contado.
function deliveryKindsFor(f,saleType=f?.saleType){return Object.keys(DELIVERY_KINDS).filter(k=>!DELIVERY_KINDS[k].contadoOnly||saleType==='contado');}
const DELIVERY_REQUIRED={
 carta:['name','dui','model','color','year','motor','chasis','poliza','price','deliveryDate'],
 matricula:['name','dui','occupation','municipio','departamento','model','color','year','motor','chasis','poliza','matriculaDate'],
 placa:['poliza'],
 compraventa:['name','dui','age','occupation','municipio','departamento','poliza','year','model','motor','chasis','color','price','matriculaDate'],
 exoneracion:['name','dui','occupation','municipio','departamento','model','color','motor','chasis','poliza','age','purchaseDate','deliveryDate']};
const DELIVERY_LABELS={name:'nombre',dui:'DUI',occupation:'ocupación',municipio:'municipio',departamento:'departamento',model:'modelo',color:'color',year:'año',motor:'número de motor',chasis:'número de chasis',poliza:'número de póliza',price:'valor de venta',deliveryDate:'fecha de entrega',matriculaDate:'fecha del IPM',purchaseDate:'fecha de compra',age:'edad'};
let deliveryDraft=null;

/* ---------- Números y letras ---------- */
const ES_UNITS=['CERO','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUNO','VEINTIDOS','VEINTITRES','VEINTICUATRO','VEINTICINCO','VEINTISEIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
const ES_TENS=['','','','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
const ES_HUNDREDS=['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
const ES_MONTHS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
// Número entero en letras, como en los documentos: 2099 → DOS MIL NOVENTA Y NUEVE (sin tildes, como la plantilla).
function numberWords(n){
 n=Math.floor(Math.abs(Number(n)||0));
 if(n<30)return ES_UNITS[n];
 if(n<100)return ES_TENS[Math.floor(n/10)]+(n%10?' Y '+ES_UNITS[n%10]:'');
 if(n===100)return 'CIEN';
 if(n<1000)return ES_HUNDREDS[Math.floor(n/100)]+(n%100?' '+numberWords(n%100):'');
 if(n<1e6){const k=Math.floor(n/1000),rest=n%1000;return (k===1?'MIL':numberWords(k).replace(/UNO$/,'UN')+' MIL')+(rest?' '+numberWords(rest):'');}
 const m=Math.floor(n/1e6),rest=n%1e6;return (m===1?'UN MILLON':numberWords(m).replace(/UNO$/,'UN')+' MILLONES')+(rest?' '+numberWords(rest):'');
}
function moneyWords(v){const n=Math.round((Number(v)||0)*100),whole=Math.floor(n/100),cents=n%100;return numberWords(whole)+(cents?` CON ${String(cents).padStart(2,'0')}/100`:'');}
// Cada número y letra por separado: DE4A-21 → D E CUATRO A - DOS UNO
function spellChars(s){return String(s||'').toUpperCase().replace(/\s+/g,'').split('').map(ch=>/\d/.test(ch)?ES_UNITS[+ch]:ch==='-'?'-':ch).join(' ');}
// Modelo: las palabras quedan; las cifras se dicen una por una: APACHE RTR 160 2V REF → APACHE RTR UNO SEIS CERO DOS V REF
function modelWords(s){return String(s||'').toUpperCase().trim().split(/\s+/).map(w=>/\d/.test(w)?w.split('').map(ch=>/\d/.test(ch)?ES_UNITS[+ch]:ch).join(' '):w).join(' ');}
// 2026-11-19 → diecinueve de noviembre de dos mil veintiseis
function dateWordsLower(iso){const d=dateParts(iso);return d?`${numberWords(d.d)} de ${ES_MONTHS[d.m-1]} de ${numberWords(d.y)}`.toLowerCase():'';}
function ageFrom(birth,at=today()){const b=dateParts(birth),a=dateParts(at);if(!b||!a)return '';let n=a.y-b.y;if(a.m<b.m||(a.m===b.m&&a.d<b.d))n--;return n>0&&n<120?String(n):'';}
function dateParts(iso){const [y,m,d]=String(iso||'').split('-').map(Number);return y&&m&&d?{y,m,d}:null;}

/* ---------- Datos ---------- */
function emptyDelivery(){return {id:'',creditId:'',clientId:'',saleType:'credito',name:'',dui:'',occupation:'',municipio:'',departamento:'',model:'',color:'',year:'',motor:'',chasis:'',poliza:'',price:null,prima:'',plan:'',payment:'',months:'',balance:'',deliveryDate:today(),matriculaDate:today(),purchaseDate:today(),age:'',createdAt:'',updatedAt:''};}
function deliveryFromCredit(f){
 const q=creditQuote(f),chosen=q.terms.find(t=>t.months===f.months);
 return {creditId:f.id,clientId:f.clientId||'',saleType:'credito',name:f.name,dui:f.dui,occupation:f.position||'',model:f.model||'',year:f.year||'',price:f.price??null,
  prima:f.price?'$'+creditMoney(q.fee+q.prima):'',plan:'SIETE TRES 47%',payment:chosen&&f.price?'$'+creditMoney(chosen.payment):'',months:f.price?String(f.months):'',balance:f.price?'$'+creditMoney(q.amount):'',age:ageFrom(f.birth)};
}
// Espacios especiales copiados de otros sistemas (no se ven en el PDF) pasan a ser espacios normales.
const cleanSpaces=v=>String(v??'').replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g,' ').trim();
function deliveryValues(f){
 // Si la entrega está unida a un crédito, la prima, la cuota, el plazo y el saldo salen del crédito tal como está hoy.
 const c=f.saleType==='credito'&&f.creditId?(db.creditForms||[]).find(x=>x.id===f.creditId):null;
 if(c&&c.price){const fresh=deliveryFromCredit(c);f={...f,prima:fresh.prima,plan:fresh.plan,payment:fresh.payment,months:fresh.months,balance:fresh.balance};}
 const up=v=>cleanSpaces(v).toUpperCase(),d=dateParts(f.deliveryDate),m=dateParts(f.matriculaDate),credit=f.saleType==='credito';
 return {name:up(f.name),dui:up(f.dui),occupation:up(f.occupation),municipio:up(f.municipio),departamento:up(f.departamento),model:up(f.model),color:up(f.color),year:up(f.year),
  motor:up(f.motor),chasis:up(f.chasis),poliza:up(f.poliza),priceWords:f.price!=null&&f.price!==''?moneyWords(f.price):'',
  dateLong:d?`${d.d} DE ${ES_MONTHS[d.m-1]} DE ${d.y}`:'',
  dayWords:m?numberWords(m.d):'',month:m?ES_MONTHS[m.m-1]:'',yearWords:m?numberWords(m.y):'',motoYearWords:/^\d{4}$/.test(String(f.year).trim())?numberWords(f.year):up(f.year),
  duiWords:spellChars(f.dui),polizaWords:spellChars(f.poliza).replace(/ - /g,' - '),modelWords:modelWords(f.model),motorWords:spellChars(f.motor),chasisWords:spellChars(f.chasis),
  prima:credit?up(f.prima):'',plan:credit?up(f.plan):'',payment:credit?up(f.payment):'',months:credit?up(f.months):'',balance:credit?up(f.balance):'',
  xContado:credit?'':'X',xCredito:credit?'X':'',financiera:credit?'CREDIOPCIONES':'',
  docDateWords:dateWordsLower(f.deliveryDate),purchaseDateWords:dateWordsLower(f.purchaseDate||f.deliveryDate),age:String(f.age??'').trim(),ageWords:/^\d{1,3}$/.test(String(f.age??'').trim())?numberWords(Number(f.age)):up(f.age)};
}
function validateDeliveryForms(v){
 if(v.deliveryForms===undefined)return;
 if(!Array.isArray(v.deliveryForms)||v.deliveryForms.length>25000)throw new Error('La colección de entregas no es válida.');
 const ids=new Set(),str=(s,max)=>typeof s==='string'&&s.length<=max;
 for(const f of v.deliveryForms){
  if(!f||typeof f.id!=='string'||!/^[\w-]{1,100}$/.test(f.id)||ids.has(f.id))throw new Error('Hay una entrega sin identificador válido o repetido.');ids.add(f.id);
  if(!['credito','contado'].includes(f.saleType)||DELIVERY_TEXT.some(k=>!str(f[k],300))||!(f.price===null||(typeof f.price==='number'&&Number.isFinite(f.price)&&f.price>=0&&f.price<=1e10)))throw new Error('Hay una entrega con datos inválidos.');
 }
}
validateCreditForms=(base=>v=>{base(v);validateDeliveryForms(v);})(validateCreditForms);

/* ---------- Datos de SAP ---------- */
// Lee motor, chasis, póliza, color y año del texto de SAP (pegado o leído de la captura).
function parseSAP(text){
 const t=String(text||'').replace(/\r/g,'').replace(/[|]/g,' ');
 const line=re=>{const m=t.match(re);return m?m[1].trim().replace(/\s{2,}/g,' '):'';};
 const code=v=>v.replace(/[^A-Z0-9-]/gi,'').toUpperCase();
 const out={};
 const motor=code(line(/^\s*MOTOR\b[\s:]*([A-Z0-9][A-Z0-9 ]{4,})\s*$/im));if(motor)out.motor=motor;
 const chasis=code(line(/^\s*CHASIS\b[\s:]*([A-Z0-9][A-Z0-9 ]{8,})\s*$/im)||line(/^\s*VIN\b[\s:]*([A-Z0-9][A-Z0-9 ]{8,})\s*$/im));if(chasis)out.chasis=chasis;
 const poliza=line(/N[UÚ]MERO[\s_]*DE[\s_]*P[OÓ]LIZA\b[\s:]*([0-9][0-9 -]*[0-9])/i).replace(/\s+/g,'');if(poliza)out.poliza=poliza;
 const c1=line(/COLOR[\s_]*COMERCIAL[\s_]*1\b[\s:]*(.+)$/im),c2=line(/COLOR[\s_]*COMERCIAL[\s_]*2\b[\s:]*(.+)$/im);
 const color=[c1,c2].filter(Boolean).join(' ').toUpperCase();if(color)out.color=color;
 const den=line(/Denominaci[oó]n\b[\s:]*(.+)$/im);const y=den.match(/\b(20\d\d)\b/);if(y)out.year=y[1];
 return out;
}
let deliveryOcrWorker=null;
function ocrTag(id){const el=document.getElementById(id);if(!el)throw Error('El lector de capturas no está incluido en este archivo.');return el.textContent.trim();}
async function deliveryReadImage(blob,status){
 status('Leyendo la captura… la primera vez tarda unos segundos.');
 if(!globalThis.Tesseract){const s=document.createElement('script');s.textContent=ocrTag('tvs-ocr-lib');document.head.append(s);}
 if(!deliveryOcrWorker){
  // Abierto como archivo, Chrome no deja que el lector cargue piezas aparte: núcleo y trabajador van en un solo script.
  // Los datos del idioma también van dentro: el lector los «descarga» de una dirección local que nunca sale a internet.
  const dec=new TextDecoder();
  const prelude=`const __tvsEng=${JSON.stringify(ocrTag('tvs-ocr-eng'))};self.fetch=(f=>(u,...a)=>String(u).startsWith('https://tvs-panel.local/')?Promise.resolve(new Response(Uint8Array.from(atob(__tvsEng),c=>c.charCodeAt(0)))):f(u,...a))(self.fetch);`;
  const script=dec.decode(creditB64(ocrTag('tvs-ocr-core')))+'\n;\n'+prelude+'\n;\n'+dec.decode(creditB64(ocrTag('tvs-ocr-worker')));
  const workerPath=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
  deliveryOcrWorker=await Tesseract.createWorker('eng',1,{workerPath,workerBlobURL:false,corePath:'incluido.js',langPath:'https://tvs-panel.local/ocr',cacheMethod:'none',gzip:true});
 }
 // Se amplía la captura al doble: el texto chico de SAP se lee mejor.
 const bmp=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bmp.width*2;c.height=bmp.height*2;
 const g=c.getContext('2d');g.imageSmoothingQuality='high';g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0,c.width,c.height);
 const big=await new Promise(r=>c.toBlob(r,'image/png'));
 const {data}=await deliveryOcrWorker.recognize(big);
 return data.text;
}
function applySAP(found,status){
 const form=$('delivery-form');if(!form)return;
 const keys=Object.keys(found);
 if(!keys.length){status('No encontré motor, chasis ni póliza. Revisá que la captura muestre las Características, o escribilos a mano.',true);return;}
 for(const k of keys){if(form[k]){form[k].value=found[k];form[k].classList.add('delivery-filled');}}
 const warn=found.chasis&&found.chasis.length!==17?' El chasis no tiene 17 caracteres: revisalo.':'';
 status(`Listo: ${keys.map(k=>DELIVERY_LABELS[k]||k).join(', ')}. Revisá que estén bien antes de descargar.${warn}`,!!warn);
}
async function handleSAPInput(dataTransfer){
 const box=$('delivery-sap-status'),status=(msg,bad=false)=>{if(box){box.textContent=msg;box.hidden=false;box.classList.toggle('bad',!!bad);}};
 const file=[...(dataTransfer?.files||[])].find(f=>f.type.startsWith('image/'))||[...(dataTransfer?.items||[])].map(i=>i.kind==='file'&&i.type.startsWith('image/')?i.getAsFile():null).find(Boolean);
 try{
  if(file){applySAP(parseSAP(await deliveryReadImage(file,status)),status);return true;}
  const text=dataTransfer?.getData?.('text/plain');
  if(text){applySAP(parseSAP(text),status);return true;}
 }catch(err){status('No se pudo leer la captura: '+(err?.message||err)+'. Escribí los datos a mano.',true);return true;}
 return false;
}

/* ---------- Pantalla ---------- */
function deliveryPanel(){
 const list=[...(db.deliveryForms||[])].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const rows=list.map(f=>`<tr><td><strong>${esc(f.name)}</strong><small>DUI ${esc(f.dui)} · ${f.saleType==='credito'?'Crédito':'Contado'} · entrega ${esc(fmtDate(f.deliveryDate))}</small></td><td>${esc(f.model||'—')}<small>${f.chasis?'Chasis '+esc(f.chasis):'Sin chasis'}${f.poliza?' · Póliza '+esc(f.poliza):''}</small></td><td><div class="table-actions credit-pdf-actions"><button class="btn" data-action="delivery-print-menu" data-id="${esc(f.id)}">Imprimir</button><button class="btn" data-action="delivery-word-menu" data-id="${esc(f.id)}" title="Descargar los Word originales llenos, para corregirlos a mano">Word</button><button class="btn" data-action="delivery-edit" data-id="${esc(f.id)}">Editar</button><button class="btn btn-quiet" data-action="delivery-delete" data-id="${esc(f.id)}" aria-label="Borrar entrega de ${esc(f.name)}">Borrar</button></div></td></tr>`).join('');
 return `<section class="card credit-panel delivery-panel" aria-labelledby="delivery-panel-title"><div class="card-head"><div><h2 id="delivery-panel-title">Entrega de la moto</h2><p class="subtext">Póliza (placa), carta de entrega, IPM (impuesto de primera matrícula) y carta de exoneración con los formatos originales. Pegá la captura de SAP para llenar motor, chasis, póliza y color.</p></div><button class="btn btn-primary" data-action="delivery-new">+ Nueva entrega</button></div>${list.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Moto</th><th><span class="sr-only">Documentos y acciones</span></th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty compact">${icon('document')}<h3>Todavía no hay entregas</h3><p>Elegí un crédito ingresado (o una venta de contado) y pegá la captura de SAP.</p></div>`}</section>`;
}
renderRequests=(base=>function(){base();$('view-financieras').insertAdjacentHTML('beforeend',deliveryPanel());})(renderRequests);

function dIn(label,name,value,opts={}){const {type='text',full=false,hint='',list='',max=200,upper=false}=opts;return `<div class="field${full?' full':''}"><label for="df-${name}">${esc(label)}</label><input id="df-${name}" name="${name}" type="${type}" value="${esc(value??'')}" maxlength="${max}"${type==='number'?' min="0" step="0.01" inputmode="decimal"':''}${list?` list="${list}"`:''}${upper?' class="delivery-upper" autocapitalize="characters"':''}>${hint?`<small>${esc(hint)}</small>`:''}</div>`;}
function ipmDateField(iso){
 const d=dateParts(iso)||dateParts(today()),y0=dateParts(today()).y;
 const opt=(v,label,sel)=>`<option value="${v}"${sel?' selected':''}>${label}</option>`;
 const days=Array.from({length:31},(_,i)=>opt(i+1,numberWords(i+1),i+1===d.d)).join('');
 const months=ES_MONTHS.map((m,i)=>opt(i+1,m,i+1===d.m)).join('');
 const years=Array.from(new Set([y0-1,y0,y0+1,d.y])).sort().map(y=>opt(y,numberWords(y),y===d.y)).join('');
 return `<div class="field full"><span class="field-label" id="ipm-date-label">Fecha del IPM</span><div class="ipm-date" role="group" aria-labelledby="ipm-date-label"><select name="ipmDay" aria-label="Día">${days}</select><span>días del mes de</span><select name="ipmMonth" aria-label="Mes">${months}</select><span>del año</span><select name="ipmYear" aria-label="Año">${years}</select></div><small>Así sale en el IPM: «San Salvador, <span id="ipm-date-preview">${esc(numberWords(d.d))} días del mes de ${esc(ES_MONTHS[d.m-1])} del año ${esc(numberWords(d.y))}</span>».</small></div>`;
}
function ipmDateFromForm(form){
 const y=Number(form.ipmYear?.value),m=Number(form.ipmMonth?.value);let d=Number(form.ipmDay?.value);
 if(!y||!m||!d)return '';
 const last=new Date(Date.UTC(y,m,0)).getUTCDate();if(d>last)d=last;
 return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function openDeliveryForm(id='',creditId=''){
 let f=id?(db.deliveryForms||[]).find(x=>x.id===id):null;
 if(!f){f=emptyDelivery();if(creditId){const c=(db.creditForms||[]).find(x=>x.id===creditId);if(c)Object.assign(f,deliveryFromCredit(c));}}
 // Al abrir una entrega unida a un crédito, el financiamiento se muestra actualizado (prima con gastos de formalización)
 else if(f.saleType==='credito'&&f.creditId){const c=(db.creditForms||[]).find(x=>x.id===f.creditId);if(c&&c.price){const fresh=deliveryFromCredit(c);f={...f,prima:fresh.prima,plan:fresh.plan,payment:fresh.payment,months:fresh.months,balance:fresh.balance};}}
 deliveryDraft={id:f.id};
 const credits=[...(db.creditForms||[])].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 // Clientes del mes que compran de contado (forma de pago «Contado»)
 const cashClients=db.clients.filter(c=>c.paymentMode==='Contado'&&!c.archived&&!c.namePending).sort((a,b)=>String(b.recordDate||'').localeCompare(String(a.recordDate||'')));
 const creditOpts=`<option value="">Sin elegir (escribir a mano)</option>`
  +(credits.length?`<optgroup label="Créditos ingresados">${credits.map(c=>`<option value="${esc(c.id)}"${c.id===f.creditId?' selected':''}>${esc(c.name)} · ${esc(c.model||'sin moto')}</option>`).join('')}</optgroup>`:'')
  +(cashClients.length?`<optgroup label="Clientes de contado (Clientes del mes)">${cashClients.map(c=>`<option value="client:${esc(c.id)}"${!f.creditId&&f.clientId===c.id?' selected':''}>${esc(c.name)} · ${esc(stock(c.stockId)?.label||'sin moto')} · ${esc(c.stage)}</option>`).join('')}</optgroup>`:'');
 const body=`<form id="delivery-form" class="credit-form delivery-form" novalidate><p class="form-error" id="delivery-error" hidden></p>
 <div class="form-grid">
  <div class="field"><label for="df-creditId">Crédito o cliente de contado</label><select id="df-creditId" name="creditId">${creditOpts}</select><small>Crédito: se copian nombre, DUI, moto, precio y financiamiento. Contado: nombre, moto y precio de Clientes del mes.</small></div>
  <div class="field"><span class="field-label">Tipo de venta</span><div class="delivery-sale" role="radiogroup"><label><input type="radio" name="saleType" value="credito"${f.saleType==='credito'?' checked':''}> Crédito</label><label><input type="radio" name="saleType" value="contado"${f.saleType==='contado'?' checked':''}> Contado</label></div></div>
 </div>
 <h3 class="section-label">Datos de SAP</h3>
 <div class="delivery-sap" id="delivery-sap" tabindex="0" role="button" aria-describedby="delivery-sap-help">${icon('document')}<div><strong>Pegá aquí la captura de SAP (Ctrl+V)</strong><span id="delivery-sap-help">O el texto copiado, o arrastrá la imagen. Se llenan motor, chasis, póliza, color y año.</span></div><label class="btn btn-small">Elegir imagen<input type="file" accept="image/*" id="delivery-sap-file" hidden></label></div>
 <p class="delivery-sap-status" id="delivery-sap-status" role="status" aria-live="polite" hidden></p>
 <div class="form-grid">${dIn('Número de motor','motor',f.motor,{upper:true})}${dIn('Número de chasis (VIN)','chasis',f.chasis,{upper:true})}${dIn('Número de póliza','poliza',f.poliza)}${dIn('Año','year',f.year,{max:10})}${dIn('Color','color',f.color,{full:true,upper:true})}</div>
 <h3 class="section-label">Cliente</h3>
 <div class="form-grid">${dIn('Nombre completo según DUI','name',f.name,{full:true,upper:true,max:150})}${dIn('DUI','dui',f.dui,{max:40,hint:'9 dígitos; el guion se pone solo'})}${dIn('Ocupación','occupation',f.occupation,{upper:true})}${dIn('Municipio','municipio',f.municipio,{upper:true})}${dIn('Departamento','departamento',f.departamento,{upper:true})}${dIn('Edad','age',f.age,{max:3,hint:'Para la exoneración. Se calcula con la fecha de nacimiento del crédito.'})}</div>
 <h3 class="section-label">Venta</h3>
 <div class="form-grid">${dIn('Modelo','model',f.model,{list:'credit-models',upper:true})}${dIn('Valor de venta $','price',f.price,{type:'number',hint:'En la carta sale en letras.'})}
 <div class="delivery-credit-only form-grid full">${dIn('Prima o enganche','prima',f.prima)}${dIn('Plan seleccionado','plan',f.plan)}${dIn('Cuotas de','payment',f.payment)}${dIn('Plazo (meses)','months',f.months,{max:10})}${dIn('Saldo para financiar','balance',f.balance)}</div>
 ${dIn('Fecha de entrega','deliveryDate',f.deliveryDate,{type:'date',hint:'Fecha de la carta de entrega y de la exoneración.'})}${dIn('Fecha de compra','purchaseDate',f.purchaseDate||f.deliveryDate,{type:'date',hint:'Exoneración: «el día … adquirí una motocicleta».'})}${ipmDateField(f.matriculaDate)}</div>
 <datalist id="credit-models">${db.stock.filter(s=>s.active!==false).map(s=>`<option value="${esc(s.label)}"></option>`).join('')}</datalist>
 </form>`;
 const actions=`<button class="btn" data-close>Cancelar</button><span class="credit-actions-office"><button class="btn btn-quiet" data-action="delivery-save-word" data-doc="carta">Carta Word</button><button class="btn btn-quiet" data-action="delivery-save-word" data-doc="matricula">IPM Word</button><button class="btn btn-quiet" data-action="delivery-save-word" data-doc="exoneracion">Exoneración Word</button><button class="btn btn-quiet delivery-contado-only" data-action="delivery-save-word" data-doc="compraventa">Compraventa Word</button></span><span class="credit-actions-office delivery-actions-print"><button class="btn btn-quiet" data-action="delivery-save-print" data-doc="placa">Póliza</button><button class="btn btn-quiet" data-action="delivery-save-print" data-doc="carta">Carta</button><button class="btn btn-quiet" data-action="delivery-save-print" data-doc="matricula">IPM</button><button class="btn btn-quiet" data-action="delivery-save-print" data-doc="exoneracion">Exoneración</button><button class="btn btn-quiet delivery-contado-only" data-action="delivery-save-print" data-doc="compraventa">Compraventa</button><button class="btn btn-quiet" data-action="delivery-save-print" data-doc="todo">Todo</button></span><span class="credit-actions-pdf"><button class="btn" data-action="delivery-save-pdf" data-doc="placa">${icon('download')}Póliza PDF</button><button class="btn" data-action="delivery-save-pdf" data-doc="carta">${icon('download')}Carta de entrega PDF</button><button class="btn" data-action="delivery-save-pdf" data-doc="matricula">${icon('download')}IPM PDF</button><button class="btn" data-action="delivery-save-pdf" data-doc="exoneracion">${icon('download')}Exoneración PDF</button><button class="btn delivery-contado-only" data-action="delivery-save-pdf" data-doc="compraventa">${icon('download')}Compraventa PDF</button></span><button class="btn btn-primary" type="submit" form="delivery-form">Guardar</button>`;
 openModal(id?'Editar entrega':'Entrega de la moto',body,actions,860);
 deliverySaleToggle();
}
function deliverySaleToggle(){const form=$('delivery-form');if(!form)return;const credit=form.querySelector('input[name="saleType"]:checked')?.value==='credito';form.querySelector('.delivery-credit-only').hidden=!credit;
 // La compraventa solo se habilita en ventas de contado
 document.querySelectorAll('#modal .delivery-contado-only').forEach(b=>{b.hidden=credit;});}
function readDeliveryForm(form){
 const fd=new FormData(form),text=k=>String(fd.get(k)??'').trim();
 const r={};for(const k of DELIVERY_TEXT)r[k]=cleanSpaces(text(k));
 r.matriculaDate=ipmDateFromForm(form)||r.matriculaDate||today();
 r.saleType=text('saleType')==='contado'?'contado':'credito';
 const raw=text('price');r.price=raw===''?null:Math.round(Number(raw)*100)/100;
 if(r.price!==null&&(!Number.isFinite(r.price)||r.price<0))throw Error('Revisá el valor de venta.');
 if(r.dui){try{r.dui=normalizeDUI(r.dui);}catch(e){throw e;}}
 for(const k of ['motor','chasis'])r[k]=r[k].toUpperCase().replace(/\s+/g,'');
 if(r.creditId.startsWith('client:')){r.clientId=r.creditId.slice(7);r.creditId='';}
 else r.clientId=r.creditId?((db.creditForms||[]).find(c=>c.id===r.creditId)?.clientId||''):'';
 return r;
}
function saveDeliveryForm(){
 const form=$('delivery-form');if(!form)return null;
 let rec;try{rec=readDeliveryForm(form);if(!rec.name)throw Error('Escribí el nombre del cliente.');}catch(err){deliveryError(err.message);return null;}
 const next=clone(db);next.deliveryForms??=[];const now=new Date().toISOString();
 const old=next.deliveryForms.find(f=>f.id===deliveryDraft?.id);
 if(old){Object.assign(old,rec,{updatedAt:now});rec=old;}
 else{rec=Object.assign({id:uid(),createdAt:now,updatedAt:now},rec);next.deliveryForms.push(rec);deliveryDraft={id:rec.id};}
 if(!commit(next,old?'Entrega actualizada.':'Entrega guardada.'))return null;
 return (db.deliveryForms||[]).find(f=>f.id===rec.id)||rec;
}
function deliveryError(msg){const el=$('delivery-error');if(el){el.textContent=msg;el.hidden=!msg;if(msg)el.scrollIntoView({block:'nearest'});}else if(msg)toast(msg,true);}
function deliveryMissing(kind,f){return DELIVERY_REQUIRED[kind].filter(k=>f[k]===null||f[k]===undefined||String(f[k]).trim()==='');}
function deliveryCheck(kind,f){
 const missing=deliveryMissing(kind,f);
 if(missing.length){
  const msg=`No se puede descargar la ${DELIVERY_KINDS[kind].label.toLowerCase()}: faltan ${missing.map(k=>DELIVERY_LABELS[k]).join(', ')}.`;
  if(!($('modal').open&&$('delivery-form'))&&f.id)openDeliveryForm(f.id);
  deliveryError(msg);toast(`Faltan ${missing.length} ${missing.length===1?'dato':'datos'} para ${DELIVERY_KINDS[kind].label.toLowerCase()}.`,true);
  const form=$('delivery-form');if(form){form.querySelectorAll('.credit-missing').forEach(el=>el.classList.remove('credit-missing'));for(const k of missing)form[k]?.classList.add('credit-missing');form[missing[0]]?.focus({preventScroll:true});}
  return false;
 }
 return true;
}
function deliveryFileName(kind,f,ext){return `${DELIVERY_KINDS[kind].file} - ${f.name.replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)} - ${creditDate().replace(/\//g,'-')}.${ext}`;}

/* ---------- Word lleno ---------- */
function deliveryWord(kind,f){
 const tpl=DELIVERY_DOCS?.templates?.[kind];if(!tpl)throw Error('No se encontró el documento original.');
 const v=deliveryValues(f),dec=new TextDecoder(),enc=new TextEncoder();
 const files=tpl.entries.map(([name,b64,crc,size])=>{if(crc!==undefined)return [name,creditB64(b64),crc,size];let data=creditB64(b64);if(/\.xml$/.test(name)){const text=dec.decode(data);if(text.includes('{{'))data=enc.encode(text.replace(/\{\{(\w+)\}\}/g,(m,k)=>creditXml(v[k]??'')));}return [name,data];});
 return creditZip(files);
}
/* ---------- PDF con el documento original de fondo ---------- */
// kind puede ser 'carta', 'matricula' (IPM), 'exoneracion' o 'todo' (los tres en un solo PDF, para imprimir de una vez).
function deliveryPDF(kind,f){
 const D=DELIVERY_DOCS,kinds=kind==='todo'?deliveryKindsFor(f):[kind];
 if(kinds.some(k=>!D?.layouts?.[k]))throw Error('No se encontró el documento original.');
 const J=globalThis.jspdf?.jsPDF;if(!J)throw Error('No se pudo cargar el generador de PDF.');
 const doc=new J({unit:'pt',format:'letter',orientation:'portrait',compress:true});creditFonts(doc);
 const v=deliveryValues(f);let first=true;
 if(kinds.includes('compraventa')&&D.fonts?.gothic){doc.addFileToVFS('DidactGothic.ttf',D.fonts.gothic);doc.addFont('DidactGothic.ttf','Gothic','normal');if(D.fonts.gothicBold){doc.addFileToVFS('JostBold.ttf',D.fonts.gothicBold);doc.addFont('JostBold.ttf','Gothic','bold');}}
 for(const k of kinds){const lay=D.layouts[k];
  if(lay.flow){deliveryDrawFlow(doc,lay,v,first);first=false;continue;}
  for(let p=0;p<lay.pages;p++){
   const [w,h]=lay.size||[612,792];
   if(first){if(lay.placa){doc.deletePage(1);doc.addPage([w,h],'landscape');}}
   else doc.addPage(lay.placa?[w,h]:'letter',lay.placa?'landscape':'portrait');
   first=false;
   doc.addImage(D.images[k][p],'JPEG',0,0,w,h,undefined,'FAST');
   if(lay.placa)deliveryDrawPlaca(doc,v);
   for(const item of lay.items.filter(i=>i.page===p))deliveryDrawItem(doc,item,v);
  }}
 return doc;
}
// Documento de solo texto (compraventa): se compone completo con los márgenes, el interlineado y la letra del Word
// (Century Gothic → weezerfont; negrita → SansSerifBldFLF, las letras que entregó el usuario). Si el texto crece, pasa a la hoja siguiente.
function deliveryDrawFlow(doc,lay,v,first){
 const [W,H]=lay.size,m=lay.margins,left=m.left,width=W-m.left-m.right,bottom=H-m.bottom;
 if(!first)doc.addPage([W,H],'portrait');
 const font=doc.getFontList().Gothic?'Gothic':'helvetica';
 let y=m.top,pendingBlank=0;
 const newPage=()=>{doc.addPage([W,H],'portrait');y=m.top;};
 const hasBold=!!doc.getFontList().Gothic?.includes('bold');
 const setRun=w=>{doc.setFont(font,w.b&&(font!=='Gothic'||hasBold)?'bold':'normal');doc.setFontSize(w.size);};
 // Ancho con el espaciado entre letras de la plantilla (comprimido −0,1 pt, como en el Word)
 const textW=(t,w)=>{setRun(w);return doc.getTextWidth(t)+(w.cs||0)*t.length;};
 const draw=(w,x,base)=>{setRun(w);const o={charSpace:w.cs||0};if(w.b&&font==='Gothic'&&!hasBold){doc.setLineWidth(w.size*.035);doc.setDrawColor(0,0,0);o.renderingMode='fillThenStroke';}doc.text(w.t,x,base,o);};
 doc.setTextColor(0,0,0);
 const paras=lay.paragraphs.map(para=>{const runs=para.runs.map(r=>({...r,t:r.t.replace(/\{\{(\w+)\}\}/g,(mm,k)=>v[k]??'')}));const raw=runs.map(r=>r.t).join('');
  return {para,runs,raw,blank:!raw.trim(),cols:/\t| {4,}/.test(raw)};});
 paras.forEach((P,pi)=>{
  const {para,runs,raw}=P;
  const size=Math.max(...runs.map(r=>r.size),10),lh=para.lineRule==='auto'?para.line*size*1.17:para.line;
  const baseOff=lh-(lh-size)/2-size*.22;
  // Renglones en blanco: se guardan y se aplican antes del siguiente texto
  if(P.blank){pendingBlank+=lh;return;}
  if(P.cols){
   // Firmas: la línea y el rótulo van juntos y en la misma hoja que el final del texto.
   // Si no caben, se achica el espacio en blanco de arriba; solo si aun así no caben, pasan a la hoja siguiente.
   let group=1;while(paras[pi+group]?.cols)group++;
   const prevCols=pi>0&&paras[pi-1].cols;
   if(!prevCols){const need=group*lh;if(y+pendingBlank+need>bottom){pendingBlank=Math.max(0,bottom-y-need);if(y+need>bottom){newPage();pendingBlank=0;}}}
   y+=pendingBlank;pendingBlank=0;
   const segs=raw.split(/\t+| {4,}/).map(t=>t.trim()).filter(Boolean),colW=(width-para.indLeft)/Math.max(2,segs.length);
   const cs=runs.find(r=>r.cs!=null)?.cs||0;
   segs.forEach((t,i)=>{const w={t,b:runs.some(r=>r.b&&r.t.includes(t)),size,cs};draw(w,left+para.indLeft+colW*i+(colW-textW(t,w))/2,y+baseOff);});
   y+=lh+para.after;return;
  }
  if(pendingBlank){y+=pendingBlank;pendingBlank=0;if(y+lh>bottom)newPage();}
  // Palabras con su formato
  const words=[];
  for(const r of runs){for(const part of r.t.split(/( +)/)){if(!part)continue;if(/^ +$/.test(part)){if(words.length)words[words.length-1].space=true;continue;}words.push({t:part,b:!!r.b,size:r.size,cs:r.cs||0,glue:words.length>0&&!words[words.length-1].space});}}
  const spaceW=w=>textW(' ',w),wordW=w=>textW(w.t,w);
  const lines=[];let line=[],lw=0,firstLine=true;
  const avail=()=>width-para.indLeft-(firstLine?para.firstLine:0);
  for(const w of words){const add=(line.length&&!w.glue?spaceW(w):0)+wordW(w);
   if(line.length&&!w.glue&&lw+add>avail()+.01){lines.push({words:line,w:lw,first:firstLine});line=[];lw=0;firstLine=false;}
   lw+=(line.length&&!w.glue?spaceW(w):0)+wordW(w);line.push(w);}
  if(line.length)lines.push({words:line,w:lw,first:firstLine});
  // Si después de este texto vienen firmas, las dos últimas líneas van en la misma hoja que ellas (la firma nunca queda sola)
  let k=pi+1;while(paras[k]?.blank)k++;
  let sigGroup=0;while(paras[k+sigGroup]?.cols)sigGroup++;
  const sigNeed=sigGroup?sigGroup*lh+lh:0,keep=Math.min(2,lines.length);
  lines.forEach((ln,li)=>{
   if(y+lh>bottom+.5)newPage();
   else if(sigGroup&&li===lines.length-keep&&y+keep*lh+sigNeed>bottom+.5&&y>m.top+.5)newPage();
   const x0=left+para.indLeft+(ln.first?para.firstLine:0),av=width-para.indLeft-(ln.first?para.firstLine:0);
   const gaps=ln.words.filter((w,i)=>i&&!w.glue).length,last=li===lines.length-1;
   const extra=para.align==='justify'&&!last&&gaps?(av-ln.w)/gaps:0;
   let x=para.align==='center'?x0+(av-ln.w)/2:para.align==='right'?x0+av-ln.w:x0;
   ln.words.forEach((w,i)=>{if(i&&!w.glue)x+=spaceW(w)+extra;draw(w,x,y+baseOff);x+=wordW(w);});
   y+=lh;
  });
  y+=para.after;
 });
}
// Póliza tipo placa: los textos van donde los pone el PowerPoint original (Arial Narrow ≈ Helvetica angosta).
const PLACA_TEXTS=[
 {key:'poliza',x:494,capTop:147,size:111,scale:.8,maxW:470},
 {t:'POLIZA',x:494,capTop:237,size:42,scale:.84},
 {t:'TVS ROOSEVLET',x:505,capTop:330,size:19,scale:1},
 {t:'SAN MIGUEL.',x:505,capTop:357,size:19,scale:1},
 {t:'6082-4466.',x:517,capTop:392,size:60,scale:.82}];
function deliveryDrawPlaca(doc,v){
 doc.setTextColor(0,0,0);doc.setFont('helvetica','bold');
 for(const it of PLACA_TEXTS){
  const text=it.key?String(v[it.key]||''):it.t;if(!text)continue;
  let size=it.size;doc.setFontSize(size);
  // Una póliza más larga se achica para que quepa en la placa
  while(it.maxW&&size>40&&doc.getTextWidth(text)*it.scale>it.maxW){size-=2;doc.setFontSize(size);}
  const w=doc.getTextWidth(text)*it.scale,cap=it.capTop+(it.size-size)*.718/2;
  doc.text(text,it.x-w/2,cap+size*.718,{horizontalScale:it.scale});
 }
}
// Imprimir: abre el PDF en una pestaña con la ventana de impresión lista.
function deliveryPrint(kind,f){
 const kinds=kind==='todo'?deliveryKindsFor(f):[kind];
 if(!kinds.every(k=>deliveryCheck(k,f)))return false;
 try{
  const doc=deliveryPDF(kind,f),title=kind==='todo'?'Documentos de entrega':DELIVERY_KINDS[kind].label;
  // El visor muestra este nombre arriba (en vez de un código)
  doc.setProperties({title:`${title} - ${cleanSpaces(f.name)}`});doc.viewerPreferences({DisplayDocTitle:true});
  const blob=doc.output('blob');
  openPdfViewer(title,blob,deliveryFileName(kind==='todo'?'carta':kind,f,'pdf').replace(DELIVERY_KINDS.carta.file,kind==='todo'?'Documentos de entrega':DELIVERY_KINDS.carta.file));
  return true;
 }catch(err){toast(err.message,true);deliveryError(err.message);return false;}
}
// Vista para imprimir: ventana en el centro de la misma página con el visor de PDF (imprimir, descargar, ver hojas).
function openPdfViewer(title,blob,fileName){
 closePdfViewer();
 const url=URL.createObjectURL(blob),box=document.createElement('div');
 box.className='pdf-viewer';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','pdf-viewer-title');
 box.innerHTML=`<div class="pdf-viewer-card"><div class="pdf-viewer-head"><h3 id="pdf-viewer-title">${esc(title)}</h3><button type="button" class="pdf-viewer-x" data-pdf-close aria-label="Cerrar">×</button></div><div class="pdf-viewer-body"><iframe title="${esc(title)}" src="${url}#view=FitH"></iframe></div><div class="pdf-viewer-actions"><span class="subtext">Usá el ícono de la impresora del visor, o el botón Imprimir.</span><button type="button" class="btn" data-pdf-close>Cerrar</button><button type="button" class="btn" data-pdf-download>${icon('download')}Descargar</button><button type="button" class="btn btn-primary" data-pdf-print>Imprimir</button></div></div>`;
 box._url=url;box._name=fileName;
 ($('modal').open?$('modal'):document.body).append(box);
 box.querySelector('[data-pdf-print]').focus();
}
function closePdfViewer(){const box=document.querySelector('.pdf-viewer');if(!box)return;box.remove();setTimeout(()=>URL.revokeObjectURL(box._url),1000);}
document.addEventListener('click',e=>{
 const box=e.target.closest?.('.pdf-viewer');if(!box)return;
 if(e.target.closest('[data-pdf-close]')||e.target===box){closePdfViewer();return;}
 if(e.target.closest('[data-pdf-download]')){const a=document.createElement('a');a.href=box._url;a.download=box._name;document.body.append(a);a.click();a.remove();return;}
 if(e.target.closest('[data-pdf-print]')){
  const frame=box.querySelector('iframe');
  try{frame.contentWindow.focus();frame.contentWindow.print();}
  catch{toast('Usá el ícono de la impresora en la barra del visor.',true);}
 }
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.pdf-viewer')){e.preventDefault();e.stopPropagation();closePdfViewer();}},true);
document.addEventListener('cancel',e=>{if(document.querySelector('.pdf-viewer'))e.preventDefault();},true);
function deliveryFont(doc,item,bold){doc.setFont(item.font==='carlito'?'Carlito':item.font==='helvetica'?'helvetica':'times',bold?'bold':'normal');}
function deliveryDrawItem(doc,item,v){
 // Palabras con su formato (negrita, subrayado, mayúsculas)
 const words=[];
 for(const r of item.runs){
  let t=r.t.replace(/\{\{(\w+)\}\}/g,(m,k)=>v[k]??'');if(r.caps)t=t.toUpperCase();
  const parts=t.replace(/\t/g,' ').split(/( +)/);
  for(const part of parts){if(part==='')continue;if(/^ +$/.test(part)){if(words.length)words[words.length-1].space=true;continue;}
   const glue=words.length&&!words[words.length-1].space;words.push({t:part,b:!!r.b,u:!!r.u,glue});}
 }
 if(!words.length)return;
 doc.setTextColor(0,0,0);doc.setDrawColor(0,0,0);
 const width=item.right-item.left;let size=item.size;
 const wW=w=>{deliveryFont(doc,item,w.b);return doc.getTextWidth(w.t);};
 const spaceW=()=>{deliveryFont(doc,item,false);return doc.getTextWidth(' ');};
 const lineW=l=>l.reduce((n,w,i)=>n+wW(w)+(i&&!w.glue?spaceW():0),0);
 if(item.align!=='justify'){
  // Un dato suelto: una línea; si no cabe, la letra se achica (hasta 60 %).
  doc.setFontSize(size);while(size>item.size*.6&&lineW(words)>width){size-=.25;doc.setFontSize(size);}
  let x=item.align==='right'?item.right-lineW(words):item.left;
  words.forEach((w,i)=>{if(i&&!w.glue)x+=spaceW();deliveryFont(doc,item,w.b);doc.text(w.t,x,item.top,{baseline:'top'});const ww=doc.getTextWidth(w.t);if(w.u){doc.setLineWidth(.5);doc.line(x,item.top+size*.95,x+ww,item.top+size*.95);}x+=ww;});
  return;
 }
 // Párrafo justificado, como en el Word
 doc.setFontSize(size);
 const lines=[];let line=[];
 for(const w of words){if(line.length&&lineW([...line,w])>width&&!w.glue){lines.push(line);line=[];}line.push(w);}
 if(line.length)lines.push(line);
 let y=item.top;
 lines.forEach((l,li)=>{const last=li===lines.length-1,gaps=l.filter((w,i)=>i&&!w.glue).length,extra=last||!gaps?0:(width-lineW(l))/gaps;let x=item.left;
  l.forEach((w,i)=>{if(i&&!w.glue)x+=spaceW()+extra;deliveryFont(doc,item,w.b);doc.text(w.t,x,y,{baseline:'top'});const ww=doc.getTextWidth(w.t);if(w.u){doc.setLineWidth(.5);doc.line(x,y+size*.95,x+ww,y+size*.95);}x+=ww;});
  y+=item.lineGap;});
}
function downloadDelivery(kind,f,format){
 if(!deliveryCheck(kind,f))return false;
 try{
  if(format==='word')creditSaveBlob(deliveryWord(kind,f),deliveryFileName(kind,f,'docx'));
  else deliveryPDF(kind,f).save(deliveryFileName(kind,f,'pdf'));
  toast(`${DELIVERY_KINDS[kind].label} descargada${format==='word'?' en Word. Abrila, revisala y guardala como PDF.':' en PDF.'}`);return true;
 }catch(err){toast(err.message,true);deliveryError(err.message);return false;}
}

/* ---------- Eventos ---------- */
document.addEventListener('paste',e=>{if(!$('delivery-form'))return;const inSap=e.target.closest?.('#delivery-sap');const hasImage=[...(e.clipboardData?.items||[])].some(i=>i.kind==='file'&&i.type.startsWith('image/'));
 // Una imagen pegada en cualquier parte del formulario es la captura de SAP; el texto solo si se pega en el recuadro.
 if(hasImage||inSap){e.preventDefault();handleSAPInput(e.clipboardData);}});
document.addEventListener('dragover',e=>{if(e.target.closest?.('#delivery-sap')){e.preventDefault();e.target.closest('#delivery-sap').classList.add('drag');}});
document.addEventListener('dragleave',e=>{e.target.closest?.('#delivery-sap')?.classList.remove('drag');});
document.addEventListener('drop',e=>{const box=e.target.closest?.('#delivery-sap');if(!box)return;e.preventDefault();box.classList.remove('drag');handleSAPInput(e.dataTransfer);});
document.addEventListener('change',e=>{
 if(e.target.id==='delivery-sap-file'&&e.target.files?.[0]){handleSAPInput({files:e.target.files});e.target.value='';return;}
 if(!e.target.closest?.('#delivery-form'))return;
 if(e.target.name==='saleType')deliverySaleToggle();
 // Cliente de contado de Clientes del mes
 if(e.target.name==='creditId'&&e.target.value.startsWith('client:')){
  const c=client(e.target.value.slice(7)),form=$('delivery-form');
  if(c){form.querySelector('input[name="saleType"][value="contado"]').checked=true;
   const vals={name:c.name,model:stock(c.stockId)?.label||'',price:clientPrice(c)};
   for(const [k,val] of Object.entries(vals))if(form[k]&&val!==''&&val!==null&&val!==undefined)form[k].value=val;
   deliverySaleToggle();}
  return;
 }
 if(e.target.name==='creditId'&&e.target.value){const c=(db.creditForms||[]).find(x=>x.id===e.target.value);if(c){const form=$('delivery-form'),p=deliveryFromCredit(c);for(const [k,val] of Object.entries(p)){if(k==='saleType'){form.querySelector(`input[name="saleType"][value="${val}"]`).checked=true;continue;}if(form[k]&&form[k].type!=='radio'&&val!==''&&val!==null&&val!==undefined)form[k].value=val;}deliverySaleToggle();}}
 if(e.target.name==='dui'){try{e.target.value=normalizeDUI(e.target.value);}catch{}}
});
document.addEventListener('change',e=>{if(!['ipmDay','ipmMonth','ipmYear'].includes(e.target.name))return;const form=$('delivery-form'),iso=ipmDateFromForm(form),d=dateParts(iso);if(!d)return;
 // El día elegido se respeta; si no existe en ese mes (31 de abril) se avisa y se usa el último día.
 const fixed=Number(form.ipmDay.value)!==d.d?` (ese mes no tiene ${numberWords(Number(form.ipmDay.value)).toLowerCase()}: se usa ${numberWords(d.d).toLowerCase()})`:'';
 const prev=$('ipm-date-preview');if(prev)prev.textContent=`${numberWords(d.d)} días del mes de ${ES_MONTHS[d.m-1]} del año ${numberWords(d.y)}${fixed}`;});
document.addEventListener('input',e=>{if(e.target.closest?.('#delivery-form')&&e.target.classList.contains('credit-missing')&&String(e.target.value).trim())e.target.classList.remove('credit-missing');});
document.addEventListener('keydown',e=>{if(e.target.id==='delivery-sap'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('delivery-sap-file')?.click();}});
document.addEventListener('submit',e=>{if(e.target.id!=='delivery-form')return;e.preventDefault();if(saveDeliveryForm())$('modal').close();});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action^="delivery-"]');if(!b)return;const action=b.dataset.action,id=b.dataset.id||'';
 const rec=()=>(db.deliveryForms||[]).find(f=>f.id===id);
 if(action==='delivery-new')openDeliveryForm('',b.dataset.credit||'');
 else if(action==='delivery-edit')openDeliveryForm(id);
 else if(action==='delivery-pdf'){const f=rec();if(f)downloadDelivery(b.dataset.doc,f,'pdf');}
 else if(action==='delivery-word'){const f=rec();if(f&&downloadDelivery(b.dataset.doc,f,'word')&&$('modal').open&&!$('delivery-form'))$('modal').close();}
 else if(action==='delivery-save-print'){const f=saveDeliveryForm();if(f){deliveryError('');deliveryPrint(b.dataset.doc,f);}}
 else if(action==='delivery-print'){const f=rec();if(f){if($('modal').open&&!$('delivery-form'))$('modal').close();deliveryPrint(b.dataset.doc,f);}}
 else if(action==='delivery-print-menu'){const f=rec();if(!f)return;openModal('Imprimir',`<p>El documento se abre aquí mismo, con tu formato original, listo para imprimir o descargar.</p><div class="credit-office-list">${[['placa','Póliza (placa)'],['carta','Carta de entrega (4 hojas)'],['matricula','IPM (impuesto primera matrícula)'],['exoneracion','Carta de exoneración (2 hojas)'],['compraventa','Compraventa (contado)'],['todo','Todos los documentos juntos']].filter(([k])=>k==='todo'||deliveryKindsFor(f).includes(k)).map(([k,l])=>`<button class="btn" data-action="delivery-print" data-doc="${k}" data-id="${esc(f.id)}">${esc(l)}</button>`).join('')}</div>`,`<button class="btn" data-close>Cerrar</button>`,480);}
 else if(action==='delivery-save-pdf'||action==='delivery-save-word'){const f=saveDeliveryForm();if(f){deliveryError('');downloadDelivery(b.dataset.doc,f,action==='delivery-save-pdf'?'pdf':'word');}}
 else if(action==='delivery-word-menu'){const f=rec();if(!f)return;openModal('Descargar en Word',`<p>Se descargan tus documentos originales con los datos de <strong>${esc(f.name)}</strong>. Abrilos en Word, corregí lo que haga falta y guardalos como PDF.</p><div class="credit-office-list">${Object.entries(DELIVERY_KINDS).filter(([k,d])=>!d.pdfOnly&&deliveryKindsFor(f).includes(k)).map(([k,d])=>`<button class="btn" data-action="delivery-word" data-doc="${k}" data-id="${esc(f.id)}">${icon('download')}${esc(d.label)} <span class="credit-office-tag">Word</span></button>`).join('')}</div>`,`<button class="btn" data-close>Cerrar</button>`,520);}
 else if(action==='delivery-delete'){const f=rec();if(!f)return;openModal('Borrar entrega',`<p>¿Querés borrar la entrega de <strong>${esc(f.name)}</strong>?</p><p class="subtext">El crédito y la ficha del cliente no se borran.</p>`,`<button class="btn" data-close>Cancelar</button><button class="btn btn-danger" data-action="delivery-delete-confirm" data-id="${esc(id)}">Sí, borrar</button>`,480);}
 else if(action==='delivery-delete-confirm'){const next=clone(db);next.deliveryForms=(next.deliveryForms||[]).filter(f=>f.id!==id);if(commit(next,'Entrega borrada.'))$('modal').close();}
});
