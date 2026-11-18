// Ingreso de crédito Crediopciones · Plan Siete Tres 47%.
// Un solo formulario llena tres documentos PDF: Buró, Cotizador y Solicitud.
const CREDIT_LOGOS=/*CREDIT_LOGOS*/null;
const SIETE_TRES={rate:0.47,periods:12,fee:0.07,terms:[12,18,24,30,36,40,48]};
const CREDIT_REF_COUNT=2;
// Parentesco fijo, como en la hoja SOLICITUD.
const CREDIT_RELATION={fam:'FAMILIAR',friend:'CONOCIDA'};
const CREDIT_TEXT=['name','dui','phone','model','year','vendor','agency','agencyPhone','birth','sex','nationality','address','addressRef','company','position','startDate','workAddress','workRef','workPhone','detail'];
const CREDIT_NUMBERS=['price','down','income','otherIncome'];
let creditDraft=null;

function emptyCreditForm(){
 const last=[...(db.creditForms||[])].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
 return {id:'',clientId:'',name:'',dui:'',phone:'',model:'',year:'',price:null,down:null,months:18,vendor:db.settings.advisor||'',agency:last?.agency||'TVS ROOSEVELT SM',agencyPhone:db.settings.phone||last?.agencyPhone||'',birth:'',sex:'',nationality:'Salvadoreño',address:'',addressRef:'',company:'',position:'',startDate:'',income:null,otherIncome:null,workAddress:'',workRef:'',workPhone:'',detail:'',famRefs:blankRefs(),friendRefs:blankRefs(),createdAt:'',updatedAt:''};
}
function blankRefs(){return Array.from({length:CREDIT_REF_COUNT},()=>({name:'',phone:'',relation:''}));}

// Fecha en San Miguel (El Salvador), formato día/mes/año.
function creditDate(iso=today()){const [y,m,d]=String(iso).slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'';}
function creditPlace(sep=' '){return 'SAN MIGUEL'+sep+creditDate();}

function normalizeDUI(value){
 const digits=String(value??'').replace(/\D/g,'');
 if(digits.length!==9)throw Error('El DUI debe tener 9 dígitos, por ejemplo 01234567-8.');
 return digits.slice(0,8)+'-'+digits.slice(8);
}
function creditMoney(n){return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);}

// Misma fórmula que el Excel PLAN SIETE TRES 47: cuota = P·(i/12) / (1 − (1 + i/12)^−n).
function sieteTresQuote(price,down){
 const value=Number(price)||0,prima=Number(down)||0,amount=Math.max(0,value-prima),r=SIETE_TRES.rate/SIETE_TRES.periods;
 return {value,prima,amount,fee:value*SIETE_TRES.fee,primaRate:value?prima/value:0,
  terms:SIETE_TRES.terms.map(n=>({months:n,payment:amount?amount*r/(1-Math.pow(1+r,-n)):0}))};
}

function validateCreditForms(v){
 if(v.creditForms===undefined)return;
 if(!Array.isArray(v.creditForms)||v.creditForms.length>25000)throw new Error('La colección de créditos no es válida.');
 const ids=new Set(),str=(s,max)=>typeof s==='string'&&s.length<=max,num=n=>n===null||(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e10);
 const refs=list=>Array.isArray(list)&&list.length<=10&&list.every(r=>r&&str(r.name,150)&&str(r.phone,50)&&str(r.relation,80));
 for(const f of v.creditForms){
  if(!f||typeof f.id!=='string'||!/^[\w-]{1,100}$/.test(f.id)||ids.has(f.id))throw new Error('Hay un crédito sin identificador válido o repetido.');ids.add(f.id);
  if(!str(f.clientId,100)||!f.name?.trim()||!/^\d{8}-\d$/.test(f.dui)||CREDIT_TEXT.some(k=>!str(f[k],k==='detail'?5000:300))||CREDIT_NUMBERS.some(k=>!num(f[k]))||!SIETE_TRES.terms.includes(f.months)||!refs(f.famRefs)||!refs(f.friendRefs))throw new Error('Hay un crédito con datos inválidos.');
 }
}

