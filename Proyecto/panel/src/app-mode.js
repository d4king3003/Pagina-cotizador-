// ===== Modo app de Android: solo Cotizar y Fichas técnicas =====
// Se agrega únicamente en la versión de la app (dist/app.html). Corre dentro del panel, antes de mostrar la primera pantalla.
{
 const APP_ROUTES=['cotizar','fichas'];
 const items=NAV.filter(n=>APP_ROUTES.includes(n[0])).map(n=>[n[0],n[1],n[2],'TVS Roosevelt']);
 NAV.splice(0,NAV.length,...items);
 document.documentElement.classList.add('tvs-app');
 // Las demás secciones del panel quedan ocultas siempre
 document.querySelectorAll('main > .view').forEach(v=>{if(!APP_ROUTES.includes(v.id.replace('view-',''))){v.hidden=true;v.classList.add('app-off');}});
 // Arriba solo el nombre de la sección
 {const bc=document.querySelector('.breadcrumb'),cur=document.getElementById('current-section');if(bc&&cur)bc.replaceChildren(cur);}
 // Cualquier otra sección vuelve a Cotizar
 window.addEventListener('hashchange',e=>{const r=location.hash.slice(1);if(!APP_ROUTES.includes(r)){e.stopImmediatePropagation();location.replace('#cotizar');}},true);
 // Barra inferior con las dos secciones
 const bar=document.createElement('nav');bar.className='app-tabbar';bar.setAttribute('aria-label','Secciones');
 bar.innerHTML=items.map(([id,title,ico])=>`<a href="#${id}" data-app-tab="${id}">${icon(ico)}<span>${esc(title)}</span></a>`).join('');
 document.body.append(bar);
 const markTab=()=>{const r=location.hash.slice(1)||'cotizar';bar.querySelectorAll('a').forEach(a=>{const on=a.dataset.appTab===r;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});};
 window.addEventListener('hashchange',markTab);markTab();

 // Puente con Android: copiar y guardar imágenes (el navegador interno de las apps no lo permite por sí solo)
 const toBase64=blob=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=rej;r.readAsDataURL(blob);});
 function installBridge(w){
  const A=window.AndroidBridge;if(!A||!w||w.__tvsBridge)return;w.__tvsBridge=true;
  if(!w.ClipboardItem)w.ClipboardItem=class{constructor(d){this._d=d;this.types=Object.keys(d);}async getType(t){return await this._d[t];}};
  const clip={
   async write(list){const it=list[0];const type=(it.types||[]).find(t=>t.startsWith('image/'))||(it.types||[])[0];const blob=await it.getType(type);
    if(type&&type.startsWith('text/')){A.copyText(await blob.text());return;}A.copyImage(await toBase64(blob),type||'image/png');},
   async writeText(t){A.copyText(String(t));},
   async readText(){return '';}};
  try{Object.defineProperty(w.navigator,'clipboard',{value:clip,configurable:true});}catch{}
  const save=async a=>{const name=a.getAttribute('download')||'imagen.png';try{const blob=await (await w.fetch(a.href)).blob();A.saveFile(await toBase64(blob),name,blob.type||'image/png');}catch(err){A.toast('No se pudo guardar: '+(err?.message||err));}};
  const isFile=a=>a&&a.hasAttribute&&a.hasAttribute('download')&&/^(blob:|data:)/.test(a.href||'');
  const orig=w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click=function(){if(isFile(this)){save(this);return;}return orig.call(this);};
  w.document.addEventListener('click',e=>{const a=e.target.closest?.('a[download]');if(isFile(a)){e.preventDefault();e.stopPropagation();save(a);}},true);
 }
 installBridge(window);
 $('calculator')?.addEventListener('load',()=>{try{installBridge($('calculator').contentWindow);}catch{}});
}
