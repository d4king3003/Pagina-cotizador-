// ===== DUI: frente y reverso con Ctrl+V, lectura de datos y PDF =====
// Las fotos se guardan solo en esta PC (IndexedDB), por número de DUI, y se comparten entre crédito y entrega.
const DUI_PAGE={w:612,h:792,left:85.6,top:70.8,maxW:450,maxH:296,gap:10.5};
let duiState={front:null,back:null,key:'',form:''};

/* ---------- Almacenamiento local ---------- */
function duiIdb(){
 return new Promise((res,rej)=>{
  if(!globalThis.indexedDB){rej(Error('Este navegador no permite guardar las fotos.'));return;}
  const r=indexedDB.open('tvs-panel-dui',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('dui');
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
 });
}
async function duiStore(mode,fn){const d=await duiIdb();return new Promise((res,rej)=>{const t=d.transaction('dui',mode),q=fn(t.objectStore('dui'));t.oncomplete=()=>res(q?.result);t.onerror=()=>rej(t.error);});}
const duiKey=v=>{const d=String(v||'').replace(/\D/g,'');return d.length===9?d:'';};
async function duiLoad(key){if(!key)return null;try{return await duiStore('readonly',s=>s.get(key))||null;}catch{return null;}}
async function duiSave(){
 const key=duiKey(duiFormEl()?.dui?.value);if(!key||(!duiState.front&&!duiState.back))return;
 duiState.key=key;
 try{await duiStore('readwrite',s=>s.put({front:duiState.front,back:duiState.back,name:duiFormEl()?.name?.value||'',updatedAt:new Date().toISOString()},key));}catch{}
}

/* ---------- Formulario activo ---------- */
const duiFormEl=()=>$('credit-form')||$('delivery-form');
function duiStatus(msg,bad=false,actions=''){
 const box=$('dui-status');if(!box)return;
 box.innerHTML=esc(msg)+actions;box.hidden=!msg;box.classList.toggle('bad',!!bad);
}
function duiBlock(){
 return `<div class="dui-block" id="dui-block">
  <h3 class="section-label">DUI del cliente</h3>
  <div class="dui-paste" id="dui-paste" tabindex="0" aria-describedby="dui-help">
   ${['front','back'].map(side=>`<div class="dui-slot" data-dui-slot="${side}"><span class="dui-slot-label">${side==='front'?'Frente':'Reverso'}</span><div class="dui-slot-img" id="dui-img-${side}"><span>Pegá aquí</span></div><div class="dui-slot-actions"><label class="text-button">Elegir<input type="file" accept="image/*" data-dui-file="${side}" hidden></label><button type="button" class="text-button" data-dui-clear="${side}" hidden>Quitar</button></div></div>`).join('')}
   <div class="dui-help"><strong>Copiá la foto del DUI y pegala con Ctrl+V</strong><span id="dui-help">Una vez el frente y otra el reverso, en cualquier parte del formulario. El panel reconoce qué lado es, lee nombre, DUI y demás datos, y arma el PDF con las dos caras.</span>
    <div class="dui-buttons"><button type="button" class="btn btn-small" data-dui-swap>Cambiar de lado</button><button type="button" class="btn btn-small btn-primary" data-dui-pdf>${icon('document')}PDF del DUI</button></div></div>
  </div>
  <p class="dui-status" id="dui-status" role="status" aria-live="polite" hidden></p>
 </div>`;
}
function duiRender(){
 for(const side of ['front','back']){
  const box=$('dui-img-'+side);if(!box)continue;
  const blob=duiState[side];
  if(box._url){URL.revokeObjectURL(box._url);box._url='';}
  if(blob){box._url=URL.createObjectURL(blob);box.innerHTML=`<img src="${box._url}" alt="DUI ${side==='front'?'frente':'reverso'}">`;}
  else box.innerHTML='<span>Pegá aquí</span>';
  document.querySelector(`[data-dui-clear="${side}"]`)?.toggleAttribute('hidden',!blob);
 }
}
// Al abrir el formulario de crédito o de entrega se agrega el recuadro del DUI
if(globalThis.MutationObserver)new MutationObserver(()=>{
 const form=duiFormEl();
 if(!form||form.querySelector('#dui-block'))return;
 const kind=form.id;
 // Crédito: después de «Cliente del panel». Entrega: antes de «Datos de SAP».
 const anchor=kind==='credit-form'?form.querySelector('.credit-step'):form.querySelector('h3.section-label');
 if(!anchor)return;
 anchor.insertAdjacentHTML('beforebegin',duiBlock());
 duiState={front:null,back:null,key:'',form:kind};duiLastFound={};duiAuto={};
 duiRender();duiReloadFromField();
}).observe(document.documentElement,{childList:true,subtree:true});
async function duiReloadFromField(){
 const form=duiFormEl();if(!form)return;
 let key=duiKey(form.dui?.value);
 // Entrega: si no tiene DUI escrito, usa el del crédito vinculado
 if(!key&&form.creditId?.value){const c=(db.creditForms||[]).find(x=>x.id===form.creditId.value);key=duiKey(c?.dui);}
 if(!key||key===duiState.key)return;
 const rec=await duiLoad(key);
 if(rec&&duiFormEl()===form&&!duiState.front&&!duiState.back){duiState.front=rec.front||null;duiState.back=rec.back||null;duiState.key=key;duiRender();duiStatus('Fotos del DUI guardadas en esta PC para '+formatDuiShow(key)+'.');}
}
const formatDuiShow=k=>k.slice(0,8)+'-'+k.slice(8);

/* ---------- Imagen: orientar, leer y reconocer el lado ---------- */
async function duiCanvas(src,rot=0,maxSide=1800){
 const bmp=await createImageBitmap(src);
 const sc=Math.min(1,maxSide/Math.max(bmp.width,bmp.height));
 const w=Math.round(bmp.width*sc),h=Math.round(bmp.height*sc),turn=rot%180!==0;
 const c=document.createElement('canvas');c.width=turn?h:w;c.height=turn?w:h;
 const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
 g.translate(c.width/2,c.height/2);g.rotate(rot*Math.PI/180);g.imageSmoothingQuality='high';g.drawImage(bmp,-w/2,-h/2,w,h);
 bmp.close?.();return c;
}
const duiCanvasBlob=(c,type='image/jpeg',q=.9)=>new Promise((r,j)=>c.toBlob(b=>b?r(b):j(Error('No se pudo preparar la imagen.')),type,q));
function duiScore(t){
 const u=t.toUpperCase();let s=0;
 for(const k of ['REPUBLICA','REPÚBLICA','SALVADOR','DOCUMENTO','APELLIDOS','SURNAME','NOMBRES','GIVEN','NACIMIENTO','IDSLV','DEPARTAMENTO','PROFESI','ESTADO FAMILIAR','MUNICIPIO','DISTRITO'])if(u.includes(k))s+=2;
 s+=Math.min(6,(u.match(/<</g)||[]).length);
 if(/\d{8}\s*[-–]\s*\d/.test(u))s+=3;
 return s;
}
function duiSide(t){
 const u=t.toUpperCase();
 const back=(/IDSLV|<<<|DEPARTAMENTO|PROFESI|ESTADO FAMILIAR|MARITAL/.test(u)?1:0)+((u.match(/<</g)||[]).length>2?2:0);
 const front=/APELLIDOS|SURNAME|NOMBRES|GIVEN NAMES|REP[UÚ]BLICA|DOCUMENTO [UÚ]NICO|NACIMIENTO/.test(u)?2:0;
 return back>front?'back':front>back?'front':'';
}
async function duiRead(file,status){
 const worker=await ocrWorker();
 // Probar la foto derecha; si viene de lado o de cabeza, se gira hasta que se lea
 const first=await duiCanvas(file,0);
 const tries=first.height>first.width*1.15?[90,270,0]:[0,180];
 let best=null;
 for(const rot of tries){
  const c=rot?await duiCanvas(file,rot):first;
  status('Leyendo el DUI… la primera vez tarda unos segundos.');
  const {data}=await worker.recognize(await duiCanvasBlob(c,'image/png'));
  const score=duiScore(data.text);
  if(!best||score>best.score)best={rot,canvas:c,text:data.text,score};
  if(score>=8)break;
 }
 return best;
}

/* ---------- Datos del DUI ---------- */
const DUI_DEPTOS=['AHUACHAPAN','SANTA ANA','SONSONATE','CHALATENANGO','LA LIBERTAD','SAN SALVADOR','CUSCATLAN','LA PAZ','CABANAS','SAN VICENTE','USULUTAN','SAN MIGUEL','MORAZAN','LA UNION'];
const duiPlain=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
const duiClean=v=>String(v||'').replace(/[^A-ZÁÉÍÓÚÜÑ ,]/gi,' ').replace(/\s+/g,' ').trim().toUpperCase();
function duiNextLine(lines,re){
 const i=lines.findIndex(l=>re.test(duiPlain(l)));if(i<0)return '';
 for(let j=i+1;j<Math.min(lines.length,i+3);j++){const v=duiClean(lines[j]);if(v.length>=3&&!/\//.test(lines[j]))return v;}
 return '';
}
function duiMrzDate(v,future=false){
 const m=String(v).match(/^(\d\d)(\d\d)(\d\d)$/);if(!m)return '';
 const yy=+m[1],now=new Date().getFullYear()%100;
 const year=future?2000+yy:(yy>now?1900+yy:2000+yy);
 return `${year}-${m[2]}-${m[3]}`;
}
const DUI_CONNECT=['DE','DEL','LA','LAS','LOS','Y'];
// Línea con pinta de nombre: palabras de letras (las de 1 o 2 letras se quitan, salvo «de», «la», etc.)
function duiNameLine(raw){
 const toks=duiPlain(raw).replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean).filter(t=>t.length>=3||DUI_CONNECT.includes(t)).filter(t=>!/^(.)\1+$/.test(t)&&/[AEIOU]/.test(t));
 while(toks.length&&DUI_CONNECT.includes(toks.at(-1)))toks.pop();
 const letters=toks.join('').length;
 if(!toks.length||letters<6||!toks.some(t=>t.length>=5))return '';
 if(/REPUBLICA|SALVADOR|DOCUMENTO|IDENTIDAD|APELLIDO|SURNAME|NOMBRE|GIVEN|NACIMIENTO|SEXO|GENDER|FECHA|LUGAR|EXPEDICION|EXPIRA|FIRMA|REGISTRO|MIGUEL|CENTRO|NORTE|SUR|ESTE|OESTE/.test(toks.join(' ')))return '';
 // Nombre original con tildes y Ñ si la lectura las trae
 return toks.join(' ');
}
function duiParse(text){
 const out={},lines=text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
 // Zona de lectura del reverso (la «O» que el lector confunde con cero se corrige en los números)
 const mrzLines=text.toUpperCase().replace(/[«‹]/g,'<').split(/\n+/).map(l=>l.replace(/\s/g,'').replace(/K(?=[<K]*$)/g,'<'));
 for(const l of mrzLines){
  let m=l.match(/IDSLV([0-9OQDIL]{8})<*([0-9OQDIL])/);
  if(m&&!out.dui){const fix=v=>v.replace(/[OQD]/g,'0').replace(/[IL]/g,'1');out.dui=fix(m[1])+'-'+fix(m[2]);}
  m=l.replace(/O/g,'0').match(/(\d{6})\d([MF])\d{6}\dSLV/);
  if(m&&!out.birth){out.birth=duiMrzDate(m[1]);out.sex=m[2];}
  m=l.match(/^([A-Z]+(?:<[A-Z]+)*)<<([A-Z]+(?:<[A-Z]+)*)<*$/);
  if(m&&!out.mrzSur&&m[1].length>=3&&!l.startsWith('IDSLV')){out.mrzSur=m[1].replace(/</g,' ');out.mrzGiven=m[2].replace(/</g,' ');}
 }
 // Frente: con las etiquetas «Apellidos / Nombres» o, si no se leen, las dos primeras líneas con nombre debajo del encabezado
 let sur=duiNextLine(lines,/APELLIDOS|SURNAME/),giv=duiNextLine(lines,/NOMBRES|GIVEN/);
 if(!(sur&&giv)){
  const head=lines.findIndex(l=>/DOCUMENTO|IDENTIDAD|REPUBLICA|SALVADOR/.test(duiPlain(l)));
  if(head>=0){const names=lines.slice(head+1,head+8).map(duiNameLine).filter(Boolean);if(names.length>=2){sur=names[0];giv=names[1];}}
 }
 if(sur&&giv){out.frontSur=duiNameLine(sur)||sur;out.frontGiven=duiNameLine(giv)||giv;}
 if(!out.dui){const m=text.match(/\b(\d{8})\s*[-–]\s*(\d)\b/);if(m)out.dui=m[1]+'-'+m[2];}
 if(!out.birth){const i=lines.findIndex(l=>/NACIMIENTO|BIRTH/.test(duiPlain(l)));const m=(i>=0?lines.slice(i,i+3).join(' '):'').match(/\b(\d{2})\/(\d{2})\/((?:19|20)\d{2})\b/);if(m&&+m[2]<=12&&+m[1]<=31)out.birth=`${m[3]}-${m[2]}-${m[1]}`;}
 if(!out.sex){const i=lines.findIndex(l=>/SEXO|GENDER/.test(duiPlain(l)));if(i>=0){const n=(lines[i+1]||'').trim();if(/^[MF]\b/.test(n))out.sex=n[0];}}
 // Reverso: departamento, distrito y profesión
 const dep=duiNextLine(lines,/DEPARTAMENTO/);
 if(dep){const p=duiPlain(dep);const d=DUI_DEPTOS.find(x=>p.startsWith(x)||p.includes(x));if(d)out.departamento=d;}
 const mun=duiNextLine(lines,/DISTRITO|MUNICIPIO/);
 if(mun){const first=mun.split(',')[0].trim();const found=duiFindDistrict(first);if(found)out.municipio=found;}
 const prof=duiNextLine(lines,/PROFESI/);if(prof&&prof.length<=40)out.occupation=prof.split(/\s{2,}/)[0];
 return out;
}
// Une lo leído en las dos caras. El nombre del frente va completo; el del reverso puede venir cortado.
function duiMerge(all){
 const out={...all};
 const given=all.frontGiven||all.mrzGiven||'',sur=all.frontSur||all.mrzSur||'';
 if(given&&sur)out.name=(given+' '+sur).replace(/\s+/g,' ').trim();
 for(const k of ['frontGiven','frontSur','mrzGiven','mrzSur'])delete out[k];
 return out;
}
function duiFindDistrict(v){
 const p=duiPlain(v).trim();if(!p)return '';
 const all=Object.values(typeof SV_DIVISION!=='undefined'&&SV_DIVISION?SV_DIVISION:{}).flatMap(d=>Object.values(d).flat().concat(Object.keys(d)));
 return all.find(x=>duiPlain(x)===p)||'';
}
function duiAge(birth){const m=String(birth||'').match(/^(\d{4})-(\d\d)-(\d\d)$/);if(!m)return '';const n=new Date();let a=n.getFullYear()-m[1];if(n.getMonth()+1<+m[2]||(n.getMonth()+1===+m[2]&&n.getDate()<+m[3]))a--;return a>0&&a<120?String(a):'';}
let duiAuto={};
const DUI_LABELS={name:'nombre',dui:'DUI',birth:'nacimiento',sex:'sexo',age:'edad',occupation:'ocupación',departamento:'departamento',municipio:'municipio'};
// Llena los campos vacíos; si un campo ya tiene otro valor, ofrece cambiarlo
function duiApply(found,overwrite=false){
 const form=duiFormEl();if(!form)return {filled:[],diff:[]};
 const vals={...found};
 if(form.id==='credit-form'){delete vals.age;delete vals.occupation;delete vals.departamento;delete vals.municipio;}
 else{if(vals.birth)vals.age=duiAge(vals.birth);delete vals.birth;delete vals.sex;}
 const filled=[],diff=[];
 for(const [k,v] of Object.entries(vals)){
  if(!v)continue;
  if(k==='sex'){const r=form.querySelector(`input[name="sex"][value="${v}"]`),cur=form.querySelector('input[name="sex"]:checked');if(r&&(!cur||overwrite)){r.checked=true;filled.push(k);}else if(cur&&cur.value!==v)diff.push(k);continue;}
  const el=form.elements[k];if(!el||el.type==='radio')continue;
  const cur=String(el.value||'').trim();
  if(!cur||overwrite||cur===duiAuto[k]){if(cur===v)continue;duiAuto[k]=v;el.value=v;el.classList.add('delivery-filled');el.dispatchEvent(new Event('input',{bubbles:true}));filled.push(k);}
  else if(duiPlain(cur).replace(/\W/g,'')!==duiPlain(v).replace(/\W/g,''))diff.push(k);
 }
 if(form.departamento&&filled.includes('departamento'))form.departamento.dispatchEvent(new Event('change',{bubbles:true}));
 return {filled,diff};
}
let duiLastFound={};
async function duiHandleImage(file,forcedSide='',preRead=null){
 const status=(m,bad)=>duiStatus(m,bad);
 try{
  const read=preRead||await duiRead(file,status);
  const side=forcedSide||duiSide(read.text)||(!duiState.front?'front':!duiState.back?'back':'front');
  // Se guarda derecha y en JPEG (más liviana), con el lado largo de 1600 px como máximo
  const c=await duiCanvas(file,read.rot,1600);
  duiState[side]=await duiCanvasBlob(c,'image/jpeg',.88);
  duiRender();
  const parsed=duiParse(read.text);
  for(const [k,v] of Object.entries(parsed))if(v&&!duiLastFound[k])duiLastFound[k]=v;
  // El nombre del frente reemplaza al del reverso (que puede venir cortado)
  if(parsed.frontGiven){duiLastFound.frontGiven=parsed.frontGiven;duiLastFound.frontSur=parsed.frontSur;}
  const found=duiMerge(duiLastFound);
  const {filled,diff}=duiApply(found);
  await duiSave();
  const sideTxt=side==='front'?'Frente':'Reverso';
  const missing=!duiState.front?' Ahora pegá el frente.':!duiState.back?' Ahora pegá el reverso.':'';
  const got=filled.length?` Llené: ${filled.map(k=>DUI_LABELS[k]||k).join(', ')}.`:Object.keys(found).length?'':' No pude leer datos en esta foto: revisá que se vea clara y derecha, o escribilos a mano.';
  const dif=diff.length?` En el formulario ya había otro valor en: ${diff.map(k=>DUI_LABELS[k]||k).join(', ')}.`:'';
  duiStatus(`${sideTxt} del DUI listo.${got}${dif}${missing}`,!filled.length&&!Object.keys(found).length,diff.length?' <button type="button" class="text-button" data-dui-use>Usar los datos del DUI</button>':'');
 }catch(err){duiStatus('No se pudo leer la foto: '+(err?.message||err)+'.',true);}
}
const duiImageFrom=dt=>[...(dt?.files||[])].find(f=>f.type.startsWith('image/'))||[...(dt?.items||[])].map(i=>i.kind==='file'&&i.type.startsWith('image/')?i.getAsFile():null).find(Boolean);

/* ---------- PDF con las dos caras ---------- */
async function duiPDF(front,back,name){
 const J=globalThis.jspdf?.jsPDF;if(!J)throw Error('No se pudo cargar el generador de PDF.');
 const doc=new J({unit:'pt',format:'letter',orientation:'portrait',compress:true});
 let y=DUI_PAGE.top;
 for(const blob of [front,back]){
  if(!blob)continue;
  const bmp=await createImageBitmap(blob);
  const s=Math.min(DUI_PAGE.maxW/bmp.width,DUI_PAGE.maxH/bmp.height),w=bmp.width*s,h=bmp.height*s;
  const data=new Uint8Array(await blob.arrayBuffer());bmp.close?.();
  doc.addImage(data,'JPEG',DUI_PAGE.left,y,w,h,undefined,'NONE');
  y+=h+DUI_PAGE.gap;
 }
 doc.setProperties({title:'DUI - '+name});
 return doc.output('blob');
}
const duiFileName=name=>'DUI - '+(String(name||'cliente').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'cliente')+'.pdf';
async function duiOpenPDF(front,back,name){
 if(!front&&!back){toast('Todavía no hay fotos del DUI. Abrí el crédito o la entrega y pegá el frente y el reverso con Ctrl+V.',true);return;}
 try{openPdfViewer('DUI · '+(name||'cliente'),await duiPDF(front,back,name),duiFileName(name));}
 catch(err){toast('No se pudo armar el PDF del DUI: '+(err?.message||err),true);}
}
async function duiPrintRecord(rec){
 let key=duiKey(rec?.dui);
 if(!key&&rec?.creditId){const c=(db.creditForms||[]).find(x=>x.id===rec.creditId);key=duiKey(c?.dui);}
 const saved=await duiLoad(key);
 if($('modal').open&&!duiFormEl())$('modal').close();
 duiOpenPDF(saved?.front,saved?.back,rec?.name||saved?.name);
}

/* ---------- Eventos ---------- */
// Ctrl+V: en crédito toda imagen es el DUI. En entrega se reconoce si es el DUI o la captura de SAP.
document.addEventListener('paste',async e=>{
 const form=duiFormEl();if(!form)return;
 const file=duiImageFrom(e.clipboardData);if(!file)return;
 if(form.id==='delivery-form'&&e.target.closest?.('#delivery-sap'))return;
 e.preventDefault();e.stopImmediatePropagation();
 const slot=e.target.closest?.('[data-dui-slot]')?.dataset.duiSlot||'';
 if(form.id==='credit-form'||slot||e.target.closest?.('#dui-block')){duiHandleImage(file,slot);return;}
 duiStatus('Revisando la imagen…');
 try{
  const read=await duiRead(file,m=>duiStatus(m));
  if(read.score>=6||duiSide(read.text)){duiHandleImage(file,'',read);return;}
  duiStatus('');
  const sapBox=$('delivery-sap-status'),st=(msg,bad=false)=>{if(sapBox){sapBox.textContent=msg;sapBox.hidden=false;sapBox.classList.toggle('bad',!!bad);}};
  const found=parseSAP(read.text);
  if(Object.keys(found).length)applySAP(found,st);else handleSAPInput({files:[file]});
 }catch(err){duiStatus('No se pudo leer la imagen: '+(err?.message||err)+'.',true);}
},true);
document.addEventListener('change',e=>{
 const side=e.target.dataset?.duiFile;
 if(side&&e.target.files?.[0]){duiHandleImage(e.target.files[0],side);e.target.value='';}
});
document.addEventListener('input',e=>{if(e.target.name==='dui'&&e.target.closest?.('#credit-form,#delivery-form')){if(duiState.front||duiState.back)duiSave();else duiReloadFromField();}});
document.addEventListener('change',e=>{if(e.target.name==='creditId'&&e.target.closest?.('#delivery-form'))setTimeout(duiReloadFromField,50);});
document.addEventListener('dragover',e=>{const z=e.target.closest?.('#dui-paste');if(z){e.preventDefault();z.classList.add('drag');}});
document.addEventListener('dragleave',e=>{e.target.closest?.('#dui-paste')?.classList.remove('drag');});
document.addEventListener('drop',e=>{const z=e.target.closest?.('#dui-paste');if(!z)return;e.preventDefault();z.classList.remove('drag');const f=duiImageFrom(e.dataTransfer);if(f)duiHandleImage(f,e.target.closest('[data-dui-slot]')?.dataset.duiSlot||'');});
document.addEventListener('click',async e=>{
 const t=e.target;
 const clear=t.closest?.('[data-dui-clear]');
 if(clear){duiState[clear.dataset.duiClear]=null;duiRender();await duiSave();const key=duiKey(duiFormEl()?.dui?.value);if(key&&!duiState.front&&!duiState.back){try{await duiStore('readwrite',s=>s.delete(key));}catch{}}duiStatus('Foto quitada.');return;}
 if(t.closest?.('[data-dui-swap]')){[duiState.front,duiState.back]=[duiState.back,duiState.front];duiRender();await duiSave();duiStatus('Se cambiaron de lado el frente y el reverso.');return;}
 if(t.closest?.('[data-dui-use]')){const {filled}=duiApply(duiMerge(duiLastFound),true);await duiSave();duiStatus(`Listo: ${filled.map(k=>DUI_LABELS[k]||k).join(', ')} con los datos del DUI. Revisalos antes de guardar.`);return;}
 if(t.closest?.('[data-dui-pdf]')){await duiSave();duiOpenPDF(duiState.front,duiState.back,duiFormEl()?.name?.value);return;}
 // «DUI (frente y reverso)» en los menús de Imprimir
 const p=t.closest?.('[data-action="credit-print"][data-doc="dui"],[data-action="delivery-print"][data-doc="dui"]');
 if(p){e.preventDefault();e.stopImmediatePropagation();const list=p.dataset.action==='credit-print'?db.creditForms:db.deliveryForms;duiPrintRecord((list||[]).find(x=>x.id===p.dataset.id));}
},true);
// Al cerrar el formulario se limpian las fotos en memoria
document.addEventListener('close',e=>{if(e.target===$('modal'))duiState={front:null,back:null,key:'',form:''};},true);
// Para las pruebas automáticas
globalThis.__duiTest={read:duiRead,parse:t=>duiMerge(duiParse(t)),canvas:duiCanvas,blob:duiCanvasBlob,score:duiScore,ocr:()=>ocrWorker()};
