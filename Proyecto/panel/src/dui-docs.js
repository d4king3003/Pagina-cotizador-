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
async function duiCanvas(src,rot=0,maxSide=1800,minSide=0){
 const bmp=await createImageBitmap(src);
 const long=Math.max(bmp.width,bmp.height),sc=minSide&&long<minSide?minSide/long:Math.min(1,maxSide/long);
 const w=Math.round(bmp.width*sc),h=Math.round(bmp.height*sc),turn=rot%180!==0;
 const c=document.createElement('canvas');c.width=turn?h:w;c.height=turn?w:h;
 const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
 g.translate(c.width/2,c.height/2);g.rotate(rot*Math.PI/180);g.imageSmoothingQuality='high';g.drawImage(bmp,-w/2,-h/2,w,h);
 bmp.close?.();return c;
}
// Recorta la foto al borde del DUI cuando trae fondo alrededor (mesa, mano, etc.).
// Busca la mancha más grande que contrasta con el fondo y tiene forma de tarjeta (1,59 de ancho por 1 de alto).
function duiCropCanvas(src){
 const S=320,sc=S/Math.max(src.width,src.height),w=Math.max(1,Math.round(src.width*sc)),h=Math.max(1,Math.round(src.height*sc));
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(src,0,0,w,h);
 const px=g.getImageData(0,0,w,h).data,lum=new Float32Array(w*h),hist=new Array(256).fill(0);
 for(let i=0;i<w*h;i++){const v=.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2];lum[i]=v;hist[v|0]++;}
 // Umbral de Otsu
 let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let sB=0,wB=0,best=0,th=128;
 for(let i=0;i<256;i++){wB+=hist[i];if(!wB)continue;const wF=w*h-wB;if(!wF)break;sB+=i*hist[i];const mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)**2;if(v>best){best=v;th=i;}}
 let pick=null;
 // Se prueban varios cortes de brillo: el de Otsu y otros, por si el fondo se parece a la tarjeta
 const ths=[th,...[50,70,90,110,130,150,170,190,210].filter(t=>Math.abs(t-th)>8)];
 for(const cut of ths)for(const bright of [true,false]){
  const th=cut;
  const seen=new Uint8Array(w*h);
  for(let start=0;start<w*h;start++){
   if(seen[start]||(lum[start]>th)!==bright)continue;
   let x0=w,y0=h,x1=0,y1=0,n=0,edge=0;const st=[start];seen[start]=1;
   while(st.length){const k=st.pop(),x=k%w,y=(k/w)|0;n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(!x||!y||x===w-1||y===h-1)edge++;
    for(const q of [k-1,k+1,k-w,k+w]){if(q<0||q>=w*h||seen[q])continue;if((q===k-1&&x===0)||(q===k+1&&x===w-1))continue;if((lum[q]>th)===bright){seen[q]=1;st.push(q);}}}
   const bw=x1-x0+1,bh=y1-y0+1,ar=Math.max(bw/bh,bh/bw),frac=bw*bh/(w*h);
   // Forma de tarjeta (de pie o acostada), no todo el fondo, y que no se pegue a las orillas
   if(n<w*h*.08||n<bw*bh*.55||ar<1.3||ar>1.9||frac>.93||edge>2*(w+h)*.35)continue;
   const score=bw*bh*(1-Math.min(1,Math.abs(ar-1.586)/.35)*.6);
   if(!pick||score>pick.score)pick={x0,y0,bw,bh,score};
  }
 }
 if(!pick)return null;
 // Un poco de margen para no comerse el borde redondeado
 const m=2,X=Math.max(0,(pick.x0-m)/sc),Y=Math.max(0,(pick.y0-m)/sc),W=Math.min(src.width-X,(pick.bw+2*m)/sc),H=Math.min(src.height-Y,(pick.bh+2*m)/sc);
 if(W*H>src.width*src.height*.9)return null;
 const out=document.createElement('canvas');out.width=Math.round(W);out.height=Math.round(H);
 out.getContext('2d').drawImage(src,X,Y,W,H,0,0,out.width,out.height);
 return out;
}
// Dos pasadas: si la foto ya traía un borde oscuro alrededor de la tarjeta, la segunda lo quita
function duiCropLoop(src){let c=src;for(let i=0;i<2;i++){let cut=null;try{cut=duiCropCanvas(c);}catch{}if(!cut)break;c=cut;}return c===src?null:c;}
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
 const whole=await duiCanvas(file,0);
 const cropped=duiCropLoop(whole),first=cropped||whole;
 const tries=first.height>first.width*1.15?[90,270,0]:[0,180];
 let best=null;
 for(const rot of tries){
  const c=rot?await duiCanvas(first,rot):first;
  status('Leyendo el DUI… la primera vez tarda unos segundos.');
  // Para leer, las fotos chicas se agrandan (las letras del DUI son pequeñas)
  const {data}=await worker.recognize(await duiCanvasBlob(c,'image/png'));
  const score=duiScore(data.text);
  if(!best||score>best.score)best={rot,canvas:c,text:data.text,score,cropped:!!cropped};
  if(score>=8)break;
 }
 // Segunda lectura en otro tamaño: cada una se equivoca en letras distintas y se usa lo que pase las validaciones
 const L=Math.max(best.canvas.width,best.canvas.height),alt=L<1500?await duiCanvas(best.canvas,0,2000,2000):await duiCanvas(best.canvas,0,Math.round(L*.6));
 try{const {data}=await worker.recognize(await duiCanvasBlob(alt,'image/png'));best.texts=[best.text,data.text];}catch{best.texts=[best.text];}
 best.text=best.texts.join('\n');
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
// Dígito verificador del DUI: pesos 9 a 2 sobre los 8 números
function duiValid(v){const d=String(v||'').replace(/\D/g,'');if(d.length!==9)return false;let s=0;for(let i=0;i<8;i++)s+=+d[i]*(9-i);return (10-s%10)%10===+d[8];}
// Dígito de control de la zona <<< (7-3-1)
function duiIcao(v){const w=[7,3,1];let s=0;for(let i=0;i<v.length;i++){const ch=v[i];const n=/\d/.test(ch)?+ch:ch==='<'?0:ch.charCodeAt(0)-55;s+=n*w[i%3];}return s%10;}
const DUI_CONNECT=['DE','DEL','LA','LAS','LOS','Y'];
// Línea con pinta de nombre: palabras de letras (las de 1 o 2 letras se quitan, salvo «de», «la», etc.)
function duiNameLine(raw){
 const toks=duiPlain(raw).replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean).filter(t=>t.length>=3||DUI_CONNECT.includes(t)).filter(t=>!/^(.)\1+$/.test(t)&&/[AEIOU]/.test(t));
 while(toks.length&&DUI_CONNECT.includes(toks.at(-1)))toks.pop();
 const letters=toks.join('').length;
 if(!toks.length||letters<6||!toks.some(t=>t.length>=5))return '';
 if(/REPUBLICA|SALVADOR|DOCUMENTO|IDENTIDAD|APELLIDO|SURNAME|NOMBRE|GIVEN|NACIMIENTO|SEXO|GENDER|FECHA|LUGAR|EXPEDICION|EXPIRA|FIRMA|REGISTRO|MIGUEL|CENTRO|NORTE|SUR|ESTE|OESTE|NAMES|KNOWN|HOLDER|SIGNATURE|CONOCIDO|GENERO|UNIQUE|NUMBER|NUMERO|PROFESI|OFICIO|TRADE|IDSLV|MADRE|PADRE|MOTHER|FATHER|CONYUGE|SPOUSE|RESIDENCIA|ADDRESS|MUNICIPIO|DEPARTAMENTO|STATE|CITY|TRAMITE|PROCEDURE|CODIGO|ZONA|MARITAL|SANGRE|BLOOD|ESTADO|FAMILIAR|NIT/.test(toks.join(' ')))return '';
 // Nombre original con tildes y Ñ si la lectura las trae
 return toks.join(' ');
}
function duiParse(text){
 const out={},lines=text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
 // Zona de lectura del reverso (la «O» que el lector confunde con cero se corrige en los números)
 const mrzLines=text.toUpperCase().replace(/[«‹]/g,'<').split(/\n+/).map(l=>l.replace(/\s/g,'').replace(/K(?=[<K]*$)/g,'<'));
 for(const l of mrzLines){
  let m=l.match(/IDSLV([0-9OQDIL]{8})<*([0-9OQDIL])/);
  if(m&&!out.dui){const fix=v=>v.replace(/[OQD]/g,'0').replace(/[IL]/g,'1'),d=fix(m[1])+'-'+fix(m[2]);if(duiValid(d))out.dui=d;}
  m=l.replace(/O/g,'0').match(/(\d{6})(\d)([MF])\d{6}\dSLV/);
  if(m&&!out.birth&&duiIcao(m[1])===+m[2]){out.birth=duiMrzDate(m[1]);out.sex=m[3];}
  m=l.match(/^([A-Z]+(?:<[A-Z]+)*)<<([A-Z]+(?:<[A-Z]+)*)<*$/);
  if(m&&!out.mrzSur&&m[1].length>=3&&!l.startsWith('IDSLV')){out.mrzSur=m[1].replace(/</g,' ');out.mrzGiven=m[2].replace(/</g,' ');}
 }
 // Frente: con las etiquetas «Apellidos / Nombres» o, si no se leen, las dos primeras líneas con nombre debajo del encabezado
 const isBack=duiSide(text)==='back';
 let sur=isBack?'':duiNextLine(lines,/APELLIDOS|SURNAME/),giv=isBack?'':duiNextLine(lines,/NOMBRES|GIVEN/);
 if(!isBack&&!(sur&&giv)){
  const head=lines.findIndex(l=>/DOCUMENTO|IDENTIDAD|REPUBLICA|SALVADOR/.test(duiPlain(l)));
  if(head>=0){const names=lines.slice(head+1,head+8).map(duiNameLine).filter(Boolean);if(names.length>=2){sur=names[0];giv=names[1];}}
 }
if(sur&&giv&&!isBack){out.frontSur=duiNameLine(sur)||sur;out.frontGiven=duiNameLine(giv)||giv;}
 if(!out.dui){for(const m of text.matchAll(/\b(\d{8})\s*[-–]\s*(\d)\b/g)){if(duiValid(m[1]+m[2])){out.dui=m[1]+'-'+m[2];break;}}}
 if(!out.birth){const i=lines.findIndex(l=>/NACIMIENTO|BIRTH/.test(duiPlain(l)));const m=(i>=0?lines.slice(i,i+3).join(' '):'').match(/\b(\d{2})\/(\d{2})\/((?:19|20)\d{2})\b/);if(m&&+m[2]<=12&&+m[1]<=31)out.birth=`${m[3]}-${m[2]}-${m[1]}`;}
 if(!out.sex){const i=lines.findIndex(l=>/SEXO|GENDER/.test(duiPlain(l)));if(i>=0){const n=(lines[i+1]||'').trim();if(/^[MF]\b/.test(n))out.sex=n[0];}}
 // Reverso: departamento, distrito y profesión
 // Los valores van en mayúsculas; las etiquetas («Municipio / City») tienen minúsculas y se descartan
 const values=(re,n=3)=>{const i=lines.findIndex(l=>re.test(duiPlain(l)));if(i<0)return [];return lines.slice(i,i+n+1).map(l=>l.split(/\s+/).filter(t=>t&&!/[a-záéíóúñ]/.test(t)&&!t.includes('/')&&!/\d/.test(t)).map(duiPlain).join(' ').trim()).filter(Boolean);};
 const depVals=values(/DEPARTAMENTO/);
 for(const v of depVals){const d=DUI_DEPTOS.find(x=>v.includes(x));if(d){out.departamento=d;break;}}
 // Municipio o distrito: el tramo de palabras más largo que sea un nombre conocido (que no sea solo el departamento)
 const munFound=[];
 for(const v of values(/DISTRITO|MUNICIPIO/)){const toks=v.split(',')[0].trim().split(' ');
  for(let a=0;a<toks.length;a++)for(let z=toks.length;z>a;z--){const f=duiFindDistrict(toks.slice(a,z).join(' '));if(f){munFound.push(f);break;}}}
 out.municipio=munFound.find(m=>duiPlain(m)!==out.departamento)||munFound[0]||undefined;
 if(!out.municipio)delete out.municipio;
 const res=duiNextLine(lines,/RESIDENCIA|ADDRESS/);if(res&&res.length>=4&&!/MUNICIPIO|DEPARTAMENTO/.test(duiPlain(res))){let r=res.replace(/\s*,\s*/g,', ').split(' ');while(r.length>1&&r.at(-1).replace(/,/g,'').length<=2)r.pop();out.residence=r.join(' ').replace(/,$/,'');}
 const prof=duiNextLine(lines,/PROFESI/);if(prof&&prof.length<=40)out.occupation=prof.split(/\s{2,}/)[0];
 return out;
}
// Une lo leído en las dos caras. El nombre del frente va completo; el del reverso puede venir cortado.
function duiLev(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
// Junta el nombre leído en el frente con el del reverso, palabra por palabra.
// El reverso casi no se equivoca pero puede venir cortado; el frente viene completo pero puede tener letras mal leídas.
function duiFixName(front,mrz){
 if(!front)return mrz||'';if(!mrz)return front;
 const f=front.split(' '),m=mrz.split(' ');
 if(f.length!==m.length)return front;
 return f.map((w,i)=>{const r=m[i];
  if(w===r||w.startsWith(r)&&i===m.length-1)return w;            // igual, o el reverso cortado al final
  if(r.length>=w.length||i<m.length-1)return duiLev(w,r)<=Math.max(2,Math.floor(r.length/3))?r:w;
  // Última palabra cortada en el reverso: se toma el comienzo del reverso y el final del frente
  const head=w.slice(0,r.length);return duiLev(head,r)<=2?r+w.slice(r.length):w;
 }).join(' ');
}
// Une las lecturas de una misma foto: lo validado de cualquiera, y todos los nombres del frente como candidatos
function duiParseAll(texts){
 const out={frontCands:[]};
 for(const t of texts){
  const p=duiParse(t);
  for(const [k,v] of Object.entries(p))if(v&&!['frontGiven','frontSur'].includes(k)&&!out[k])out[k]=v;
  if(p.frontGiven&&p.frontSur)out.frontCands.push({given:p.frontGiven,sur:p.frontSur});
 }
 return out;
}
// Elige el nombre del frente que más se parece al del reverso (o el primero, si no hay reverso)
function duiPickFront(cands,mrzGiven,mrzSur){
 if(!cands?.length)return null;
 if(!mrzSur)return cands[0];
 const cost=c=>duiLev(c.sur,mrzSur)+duiLev(c.given.slice(0,(mrzGiven||'').length),mrzGiven||'');
 return [...cands].sort((a,b)=>cost(a)-cost(b))[0];
}
// Palabra por palabra, entre todas las lecturas del frente, se elige la que coincide con el reverso
function duiVote(cands,key,mrz){
 const lists=(cands||[]).map(c=>String(c[key]||'').split(' ').filter(Boolean)).filter(l=>l.length);
 if(!lists.length)return mrz||'';
 if(!mrz)return lists[0].join(' ');
 const m=mrz.split(' '),same=lists.filter(l=>l.length===m.length);
 if(!same.length)return duiFixName(lists[0].join(' '),mrz);
 return m.map((r,i)=>{
  const opts=same.map(l=>l[i]);
  const full=opts.filter(w=>w.startsWith(r)).sort((a,b)=>b.length-a.length)[0];
  if(full)return full;
  const best=[...opts].sort((a,b)=>duiLev(a.slice(0,r.length),r)-duiLev(b.slice(0,r.length),r))[0];
  return duiFixName(best,r);
 }).join(' ');
}
function duiMerge(all){
 const out={...all};
 const given=duiVote(all.frontCands,'given',all.mrzGiven),sur=duiVote(all.frontCands,'sur',all.mrzSur);
 if(given&&sur)out.name=(given+' '+sur).replace(/\s+/g,' ').trim();
 // DUI anterior: la residencia sirve como dirección del crédito
 if(all.residence)out.address=[all.residence,all.municipio,all.departamento].filter(Boolean).join(', ').toUpperCase();
 for(const k of ['frontCands','frontGiven','frontSur','mrzGiven','mrzSur','residence'])delete out[k];
 return out;
}
function duiFindDistrict(v){
 const p=duiPlain(v).trim();if(!p)return '';
 const all=Object.values(typeof SV_DIVISION!=='undefined'&&SV_DIVISION?SV_DIVISION:{}).flatMap(d=>Object.values(d).flat().concat(Object.keys(d)));
 return all.find(x=>duiPlain(x)===p)||'';
}
function duiAge(birth){const m=String(birth||'').match(/^(\d{4})-(\d\d)-(\d\d)$/);if(!m)return '';const n=new Date();let a=n.getFullYear()-m[1];if(n.getMonth()+1<+m[2]||(n.getMonth()+1===+m[2]&&n.getDate()<+m[3]))a--;return a>0&&a<120?String(a):'';}
let duiAuto={};
const DUI_LABELS={address:'dirección',name:'nombre',dui:'DUI',birth:'nacimiento',sex:'sexo',age:'edad',occupation:'ocupación',departamento:'departamento',municipio:'municipio'};
// Llena los campos vacíos; si un campo ya tiene otro valor, ofrece cambiarlo
function duiApply(found,overwrite=false){
 const form=duiFormEl();if(!form)return {filled:[],diff:[]};
 const vals={...found};
 if(form.id==='credit-form'){delete vals.age;delete vals.occupation;delete vals.departamento;delete vals.municipio;}
 else{delete vals.address;if(vals.birth)vals.age=duiAge(vals.birth);delete vals.birth;delete vals.sex;}
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
  // La foto guardada es la ya recortada y derecha (lado largo de 1600 px como máximo)
  const c=await duiCanvas(read.canvas,0,1600),cropped=read.cropped;
  duiState[side]=await duiCanvasBlob(c,'image/jpeg',.9);
  duiRender();
  const parsed=duiParseAll(read.texts||[read.text]);
  for(const [k,v] of Object.entries(parsed))if(v&&k!=='frontCands'&&!duiLastFound[k])duiLastFound[k]=v;
  // Los nombres del frente reemplazan a los anteriores (el reverso solo trae el nombre cortado)
  if(parsed.frontCands.length&&side==='front')duiLastFound.frontCands=parsed.frontCands;
  const found=duiMerge(duiLastFound);
  const {filled,diff}=duiApply(found);
  await duiSave();
  const sideTxt=side==='front'?'Frente':'Reverso';
  const missing=!duiState.front?' Ahora pegá el frente.':!duiState.back?' Ahora pegá el reverso.':'';
  const got=filled.length?` Llené: ${filled.map(k=>DUI_LABELS[k]||k).join(', ')}.`:Object.keys(found).length?'':' No pude leer datos en esta foto: revisá que se vea clara y derecha, o escribilos a mano.';
  const dif=diff.length?` En el formulario ya había otro valor en: ${diff.map(k=>DUI_LABELS[k]||k).join(', ')}.`:'';
  duiStatus(`${sideTxt} del DUI listo${cropped?' (recortado al borde del DUI)':''}.${got}${dif}${missing}`,!filled.length&&!Object.keys(found).length,diff.length?' <button type="button" class="text-button" data-dui-use>Usar los datos del DUI</button>':'');
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
globalThis.__duiTest={read:duiRead,parse:t=>duiMerge(duiParseAll(String(t).split('\n\u0000'))),crop:duiCropLoop,canvas:duiCanvas,blob:duiCanvasBlob,score:duiScore,ocr:()=>ocrWorker()};
