// Descuentos de ley de la planilla (El Salvador): AFP 7,25 %, ISSS 3 % (tope de $1,000 al mes) y retención de renta.
// Como en las boletas: el día 15 se descuenta sobre esa quincena; a fin de mes se calcula todo el mes y se resta lo del 15.
// Verificado con las boletas de Daniel: 15 → AFP 14.82, ISSS 6.13, renta 0.00; fin de mes → AFP 35.58, ISSS 14.73, renta 25.07.
const LEY={afp:.0725,isss:.03,isssTopeMes:1000,
 // Tabla de retención mensual (reforma 2025: exento hasta $550). La quincenal es la mitad de cada valor.
 renta:[{desde:0,hasta:550,pct:0,exceso:0,fija:0},{desde:550.01,hasta:895.24,pct:.10,exceso:550,fija:17.67},{desde:895.25,hasta:2038.10,pct:.20,exceso:895.24,fija:60},{desde:2038.11,hasta:Infinity,pct:.30,exceso:2038.10,fija:288.57}]};
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
function rentaRetencion(base,factor=1){
 // factor 1 = tabla mensual; 0,5 = tabla quincenal
 const t=LEY.renta.find(x=>base<=x.hasta*factor+1e-9)||LEY.renta.at(-1);
 return t.pct?r2((base-t.exceso*factor)*t.pct+t.fija*factor):0;
}
function payrollDeductions(q1Gross,q2Gross,advances={}){
 const afp1=r2(q1Gross*LEY.afp),isss1=r2(Math.min(q1Gross,LEY.isssTopeMes)*LEY.isss);
 const renta1=rentaRetencion(Math.max(0,q1Gross-afp1-isss1),.5);
 const month=q1Gross+q2Gross,afpM=r2(month*LEY.afp),isssM=r2(Math.min(month,LEY.isssTopeMes)*LEY.isss);
 const rentaM=rentaRetencion(Math.max(0,month-afpM-isssM),1);
 const q1={gross:r2(q1Gross),afp:afp1,isss:isss1,renta:renta1,advance:r2(Number(advances.q1)||0)};
 const q2={gross:r2(q2Gross),afp:r2(afpM-afp1),isss:r2(isssM-isss1),renta:Math.max(0,r2(rentaM-renta1)),advance:r2(Number(advances.q2)||0)};
 for(const q of [q1,q2]){q.total=r2(q.afp+q.isss+q.renta+q.advance);q.net=r2(q.gross-q.total);}
 return {q1,q2,month:{gross:r2(month),afp:afpM,isss:isssM,renta:rentaM,base:r2(month-afpM-isssM)}};
}
function deductionsCard(period){
 const t=monthlyTotals(db,period),p=t.plan,base=p.basePerFortnight;
 const unknown=t.commissionCents===null,commission=unknown?0:fromCents(t.commissionCents);
 const two=p.fortnights===2,d=payrollDeductions(two?base:0,(two?base:base)+commission,{q1:p.advanceQ1,q2:p.advanceQ2});
 const col=(q,key,label)=>`<td>${q?money(q[key]):'—'}</td>`;
 const row=(label,key,cls='')=>`<tr class="${cls}"><th scope="row">${label}</th>${two?col(d.q1,key):''}${col(d.q2,key)}</tr>`;
 const adv=(q,name,val)=>`<td><label class="sr-only" for="adv-${name}">Anticipo ${q}</label><input id="adv-${name}" class="advance-input" type="number" inputmode="decimal" min="0" step="0.01" data-advance="${name}" data-month="${esc(period)}" value="${val?esc(val):''}" placeholder="0.00"></td>`;
 return `<div class="card deductions-card" style="margin-top:22px"><div class="card-head"><div><h2>Lo que te descuentan</h2><p class="subtext" style="margin-top:5px">${esc(monthLabel(period))} · AFP, ISSS y renta como en tu boleta</p></div>${badge('Neto del mes: '+money(r2((two?d.q1.net:0)+d.q2.net)),'green')}</div>
 <div class="table-wrap"><table class="deductions-table"><thead><tr><th></th>${two?'<th>Quincena del 15</th>':''}<th>Fin de mes${unknown?' (sin comisión)':''}</th></tr></thead><tbody>
 ${row('Ingresos','gross','strong-row')}${row('Fondo de pensiones (AFP 7.25 %)','afp')}${row('Cuota laboral ISSS (3 %)','isss')}${row('Retención ISR (renta)','renta')}
 <tr><th scope="row">Anticipo de sueldo (CXC)</th>${two?adv('del 15','advanceQ1',p.advanceQ1):''}${adv('de fin de mes','advanceQ2',p.advanceQ2)}</tr>
 ${row('Total deducciones','total','strong-row')}${row('Neto a pagar','net','net-row')}</tbody></table></div>
 <p class="subtext" style="padding:14px 20px 18px">El día 15 se descuenta sobre el sueldo de esa quincena. A fin de mes se calcula el mes completo (${money(d.month.gross)}) y se resta lo del 15: AFP ${money(d.month.afp)}, ISSS ${money(d.month.isss)} (tope de $1,000 al mes) y renta ${money(d.month.renta)} con la tabla mensual (exento hasta $550; 10 % sobre el exceso de $550 + $17.67, y así cada tramo). Base para la renta: ${money(d.month.base)}. El anticipo lo escribís vos si pediste adelanto.${unknown?' La comisión de este mes no está definida en el esquema: el fin de mes muestra solo el sueldo.':''}</p></div>`;
}
payrollCard=(base=>function(period){return base(period)+deductionsCard(period);})(payrollCard);
// Anticipos: se guardan en el esquema del mes
document.addEventListener('change',e=>{
 const el=e.target;if(!el.matches?.('[data-advance]'))return;
 const period=el.dataset.month,key=el.dataset.advance,raw=el.value.trim(),val=raw===''?0:Number(raw);
 if(!Number.isFinite(val)||val<0){toast('Revisá el monto del anticipo.',true);return;}
 const next=clone(db);let plan=next.payrollPlans.find(p=>p.month===period);
 if(!plan){plan=defaultPayroll(period);next.payrollPlans.push(plan);}
 plan[key]=r2(val);
 if(commit(next,'Anticipo guardado para '+monthLabel(period)+'.'))renderReports();
});
