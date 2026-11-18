// Exercises the actual 3D geometry, animation and ray/plane drag calculation.
// A renderer stub is used because this test does not require a GPU.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
class Element{
 constructor(){this.children=[];this.dataset={};this.hidden=false;this.attributes={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.offsetWidth=1100;this.offsetHeight=600;}
 append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}addEventListener(){}remove(){}dispatchEvent(){}setAttribute(k,v){this.attributes[k]=v;}getBoundingClientRect(){return {left:0,top:0,width:this.isCanvas?1100:0,height:this.isCanvas?600:0,right:0,bottom:0};}setPointerCapture(){}hasPointerCapture(){return false;}
 getContext(){return {fillRect(){},fillText(){}};}
}
const host=new Element();host.getBoundingClientRect=()=>({left:0,top:0,width:1100,height:600});
const context={console,Math,Date,Map,Set,WeakMap,WeakSet,Float32Array,Uint16Array,Uint32Array,Int32Array,ArrayBuffer,performance,devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},ResizeObserver:class{observe(){}},CustomEvent:class{},document:{hidden:false,createElement:()=>new Element(),createElementNS:()=>new Element(),addEventListener(){}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'qa/office-renderer.js'),'utf8'),context);
const moves=[],canvas=new Element();canvas.isCanvas=true;
const renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},render(){this.rendered=true;}};
const office=new context.TVSOfficeScene(host,{onSelect(){},onFilter(){},onMove:(id,stage)=>moves.push([id,stage]),rendererFactory:()=>renderer});
const stages=['interesado','cotizado','evaluacion','aprobado','vendido','descartado'].map((id,i)=>({id,name:id,color:'#8b9fc3'}));
const clients=stages.map((s,i)=>({id:'c-'+i,name:'Ejemplo '+i,model:'Raider 125',stage:s.id,color:i}));
const state={clients,stages,party:true,selected:null,filter:null,page:0};office.update(state);office.animate(700);
assert.equal(office.avatars.size,6);assert.equal(host.dataset.renderer,'webgl-3d');assert.ok(renderer.rendered);
for(const c of clients){const rig=office.avatars.get(c.id);assert.equal(rig.button.dataset.dancing,String(c.stage==='vendido'));assert.equal(rig.grave.visible,c.stage==='descartado');assert.equal(rig.body.visible,c.stage!=='descartado');if(c.stage!=='vendido')assert.equal(rig.body.position.y,0);}
assert.equal(host.dataset.dancingClients,'1');assert.ok(office.avatars.get('c-4').hat.visible);assert.ok(!office.avatars.get('c-3').hat.visible);
const rig=office.avatars.get('c-3');const project=p=>{const v=p.clone().project(office.camera);return {clientX:(v.x*.5+.5)*1100,clientY:(-.5*v.y+.5)*600,pointerId:1,button:0,preventDefault(){},stopPropagation(){}};};
const start=rig.root.position.clone(),destination=start.clone();destination.x=0;destination.z=5.75;
office.beginGrab('c-3',project(start));office.moveGrab(project(destination));assert.equal(office.grab.stage,'vendido');assert.equal(rig.plumbob.visible,true);office.finishGrab(true);assert.deepEqual(moves,[['c-3','vendido']]);
office.beginGrab('c-3',project(rig.root.position));office.moveGrab(project(start));office.finishGrab(false);assert.equal(moves.length,1);
const many=Array.from({length:20},(_,i)=>({id:'sold-'+i,name:'Ejemplo vendido '+i,model:'Raider 125',stage:'vendido',color:i%12}));office.update({...state,clients:many});assert.equal(office.avatars.size,9);assert.equal(office.roomLabels[4].n.textContent,20);office.update({...state,clients:many,page:1});assert.equal(office.avatars.size,9);assert.ok(office.avatars.has('sold-9'));office.update({...state,clients:many,page:2});assert.equal(office.avatars.size,2);assert.ok(office.avatars.has('sold-19'));
office.reduced=true;office.update({...state,clients});assert.equal(host.dataset.dancingClients,'0');office.animate(1300);for(const r of office.avatars.values())assert.equal(r.body.position.y,0);
office.setActive(false);assert.equal(office.active,false);office.setActive(true);assert.equal(office.active,true);
const report={actualBundledThreeScene:'passed with renderer stub',meshCharactersAndGraves:'passed',onlySoldDance:'passed',pointerRayAndRoomDrop:'passed',cancelDrag:'passed',roomPagination20Clients:'passed',reducedMotion:'passed',hiddenRoutePausesAnimation:'passed',visualWebGL:'not verified: cloud browser GPU disabled'};
fs.writeFileSync(path.join(root,'qa/office-scene-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
