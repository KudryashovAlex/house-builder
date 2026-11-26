import { cl, deg } from './format.js';

export const MANSARD_SCHEMES = {
  broken: { n: 'Ломаный скат (мансардный)', short: 'Ломаный скат',
    d: 'Нижний скат 55–70°, верхний 20–35°. Ригель в переломе — потолок комнаты. Над потолком бабка с подкосами. Опор в центре нет.' },
  tie: { n: 'Висячие стропила с затяжкой по полу', short: 'Висячие + затяжка',
    d: 'Пара стропил замкнута балками перекрытия. Над потолком бабка от конька и два подкоса в стропило. Пролёт до 6 м.' },
  ridge: { n: 'Коньковый прогон на фронтонах', short: 'Прогон на фронтонах',
    d: 'Клеёный прогон перекрывает всю длину и опирается только на фронтоны. Решётки над потолком нет — всё несёт прогон.' },
  truss: { n: 'Мансардная ферма заводская', short: 'Ферма',
    d: 'Решётка с проёмом под комнату: нижний пояс, потолочный пояс, стойки проёма, раскосы и гвоздевые пластины. Хорды считает завод.' }
};

const GL_W = [90,115,140,165,190,215,240,265,290];
const GL_H = [200,240,300,360,400,450,500,560,600,630,700,800];
const MAX_HB = 4.5;
export const GL = { Ri: 24, Rt: 16, Rsm: 2.6, E: 11500, n: 'Клеёная GL24h' };
export const RAFTER_SECTIONS = [[50,150],[50,200],[60,200],[50,250],[60,250],[50,300],[60,300],[75,300],[100,300]];

const KING=[50,150], BRACE=[50,150], COLLAR=[50,100], WEB=[45,145];
/* Прогон перелома — обвязка по стойкам боковой стены комнаты, а не мауэрлат на затяжках. */
const BP_W=.15, BP_D=.25;
const rad = d => d*Math.PI/180;
export const snowMu = d => d<=30?1:d>=60?0:(60-d)/30;
export const slopeLineLoad = (deadKN,caS,slopeDeg,Sg,step) => ((deadKN/caS)*1.1 + Sg*snowMu(slopeDeg)*1.4)*step;

export function checkRafterSection(sect, runH, caS, qPair, G, seatWmm, meta) {
  const [b,h]=sect;
  const W=b*h*h/6, I=b*h*h*h/12, M=qPair*runH*runH/8;
  const sigma=M*1e6/Math.max(1,W), Ls=runH/caS*1000, qN=qPair*caS*caS;
  const defl=5*qN*Math.pow(Ls,4)/(384*G.E*I), lim=Ls/200;
  const sm=(qPair*runH/2*1000)/Math.max(1,seatWmm*b);
  return { tag:(meta&&meta.tag)||'main', deg:meta&&Number.isFinite(meta.deg)?meta.deg:null,
    sect,sigma,defl,lim,sm,W,I,Ls,qPair,runH,caS,
    utilR:sigma/G.Ri, utilD:defl/lim, utilSm:sm/G.Rsm,
    ok:sigma<=G.Ri&&defl<=lim&&sm<=G.Rsm };
}
export function pickRafterSection(cases,G,seatWmm,minSect){
  const pool=minSect?RAFTER_SECTIONS.filter(s=>s[0]*s[1]>=minSect[0]*minSect[1]):RAFTER_SECTIONS;
  for(const sect of pool){ const res=cases.map(c=>checkRafterSection(sect,c.runH,c.caS,c.qPair,G,seatWmm,c));
    if(res.every(r=>r.ok)) return {sect,cases:res,auto:true}; }
  const sect=pool[pool.length-1];
  return {sect,cases:cases.map(c=>checkRafterSection(sect,c.runH,c.caS,c.qPair,G,seatWmm,c)),auto:true,exhausted:true};
}
function sizeRidgeBeam(wLine, spanM){
  const M=wLine*spanM*spanM/8, Lmm=spanM*1000, needW=M*1e6/GL.Ri, lim=Lmm/250;
  const pool=[];
  for(const b of GL_W) for(const h of GL_H){ if(h/b>MAX_HB) continue; pool.push({b,h,area:b*h}); }
  pool.sort((x,y)=>x.area-y.area||x.h-y.h);
  for(const {b,h} of pool){
    const W=b*h*h/6, I=b*Math.pow(h,3)/12;
    if(W<needW) continue;
    const f=5*wLine*Math.pow(Lmm,4)/(384*GL.E*I);
    if(f>lim) continue;
    return {sect:[b,h],M,W,I,sigma:M*1e6/W,defl:f,deflLim:lim,ok:true,hb:+(h/b).toFixed(2),
      note:`Клеёная ${b}×${h} (h/b ${(h/b).toFixed(1)}), пролёт ${spanM.toFixed(1)} м без стоек`};
  }
  const last=pool[pool.length-1], b=last.b, h=last.h, W=b*h*h/6, I=b*Math.pow(h,3)/12;
  return {sect:[b,h],M,W,I,sigma:M*1e6/W,defl:5*wLine*Math.pow(Lmm,4)/(384*GL.E*I),deflLim:lim,ok:false,hb:+(h/b).toFixed(2),
    note:`Пролёт ${spanM.toFixed(1)} м велик для клеёного прогона — нужны фермы или стойки у фронтонов`};
}

