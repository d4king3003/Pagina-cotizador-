// Office view: one shared database with Clientes, cotizaciones and monthly sales.
const OFFICE_ROOMS=[
 {id:'interesado',name:'Interesados',color:'#8b9fc3',stage:'Nuevo'},
 {id:'cotizado',name:'Seguimiento',color:'#c4a36b',stage:'En seguimiento'},
 {id:'evaluacion',name:'En evaluación',color:'#a291bd',stage:'Credito ingresado'},
 {id:'aprobado',name:'Aprobados',color:'#70a992',stage:'Aprobado'},
 {id:'vendido',name:'Vendidos',color:'#d68f96',stage:'Vendido'},
 {id:'descartado',name:'Descartados',color:'#a0a8aa',stage:'No continuó'}
];
// La oficina abre en el mes actual; "Todos los meses" quita el filtro.
const officeUI={selected:'',room:'',period:month(),search:'',view:'scene',page:0,listPage:0,party:true};
let officeScene=null,officeFailed=false;
function officeRoom(stage){
 if(stage==='Vendido')return 'vendido';
 if(stage==='No continuó')return 'descartado';
 if(stage==='Aprobado')return 'aprobado';
 if(['Documentos','Credito ingresado','Preaprobado'].includes(stage))return 'evaluacion';
 return stage==='En seguimiento'?'cotizado':'interesado';
}
function officeTransition(data,id,target,values){
 if(!STAGES.includes(target))throw Error('Elegí una etapa válida.');
 const next=clone(data),c=next.clients.find(c=>c.id===id);
 if(!c||c.archived)throw Error('El cliente ya no está activo en esta oficina.');
 const previous=c.stage,linked=clientSale(c,next);
 if(target==='Vendido'){
  if(!values)throw Error('Completá moto, precio y fecha para registrar la venta.');
  if(!next.stock.some(s=>s.id===values.stockId))throw Error('Seleccioná la moto vendida.');
  const price=Number(values.price);
  if(!Number.isFinite(price)||price<=0||price>1e10||!validISODate(values.date))throw Error('Revisá el precio y la fecha de venta.');
  Object.assign(c,{stockId:values.stockId,price,recordDate:values.date});
 }
 c.stage=target;
 reconcileClientSale(next,c);
 // Legacy linked sales may predate managedByClient. A move must still update
 // that same sale rather than leave it counted after returning to an earlier room.
 if(previous==='Vendido'&&target!=='Vendido'&&linked){linked.status='Anulada';linked.managedByClient=true;}
 eventFor(c,'Oficina virtual: '+previous+' → '+target+(target==='Vendido'?' · '+money(c.price)+' · '+c.recordDate:''));
 return next;
}
// Atención: seguimiento vencido o para hoy, y días sin actividad (solo clientes activos).
const OFFICE_IDLE_WARN=7,OFFICE_IDLE_HIGH=14;
function officeAttention(c){
 const active=!['Vendido','No continuó'].includes(c.stage);if(!active)return {due:false,overdue:false,idle:null};
 const now=today(),due=!!c.nextFollow&&c.nextFollow<=now,overdue=due&&c.nextFollow<now;
 const dates=[c.createdAt,c.recordDate,...(c.history||[]).map(h=>h.at)].filter(Boolean).map(d=>String(d).slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
 const last=dates.at(-1),idle=last?Math.max(0,Math.round((Date.parse(now+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/864e5)):null;
 return {due,overdue,idle};
}
function officeAttentionText(a,c){
 const parts=[];if(a.due)parts.push(a.overdue?'Contactar: seguimiento vencido ('+fmtDate(c.nextFollow)+')':'Contactar hoy');
 if(a.idle!==null&&a.idle>=OFFICE_IDLE_WARN)parts.push(a.idle+' días sin actividad');return parts.join(' · ');
}
function officeData(){
 const query=officeUI.search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 return db.clients.filter(c=>!c.archived&&(!officeUI.period||recordDate(c).slice(0,7)===officeUI.period)&&(!query||[c.name,c.phone,stock(c.stockId)?.label||''].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)));
}
function officeSelect(id){
 const c=client(id);if(!c)return;
 officeUI.selected=id;
 if(officeUI.room&&officeUI.room!==officeRoom(c.stage))officeUI.room=officeRoom(c.stage);
 const group=officeData().filter(x=>officeRoom(x.stage)===officeRoom(c.stage));
 officeUI.page=Math.max(0,Math.floor(group.findIndex(x=>x.id===id)/8));
 renderOffice();
}
function officeFilter(room){officeUI.room=officeUI.room===room?'':room;officeUI.page=0;officeUI.listPage=0;renderOffice();}
function officeMove(id,room){
 const c=client(id),target=OFFICE_ROOMS.find(r=>r.id===room);if(!c||!target||officeRoom(c.stage)===room)return;
 officeChangeStage(id,target.stage);
}
function officeChangeStage(id,target){
 const c=client(id);if(!c||c.stage===target)return;
 officeUI.selected=id;
 if(target==='Vendido'){
  const sale=clientSale(c),price=clientPrice(c)??stock(c.stockId)?.price??'';
  formModal('Registrar venta · '+c.name,'office-sale',
   '<div class="field full"><p class="subtext">Completá los datos de la venta. Se guardará en la ficha del cliente y en el mes correspondiente de Ventas y comisiones.</p></div>'+
   selectField('Moto vendida *','stockId',stockOptions(c.stockId,'Seleccioná la moto'))+
   field('Precio real de venta · USD *','price','number',price,false,true)+
   field('Fecha de venta *','date','date',sale?.date||today(),false,true),id);
  $('record-form').dataset.revision=String(db.revision);
  $('f-stockId').required=true;$('f-price').min='0.01';
  return;
 }
 try{
  const next=officeTransition(db,id,target);
  const oldRoom=officeUI.room;if(oldRoom)officeUI.room=officeRoom(target);
  if(!commit(next,'Cliente movido a '+target+'. Ventas y comisiones actualizadas.')){officeUI.room=oldRoom;renderOffice();}
 }catch(error){toast(error.message,true);renderOffice();}
}
function officeVisibility(){
 officeScene?.setActive(ui.route==='oficina'&&officeUI.view==='scene'&&!officeFailed);
}
function officeScaffold(){
 $('view-oficina').innerHTML=heading('Tu oficina, en movimiento.','Cada personaje es un cliente. Arrastralo a otra sala para actualizar su etapa.',button('+ Nuevo cliente','new-client','',true),'TVS ROOSEVELT · OFICINA VIRTUAL')+quickLeadPanel('oficina')+
 '<div id="office-metrics" class="metrics"></div><div class="card office-workspace">'+
 '<div class="office-top"><div><span class="office-live-dot"></span><strong>La oficina de Daniel</strong><span class="badge" id="office-view-status">3D interactivo</span></div><div class="tabs" role="group" aria-label="Vista de la oficina"><button data-action="office-view" data-id="scene" id="office-scene-tab">Oficina</button><button data-action="office-view" data-id="list" id="office-list-tab">Lista</button></div></div>'+
 '<div class="office-filters"><div class="field"><label for="office-search">Buscar cliente o moto</label><input id="office-search" type="search" maxlength="150" placeholder="Nombre, teléfono o modelo"></div><div class="field"><label for="office-month">Mes del registro / venta</label><input id="office-month" type="month"></div><button class="btn" data-action="office-all-months">Todos los meses</button><button class="btn office-party" data-action="office-party" id="office-party-button">Fiesta de vendidos</button></div>'+
 '<div class="office-body"><div class="office-main"><div id="office-scene-area"><p class="office-hint">Sujetá un personaje y soltalo en otra sala. Arrastrá el piso para girar la oficina. <span class="office-key"><b class="office-key-alert">!</b> contactar hoy</span><span class="office-key"><b class="office-key-age">7 d</b> días sin actividad</span></p><div id="office-scene" class="office-3d" role="group" aria-label="Oficina virtual 3D con seis salas, personajes y cementerio"></div><div class="office-pagination" id="office-scene-pagination"></div></div>'+
 '<div id="office-list-area" hidden><div class="table-wrap" id="office-table"></div><div class="office-pagination" id="office-list-pagination"></div></div><div id="office-legend" class="office-legend"></div><p id="office-empty" class="office-empty" hidden>No hay clientes con estos filtros.</p><p class="office-footnote">En evaluación reúne Documentos, Crédito ingresado y Preaprobado. El estado exacto se conserva en cada ficha. Descartados corresponde a No continuó.</p></div><aside id="office-detail" class="office-detail" aria-label="Cliente seleccionado"></aside></div></div>';
 $('office-scene').addEventListener('office-context-lost',()=>{officeFailed=true;officeUI.view='list';renderOffice();toast('Se pausó el 3D. Podés seguir trabajando desde Lista.',true);});
}
function renderOffice(){
 if(!$('office-search'))officeScaffold();
 const quickFeedback=$('view-oficina').querySelector('[data-quick-lead-feedback]');if(quickFeedback)quickFeedback.innerHTML=quickLeadFeedback();
 const rows=officeData(),visible=rows.filter(c=>!officeUI.room||officeRoom(c.stage)===officeUI.room);
 if(officeUI.selected&&!db.clients.some(c=>c.id===officeUI.selected&&!c.archived))officeUI.selected='';
 $('office-search').value=officeUI.search;$('office-month').value=officeUI.period;
 $('office-metrics').innerHTML=metric('Clientes en oficina',rows.length,'Con los filtros actuales','people')+metric('En proceso',rows.filter(c=>!['Vendido','No continuó'].includes(c.stage)).length,'Consultas y evaluaciones','clock')+metric('Aprobados',rows.filter(c=>c.stage==='Aprobado').length,'Listos para el siguiente paso','check')+metric('Vendidos',rows.filter(c=>c.stage==='Vendido').length,'Vinculados al control de ventas','bike');
 $('office-party-button').setAttribute('aria-pressed',String(officeUI.party));
 $('office-party-button').textContent=officeUI.party?'♫ Pausar fiesta de vendidos':'♫ Fiesta de vendidos';
 $('office-legend').innerHTML='<button class="btn btn-small" data-action="office-filter" data-id="" aria-pressed="'+(!officeUI.room)+'">Todas las salas</button>'+OFFICE_ROOMS.map(r=>'<button class="btn btn-small" data-action="office-filter" data-id="'+r.id+'" aria-pressed="'+(officeUI.room===r.id)+'"><i style="background:'+r.color+'"></i>'+r.name+' <b>'+rows.filter(c=>officeRoom(c.stage)===r.id).length+'</b></button>').join('');
 $('office-empty').hidden=visible.length>0;
 const pages=Math.max(1,...OFFICE_ROOMS.filter(r=>!officeUI.room||r.id===officeUI.room).map(r=>Math.ceil(rows.filter(c=>officeRoom(c.stage)===r.id).length/8)));
 officeUI.page=Math.min(officeUI.page,pages-1);
 $('office-scene-pagination').innerHTML=pages>1?'<button class="btn btn-small" data-action="office-page" data-id="-1" '+(officeUI.page===0?'disabled':'')+'>← Anterior</button><span>Página '+(officeUI.page+1)+' de '+pages+' · hasta 8 personajes por sala</span><button class="btn btn-small" data-action="office-page" data-id="1" '+(officeUI.page===pages-1?'disabled':'')+'>Siguiente →</button>':'';
 if(!officeScene&&!officeFailed&&officeUI.view==='scene'){
  try{officeScene=new globalThis.TVSOfficeScene($('office-scene'),{onSelect:officeSelect,onFilter:officeFilter,onMove:officeMove});}
  catch(error){console.warn('La oficina 3D no pudo iniciar:',error.message);officeFailed=true;officeUI.view='list';$('office-scene').dataset.renderer='unavailable';toast('No se pudo activar el 3D en este equipo. La vista Lista está disponible.',true);}
 }
 officeScene?.update({clients:rows.map(c=>{const a=officeAttention(c);return {id:c.id,name:c.name,model:stock(c.stockId)?.label||'Moto por definir',stage:officeRoom(c.stage),color:parseInt(shortHash(c.id),16)%12,due:a.due,overdue:a.overdue,idle:a.idle,attention:officeAttentionText(a,c)};}),stages:OFFICE_ROOMS,selected:officeUI.selected,filter:officeUI.room||null,party:officeUI.party,page:officeUI.page});
 const listPages=Math.max(1,Math.ceil(visible.length/30));officeUI.listPage=Math.min(officeUI.listPage,listPages-1);
 const list=visible.slice(officeUI.listPage*30,(officeUI.listPage+1)*30);
 $('office-table').innerHTML=list.length?'<table><thead><tr><th>Cliente</th><th>Moto</th><th>Estado exacto</th><th>Seguimiento</th><th></th></tr></thead><tbody>'+list.map(c=>'<tr><td><strong>'+esc(c.name)+'</strong><small>'+esc(phoneLabel(c.phone)||'Sin teléfono')+'</small></td><td>'+esc(stock(c.stockId)?.label||'Por definir')+'</td><td>'+stageBadge(c.stage)+'</td><td>'+(()=>{const a=officeAttention(c);return (a.due?badge(a.overdue?'Vencido · '+fmtDate(c.nextFollow):'Contactar hoy','red'):esc(c.nextFollow?fmtDate(c.nextFollow):'Sin programar'))+(a.idle!==null&&a.idle>=OFFICE_IDLE_WARN?'<small>'+a.idle+' días sin actividad</small>':'');})()+'</td><td><button class="btn btn-small" data-action="office-select" data-id="'+c.id+'">Seleccionar</button></td></tr>').join('')+'</tbody></table>':empty('Sin clientes en esta sala','Cambiá el filtro o agregá un cliente.');
 $('office-list-pagination').innerHTML=listPages>1?'<button class="btn btn-small" data-action="office-list-page" data-id="-1" '+(officeUI.listPage===0?'disabled':'')+'>← Anterior</button><span>'+visible.length+' clientes · página '+(officeUI.listPage+1)+' de '+listPages+'</span><button class="btn btn-small" data-action="office-list-page" data-id="1" '+(officeUI.listPage===listPages-1?'disabled':'')+'>Siguiente →</button>':'';
 $('office-scene-area').hidden=officeUI.view!=='scene';$('office-list-area').hidden=officeUI.view!=='list';
 $('office-scene-tab').setAttribute('aria-pressed',String(officeUI.view==='scene'));$('office-list-tab').setAttribute('aria-pressed',String(officeUI.view==='list'));
 $('office-scene-tab').disabled=officeFailed;
 $('office-party-button').disabled=officeFailed;
 $('office-view-status').textContent=officeFailed?'Vista Lista':'3D interactivo';
 renderOfficeDetail();officeVisibility();
}
function renderOfficeDetail(){
 const c=client(officeUI.selected),root=$('office-detail');
 if(!c||c.archived){root.innerHTML='<div class="office-selection-empty"><div class="office-diamond">◆</div><h2>Una historia por acompañar</h2><p>Seleccioná un personaje o una tumba para ver su ficha, cotizar o cambiar su etapa.</p><p>Solo los clientes de Vendidos celebran. Podés reactivar a los descartados moviéndolos a otra sala.</p></div>';return;}
 const quotes=db.quotes.filter(q=>q.clientId===c.id),latest=quotes.at(-1),room=OFFICE_ROOMS.find(r=>r.id===officeRoom(c.stage));
 root.innerHTML='<p class="eyebrow">'+(c.stage==='No continuó'?'OPORTUNIDAD EN PAUSA':'CLIENTE SELECCIONADO')+'</p><div class="office-person"><span class="avatar" style="background:'+room.color+'22;color:'+room.color+'">'+(c.stage==='No continuó'?'🪦':esc(initials(c.name)))+'</span><div><h2>'+esc(c.name)+'</h2>'+stageBadge(c.stage)+'</div></div><p class="office-detail-model">'+esc(stock(c.stockId)?.label||'Moto por definir')+'</p><dl class="office-info"><div><dt>Teléfono</dt><dd>'+esc(phoneLabel(c.phone)||'Sin registrar')+'</dd></div><div><dt>Próximo contacto</dt><dd>'+esc(c.nextFollow?fmtDate(c.nextFollow):'Sin programar')+'</dd></div><div><dt>Precio registrado</dt><dd>'+(clientPrice(c)==null?'Por definir':money(clientPrice(c)))+'</dd></div><div><dt>Cotizaciones</dt><dd>'+quotes.length+'</dd></div></dl><div class="field"><label for="office-stage-select">Cambiar etapa</label><select id="office-stage-select" data-id="'+c.id+'">'+options(STAGES,c.stage)+'</select></div><div class="office-detail-actions">'+button('Ver ficha','view-client',c.id)+button('Cotizar','quote-client',c.id,true)+'<button class="btn btn-whatsapp" data-action="whatsapp-client" data-id="'+esc(c.id)+'">'+WA_ICON+'WhatsApp</button>'+button('Editar datos','edit-client',c.id)+'</div>'+(latest?'<button class="text-button" data-action="view-quote" data-id="'+latest.id+'">Ver última cotización →</button>':'')+(c.notes?'<p class="section-label">Notas</p><p class="office-notes">'+esc(c.notes)+'</p>':'')+'<p class="section-label">Último movimiento</p><p class="subtext">'+esc(c.history?.[0]?.text||'Sin movimientos registrados.')+'</p>';
}
const officeSubmitBase=submitRecord;
submitRecord=function(form){
 if(form.dataset.form!=='office-sale')return officeSubmitBase(form);
 try{
  if(Number(form.dataset.revision)!==db.revision)throw Error('La ficha cambió mientras completabas la venta. Cerrá esta ventana y revisá los datos antes de continuar.');
  const values=new FormData(form),id=form.dataset.id,next=officeTransition(db,id,'Vendido',{stockId:String(values.get('stockId')||''),price:String(values.get('price')||''),date:String(values.get('date')||'')});
  const oldRoom=officeUI.room;if(oldRoom)officeUI.room='vendido';
  if(commit(next,'Venta registrada. La ficha y las comisiones ya están actualizadas.'))$('modal').close();else officeUI.room=oldRoom;
 }catch(error){formError(error.message);}
};
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id||'';
 if(action==='office-select')officeSelect(id);
 else if(action==='office-filter')officeFilter(id);
 else if(action==='office-view'){officeUI.view=id==='list'?'list':'scene';renderOffice();}
 else if(action==='office-party'){officeUI.party=!officeUI.party;renderOffice();}
 else if(action==='office-all-months'){officeUI.period='';officeUI.page=0;officeUI.listPage=0;renderOffice();}
 else if(action==='office-page'){officeUI.page=Math.max(0,officeUI.page+Number(id));renderOffice();}
 else if(action==='office-list-page'){officeUI.listPage=Math.max(0,officeUI.listPage+Number(id));renderOffice();}
});
document.addEventListener('input',event=>{if(event.target.id==='office-search'){officeUI.search=event.target.value;officeUI.page=0;officeUI.listPage=0;renderOffice();}});
document.addEventListener('change',event=>{
 if(event.target.id==='office-month'){officeUI.period=event.target.value;officeUI.page=0;officeUI.listPage=0;renderOffice();}
 else if(event.target.id==='office-stage-select'){officeChangeStage(event.target.dataset.id,event.target.value);renderOfficeDetail();}
});
