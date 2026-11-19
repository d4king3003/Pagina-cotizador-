// Meta del mes (barra de avance con proyección) y gráficas de Ventas y comisiones.
// HTML y CSS, sin librerías: funciona sin internet. Un solo tono (azul TVS): el mes elegido
// en el tono fuerte y el resto en el tono claro del mismo color.

const chartCount=n=>new Intl.NumberFormat('es-SV').format(n);
const chartMoney=cents=>money(cents/100);
const shortMonth=p=>new Intl.DateTimeFormat('es-SV',{month:'short',timeZone:'UTC'}).format(new Date(p+'-01T12:00:00Z')).replace('.','');
function shiftMonth(period,delta){const [y,m]=period.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7);}
function daysInMonth(period){const [y,m]=period.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}

/* ---------- 5. Meta del mes ---------- */
function goalData(period){
 const t=monthlyTotals(db,period),target=Math.max(1,t.plan.targetUnits||15),units=t.units;
 let projection=null;
 if(period===month()){const day=Number(today().slice(8,10)),dim=daysInMonth(period);projection=day>0?Math.round(units/day*dim):units;}
 return {units,target,projection,period};
}
function goalCard(period,compact=false){
 const g=goalData(period),scale=Math.max(g.target,g.units,g.projection||0),pct=v=>Math.min(100,v/scale*100);
 const done=g.units>=g.target,share=Math.round(g.units/g.target*100);
 const status=done?`<span class="goal-status good">${icon('check')}Meta cumplida</span>`:`<span class="goal-status">Faltan ${g.target-g.units} ${g.target-g.units===1?'moto':'motos'}</span>`;
 const projText=g.projection===null?'':g.projection>g.units?`A este ritmo cerrarás <strong>${g.projection}</strong> motos este mes.`:`Proyección del mes: <strong>${g.projection}</strong> motos.`;
 const label=`Meta de ${monthLabel(period)}: ${g.units} de ${g.target} motos vendidas (${share}%).${g.projection!==null?' Proyección: '+g.projection+' motos.':''}`;
 return `<section class="card goal-card${compact?' compact':''}" aria-label="${esc(label)}">
  <div class="goal-head"><div><p class="goal-title">Meta de ${esc(monthLabel(period))}</p><p class="goal-figure"><strong>${g.units}</strong><span>de ${g.target} motos · ${share}%</span></p></div>${status}</div>
  <div class="goal-meter" role="img" aria-label="${esc(label)}">
   <div class="goal-track"></div>
   ${g.projection!==null&&g.projection>g.units?`<div class="goal-projection" style="left:${pct(g.units)}%;width:${pct(g.projection)-pct(g.units)}%"></div>`:''}
   <div class="goal-fill" style="width:${pct(g.units)}%"></div>
   <div class="goal-target" style="left:${pct(g.target)}%"><span>Meta ${g.target}</span></div>
  </div>
  ${projText?`<p class="goal-note">${projText}</p>`:''}
 </section>`;
}

