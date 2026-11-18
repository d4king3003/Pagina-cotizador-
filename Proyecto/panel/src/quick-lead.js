// Manual phone-only registration. Uses the same client records as the office.
let quickLeadResult=null;
function normalizeLeadPhone(value){
 const raw=String(value??'').trim();
 if(!raw||raw.length>50||!/^\+?[\d\s().-]+$/.test(raw))throw Error('Ingresá un solo número de teléfono, sin letras.');
 let digits=raw.replace(/\D/g,''),international=raw.startsWith('+')||digits.startsWith('00');
 if(digits.startsWith('00'))digits=digits.slice(2);
 if(!international){
  if(digits.length===8)digits='503'+digits;
  else if(!(digits.length===11&&digits.startsWith('503')))throw Error('Usá 8 dígitos para El Salvador o + y el código de país para otro número.');
 }
 if(!/^[1-9]\d{8,14}$/.test(digits)||/^0+$/.test(digits.slice(3)))throw Error('Revisá el número y su código de país.');
 if(digits.startsWith('503')&&digits.length!==11)throw Error('El número de El Salvador debe tener 8 dígitos después de +503.');
 return '+'+digits;
}
function leadPhoneLabel(phone){return /^\+503\d{8}$/.test(phone)?phone.replace(/^(\+503)(\d{4})(\d{4})$/,'$1 $2 $3'):phone;}
function prepareQuickLead(data,value){
 const phone=normalizeLeadPhone(value),match=data.clients.find(c=>phoneKey(c.phone)===phoneKey(phone));
 if(match)return {data,clientId:match.id,created:false};
 const next=clone(data),now=new Date().toISOString(),c={id:uid(),name:'Interesado · '+leadPhoneLabel(phone),namePending:true,phone,stockId:'',stage:'Nuevo',source:'WhatsApp',paymentMode:'Por definir',nextFollow:'',notes:'',recordDate:today(),price:null,documentation:'',plates:'',saleId:'',archived:false,createdAt:now,history:[]};
 eventFor(c,'Nuevo interesado registrado solo con su número. Nombre por confirmar.');next.clients.push(c);
 return {data:next,clientId:c.id,created:true};
}
function quickLeadPanel(scope){
 const id='quick-lead-'+scope;
 return `<section class="card quick-lead" aria-labelledby="${id}-title"><div class="quick-lead-copy"><span class="quick-lead-icon">${icon('people')}</span><div><h2 id="${id}-title">Nuevo interesado</h2><p class="subtext">Guardá solo el número. El nombre y la moto los podés completar después.</p></div></div><form data-form="quick-lead" data-scope="${scope}" class="quick-lead-form"><div class="field"><label for="${id}-phone">Número del cliente</label><input id="${id}-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="50" placeholder="7000 0000" aria-describedby="${id}-hint ${id}-error" required><small id="${id}-hint">El Salvador: 8 dígitos. Otro país: + y código de país.</small></div><button type="submit" class="btn btn-primary">+ Añadir interesado</button><p id="${id}-error" class="quick-lead-error" data-quick-lead-error role="alert" hidden></p></form><div data-quick-lead-feedback>${quickLeadFeedback()}</div></section>`;
}
function quickLeadFeedback(){const c=quickLeadResult&&client(quickLeadResult.id);return c?`<div class="quick-lead-result" role="status"><div><strong>${quickLeadResult.created?'Guardado en Interesados':'Este número ya tiene ficha'}</strong><span>${esc(leadPhoneLabel(c.phone))} · ${esc(c.stage)}${c.archived?' · Archivado':''}</span></div><div class="row-actions">${button('Ver ficha','view-client',c.id)}${button(c.namePending?'Agregar nombre':'Editar ficha','edit-client',c.id)}</div></div>`:'';}
function openQuickLead(){openModal('Nuevo interesado',quickLeadPanel('modal'));$('quick-lead-modal-phone').focus();}
const submitBeforeQuickLead=submitRecord;
submitRecord=function(form){
 if(form.dataset.form!=='quick-lead')return submitBeforeQuickLead(form);
 const error=form.querySelector('[data-quick-lead-error]');if(error){error.hidden=true;error.textContent='';}
 try{
  const result=prepareQuickLead(db,new FormData(form).get('phone'));
  if(result.created&&!commit(result.data,'Nuevo interesado guardado.'))return;
  quickLeadResult={id:result.clientId,created:result.created};const c=client(result.clientId),fromModal=Boolean(form.closest('dialog'));
  if(result.created){
   if(ui.route==='clientes'){ui.clientSearch='';ui.clientMonth=recordDate(c).slice(0,7);ui.clientStage='';ui.clientArchive='active';}
   if(ui.route==='oficina'){officeUI.search='';officeUI.period='';officeUI.room='interesado';officeUI.selected=c.id;officeUI.listPage=0;officeUI.page=Math.floor(officeData().filter(x=>officeRoom(x.stage)==='interesado').findIndex(x=>x.id===c.id)/9);}
   form.reset();
  }
  render();
  if(fromModal)$('modal').close();
  if(!result.created||fromModal){viewClient(c.id);if(!result.created)toast('Ese número ya está registrado. Se abrió su ficha existente.');}
  else $('quick-lead-'+form.dataset.scope+'-phone')?.focus();
 }catch(err){if(error){error.textContent=err.message;error.hidden=false;}else toast(err.message,true);}
};
