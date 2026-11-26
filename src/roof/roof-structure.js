import { GRADE, SNOW, WIND, RHO } from './roof-params.js';
import { purlinXs } from './roof-long.js';
import { GL, snowMu, slopeLineLoad, checkRafterSection } from './roof-mansard.js';

function boltLayout(m) {
  const d=m.boltD, N=m.boltN, a1=7*d, a2=3.5*d, a3=7*d, a4=3*d;
  const th=m.th*1000, rd=m.rd*1000, ta=m.ta, ca=m.ca;
  const H=(m.apex-m.tieY)*1000, rdv=rd/ca, tieHalf=m.tieHalf*1000;
  const yLoT=a4, yHiT=th-a4;
  const rb=x=>H-ta*x, yLoR=x=>rb(x)+a4/ca, yHiR=x=>rb(x)+rdv-a4/ca;
  const win=x=>Math.min(yHiT,yHiR(x))-Math.max(yLoT,yLoR(x));
  const xLo=(H+a4/ca-yHiT)/ta, xHi=Math.min(tieHalf-a3,(H+rdv-a4/ca-yLoT)/ta);
  const availLen=Math.max(0,xHi-xLo);
  if (availLen<=0||yHiT<=yLoT) return {ok:false,cols:0,rows:0,positions:[],availLen,maxWin:0,a1,a2,a3,a4,
    reason: yHiT<=yLoT?`Высота ригеля ${Math.round(th)} мм меньше двух отступов (${2*a4} мм при М${d}).`:'Ригель не заходит на стропило с нужными отступами.'};
  const NS=96; let maxWin=0;
  for(let i=0;i<=NS;i++) maxWin=Math.max(maxWin,win(xLo+availLen*i/NS));
  let chosen=null;
  for(let rows=Math.min(N,4);rows>=1;rows--){
    const cols=Math.ceil(N/rows), needLen=(cols-1)*a1, needH=(rows-1)*a2;
    if(needH>maxWin+1e-6) continue;
    const xs=[]; for(let i=0;i<=NS;i++){const x=xLo+availLen*i/NS; if(win(x)>=needH-1e-6) xs.push(x);}
    if(!xs.length) continue;
    const x0=Math.min(...xs),x1=Math.max(...xs);
    if(x1-x0<needLen-1e-6) continue;
    chosen={cols,rows,needLen,x0,x1}; break;
  }
  if(!chosen) return {ok:false,cols:0,rows:0,positions:[],availLen,maxWin,a1,a2,a3,a4,
    reason:`Доступно ${Math.round(availLen)} мм вдоль и ${Math.round(maxWin)} мм поперёк — для ${N}×М${d} мало.`};
  const {cols,rows,needLen,x0,x1}=chosen, xc=(x0+x1)/2, colX=[];
  for(let c=0;c<cols;c++) colX.push(xc-needLen/2+c*a1);
  let lo=-1e9,hi=1e9;
  colX.forEach(x=>{lo=Math.max(lo,Math.max(yLoT,yLoR(x)));hi=Math.min(hi,Math.min(yHiT,yHiR(x)));});
  const yc=(lo+hi)/2, needH=(rows-1)*a2, positions=[]; let placed=0;
  for(let c=0;c<cols&&placed<N;c++) for(let r=0;r<rows&&placed<N;r++){
    positions.push({x:colX[c]/1000,y:m.tieY+(yc-needH/2+r*a2)/1000}); placed++; }
  return {ok:true,cols,rows,positions,availLen,maxWin,needLen,needH,a1,a2,a3,a4,reason:''};
}

