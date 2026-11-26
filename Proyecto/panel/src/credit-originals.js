// Documentos originales de Crediopciones.
// 1) PDF directo: la hoja original (imagen exacta) de fondo y los datos del cliente escritos encima.
// 2) Para editar: el mismo Excel o Word original con los datos ya escritos en sus celdas.
const CREDIT_ORIGINALS=/*CREDIT_ORIGINALS*/null;
const CREDIT_OFFICE={buro:{label:'Word',ext:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},cotizador:{label:'Excel',ext:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},solicitud:{label:'Excel',ext:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}};

/* ---------- Valores de cada documento ---------- */
function creditCotizadorCheck(f){
 if(!f.model)throw Error('Para el Cotizador escribí el modelo de la moto.');
 if(!f.price)throw Error('Para el Cotizador escribí el valor de la moto.');
 const problem=creditDownProblem(f.price,Number(creditTotalDown(f))||0);if(problem)throw Error('No se puede descargar el Cotizador. '+problem);
}
function creditValues(kind,f){
 const txt=v=>v===null||v===undefined?'':String(v).replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g,' ').trim();
 if(kind==='buro')return {date:creditDate(),name:txt(f.name),dui:txt(f.dui)};
 if(kind==='cotizador'){
  const q=creditQuote(f),pay=Object.fromEntries(q.terms.map(t=>['q'+t.months,creditMoney(t.payment)]));
  return {name:txt(f.name),phone:txt(f.phone),vendor:txt(f.vendor),agency:txt(f.agency),agencyPhone:txt(f.agencyPhone),date:creditDate(),model:txt(f.model),year:txt(f.year),
   price:Number(f.price)||0,down:q.prima>0?q.prima:null,months:String(f.months),
   fee:creditMoney(q.fee),primaRate:(q.primaRate*100).toFixed(2)+'%',cuotaOk:'1a CUOTA OK',amount:creditMoney(q.amount),...pay,
   // Resultados ya calculados para las fórmulas del Excel (se ven bien aunque Excel abra en vista protegida)
   calc_fee:q.fee,calc_primaRate:q.primaRate,calc_amount:q.amount,...Object.fromEntries(q.terms.map(t=>['calc_q'+t.months,t.payment]))};
 }
 const refs=(list,kind,rel)=>Object.fromEntries((list||[]).slice(0,2).flatMap((r,i)=>[[`${kind}${i}name`,txt(r.name)],[`${kind}${i}phone`,txt(r.phone)],[`${kind==='fam'?'famRel':'friendRel'}${i}`,txt(r.name)||txt(r.phone)?rel:'']]));
 return {place:creditPlace(' '),name:txt(f.name),phone:txt(f.phone),dui:txt(f.dui),birth:dateText(f.birth),nationality:txt(f.nationality),address:txt(f.address),addressRef:txt(f.addressRef),
  company:txt(f.company),position:txt(f.position),startDate:dateText(f.startDate),income:f.income,workAddress:txt(f.workAddress),workPhone:txt(f.workPhone),otherIncome:f.otherIncome,workRef:txt(f.workRef),
  detail:txt(f.detail),sex:f.sex,...refs(f.famRefs,'fam',CREDIT_RELATION.fam),...refs(f.friendRefs,'friend',CREDIT_RELATION.friend)};
}

