const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),backup=JSON.parse(fs.readFileSync(path.join(root,'data/initial-backup.json'),'utf8'));
function harness(saved){
 const nodes=new Map(),storage=new Map();if(saved)storage.set('tvs-daniel-panel-v1',JSON.stringify(saved));
 const element=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:'',hidden:false,dataset:{},style:{},addEventListener(){},append(){},focus(){},close(){this.open=false;},showModal(){this.open=true;},scrollIntoView(){},setAttribute(){},insertAdjacentHTML(_,html){this.innerHTML+=html;},classList:{toggle(){},add(){},remove(){}},querySelector(){return null;},querySelectorAll(){return [];}});return nodes.get(id);};
 const ctx={console,Intl,Date,Math,JSON,Number,String,Uint8Array,TextEncoder,TextDecoder,Blob,atob,btoa,crypto:require('crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},FormData:class{constructor(f){this.data=f.values;}get(k){return this.data[k]??null;}has(k){return Object.hasOwn(this.data,k);}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:element,documentElement:{dataset:{}},body:element('body'),addEventListener(){},createElement:()=>element('new-'+Math.random())},window:{addEventListener(){},scrollTo(){}},location:{hash:'#resumen'}};
 let source=fs.readFileSync(path.join(root,'qa/app-compiled.js'),'utf8'),cut=source.lastIndexOf('\ninitializeMonthlyData();');assert.ok(cut>0);
 source=source.slice(0,cut)+`;globalThis.t={INITIAL_BACKUP,freshDB,validateDB,loadDB,initializeMonthlyData,normalizeLeadPhone,phoneKey,prepareQuickLead,officeRoom,monthlyTotals,submitRecord,confirmDeleteClient,deleteClientConfirmed,removeClientRecord,linkedClientRecords,renderClients,ui,officeUI,setDB:v=>db=v,getDB:()=>db};})();`;
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.t.officeUI.view='list';return {t:ctx.t,element,storage};
}
const {t,element,storage}=harness(),clone=v=>JSON.parse(JSON.stringify(v));
assert.equal(JSON.stringify(t.INITIAL_BACKUP),JSON.stringify(backup),'Embedded backup matches the uploaded JSON');
assert.equal(JSON.stringify(t.getDB().clients),JSON.stringify(backup.clients));
assert.equal(JSON.stringify(t.getDB().quotes),JSON.stringify(backup.quotes));
assert.equal(JSON.stringify(t.getDB().sales),JSON.stringify(backup.sales));
assert.ok(t.validateDB(t.getDB()));assert.equal(t.getDB().clients.length,13);assert.equal(t.ui.clientMonth,'2026-10');
const initial=JSON.stringify(t.getDB());t.initializeMonthlyData();assert.equal(JSON.stringify(t.getDB()),initial,'Old LEADS batch does not overwrite the newer backup');
for(const input of ['7000 0001','7000-0001','50370000001','+503 7000 0001','00503 7000 0001'])assert.equal(t.normalizeLeadPhone(input),'+50370000001');
assert.equal(t.normalizeLeadPhone('+1 (202) 555-0123'),'+12025550123');
for(const input of ['', 'abc70000001','7000000','700000001','+5037000001','00000000','70000001,70000002','++50370000001','+1234567890123456'])assert.throws(()=>t.normalizeLeadPhone(input));
const result=t.prepareQuickLead(t.getDB(),'7000 0001');assert.ok(result.created);assert.equal(JSON.stringify(t.getDB()),initial);
const lead=result.data.clients.find(c=>c.id===result.clientId);assert.equal(lead.stage,'Nuevo');assert.equal(lead.namePending,true);assert.equal(lead.stockId,'');assert.equal(lead.price,null);assert.equal(t.officeRoom(lead.stage),'interesado');assert.ok(t.validateDB(result.data));
for(const input of ['70000001','+50370000001','0050370000001']){const r=t.prepareQuickLead(result.data,input);assert.equal(r.created,false);assert.equal(r.clientId,lead.id);assert.equal(r.data,result.data);}
for(const c of backup.clients){const r=t.prepareQuickLead(t.getDB(),c.phone);assert.equal(r.created,false);assert.equal(r.clientId,c.id);assert.equal(JSON.stringify(r.data),initial);}
const archived=clone(result.data);archived.clients.at(-1).archived=true;archived.clients.at(-1).stage='No continuó';const existing=t.prepareQuickLead(archived,'70000001');assert.equal(existing.created,false);assert.equal(existing.data.clients.at(-1).archived,true);assert.equal(existing.data.clients.at(-1).stage,'No continuó');
storage.set('tvs-daniel-panel-v1',JSON.stringify(t.getDB()));t.ui.route='clientes';t.ui.clientMonth='2026-09';t.ui.clientStage='Vendido';t.ui.clientSearch='sin coincidencias';t.ui.clientArchive='archived';
const error={hidden:true,textContent:''},form={dataset:{form:'quick-lead',scope:'clientes'},values:{phone:'70000001'},querySelector:()=>error,closest:()=>null,reset(){this.values.phone='';}};
t.submitRecord(form);assert.equal(error.hidden,true);assert.equal(t.getDB().clients.length,14);assert.equal(t.getDB().sales.length,backup.sales.length);assert.equal(t.ui.clientStage,'');assert.equal(t.ui.clientSearch,'');assert.equal(t.ui.clientArchive,'active');assert.equal(form.values.phone,'');
let savedLead=t.getDB().clients.at(-1);assert.ok(element('view-clientes').innerHTML.includes('Añadir interesado'));assert.ok(element('view-clientes').innerHTML.includes(savedLead.id));
let revision=t.getDB().revision;form.values.phone='+503 7000 0001';t.submitRecord(form);assert.equal(t.getDB().clients.length,14);assert.equal(t.getDB().revision,revision);assert.equal(element('modal').open,true);
const clientForm={dataset:{form:'client',id:savedLead.id},values:{...savedLead,name:'',price:'',notes:'Seguimiento de prueba'}};
t.submitRecord(clientForm);assert.equal(t.getDB().clients.at(-1).namePending,true);assert.equal(t.getDB().clients.at(-1).notes,'Seguimiento de prueba');
clientForm.values.name='Cliente de prueba';t.submitRecord(clientForm);savedLead=t.getDB().clients.at(-1);assert.equal(savedLead.name,'Cliente de prueba');assert.equal(savedLead.namePending,false);assert.equal(t.getDB().clients.length,14);
assert.equal(t.validateDB(JSON.parse(JSON.stringify(t.getDB()))).clients.at(-1).name,'Cliente de prueba');
form.values.phone='numero incorrecto';const beforeInvalid=JSON.stringify(t.getDB());t.submitRecord(form);assert.equal(error.hidden,false);assert.equal(JSON.stringify(t.getDB()),beforeInvalid);
const sold=t.getDB().clients.find(c=>c.stage==='Vendido'),beforeDelete=JSON.stringify(t.getDB());
t.confirmDeleteClient(sold.id);assert.equal(JSON.stringify(t.getDB()),beforeDelete,'Opening confirmation does not delete');assert.ok(element('modal').innerHTML.includes('Sí, borrar registro'));assert.ok(element('modal').innerHTML.includes('comisiones'));element('modal').close();assert.equal(JSON.stringify(t.getDB()),beforeDelete,'Cancel preserves the data');
t.deleteClientConfirmed(sold.id,t.getDB().revision-1);assert.equal(JSON.stringify(t.getDB()),beforeDelete,'A stale confirmation is rejected');
const original=clone(t.getDB()),linked=t.linkedClientRecords(original,sold.id),removed=t.removeClientRecord(original,sold.id);assert.equal(JSON.stringify(original),beforeDelete);
for(const list of ['clients','quotes','requests','sales','postSales'])assert.equal(JSON.stringify(removed[list]),JSON.stringify(original[list].filter(x=>list==='clients'?x.id!==sold.id:x.clientId!==sold.id)));
assert.ok(t.validateDB(removed));assert.throws(()=>t.removeClientRecord(removed,sold.id));
const period=sold.recordDate.slice(0,7),totals=t.monthlyTotals(original,period),impact=linked.sales.filter(s=>s.status!=='Anulada'&&s.date.startsWith(period));
assert.equal(t.monthlyTotals(removed,period).units,totals.units-impact.length);assert.equal(t.monthlyTotals(removed,period).revenueCents,totals.revenueCents-impact.reduce((n,s)=>n+Math.round(s.amount*100),0));
t.ui.quoteClientId=sold.id;t.ui.messageClientId=sold.id;t.officeUI.selected=sold.id;t.deleteClientConfirmed(sold.id,t.getDB().revision);assert.equal(t.getDB().clients.length,13);assert.equal(t.ui.quoteClientId,'');assert.equal(t.ui.messageClientId,'');assert.equal(t.officeUI.selected,'');assert.equal(element('modal').open,false);assert.ok(storage.has('tvs-daniel-panel-v1.anterior'));
const own=t.freshDB();own.revision=9;own.clients=[clone(savedLead)];const existingStorage=harness(own);assert.equal(existingStorage.t.getDB().clients.length,1);assert.equal(existingStorage.t.getDB().revision,9);existingStorage.t.initializeMonthlyData();assert.equal(existingStorage.t.getDB().clients.length,1);
const live=clone(t.getDB());live.revision++;storage.set('tvs-daniel-panel-v1',JSON.stringify(live));const another=t.getDB().clients[0];t.deleteClientConfirmed(another.id,t.getDB().revision);assert.equal(t.getDB().clients.length,live.clients.length,'Concurrent storage update does not lose a client');
const report={uploadedBackupPreserved:'passed',seedClients:13,phoneOnlyCreation:'passed',officeStage:'Interesados / Nuevo',countryCodeDeduplication:'passed',existingSoldAndArchivedPreserved:'passed',nameCompletionSameRecord:'passed',invalidPhoneRejected:'passed',confirmationAndCancellation:'passed',linkedRecordRemoval:'passed',monthlyTotalsAfterDeletion:'passed',staleConfirmationAndConcurrentStorage:'passed',existingLocalDataPreserved:'passed',jsonRoundtrip:'passed'};
fs.writeFileSync(path.join(root,'qa/client-actions-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