/* ---------- 6. Gráficas ---------- */
function monthsChart(period){
 const periods=Array.from({length:6},(_,i)=>shiftMonth(period,i-5)),rows=periods.map(p=>{const t=monthlyTotals(db,p);return {p,units:t.units,cents:t.revenueCents};});
 const max=Math.max(1,...rows.map(r=>r.units));
 return `<div class="chart-card card"><div class="card-head"><h2>Ventas por mes</h2><span class="subtext">Motos vendidas · últimos 6 meses</span></div>
  <div class="col-chart" role="list">${rows.map(r=>`<div class="col-item${r.p===period?' current':''}" role="listitem" tabindex="0" aria-label="${esc(monthLabel(r.p))}: ${r.units} ${r.units===1?'moto':'motos'}, ${esc(chartMoney(r.cents))}">
   <span class="col-value">${r.units}</span><span class="col-bar" style="height:${r.units?Math.max(3,r.units/max*100):0}%"></span>
   <span class="col-label">${esc(shortMonth(r.p))}</span>
   <span class="chart-tip"><strong>${esc(monthLabel(r.p))}</strong>${r.units} ${r.units===1?'moto':'motos'} · ${esc(chartMoney(r.cents))}</span></div>`).join('')}</div></div>`;
}
function rankedRows(items,emptyText){
 if(!items.length)return `<p class="subtext chart-empty">${esc(emptyText)}</p>`;
 const max=Math.max(1,...items.map(i=>i.value));
 return `<div class="rank-chart" role="list">${items.map(i=>`<div class="rank-row" role="listitem" tabindex="0" aria-label="${esc(i.name)}: ${esc(i.tip)}"><span class="rank-name">${esc(i.name)}</span><span class="rank-track"><span class="rank-bar" style="--v:${(i.value/max).toFixed(4)}"></span><span class="rank-value">${esc(i.label)}</span></span><span class="chart-tip"><strong>${esc(i.name)}</strong>${esc(i.tip)}</span></div>`).join('')}</div>`;
}
function modelsChart(period){
 const t=monthlyTotals(db,period),by=new Map();
 for(const s of t.sales){const k=stock(s.stockId)?.label||'Sin modelo';const r=by.get(k)||{n:0,c:0};r.n++;r.c+=cents(s.amount);by.set(k,r);}
 let items=[...by].sort((a,b)=>b[1].n-a[1].n||b[1].c-a[1].c).map(([name,r])=>({name,value:r.n,label:String(r.n),tip:`${r.n} ${r.n===1?'venta':'ventas'} · ${chartMoney(r.c)}`}));
 if(items.length>6){const rest=items.slice(5),n=rest.reduce((a,i)=>a+i.value,0);items=[...items.slice(0,5),{name:'Otros modelos',value:n,label:String(n),tip:`${n} ventas en ${rest.length} modelos`}];}
 return `<div class="chart-card card"><div class="card-head"><h2>Modelos más vendidos</h2><span class="subtext">${esc(monthLabel(period))}</span></div>${rankedRows(items,'Todavía no hay ventas registradas este mes.')}</div>`;
}
function sourcesChart(period){
 const list=db.clients.filter(c=>!c.archived&&recordDate(c).slice(0,7)===period),by=new Map();
 for(const c of list){const r=by.get(c.source)||{n:0,sold:0};r.n++;if(c.stage==='Vendido')r.sold++;by.set(c.source,r);}
 const items=[...by].sort((a,b)=>b[1].n-a[1].n).map(([name,r])=>({name,value:r.n,label:`${r.n}${r.sold?' · '+r.sold+' '+(r.sold===1?'vendido':'vendidos'):''}`,tip:`${r.n} ${r.n===1?'cliente':'clientes'} · ${r.sold} ${r.sold===1?'vendido':'vendidos'} (${Math.round(r.sold/r.n*100)}%)`}));
 return `<div class="chart-card card"><div class="card-head"><h2>¿De dónde vienen tus clientes?</h2><span class="subtext">${esc(monthLabel(period))}</span></div>${rankedRows(items,'Todavía no hay clientes registrados este mes.')}</div>`;
}

const renderReportsBase=renderReports;
renderReports=function(){
 renderReportsBase();
 const view=$('view-reportes'),period=ui.reportMonth||month(),metrics=view.querySelector('.metrics');
 if(metrics)metrics.insertAdjacentHTML('afterend',goalCard(period));
 const anchor=view.querySelector('.payroll-grid');
 const charts=`<div class="charts-grid">${monthsChart(period)}${modelsChart(period)}${sourcesChart(period)}</div>`;
 if(anchor)anchor.insertAdjacentHTML('afterend',charts);else view.insertAdjacentHTML('beforeend',charts);
};
const renderHomeBase=renderHome;
renderHome=function(){
 renderHomeBase();
 const side=document.querySelector('#view-resumen .dashboard-grid>div:nth-child(2)');
 if(side)side.insertAdjacentHTML('afterbegin',goalCard(month(),true));
};
