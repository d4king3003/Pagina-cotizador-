function linkedClientRecords(data,id){
 return Object.fromEntries(['quotes','requests','sales','postSales'].map(list=>[list,data[list].filter(item=>item.clientId===id)]));
}
function removeClientRecord(data,id){
 if(!data.clients.some(c=>c.id===id))throw Error('Este cliente ya no existe.');
 const next=clone(data);next.clients=next.clients.filter(c=>c.id!==id);
 for(const list of ['quotes','requests','sales','postSales'])next[list]=next[list].filter(item=>item.clientId!==id);
 // Los datos de crédito se conservan sin vincular: pueden servir para otra gestión.
 for(const f of next.creditForms||[])if(f.clientId===id)f.clientId='';
 return next;
}
function confirmDeleteClient(id){
 const c=client(id);if(!c)return;const linked=linkedClientRecords(db,id),sales=linked.sales.filter(activeSale);
 openModal('Borrar registro de cliente',`<p>¿Querés borrar el registro de <strong>${esc(c.name)}</strong>?</p><p class="subtext">${esc(c.phone||'Sin teléfono')}</p><div class="notice danger" style="margin-top:18px">Se eliminará la ficha y desaparecerá su personaje de la oficina.</div><p class="subtext" style="margin-top:14px">Registros vinculados que también se eliminarán: ${linked.quotes.length} cotizaciones, ${linked.requests.length} solicitudes, ${linked.sales.length} ventas y ${linked.postSales.length} seguimientos de posventa.</p>${sales.length?`<p class="subtext" style="margin-top:12px">Las ${sales.length} ventas confirmadas de esta ficha dejarán de contar en sus meses. Los totales de ventas y comisiones se recalcularán.</p>`:''}<p class="subtext" style="margin-top:12px">Podés descargar una copia de tus datos antes de borrar.</p><p id="delete-client-error" class="form-error" role="alert" hidden></p>`,`<button class="btn" data-action="export-json">Descargar respaldo</button><button class="btn" data-close>Cancelar</button><button class="btn btn-danger" data-action="confirm-delete-client" data-id="${esc(id)}" data-revision="${db.revision}">Sí, borrar registro</button>`,620);
}
function deleteClientConfirmed(id,revision){
 const error=$('delete-client-error');
 try{
  if(Number(revision)!==db.revision)throw Error('Los datos cambiaron. Cerrá esta confirmación y revisá la ficha antes de borrar.');
  if(!commit(removeClientRecord(db,id),'Registro de cliente borrado.'))return;
  if(officeUI.selected===id)officeUI.selected='';
  if(quickLeadResult?.id===id)quickLeadResult=null;
  for(const field of ['quoteClientId','messageClientId'])if(ui[field]===id)ui[field]='';
  $('modal').close();render();
 }catch(err){if(error){error.textContent=err.message;error.hidden=false;}else toast(err.message,true);}
}
const settingsBeforeIncludedBackup=renderSettings;
renderSettings=function(){
 settingsBeforeIncludedBackup();if(!INITIAL_BACKUP||demo)return;
 $('view-ajustes').insertAdjacentHTML('beforeend',`<div class="card" style="margin-top:22px"><div class="card-head"><h2>Tu respaldo incluido · 3 de noviembre de 2026</h2></div><div class="card-body"><p class="subtext">Contiene ${INITIAL_BACKUP.clients.length} clientes y ${INITIAL_BACKUP.quotes.length} cotizaciones del archivo que proporcionaste. Se carga al abrir una copia sin datos guardados. Si ya tenés datos en este navegador, podés restaurarlo desde aquí.</p><div class="row-actions" style="margin-top:16px">${button('Restaurar respaldo incluido','restore-included-backup')}</div></div></div>`);
};