/* Члены мансарды. Подкос — профиль в плоскости XY с толщиной по Z.
   Каждый член несёт mk:[группа, длина] — по нему он попадает в распил. */
function buildParts(o){
  const {scheme,half,length,ceilHalf,roomH,ridgeY,kneeTop,th,pw,ph,plateLenZ,lowA,highA,tieLift}=o;
  const base=roomH+(tieLift||0);   // верх ригеля — пятка всей решётки над потолком
  const tanL=Math.tan(lowA), tanH=Math.tan(highA), broken=scheme==='broken';
  const roofAt = x => { const ax=Math.abs(x);
    return broken ? (ax<=ceilHalf ? ridgeY-ax*tanH : roomH-(ax-ceilHalf)*tanL) : ridgeY-ax*tanL; };
  /* Несущие члены идут по длине КРОВЛИ (со свесами), а не дома:
     иначе прогон и мауэрлат не доходят до крайних стропил. */
  const P=[], rejected=[], zLim=Math.max(length,plateLenZ)/2-.02;
  const clampPt=(p,clear)=>{ const x=cl(p[0],-half+.05,half-.05);
    return [x, cl(p[1],.04,Math.max(.05,roofAt(x)-clear))]; };
  const box=(s,p,zs,mat,tag,st,mk)=>{
    if(!s.every(Number.isFinite)||!p.every(Number.isFinite)){rejected.push(tag);return;}
    if(s[0]<=.01||s[1]<=.008||s[2]<=.01){rejected.push(tag);return;}
    const lim=roofAt(p[0])+.004; let h=s[1], y=p[1];
    if(p[1]+h/2>lim){ h=Math.max(.03,h-(p[1]+h/2-lim)); y=p[1]-(s[1]-h)/2; }
    if(h<.03){rejected.push(tag);return;}
    const zl=Math.min(s[2]/2,zLim);
    P.push({t:'box',s:[s[0],h,zl*2],p:[p[0],y,cl(p[2],-zLim+zl,zLim-zl)],zs,mat,tag,st,mk});
  };
  const brace=(a,b,depth,thick,zs,mat,tag,st,mk)=>{
    const A=clampPt(a,.06), B=clampPt(b,.06);
    const len=Math.hypot(B[0]-A[0],B[1]-A[1]);
    if(!(len>.22)){rejected.push(tag);return;}
    if(A[1]>roofAt(A[0])-.03||B[1]>roofAt(B[0])-.03){rejected.push(tag);return;}
    P.push({t:'brace',a:A,b:B,depth,thick,zs,mat,tag,st,mk:mk?[mk[0],len]:null});
  };
  const plate=(p,zs,tag,st,s=[.16,.004,.16])=>{ const c=clampPt([p[0],p[1]],.014);
    P.push({t:'box',s,p:[c[0],c[1],p[2]],zs,mat:'steel',tag,st}); };

  box([2*ceilHalf,.022,length],[0,.011,0],null,'floor','mansardFloor',2);
  box([2*ceilHalf,.018,length],[0,roomH+(tieLift||0)-th-.011,0],null,'ceil','mansardCeiling',10);

  if(kneeTop>.05){
    const wallH=Math.max(.08,kneeTop-ph);
    [-1,1].forEach(s=>{
      P.push({t:'box',s:[pw,wallH,plateLenZ],p:[s*half,wallH/2,0],zs:null,mat:'knee',tag:'knee',st:1});
      P.push({t:'box',s:[pw,ph,plateLenZ],p:[s*half,kneeTop-ph/2,0],zs:null,mat:'plate',tag:'kneeCap',st:1,mk:['plate',plateLenZ]});
      const n=Math.max(2,Math.round(plateLenZ/.6));
      for(let i=0;i<=n;i++)
        P.push({t:'box',s:[.05,wallH,.15],p:[s*half,wallH/2,-plateLenZ/2+plateLenZ*i/n],zs:null,mat:'web',tag:'kneeStud',st:1,mk:['post',wallH]});
    });
  }
  [-1,1].forEach(s=>{
    /* Стойка несёт прогон СНИЗУ: верх стойки = низ прогона.
       Раньше стойка входила в прогон на 220 мм — опирания не было. */
    const top=broken?roomH-BP_D:roomH-.03;
    const hStud=Math.max(.25,top);
    box([.05,hStud,.15],[s*ceilHalf,hStud/2,0],'tie','web','roomStud',6,['post',hStud]);
    P.push({t:'box',s:[.05,.05,length],p:[s*ceilHalf,.028,0],zs:null,mat:'web',tag:'roomRail',st:6});
  });

  if(broken){
    [-1,1].forEach(s=>box([BP_W,BP_D,plateLenZ],[s*ceilHalf,roomH-BP_D/2,0],null,'purlin','breakPurlin',5,['breakBeam',plateLenZ]));
    const hU=ridgeY-roomH;
    if(hU>=.75&&ceilHalf>=1.1){
      /* Бабка подвешена к коньковому прогону: доводим до оси конька,
         прогон сам подрежет по месту — зазора 28 мм больше нет. */
      const kLen=Math.max(.2,hU-(tieLift||0)-.08);
      /* 150 — высота сечения В ПЛОСКОСТИ фермы (по X), 50 — толщина по Z,
         как у стропил и подкосов. Раньше 150 шло по Z: бабка была втрое шире узлов. */
      box([KING[1]/1000,kLen,KING[0]/1000],[0,base+kLen/2,0],'upper','web','upperKing',8,['post',kLen]);
      plate([0,ridgeY-.10,0],'upper','trussPlate',8,[.2,.004,.2]);
            /* Упор подкоса — на 30% ската ОТ КОНЬКА: и tx, и ty считаем от конька.
         Угол выходит ~38° вместо 13° — подкос работает, а не распирает. */
      const t=(ceilHalf/Math.cos(highA))*.30;
      const tx=t*Math.cos(highA), ty=ridgeY-t*Math.sin(highA)-.07;
      [-1,1].forEach(s=>{
        brace([0,base+.14],[s*tx,ty],BRACE[1]/1000,BRACE[0]/1000,'upper','web','trussWeb',8,['brace',1]);
        plate([s*tx,ty-.03,0],'upper','trussPlate',8);
      });

    }
  } else if(scheme==='tie'){
    const hU=ridgeY-roomH;
    if(hU>=.55){
      const kLen=hU-.08;
      box([KING[0]/1000,kLen,KING[1]/1000],[0,roomH+kLen/2,0],'tie','web','tieKing',7,['post',kLen]);
      plate([0,ridgeY-.10,0],'tie','trussPlate',7,[.2,.004,.2]);
      plate([0,roomH+.06,0],'tie','trussPlate',7);
      const uMax=cl((ridgeY-roomH-.30)/Math.max(.25,half*tanL),.18,.74);
      const tx=half*uMax*.62, ty=ridgeY-tx*tanL-.08;
      [-1,1].forEach(s=>{
        brace([0,roomH+.14],[s*tx,ty],BRACE[1]/1000,BRACE[0]/1000,'tie','web','tieBrace',7,['brace',1]);
        plate([s*tx,ty-.03,0],'tie','trussPlate',7);
      });
    }
  } else if(scheme==='ridge'){
    [-1,1].forEach(sz=>P.push({t:'box',s:[.26,.02,.24],p:[0,0,sz*(length/2-.14)],zs:null,mat:'steel',tag:'gableBearing',st:4}));
  } else if(scheme==='truss'){
    [-1,1].forEach(s=>{
      const xr=s*ceilHalf, xo=s*half*.95, yo=roofAt(xo)-.09;
      brace([xr,.09],[xo,yo],WEB[1]/1000,WEB[0]/1000,'tie','web','trussWeb',8,['brace',1]);
      brace([xr,roomH-.10],[0,ridgeY-.16],WEB[1]/1000,WEB[0]/1000,'tie','web','trussWeb',8,['brace',1]);
      plate([xr,.07,0],'tie','trussPlate',8);
      plate([xr,roomH-.06,0],'tie','trussPlate',8);
      plate([xo,yo-.03,0],'tie','trussPlate',8);
    });
    plate([0,ridgeY-.16,0],'tie','trussPlate',8,[.22,.004,.22]);
    box([2*ceilHalf,WEB[0]/1000,WEB[1]/1000],[0,roomH-th-.06,0],'tie','web','trussCeiling',8,['tie',2*ceilHalf]);
  }
  return {parts:P,rejected};
}

