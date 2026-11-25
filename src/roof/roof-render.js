import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cl } from './format.js';
import { buildHardware } from './roof-hardware.js';

let REJECTED = 0;
export const rejectedCount = () => REJECTED;
const UPV = new THREE.Vector3(0,1,0), ONE = new THREE.Vector3(1,1,1);
const V3 = (x,y,z) => new THREE.Vector3(x,y,z);
function T3(v){ if(!v) return new THREE.Vector3(); if(v.isVector3) return v.clone();
  return new THREE.Vector3(Number.isFinite(v.x)?v.x:0,Number.isFinite(v.y)?v.y:0,Number.isFinite(v.z)?v.z:0); }
function geoOK(g){ if(!g) return false; const p=g.attributes&&g.attributes.position;
  if(!p||p.count===0){g.dispose();return false;} const a=p.array;
  for(let i=0;i<a.length;i++) if(!Number.isFinite(a[i])){g.dispose();REJECTED++;return false;} return true; }
function ptsOK(p){ if(!p||p.length<3) return false;
  for(const q of p) if(!q||!Number.isFinite(q[0])||!Number.isFinite(q[1])) return false; return true; }
function clipPoly(poly,planes){ let out=poly;
  for(const pl of planes){ const src=out; out=[]; if(!src.length) break;
    const f=q=>pl.nx*q[0]+pl.ny*q[1]-pl.c;
    for(let i=0;i<src.length;i++){ const A=src[i],B=src[(i+1)%src.length],fa=f(A),fb=f(B);
      if(fa<=0) out.push(A);
      if((fa<0&&fb>0)||(fa>0&&fb<0)){ const d=fa-fb; if(Math.abs(d)<1e-12) continue;
        const t=fa/d; out.push([A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t]); } } }
  return ptsOK(out)?out:null; }
function polyArea2(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s)/2;}
function signedArea2(p){let s=0;for(let i=0;i<p.length;i++){const j=(i+1)%p.length;s+=p[i][0]*p[j][1]-p[j][0]*p[i][1];}return s;}
function tri2D(prof){try{return THREE.ShapeUtils.triangulateShape(prof.map(q=>new THREE.Vector2(q[0],q[1])),[]);}catch{return null;}}

export const ROOF_LAYERS = [
  {id:'soffit',n:'Подшивка свесов',c:'#d6cfc0',s:-1.00,st:13},
  {id:'lining',n:'Внутренняя отделка',c:'#d9b382',s:-.82,st:10},
  {id:'vapor',n:'Пароизоляция',c:'#38bdf8',s:-.66,st:10},
  {id:'insul',n:'Утеплитель',c:'#a3e635',s:-.46,st:10},
  {id:'joists',n:'Балки перекрытия',c:'#7a5a34',s:-.26,st:2},
  {id:'plate',n:'Мауэрлат + венец',c:'#8b5e34',s:-.12,st:1},
  {id:'seat',n:'Опорный брусок',c:'#b07a3c',s:-.05,st:1},
  {id:'frame',n:'Стропильная система',c:'#c98a4b',s:0,st:6},
  {id:'fix',n:'Крепёж и узлы',c:'#b6c4cd',s:.14,st:6},
  {id:'membrane',n:'Гидро-ветрозащита',c:'#b07cf0',s:.34,st:10},
  {id:'counter',n:'Контробрешётка',c:'#7dd3fc',s:.54,st:10},
  {id:'batten',n:'Обрешётка / настил',c:'#e0913f',s:.76,st:11},
  {id:'cover',n:'Покрытие',c:'#7c8b99',s:1.06,st:12},
  {id:'ridge',n:'Конёк и хребты',c:'#f4645f',s:1.36,st:13},
  {id:'trim',n:'Карниз / ветровые',c:'#cbd5cf',s:.34,st:9},
  {id:'gutter',n:'Водосток',c:'#4cc9f0',s:-.56,st:13},
  {id:'snow',n:'Снегозадержатели',c:'#fbbf24',s:1.24,st:13}
];

const texCache={};
function coverTex(kind){
  if(texCache[kind]) return texCache[kind];
  const c=document.createElement('canvas'); c.width=c.height=512; const x=c.getContext('2d'); let tw=1,th=1;
  if(kind==='metaltile'){ tw=1.1;th=.35; x.fillStyle='#e9ecef';x.fillRect(0,0,512,512);
    for(let i=0;i<6;i++){const g=x.createLinearGradient(i*512/6,0,(i+1)*512/6,0);
      g.addColorStop(0,'rgba(0,0,0,.28)');g.addColorStop(.18,'rgba(255,255,255,.36)');
      g.addColorStop(.55,'rgba(255,255,255,.05)');g.addColorStop(1,'rgba(0,0,0,.30)');
      x.fillStyle=g;x.fillRect(i*512/6,0,512/6,512);}
    const g2=x.createLinearGradient(0,396,0,512);
    g2.addColorStop(0,'rgba(255,255,255,.40)');g2.addColorStop(.22,'rgba(0,0,0,.38)');g2.addColorStop(1,'rgba(0,0,0,.12)');
    x.fillStyle=g2;x.fillRect(0,396,512,116); x.fillStyle='rgba(255,255,255,.34)';x.fillRect(0,392,512,3);
  } else if(kind==='seam'){ tw=.55;th=1; x.fillStyle='#e6e9ec';x.fillRect(0,0,512,512);
    for(let i=0;i<180;i++){x.strokeStyle=Math.random()>.5?'rgba(255,255,255,.08)':'rgba(0,0,0,.07)';
      x.lineWidth=Math.random()*2;const px=Math.random()*512;x.beginPath();x.moveTo(px,0);x.lineTo(px+(Math.random()-.5)*8,512);x.stroke();}
    [0,496].forEach(px=>{x.fillStyle='rgba(0,0,0,.34)';x.fillRect(px,0,16,512);
      x.fillStyle='rgba(255,255,255,.52)';x.fillRect(px+4,0,5,512);x.fillStyle='rgba(0,0,0,.22)';x.fillRect(px+12,0,4,512);});
  } else if(kind==='prof'){ tw=1;th=1; x.fillStyle='#e4e8ec';x.fillRect(0,0,512,512);
    for(let i=0;i<5;i++){const g=x.createLinearGradient(i*102,0,(i+1)*102,0);
      g.addColorStop(0,'rgba(0,0,0,.32)');g.addColorStop(.12,'rgba(255,255,255,.38)');
      g.addColorStop(.5,'rgba(255,255,255,.04)');g.addColorStop(1,'rgba(0,0,0,.32)');
      x.fillStyle=g;x.fillRect(i*102,0,102,512);}
  } else { tw=.90;th=.29; x.fillStyle='#cfc9c0';x.fillRect(0,0,512,512);
    const rows=2,cols=6,rh=512/rows,cw=512/cols;
    for(let r=0;r<rows;r++){const off=(r%2)*cw*.5;
      for(let i=-1;i<=cols;i++){const px=i*cw+off,py=r*rh;
        x.fillStyle=`rgba(255,255,255,${.04+Math.random()*.16})`;x.fillRect(px+2,py+2,cw-4,rh-4);
        x.fillStyle='rgba(0,0,0,.40)';x.fillRect(px,py,cw,3);x.fillStyle='rgba(0,0,0,.34)';x.fillRect(px,py,3,rh);
        x.fillStyle='rgba(0,0,0,.20)';x.fillRect(px,py+rh-7,cw,7);}}
    for(let i=0;i<9000;i++){x.fillStyle=Math.random()>.5?'rgba(255,255,255,.10)':'rgba(0,0,0,.10)';
      x.fillRect(Math.random()*512,Math.random()*512,1.5,1.5);} }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/tw,1/th);
  t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8; texCache[kind]=t; return t;
}
function woodTex(){
  if(texCache.__wood) return texCache.__wood;
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle='#eddfc9';x.fillRect(0,0,256,256);
  for(let i=0;i<110;i++){x.strokeStyle=Math.random()>.5?'rgba(122,80,38,.20)':'rgba(255,250,236,.45)';
    x.lineWidth=Math.random()*2.4+.4;let y=Math.random()*256;x.beginPath();x.moveTo(0,y);
    for(let px=0;px<=256;px+=16){y+=(Math.random()-.5)*4.5;x.lineTo(px,y);}x.stroke();}
  for(let i=0;i<5;i++){const kx=Math.random()*256,ky=Math.random()*256;x.strokeStyle='rgba(118,76,34,.22)';
    for(let r=3;r<11;r+=3){x.beginPath();x.ellipse(kx,ky,r,r*.55,0,0,Math.PI*2);x.stroke();}}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
  texCache.__wood=t;return t;
}
function bgTex(){const c=document.createElement('canvas');c.width=8;c.height=256;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#17271f');g.addColorStop(.42,'#101a17');g.addColorStop(.72,'#0c1412');g.addColorStop(1,'#070d0b');
  x.fillStyle=g;x.fillRect(0,0,8,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

const GEO={};
function cachedGeo(k,make){if(!(k in GEO)){const g=make();GEO[k]=geoOK(g)?g:null;}return GEO[k];}
function meshOf(g,mm_){if(!g||!mm_)return null;const me=new THREE.Mesh(g,mm_);me.castShadow=true;me.receiveShadow=true;return me;}
function box(w,h,d,mm_,x=0,y=0,z=0){
  if(![w,h,d,x,y,z].every(Number.isFinite)||w<=1e-4||h<=1e-4||d<=1e-4) return null;
  const g=new THREE.BoxGeometry(w,h,d); if(!geoOK(g)) return null;
  const me=new THREE.Mesh(g,mm_); me.position.set(x,y,z); me.castShadow=true; me.receiveShadow=true; return me; }
function extrude(pts,t,mm_,axis='z'){
  if(!ptsOK(pts)||!Number.isFinite(t)||t<=1e-4) return null;
  const s=new THREE.Shape(); pts.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1])); s.closePath();
  let g; try{g=new THREE.ExtrudeGeometry(s,{depth:t,bevelEnabled:false});}catch{return null;}
  if(!geoOK(g)) return null; if(axis==='y') g.rotateX(-Math.PI/2);
  const me=new THREE.Mesh(g,mm_); me.castShadow=true; me.receiveShadow=true; return me; }
