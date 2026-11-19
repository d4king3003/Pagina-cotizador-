// Recordatorio de respaldo, WhatsApp desde la ficha y buscador rápido (Ctrl+K).

/* ---------- Recordatorio de respaldo ----------
   Los datos viven en el navegador de cada PC; el recordatorio también es por PC. */
const BACKUP_KEY='tvs-daniel-panel-ultimo-respaldo',BACKUP_SNOOZE_KEY='tvs-daniel-panel-respaldo-luego',BACKUP_DAYS=7;
const readLocal=k=>{try{return localStorage.getItem(k)||'';}catch{return '';}};
const writeLocal=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
const daysBetween=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
function backupStatus(){
 const last=readLocal(BACKUP_KEY),snooze=readLocal(BACKUP_SNOOZE_KEY),now=today();
 if(demo||!db.clients.length||(snooze&&snooze>=now))return null;
 if(!last)return {days:null};
 const days=daysBetween(last,now);return days>=BACKUP_DAYS?{days}:null;
}
function renderBackupBanner(){
 const el=$('backup-banner');if(!el)return;const s=backupStatus();el.hidden=!s;if(!s)return;
 const text=s.days===null?'Todavía no hay un respaldo descargado en esta PC.':`Tu último respaldo en esta PC fue hace ${s.days} días.`;
 el.innerHTML=`<span>${icon('download')}<strong>${esc(text)}</strong> Tus datos viven solo en este navegador.</span><span class="backup-banner-actions"><button class="btn btn-small btn-primary" data-action="export-json">Descargar respaldo</button><button class="btn btn-small btn-quiet" data-action="backup-later">Más tarde</button></span>`;
}
const exportJSONBase=exportJSON;
exportJSON=function(){exportJSONBase();writeLocal(BACKUP_KEY,today());renderBackupBanner();};
const renderBase=render;
render=function(){renderBase();renderBackupBanner();};

// Ícono de WhatsApp (burbuja con teléfono) para el botón verde.
const WA_ICON='<svg class="wa-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6a9.4 9.4 0 0 0-8.1 14.2L2.6 21.4l4.7-1.3A9.4 9.4 0 1 0 12 2.6z" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.7 7.5c.3-.6.6-.6.9-.6h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.6.8c-.1.2-.2.3 0 .6.5.9 1.7 2.1 2.7 2.6.3.2.5.1.6 0l.8-.9c.2-.2.4-.2.6-.1l1.9.9c.3.1.4.2.4.4 0 .5-.2 1.4-.9 1.8-.6.4-1.6.6-3.6-.3-2.4-1.1-4-3.6-4.2-3.9-.2-.3-1-1.5-1-2.8 0-1.2.5-1.7.8-2z" fill="currentColor" stroke="none"/></svg>';
/* ---------- WhatsApp ----------
   Se abre siempre en la misma pestaña de WhatsApp Web (ventana con nombre fijo):
   el primer clic la crea y los siguientes la reutilizan. */
function whatsappNumber(phone){
 const raw=String(phone||'').trim();if(!raw)return '';
 let digits=raw.replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);
 if(!raw.startsWith('+')&&digits.length===8)digits='503'+digits;
 return /^[1-9]\d{9,14}$/.test(digits)?digits:'';
}
function openClientWhatsApp(id){
 const c=client(id);if(!c)return;const n=whatsappNumber(c.phone);
 if(!n){toast('Este cliente no tiene un número válido para WhatsApp. Revisá su teléfono en Editar.',true);return;}
 // Con la extensión «Números a WhatsApp Web - Daniel» (v1.2 o más) se usa la pestaña de WhatsApp Web que ya está abierta.
 if(window.__danielWhatsappWebInstalled){window.dispatchEvent(new CustomEvent('daniel-whatsapp-web-open-v1',{detail:n}));return;}
 // Sin la extensión, WhatsApp Web no deja que el panel reutilice su pestaña: se abre una.
 const w=window.open('https://web.whatsapp.com/send?phone='+n,'tvs-whatsapp');
 if(w){try{w.focus();}catch{}}else toast('El navegador bloqueó la ventana. Permití las ventanas emergentes para este archivo.',true);
}