export function solveMansard(p, ctx){
  const scheme=MANSARD_SCHEMES[p.mansardScheme]?p.mansardScheme:'broken';
  const half=ctx.half, length=ctx.length, eave=ctx.eave;
  const knee=cl(p.mansardKnee??0,0,1.8);
  const G=ctx.G, step=ctx.step, Sg=ctx.Sg, deadKN=ctx.deadKN;
  const seatWmm=ctx.seatWmm||60, wantH=cl(p.mansardRoomH??2.4,2.0,3.2);
  const out={scheme,knee,kneeTop:knee,noPosts:true,warnings:[],notes:[],cases:[],autoPicked:false};

  let lowA,highA,lowDeg,highDeg,ceilHalf,ceilY,ridgeY,lowRL,highRL,lowRun;
  if(scheme==='broken'){
    lowDeg=cl(p.mansardLowPitch??62,45,75); highDeg=cl(p.mansardHighPitch??30,15,40);
    lowA=rad(lowDeg); highA=rad(highDeg);
    ceilY=Math.max(knee+.8,wantH);
    lowRun=(ceilY-knee)/Math.tan(lowA); ceilHalf=half-lowRun;
    if(ceilHalf<1.1){ceilHalf=1.1;lowRun=half-ceilHalf;lowDeg=deg(Math.atan2(ceilY-knee,lowRun));lowA=rad(lowDeg);
      out.warnings.push(`Нижний уклон выправлен до ${lowDeg.toFixed(0)}° — иначе комната уже 2.2 м.`);}
    if(ceilHalf>half-.35){ceilHalf=half-.35;lowRun=half-ceilHalf;lowDeg=deg(Math.atan2(ceilY-knee,lowRun));lowA=rad(lowDeg);}
    ridgeY=ceilY+ceilHalf*Math.tan(highA);
    lowRL=(lowRun+eave)/Math.cos(lowA); highRL=ceilHalf/Math.cos(highA);
    out.notes.push(`Комната ${(2*ceilHalf).toFixed(2)}×${length.toFixed(1)} м, потолок ${ceilY.toFixed(2)} м — это ригель перелома.`);
    out.notes.push(`Низ ${lowDeg.toFixed(0)}° (μ ${snowMu(lowDeg).toFixed(2)}), верх ${highDeg.toFixed(0)}° (μ ${snowMu(highDeg).toFixed(2)}). Верхний скат заходит за перелом на 220 мм внахлёст, сверху планка.`);
    if(highA>=lowA) out.warnings.push('Верхний уклон не меньше нижнего — перелом не работает.');
  } else {
    lowDeg=highDeg=cl(ctx.pitch,20,55); lowA=highA=rad(lowDeg);
    const ta=Math.tan(lowA);
    ridgeY=knee+half*ta;
    ceilY=Math.min(wantH,ridgeY-.45);
    if(ceilY<knee+.8) ceilY=Math.min(knee+.8,ridgeY-.25);
    lowRun=(ceilY-knee)/ta; ceilHalf=Math.max(.9,half-lowRun);
    lowRL=(half+eave)/Math.cos(lowA); highRL=0;
    if(Math.abs(ceilY-wantH)>.02) out.warnings.push(`Потолок опущен до ${ceilY.toFixed(2)} м — выше не хватает высоты ската.`);
    out.notes.push(`Комната ${(2*ceilHalf).toFixed(2)}×${length.toFixed(1)} м, плоский потолок ${ceilY.toFixed(2)} м, конёк ${ridgeY.toFixed(2)} м.`);
  }

  out.lowA=lowA; out.highA=highA; out.lowDeg=lowDeg; out.highDeg=highDeg;
  out.roomH=ceilY; out.ceilHalf=ceilHalf; out.roomW=2*ceilHalf;
  out.breakX=ceilHalf; out.breakY=ceilY; out.ridgeY=ridgeY; out.apex=ridgeY;
  out.lowRL=lowRL; out.highRL=highRL; out.lowRun=lowRun; out.lowerRun=lowRun;
  out.eaveY=knee-eave*Math.tan(lowA);
  out.tieY=ceilY; out.tieHalf=ceilHalf;
  out.roomWidth=2*ceilHalf; out.roomHeight=ceilY; out.ceilFlat=true;
  out.usableHalf=ceilHalf; out.usableWidth=2*ceilHalf; out.usableArea=2*ceilHalf*length; out.headroom=ceilY;
  out.lowerSpan=lowRL; out.upperSpan=highRL; out.upperRun=ceilHalf;
  out.studs=[-1,1].map(s=>({x:s*ceilHalf,y0:0,y1:ceilY,sect:[50,150],s}));
  out.lap=scheme==='broken'?.22:0;

  out.breakPurlinW=.15;

  const cases = scheme==='broken'
    ? [{tag:'lower',runH:lowRun,caS:Math.cos(lowA),deg:lowDeg,qPair:slopeLineLoad(deadKN,Math.cos(lowA),lowDeg,Sg,step)},
       {tag:'upper',runH:ceilHalf,caS:Math.cos(highA),deg:highDeg,qPair:slopeLineLoad(deadKN,Math.cos(highA),highDeg,Sg,step)}]
    : [{tag:'main',runH:half,caS:Math.cos(lowA),deg:lowDeg,qPair:slopeLineLoad(deadKN,Math.cos(lowA),lowDeg,Sg,step)}];
  out.cases=cases;

  if(scheme==='truss'){
    out.sect=ctx.minSect||[50,200];
    out.checks=cases.map(c=>checkRafterSection(out.sect,c.runH,c.caS,c.qPair,G,seatWmm,c));
    out.exhausted=false; out.autoPicked=false; out.truss=true;
    out.trussDepth=Math.round((2*half)/12*1000/50)*50; out.trussLoad=cases[0].qPair;
    out.notes.push(`Ферма: пролёт ${(2*half).toFixed(1)} м, высота ≈${out.trussDepth} мм, потолочный пояс ${ceilY.toFixed(2)} м.`);
    out.notes.push('Хорды и решётку рассчитывает завод (СП 64 разд. 9). Сечение в модели — габарит заготовки.');
  }else{
    const pick=pickRafterSection(cases,G,seatWmm,ctx.minSect);
    out.sect=pick.sect;out.checks=pick.cases;out.exhausted=!!pick.exhausted;out.autoPicked=true;
    out.notes.push(`Сечение стропил — минимальное проходящее: ${pick.sect[0]}×${pick.sect[1]} мм.`);
  }
  /* Нижний крутой скат пилятся из СВОЕГО сечения: при 62° снег μ=0, пролёт короткий.
     Глубина ограничена смыканием излома: rd_низ/cos α_низ ≤ rd_верх/cos α_верх.
     При выключенном автоподборе ничего не меняем — сечение задал инженер. */
  out.sectLower=out.sect; out.checksLower=out.checks;
  if(scheme==='broken'&&ctx.autoSect){
    const cap=out.sect[1]*Math.cos(lowA)/Math.cos(highA);
    const lo=cases.filter(c=>c.tag==='lower');
    const tryPool=pool=>{
      for(const s of pool){const r=lo.map(c=>checkRafterSection(s,c.runH,c.caS,c.qPair,G,seatWmm,c));
        if(r.every(x=>x.ok))return{sect:s,checks:r};}
      return null;};
    let ch=tryPool(RAFTER_SECTIONS.filter(s=>s[1]<=cap+1e-6));
    if(ch)out.notes.push(`Нижний скат ${ch.sect[0]}×${ch.sect[1]} мм — своё сечение, верхние грани смыкаются на изломе.`);
    else{ch=tryPool(RAFTER_SECTIONS);
      if(ch)out.notes.push(`Нижний скат ${ch.sect[0]}×${ch.sect[1]} мм — своё сечение по нагрузке; остаток излома добирается митером пирога.`);}
    if(ch){out.sectLower=ch.sect;out.checksLower=ch.checks;}
  }

   /* Ригель накладной на стропила, прогон перелома работает как мауэрлат и не сверлится.
     Подъём даёт место болтам и в стропиле, и в ригеле; выше верхней грани не поднимаем. */
  out.tieLift = scheme==='broken' ? Math.min(ctx.th+.10, (out.sect[1]/1000)/Math.cos(highA)) : 0;
  const hU=Math.max(.2,ridgeY-ceilY);
  out.tieForce=cases[cases.length-1].qPair*Math.pow(2*ceilHalf,2)/(8*hU);
  /* Подкос подпирает верхнюю стропилу и распирает узел. Реакцию подпора берём
     оценочно 0.4 от полной нагрузки на стропилу, горизонталь = V·run/rise.
     Эту добавку замыкает ригель потолка — схватка для неё не нужна. */
  out.strutThrust=0;
  if(scheme==='broken'&&hU>=.75&&ceilHalf>=1.1){
    const qU=cases[cases.length-1].qPair, tU=(ceilHalf/Math.cos(highA))*.30;
    const run=tU*Math.cos(highA);
    const rise=(ridgeY-tU*Math.sin(highA)-.07)-(ceilY+(out.tieLift||0)+.14);
    if(run>.05&&rise>.05){
      out.strutThrust=.4*qU*ceilHalf*run/rise;
      out.tieForce+=out.strutThrust;
    }
  }
  out.bottomTieForce=scheme==='ridge'?0:cases[0].qPair*Math.pow(2*half,2)/(8*Math.max(.3,ridgeY-knee));
  if(scheme==='ridge'){
    const wLine=(deadKN/Math.cos(lowA)*1.1+Sg*snowMu(lowDeg)*1.4)*half;
    out.ridgeBeam=sizeRidgeBeam(wLine,length);
    out.notes.push(out.ridgeBeam.note+'. Решётки над потолком нет.');
    if(!out.ridgeBeam.ok) out.warnings.push(out.ridgeBeam.note);
    if(length>9) out.warnings.push('Пролёт прогона больше 9 м — рациональнее фермы.');
  }
  if(scheme==='tie'){
    out.notes.push(`Затяжка по полу воспринимает ${out.bottomTieForce.toFixed(1)} кН. Над потолком бабка и два подкоса в стропило.`);
    if(2*half>6.5) out.warnings.push(`Пролёт ${(2*half).toFixed(1)} м велик для висячей схемы — ломаный скат или фермы.`);
  }

  const holes=Math.max(1,Math.round(ctx.boltN/2));
  const Anet=ctx.tieSect[0]*Math.max(1,ctx.tieSect[1]-holes*ctx.boltD);
  const N=Math.max(out.tieForce,out.bottomTieForce);
  out.tieSigma=N*1000/Math.max(1,Anet); out.tieUtil=out.tieSigma/G.Rt; out.tieNetArea=Anet; out.tieN=N;
  if(out.tieUtil>1) out.warnings.push(`Ригель не проходит по растяжению: ${out.tieSigma.toFixed(2)} МПа при Rт=${G.Rt}.`);
  if(ceilY<2.2) out.warnings.push(`Потолок ${ceilY.toFixed(2)} м ниже 2.2 м — тесно.`);
  if(out.usableWidth<2.5) out.warnings.push(`Ширина комнаты ${out.usableWidth.toFixed(2)} м — непригодно.`);
  if(out.exhausted) out.warnings.push('Ни одно стандартное сечение не проходит — уменьшите пролёт или шаг.');

  const built=buildParts({scheme,half,length,ceilHalf,roomH:ceilY,ridgeY,kneeTop:knee,
    th:ctx.th,pw:ctx.pw,ph:ctx.ph,plateLenZ:ctx.plateLenZ,lowA,highA,tieLift:out.tieLift});
  out.parts=built.parts; out.rejectedParts=built.rejected;
  out.hasUpper=built.parts.some(q=>q.zs==='upper');
  if(built.rejected.length) out.warnings.push(`Решётка не размещена при этой геометрии: ${[...new Set(built.rejected)].join(', ')}. Поднимите уклон или опустите потолок.`);
  out.upperStep=Math.max(step,step*2);
  return out;
}