function braceXY(a,b,depth,thick,mm_,z){
  if(!Array.isArray(a)||!Array.isArray(b)) return null;
  const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy);
  if(!(L>.05)||!(depth>.01)||!(thick>.005)) return null;
  const ux=dx/L, uy=dy/L, nx=-uy, ny=ux, hd=depth/2;
  const pts=[[a[0]+nx*hd,a[1]+ny*hd],[b[0]+nx*hd,b[1]+ny*hd],[b[0]-nx*hd,b[1]-ny*hd],[a[0]-nx*hd,a[1]-ny*hd]];
  const me=extrude(pts,thick,mm_);
  if(me) me.position.z=z-thick/2;
  return me; }
function uvRotate90(g){const uv=g&&g.attributes&&g.attributes.uv; if(!uv) return g;
  for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);uv.setXY(i,v,-u);} uv.needsUpdate=true; return g;}
function frameOf(f){const o=new THREE.Group();o.position.copy(T3(f.pos));o.rotation.set(f.rot.x,f.rot.y,f.rot.z);return o;}

function ringPrism(rA0,rB0,prof0,tA0,tB0){
  let prof=prof0,rA=rA0,rB=rB0,tA=tA0,tB=tB0;
  if(signedArea2(prof)<0){prof=prof.slice().reverse();rA=rA.slice().reverse();rB=rB.slice().reverse();
    tA=tA.slice().reverse();tB=tB.slice().reverse();}
  const n=prof.length,tris=tri2D(prof); if(!tris) return null;
  const arc=[0]; for(let i=1;i<n;i++) arc[i]=arc[i-1]+Math.hypot(prof[i][0]-prof[i-1][0],prof[i][1]-prof[i-1][1]);
  const pos=[],uv=[]; const push=(v,u,w)=>{pos.push(v.x,v.y,v.z);uv.push(u,w);};
  for(let i=0;i<n;i++){const j=(i+1)%n;
    push(rA[i],tA[i],arc[i]);push(rA[j],tA[j],arc[j]);push(rB[j],tB[j],arc[j]);
    push(rA[i],tA[i],arc[i]);push(rB[j],tB[j],arc[j]);push(rB[i],tB[i],arc[i]);}
  tris.forEach(t=>{ push(rA[t[2]],prof[t[2]][0]*3,prof[t[2]][1]*3);push(rA[t[1]],prof[t[1]][0]*3,prof[t[1]][1]*3);
    push(rA[t[0]],prof[t[0]][0]*3,prof[t[0]][1]*3);push(rB[t[0]],prof[t[0]][0]*3,prof[t[0]][1]*3);
    push(rB[t[1]],prof[t[1]][0]*3,prof[t[1]][1]*3);push(rB[t[2]],prof[t[2]][0]*3,prof[t[2]][1]*3);});
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals();
  return geoOK(g)?g:null; }
function loftPrism(ptsA,ptsB,profA){
  const n=ptsA.length,tris=tri2D(profA); if(!tris||ptsB.length!==n) return null;
  const pos=[],uv=[]; const push=(v,u,w)=>{pos.push(v.x,v.y,v.z);uv.push(u,w);};
  const arc=[0]; for(let i=1;i<n;i++) arc[i]=arc[i-1]+Math.hypot(profA[i][0]-profA[i-1][0],profA[i][1]-profA[i-1][1]);
  for(let i=0;i<n;i++){const j=(i+1)%n;
    push(ptsA[i],profA[i][0],arc[i]);push(ptsA[j],profA[j][0],arc[j]);push(ptsB[j],profA[j][0],arc[j]);
    push(ptsA[i],profA[i][0],arc[i]);push(ptsB[j],profA[j][0],arc[j]);push(ptsB[i],profA[i][0],arc[i]);}
  tris.forEach(t=>{push(ptsA[t[2]],profA[t[2]][0],profA[t[2]][1]*3);push(ptsA[t[1]],profA[t[1]][0],profA[t[1]][1]*3);
    push(ptsA[t[0]],profA[t[0]][0],profA[t[0]][1]*3);push(ptsB[t[0]],profA[t[0]][0],profA[t[0]][1]*3);
    push(ptsB[t[1]],profA[t[1]][0],profA[t[1]][1]*3);push(ptsB[t[2]],profA[t[2]][0],profA[t[2]][1]*3);});
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals();
  return geoOK(g)?g:null; }
function capProfile(up,n1,n2,side,ct,hw,th,lift){
  const d1=side.dot(n1),d2=side.dot(n2), nP=d1>=d2?n1:n2, nM=d1>=d2?n2:n1;
  const uP=Math.max(.18,up.dot(nP)),uM=Math.max(.18,up.dot(nM)),uC=Math.max(.18,up.dot(n1));
  const ls=lift/Math.max(.2,up.y), sC=ct/uC+ls;
  const sP=t=>(ct-t*side.dot(nP))/uP+ls, sM=t=>(ct-t*side.dot(nM))/uM+ls;
  return [[-hw,sM(-hw)],[0,sC],[hw,sP(hw)],[hw,sP(hw)-th],[0,sC-th],[-hw,sM(-hw)-th]]; }
function prism(O,axis,side,up,prof,cuts,material,opt={}){
  const n=prof.length,base=[]; const lo=Number.isFinite(opt.t0)?opt.t0:-.05, hi=Number.isFinite(opt.t1)?opt.t1:.05;
  const t0=new Array(n).fill(lo),t1=new Array(n).fill(hi);
  const Ax=T3(axis),Sd=T3(side),Up=T3(up),Or=T3(O);
  for(let i=0;i<n;i++){
    const v=Or.clone().addScaledVector(Sd,prof[i][0]).addScaledVector(Up,prof[i][1]); base.push(v);
    for(const ct of cuts){ const nd=T3(ct.n).dot(Ax); if(Math.abs(nd)<1e-6) continue;
      const th=(ct.c-T3(ct.n).dot(v))/nd; if(!Number.isFinite(th)) continue;
      const upper=ct.keepLE?(nd>0):(nd<0);
      if(upper) t1[i]=Math.min(t1[i],th); else t0[i]=Math.max(t0[i],th); }
    const lap=opt.lap||0; t0[i]-=lap; t1[i]+=lap;
    if(!Number.isFinite(t0[i])||!Number.isFinite(t1[i])||t1[i]-t0[i]<.012) return null; }
  const rA=base.map((v,i)=>v.clone().addScaledVector(Ax,t0[i])), rB=base.map((v,i)=>v.clone().addScaledVector(Ax,t1[i]));
  const g=ringPrism(rA,rB,prof,t0,t1); if(!g) return null;
  const mesh=new THREE.Mesh(g,material); mesh.castShadow=mesh.receiveShadow=true;
  const out={mesh}; const th=opt.plateTh||.022;
  if(opt.plateEnd){const rC=rB.map(v=>v.clone().addScaledVector(Ax,th));
    const gp=ringPrism(rB,rC,prof,t1,t1.map(t=>t+th)); if(gp){const mp=new THREE.Mesh(gp,material);mp.castShadow=true;out.plateEnd=mp;}}
  if(opt.plateStart){const rC=rA.map(v=>v.clone().addScaledVector(Ax,-th));
    const gp=ringPrism(rC,rA,prof,t0.map(t=>t-th),t0); if(gp){const mp=new THREE.Mesh(gp,material);mp.castShadow=true;out.plateStart=mp;}}
  return out; }