/* ---------- Buscador rápido ---------- */
const searchNorm=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function quickSearchResults(q){
 const query=searchNorm(q).trim(),digits=q.replace(/\D/g,'');if(!query)return [];
 const duiByClient=new Map((db.creditForms||[]).filter(f=>f.clientId).map(f=>[f.clientId,f.dui]));
 const hit=(text)=>searchNorm(text).includes(query);
 const people=db.clients.filter(c=>hit(c.name)||(digits.length>=3&&(String(c.phone).replace(/\D/g,'').includes(digits)||String(duiByClient.get(c.id)||'').replace(/\D/g,'').includes(digits)))||hit(stock(c.stockId)?.label||''))
  .slice(0,8).map(c=>({action:'view-client',id:c.id,title:c.name,detail:[phoneLabel(c.phone)||'Sin teléfono',c.stage,stock(c.stockId)?.label,duiByClient.get(c.id)?'DUI '+duiByClient.get(c.id):''].filter(Boolean).join(' · '),archived:c.archived}));
 const credits=(db.creditForms||[]).filter(f=>!f.clientId&&(hit(f.name)||(digits.length>=3&&String(f.dui).replace(/\D/g,'').includes(digits))))
  .slice(0,4).map(f=>({action:'credit-edit',id:f.id,title:f.name,detail:'Crédito sin cliente vinculado · DUI '+f.dui}));
 return [...people,...credits];
}
function renderQuickSearch(){
 const input=$('qs-input'),box=$('qs-results');if(!input||!box)return;
 const list=quickSearchResults(input.value);ui.qsIndex=Math.min(ui.qsIndex||0,Math.max(0,list.length-1));
 box.innerHTML=!input.value.trim()?'<p class="subtext qs-hint">Escribí un nombre, teléfono, DUI o moto. Usá ↑ ↓ y Enter para abrir.</p>':list.length?list.map((r,i)=>`<button type="button" class="qs-item${i===ui.qsIndex?' active':''}" data-action="${r.action}" data-id="${esc(r.id)}" role="option" aria-selected="${i===ui.qsIndex}"><span class="avatar">${esc(initials(r.title))}</span><span><strong>${esc(r.title)}</strong><small>${esc(r.detail)}${r.archived?' · Archivado':''}</small></span></button>`).join(''):'<p class="subtext qs-hint">Sin resultados.</p>';
}
function openQuickSearch(){
 const m=$('modal');ui.qsIndex=0;
 // Se abre al instante: es una acción de teclado frecuente.
 m.dataset.instant='1';m.addEventListener('close',()=>{delete m.dataset.instant;},{once:true});
 openModal('Buscar cliente',`<div class="qs"><input id="qs-input" type="search" autocomplete="off" placeholder="Nombre, teléfono, DUI o moto" aria-label="Buscar cliente" aria-controls="qs-results"><div id="qs-results" class="qs-results" role="listbox"></div></div>`,'',560);
 renderQuickSearch();$('qs-input').focus();
}
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();openQuickSearch();return;}
 if(e.target?.id!=='qs-input')return;
 const items=[...document.querySelectorAll('#qs-results .qs-item')];
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!items.length)return;ui.qsIndex=(ui.qsIndex+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;renderQuickSearch();document.querySelector('#qs-results .qs-item.active')?.scrollIntoView({block:'nearest'});}
 else if(e.key==='Enter'){e.preventDefault();items[ui.qsIndex||0]?.click();}
});
document.addEventListener('input',e=>{if(e.target?.id==='qs-input'){ui.qsIndex=0;renderQuickSearch();}});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 if(b.dataset.action==='quick-search')openQuickSearch();
 else if(b.dataset.action==='whatsapp-client')openClientWhatsApp(b.dataset.id);
 else if(b.dataset.action==='backup-later'){writeLocal(BACKUP_SNOOZE_KEY,today());renderBackupBanner();}
});

/* ---------- Clientes repetidos ----------
   El panel ya impedía guardar un teléfono repetido; ahora el aviso dice de quién es y permite abrir esa ficha. */
function duplicateClientFor(phone,id){
 const key=phoneKey(phone);if(!key||key.replace(/\D/g,'').length<8)return null;
 return db.clients.find(c=>c.id!==id&&phoneKey(c.phone)===key)||null;
}
const submitRecordNoDup=submitRecord;
submitRecord=function(form){
 if(form?.dataset?.form==='client'){
  const phone=String(new FormData(form).get('phone')||'').trim(),old=client(form.dataset.id||'');
  // Solo si el teléfono es nuevo o cambió: una ficha ya guardada no vuelve a avisar
  const dup=old&&phoneKey(old.phone)===phoneKey(phone)?null:duplicateClientFor(phone,form.dataset.id||'');
  if(dup){
   const box=$('form-error');
   if(box){box.innerHTML=`<strong>Ya existe un cliente con este teléfono:</strong> ${esc(dup.name)} (${esc(dup.stage)}${dup.archived?', archivado':''}). <span class="dup-actions"><button type="button" class="btn btn-small" data-action="view-client" data-id="${esc(dup.id)}">Abrir la ficha existente</button></span>`;box.hidden=false;box.scrollIntoView({block:'nearest'});}
   else toast('Ya existe un cliente con este teléfono: '+dup.name,true);
   return;
  }
 }
 return submitRecordNoDup(form);
};

