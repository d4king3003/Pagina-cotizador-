import * as THREE from './vendor/three.module.js';

const COLORS=['#e54140','#46a26d','#7d5fbd','#ec9c32','#2b82c2','#e0bf25','#24a6a2','#da62a2','#f07533','#4779ac','#b46ed6','#7daa48'];
const clamp=THREE.MathUtils.clamp;
const roomCenter=i=>({x:-12+(i%3)*12,z:-5.75+Math.floor(i/3)*11.5});
const slots=[[-2.3,-.7],[2.1,.3],[-.2,3.3],[-4,2.8],[3.8,3.7],[.3,.8],[-3.6,-2.6],[3.8,-2],[.1,-3]];

/** All visible office objects are meshes in a lit, orbitable WebGL scene. */
export class Office3D {
  constructor(host,{onSelect,onFilter,onMove,rendererFactory}) {
    this.host=host;this.onSelect=onSelect;this.onFilter=onFilter;this.onMove=onMove;
    this.materials=new Map();this.geometries=new Map();this.avatars=new Map();this.roomLabels=[];
    this.state={clients:[],stages:[],party:false,selected:null,filter:null};
    this.yaw=.72;this.elevation=.66;this.zoom=1;this.target=new THREE.Vector3(0,.9,0);
    this.dirty=true;this.lastTime=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f8faf8');
    this.camera=new THREE.OrthographicCamera(-25,25,17,-17,.1,160);
    const rendererOptions={antialias:true,alpha:false,powerPreference:'high-performance'};
    this.renderer=rendererFactory?rendererFactory(rendererOptions):new THREE.WebGLRenderer(rendererOptions);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.domElement.className='office-canvas';
    this.renderer.domElement.setAttribute('aria-label','Oficina 3D: arrastrá para girar y usá la rueda para acercarte.');
    this.renderer.domElement.setAttribute('role','img');
    host.replaceChildren(this.renderer.domElement);
    this.labels=document.createElement('div');this.labels.className='office-3d-labels';host.append(this.labels);
    this.makeControls();this.makeLights();this.makeBuilding();this.makeParty();this.makeDropMarker();this.bindCamera();
    this.dragStatus=document.createElement('div');this.dragStatus.className='office-drag-status';this.dragStatus.setAttribute('role','status');this.dragStatus.setAttribute('aria-live','polite');this.dragStatus.hidden=true;host.append(this.dragStatus);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.grab){e.preventDefault();this.finishGrab(false);}});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
    this.resize();this.animate=this.animate.bind(this);this.active=true;this.frame=requestAnimationFrame(this.animate);
    host.dataset.renderer='webgl-3d';
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{
      e.preventDefault();host.dataset.renderer='context-lost';host.dispatchEvent(new CustomEvent('office-context-lost'));
      this.showMessage('Se pausó el 3D. Recargá la página para volver a la oficina. Tus datos están guardados.');
    });
  }
  geometry(key,create){if(!this.geometries.has(key))this.geometries.set(key,create());return this.geometries.get(key);}
  material(color,extra={}){
    const key=JSON.stringify([color,extra]);
    if(!this.materials.has(key))this.materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.02,...extra}));
    return this.materials.get(key);
  }
  mesh(parent,geometry,material,x=0,y=0,z=0,shadow=true){
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=shadow;parent.add(m);return m;
  }
  box(parent,w,h,d,x,y,z,color,extra={}){
    return this.mesh(parent,this.geometry(`box:${w}:${h}:${d}`,()=>new THREE.BoxGeometry(w,h,d)),this.material(color,extra),x,y,z);
  }
  cylinder(parent,rt,rb,h,x,y,z,color,extra={}){
    return this.mesh(parent,this.geometry(`cyl:${rt}:${rb}:${h}`,()=>new THREE.CylinderGeometry(rt,rb,h,24)),this.material(color,extra),x,y,z);
  }
  sphere(parent,r,x,y,z,color,extra={}){
    return this.mesh(parent,this.geometry(`sphere:${r}`,()=>new THREE.SphereGeometry(r,20,12)),this.material(color,extra),x,y,z);
  }
  line(parent,points,color,width=1){
    const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,linewidth:width}));parent.add(line);return line;
  }
  makeLights(){
    this.scene.add(new THREE.HemisphereLight('#fffdf5','#a9b8a8',2.4));
    const sun=new THREE.DirectionalLight('#fff7e8',3.1);sun.position.set(-15,30,12);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-30;sun.shadow.camera.right=30;
    sun.shadow.camera.top=28;sun.shadow.camera.bottom=-28;sun.shadow.camera.near=1;sun.shadow.camera.far=85;
    sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;sun.shadow.radius=3;
    this.scene.add(sun);
    const fill=new THREE.DirectionalLight('#d7e5ff',1);fill.position.set(18,15,-15);this.scene.add(fill);
  }
  makeBuilding(){
    this.building=new THREE.Group();this.scene.add(this.building);
    this.box(this.building,150,.12,150,0,-.61,0,'#f8faf8').castShadow=false;
    this.box(this.building,36.6,.62,23.6,0,-.22,0,'#d3dbd1');
    this.box(this.building,36.3,.12,23.3,0,.15,0,'#f0efe4');
    this.floorMeshes=[];
    ['#e5edf4','#f0e4cc','#e6e0f0','#d7e9db','#f0dce2','#c8d1c2'].forEach((color,i)=>{
      const p=roomCenter(i);
      this.floorMeshes.push(this.box(this.building,11.65,.10,11.12,p.x,.25,p.z,color,{roughness:.96}));
      if(i!==5){this.desk(p.x+3.4,p.z-3.65);this.plant(p.x-4.7,p.z-4.0);}
    });
    this.makeCemetery();
    const gridPositions=[];
    for(let x=-18;x<=18;x+=1.5)gridPositions.push(x,.31,-11.5,x,.31,11.5);
    for(let z=-11.5;z<=11.5;z+=1.44)gridPositions.push(-18,.31,z,18,.31,z);
    const gridGeometry=new THREE.BufferGeometry();gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(gridPositions,3));
    const grid=new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.18}));this.building.add(grid);
    this.box(this.building,36.5,2.8,.17,0,1.65,-11.55,'#e3e5db');
    this.box(this.building,.17,2.8,23.4,-18.2,1.65,0,'#e0e4d9');
    this.box(this.building,36.6,.12,.22,0,3.1,-11.55,'#b4c0ad');
    this.box(this.building,.22,.12,23.5,-18.2,3.1,0,'#b4c0ad');
    this.sign('TVS',3.0,1.15,'#dc3649','#fff',-14,1.95,-11.42);
    for(const x of [-6,6])for(const z of [-11.5,0]){
      this.box(this.building,.055,1.7,3.4,x,1.16,z+1.7,'#a4bcb5',{transparent:true,opacity:.19,depthWrite:false});
      this.box(this.building,.07,.07,3.5,x,2.03,z+1.7,'#8eaaa1');
      for(const dz of [0,3.4])this.box(this.building,.07,1.8,.07,x,1.2,z+dz,'#8eaaa1');
    }
    this.motorcycle(-15.3,-1.9);this.motorcycle(-4.0,9.3);
  }
  sign(text,w,h,bg,color,x,y,z){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
    const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,192);
    ctx.fillStyle=color;ctx.font='italic 900 145px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,105);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.MeshBasicMaterial({map:texture});
    return this.mesh(this.building,new THREE.PlaneGeometry(w,h),mat,x,y,z,false);
  }
  desk(x,z){
    const p=this.building;
    this.box(p,3,.18,1.6,x,1.5,z,'#e3d8bf');
    for(const dx of [-1.24,1.24])for(const dz of [-.55,.55])this.box(p,.10,1.3,.10,x+dx,.79,z+dz,'#9aa6a2');
    this.box(p,1.18,.84,.11,x,2.12,z-.32,'#465962');
    this.box(p,1.05,.69,.02,x,2.13,z-.252,'#acc5c7',{emissive:'#91b6bd',emissiveIntensity:.12});
    this.box(p,.08,.4,.08,x,1.76,z-.32,'#74878b');this.box(p,.5,.055,.4,x,1.64,z-.22,'#a0aaa5');
    this.box(p,1.02,.045,.34,x,1.63,z+.42,'#c0c7bd');
    this.cylinder(p,.12,.1,.2,x+1.08,1.72,z+.2,'#f3ede2');
    this.box(p,.85,.17,.77,x,.82,z+1.6,'#85948e');
    this.box(p,.86,.82,.13,x,1.23,z+1.99,'#8a9b94');
    this.cylinder(p,.055,.055,.6,x,.46,z+1.6,'#7e8c88');
    this.box(p,1.0,.08,.08,x,.2,z+1.6,'#7e8c88');this.box(p,.08,.08,1,x,.2,z+1.6,'#7e8c88');
  }
  plant(x,z){
    const p=this.building;this.cylinder(p,.35,.25,.55,x,.59,z,'#cbbca3');this.cylinder(p,.31,.31,.045,x,.89,z,'#817a59');
    for(let i=0;i<5;i++){
      const a=i*2.4;const leaf=this.sphere(p,.28,x+Math.sin(a)*.25,1.35+(i%2)*.26,z+Math.cos(a)*.22,i%2?'#8fae76':'#6f9460');
      leaf.scale.set(.55,2.2,.5);leaf.rotation.z=Math.cos(a)*.45;leaf.rotation.x=Math.sin(a)*.5;
    }
  }
  makeCemetery(){
    const g=new THREE.Group();g.name='Cementerio de descartados';this.building.add(g);
    for(let i=0;i<8;i++)this.box(g,1.2,.035,.62,12,.327,.8+i*1.38,i%2?'#b4bcb0':'#bac2b5');
    const fence=(x,z,axis,length)=>{
      for(let i=0;i<=length;i++){
        const px=x+(axis==='x'?i:0),pz=z+(axis==='z'?i:0);
        this.box(g,.055,.9,.055,px,.8,pz,'#606c62');
        const tip=this.mesh(g,this.geometry('fence-tip',()=>new THREE.ConeGeometry(.065,.17,4)),this.material('#606c62'),px,1.3,pz);
      }
      for(const h of [.62,1.04])this.box(g,axis==='x'?length:.045,.045,axis==='z'?length:.045,x+(axis==='x'?length/2:0),h,z+(axis==='z'?length/2:0),'#6e796e');
    };
    fence(6.5,.45,'x',11);fence(17.55,.45,'z',10);
    for(const [x,z]of [[7.15,1.45],[16.75,1.45]]){
      this.cylinder(g,.13,.17,.7,x,.65,z,'#857f6b');
      for(let i=0;i<3;i++)this.mesh(g,this.geometry(`cypress:${i}`,()=>new THREE.ConeGeometry(.52-i*.08,1.25,8)),this.material(i%2?'#7c8d73':'#6b8068'),x,1.2+i*.48,z);
    }
    for(let i=0;i<10;i++)this.sphere(g,.09,6.9+(i%5)*2.05,.37,10.3+Math.floor(i/5)*.45,'#a6afa1').scale.set(1,.55,.7);
  }
  makeGrave(parent){
    const grave=new THREE.Group();parent.add(grave);grave.rotation.y=.22;
    this.box(grave,1.28,.10,2.3,0,.055,.28,'#a1ae94');
    this.box(grave,1.04,.035,1.95,0,.12,.31,'#8a876e');
    this.box(grave,1.28,.18,.5,0,.18,-.64,'#9ca59d');
    const shape=new THREE.Shape();shape.moveTo(-.5,0);shape.lineTo(.5,0);shape.lineTo(.5,1.18);shape.absarc(0,1.18,.5,0,Math.PI,false);shape.lineTo(-.5,0);shape.closePath();
    const geometry=this.geometry('gravestone',()=>{const geo=new THREE.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:true,bevelSize:.04,bevelThickness:.04,bevelSegments:2,steps:1});geo.translate(0,0,-.12);return geo;});
    this.mesh(grave,geometry,this.material('#b5beb4',{roughness:.95}),0,.22,-.64);
    this.box(grave,.055,.37,.025,0,1.45,-.465,'#7d897d');
    this.box(grave,.25,.055,.025,0,1.48,-.465,'#7d897d');
    for(let i=0;i<3;i++)this.box(grave,.5-i*.08,.025,.025,0,.96-i*.12,-.465,'#879286');
    grave.visible=false;return grave;
  }
  motorcycle(x,z){
    const g=new THREE.Group();g.position.set(x,.34,z);g.rotation.y=.4;this.building.add(g);
    for(const dx of [-.72,.72]){
      const tire=this.mesh(g,this.geometry('bike-tire',()=>new THREE.TorusGeometry(.4,.11,8,20)),this.material('#303b42'),dx,.45,0);tire.rotation.y=Math.PI/2;
      const rim=this.cylinder(g,.29,.29,.05,dx,.45,0,'#b0b9b6',{metalness:.5,roughness:.3});rim.rotation.z=Math.PI/2;
    }
    this.box(g,1.15,.33,.46,-.1,.92,0,'#d93649');this.box(g,.72,.15,.48,-.39,1.17,0,'#343d42');
    this.box(g,.25,.58,.08,.58,.92,0,'#74888d').rotation.z=-.4;
    this.box(g,.1,.12,.75,.67,1.37,0,'#58686e');this.sphere(g,.13,.76,1.14,.02,'#f2e3aa',{emissive:'#ffe5a3',emissiveIntensity:.2});
    this.box(g,.65,.24,.33,-.05,.58,0,'#748388');
  }
  makeParty(){
    this.partyGroup=new THREE.Group();this.scene.add(this.partyGroup);this.partyGroup.visible=false;
    this.partyMaterial=this.material('#514064',{roughness:.9});
    const p=this.partyGroup;
    this.box(p,3.4,1.35,1.1,-2.8,1.0,10.15,'#30323e');this.box(p,3.6,.12,1.3,-2.8,1.74,10.15,'#92bba9');
    for(const x of [-3.65,-1.95])this.cylinder(p,.34,.34,.045,x,1.84,10.15,'#454b52');
    for(const x of [-5.05,5.05]){
      this.box(p,.9,1.65,.78,x,1.15,10.15,'#353440');
      const cone=this.cylinder(p,.23,.23,.04,x,1.2,10.57,'#171d2d');cone.rotation.x=Math.PI/2;
    }
    this.ballPivot=new THREE.Group();this.ballPivot.position.set(4.5,4.9,2.8);p.add(this.ballPivot);
    this.cylinder(p,.018,.018,1.85,4.5,6.35,2.8,'#56535e');
    const bg=this.geometry('mirror-ball',()=>new THREE.IcosahedronGeometry(.62,2));
    const ball=this.mesh(this.ballPivot,bg,this.material('#c4c7d1',{metalness:.45,roughness:.22,flatShading:true}));
    this.ballPivot.add(new THREE.LineSegments(new THREE.EdgesGeometry(bg),new THREE.LineBasicMaterial({color:'#f0f0f4',transparent:true,opacity:.45})));
    ball.castShadow=false;
    this.balloons=[];
    ['#89cac5','#e3bc73','#e4bad4'].forEach((color,i)=>{
      const b=new THREE.Group();b.position.set(-4.9+i*1.4,0,10.65);p.add(b);
      this.line(b,[[0,.35,0],[.08,1.1,0],[0,2.06,0]],'#a4a5ad');
      this.sphere(b,.37,0,2.4,0,color).scale.set(1,1.28,1);this.balloons.push(b);
    });
    this.lightDiscs=[];
    [[-3,2.0,'#d67fc2'],[3,2.0,'#82d5c4'],[1.7,9.6,'#e7c86b'],[-3,7.7,'#ae96d9']].forEach(([x,z,color])=>{
      const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.35,depthWrite:false});
      const disc=this.mesh(p,new THREE.CircleGeometry(.83,32),mat,x,.326,z,false);disc.rotation.x=-Math.PI/2;disc.scale.set(1.4,1,1);this.lightDiscs.push(disc);
    });
    this.confetti=[];
    for(let i=0;i<12;i++){
      const c=this.box(p,.09,.17,.035,Math.sin(i*2.4)*4,1+(i%5)*.7,1.4+(i%4)*2.1,['#e9a8d3','#c4afd9','#eedc87','#a3dad0'][i%4]);
      c.castShadow=false;this.confetti.push(c);
    }
    this.partyLight=new THREE.PointLight('#c49ae2',7,14,2);this.partyLight.position.set(0,5,6);p.add(this.partyLight);
  }
  makeAvatar(c){
    const root=new THREE.Group();root.userData.clientId=c.id;this.scene.add(root);
    const body=new THREE.Group();root.add(body);
    const shirt=COLORS[c.color%COLORS.length],pants=['#3e5a82','#8d969b','#d4d5c8','#657a92'][c.color%4];
    const yellow='#f8cc44';
    const torsoShape=new THREE.Shape();torsoShape.moveTo(-.31,.37);torsoShape.lineTo(.31,.37);torsoShape.lineTo(.45,-.37);torsoShape.lineTo(-.45,-.37);torsoShape.closePath();
    const torsoGeo=this.geometry('lego-torso',()=>{const g=new THREE.ExtrudeGeometry(torsoShape,{depth:.42,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1,steps:1});g.translate(0,0,-.21);return g;});
    this.mesh(body,torsoGeo,this.material(shirt,{roughness:.3}),0,1.5,0);
    this.cylinder(body,.135,.135,.17,0,1.94,0,yellow,{roughness:.3});
    this.box(body,.85,.17,.45,0,1.03,0,pants);
    const badge=this.mesh(body,new THREE.CircleGeometry(.065,12),this.material('#f3eddc'),.2,1.57,.241,false);
    const legs=[];
    for(const x of [-.225,.225]){
      const leg=new THREE.Group();leg.position.set(x,.98,0);body.add(leg);
      this.box(leg,.365,.69,.41,0,-.36,0,pants,{roughness:.32});
      this.box(leg,.37,.20,.59,0,-.74,.085,pants,{roughness:.3});legs.push(leg);
    }
    const arms=[];
    for(const x of [-.48,.48]){
      const arm=new THREE.Group();arm.position.set(x,1.78,0);body.add(arm);
      this.cylinder(arm,.125,.145,.49,0,-.22,0,shirt,{roughness:.32});
      this.cylinder(arm,.10,.10,.12,0,-.5,0,yellow,{roughness:.3});
      const hand=this.mesh(arm,this.geometry('lego-hand',()=>new THREE.TorusGeometry(.105,.045,7,15,Math.PI*1.5)),this.material(yellow,{roughness:.28}),0,-.63,.015);
      hand.rotation.z=-Math.PI/4;arms.push(arm);
    }
    const head=new THREE.Group();head.position.y=2.23;body.add(head);
    this.cylinder(head,.35,.35,.49,0,0,0,yellow,{roughness:.27});this.cylinder(head,.13,.13,.11,0,.30,0,yellow,{roughness:.27});
    for(const x of [-.115,.115])this.sphere(head,.035,x,.055,Math.sqrt(.35*.35-x*x)+.008,'#272b31',{roughness:.7}).scale.set(1,1,.5);
    const smilePoints=[];
    for(let i=0;i<=12;i++){const t=-1+i/6,x=t*.115;smilePoints.push(new THREE.Vector3(x,-.12+.055*t*t,Math.sqrt(.35*.35-x*x)+.008));}
    this.mesh(head,this.geometry('lego-smile',()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePoints),12,.012,5,false)),this.material('#3a3631'),0,0,0,false);
    const hair=new THREE.Group();head.add(hair);
    if(c.color%3!==0){
      this.sphere(hair,.365,0,.25,-.015,['#55453b','#d9d7ca','#a5a698','#30383f'][c.color%4],{roughness:.52}).scale.set(1,.43,1);
      this.box(hair,.13,.18,.34,-.3,.16,-.03,['#55453b','#d9d7ca','#a5a698','#30383f'][c.color%4]);
    }
    const hat=new THREE.Group();hat.position.y=.3;head.add(hat);
    const hatColor=['#b38cd0','#e4b0cb','#96ccc1'][c.color%3];
    this.mesh(hat,this.geometry('party-hat',()=>new THREE.ConeGeometry(.37,.92,24)),this.material(hatColor,{roughness:.6}),0,.46,0);
    this.cylinder(hat,.38,.38,.04,0,.015,0,'#e4d0e9');
    this.sphere(hat,.07,0,.97,0,'#f2db8f');
    for(let i=0;i<3;i++){
      const radius=.3-i*.075,ring=this.mesh(hat,new THREE.TorusGeometry(radius,.018,5,24),this.material('#f0e5ee'),0,.17+i*.2,0);ring.rotation.x=Math.PI/2;
    }
    hat.visible=false;
    const ring=this.mesh(root,this.geometry('selected-ring',()=>new THREE.TorusGeometry(.7,.035,6,32)),new THREE.MeshBasicMaterial({color:'#e14455'}),0,.025,0,false);ring.rotation.x=-Math.PI/2;ring.visible=false;
    const grave=this.makeGrave(root);
    const plumbob=this.mesh(root,this.geometry('grab-diamond',()=>new THREE.OctahedronGeometry(.21)),this.material('#75c84b',{emissive:'#5b9b33',emissiveIntensity:.3}),0,3.85,0,false);plumbob.scale.y=1.6;plumbob.visible=false;
    const button=document.createElement('button');button.className='client-3d-hit';button.dataset.clientId=c.id;
    button.title='Clic para ver la ficha · Sujetá y arrastrá para cambiar de sala';
    const name=document.createElement('span');name.className='client-3d-name';button.append(name);
    button.addEventListener('click',e=>{if(e.detail!==0&&this.ignoreClickId===c.id&&Date.now()<this.ignoreClickUntil){e.preventDefault();return;}this.onSelect(c.id);});
    button.addEventListener('dragstart',e=>e.preventDefault());
    button.addEventListener('pointerdown',e=>this.beginGrab(c.id,e));
    button.addEventListener('pointermove',e=>this.moveGrab(e));
    button.addEventListener('pointerup',e=>{if(this.grab?.pointerId===e.pointerId)this.finishGrab(true);});
    button.addEventListener('pointercancel',e=>{if(this.grab?.pointerId===e.pointerId)this.finishGrab(false);});
    button.addEventListener('lostpointercapture',e=>{if(this.grab?.pointerId===e.pointerId)this.finishGrab(false);});
    button.addEventListener('focus',()=>{ring.visible=true;this.dirty=true;});
    button.addEventListener('blur',()=>{ring.visible=this.state.selected===c.id;this.dirty=true;});
    this.labels.append(button);
    const rig={root,body,head,hair,hat,arms,legs,ring,grave,plumbob,button,name,stage:c.stage,phase:c.color*.71,target:new THREE.Vector3(),placed:false};
    this.avatars.set(c.id,rig);return rig;
  }
  update(state){
    this.state=state;
    if(!this.roomLabels.length){
      state.stages.forEach((stage,i)=>{
        const button=document.createElement('button');button.className='room-3d-label';button.style.setProperty('--room-color',stage.color);
        const dot=document.createElement('span');dot.className='room-3d-dot';const name=document.createElement('span');name.textContent=stage.name;const n=document.createElement('b');
        button.append(dot,name,n);button.addEventListener('click',()=>this.onFilter(stage.id));this.labels.append(button);this.roomLabels.push({button,n,stage,i});
      });
    }
    const present=new Set(),groups=state.stages.map(s=>state.clients.filter(c=>c.stage===s.id));
    groups.forEach((group,i)=>{
      const room=roomCenter(i);this.roomLabels[i].n.textContent=group.length;
      this.roomLabels[i].button.setAttribute('aria-label',`${state.stages[i].name}: ${group.length} clientes`);
      this.roomLabels[i].button.setAttribute('aria-pressed',String(state.filter===state.stages[i].id));
      group.slice((state.page||0)*9,(state.page||0)*9+9).forEach((c,k)=>{
        present.add(c.id);const rig=this.avatars.get(c.id)||this.makeAvatar(c);const offset=slots[k];
        rig.target.set(room.x+offset[0],.33,room.z+offset[1]);
        if(!rig.placed){rig.root.position.copy(rig.target);rig.placed=true;}
        rig.stage=c.stage;rig.root.visible=!state.filter||state.filter===c.stage;
        rig.button.hidden=!rig.root.visible;rig.button.dataset.clientStage=c.stage;
        rig.button.dataset.dancing=String(!!state.party&&c.stage==='vendido'&&!this.reduced);
        rig.button.setAttribute('aria-label',`${c.stage==='descartado'?'Tumba de ':''}${c.name}, ${c.model}, ${state.stages[i].name}`);
        rig.body.visible=c.stage!=='descartado';rig.grave.visible=c.stage==='descartado';rig.plumbob.position.y=c.stage==='descartado'?2.6:3.85;rig.button.dataset.representation=c.stage==='descartado'?'grave':'minifigure';
        rig.button.classList.toggle('selected',state.selected===c.id);rig.name.textContent=c.name;
        rig.ring.visible=state.selected===c.id;rig.hat.visible=!!state.party&&c.stage==='vendido';
      });
    });
    for(const [id,rig]of this.avatars)if(!present.has(id)){
      const sharedGeometry=new Set(this.geometries.values()),sharedMaterial=new Set(this.materials.values());
      rig.root.traverse(object=>{
        if(object.geometry&&!sharedGeometry.has(object.geometry))object.geometry.dispose();
        for(const material of Array.isArray(object.material)?object.material:[object.material])if(material&&!sharedMaterial.has(material))material.dispose();
      });
      this.scene.remove(rig.root);rig.button.remove();this.avatars.delete(id);
    }
    this.partyGroup.visible=!!state.party;
    this.floorMeshes[4].material=state.party?this.partyMaterial:this.material('#f0dce2',{roughness:.96});
    this.host.dataset.dancingClients=String([...this.avatars.values()].filter(r=>state.party&&r.stage==='vendido'&&!this.reduced).length);
    this.dirty=true;
  }
  makeControls(){
    const toolbar=document.createElement('div');toolbar.className='camera-3d-tools';toolbar.setAttribute('aria-label','Controles de cámara 3D');
    const add=(text,label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.title=label;b.addEventListener('click',fn);toolbar.append(b);return b;};
    add('−','Alejar cámara',()=>this.setZoom(this.zoom/1.2));
    add('+','Acercar cámara',()=>this.setZoom(this.zoom*1.2));
    add('↺','Restablecer cámara',()=>{this.yaw=.72;this.elevation=.66;this.target.set(0,.9,0);this.zoom=1;this.updateCamera();});
    const sold=add('Ver Vendidos','Acercarse a la sala Vendidos',()=>{this.target.set(0,1.5,5.75);this.zoom=2.15;this.updateCamera();});sold.className='focus-sold-camera';
    const cemetery=add('🪦','Acercarse al cementerio de Descartados',()=>{this.target.set(12,1,5.75);this.zoom=2.15;this.updateCamera();});cemetery.className='cemetery-camera';
    const tip=document.createElement('span');tip.className='camera-3d-hint';tip.textContent='Arrastrá el piso para girar · Rueda para acercar';
    this.host.append(toolbar,tip);
  }
  makeDropMarker(){
    this.dropMarker=new THREE.Group();this.scene.add(this.dropMarker);this.dropMarker.visible=false;
    const mat=new THREE.MeshBasicMaterial({color:'#a6d68a',transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide});
    const floor=this.mesh(this.dropMarker,new THREE.PlaneGeometry(11.6,11.06),mat,0,.345,0,false);floor.rotation.x=-Math.PI/2;
    this.line(this.dropMarker,[[-5.8,.36,-5.53],[5.8,.36,-5.53],[5.8,.36,5.53],[-5.8,.36,5.53],[-5.8,.36,-5.53]],'#77a855');
  }
  pointerOnFloor(e){
    const r=this.renderer.domElement.getBoundingClientRect();if(!r.width||!r.height)return null;
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.33),new THREE.Vector3());
  }
  beginGrab(id,e){
    if(e.button!==0||this.grab||!this.onMove)return;
    const rig=this.avatars.get(id),point=this.pointerOnFloor(e);if(!rig||!point)return;
    e.preventDefault();e.stopPropagation();
    clearTimeout(this.dragStatusTimer);this.dragStatus.hidden=true;
    this.grab={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offset:rig.root.position.clone().sub(point),active:false,stage:rig.stage};
    rig.button.setPointerCapture?.(e.pointerId);
  }
  moveGrab(e){
    const grab=this.grab;if(!grab||e.pointerId!==grab.pointerId)return;
    const rig=this.avatars.get(grab.id);if(!rig){this.finishGrab(false);return;}
    if(!grab.active&&Math.hypot(e.clientX-grab.startX,e.clientY-grab.startY)<5)return;
    const point=this.pointerOnFloor(e);if(!point)return;
    e.preventDefault();grab.active=true;this.host.classList.add('grabbing-client');
    rig.root.position.copy(point.add(grab.offset));rig.root.position.y=1.38;
    rig.ring.visible=true;rig.ring.position.y=-1.025;rig.plumbob.visible=true;rig.button.dataset.grabbed='true';
    const x=rig.root.position.x,z=rig.root.position.z;
    let index=x>=-18&&x<18&&z>=-11.5&&z<11.5?Math.floor((z+11.5)/11.5)*3+Math.floor((x+18)/12):-1;
    for(const label of this.roomLabels){if(label.button.hidden)continue;const r=label.button.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){index=label.i;break;}}
    grab.stage=this.state.stages[index]?.id??null;
    this.dropMarker.visible=index>=0;
    if(index>=0){const c=roomCenter(index);this.dropMarker.position.set(c.x,0,c.z);}
    this.roomLabels.forEach(label=>label.button.classList.toggle('drop-target',label.i===index));
    const message=index>=0?`Soltá para mover a ${this.state.stages[index].name}`:'Soltá dentro de una sala · Esc para cancelar';
    if(this.dragStatus.textContent!==message)this.dragStatus.textContent=message;this.dragStatus.hidden=false;this.dirty=true;
  }
  finishGrab(commit){
    const grab=this.grab;if(!grab)return;this.grab=null;
    const rig=this.avatars.get(grab.id);this.host.classList.remove('grabbing-client');this.dropMarker.visible=false;
    this.roomLabels.forEach(label=>label.button.classList.remove('drop-target'));
    if(rig){rig.plumbob.visible=false;rig.ring.position.y=.025;rig.ring.visible=this.state.selected===grab.id;rig.button.dataset.grabbed='false';
      if(rig.button.hasPointerCapture?.(grab.pointerId))rig.button.releasePointerCapture(grab.pointerId);
    }
    this.dragStatus.hidden=true;
    if(grab.active){
      this.ignoreClickId=grab.id;this.ignoreClickUntil=Date.now()+400;
      if(commit&&grab.stage&&rig&&grab.stage!==rig.stage){this.onMove(grab.id,grab.stage);}
      else if(!commit||!grab.stage){this.dragStatus.textContent='Movimiento cancelado: vuelve a su sala';this.dragStatus.hidden=false;this.dragStatusTimer=setTimeout(()=>{this.dragStatus.hidden=true;},1800);}
    }
    else if(commit){this.ignoreClickId=grab.id;this.ignoreClickUntil=Date.now()+400;this.onSelect(grab.id);}
    this.dirty=true;
  }
  bindCamera(){
    const canvas=this.renderer.domElement;let down=null,moved=false;
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={x:e.clientX,y:e.clientY,yaw:this.yaw,elevation:this.elevation};moved=false;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
      this.yaw=clamp(down.yaw-dx*.006,-.35,1.9);this.elevation=clamp(down.elevation+dy*.004,.32,1.15);this.updateCamera();
    });
    canvas.addEventListener('pointerup',e=>{
      if(down&&!moved){
        const r=canvas.getBoundingClientRect(),pointer=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
        const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
        const hit=ray.intersectObjects([...this.avatars.values()].map(r=>r.root),true)[0];
        if(hit){let node=hit.object;while(node&&!node.userData.clientId)node=node.parent;if(node)this.onSelect(node.userData.clientId);}
      }
      down=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointercancel',()=>{down=null;});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.zoom*Math.exp(-e.deltaY*.0012));},{passive:false});
  }
  setZoom(z){this.zoom=clamp(z,.65,3.3);this.updateCamera();}
  resize(){
    const r=this.host.getBoundingClientRect();if(!r.width||!r.height)return;
    this.width=r.width;this.height=r.height;this.renderer.setSize(r.width,r.height,false);this.updateCamera();
  }
  updateCamera(){
    const aspect=(this.width||800)/(this.height||500),height=Math.max(31,44/aspect);
    this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;this.camera.top=height/2;this.camera.bottom=-height/2;
    this.camera.zoom=this.zoom;
    const radius=60;this.camera.position.set(this.target.x+radius*Math.sin(this.yaw)*Math.cos(this.elevation),this.target.y+radius*Math.sin(this.elevation),this.target.z+radius*Math.cos(this.yaw)*Math.cos(this.elevation));
    this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.dirty=true;
  }
  projectLabels(){
    const v=new THREE.Vector3();
    const project=(x,y,z)=>{v.set(x,y,z).project(this.camera);return {x:(v.x*.5+.5)*this.width,y:(-.5*v.y+.5)*this.height};};
    this.roomLabels.forEach(({button,i})=>{const c=roomCenter(i),p=project(c.x,3.4,c.z-3.6);button.hidden=p.x<0||p.x>this.width||p.y<0||p.y>this.height-50;button.style.left=clamp(p.x,45,this.width-45)+'px';button.style.top=clamp(p.y,18,this.height-50)+'px';});
    for(const rig of this.avatars.values()){
      const p=rig.root.position,grave=rig.stage==='descartado',head=project(p.x,p.y+(grave?2.0:3.2),p.z),foot=project(p.x,p.y,p.z);
      const h=clamp(Math.abs(foot.y-head.y)+10,27,210),w=clamp(h*(grave?.8:.55),22,110);
      rig.button.style.left=head.x+'px';rig.button.style.top=((foot.y+head.y)/2)+'px';rig.button.style.width=w+'px';rig.button.style.height=h+'px';
      rig.button.style.zIndex=String(Math.round((30-p.z)*2));
    }
  }
  animate(now){
    if(this.active)this.frame=requestAnimationFrame(this.animate);
    if(!this.active||document.hidden||!this.host.offsetWidth||!this.host.offsetHeight)return;
    const dt=Math.min((now-this.lastTime)/1000||.016,.06);this.lastTime=now;const t=now/1000;
    let moving=false;const celebrating=this.state.party&&!this.reduced;
    for(const rig of this.avatars.values()){
      const grabbed=this.grab?.active&&this.grab.id===rig.root.userData.clientId;
      if(!grabbed&&rig.root.position.distanceToSquared(rig.target)>.0001){rig.root.position.lerp(rig.target,1-Math.exp(-dt*5));moving=true;}
      if(grabbed){rig.plumbob.rotation.y=t*2;moving=true;}
      const dance=celebrating&&rig.stage==='vendido'&&!grabbed,beat=t*6.5+rig.phase;
      rig.body.position.y=dance?Math.abs(Math.sin(beat))*.13:0;
      rig.body.rotation.y=.22+(dance?Math.sin(beat*.5)*.22:0);
      rig.body.rotation.z=dance?Math.sin(beat)*.06:0;
      rig.arms[0].rotation.z=dance?-.8-Math.sin(beat)*.7:-.14;
      rig.arms[1].rotation.z=dance?.8-Math.sin(beat)*.7:.14;
      rig.arms[0].rotation.x=dance?Math.cos(beat)*.25:0;rig.arms[1].rotation.x=dance?-Math.cos(beat)*.25:0;
      rig.legs[0].rotation.x=dance?Math.sin(beat)*.25:0;rig.legs[1].rotation.x=dance?-Math.sin(beat)*.25:0;
      rig.head.rotation.y=dance?Math.sin(beat)*.15:0;
    }
    if(celebrating){
      this.ballPivot.rotation.y=t*.45;
      this.balloons.forEach((b,i)=>{b.position.y=Math.sin(t*1.4+i)*.06;});
      this.lightDiscs.forEach((d,i)=>{d.material.opacity=.18+.15*(1+Math.sin(t*1.8+i*1.7));});
      this.confetti.forEach((c,i)=>{c.position.y=.7+((t*.65+i*.37)%3.4);c.rotation.set(t*.8+i,t*.6,t+i*.4);});
    }
    if(this.dirty||moving||celebrating){this.renderer.render(this.scene,this.camera);this.projectLabels();this.dirty=false;}
  }
  setActive(active){
    if(this.active===active)return;
    this.active=active;
    if(active){this.lastTime=0;this.resize();this.dirty=true;this.frame=requestAnimationFrame(this.animate);}
    else{cancelAnimationFrame(this.frame);if(this.grab)this.finishGrab(false);}
  }
  showMessage(message){const p=document.createElement('p');p.className='office-3d-message';p.textContent=message;this.host.append(p);}
}