function tentFacet(A,B,C,n,thickness,material){
  const W=T3(n).normalize(), U=T3(B).sub(T3(A)); const lenU=U.length(); if(lenU<1e-5) return null;
  U.multiplyScalar(1/lenU); const Vv=new THREE.Vector3().crossVectors(W,U).normalize(); const d=T3(C).sub(T3(A));
  const prof=[[0,0],[lenU,0],[d.dot(U),d.dot(Vv)]];
  if(!ptsOK(prof)||Math.abs(polyArea2(prof))<1e-5) return null;
  const sh=new THREE.Shape(); prof.forEach((p,i)=>i?sh.lineTo(p[0],p[1]):sh.moveTo(p[0],p[1])); sh.closePath();
  let g; try{g=new THREE.ExtrudeGeometry(sh,{depth:thickness,bevelEnabled:false});}catch{return null;}
  if(!geoOK(g)) return null; g.translate(0,0,-thickness);
  const m4=new THREE.Matrix4().makeBasis(U,Vv,W); m4.setPosition(T3(A)); g.applyMatrix4(m4); g.computeVertexNormals();
  if(!geoOK(g)) return null;
  const me=new THREE.Mesh(g,material); me.castShadow=true; me.receiveShadow=true; return me; }
function markSprite(text){
  const c=document.createElement('canvas');c.width=256;c.height=80;const x=c.getContext('2d');
  x.fillStyle='rgba(10,17,14,.92)'; const r=14; x.beginPath(); x.moveTo(r,4);
  x.arcTo(252,4,252,76,r);x.arcTo(252,76,4,76,r);x.arcTo(4,76,4,4,r);x.arcTo(4,4,252,4,r);
  x.closePath();x.fill();x.strokeStyle='#ffc477';x.lineWidth=3;x.stroke();
  x.fillStyle='#ffc477';x.font='700 38px JetBrains Mono, monospace';x.textAlign='center';x.textBaseline='middle';x.fillText(text,128,42);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));
  sp.scale.set(.68,.21,1); sp.renderOrder=999; return sp; }

class LamBatch {
  constructor(){this.nails=[];this.bolts=[];}
  nail(p,d,len){const P=T3(p),D=T3(d); if(D.lengthSq()<1e-10||!(len>.01))return; this.nails.push({p:P,d:D.normalize(),len});}
  bolt(a,b,r){const A=T3(a),B=T3(b),D=B.clone().sub(A);const L=D.length(); if(!(L>.01))return;
    this.bolts.push({a:A,b:B,d:D.normalize(),L,r});}
  flush(group,mat){
    const q=d=>new THREE.Quaternion().setFromUnitVectors(UPV,d);
    if(this.nails.length){
      const hg=new THREE.CylinderGeometry(.0075,.0075,.004,12);hg.translate(0,.002,0);
      const sg=new THREE.CylinderGeometry(1,1,1,8);
      const hi=new THREE.InstancedMesh(hg,mat,this.nails.length), si=new THREE.InstancedMesh(sg,mat,this.nails.length);
      this.nails.forEach((n,i)=>{const qq=q(n.d);
        hi.setMatrixAt(i,new THREE.Matrix4().compose(n.p,qq,ONE));
        si.setMatrixAt(i,new THREE.Matrix4().compose(n.p.clone().addScaledVector(n.d,-n.len/2),qq,V3(.0026,n.len,.0026)));});
      hi.instanceMatrix.needsUpdate=si.instanceMatrix.needsUpdate=true;
      hi.frustumCulled=si.frustumCulled=false;hi.castShadow=si.castShadow=true;group.add(hi);group.add(si);}
    if(this.bolts.length){
      const mkHead=()=>{const w=new THREE.CylinderGeometry(.017,.017,.003,16);w.translate(0,.0015,0);
        const h=new THREE.CylinderGeometry(.013,.013,.009,6);h.translate(0,.0075,0);
        try{const g=mergeGeometries([w,h],false);w.dispose();h.dispose();return g;}catch{w.dispose();h.dispose();return null;}};
      const hg=mkHead(),ng=mkHead(),sg=new THREE.CylinderGeometry(1,1,1,10);
      if(hg&&ng){const hi=new THREE.InstancedMesh(hg,mat,this.bolts.length),ni=new THREE.InstancedMesh(ng,mat,this.bolts.length),
        si=new THREE.InstancedMesh(sg,mat,this.bolts.length);
        this.bolts.forEach((b,i)=>{hi.setMatrixAt(i,new THREE.Matrix4().compose(b.a,q(b.d.clone().negate()),ONE));
          ni.setMatrixAt(i,new THREE.Matrix4().compose(b.b,q(b.d),ONE));
          const p=b.a.clone().addScaledVector(b.d,-.012),r2=b.b.clone().addScaledVector(b.d,.014);
          si.setMatrixAt(i,new THREE.Matrix4().compose(p.clone().add(r2).multiplyScalar(.5),q(b.d),V3(b.r,p.distanceTo(r2),b.r)));});
        hi.instanceMatrix.needsUpdate=ni.instanceMatrix.needsUpdate=si.instanceMatrix.needsUpdate=true;
        hi.frustumCulled=ni.frustumCulled=si.frustumCulled=false;hi.castShadow=ni.castShadow=si.castShadow=true;
        group.add(hi);group.add(ni);group.add(si);}}
  }
}

const VERT_TAGS = new Set(['roomStud','kneeStud','upperKing','tieKing']);