/* ---------- Excel / Word lleno ---------- */
const creditXml=s=>String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function creditB64(b64){const bin=atob(b64),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
let creditCrcTable=null;
function creditCrc(data){
 if(!creditCrcTable){creditCrcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;creditCrcTable[n]=c>>>0;}}
 let c=0xffffffff;for(let i=0;i<data.length;i++)c=creditCrcTable[(c^data[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
// Arma un .zip sin compresión (así se guardan .xlsx y .docx); Excel y Word lo abren normal.
function creditZip(files){
 const enc=new TextEncoder(),chunks=[],central=[];let offset=0;
 const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),date=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
 // Cada parte: [nombre, bytes] sin comprimir, o [nombre, bytes comprimidos, crc, tamaño real] (ya viene comprimida).
 for(const [name,data,preCrc,realSize] of files){
  const packed=preCrc!==undefined,method=packed?8:0,crc=packed?preCrc>>>0:creditCrc(data),usize=packed?realSize:data.length;
  const nameBytes=enc.encode(name),head=new DataView(new ArrayBuffer(30));
  head.setUint32(0,0x04034b50,true);head.setUint16(4,20,true);head.setUint16(6,0x0800,true);head.setUint16(8,method,true);head.setUint16(10,time,true);head.setUint16(12,date,true);
  head.setUint32(14,crc,true);head.setUint32(18,data.length,true);head.setUint32(22,usize,true);head.setUint16(26,nameBytes.length,true);head.setUint16(28,0,true);
  chunks.push(new Uint8Array(head.buffer),nameBytes,data);
  const c=new DataView(new ArrayBuffer(46));
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,method,true);c.setUint16(12,time,true);c.setUint16(14,date,true);
  c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,usize,true);c.setUint16(28,nameBytes.length,true);c.setUint32(42,offset,true);
  central.push(new Uint8Array(c.buffer),nameBytes);
  offset+=30+nameBytes.length+data.length;
 }
 const size=central.reduce((n,c)=>n+c.length,0),end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,size,true);end.setUint32(16,offset,true);
 return new Blob([...chunks,...central,new Uint8Array(end.buffer)]);
}
function creditOfficeFile(kind,f){
 const tpl=CREDIT_ORIGINALS?.templates?.[kind];if(!tpl)throw Error('No se encontró el documento original.');
 if(kind==='cotizador')creditCotizadorCheck(f);
 const v=creditValues(kind,f),dec=new TextDecoder(),enc=new TextEncoder();
 const raw={ctrlF:v.sex==='F'?' checked="Checked"':'',ctrlM:v.sex==='M'?' checked="Checked"':'',vmlF:v.sex==='F'?'<x:Checked>1</x:Checked>':'',vmlM:v.sex==='M'?'<x:Checked>1</x:Checked>':''};
 const files=tpl.entries.map(([name,b64,crc,size])=>{
  if(crc!==undefined)return [name,creditB64(b64),crc,size];
  let data=creditB64(b64);
  if(/\.(xml|vml)$/.test(name)){const text=dec.decode(data);if(text.includes('{{')){
   data=enc.encode(text
    .replace(/<v>\{\{#(\w+)\}\}<\/v>/g,(m,k)=>{const n=Number(v[k]);return v[k]===null||v[k]===undefined||v[k]===''||!Number.isFinite(n)?'':`<v>${n}</v>`;})
    .replace(/\{\{!(\w+)\}\}/g,(m,k)=>raw[k]||'')
    .replace(/\{\{(\w+)\}\}/g,(m,k)=>creditXml(v[k]??'')));
  }}
  return [name,data];
 });
 return creditZip(files);
}
function creditSaveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}

/* ---------- PDF con la hoja original de fondo ---------- */
function creditFonts(doc){
 const fonts=CREDIT_ORIGINALS?.fonts;if(!fonts)return false;
 for(const [key,file,name,style] of [['carlito','Carlito-Regular.ttf','Carlito','normal'],['carlitoBold','Carlito-Bold.ttf','Carlito','bold'],['caladeaBold','Caladea-Bold.ttf','Caladea','bold']]){doc.addFileToVFS(file,fonts[key]);doc.addFont(file,name,style);}
 return true;
}
function creditFont(doc,item){doc.setFont(item.font==='carlito'?'Carlito':'helvetica',item.bold?'bold':'normal');}
// Achica la letra (hasta 60 %) y, si la celda es alta, parte el texto en varias líneas para que quepa.
function creditFit(doc,text,item){
 const lh=1.15,min=Math.max(3.6,item.size*.6);let size=item.size,lines=[text];
 for(;;){
  doc.setFontSize(size);
  const maxLines=Math.max(1,Math.floor(((item.boxH||item.h)+.5)/(size*lh)));
  lines=maxLines>1?doc.splitTextToSize(text,item.w):String(text).split('\n').map(s=>s.trim()).filter(Boolean).slice(0,1);
  if(maxLines===1&&String(text).includes('\n'))lines=[String(text).replace(/\s*\n\s*/g,' ')];
  const fits=lines.length<=maxLines&&lines.every(l=>doc.getTextWidth(l)<=item.w+.5);
  if(fits||size<=min){if(!fits)lines=lines.slice(0,maxLines);return {size,lines,lh};}
  size=Math.max(min,size-.25);
 }
}
function creditDrawItem(doc,item,value){
 if(value===null||value===undefined||String(value).trim()==='')return;
 doc.setTextColor(0,0,0);creditFont(doc,item);
 if(item.money){const n=Number(value);if(!Number.isFinite(n))return;doc.setFontSize(item.size);doc.text('$',item.dollarX,item.top,{baseline:'top'});doc.text(creditMoney(n),item.x,item.top,{baseline:'top',align:'right'});return;}
 let text=typeof value==='number'?creditMoney(value):String(value);
 if(item.dollarX){doc.setFontSize(item.size);doc.text('$',item.dollarX,item.top,{baseline:'top'});}
 const fit=creditFit(doc,text,item);doc.setFontSize(fit.size);
 const top=item.mid?item.mid-fit.lines.length*fit.size*fit.lh/2+(fit.lh-1)*fit.size/2:item.top;
 doc.text(fit.lines,item.x,top,{baseline:'top',align:item.align,lineHeightFactor:fit.lh});
}
function creditOriginalPDF(kind,f,into=null){
 const O=CREDIT_ORIGINALS,lay=O?.layouts?.[kind],img=O?.images?.[kind];if(!lay||!img)return CREDIT_DOCS_FALLBACK[kind](f);
 if(kind==='cotizador')creditCotizadorCheck(f);
 const J=globalThis.jspdf?.jsPDF;if(!J)throw Error('No se pudo cargar el generador de PDF.');
 let doc=into;
 if(doc)doc.addPage([lay.page[0],lay.page[1]],'portrait');
 else{doc=new J({unit:'pt',format:[lay.page[0],lay.page[1]],orientation:'portrait',compress:true});creditFonts(doc);}
 doc.addImage(img,'JPEG',0,0,lay.page[0],lay.page[1],undefined,'FAST');
 const v=creditValues(kind,f);
 if(kind==='buro')creditDrawBuro(doc,lay,v);
 else for(const item of lay.items)creditDrawItem(doc,item,v[item.key]);
 if(kind==='solicitud'&&(v.sex==='F'||v.sex==='M')){const [x,y]=lay.radios[v.sex];doc.setFillColor(0,0,0);doc.circle(x,y,1.45,'F');}
 return doc;
}
// Carta de buró: fecha en el encabezado y el párrafo justificado con el nombre y el DUI subrayados, como en el Word.
function creditDrawBuro(doc,lay,v){
 const d=lay.date,c=(d.color||[0,0,0]).map(n=>Math.round(n*255));
 doc.setFont('Caladea','bold');doc.setFontSize(d.size);doc.setTextColor(...c);doc.text('SAN MIGUEL, '+v.date,(d.x0+d.x1)/2,d.top,{baseline:'top',align:'center'});
 const p=lay.para,rest='autorizo voluntariamente que la información recopilada y/o proporcionada por entidades públicas o privadas y la generada de relaciones contractuales, crediticias o comerciales, sea reportada a centrales de riesgo o burós de crédito para ser tratada, almacenada o transferida; y autorizo expresamente a las entidades que prestan servicios de información, centrales de riesgo y burós de crédito, a recopilar, difundir o comercializar reportes o estudios que contengan información sobre mi persona.';
 const words=[{t:'Yo',u:false},...v.name.split(/\s+/).filter(Boolean).map(t=>({t,u:true})),...'que me identifico con documento de identificación N°___'.split(' ').map(t=>({t,u:false})),{t:v.dui,u:true,glue:true},{t:'___,',u:false,glue:true},...rest.split(' ').map(t=>({t,u:false}))];
 doc.setFont('Carlito','normal');doc.setFontSize(p.size);doc.setTextColor(0,0,0);doc.setDrawColor(0,0,0);doc.setLineWidth(.6);
 const left=p.left,width=p.right-p.left,space=doc.getTextWidth(' '),under=p.size*.95;let y=p.top,line=[];
 const lineWidth=l=>l.reduce((n,w,i)=>n+doc.getTextWidth(w.t)+(i&&!w.glue?space:0),0);
 const draw=(l,last)=>{const gaps=l.filter((w,i)=>i&&!w.glue).length,extra=last||!gaps?0:(width-lineWidth(l))/gaps;let x=left;
  l.forEach((w,i)=>{if(i&&!w.glue){const g=space+extra;if(w.u&&l[i-1].u)doc.line(x,y+under,x+g,y+under);x+=g;}const ww=doc.getTextWidth(w.t);doc.text(w.t,x,y,{baseline:'top'});if(w.u)doc.line(x,y+under,x+ww,y+under);x+=ww;});y+=p.lineGap;};
 for(const w of words){if(line.length&&lineWidth([...line,w])>width){draw(line,false);line=[];w.glue=false;}line.push(w);}
 if(line.length)draw(line,true);
}

/* ---------- Imprimir (ventana en la misma página) ---------- */
const CREDIT_PRINT_KINDS=['buro','cotizador','solicitud'];
function creditPrint(kind,f){
 const kinds=kind==='todo'?CREDIT_PRINT_KINDS:[kind];
 for(const k of kinds){
  const missing=creditMissing(k,f);
  if(missing.length){
   const list=missing.map(creditFieldLabel);
   toast(`No se puede imprimir ${CREDIT_DOC_NAMES[k]}. Faltan ${list.length} ${list.length===1?'campo':'campos'}.`,true);
   if(!($('modal').open&&$('credit-form'))&&f.id)openCreditForm(f.id);
   if($('credit-form')){showCreditError(`No se puede imprimir ${CREDIT_DOC_NAMES[k]}: faltan ${list.join(', ')}.`);markCreditMissing(missing);}
   return false;
  }
 }
 try{
  let doc=null;for(const k of kinds)doc=creditOriginalPDF(k,f,doc);
  const title=kind==='todo'?'Documentos de crédito':({buro:'Buró',cotizador:'Cotizador Siete Tres',solicitud:'Solicitud de crédito'})[kind];
  doc.setProperties({title:`${title} - ${String(f.name).replace(/\s+/g,' ').trim()}`});doc.viewerPreferences({DisplayDocTitle:true});
  openPdfViewer(title,doc.output('blob'),creditFileName(kind==='todo'?'Documentos de credito':CREDIT_DOCS[kind][0],f));
  return true;
 }catch(err){if(!($('modal').open&&$('credit-form'))&&f.id)openCreditForm(f.id);toast(err.message,true);if($('credit-form'))showCreditError(err.message);return false;}
}
function creditPrintMenu(id){
 const f=(db.creditForms||[]).find(x=>x.id===id);if(!f)return;
 openModal('Imprimir',`<p>El documento se abre aquí mismo, con el formato original de Crediopciones, listo para imprimir o descargar.</p><div class="credit-office-list">${[['buro','Buró'],['cotizador','Cotizador Siete Tres'],['solicitud','Solicitud de crédito'],['todo','Los tres documentos juntos'],['dui','DUI (frente y reverso)']].map(([k,l])=>`<button class="btn" data-action="credit-print" data-doc="${k}" data-id="${esc(f.id)}">${esc(l)}</button>`).join('')}</div>`,`<button class="btn" data-close>Cerrar</button>`,480);
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action="credit-print-menu"],[data-action="credit-print"],[data-action="credit-save-print"]');if(!b)return;
 const id=b.dataset.id||'';
 if(b.dataset.action==='credit-print-menu')creditPrintMenu(id);
 else if(b.dataset.action==='credit-print'){const f=(db.creditForms||[]).find(x=>x.id===id);if(f){if($('modal').open&&!$('credit-form'))$('modal').close();creditPrint(b.dataset.doc,f);}}
 else{const f=saveCreditForm();if(f){$('credit-error')&&($('credit-error').hidden=true);creditPrint(b.dataset.doc,f);}}
});

