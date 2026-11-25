import { v3, eulerBasis } from './vec3.js';
import { cl, fin, deg } from './format.js';
import { SEATS, TIEMODE, COVERS, RAFTER_MAX, SNOW, GRADE } from './roof-params.js';
import { solveMansard, snowMu } from './roof-mansard.js';

const STD_DEPTHS = [100,125,150,175,200,225,250,300,350,400];

export function computeRoofModel(p) {
  const mansardOn = !!p.mansard;
  const autoSect = mansardOn && p.mansardAutoSection !== 0;
  const type = mansardOn ? 'gable' : (p.type === 'hip' ? 'hip' : 'gable');
  const pitch = cl(p.pitch, 8, 50);
  const a = pitch*Math.PI/180, sa = Math.sin(a), ca = Math.max(.16, Math.cos(a)), ta = sa/ca;
  const span = cl(p.span,4,14), length = cl(p.length,4,18), half = span/2;
  const eave = cl(p.eave,.3,1.2), rake = cl(p.rake,.3,1), step = cl(p.step,.4,1.2);
  const pp = (p.plate||'150x150').split('x').map(v=>cl(+v/1000,.08,.25));
  const pw = pp[0]||.15, ph = pp[1]||.15;
  const rr0 = (p.rafter||'50x200').split('x').map(v=>cl(+v/1000,.04,.3));
  const ts = (p.tieSect||'50x150').split('x').map(v=>cl(+v/1000,.04,.3));
  const tt = ts[0]||.05, th = ts[1]||.15;

  const cv = COVERS[p.cover]||COVERS.metaltile;
  const solid = cv.solid || p.deck === 'solid';
  const G = GRADE[p.grade]||GRADE['2'], Sg = SNOW[p.snowZone]||2.4;
  const warm = mansardOn || +p.insul > 0;
  const insulMM = mansardOn ? Math.max(250, +p.insul||0) : +p.insul;
  const it = cl(insulMM,0,400)/1000;
  const seatMode = SEATS[p.seat] ? p.seat : 'notch';
  const seatW0 = seatMode==='notch' ? pw : Math.min(pw, Math.max(.05,(rr0[1]*.125)/Math.max(.05,sa)));
  const deadKgOf = rd => cv.kg + (solid?7.5:6) + 4 + rd*2.5 + (warm?it*40+11:0) + .6;

  const memT=.005, cntH=.05, batT=.025, deckT=.012, covT=.028;
  const fasciaOut=.035;

  let MS=null, rt=rr0[0]||.05, rd=rr0[1]||.2;
  if (mansardOn) {
    MS = solveMansard(p, { half, length, eave, pitch, deadKN: deadKgOf(rd)*9.81/1000, Sg, step, G,
      tieSect:[Math.round(tt*1000),Math.round(th*1000)], boltD:cl(p.boltD,8,20), boltN:cl(p.boltN,2,8),
      seatWmm:Math.round(seatW0*1000), minSect:[Math.round(rt*1000),Math.round(rd*1000)],
      th, pw, ph, plateLenZ: length + 2*rake });
    if (autoSect && MS.sect) { rt=MS.sect[0]/1000; rd=MS.sect[1]/1000; }
    MS.autoSection = autoSect;
    MS.requestedSect = [Math.round(rr0[0]*1000), Math.round(rr0[1]*1000)];
    MS.finalSect = [Math.round(rt*1000), Math.round(rd*1000)];
    MS.deadKN = deadKgOf(rd)*9.81/1000;
  }

  const bw=.10, plumbH=rd/ca, bh=Math.max(.15, Math.ceil(plumbH/.05)*.05);
  const sw=.15, sh=.15, jd=.20, jt=.05;
  const tieMode = TIEMODE[p.tieMode] ? p.tieMode : 'side';
  const tieSides = p.tieSides===2 ? 2 : 1;
  const hipBoardT=.05, hipLam=Math.max(2, Math.round(cl(+(p.hipW||100)/1000,.08,.24)/hipBoardT));
  const hipW = hipLam*hipBoardT;
  const hipDepth = (STD_DEPTHS.find(d=>d/1000 >= Math.max(rd*1.3, plumbH+.05)-1e-6)||400)/1000;
  const seatW = seatMode==='notch' ? pw : Math.min(pw, Math.max(.05,(rd*.125)/Math.max(.05,sa)));
  const blockLip=.06, blockH = seatMode==='notch'?0:cl(seatW*ta+.06,.08,.30), blockFloorY = blockH - seatW*ta;

  const yMem=rd, yCnt=rd+memT, yBat=yCnt+cntH, covY=yBat+(solid?deckT:batT), coverTop=covY+covT;
  const deadKg = deadKgOf(rd), deadKN = deadKg*9.81/1000;
  const mu = snowMu(pitch), qArea = (deadKN/ca)*1.1 + Sg*mu*1.4;

  const bearingY = mansardOn ? MS.kneeTop : blockH;
  const apex = mansardOn ? MS.apex : Math.max(.2,(half-pw/2)*ta + bearingY);
  const rl = mansardOn ? MS.lowRL : Math.max(1,(half+eave)/ca);
  const eaveY = mansardOn ? MS.eaveY : bearingY - (pw/2+eave)*ta;
  const Xsi=(half-pw/2)/ca, Xso=Xsi+seatW/ca;
  const notchPerp = seatW*sa, notchRatio = cl(notchPerp/rd,0,1);
  const thrustOk = notchPerp>.004 || p.scheme==='nasl' || mansardOn;
  const Xb=(bw/2)/ca, W=span+2*eave;
  let L = length + 2*(type==='gable'?rake:eave), clampNote='';
  if (type==='hip' && L<W+.6) { L=W+.6; clampNote='Длина кровли увеличена до '+L.toFixed(1)+' м — иначе вальма вырождается в шатёр.'; }
  if (mansardOn && p.type==='hip') clampNote='Мансарда считается по двускатной схеме: вальма с ломаным скатом требует отдельных ферм.';
  const ridgeLen = type==='gable'?L:Math.max(.6,L-W), ridgeHalf=ridgeLen/2;
  const plateLenZ = type==='gable'?L:length;
  const rlPie = Math.max(rl*.6, rl + (fasciaOut - coverTop*sa)/ca);

  const faces=[];
  const mk=(pos,rot,zTop,zBot,kind,adj,tag,fRL,fA)=>{
    const A = fA==null?a:fA;
    const f={pos,rot,zTop:fin(zTop),zBot:fin(zBot),kind,adj,tag:tag||'main',
      rl:fRL==null?rl:fRL, a:A, sa:Math.sin(A), ca:Math.max(.16,Math.cos(A)), ta:Math.tan(A), deg:deg(A), mu:snowMu(deg(A))};
    if (mansardOn && tag==='upper') { f.rlPie = f.rl + (MS.lap||.22); f.isBreakEnd = true; }
    else { f.rlPie = Math.max(f.rl*.6, f.rl + (fasciaOut - coverTop*f.sa)/f.ca); f.isBreakEnd = false; }
    f.basis = eulerBasis(rot);
    const sx = f.rlPie - (eave/f.ca + .30);
    f.snowRows = (mansardOn && tag==='upper') ? [] : (f.rlPie>2.4?[sx,sx-.7]:[sx]).filter(v=>v>.3 && v<f.rlPie-.35);
    return f;
  };

  if (mansardOn && MS.scheme==='broken') {
    faces.push(mk(v3(0,MS.ridgeY,0),{x:0,y:0,z:-MS.highA},L/2,L/2,'rect',null,'upper',MS.highRL,MS.highA));
    faces.push(mk(v3(0,MS.ridgeY,0),{x:0,y:Math.PI,z:-MS.highA},L/2,L/2,'rect',null,'upper',MS.highRL,MS.highA));
    faces.push(mk(v3(MS.breakX,MS.breakY,0),{x:0,y:0,z:-MS.lowA},L/2,L/2,'rect',null,'lower',MS.lowRL,MS.lowA));
    faces.push(mk(v3(-MS.breakX,MS.breakY,0),{x:0,y:Math.PI,z:-MS.lowA},L/2,L/2,'rect',null,'lower',MS.lowRL,MS.lowA));
  } else if (type==='gable') {
    faces.push(mk(v3(0,apex,0),{x:0,y:0,z:-a},L/2,L/2,'rect',null));
    faces.push(mk(v3(0,apex,0),{x:0,y:Math.PI,z:-a},L/2,L/2,'rect',null));
  } else {
    faces.push(mk(v3(0,apex,0),{x:0,y:0,z:-a},ridgeHalf,L/2,'trap',{sx:1}));
    faces.push(mk(v3(0,apex,0),{x:0,y:Math.PI,z:-a},ridgeHalf,L/2,'trap',{sx:-1}));
    faces.push(mk(v3(0,apex,ridgeHalf),{x:0,y:-Math.PI/2,z:-a},0,W/2,'tri',{sz:1}));
    faces.push(mk(v3(0,apex,-ridgeHalf),{x:0,y:Math.PI/2,z:-a},0,W/2,'tri',{sz:-1}));
  }
  const zHalf=(f,x)=>f.zTop+(cl(x,0,f.rl)/f.rl)*(f.zBot-f.zTop);
  const zHalfPie=(f,x)=>f.zTop+(cl(x,0,f.rlPie)/Math.max(.01,f.rl))*(f.zBot-f.zTop);
  const xMin=(f,z)=>f.zBot<=f.zTop+1e-6?0:cl((z-f.zTop)/(f.zBot-f.zTop)*f.rl,0,f.rl);
  let area=0; faces.forEach(f=>{ f.area=(f.zTop+f.zBot)*f.rl; area+=f.area; });
  const L2W=(f,X,Y,Z)=>f.pos.clone().addScaledVector(f.basis.X,X).addScaledVector(f.basis.Y,Y).addScaledVector(f.basis.Z,Z);

  const roofUnder=(x,z)=>{
    const ax=Math.abs(fin(x));
    if (mansardOn && MS.scheme==='broken') return ax<=MS.breakX ? MS.ridgeY-Math.tan(MS.highA)*ax : MS.breakY-Math.tan(MS.lowA)*(ax-MS.breakX);
    return apex - ta*Math.max(ax, Math.max(0,Math.abs(fin(z))-ridgeHalf));
  };
  const roofTop=(x,z)=>(Math.abs(fin(x))<=W/2+.35 && Math.abs(fin(z))<=L/2+.35)?roofUnder(x,z)+coverTop/ca:-Infinity;
  const nSide=v3(sa,ca,0), nEnd=v3(0,ca,sa), bis=nSide.clone().add(nEnd).normalize();

  const hips=[];
  if (type==='hip') [[W/2,L/2,ridgeHalf,1,1],[-W/2,L/2,ridgeHalf,-1,1],[W/2,-L/2,-ridgeHalf,1,-1],[-W/2,-L/2,-ridgeHalf,-1,-1]]
    .forEach(([x,z,zr,sx,sz])=>{
      const J=v3(0,apex,zr), B=v3(x,eaveY,z);
      const axis=B.clone().sub(J); const full=axis.length(); axis.normalize();
      const up=v3(nSide.x*sx,nSide.y+nEnd.y,nEnd.z*sz).normalize();
      const side=up.clone().cross(axis).normalize();
      const horiz=Math.hypot(axis.x,axis.z)||1;
      const n1=v3(nSide.x*sx,nSide.y,0), n2=v3(0,nEnd.y,nEnd.z*sz), u1=Math.max(.18,up.dot(n1));
      const d1=side.dot(n1), d2=side.dot(n2);
      hips.push({J,B,axis,full,up,side,sx,sz,zr,ext:fasciaOut*Math.SQRT2/horiz,n1,n2,
        endX:W/2+fasciaOut,endZ:L/2+fasciaOut,sC:rd/u1,
        uP:Math.max(.18,up.dot(d1>=d2?n1:n2)),uM:Math.max(.18,up.dot(d1>=d2?n2:n1)),
        sP:d1>=d2?d1:d2,sM:d1>=d2?d2:d1,horiz});
    });

  const rafters=[]; let rafLen=0; const faceZ=[]; let jackJoints=0;
  faces.forEach((f,fi)=>{
    f.zLimit = f.kind==='tri'?span/2:length/2;
    const bs=f.basis;
    const adj=hips.filter(h=>f.adj && ((f.adj.sx&&h.sx===f.adj.sx)||(f.adj.sz&&h.sz===f.adj.sz)));
    const zs=[], n = type==='gable'?Math.max(2,Math.ceil(L/step)+1):Math.max(2,Math.ceil(2*f.zBot/step)+1);
    const fXb = f.tag==='main'?Xb:(bw/2)/f.ca;
    for (let i=0;i<n;i++){
      const z = type==='gable' ? -L/2+L*i/(n-1) : -f.zBot+2*f.zBot*i/(n-1);
      zs.push(z);
      let x0 = type==='gable'?fXb:Math.max(fXb,xMin(f,Math.abs(z))), jack=false, cheek=null;
      const kingCommon = f.kind==='tri' && Math.abs(z)<=bw/2+rt/2+.01;
      if (adj.length && !kingCommon) {
        const base=xMin(f,Math.abs(z)), guess=L2W(f,base,rd*.5,z);
        let best=null,bestD=1e9;
        adj.forEach(h=>{ const t=cl(guess.clone().sub(h.J).dot(h.axis),0,h.full);
          const Ah=h.J.clone().addScaledVector(h.axis,t); const d=Ah.distanceTo(guess);
          if(d<bestD){bestD=d;best={h,Ah};} });
        if (best && bestD<.8) {
          const {h,Ah}=best, sH=Math.sign(h.side.dot(bs.X))||1, nH=h.side.clone().multiplyScalar(sH);
          const cH=Ah.dot(nH)+hipW/2, c0=f.pos.dot(nH);
          const aX=bs.X.dot(nH), aY=bs.Y.dot(nH), aZ=bs.Z.dot(nH);
          if (aX>1e-5) {
            const xs=(Y,sz)=>(cH-c0-Y*aY-(z+sz*rt/2)*aZ)/aX;
            const xA0=xs(0,-1),xA1=xs(rd,-1),xB0=xs(0,1),xB1=xs(rd,1), maxXs=Math.max(xA0,xA1,xB0,xB1);
            if ([xA0,xA1,xB0,xB1].every(Number.isFinite) && maxXs>Math.max(fXb,base)+.02 && maxXs<f.rl-.35) {
              x0=maxXs; jack=true; jackJoints++; cheek={hip:h,nH,cH,xA0,xA1,xB0,xB1,sH};
            }
          }
        }
      }
      const len=f.rl-x0; if(len<.3) continue;
      rafters.push({f,fi,z,x0,len,jack,cheek,kingCommon,tag:f.tag,end:type==='gable'&&Math.abs(Math.abs(z)-L/2)<1e-6});
      rafLen+=len;
    }
    faceZ.push(zs);
  });

  const baseZ=(faceZ[0]||[0]).slice().sort((x,y)=>x-y);
  const postLimit = type==='hip'?ridgeHalf-.28:Math.min(ridgeHalf-.06,length/2-.15);
  const postCand=baseZ.filter(z=>Math.abs(z)<=postLimit);
  const every=Math.max(1,Math.round(2.5/step)), postZ=[];
  if (!mansardOn && ridgeLen>1.2 && postCand.length) {
    for(let i=0;i<postCand.length;i+=every) postZ.push(postCand[i]);
    const last=postCand[postCand.length-1];
    if(postZ.length&&Math.abs(postZ[postZ.length-1]-last)>.35) postZ.push(last);
    if(postZ.length<2&&postCand.length>1) postZ.push(postCand[0]);
    postZ.sort((x,y)=>x-y);
  }
  const sleeperZ=postZ.length?(postZ[0]+postZ[postZ.length-1])/2:0;
  const sleeperLen=postZ.length?Math.max(.6,(postZ[postZ.length-1]-postZ[0])+.4):0;

  const rise=apex-bearingY, tieFrac=cl(p.tiePos,.35,.8);
  let tieY,tieHalf,tieCeil;
  if (mansardOn) { tieY=MS.roomH-th; tieHalf=MS.ceilHalf; tieCeil=()=>MS.roomH+.5; }
  else { tieY=bearingY+rise*tieFrac; tieHalf=tieMode==='side'?(apex+rd/ca-tieY)/ta:(apex-tieY)/ta;
    tieCeil=z=>apex-ta*Math.max(0,Math.abs(fin(z))-ridgeHalf); }
  const topPlaneC=apex+rd/ca;
  const ovLo=(apex-tieY-th)/ta, ovHi=(topPlaneC-tieY)/ta, fullLo=(apex-tieY)/ta, fullHi=(topPlaneC-tieY-th)/ta;
  const overlap=Math.max(0,ovHi-ovLo), fullOverlap=Math.max(0,fullHi-fullLo);
  const tieZ=(p.ties||mansardOn)?baseZ.filter(z=>Math.abs(z)<=length/2&&(mansardOn||(!postZ.some(q=>Math.abs(q-z)<1e-3)&&tieCeil(z)>tieY+th*.5&&tieHalf>.35))):[];

  /* Ферма над потолком ставится через шаг. Список узлы берутся из
     самих членов, а не из отдельного поля — иначе он терялся. */
  const msParts = mansardOn && Array.isArray(MS.parts) ? MS.parts : [];
  const upperStep = mansardOn ? Math.max(step, MS.upperStep || step*2) : step*2;
  const needsUpper = msParts.some(q => q.zs === 'upper');
  const upperZ = needsUpper ? tieZ.filter((z,i)=>i % Math.max(1,Math.round(upperStep/step)) === 0) : [];

  const ridgeBeamSect = mansardOn && MS.ridgeBeam ? MS.ridgeBeam.sect : [Math.round(bw*1000),Math.round(bh*1000)];
  const beamTop = mansardOn && MS.scheme==='ridge' ? apex+rd/ca : apex-(bw/2)*ta+rd/ca;
  const sleeperTop=sh, postH=Math.max(.25,beamTop-ridgeBeamSect[1]/1000-sleeperTop);
  const thetaB=50*Math.PI/180, yFoot=sleeperTop+.18;
  const dBrace=cl((apex-yFoot)/(ta+Math.tan(thetaB)),.35,half*.6);
  const braceHeadY=apex-dBrace*ta, braceAngle=Math.atan2(braceHeadY-yFoot,dBrace), braceLen=Math.hypot(dBrace,braceHeadY-yFoot);
  const runLimit=(RAFTER_MAX[p.rafter]||3.5)*Math.sqrt(.6/step);

  const rows=[]; let batLen=0;
  faces.forEach(f=>{
    if (solid) { rows.push({f,x:f.rlPie/2,len:2*zHalfPie(f,f.rlPie/2)}); batLen+=f.area; return; }
    const st=cv.module||.35;
    for(let x=f.rlPie-.05;x>.12;x-=st){ const len=2*zHalfPie(f,x); rows.push({f,x,len}); batLen+=len; }
  });

  let sheets=0,sheetArea=0,packs=0;
  if (p.cover==='shingle'){ let b=0; faces.forEach(f=>b+=f.rl*2*f.zBot);
    packs=Math.ceil(area*(1+Math.max(0,(b-area)/Math.max(1,b))*.5)/3); }
  else faces.forEach(f=>{
    const cols=Math.max(1,Math.ceil(2*f.zBot/cv.w));
    for(let i=0;i<cols;i++){ const zA=-f.zBot+cv.w*i, zB=Math.min(f.zBot,zA+cv.w);
      if(zB-zA<.05) continue;
      const near=(zA<=0&&zB>=0)?0:Math.min(Math.abs(zA),Math.abs(zB));
      sheets++; sheetArea+=Math.max(.35,f.rl-xMin(f,near))*cv.w; }
  });
  const wasteReal = p.cover==='shingle'?cl((packs*3-area)/Math.max(1,packs*3),0,.9):cl((sheetArea-area)/Math.max(1,sheetArea),0,.9);

  const eaveLen=type==='gable'?2*L:2*(W+L);
  const rakeLen=type==='gable'?faces.reduce((s,f)=>s+2*f.rl,0):0;
  const hipLen=hips.reduce((s,h)=>s+h.full+h.ext,0);
  const soffitA=type==='gable'?2*eave*L:2*eave*(W+L);
  const spouts=type==='gable'?2:4;
  const snowRows = mansardOn ? [] : (rl>2.8?[rl-(eave/ca+.30), rl-(eave/ca+.30)-.7]:[rl-(eave/ca+.30)]);
  const snowX = rl-(eave/ca+.30);
  const insulEnd=Math.min(rl,Xso+.15);
  const ridgeLift=coverTop/ca, hipLift=coverTop/Math.max(.2,nSide.dot(bis));
  const joistN=Math.max(2,Math.ceil(length/step)+1);
  const extraIns=Math.max(0,it-rd); let extraBattenLen=0;
  if(extraIns>.001) faces.forEach(f=>{ const zl=f.kind==='tri'?span/2:length/2;
    for(let x=.3;x<f.rlPie-.05;x+=.6) extraBattenLen+=2*Math.min(zHalfPie(f,x),zl); });
  const seatRuns=type==='gable'?2*plateLenZ:2*(plateLenZ+span);
  const bearR=rafters.filter(r=>!r.jack).length, cleatLen=.30;
  const joistsOn = mansardOn ? true : !!p.joists;

  /* Объём членов мансарды. Подкосы приходят как {a,b,depth,thick},
     брусы как {s:[w,h,d]} — обе схемы читаются со страховкой. */
  const partLen = q => {
    if (q.t === 'brace' && Array.isArray(q.a) && Array.isArray(q.b))
      return Math.hypot(q.b[0]-q.a[0], q.b[1]-q.a[1]);
    if (q.t === 'box' && Array.isArray(q.s)) return Math.max(q.s[0], q.s[1], q.s[2]);
    return 0;
  };
  const partSect = q => {
    if (q.t === 'brace') return [q.thick || .05, q.depth || .15];
    if (q.t === 'box' && Array.isArray(q.s)) { const s = q.s.slice().sort((a,b)=>a-b); return [s[0], s[1]]; }
    return [0,0];
  };
  const partVol = msParts.reduce((s,q)=>{
    if (q.mat==='steel' || q.mat==='floor' || q.mat==='ceil') return s;
    const n = q.zs==='tie' ? tieZ.length : q.zs==='upper' ? upperZ.length : 1;
    if (!n) return s;
    const [a,b] = partSect(q);
    const v = a*b*partLen(q);
    return s + (Number.isFinite(v) ? v*n : 0);
  },0);

  const V={
    rafter: rafters.filter(r=>!r.jack).reduce((s,r)=>s+r.len,0)*rt*rd,
    jack: rafters.filter(r=>r.jack).reduce((s,r)=>s+r.len,0)*rt*rd,
    hip: hipLen*hipW*hipDepth,
    tie: tieZ.length*(mansardOn?1:tieSides)*2*tieHalf*tt*th,
    ridgeBeam: ridgeLen*ridgeBeamSect[0]/1000*ridgeBeamSect[1]/1000,
    post: postZ.length*postH*sw*sh,
    brace: p.braces&&postZ.length?postZ.length*2*braceLen*.05*.15:0,
    mansard: partVol,
    sleeper: sleeperLen*sw*sh,
    plate: 2*plateLenZ*pw*ph + 2*span*pw*ph,
    seat: !mansardOn&&seatMode==='block'?seatRuns*pw*blockH:!mansardOn&&seatMode==='cleat'?bearR*cleatLen*pw*blockH:0,
    joist: joistsOn?joistN*(span-pw)*jt*jd:0,
    counter: rafLen*.05*.05, batten: solid?0:batLen*.025*.10,
    extraBatten: extraBattenLen*.05*extraIns, fascia: (eaveLen+rakeLen)*.025*.15
  };
  for(const k in V) V[k]=Math.max(0,fin(V[k]));
  const wood=Object.values(V).reduce((s,v)=>s+v,0);
  const boltD=cl(p.boltD,8,20), boltN=cl(p.boltN,2,8);
  const hipNails=hips.length?Math.max(2,Math.ceil(hipLen/hips.length/.4))*4*hips.length:0;
  const hipBolts=hips.length?Math.max(2,Math.ceil(hipLen/hips.length/1.2))*2*hips.length:0;
  const fix={ slide:bearR*2, angle:rafters.length*2+(p.braces&&postZ.length?postZ.length*4:0)+jackJoints*2+upperZ.length*4,
    plate: tieMode==='under'&&!mansardOn?tieZ.length*4:0,
    bolt: ((tieMode==='side'||mansardOn)?tieZ.length*(mansardOn?1:tieSides)*2*boltN:0)+hipBolts,
    bolt10: p.braces&&postZ.length?postZ.length*4:0, nailKg: hipNails*.004+partVol*40,
    stud: Math.ceil((2*plateLenZ+2*span)/1.2) };

  return { a,sa,ca,ta,half,span,length,eave,rake,step,pw,ph,rt,rd,tt,th,bw,bh,sw,sh,jd,jt,
    apex,rl,rlPie,eaveY,Xsi,Xso,Xb,notchPerp,notchRatio,W,L,ridgeLen,ridgeHalf,plateLenZ,
    faces,zHalf,zHalfPie,xMin,area,rafters,rafLen,faceZ,rows,batLen,solid,plumbH,fasciaOut,
    sheets,sheetArea,packs,wasteReal,eaveLen,rakeLen,hipLen,soffitA,warm,it,spouts,V,wood,fix,cv,
    yMem,yCnt,yBat,covY,coverTop,ridgeLift,hipLift,bis,nSide,nEnd,beamTop,sleeperTop,postH,
    postZ,sleeperZ,sleeperLen,tieZ,tieY,tieCeil,dBrace,braceHeadY,braceAngle,braceLen,
    runLimit,snowRows,snowX,joistN,clampNote,extraIns,extraBattenLen,upperZ,upperStep,
    memT,cntH,batT,deckT,covT,roofUnder,roofTop,insulEnd,pitch,type,
    seatMode,tieMode,tieSides,blockH,blockLip,blockFloorY,seatW,thrustOk,
    hipW,hipDepth,hipLam,hipBoardT,hips,jackJoints,seatRuns,bearR,cleatLen,
    rise,tieFrac,tieHalf,topPlaneC,ovLo,ovHi,fullLo,fullHi,overlap,fullOverlap,
    underEdgeLo:ovLo,underEdgeHi:tieHalf,boltD,boltN,bearingY,
    mansard:MS,mansardOn,joistsOn,ridgeBeamSect,qArea,deadKg,deadKN,insulMM,autoSect };
}