export function createRoofStage(host){
  const scene=new THREE.Scene(); scene.background=bgTex(); scene.fog=new THREE.Fog('#0e1a16',46,124);
  const camera=new THREE.PerspectiveCamera(42,1,.05,400); camera.position.set(16,12,18);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap; renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.16; renderer.localClippingEnabled=true;
  host.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=.075; controls.minDistance=1.2; controls.maxDistance=96;
  controls.maxPolarAngle=Math.PI*.492; controls.target.set(0,1.2,0);
  scene.add(new THREE.HemisphereLight(0xbcd8ff,0x2a3a2c,.6));
  const key=new THREE.DirectionalLight(0xffdcae,2.9); key.position.set(16,24,12); key.castShadow=true;
  key.shadow.mapSize.set(2048,2048); key.shadow.radius=4;
  Object.assign(key.shadow.camera,{left:-30,right:30,top:30,bottom:-30,far:96});
  key.shadow.bias=-.0004; key.shadow.normalBias=.02; scene.add(key);
  const rim=new THREE.DirectionalLight(0x6fd0ff,1.05); rim.position.set(-18,9,-16); scene.add(rim);
  const fill=new THREE.PointLight(0xffb46b,.8,64,2); fill.position.set(-7,4,11); scene.add(fill);
  const cool=new THREE.PointLight(0x4cc9f0,.4,50,2); cool.position.set(11,2,-13); scene.add(cool);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(78,64),new THREE.MeshStandardMaterial({color:'#1b2a23',roughness:.88,metalness:.08}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-3.2; ground.receiveShadow=true; scene.add(ground);
  const grid=new THREE.GridHelper(78,78,0x44594c,0x24312b); grid.position.y=-3.19; scene.add(grid);
  const N=200,arr=new Float32Array(N*3);
  for(let i=0;i<N;i++){arr[i*3]=(Math.random()-.5)*56;arr[i*3+1]=Math.random()*18-3;arr[i*3+2]=(Math.random()-.5)*56;}
  const dg=new THREE.BufferGeometry(); dg.setAttribute('position',new THREE.BufferAttribute(arr,3));
  const dust=new THREE.Points(dg,new THREE.PointsMaterial({color:0xffd9a8,size:.05,transparent:true,opacity:.38,depthWrite:false})); scene.add(dust);
  const markGroup=new THREE.Group(); markGroup.userData.isMarks=true; scene.add(markGroup);
  const clipPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
  const hiMat=new THREE.MeshStandardMaterial({color:'#ffc477',emissive:'#e0913f',emissiveIntensity:.55,roughness:.4,metalness:.2});

  let root=null,LG={},M=null,P=null,marks=[],meshCount=0,hwCount=0,hwErrors=[],hovered=null,tween=null,framed=false;
  const view={stage:13,explode:0,wire:0,grid:1,marks:1,secOn:0,sec:0,vis:{}};
  ROOF_LAYERS.forEach(l=>view.vis[l.id]=1);
  const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();

  function mat(color,o={}){
    const m=new THREE.MeshStandardMaterial({color,roughness:o.r??.85,metalness:o.m??0,transparent:!!o.t,opacity:o.o??1,
      side:o.side??THREE.FrontSide,wireframe:!!view.wire,map:o.map||null});
    if(view.secOn){m.clippingPlanes=[clipPlane];m.clipShadows=true;} return m; }
  function disposeTree(o){
    const cached=new Set(Object.values(GEO).filter(Boolean)), done=new Set();
    o.traverse(c=>{ if(c.geometry&&!cached.has(c.geometry)&&!done.has(c.geometry)){done.add(c.geometry);c.geometry.dispose();}
      if(c.material){const a=Array.isArray(c.material)?c.material:[c.material];
        a.forEach(x=>{if(x!==hiMat&&!done.has(x)){done.add(x);x.dispose();}});} }); }
  function frameView(animate=false){
    if(!M) return;
    const t=V3(0,cl((M.apex+M.eaveY)/2,-2,8)*.6,0), d=Math.max(15,M.W*1.4,M.L*1.2), p=V3(d*.62,d*.46,d*.72);
    if(animate){controls.enabled=false;tween={t,p};} else {controls.target.copy(t);camera.position.copy(p);controls.update();} }

  function rebuild(model,params){
    REJECTED=0; hwErrors=[];
    if(root){scene.remove(root);disposeTree(root);root=null;}
    clearHover();
    M=model;P=params;LG={};marks=[];meshCount=0;hwCount=0;
    root=new THREE.Group(); root.userData.isRoofRoot=true; scene.add(root);
    ROOF_LAYERS.forEach(l=>{const g=new THREE.Group();g.userData.layerId=l.id;LG[l.id]=g;root.add(g);});

    const m=M,cv=m.cv,L=LG,wt=woodTex();
    const MSD=m.mansardOn?m.mansard:null;
    const broken=!!(MSD&&MSD.scheme==='broken'), ridgeScheme=!!(MSD&&MSD.scheme==='ridge');
    const lowCa=MSD?Math.cos(MSD.lowA):m.ca;
    const upCa=broken?Math.cos(MSD.highA):m.ca, upSa=broken?Math.sin(MSD.highA):m.sa;
    const roofAtW = MSD ? (x=>{const ax=Math.abs(x);
      return broken ? (ax<=MSD.breakX ? MSD.ridgeY-ax*Math.tan(MSD.highA) : MSD.breakY-(ax-MSD.breakX)*Math.tan(MSD.lowA))
                    : MSD.ridgeY-ax*Math.tan(MSD.lowA);}) : null;

    const byGroup=new Map();
    (params.__pieces||[]).forEach(pc=>{if(!byGroup.has(pc.g))byGroup.set(pc.g,[]);byGroup.get(pc.g).push(pc);});
    const markLen=(g,lenM)=>{const arr=byGroup.get(g); if(!arr||!arr.length||!Number.isFinite(lenM)) return null;
      const target=Math.round(lenM*1000); let best=arr[0],bd=Infinity;
      for(const pc of arr){const d=Math.abs(Math.round(pc.len*1000)-target); if(d<bd){bd=d;best=pc;}} return best.mark;};

    const mPlate=mat('#8b5e34',{r:.9,map:wt}),mCrown=mat('#6d4a2a',{r:.95,map:wt}),
      mSeat=mat('#b07a3c',{r:.85,map:wt}),mFrame=mat('#c98a4b',{r:.82,map:wt}),
      mTie=mat('#d8a05a',{r:.75,map:wt}),mJoist=mat('#7a5a34',{r:.9,map:wt}),
      mKnee=mat('#a9764a',{r:.88,map:wt}),mWeb=mat('#c08a4a',{r:.82,map:wt}),
      mPurlin=mat('#b8813a',{r:.8,map:wt}),mGlulam=mat('#d8b070',{r:.7,map:wt}),
      mFloor=mat('#a8794c',{r:.9,map:wt}),mCeil=mat('#e4d7c2',{r:.85}),
      mHipCore=mat('#6f4a22',{r:.92,map:wt}),mHipA=mat('#c98f4e',{r:.78,map:wt}),mHipB=mat('#bf8443',{r:.8,map:wt}),
      mLam=mat('#cfd9e0',{r:.3,m:.82}),mSnowTube=mat('#e0a52c',{r:.38,m:.6}),
      mIns=mat('#a3e635',{r:.95}),mVap=mat('#38bdf8',{r:.35,t:1,o:.5,side:THREE.DoubleSide}),
      mLin=mat('#d9b382',{r:.8}),mMem=mat('#b07cf0',{r:.4,t:1,o:.6,side:THREE.DoubleSide}),
      mCnt=mat('#7dd3fc',{r:.7}),mBat=mat('#e0913f',{r:.8}),mDeck=mat('#caa472',{r:.85}),
      mCov=mat(cv.col,{r:params.cover==='shingle'?.92:.34,m:params.cover==='shingle'?0:.6,map:coverTex(params.cover),side:THREE.DoubleSide}),
      mRidge=mat(new THREE.Color(cv.col).offsetHSL(0,-.05,.08).getStyle(),{r:.32,m:.58}),mJoint=mat('#e05a55',{r:.36,m:.5}),
      mTrim=mat('#cbd5cf',{r:.6,m:.15}),mGut=mat('#4cc9f0',{r:.3,m:.6}),mSof=mat('#d6cfc0',{r:.75});
    const MATS={frame:mFrame,web:mWeb,glulam:mGlulam,steel:mLam,purlin:mPurlin,knee:mKnee,plate:mPlate,floor:mFloor,ceil:mCeil};
    const LAYER_OF={2:'joists',1:'plate',5:'frame',6:'frame',7:'frame',8:'frame',10:'lining'};

    const put=(g,me,st,mk)=>{if(!me)return;me.userData.st=st;if(mk)me.userData.mk=mk;g.add(me);};
    const faceSeat=f=>{
      if(!MSD) return m.seatMode==='notch'?{xsi:m.Xsi,xso:m.Xso}:null;
      if(f.tag==='upper') return null;
      const xsi=f.tag==='lower'?(m.half-m.pw/2-MSD.breakX)/f.ca:(m.half-m.pw/2)/f.ca;
      return {xsi,xso:xsi+m.seatW/f.ca}; };

    try{
      if(m.joistsOn){ const jl=Math.max(.3,m.span-m.pw), mk=markLen('joist',jl);
        for(let i=0;i<m.joistN;i++) put(L.joists,box(jl,m.jd,m.jt,mJoist,0,-m.jd/2,-m.length/2+m.length*i/(m.joistN-1)),2,mk); }
      const CROWN_H=.18;
      [{s:1,axis:'x',len:m.plateLenZ},{s:-1,axis:'x',len:m.plateLenZ},{s:1,axis:'z',len:m.span},{s:-1,axis:'z',len:m.span}]
        .forEach(r=>{ const half=r.axis==='x'?m.span/2:m.length/2;
          const px=r.axis==='x'?r.s*half:0, pz=r.axis==='x'?0:r.s*half;
          const w=r.axis==='x'?m.pw:r.len, d=r.axis==='x'?r.len:m.pw;
          put(L.plate,box(w,m.ph,d,mPlate,px,-m.ph/2,pz),1,markLen('plate',r.len));
          put(L.plate,box(w,CROWN_H,d,mCrown,px,-m.ph-CROWN_H/2,pz),1); });

      if(MSD && Array.isArray(MSD.parts)){
        MSD.parts.forEach(q=>{
          const zs = q.zs==='tie'?m.tieZ : q.zs==='upper'?m.upperZ : [0];
          const mm_=MATS[q.mat]||mFrame;
          const layer=LG[LAYER_OF[q.st]||'frame']||L.frame;
          const mk=Array.isArray(q.mk)?markLen(q.mk[0],q.mk[1]):null;
          zs.forEach(z=>{
            if(!Number.isFinite(z)) return;
            let me=null;
            if(q.t==='box'&&Array.isArray(q.s)) me=box(q.s[0],q.s[1],q.s[2],mm_,q.p[0],q.p[1],q.zs?z:q.p[2]);
            else if(q.t==='brace') me=braceXY(q.a,q.b,q.depth,q.thick,mm_,z);
            if(!me) return;
                        me.userData[q.tag]=true; me.userData.msPart=q.tag;
            if(VERT_TAGS.has(q.tag)) me.userData.vertSupport=true;
            if(q.tag==='gableBearing') me.position.y=m.beamTop-m.ridgeBeamSect[1]/1000-.012;
            /* Осевые точки детали в её локальных координатах: у бруса — верх по центру,
               у раскоса — оба конца. Именно их солвер держит под кровлей. */
            me.userData.msAxis=q.t==='box'?[[0,q.s[1]/2,0]]:[[q.a[0],q.a[1],0],[q.b[0],q.b[1],0]];
            put(layer,me,q.st,mk);
          });
        });
      }

      const wedge=len=>{const a=-m.pw/2-m.blockLip,b=m.pw/2,s=-m.pw/2+m.seatW;
        return extrude([[a,0],[b,0],[b,m.blockFloorY],[s,m.blockFloorY],[s,m.blockH],[a,m.blockH]],len,mSeat);};
      if(!MSD&&m.seatMode==='block'){
        [-1,1].forEach(s=>{const a=wedge(m.plateLenZ);
          if(a){a.geometry.translate(0,0,-m.plateLenZ/2);a.position.set(s*m.span/2,0,0);a.rotation.y=s>0?0:Math.PI;put(L.seat,a,1,markLen('seat',m.plateLenZ));}
          if(m.type==='hip'){const b2=wedge(m.span);
            if(b2){b2.geometry.translate(0,0,-m.span/2);b2.position.set(0,0,s*m.length/2);b2.rotation.y=s>0?-Math.PI/2:Math.PI/2;put(L.seat,b2,1,markLen('seat',m.span));}}});
      } else if(!MSD&&m.seatMode==='cleat'){
        const mk=markLen('seat',m.cleatLen);
        m.rafters.filter(r=>!r.jack).forEach(r=>{
          const wp=T3(r.f.pos).addScaledVector(T3(r.f.basis.X),(m.Xsi+m.Xso)/2).addScaledVector(T3(r.f.basis.Z),r.z);
          const isSide=Math.abs(Math.abs(wp.x)-m.span/2)<.4; const a=wedge(m.cleatLen); if(!a) return;
          a.geometry.translate(0,0,-m.cleatLen/2);
          if(isSide){a.position.set(Math.sign(wp.x)*m.span/2,0,wp.z);a.rotation.y=wp.x>0?0:Math.PI;}
          else{a.position.set(wp.x,0,Math.sign(wp.z)*m.length/2);a.rotation.y=wp.z>0?-Math.PI/2:Math.PI/2;}
          put(L.seat,a,1,mk);});
      }

      const rbW=m.ridgeBeamSect[0]/1000, rbH=m.ridgeBeamSect[1]/1000;
      const beam=box(rbW,rbH,m.ridgeLen,ridgeScheme?mGlulam:mFrame,0,m.beamTop-rbH/2,0);
      if(beam){beam.userData.ridgeBeam=true;beam.userData.sect=m.ridgeBeamSect.slice();put(L.frame,beam,4,markLen('beam',m.ridgeLen));}
      if(m.postZ.length){
        put(L.frame,box(m.sw,m.sh,m.sleeperLen,mFrame,0,m.sh/2,m.sleeperZ),3,markLen('sleeper',m.sleeperLen));
        const postMk=markLen('post',m.postH),braceMk=markLen('brace',m.braceLen);
        m.postZ.forEach(z=>{
          const pm=box(m.sw,m.postH,m.sh,mFrame,0,m.sleeperTop+m.postH/2,z);
          if(pm){pm.userData.vertSupport=true;put(L.frame,pm,4,postMk);}
          if(params.braces) [-1,1].forEach(s=>{
            const F=[s*(m.sw/2+.02),m.sleeperTop+.18],H=[s*m.dBrace,m.braceHeadY];
            if(Math.hypot(H[0]-F[0],H[1]-F[1])<.2) return;
            const me=braceXY(F,H,.15,m.rt,mFrame,z);
            if(me) put(L.frame,me,7,braceMk);});});
      }

      const tieMk=markLen('tie',2*m.tieHalf);
      m.tieZ.forEach(z=>{
        if(MSD){ const me=box(2*m.tieHalf,m.th,m.tt,mTie,0,m.tieY+m.th/2,z);
          if(me){me.userData.mansardTie=true;me.userData.tieTop=m.tieY+m.th;put(L.frame,me,6,tieMk);
            marks.push({mark:tieMk,pos:V3(m.tieHalf*.7,m.tieY+m.th/2,z),st:6});} return; }
        const xw=m.tieHalf+1;
        let poly=[[-xw,m.tieY],[xw,m.tieY],[xw,m.tieY+m.th],[-xw,m.tieY+m.th]];
        const ceil=m.tieCeil(z);
        poly=clipPoly(poly,m.tieMode==='side'
          ?[{nx:m.ta,ny:1,c:m.topPlaneC},{nx:-m.ta,ny:1,c:m.topPlaneC},{nx:0,ny:1,c:ceil}]
          :[{nx:m.ta,ny:1,c:m.apex},{nx:-m.ta,ny:1,c:m.apex},{nx:0,ny:1,c:ceil}]);
        if(!poly||polyArea2(poly)<.05) return;
        const xs=poly.map(q=>q[0]),maxX=Math.max(...xs); if(maxX-Math.min(...xs)<.5) return;
        for(let s=0;s<m.tieSides;s++){
          const sg=m.tieSides===2?(s?1:-1):1, zOff=m.tieMode==='side'?sg*(m.rt/2+m.tt/2):0;
          const me=extrude(poly,m.tt,mTie);
          if(me){me.position.set(0,0,z+zOff-m.tt/2);put(L.frame,me,6,tieMk);
            marks.push({mark:tieMk,pos:V3(maxX*.75,m.tieY+m.th/2,z+zOff),st:6});}}
      });

      const lam=new LamBatch();
      m.hips.forEach(h=>{
        const J=T3(h.J),Ax=T3(h.axis),Sd=T3(h.side),Up=T3(h.up), hipMk=markLen('hip',h.full+h.ext);
        const cuts=[{n:V3(0,0,Math.sign(h.zr)||1),c:m.ridgeHalf,keepLE:false},{n:V3(h.sx,0,0),c:0,keepLE:false},
          {n:V3(h.sx,0,0),c:h.endX,keepLE:true},{n:V3(0,0,h.sz),c:h.endZ,keepLE:true}];
        const opt={t0:-.03,t1:h.full+h.ext+.05}, sC=h.sC, bot=sC-m.hipDepth;
        const sAt=t=>t>=0?(m.rd-t*h.sP)/h.uP:(m.rd-t*h.sM)/h.uM;
        const core=prism(J,Ax,Sd,Up,[[-m.hipW/2,sAt(-m.hipW/2)],[0,sC],[m.hipW/2,sAt(m.hipW/2)],[m.hipW/2,bot],[-m.hipW/2,bot]],cuts,mHipCore,opt);
        if(core) put(L.frame,core.mesh,5,hipMk);
        const bt=m.hipBoardT,seam=.0009,proud=.0010;
        for(let k=0;k<m.hipLam;k++){
          const a=-m.hipW/2+k*bt+seam,b=-m.hipW/2+(k+1)*bt-seam; if(!(b-a>.012)) continue;
          const prof=[[a,sAt(a)+proud]]; if(a<0&&b>0) prof.push([0,sC+proud]);
          prof.push([b,sAt(b)+proud]);prof.push([b,bot+.002]);prof.push([a,bot+.002]);
          const bd=prism(J,Ax,Sd,Up,prof,cuts,k%2?mHipB:mHipA,opt); if(bd) put(L.frame,bd.mesh,5,hipMk);}
        const total=h.full+h.ext, nNail=Math.max(3,Math.ceil(total/.4)), rowU=[sC-m.hipDepth*.32,sC-m.hipDepth*.68];
        for(let i=0;i<=nNail;i++){const t=cl(total*i/nNail,.06,total-.06);
          rowU.forEach((u,ri)=>{const shift=((i+ri)%2?.5:-.5)*(total/nNail)*.45, tt=cl(t+shift,.06,total-.06);
            [-1,1].forEach(s=>{const face=J.clone().addScaledVector(Ax,tt).addScaledVector(Up,u).addScaledVector(Sd,s*m.hipW/2);
              lam.nail(face,Sd.clone().multiplyScalar(s),m.hipW*.82);});});}
        const nBolt=Math.max(2,Math.ceil(total/1.2));
        for(let i=0;i<=nBolt;i++){const t=cl(total*i/nBolt,.12,total-.12),u=sC-m.hipDepth*.5;
          lam.bolt(J.clone().addScaledVector(Ax,t).addScaledVector(Up,u).addScaledVector(Sd,m.hipW/2),
                   J.clone().addScaledVector(Ax,t).addScaledVector(Up,u).addScaledVector(Sd,-m.hipW/2),.006);}
        marks.push({mark:hipMk,pos:J.clone().add(T3(h.B)).multiplyScalar(.5).addScaledVector(Up,.22),st:5});
      });
      if(m.hips.length){const lg=new THREE.Group();lam.flush(lg,mLam);
        if(lg.children.length){lg.traverse(o=>{if(o.isMesh||o.isInstancedMesh){o.userData.st=5;o.userData.hw=true;}});L.frame.add(lg);}}

      m.faces.forEach((f,fi)=>{
        const addTo=(id,me,st,mk)=>{if(!me)return;const fr=frameOf(f);fr.add(me);me.userData.st=st;if(mk)me.userData.mk=mk;L[id].add(fr);};
        const addAll=(id,a2,st)=>{if(!a2.length)return;const fr=frameOf(f);a2.forEach(a=>{a.userData.st=st;fr.add(a);});L[id].add(fr);};
        const fRL=f.rl,fPie=f.rlPie;
        const zh=x=>m.zHalfPie(f,x);
        const poly=(x0,x1)=>[[x0,-zh(x0)],[x0,zh(x0)],[x1,zh(x1)],[x1,-zh(x1)]];
        const seat=faceSeat(f), insEnd=MSD?Math.max(.3,fRL-.12):m.insulEnd;
        const rf=[];
        m.rafters.filter(r=>r.f===f).forEach((r,ri)=>{
          const D=m.rd,ta=f.ta, mk=markLen(r.jack?'jack':'rafter',r.len), st=r.jack?8:6;
          let me=null;
          if(r.cheek){const c=r.cheek;
            const profA=[[c.xA0,0],[fRL,0],[fRL-D*ta,D],[c.xA1,D]], profB=[[c.xB0,0],[fRL,0],[fRL-D*ta,D],[c.xB1,D]];
            if(ptsOK(profA)&&ptsOK(profB)){const zA=r.z-m.rt/2,zB=r.z+m.rt/2;
              const g=loftPrism(profA.map(q=>({x:q[0],y:q[1],z:zA})),profB.map(q=>({x:q[0],y:q[1],z:zB})),profA);
              if(g) me=meshOf(g,mFrame);}}
          if(!me){
            const joints=(r.joints||[]).map(j=>j.X).filter(X=>X>r.x0+.45&&X<fRL-.45).sort((a,b)=>a-b);
            const GAP=.004,bounds=[r.x0]; joints.forEach(X=>bounds.push(X-GAP/2,X+GAP/2)); bounds.push(fRL);
            for(let si=0;si<bounds.length-1;si+=2){
              const xa=bounds[si],xb=bounds[si+1]; if(!(xb-xa>.06)) continue;
              const notch=(seat&&xa<seat.xsi-.02&&seat.xso<xb-.02)
                ?[[seat.xsi,0],[seat.xsi+m.seatW*f.ca,m.seatW*f.sa],[seat.xso,0]]:[];
              const xaTop=Math.min(Math.max(xa-D*ta,Number.isFinite(f.xTopLimit)?f.xTopLimit:-1e9),xb-D*ta-.01);
              const seg=extrude([[xa,0],...notch,[xb,0],[xb-D*ta,D],[xaTop,D]],m.rt,mFrame);
              if(seg){seg.position.z=r.z-m.rt/2;seg.userData.st=st;seg.userData.mk=mk;
                seg.userData.segLen=+(xb-xa).toFixed(4);seg.userData.faceTag=f.tag;rf.push(seg);}}
          } else {me.userData.st=st;me.userData.mk=mk;me.userData.segLen=+r.len.toFixed(4);me.userData.faceTag=f.tag;rf.push(me);}
          if(ri%3===0){const wp=T3(f.pos).addScaledVector(T3(f.basis.X),(r.x0+fRL)/2).addScaledVector(T3(f.basis.Y),m.rd+.12).addScaledVector(T3(f.basis.Z),r.z);
            marks.push({mark:mk,pos:wp,st});}
        });
        addAll('frame',rf,6);

        if(m.warm){
          const ins=[],zs=m.faceZ[fi]||[],zl=f.zLimit||1e9,yBot=m.rd-m.it;
          for(let i=0;i<zs.length-1;i++){
            const z0=zs[i]+m.rt/2+.005,z1=zs[i+1]-m.rt/2-.005;
            if(z1-z0<.06||Math.max(Math.abs(z0),Math.abs(z1))>zl+1e-6) continue;
            const xa=m.xMin(f,Math.abs(z0))+.01,xb=m.xMin(f,Math.abs(z1))+.01;
            if(insEnd-Math.max(xa,xb)<.12) continue;
            const me=extrude([[xa,z0],[xb,z1],[insEnd,z1],[insEnd,z0]],m.it,mIns,'y');
            if(me){me.position.y=yBot;ins.push(me);}}
          addAll('insul',ins,10);
          const zA=Math.min(zh(0),zl),zB=Math.min(zh(insEnd),zl);
          const vp=[[0,-zA],[0,zA],[insEnd,zB],[insEnd,-zB]];
          const vm=extrude(vp,.004,mVap,'y'); if(vm){vm.position.y=yBot-.004;addTo('vapor',vm,10);}
          if(!MSD){const ln=extrude(vp,.016,mLin,'y'); if(ln){ln.position.y=yBot-.020;addTo('lining',ln,10);}}
          if(m.extraIns>.001){const cb=[];
            for(let x=.3;x<insEnd-.05;x+=.6){const half=Math.min(zh(x),zl); if(half<.15) continue;
              const b=box(.05,m.extraIns,half*2,mFrame,x,yBot+m.extraIns/2,0);
              if(b){b.userData.mk=markLen('extra',half*2);cb.push(b);}}
            addAll('frame',cb,10);}
        }
        /* Пирог лежит на ВЕРХНЕЙ грани стропилы, а не на нижней: её начало сдвинуто
           к коньку на rd·tgα. Иначе весь пирог съезжает вниз по скату на rd·sinα. */
        const xTop=Number.isFinite(f.xPie0)?f.xPie0:-m.rd*f.ta;
        const mem=extrude(poly(xTop,fPie),m.memT,mMem,'y'); if(mem){mem.position.y=m.yMem;addTo('membrane',mem,10);}
        const cn=[];
        m.rafters.filter(r=>r.f===f).forEach(r=>{const cl2=r.len-.06;
          const b=box(cl2,.05,.05,mCnt,r.x0+xTop+cl2/2+.03,m.yCnt+.025,r.z);
          if(b){b.userData.mk=markLen('counter',cl2);cn.push(b);}});
        addAll('counter',cn,10);
        if(m.solid){const d=extrude(poly(xTop,fPie),m.deckT,mDeck,'y'); if(d){d.position.y=m.yBat;addTo('batten',d,11);}}
        else{const bt=[]; m.rows.filter(r=>r.f===f).forEach(r=>{
          const b=box(.1,m.batT,r.len,mBat,r.x,m.yBat+m.batT/2,0);
          if(b){b.userData.mk=markLen('batten',r.len);bt.push(b);}}); addAll('batten',bt,11);}
        const cm=extrude(poly(xTop,fPie),m.covT,mCov,'y');
        if(cm){uvRotate90(cm.geometry);cm.position.y=m.covY;cm.userData.faceTag=f.tag;addTo('cover',cm,12);}



        if(params.snow && f.snowRows && f.snowRows.length){
          const sn=[];
          f.snowRows.forEach(x0=>{
            const x=Math.min(x0,fPie-.30); if(x<.30) return;
            const len=2*zh(x)-.4; if(len<.6) return;
            const tg=cachedGeo('snowT'+len.toFixed(2),()=>new THREE.CylinderGeometry(.022,.022,len,12));
            const tube=meshOf(tg,mSnowTube);
            if(tube){tube.rotation.x=Math.PI/2;tube.position.set(x,m.coverTop+.105,0);sn.push(tube);}
            const n=Math.max(2,Math.round(len/.9));
            const baseG=cachedGeo('snowBase',()=>new THREE.BoxGeometry(.075,.005,.055));
            const postG=cachedGeo('snowPost',()=>new THREE.CylinderGeometry(.016,.019,.088,10));
            const colG=cachedGeo('snowCol',()=>new THREE.TorusGeometry(.026,.006,8,14));
            const scrG=cachedGeo('snowScr',()=>new THREE.CylinderGeometry(.005,.005,.05,8));
            for(let i=0;i<=n;i++){
              const z=-len/2+len*i/n;
              const bp=meshOf(baseG,mLam); if(bp){bp.position.set(x,m.coverTop+.0025,z);sn.push(bp);}
              const st=meshOf(postG,mLam); if(st){st.position.set(x,m.coverTop+.047,z);sn.push(st);}
              const co=meshOf(colG,mLam); if(co){co.position.set(x,m.coverTop+.105,z);sn.push(co);}
              [-1,1].forEach(s=>{const sc=meshOf(scrG,mLam);
                if(sc){sc.position.set(x+s*.022,m.coverTop-.020,z);sn.push(sc);}});
            }
          });
          addAll('snow',sn,13);
        }
        if(!f.isBreakEnd) addTo('trim',box(.13,.02,2*zh(fPie),mTrim,fPie-.02,m.coverTop+.018,0),9);
        if(m.type==='gable'){const rakeMk=markLen('rake',fRL);
          [-1,1].forEach(q=>addTo('trim',box(fRL,m.rd*.8,.025,mTrim,fRL/2,m.rd*.4-.02,q*(f.zBot+.016)),9,rakeMk));}
      });

      /* Переломная планка: гнутый лист, лежащий на обоих скатах, с подъёмом по излому. */
      if(broken && MSD && Number.isFinite(m.msMiter)){
        const hiA=MSD.highA, loA=MSD.lowA, t=m.coverTop, s=m.msMiter;
        const cH=Math.cos(hiA), sH=Math.sin(hiA), cL=Math.cos(loA), sL=Math.sin(loA);
        const dOut=-s*cL+t*sL;
        const mx=MSD.breakX+dOut, my=MSD.breakY+t/cH-dOut*Math.tan(hiA);
        const lu=.18, ll=.24, lift=.014, th=.012, len=m.L;
        [-1,1].forEach(sg=>{
          const P=(dx,dy)=>[sg*(mx+dx),my+dy];
          const band=e=>[P(-cH*lu+sH*e, sH*lu+cH*e), P(0,lift*1.7+(e-lift)), P(cL*ll+sL*e, -sL*ll+cL*e)];
          const prof=[...band(lift),...band(lift-th).reverse()];
          const me=extrude(prof,len,mRidge);
          if(me){me.geometry.translate(0,0,-len/2);me.userData.breakFlashing=true;put(L.ridge,me,13);}
        });
      }

      const LIFT=.018,CAP_TH=.030,TENT_LIFT=.034,TENT_TH=.030,TENT_L=.36;
      const apexY=m.apex+m.coverTop/upCa+LIFT;
      const ridgeCuts=[],junctions=[];
      if(m.type==='hip'){
        m.hips.forEach(h=>{const Jc=V3(0,apexY,h.zr);
          const n=V3(0,0,Math.sign(h.zr)||1).sub(T3(h.axis)).normalize();
          const cut={n,c:n.dot(Jc),keepLE:true}; ridgeCuts.push(cut);
          junctions.push({h,Jc,cut,mutual:{n:V3(h.sx,0,0),c:0,keepLE:false}});});
      } else { ridgeCuts.push({n:V3(0,0,1),c:m.ridgeLen/2,keepLE:true}); ridgeCuts.push({n:V3(0,0,-1),c:m.ridgeLen/2,keepLE:true}); }
      if(m.ridgeLen>.05){
        const up=V3(0,1,0),side=V3(1,0,0),axis=V3(0,0,1);
        const prof=capProfile(up,V3(upSa,upCa,0),V3(-upSa,upCa,0),side,m.coverTop,.17,CAP_TH,LIFT);
        const cap=prism(V3(0,m.apex,0),axis,side,up,prof,ridgeCuts,mRidge,
          {t0:-m.ridgeLen/2-.02,t1:m.ridgeLen/2+.02,lap:.008,plateStart:m.type!=='hip',plateEnd:m.type!=='hip'});
        if(cap){put(L.ridge,cap.mesh,13);put(L.ridge,cap.plateStart,13);put(L.ridge,cap.plateEnd,13);
          const bg=new THREE.CylinderGeometry(.036,.036,m.ridgeLen+.02,14);
          if(geoOK(bg)){const bd=new THREE.Mesh(bg,mRidge);bd.rotation.x=Math.PI/2;bd.position.set(0,apexY+.020,0);bd.castShadow=true;put(L.ridge,bd,13);}}
      }
      junctions.forEach(j=>{
        const h=j.h, prof=capProfile(T3(h.up),T3(h.n1),T3(h.n2),T3(h.side),m.coverTop,.16,CAP_TH,LIFT);
        const cap=prism(T3(h.J),T3(h.axis),T3(h.side),T3(h.up),prof,
          [j.cut,j.mutual,{n:V3(h.sx,0,0),c:h.endX,keepLE:true},{n:V3(0,0,h.sz),c:h.endZ,keepLE:true}],
          mRidge,{t0:-.05,t1:h.full+h.ext+.05,lap:.008});
        if(cap) put(L.ridge,cap.mesh,13);
        const start=j.Jc.clone().add(V3(0,.020,0));
        const end=T3(h.B).addScaledVector(T3(h.axis),h.ext).addScaledVector(T3(h.up),prof[1][1]).add(V3(0,.020,0));
        const dv=end.clone().sub(start),len=dv.length();
        if(len>.05){const bg=new THREE.CylinderGeometry(.032,.032,len+.04,12);
          if(geoOK(bg)){const bd=new THREE.Mesh(bg,mRidge);bd.position.copy(start).add(end).multiplyScalar(.5);
            bd.quaternion.setFromUnitVectors(UPV,dv.normalize());bd.castShadow=true;put(L.ridge,bd,13);}}
      });
      if(m.type==='hip') [-1,1].forEach(sz=>{
        const atEnd=m.hips.filter(h=>Math.sign(h.zr)===sz); if(atEnd.length<2) return;
        const hP=atEnd.find(h=>h.sx>0),hM=atEnd.find(h=>h.sx<0); if(!hP||!hM) return;
        const A0=V3(0,m.apex+m.coverTop/m.ca+TENT_LIFT,sz*m.ridgeHalf), dRidge=V3(0,0,-sz);
        [[V3(m.sa,m.ca,0),dRidge,T3(hP.axis)],[V3(-m.sa,m.ca,0),dRidge,T3(hM.axis)],
         [V3(0,m.ca,m.sa*sz),T3(hP.axis),T3(hM.axis)]].forEach(([n,dA,dB])=>{
          const me=tentFacet(A0.clone(),A0.clone().addScaledVector(dA,TENT_L),A0.clone().addScaledVector(dB,TENT_L),n,TENT_TH,mJoint);
          if(me) put(L.ridge,me,13);});
        const knob=new THREE.SphereGeometry(.052,18,12);
        if(geoOK(knob)){const sp=new THREE.Mesh(knob,mJoint);sp.position.copy(A0).add(V3(0,.012,0));sp.castShadow=true;put(L.ridge,sp,13);}
      });

      const ez=m.L/2,ex=m.W/2,fH=m.rd/lowCa+.05,fY=m.eaveY+m.rd/(2*lowCa)-.02;
      [-1,1].forEach(s=>put(L.trim,box(.03,fH,m.L,mTrim,s*(ex+.016),fY,0),9,markLen('fascia',m.L)));
      if(m.type==='hip') [-1,1].forEach(s=>put(L.trim,box(m.W+.06,fH,.03,mTrim,0,fY,s*(ez+.016)),9,markLen('fascia',m.W)));
      if(params.soffit){
        [-1,1].forEach(s=>put(L.soffit,box(m.eave,.02,m.L,mSof,s*(m.span/2+ex)/2,m.eaveY-.03,0),13));
        if(m.type==='hip') [-1,1].forEach(s=>put(L.soffit,box(m.W,.02,m.eave,mSof,0,m.eaveY-.03,s*(m.length/2+ez)/2)),13);}
      if(params.gutter){
        const R=.066,wallX=m.span/2,wallZ=m.length/2;
        const edgeX=ex+m.fasciaOut,edgeY=m.eaveY+m.rd/lowCa+.02,gx=edgeX+.02,gy=edgeY-.05;
        const prof=[];
        for(let i=0;i<=14;i++){const q=Math.PI+Math.PI*i/14;prof.push([Math.cos(q)*R,Math.sin(q)*R]);}
        for(let i=14;i>=0;i--){const q=Math.PI+Math.PI*i/14;prof.push([Math.cos(q)*(R-.012),Math.sin(q)*(R-.012)]);}
        const mkG=len=>{const g=extrude(prof,len,mGut);if(g)g.geometry.translate(0,0,-len/2);return g;};
        [-1,1].forEach(s=>{const g=mkG(m.L-.02);if(g){g.position.set(s*gx,gy,0);put(L.gutter,g,13);}
          const nb=Math.max(2,Math.round(m.L/.6));
          for(let i=0;i<=nb;i++) put(L.gutter,box(.1,.02,.035,mGut,s*(gx-.03),gy-.02,-m.L/2+m.L*i/nb),13);});
        if(m.type==='hip'){
          [-1,1].forEach(s=>{const g=mkG(m.W-.02);if(g){g.rotation.y=Math.PI/2;g.position.set(0,gy,s*gx);put(L.gutter,g,13);}
            const nb=Math.max(2,Math.round(m.W/.6));
            for(let i=0;i<=nb;i++) put(L.gutter,box(.035,.02,.1,mGut,-m.W/2+m.W*i/nb,gy-.02,s*(gx-.03)),13);});
          [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([sx,sz])=>put(L.gutter,box(.16,.1,.16,mGut,sx*gx,gy-.04,sz*gx),13));
        } else [-1,1].forEach(s=>[-1,1].forEach(q=>put(L.gutter,box(.14,.09,.02,mGut,s*gx,gy-.035,q*(m.L/2-.01)),13)));
        const sp=m.type==='gable'?[{sx:1,sz:1},{sx:-1,sz:-1}]:[{sx:1,sz:1},{sx:1,sz:-1},{sx:-1,sz:1},{sx:-1,sz:-1}];
        sp.forEach(({sx,sz})=>{
          const at=V3(sx*gx,gy-R,sz*(m.L/2-.3));
          const px=sx*(wallX+.08),pz=m.type==='gable'?sz*(m.L/2-.3):sz*(wallZ+.08);
          const topY=gy-R-.22,botY=-3,h=topY-botY;
          put(L.gutter,box(.13,.06,.13,mGut,at.x,at.y-.02,at.z),13);
          const tg=V3(px,topY,pz),dv=tg.clone().sub(at),dl=dv.length();
          if(dl>.05){const eg=new THREE.CylinderGeometry(.043,.043,dl+.04,12);
            if(geoOK(eg)){const el=new THREE.Mesh(eg,mGut);el.position.copy(at).add(tg).multiplyScalar(.5);
              el.quaternion.setFromUnitVectors(UPV,dv.normalize());el.castShadow=true;put(L.gutter,el,13);}}
          if(h<.4) return;
          const pg=new THREE.CylinderGeometry(.043,.043,h,12);
          if(geoOK(pg)){const pi=new THREE.Mesh(pg,mGut);pi.position.set(px,botY+h/2,pz);pi.castShadow=true;put(L.gutter,pi,13);}
          [.25,.6,.9].forEach(t=>put(L.gutter,box(.11,.045,.05,mGut,sx*(wallX+.04),botY+h*t,pz),13));
          const sg=new THREE.CylinderGeometry(.046,.046,.32,12);
          if(geoOK(sg)){const sh=new THREE.Mesh(sg,mGut);sh.position.set(px+sx*.14,botY-.09,pz);
            sh.quaternion.setFromUnitVectors(UPV,V3(sx*.8,-.6,0).normalize());sh.castShadow=true;put(L.gutter,sh,13);}
        });
      }

      if(params.fix){
        const hw=buildHardware(m,params,params.__struct);
        hwCount=hw.count; hwErrors=hw.errors||[];
        hw.parts.forEach(part=>{const layer=LG[part.layer]; if(!layer||!part.group.children.length) return;
          part.group.traverse(o=>{if(o.isMesh||o.isInstancedMesh){o.userData.st=part.stage;o.userData.hw=true;}});
          layer.add(part.group);});
      }
    }catch(err){hwErrors.push('сборка: '+(err&&err.message||err));console.error('Сборка кровли:',err);}

    /* Контур: аттиковая стенка законно доходит до фронтона (L/2),
       а не до длины дома — раньше она снималась ошибочно. */
    if(MSD && roofAtW){
      const zLim=m.L/2+.35, culled=[], av=new THREE.Vector3();
      root.traverse(o=>{
        if(!o.isMesh||!o.userData.msPart) return;
        o.updateWorldMatrix(true,false);
        const bb=new THREE.Box3().setFromObject(o);
        if(bb.isEmpty()){ o.userData.culled=true; culled.push(o.userData.msPart); return; }
        /* bbox раскоса врёт: верхняя точка стоит у малого X, а центр коробки — посередине
           пролёта, где кровля уже низкая. Проверяем осевые точки самой детали. */
        let out=bb.min.y<-.06||bb.min.z<-zLim||bb.max.z>zLim;
        const axis=o.userData.msAxis;
        if(!out&&Array.isArray(axis)){
          for(const pt of axis){ av.fromArray(pt).applyMatrix4(o.matrixWorld);
            if(av.y-roofAtW(av.x)>.16){ out=true; break; } }
        } else if(!out) out=bb.max.y-roofAtW((bb.min.x+bb.max.x)/2)>.16;
        if(out){ o.userData.culled=true; culled.push(o.userData.msPart); }
        else o.userData.culled=false;
      });
      if(culled.length) hwErrors.push('вне контура снято: '+[...new Set(culled)].join(', '));
    }

    /* пустые анонимные группы убираются, слои остаются */
    const empties=[];
    root.traverse(o=>{ if(o.isGroup&&o!==root&&!o.userData.layerId&&!o.children.length) empties.push(o); });
    empties.forEach(o=>o.parent&&o.parent.remove(o));

    ROOF_LAYERS.forEach(l=>{const g=LG[l.id];if(!g)return;
      g.traverse(o=>{if((o.isMesh||o.isInstancedMesh)&&o.userData.st===undefined)o.userData.st=l.st;});});
    applyView(); renderer.shadowMap.needsUpdate=true;
    if(!framed){frameView(false);framed=true;}
    meshCount=0; root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)meshCount++;});
    return {meshCount,hwCount,rejected:REJECTED,errors:hwErrors,root,
      mansard:MSD?{scheme:MSD.scheme,roomHalf:MSD.ceilHalf,ceilY:MSD.roomH,kneeTop:MSD.kneeTop,breakX:MSD.breakX,breakY:MSD.breakY}:null};
  }

  function layerExists(id){
    if(!M) return true;
    if((id==='insul'||id==='vapor')&&!M.warm) return false;
    if(id==='lining'&&!M.warm&&!M.mansardOn) return false;
    if(id==='seat'&&(M.seatMode==='notch'||M.mansardOn)) return false;
    if(id==='joists'&&!M.joistsOn) return false;
    if(id==='fix'&&!P.fix) return false;
    if(id==='gutter'&&!P.gutter) return false;
    if(id==='snow'&&!P.snow) return false;
    if(id==='soffit'&&!P.soffit) return false;
    return true; }
  function refreshMarks(){
    while(markGroup.children.length){const c=markGroup.children.pop();
      if(c.material){if(c.material.map)c.material.map.dispose();c.material.dispose();}}
    if(!view.marks||!M) return;
    const st=cl(view.stage,0,13),seen=new Set(); let n=0;
    for(const p of marks){ if(p.st!==st||!p.mark||seen.has(p.mark+p.st)||n>=40) continue;
      seen.add(p.mark+p.st); const sp=markSprite(p.mark); sp.position.copy(p.pos); markGroup.add(sp); n++; } }
  function applyView(){
    if(!root||!M) return;
    const st=cl(view.stage,0,13);
    ROOF_LAYERS.forEach(l=>{const g=LG[l.id];if(!g)return;
      g.visible=!!view.vis[l.id]&&layerExists(l.id); g.position.y=l.s*cl(view.explode,0,1)*1.6;});
    const seen=new Set();
    root.traverse(o=>{
      if(!(o.isMesh||o.isInstancedMesh)) return;
      if(o.userData.culled){ o.visible=false; return; }
      let hid=false,q=o;
      while(q&&q!==root){if(q.userData.st!==undefined&&q.userData.st>st){hid=true;break;}q=q.parent;}
      o.visible=!hid;
      if(o.material&&o.material!==hiMat&&!seen.has(o.material)){
        seen.add(o.material); o.material.wireframe=!!view.wire;
        const next=view.secOn?[clipPlane]:null, ch=(!!o.material.clippingPlanes)!==(!!next);
        o.material.clippingPlanes=next; if(ch)o.material.needsUpdate=true;}
    });
    grid.visible=!!view.grid; clipPlane.constant=cl(view.sec,-1,1)*(M.L/2+1);
    refreshMarks(); renderer.shadowMap.needsUpdate=true; }
  function setView(v){Object.assign(view,v);if(v.vis)view.vis={...view.vis,...v.vis};applyView();}
  function clearHover(){if(hovered){hovered.material=hovered.userData._mat;hovered.userData._mat=null;hovered=null;}}
  function pick(cx,cy){
    if(!root) return null;
    const r=renderer.domElement.getBoundingClientRect();
    ndc.x=((cx-r.left)/r.width)*2-1; ndc.y=-((cy-r.top)/r.height)*2+1;
    ray.setFromCamera(ndc,camera);
    const hits=ray.intersectObjects(root.children,true);
    for(const h of hits){
      if(!h.object.visible||!h.object.userData.mk||h.object.isInstancedMesh) continue;
      let vis=true,q=h.object; while(q){if(q.visible===false){vis=false;break;}q=q.parent;}
      if(vis) return h.object;}
    return null; }
  function hover(mesh){ if(hovered===mesh) return; clearHover();
    if(mesh&&!mesh.isInstancedMesh){mesh.userData._mat=mesh.material;mesh.material=hiMat;hovered=mesh;} }
  function focus(pos,dist){
    const t=T3(pos),dir=V3(.6,.5,.98).normalize(),Cp=t.clone().addScaledVector(dir,dist);
    if(M){const rt=M.roofTop(Cp.x,Cp.z);if(Number.isFinite(rt))Cp.y=Math.max(Cp.y,rt+1.1);}
    Cp.y=Math.max(Cp.y,t.y+1.1); controls.enabled=false; tween={t,p:Cp}; }
  function endTween(){tween=null;controls.enabled=true;}
  function resize(){const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,true);renderer.shadowMap.needsUpdate=true;}
  function tick(dt,now){
    if(tween){const k=1-Math.pow(.0015,dt);
      controls.target.lerp(tween.t,k);camera.position.lerp(tween.p,k);
      if(M){const rt=M.roofTop(camera.position.x,camera.position.z);if(Number.isFinite(rt)&&camera.position.y<rt+.7)camera.position.y=rt+.7;}
      camera.lookAt(controls.target);
      if(camera.position.distanceTo(tween.p)<.06){camera.position.copy(tween.p);controls.target.copy(tween.t);endTween();controls.update();}
    } else if(controls.enabled) controls.update();
    if(![camera.position.x,camera.position.y,camera.position.z].every(Number.isFinite)){
      camera.position.set(16,12,18);controls.target.set(0,1.2,0);endTween();}
    dust.rotation.y+=dt*.012; dust.position.y=Math.sin(now*.00016)*.35;
    renderer.render(scene,camera); }
  function dispose(){renderer.setAnimationLoop(null);
    if(root){scene.remove(root);disposeTree(root);}
    controls.dispose();renderer.dispose();framed=false;
    if(renderer.domElement.parentNode)renderer.domElement.parentNode.removeChild(renderer.domElement);}
  return {scene,camera,renderer,controls,rebuild,setView,pick,hover,clearHover,focus,endTween,resize,tick,dispose,
    frame:()=>frameView(true),
    get root(){return root;},get meshCount(){return meshCount;},get hwCount(){return hwCount;},get hwErrors(){return hwErrors;}};
}