/* ---------- Descargas ---------- */
const CREDIT_DOCS_FALLBACK={buro:makeBuroPDF,cotizador:makeCotizadorPDF,solicitud:makeSolicitudPDF};
for(const kind of Object.keys(CREDIT_DOCS))CREDIT_DOCS[kind][1]=f=>creditOriginalPDF(kind,f);
// Misma revisión de campos que el PDF; descarga el Excel o Word original lleno.
function downloadCreditOffice(kind,f){
 const [name]=CREDIT_DOCS[kind]||[],o=CREDIT_OFFICE[kind];if(!name||!o)return false;
 const missing=creditMissing(kind,f);
 if(missing.length){
  const list=missing.map(creditFieldLabel),msg=`No se puede descargar ${CREDIT_DOC_NAMES[kind]}: faltan ${list.length} ${list.length===1?'campo':'campos'}. Completá: ${list.join(', ')}.`;
  toast(`No se puede descargar ${CREDIT_DOC_NAMES[kind]}. Faltan ${list.length} ${list.length===1?'campo':'campos'}.`,true);
  if(!($('modal').open&&$('credit-form'))&&f.id)openCreditForm(f.id);
  if($('credit-form')){showCreditError(msg);markCreditMissing(missing);}else toast(msg,true);
  return false;
 }
 try{creditSaveBlob(creditOfficeFile(kind,f),creditFileName(name,f).replace(/\.pdf$/,'.'+o.ext));toast(`${name.replace('Buro','Buró').replace('credito','crédito')} descargado en ${o.label}. Abrilo, revisalo y guardalo como PDF.`);return true;}
 catch(err){if(!($('modal').open&&$('credit-form'))&&f.id)openCreditForm(f.id);toast(err.message,true);if($('credit-form'))showCreditError(err.message);return false;}
}
function creditOfficeMenu(id){
 const f=(db.creditForms||[]).find(f=>f.id===id);if(!f)return;
 openModal('Descargar para editar',`<p>Se descarga tu documento original de Crediopciones con los datos de <strong>${esc(f.name)}</strong>. Abrilo en Excel o Word, corregí lo que haga falta (por ejemplo, un nombre o una dirección muy larga) y guardalo como PDF.</p><div class="credit-office-list">${['buro','cotizador','solicitud'].map(k=>`<button class="btn" data-action="credit-office" data-doc="${k}" data-id="${esc(f.id)}">${icon('download')}${k==='buro'?'Buró':k==='cotizador'?'Cotizador':'Solicitud'} <span class="credit-office-tag">${CREDIT_OFFICE[k].label}</span></button>`).join('')}</div>`,`<button class="btn" data-close>Cerrar</button>`,520);
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action="credit-office"],[data-action="credit-save-office"],[data-action="credit-office-menu"]');if(!b)return;
 const action=b.dataset.action,id=b.dataset.id||'';
 if(action==='credit-office-menu')creditOfficeMenu(id);
 else if(action==='credit-office'){const f=(db.creditForms||[]).find(f=>f.id===id);if(f&&downloadCreditOffice(b.dataset.doc,f)&&$('modal').open&&!$('credit-form'))$('modal').close();}
 else if(action==='credit-save-office'){const f=saveCreditForm();if(f){$('credit-error')&&($('credit-error').hidden=true);downloadCreditOffice(b.dataset.doc,f);}}
});