export function computeRoofStructure(p, m) {
  const MS = m.mansard;
  const truss = !!(m.mansardOn && MS && MS.scheme === 'truss');
  const glulamRafter = p.longStrategy === 'glulam' && !m.mansardOn;
  const G = glulamRafter ? GL : (GRADE[p.grade] || GRADE['2']);
  const Sg = SNOW[p.snowZone] || 2.4, w0 = WIND[p.windZone] || .30;

  const coverKg=m.cv.kg;
  const deckKg = m.solid?7.5:(m.batLen*.025*.10*RHO/Math.max(1,m.area));
  const cntKg = m.rafLen*.05*.05*RHO/Math.max(1,m.area);
  const rafKg = (m.V.rafter+m.V.hip+(m.V.jack||0))*RHO/Math.max(1,m.area);
  const warmKg = m.warm?(m.it*40+11):0;
  /* Мёртвая нагрузка приходит из модели — одна формула на весь проект. */
  const deadKg = Number.isFinite(m.deadKg) ? m.deadKg : coverKg+deckKg+cntKg+rafKg+warmKg+.6;
  const deadKN = deadKg*9.81/1000;

  const sectMM = [Math.round(m.rt*1000), Math.round(m.rd*1000)];
  const seatWmm = Math.round(m.seatW*1000);

  /* Для ломаной мансарды считаем ОБА ската и берём худший —
     нижний почти не нагружен, governs верхний. */
  let cases;
  if (m.mansardOn && MS.cases && MS.cases.length) {
    cases = MS.cases.map(c => ({ ...c, qPair: slopeLineLoad(deadKN, c.caS, c.deg, Sg, m.step) }));
  } else {
    const sup=[m.bw/2];
    if (p.braces && m.postZ.length) sup.push(m.dBrace);
    purlinXs(m,p).forEach(X=>sup.push(X*m.ca));
    sup.push(m.half-m.pw/2);
    const s=sup.filter(Number.isFinite).sort((a,b)=>a-b);
    let run=0; for(let i=1;i<s.length;i++) run=Math.max(run,s[i]-s[i-1]);
    cases=[{tag:'main',runH:Math.max(.3,run),caS:m.ca,deg:m.pitch,
      qPair:((deadKN/m.ca)*1.1+Sg*snowMu(m.pitch)*1.4)*m.step, supports:s}];
  }
  /* Нижний скат мансарды проверяется СВОИМ сечением, а не общим максимумом. */
  const sectOf=c=>(m.mansardOn&&MS&&MS.scheme==='broken'&&c.tag==='lower'&&Array.isArray(MS.sectLower))?MS.sectLower:sectMM;
  const checks=cases.map(c=>checkRafterSection(sectOf(c),c.runH,c.caS,c.qPair,G,seatWmm,c));
  const gov = checks.reduce((w,c)=>Math.max(c.utilR,c.utilD,c.utilSm)>Math.max(w.utilR,w.utilD,w.utilSm)?c:w, checks[0]);
  const runHoriz = Number.isFinite(gov.runH) ? gov.runH : m.half;
  const caS = Number.isFinite(gov.caS) ? gov.caS : m.ca;
  const qPair = Number.isFinite(gov.qPair) ? gov.qPair : 1;
  const slopeDeg = Number.isFinite(gov.deg) ? gov.deg : m.pitch;
  const mu = snowMu(slopeDeg), Sn = Sg*mu, Sd = Sn*1.4;
  const deadHoriz = deadKN/caS, qn = deadHoriz+Sn, qd = deadHoriz*1.1+Sd;

  const Lh=m.span, h=m.rise, hc=m.tieY-m.bearingY, hEff=Math.max(.15,h-hc);
  const thrustFull=qPair*Lh*Lh/(8*Math.max(.2,h)), tieFull=qPair*Lh*Lh/(8*hEff);
  const nasl = p.scheme==='nasl' && m.postZ.length>0;
  const tieN = m.mansardOn ? MS.tieN : (nasl?Math.max(3,tieFull*.35):tieFull);

  const d=m.boltD, t=Math.min(m.tt,m.rt)*1000, rhoK=p.grade==='3'?310:350;
  const fh=0.082*(1-0.01*d)*rhoK, My=0.3*400*Math.pow(d,2.6);
  const modeI=fh*t*d, k=My/(fh*d*t*t), modeIII=1.1*(fh*t*d)/3*(Math.sqrt(4+12*k)-1);
  const Fv=Math.min(modeI,modeIII)/1000, FvRd=Fv*0.9/1.3;
  const BL = m.tieMode==='side' && !m.mansardOn ? boltLayout(m) : null;
  const nEff = BL&&BL.ok ? BL.positions.length : (m.mansardOn&&MS&&MS.scheme==='broken' ? Math.max(1,(m.msTieBolts||[]).length) : m.boltN);
  const perEnd=tieN/2, capEnd=FvRd*nEff*m.tieSides, utilB=capEnd>0?perEnd/capEnd:9;
  const holesPerRow = BL&&BL.ok?BL.rows:Math.max(1,Math.round(m.boltN/2));
  const Anet=sectMM[0]*Math.max(1,sectMM[1]-holesPerRow*d), sigT=tieN*1000/Math.max(1,Anet);

  let ridge=null;
  if (m.mansardOn && MS.ridgeBeam) { const rb=MS.ridgeBeam; ridge={...rb,utilR:rb.sigma/GL.Ri,utilD:rb.defl/rb.deflLim}; }
  let bottomTie=null;
  if (m.mansardOn) { const jA=50*200-holesPerRow*d*50, s=MS.bottomTieForce*1000/Math.max(1,jA);
    bottomTie={N:MS.bottomTieForce,sigma:s,util:s/G.Rt,area:jA}; }

  const windUplift=w0*1.4*0.8*m.area, totalKN=qn*m.span*m.length;
  const massKg=m.wood*RHO+m.area*(coverKg+deckKg+cntKg+warmKg);

  return { G,Sg,w0,mu,Sn,Sd,deadKg,deadKN,qn,qd,qPair,Lh,h,hc,hEff,thrustFull,tieFull,tieN,nasl,
    M:qPair*runHoriz*runHoriz/8, W:gov.W, sigma:gov.sigma, I:gov.I, defl:gov.defl, deflLim:gov.lim,
    R:qPair*runHoriz/2*1000, smB:gov.sm, fh,My,Fv,FvRd,perEnd,capEnd,utilB,Anet,sigT,nEff,
    runHoriz, supports: cases[0].supports || m.faces.length, glulam:glulamRafter, ridge, bottomTie,
    slopeDeg, caS, sectMM, govTag:gov.tag, rafterCases:checks, truss, skipRafter:truss,
    boltLayout:BL, boltOk:!BL||BL.ok, boltReason:BL?BL.reason:'',
    a1:BL?BL.a1:7*d, a2:BL?BL.a2:3.5*d, a3:BL?BL.a3:7*d, a4:BL?BL.a4:3*d,
    cols:BL?BL.cols:1, rows:BL?BL.rows:1, colSpace:BL?BL.a1:90, rowSpace:BL?BL.a2:50,
    needLen:BL?BL.needLen||0:0, needH:BL?BL.needH||0:0, fits:!BL||BL.ok, fitsH:!BL||BL.ok,
    availLen:BL?BL.availLen:0, maxWin:BL?BL.maxWin:0, windUplift,totalKN,massKg,
    utilR:gov.utilR, utilD:gov.utilD, utilSm:gov.utilSm, utilT:sigT/G.Rt };
}