/* ---------- Pantalla de Solicitudes ---------- */
// Solicitudes muestra solo Ingresar crédito. Las gestiones antiguas (db.requests) se conservan en los respaldos.
renderRequests=function(){
 $('view-financieras').innerHTML=heading('Solicitudes de crédito','Ingresá los datos del cliente una vez y descargá el Buró, el Cotizador o la Solicitud en PDF.')+creditPanel();
};
function creditPanel(){
 const list=[...(db.creditForms||[])].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const rows=list.map(f=>{const q=sieteTresQuote(f.price,f.down),chosen=q.terms.find(t=>t.months===f.months);return `<tr><td><strong>${esc(f.name)}</strong><small>DUI ${esc(f.dui)}${f.phone?' · '+esc(f.phone):''} · ${esc(fmtDate(String(f.updatedAt).slice(0,10)))}</small></td><td>${f.model?esc(f.model):'<span class="subtext">Sin moto</span>'}<small>${f.price?'$'+creditMoney(f.price)+' · prima $'+creditMoney(f.down||0):'Sin precio'}</small></td><td>${chosen&&f.price?'$'+creditMoney(chosen.payment)+'<small>'+f.months+' cuotas</small>':'—'}</td><td><div class="table-actions credit-pdf-actions"><button class="btn" data-action="credit-pdf" data-doc="buro" data-id="${esc(f.id)}">${icon('download')}Buró</button><button class="btn" data-action="credit-pdf" data-doc="cotizador" data-id="${esc(f.id)}">${icon('download')}Cotizador</button><button class="btn" data-action="credit-pdf" data-doc="solicitud" data-id="${esc(f.id)}">${icon('download')}Solicitud</button><button class="btn" data-action="credit-edit" data-id="${esc(f.id)}">Editar</button><button class="btn btn-quiet" data-action="credit-delete" data-id="${esc(f.id)}" aria-label="Borrar crédito de ${esc(f.name)}">Borrar</button></div></td></tr>`;}).join('');
 return `<section class="card credit-panel" aria-labelledby="credit-panel-title"><div class="card-head"><div><h2 id="credit-panel-title">Ingresar crédito · Crediopciones</h2><p class="subtext">Plan Siete Tres 47%. Llená los datos una vez y descargá el Buró, el Cotizador o la Solicitud en PDF.</p></div><button class="btn btn-primary" data-action="credit-new">+ Ingresar crédito</button></div>${list.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Moto</th><th>Cuota</th><th><span class="sr-only">Documentos y acciones</span></th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty compact">${icon('document')}<h3>Todavía no hay créditos ingresados</h3><p>Para la precalificación basta con el nombre y el DUI: guardá y descargá el Buró.</p></div>`}</section>`;
}

/* ---------- Formulario ---------- */
function cIn(label,name,value,opts={}){const {type='text',full=false,hint='',req=false,list='',max=type==='text'||type==='tel'?250:null,mode=''}=opts;return `<div class="field${full?' full':''}"><label for="cf-${name}">${esc(label)}${req?' *':''}</label><input id="cf-${name}" name="${name}" type="${type}" value="${esc(value??'')}"${max?` maxlength="${max}"`:''}${type==='number'?' min="0" step="0.01"':''}${list?` list="${list}"`:''}${mode?` inputmode="${mode}"`:''}${req?' required':''}>${hint?`<small>${esc(hint)}</small>`:''}</div>`;}
function cRefRows(kind,title,list){return `<div class="field full"><span class="field-label">${esc(title)}</span><div class="credit-refs">${list.map((r,i)=>`<div class="credit-ref"><span class="credit-ref-n">${i+1}.</span><input name="${kind}-${i}-name" aria-label="${esc(title)} ${i+1}: nombre completo" placeholder="Nombre completo" maxlength="150" value="${esc(r.name)}"><input name="${kind}-${i}-phone" aria-label="${esc(title)} ${i+1}: teléfono" placeholder="Teléfono" type="tel" inputmode="tel" maxlength="50" value="${esc(r.phone)}"><span class="credit-ref-tag" title="Parentesco">${CREDIT_RELATION[kind]}</span></div>`).join('')}</div></div>`;}
function openCreditForm(id='',clientId=''){
 const base=(db.creditForms||[]).find(f=>f.id===id);
 const f=base?clone(base):emptyCreditForm();
 if(!base&&clientId)Object.assign(f,clientPrefill(clientId));
 creditDraft={id:f.id};
 const stockList=`<datalist id="credit-models">${db.stock.filter(s=>s.active!==false).map(s=>`<option value="${esc(s.label)}"></option>`).join('')}</datalist>`;
 const body=`<form id="credit-form" class="credit-form" novalidate><div id="credit-error" class="form-error" role="alert" hidden></div>
 <p class="notice">La fecha se pone sola en los tres documentos: <strong>${esc(creditPlace(', '))}</strong>.</p>
 <div class="form-grid">${selectField('Cliente del panel · opcional','clientId',clientOptions(f.clientId,'Sin vincular'),true)}</div>
 <h3 class="credit-step"><span>1</span>Buró · precalificación</h3><p class="subtext credit-step-note">Con estos dos datos ya podés guardar y descargar el Buró.</p>
 <div class="form-grid">${cIn('Nombre completo según DUI','name',f.name,{req:true,full:true})}${cIn('Número de DUI','dui',f.dui,{req:true,hint:'9 dígitos, ejemplo 01234567-8',mode:'numeric',max:10})}${cIn('Teléfono celular','phone',f.phone,{type:'tel',mode:'tel',max:50})}</div>
 <h3 class="credit-step"><span>2</span>Cotizador Siete Tres 47%</h3><p class="subtext credit-step-note">Para descargar el Cotizador se necesitan el nombre, el teléfono celular y todos los campos de esta sección.</p>
 <div class="form-grid">${cIn('Moto (modelo)','model',f.model,{list:'credit-models',full:true})}${cIn('Año','year',f.year,{mode:'numeric',max:10})}${cIn('Valor de la moto $','price',f.price,{type:'number',mode:'decimal'})}${cIn('Prima $','down',f.down,{type:'number',mode:'decimal',hint:'Dejá 0 si no hay prima.'})}${selectField('Plazo elegido','months',options(SIETE_TRES.terms.map(n=>[n,n+' cuotas']),f.months))}<div class="field"><span class="field-label">Cuota del plazo elegido</span><output id="credit-chosen" class="credit-chosen">—</output></div>
 <div class="field full"><div class="credit-preview" id="credit-preview" aria-live="polite"></div></div>
 ${cIn('Vendedor','vendor',f.vendor)}${cIn('Agencia','agency',f.agency)}${cIn('Teléfono de la agencia','agencyPhone',f.agencyPhone,{type:'tel',mode:'tel',max:50})}</div>
 <h3 class="credit-step"><span>3</span>Solicitud de crédito</h3><p class="subtext credit-step-note">Para descargar la Solicitud se necesitan todos los campos, menos otros ingresos, punto de referencia y teléfono del trabajo, y el detalle.</p>
 <p class="section-label">Datos personales</p>
 <div class="form-grid">${cIn('Fecha de nacimiento','birth',f.birth,{type:'date'})}<div class="field"><span class="field-label">Sexo</span><div class="checks credit-sex"><label class="check"><input type="radio" name="sex" value="F"${f.sex==='F'?' checked':''}> F</label><label class="check"><input type="radio" name="sex" value="M"${f.sex==='M'?' checked':''}> M</label></div></div>${cIn('Nacionalidad','nationality',f.nationality)}${cIn('Dirección actual de residencia','address',f.address,{full:true})}${cIn('Punto de referencia','addressRef',f.addressRef,{full:true})}</div>
 <p class="section-label">Datos laborales</p>
 <div class="form-grid">${cIn('Empresa, negocio o actividad','company',f.company,{full:true})}${cIn('Cargo que ocupa','position',f.position)}${cIn('Fecha de ingreso','startDate',f.startDate,{type:'date'})}${cIn('Ingreso mensual $','income',f.income,{type:'number',mode:'decimal'})}${cIn('Otros ingresos $','otherIncome',f.otherIncome,{type:'number',mode:'decimal'})}${cIn('Dirección del trabajo','workAddress',f.workAddress,{full:true})}${cIn('Punto de referencia del trabajo','workRef',f.workRef)}${cIn('Teléfono de oficina o negocio','workPhone',f.workPhone,{type:'tel',mode:'tel',max:50})}</div>
 <p class="section-label">Referencias</p>
 <div class="form-grid">${cRefRows('fam','Referencias familiares que no vivan con el cliente',f.famRefs)}${cRefRows('friend','Referencias de amigos o compañeros de trabajo',f.friendRefs)}</div>
 <div class="form-grid" style="margin-top:18px"><div class="field full"><label for="cf-detail">Detalle</label><textarea id="cf-detail" name="detail" maxlength="5000" placeholder="Horario para localizar al cliente, verificación de campo, croquis, contacto para la constancia laboral…">${esc(f.detail)}</textarea></div></div>
 ${stockList}</form>`;
 const actions=`<button class="btn" data-close>Cancelar</button><span class="credit-actions-pdf"><button class="btn" data-action="credit-save-pdf" data-doc="buro">${icon('download')}Buró PDF</button><button class="btn" data-action="credit-save-pdf" data-doc="cotizador">${icon('download')}Cotizador PDF</button><button class="btn" data-action="credit-save-pdf" data-doc="solicitud">${icon('download')}Solicitud PDF</button></span><button class="btn btn-primary" type="submit" form="credit-form">Guardar</button>`;
 openModal(base?'Editar crédito':'Ingresar crédito · Crediopciones',body,actions,860);
 updateCreditPreview();
 if(!base)$('cf-name')?.focus();
}
function clientPrefill(clientId){
 const c=client(clientId);if(!c)return {};const s=stock(c.stockId);
 return {clientId,name:c.namePending?'':c.name,phone:(c.phone||'').replace(/^\+503\s?/,'').replace(/\s/g,''),model:s?.label||'',year:s?.year||'',price:c.price??s?.price??null};
}
function readCreditForm(form){
 const fd=new FormData(form),text=k=>String(fd.get(k)??'').trim(),number=k=>{const raw=text(k);if(raw==='')return null;const n=Number(raw);if(!Number.isFinite(n)||n<0||n>1e10)throw Error('Revisá el valor numérico de '+k+'.');return Math.round(n*100)/100;};
 const r={};for(const k of CREDIT_TEXT)r[k]=text(k);for(const k of CREDIT_NUMBERS)r[k]=number(k);
 r.clientId=text('clientId');r.months=Number(text('months'))||18;
 const refs=kind=>Array.from({length:CREDIT_REF_COUNT},(_,i)=>({name:text(`${kind}-${i}-name`),phone:text(`${kind}-${i}-phone`),relation:CREDIT_RELATION[kind]}));
 r.famRefs=refs('fam');r.friendRefs=refs('friend');
 return r;
}
function checkCreditRecord(r){
 if(!r.name)throw Error('Escribí el nombre completo según el DUI.');
 if(r.name.length>150)throw Error('El nombre es demasiado largo.');
 r.dui=normalizeDUI(r.dui);
 if(r.price!==null&&r.down!==null&&r.down>r.price)throw Error('La prima no puede ser mayor que el valor de la moto.');
 if(!SIETE_TRES.terms.includes(r.months))throw Error('Elegí un plazo válido.');
 return r;
}
function saveCreditForm(){
 const form=$('credit-form');if(!form)return null;
 let rec;try{rec=checkCreditRecord(readCreditForm(form));}catch(err){showCreditError(err.message);return null;}
 const next=clone(db);next.creditForms??=[];const now=new Date().toISOString();
 const old=next.creditForms.find(f=>f.id===creditDraft?.id);
 if(old){Object.assign(old,rec,{updatedAt:now});rec=old;}
 else{rec=Object.assign({id:uid(),createdAt:now,updatedAt:now},rec);next.creditForms.push(rec);creditDraft={id:rec.id};}
 if(rec.clientId){const c=next.clients.find(c=>c.id===rec.clientId);if(c&&typeof eventFor==='function')eventFor(c,old?'Datos de crédito Crediopciones actualizados.':'Crédito Crediopciones ingresado (Siete Tres 47%).');}
 if(!commit(next,old?'Crédito actualizado.':'Crédito guardado.'))return null;
 return (db.creditForms||[]).find(f=>f.id===rec.id)||rec;
}
function showCreditError(msg){const el=$('credit-error');if(el){el.textContent=msg;el.hidden=false;el.scrollIntoView({block:'nearest'});}else toast(msg,true);}
function updateCreditPreview(){
 const form=$('credit-form');if(!form)return;
 const price=Number(form.price.value)||0,down=Number(form.down.value)||0,box=$('credit-preview'),out=$('credit-chosen');
 if(!price){box.innerHTML='<p class="subtext">Ingresá el valor de la moto para ver las cuotas de 12 a 48 meses.</p>';out.textContent='—';return;}
 if(down>=price){box.innerHTML='<p class="form-error" style="margin:0">La prima debe ser menor que el valor de la moto: si cubre todo el valor, no hay nada que financiar.</p>';out.textContent='—';return;}
 const q=sieteTresQuote(price,down),months=Number(form.months.value);
 out.textContent='$'+creditMoney(q.terms.find(t=>t.months===months)?.payment);
 box.innerHTML=`<div class="credit-summary"><span>Gastos de formalización <strong>$${creditMoney(q.fee)}</strong></span><span>Prima <strong>${(q.primaRate*100).toFixed(2)}%</strong></span><span>Monto a financiar <strong>$${creditMoney(q.amount)}</strong></span></div><div class="credit-terms">${q.terms.map(t=>`<span class="${t.months===months?'active':''}"><small>${t.months} cuotas</small>$${creditMoney(t.payment)}</span>`).join('')}</div>`;
}

/* ---------- PDF ---------- */
function creditFileName(doc,f){return `${doc} - ${f.name.replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)} - ${creditDate().replace(/\//g,'-')}.pdf`;}
function needPDF(){const J=globalThis.jspdf?.jsPDF;if(!J)throw Error('No se pudo cargar el generador de PDF.');return new J({unit:'mm',format:'letter',orientation:'portrait',compress:true});}
function pdfFit(doc,text,maxW,size,minSize=6){let s=size;doc.setFontSize(s);while(s>minSize&&doc.getTextWidth(text)>maxW){s-=0.25;doc.setFontSize(s);}return s;}
// Texto dentro de una celda: se ajusta en varias líneas y reduce la letra si no cabe.
function pdfCell(doc,text,x,y,w,h,{size=9,bold=false,align='center',valign='middle',pad=1.2,color=[0,0,0],font='helvetica',maxLines=3}={}){
 text=String(text??'').trim();if(!text)return;doc.setFont(font,bold?'bold':'normal');doc.setTextColor(...color);
 let s=size,lines;
 for(;;){doc.setFontSize(s);lines=doc.splitTextToSize(text,w-pad*2);const lh=s*0.3528*1.15;if((lines.length<=maxLines&&lines.length*lh<=h-pad*0.6)||s<=5.5)break;s-=0.25;}
 if(lines.length>maxLines)lines=lines.slice(0,maxLines);
 const lh=s*0.3528*1.15,block=lines.length*lh;let ty=valign==='top'?y+pad+s*0.3528:valign==='bottom'?y+h-pad-block+s*0.3528:y+(h-block)/2+s*0.3528*0.86;
 for(const line of lines){const tx=align==='left'?x+pad:align==='right'?x+w-pad:x+w/2;doc.text(line,tx,ty,{align});ty+=lh;}
}
function pdfLabel(doc,text,x,y,{size=7,bold=false,color=[0,0,0]}={}){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(text,x,y);}
function pdfLogo(doc,key,x,y,w,h){const src=CREDIT_LOGOS?.[key];if(!src)return;try{doc.addImage(src,src.startsWith('data:image/png')?'PNG':'JPEG',x,y,w,h,undefined,'FAST');}catch{}}
const dateText=iso=>iso?creditDate(iso):'';

function makeBuroPDF(f){
 const doc=needPDF(),X=n=>n*0.3175,blue=[31,56,140];
 doc.setDrawColor(...blue);doc.setLineWidth(0.4);doc.line(X(79),X(39),X(601),X(39));doc.line(X(79),X(102),X(601),X(102));
 pdfLogo(doc,'buro',X(88),X(43),X(96),X(53));
 doc.setFont('times','bold');doc.setFontSize(12.5);doc.setTextColor(...blue);
 doc.text('AUTORIZACIÓN PARA CONSULTA DE',X(367),X(66),{align:'center'});doc.text('BURO CREDITICIO Y PERFIL',X(367),X(84),{align:'center'});
 doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.text('CC-CI-P-F-18',X(551),X(59),{align:'center'});
 doc.setLineWidth(0.25);doc.line(X(503),X(71),X(601),X(71));doc.setFont('helvetica','normal');doc.text('V. 4.0 | 16-06-2025',X(551),X(90),{align:'center'});
 doc.setFont('times','bold');doc.setFontSize(12.5);doc.setTextColor(52,84,140);doc.text(creditPlace(', '),X(340),X(158),{align:'center'});
 doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.setTextColor(0,0,0);
 doc.text('Señores',X(94),X(264));doc.text('CREDI OPCIONES, S.A. DE C.V.',X(94),X(283));doc.text('Presente',X(94),X(301));
 // Párrafo justificado con el nombre y el DUI subrayados, como en el Word.
 const rest='autorizo voluntariamente que la información recopilada y/o proporcionada por entidades públicas o privadas y la generada de relaciones contractuales, crediticias o comerciales, sea reportada a centrales de riesgo o burós de crédito para ser tratada, almacenada o transferida; y autorizo expresamente a las entidades que prestan servicios de información, centrales de riesgo y burós de crédito, a recopilar, difundir o comercializar reportes o estudios que contengan información sobre mi persona.';
 const words=[{t:'Yo',u:false},...f.name.split(/\s+/).filter(Boolean).map(t=>({t,u:true})),...'que me identifico con documento de identificación N°'.split(' ').map(t=>({t,u:false})),{t:'   '+f.dui+'   ',u:true},{t:',',u:false,glue:true},...rest.split(' ').map(t=>({t,u:false}))];
 doc.setFont('helvetica','normal');doc.setFontSize(10.5);doc.setTextColor(0);doc.setDrawColor(0);doc.setLineWidth(0.2);
 const left=X(94),width=X(585)-X(94),lh=X(17.3),space=doc.getTextWidth(' ');let y=X(376),line=[];
 const lineWidth=l=>l.reduce((n,w,i)=>n+doc.getTextWidth(w.t)+(i&&!w.glue?space:0),0);
 const draw=(l,last)=>{const gaps=l.filter((w,i)=>i&&!w.glue).length,extra=last||!gaps?0:(width-lineWidth(l))/gaps;let x=left;
  l.forEach((w,i)=>{if(i&&!w.glue){const g=space+extra;if(w.u&&l[i-1].u)doc.line(x,y+0.8,x+g,y+0.8);x+=g;}const ww=doc.getTextWidth(w.t);doc.text(w.t,x,y);if(w.u)doc.line(x,y+0.8,x+ww,y+0.8);x+=ww;});y+=lh;};
 for(const w of words){if(line.length&&lineWidth([...line,w])>width){draw(line,false);line=[];w.glue=false;}line.push(w);}
 if(line.length)draw(line,true);
 doc.setFontSize(10.5);doc.text('Firma Cliente: ___________________________',X(215),X(641));
 return doc;
}

function makeCotizadorPDF(f){
 if(!f.model)throw Error('Para el Cotizador escribí el modelo de la moto.');
 if(!f.price)throw Error('Para el Cotizador escribí el valor de la moto.');
 if((f.down||0)>=f.price)throw Error('No se puede descargar el Cotizador: la prima debe ser menor que el valor de la moto (si la prima cubre todo el valor, no hay nada que financiar).');
 const doc=needPDF(),X=n=>n*0.28222,q=sieteTresQuote(f.price,f.down||0),blue=[46,117,181];
 doc.setDrawColor(0);doc.setLineWidth(0.3);doc.rect(X(63),X(67),X(636-63),X(128-67));
 pdfLogo(doc,'credi',X(67),X(71),X(95),X(50));
 doc.setFont('helvetica','bold');doc.setFontSize(24);doc.setTextColor(...blue);doc.text('COTIZADOR SV',X(218),X(117));
 doc.setFontSize(7.5);doc.text('CC-CI-P-F-08',X(578),X(93),{align:'center'});doc.setDrawColor(...blue);doc.line(X(518),X(98),X(636),X(98));doc.text('V. 2.0 | 06 -03-2019',X(578),X(124),{align:'center'});
 doc.setTextColor(0);doc.setFontSize(13);doc.text('PLAN SIETE TRES TASA 47% C IVA',X(180),X(185));
 const label=(t,y)=>{doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(0);doc.text(t,X(214),y,{align:'right'});};
 const box=(x1,x2,y1,y2,t,opts={})=>{doc.setDrawColor(0);doc.setLineWidth(0.3);doc.rect(X(x1),X(y1),X(x2-x1),X(y2-y1));pdfCell(doc,t,X(x1),X(y1),X(x2-x1),X(y2-y1),{size:7.5,maxLines:1,...opts});};
 label('NOMBRE CLIENTE:',X(213));box(270,573,203,219,f.name);label('TELEFONO:',X(228));box(270,573,219,235,f.phone);
 label('NOMBRE VENDEDOR:',X(258));box(270,573,248,264,f.vendor);
 label('AGENCIA:',X(273));box(270,372,264,280,f.agency,{align:'left'});box(372,463,264,280,'TELEFONO:',{align:'left',bold:true,size:7});box(463,573,264,280,f.agencyPhone);
 label('FECHA',X(288));box(270,573,280,296,creditDate());
 label('MODELO:',X(303));box(270,372,296,312,f.model,{align:'left'});box(372,463,296,312,'AÑO:',{align:'left',bold:true,size:7});box(463,573,296,312,f.year);
 doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.text('DATOS DEL FINANCIAMIENTO',X(282),X(334),{align:'center'});
 const row=(lab,val,y,{bold=false,valBold=bold,labX=267,size=8.5}={})=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.text(lab,X(labX),X(y),{align:'right'});doc.setFont('helvetica',valBold?'bold':'normal');doc.text(val,X(368),X(y),{align:'right'});};
 row('GASTOS DE FORMALIZACIÓN:',creditMoney(q.fee),364,{bold:true,valBold:false,labX:270});
 row('VALOR UNIDAD (+)',creditMoney(q.value),394);
 row((q.primaRate*100).toFixed(2)+'%    PRIMA (-)',q.prima?creditMoney(q.prima):'',410,{bold:true});
 doc.setFont('helvetica','bold');doc.text('1a CUOTA OK',X(472),X(410),{align:'center'});
 doc.setLineWidth(0.4);doc.line(X(300),X(414),X(373),X(414));
 row('MONTO A FINANCIAR',creditMoney(q.amount),426,{bold:true,size:9});
 doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.text('# DE CUOTAS',X(193),X(473),{align:'right'});box(207,271,461,478,String(f.months),{bold:true,size:8.5});
 box(207,271,493,509,'# CUOTAS',{bold:true,size:7.5});box(271,372,493,509,'CUOTAS DE',{bold:true,size:7.5});
 q.terms.forEach((t,i)=>{const y1=509+i*16,y2=y1+16;const hl=t.months===f.months;if(hl){doc.setFillColor(232,240,251);doc.rect(X(207),X(y1),X(165),X(16),'F');}box(207,271,y1,y2,String(t.months),{size:7.5,bold:hl});doc.rect(X(271),X(y1),X(101),X(16));pdfLabel(doc,'$',X(275),X(y1+11.5),{size:7.5,bold:hl});pdfCell(doc,creditMoney(t.payment),X(280),X(y1),X(90),X(16),{size:7.5,align:'right',maxLines:1,bold:hl});});
 doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.text('Condiciones:',X(207),X(633));
 doc.setFont('helvetica','normal');doc.text('Imprimir esta hoja, cliente debe firmarla y adjuntarla al expediente',X(207),X(649));
 doc.setLineWidth(0.3);doc.line(X(373),X(731),X(573),X(731));doc.setFont('helvetica','bold');doc.text('Firma del Cliente',X(473),X(742),{align:'center'});
 return doc;
}

function makeSolicitudPDF(f){
 const doc=needPDF(),X=n=>n*0.28222,L=90,R=676,gray=[128,128,128];
 const rect=(x1,y1,x2,y2)=>{doc.setDrawColor(0);doc.setLineWidth(0.25);doc.rect(X(x1),X(y1),X(x2-x1),X(y2-y1));};
 const bar=(y1,y2,t)=>{doc.setFillColor(...gray);doc.rect(X(L),X(y1),X(R-L),X(y2-y1),'F');rect(L,y1,R,y2);pdfCell(doc,t,X(L),X(y1),X(R-L),X(y2-y1),{size:9.5,bold:true,color:[255,255,255],maxLines:1});};
 const lab=(t,x,y,size=6.2)=>pdfLabel(doc,t,X(x+1.5),X(y+2.5),{size});
 const val=(t,x1,y1,x2,y2,o={})=>pdfCell(doc,t,X(x1),X(y1),X(x2-x1),X(y2-y1),{size:7.4,bold:true,...o});
 // Encabezado
 rect(L,67,R,130);pdfLogo(doc,'credi',X(110),X(78),X(80),X(34));
 doc.setFont('helvetica','bold');doc.setFontSize(12.5);doc.setTextColor(19,48,139);doc.text('SOLICITUD DE CREDITO INDIVIDUAL S.V.',X(362),X(103),{align:'center'});
 doc.setFontSize(6.2);doc.text('CC-CI-P-F-01',X(618),X(92),{align:'center'});doc.text('V 3.0 | 20-02-2023',X(618),X(100),{align:'center'});
 bar(130,149,'DATOS PERSONALES');
 rect(L,149,R,168);pdfLabel(doc,'Lugar y Fecha:',X(L+1),X(163),{size:10.5,bold:true});pdfCell(doc,creditPlace(' '),X(300),X(149),X(240),X(19),{size:10.5,bold:true,maxLines:1});
 // Nombre y celular
 rect(L,168,494,196);lab('Nombre Completo Según',L,174);lab('DUI:',L,181);val(f.name,180,168,494,196);
 rect(494,168,543,196);pdfCell(doc,'Teléfono Celular de Cliente',X(494),X(168),X(49),X(28),{size:6.2,maxLines:3});rect(543,168,R,196);val(f.phone,543,168,R,196);
 // DUI, nacimiento, sexo, nacionalidad
 rect(L,196,277,218);lab('DUI No.',L,202);val(f.dui,120,196,277,218);
 rect(277,196,327,218);lab('Fecha de',277,203);lab('Nacimiento',277,210);rect(327,196,494,218);val(dateText(f.birth),327,196,494,218);
 rect(494,196,543,218);pdfCell(doc,'Sexo',X(494),X(196),X(49),X(9),{size:6.2,maxLines:1});
 const radio=(cx,on,t)=>{doc.setDrawColor(0);doc.setLineWidth(0.2);doc.circle(X(cx),X(210),0.9);if(on){doc.setFillColor(0);doc.circle(X(cx),X(210),0.5,'F');}pdfLabel(doc,t,X(cx+5),X(211.5),{size:5.5});};
 radio(507,f.sex==='F','F');radio(533,f.sex==='M','M');
 rect(543,196,R,218);lab('Nacionalidad',543,202);val(f.nationality,543,203,R,218);
 rect(L,218,R,256);lab('Dirección Actual de Residencia:',L,224);val(f.address,L+20,225,R-20,256,{maxLines:3});
 rect(L,256,R,294);lab('Punto de Referencia:',L,262);val(f.addressRef,L+20,263,R-20,294,{maxLines:3});
 // Datos laborales
 rect(L,294,325,340);lab('Nombre de la Empresa Donde Trabaja, Negocio o Actividad',L,301);val(f.company,L,305,325,340,{maxLines:2});
 rect(325,294,404,340);lab('Cargo que Ocupa',325,301);val(f.position,325,305,404,340,{maxLines:2});
 rect(404,294,543,361);lab('Fecha de Ingreso',404,301);val(dateText(f.startDate),404,305,543,361);
 rect(543,294,R,361);lab('Ingreso Mensual $',543,301);if(f.income!==null){pdfLabel(doc,'$',X(546),X(339),{size:7.4,bold:true});val(creditMoney(f.income),550,305,R-2,361,{align:'right'});}
 rect(L,340,404,384);lab('Dirección del Trabajo',L,346);val(f.workAddress,L+20,349,404-20,384,{maxLines:3});
 rect(404,361,543,424);lab('Teléfono de Oficina/ o negocio',404,374);val(f.workPhone,404,380,543,424);
 rect(543,361,R,424);lab('Otros Ingresos $',543,367);if(f.otherIncome!==null){pdfLabel(doc,'$',X(546),X(398),{size:7.4,bold:true});val(creditMoney(f.otherIncome),550,372,R-2,424,{align:'right'});}
 rect(L,384,404,424);lab('Punto de Referencia',L,390);val(f.workRef,L+20,393,404-20,424,{maxLines:3});
 // Referencias
 const refs=(y,title,list,relation)=>{bar(y,y+18,title);const h=y+18;rect(L,h,325,h+18);lab('Nombre (s) Apellido (s) Completo (s)',L,h+13);rect(325,h,543,h+18);pdfCell(doc,'N° de teléfono',X(325),X(h+6),X(218),X(12),{size:6.2,maxLines:1});rect(543,h,R,h+18);lab('Parentesco',543,h+13);
  list.forEach((r,i)=>{const y1=h+18+i*18,y2=y1+18;rect(L,y1,325,y2);lab(`${i+1}.-`,L,y1+12,5.5);val(r.name,L+10,y1,325,y2,{maxLines:2,size:7.4});rect(325,y1,543,y2);val(r.phone,325,y1,543,y2,{maxLines:1});rect(543,y1,R,y2);val(relation,543,y1,R,y2,{maxLines:1});});
  return h+18+list.length*18;};
 let y=refs(424,'INDISPENSABLE:  DOS REFERENCIAS FAMILIARES QUE NO VIVAN CON EL CLIENTE',f.famRefs,CREDIT_RELATION.fam);
 y=refs(y,'DOS REFERENCIAS  DE AMIGOS O COMPAÑEROS DE TRABAJO',f.friendRefs,CREDIT_RELATION.friend);
 rect(L,y,R,y+20);pdfCell(doc,'Declaro que la información consignada aquí es verídica y autorizo a CREDIOPCIONES, S.A. DE C.V, para su comprobación a su entera satisfacción sin que esto signifique compromiso alguno para CREDIOPCIONES, en fé de lo cual firmo la presente solicitud',X(L),X(y),X(R-L),X(20),{size:5.6,align:'left',maxLines:2});
 y+=20;rect(L,y,R,y+57);pdfLabel(doc,'Informacion importante a considerar:',X(L+1),X(y+7),{size:6.4,bold:true});
 ['Mejor horario para localizar al cliente o referencias.','Informar al cliente que se realizara verificación de campo de la vivienda o negocios, solicitar hora adecuada para la visita.','Dirección correcta y punto de referencia que beneficie la localización domiciliar y laboral. (dibujar croquis)','Horarios y vías de contacto de Solicitud de constancia laboral.'].forEach((t,i)=>{const ly=y+18+i*11;doc.setDrawColor(0);doc.setLineWidth(0.15);doc.circle(X(L+11),X(ly-2.4),0.55);pdfLabel(doc,t,X(L+16),X(ly),{size:6.8,bold:true});});
 y+=57;rect(L,y,R,850);pdfLabel(doc,'Detalle:',X(L+1),X(y+7),{size:6.4,bold:true});
 if(f.detail){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(0);const lines=doc.splitTextToSize(f.detail,X(R-L-16)).slice(0,Math.floor(X(850-y-16)/4.4));doc.text(lines,X(L+8),X(y+20),{lineHeightFactor:1.4});}
 rect(L,850,R,903);doc.setLineWidth(0.3);doc.line(X(288),X(886),X(425),X(886));pdfLabel(doc,'F.',X(288),X(884),{size:5});pdfCell(doc,'FIRMA DEL CLIENTE',X(288),X(886),X(137),X(7),{size:5.6,bold:true,maxLines:1});
 pdfLabel(doc,'*Esta solicitud y la papelería que se adjunta pasa a ser propiedad de CREDIOPCIONES, S.A. DE C.V.',X(L+1),X(900),{size:5.8,bold:true});
 return doc;
}

const CREDIT_DOCS={buro:['Buro',makeBuroPDF],cotizador:['Cotizador Siete Tres',makeCotizadorPDF],solicitud:['Solicitud de credito',makeSolicitudPDF]};
// Campos obligatorios de cada documento. El Buró solo necesita nombre y DUI.
const CREDIT_LABELS={name:'nombre',dui:'DUI',phone:'teléfono celular',model:'moto',year:'año',price:'valor de la moto',down:'prima (poné 0 si no hay)',vendor:'vendedor',agency:'agencia',agencyPhone:'teléfono de la agencia',birth:'fecha de nacimiento',sex:'sexo',nationality:'nacionalidad',address:'dirección de residencia',addressRef:'punto de referencia',company:'empresa o negocio',position:'cargo',startDate:'fecha de ingreso',income:'ingreso mensual',workAddress:'dirección del trabajo'};
const refFields=kind=>Array.from({length:CREDIT_REF_COUNT},(_,i)=>[`${kind}-${i}-name`,`${kind}-${i}-phone`]).flat();
const CREDIT_REQUIRED={buro:['name','dui'],cotizador:['name','phone','model','year','price','down','vendor','agency','agencyPhone'],solicitud:['name','dui','phone','birth','sex','nationality','address','addressRef','company','position','startDate','income','workAddress',...refFields('fam'),...refFields('friend')]};
const CREDIT_DOC_NAMES={buro:'el Buró',cotizador:'el Cotizador',solicitud:'la Solicitud'};
function creditFieldValue(f,key){const ref=key.match(/^(fam|friend)-(\d)-(name|phone)$/);if(ref)return (ref[1]==='fam'?f.famRefs:f.friendRefs)?.[ref[2]]?.[ref[3]];return f[key];}
function creditFieldLabel(key){const ref=key.match(/^(fam|friend)-(\d)-(name|phone)$/);if(ref)return `${ref[3]==='name'?'nombre':'teléfono'} de la referencia ${ref[1]==='fam'?'familiar':'de amigo'} ${Number(ref[2])+1}`;return CREDIT_LABELS[key]||key;}
function creditMissing(kind,f){return (CREDIT_REQUIRED[kind]||[]).filter(k=>{const v=creditFieldValue(f,k);return v===null||v===undefined||String(v).trim()===''||(k==='price'&&!(Number(v)>0));});}
function markCreditMissing(keys){
 const form=$('credit-form');if(!form)return;
 form.querySelectorAll('.credit-missing').forEach(el=>{el.classList.remove('credit-missing');el.removeAttribute('aria-invalid');});
 let first=null;
 for(const k of keys){const el=k==='sex'?form.querySelector('.credit-sex'):form.querySelector(`[name="${k}"]`);if(!el)continue;el.classList.add('credit-missing');if(k!=='sex')el.setAttribute('aria-invalid','true');first??=k==='sex'?form.querySelector('input[name="sex"]'):el;}
 first?.focus({preventScroll:true});first?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function downloadCreditPDF(kind,f){
 const [name,make]=CREDIT_DOCS[kind]||[];if(!make)return;
 const missing=creditMissing(kind,f);
 if(missing.length){
  const list=missing.map(creditFieldLabel),msg=`No se puede descargar ${CREDIT_DOC_NAMES[kind]}: faltan ${list.length} ${list.length===1?'campo':'campos'}. Completá: ${list.join(', ')}.`;
  toast(`No se puede descargar ${CREDIT_DOC_NAMES[kind]}. Faltan ${list.length} ${list.length===1?'campo':'campos'}.`,true);
  // Si se pidió desde la lista, se abre el formulario de ese cliente con los campos marcados.
  if(!($('modal').open&&$('credit-form'))&&f.id)openCreditForm(f.id);
  if($('credit-form')){showCreditError(msg);markCreditMissing(missing);}
  else toast(msg,true);
  return false;
 }
 try{const doc=make(f);doc.save(creditFileName(name,f));toast(name.replace('Buro','Buró').replace('credito','crédito')+' descargado en PDF.');return true;}
 catch(err){
  // Desde la lista la ventana está cerrada: se abre el formulario del cliente para mostrar el motivo.
  if(!($('modal').open&&$('credit-form'))&&f.id)openCreditForm(f.id);
  toast(err.message,true);if($('credit-form'))showCreditError(err.message);return false;}
}

/* ---------- Eventos ---------- */
document.addEventListener('input',e=>{if(!e.target.closest('#credit-form'))return;if(['price','down','months'].includes(e.target.name))updateCreditPreview();const m=e.target.closest('.credit-missing')||e.target;if(m.classList.contains('credit-missing')&&String(e.target.value).trim()){m.classList.remove('credit-missing');m.removeAttribute('aria-invalid');}});
document.addEventListener('change',e=>{
 if(!e.target.closest('#credit-form'))return;
 if(e.target.name==='months')updateCreditPreview();
 if(e.target.name==='clientId'&&e.target.value){const form=$('credit-form'),p=clientPrefill(e.target.value);for(const k of ['name','phone','model','year','price'])if(form[k]&&!form[k].value&&p[k]!==undefined&&p[k]!==null)form[k].value=p[k];updateCreditPreview();}
 if(e.target.name==='dui'){try{e.target.value=normalizeDUI(e.target.value);}catch{}}
});
document.addEventListener('submit',e=>{if(e.target.id!=='credit-form')return;e.preventDefault();if(saveCreditForm())$('modal').close();});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action^="credit-"]');if(!b)return;const action=b.dataset.action,id=b.dataset.id||'';
 if(action==='credit-new')openCreditForm('');
 else if(action==='credit-client')openCreditForm('',id);
 else if(action==='credit-edit')openCreditForm(id);
 else if(action==='credit-pdf'){const f=(db.creditForms||[]).find(f=>f.id===id);if(f)downloadCreditPDF(b.dataset.doc,f);}
 else if(action==='credit-save-pdf'){const f=saveCreditForm();if(f){$('credit-error')&&($('credit-error').hidden=true);downloadCreditPDF(b.dataset.doc,f);}}
 else if(action==='credit-delete'){const f=(db.creditForms||[]).find(f=>f.id===id);if(!f)return;openModal('Borrar crédito',`<p>¿Querés borrar los datos de crédito de <strong>${esc(f.name)}</strong> (DUI ${esc(f.dui)})?</p><p class="subtext">La ficha del cliente y sus cotizaciones no se borran.</p>`,`<button class="btn" data-close>Cancelar</button><button class="btn btn-danger" data-action="credit-delete-confirm" data-id="${esc(id)}">Sí, borrar</button>`,480);}
 else if(action==='credit-delete-confirm'){const next=clone(db);next.creditForms=(next.creditForms||[]).filter(f=>f.id!==id);if(commit(next,'Crédito borrado.'))$('modal').close();}
});
