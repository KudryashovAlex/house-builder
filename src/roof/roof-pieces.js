import { mm, deg } from './format.js';
import { RHO } from './roof-params.js';
import { PIECE_GROUPS as GRP } from './roof-stages.js';

const MS_NOTE = {
  roomStud: 'стойка боковой стены комнаты',
  kneeStud: 'стойка аттиковой стенки',
  kneeCap: 'верхний мауэрлат аттиковой стенки',
  breakPurlin: 'прогон перелома ската',
  upperKing: 'бабка над потолком (ломаный скат)',
  tieKing: 'бабка над потолком (висячие)',
  trussWeb: 'раскос фермы над потолком',
  tieBrace: 'подкос потолочного ригеля',
  trussCeiling: 'потолочный пояс фермы'
};
const MS_SECT = {
  roomStud:[50,150], kneeStud:[50,150], upperKing:[50,150], tieKing:[50,150],
  trussCeiling:[50,100], breakPurlin:[150,250]
};

export function computeRoofPieces(p, m) {
  const raw = [], A = deg(m.a);
  const add = (g, sect, len, cutA, cutB, notch, note) => {
    if (!(len > .05) || !GRP[g]) return;
    if (!sect.every(v => Number.isFinite(v) && v > 0)) return;
    raw.push({ g, sect, len: +len.toFixed(4), cutA, cutB, notch: notch || null, note: note || '' });
  };
  const sq = { t:'ровный', a:90 }, plumb = { t:'вертикальный', a:+(90-A).toFixed(1), saw:+A.toFixed(1) };
  const MS = m.mansardOn ? m.mansard : null;

  add('plate',[mm(m.pw),mm(m.ph)],m.plateLenZ,sq,sq,null,'боковые, с консолью');
  add('plate',[mm(m.pw),mm(m.ph)],m.plateLenZ,sq,sq,null,'боковые');
  add('plate',[mm(m.pw),mm(m.ph)],m.span,sq,sq,null,'торцевые');
  add('plate',[mm(m.pw),mm(m.ph)],m.span,sq,sq,null,'торцевые');

  if (!MS && m.seatMode==='block') {
    add('seat',[mm(m.pw),mm(m.blockH)],m.plateLenZ,sq,sq,null,'боковые, седло по месту');
    add('seat',[mm(m.pw),mm(m.blockH)],m.plateLenZ,sq,sq,null,'боковые, седло по месту');
    if (m.type==='hip') { add('seat',[mm(m.pw),mm(m.blockH)],m.span,sq,sq,null,'торцевые');
      add('seat',[mm(m.pw),mm(m.blockH)],m.span,sq,sq,null,'торцевые'); }
  } else if (!MS && m.seatMode==='cleat') {
    for(let i=0;i<m.bearR;i++) add('seat',[mm(m.pw),mm(m.blockH)],m.cleatLen,sq,sq,null,'прибоина');
  }
  if (m.joistsOn) for(let i=0;i<m.joistN;i++) add('joist',[50,200],m.span-m.pw,sq,sq,null,'');
  if (m.postZ.length) add('sleeper',[150,150],m.sleeperLen,sq,sq,null,'');
  m.postZ.forEach(()=>add('post',[150,150],m.postH,sq,sq,null,''));
  add('beam',m.ridgeBeamSect,m.ridgeLen,sq,sq,null,`под рез ${mm(m.plumbH)} мм`);

  m.hips.forEach((h,hi)=>{
    const hipA=deg(Math.atan2(m.apex-m.eaveY,Math.hypot(h.B.x,h.B.z-h.zr)));
    const cut={t:'compound',a:+(90-hipA).toFixed(1),saw:+hipA.toFixed(1),cheek:45};
    for(let k=0;k<m.hipLam;k++)
      add('hip',[mm(m.hipBoardT),mm(m.hipDepth)],h.full+h.ext,cut,{...cut},null,
        `доска ${k+1}/${m.hipLam} пакета №${hi+1}, скос кромки по месту`);
  });

  m.rafters.forEach(r=>{
    const f=r.f, fa=deg(f.a);
    const pl={t:'вертикальный',a:+(90-fa).toFixed(1),saw:+fa.toFixed(1)};
    let xsi=m.Xsi;
    if (MS) xsi = f.tag==='lower' ? (m.half-m.pw/2-MS.breakX)/f.ca : (f.tag==='upper' ? 1e9 : (m.half-m.pw/2)/f.ca);
    const notch = (MS || m.seatMode!=='notch') && r.cheek ? null
      : (!MS && m.seatMode!=='notch' ? null
        : (r.x0<xsi-.02 && xsi<1e8 ? {t:'седло',w:mm(m.seatW),d:mm(m.seatW*f.sa),at:mm(Math.max(0,xsi-r.x0)),a:+fa.toFixed(1)} : null));
    add(r.jack?'jack':'rafter',[mm(f.rt||m.rt),mm(f.rd||m.rd)],r.len,
      r.jack?{t:'косой (cheek)',a:+(90-fa).toFixed(1),saw:+fa.toFixed(1),cheek:45}:pl,
      pl,notch, r.jack?'упор в накосное':(MS?(f.tag==='upper'?'верхний скат мансарды':f.tag==='lower'?'нижний скат мансарды':'скат мансарды'):''));
  });

  m.tieZ.forEach(()=>{
    const n = MS ? 1 : m.tieSides;
    for(let s=0;s<n;s++) add('tie',[mm(m.tt),mm(m.th)],2*m.tieHalf,
      MS?sq:{t:'по скату',a:+A.toFixed(1),saw:+(90-A).toFixed(1)},
      MS?sq:{t:'по скату',a:+A.toFixed(1),saw:+(90-A).toFixed(1)},
      null, MS?`потолок мансарды на ${MS.roomH.toFixed(2)} м`:(m.tieMode==='side'?`сбоку, ${m.boltN}×М${m.boltD}`:'снизу, накладки'));
  });

  /* ═══ ЧЛЕНЫ МАНСАРДЫ В РАСПИЛ ═══
     Берутся прямо из parts по mk:[группа, длина] — то же самое,
     что рисуется в сцене, поэтому ведомость и модель не расходятся. */
  if (MS && Array.isArray(MS.parts)) {
    MS.parts.forEach(q=>{
      if (!Array.isArray(q.mk) || q.mk.length < 2) return;
      const n = q.zs==='tie' ? m.tieZ.length : q.zs==='upper' ? m.upperZ.length : 1;
      if (!n) return;
      const [g, len] = q.mk;
      if (!(len > .05)) return;
      let sect = MS_SECT[q.tag];
      if (!sect) {
        if (q.t === 'brace') sect = [Math.round((q.thick||.05)*1000), Math.round((q.depth||.15)*1000)];
        else if (q.tag === 'kneeCap') sect = [mm(m.pw), mm(m.ph)];
        else if (Array.isArray(q.s)) { const s=q.s.slice().sort((a,b)=>a-b); sect=[Math.round(s[0]*1000),Math.round(s[1]*1000)]; }
        else sect = [50,150];
      }
      let cutA = sq, cutB = sq;
      if (q.t === 'brace' && Array.isArray(q.a) && Array.isArray(q.b)) {
        const ba = deg(Math.atan2(Math.abs(q.b[1]-q.a[1]), Math.max(.01,Math.abs(q.b[0]-q.a[0]))));
        cutA = { t:'по узлу', a:+(90-ba).toFixed(1), saw:+ba.toFixed(1) };
        cutB = { t:'по узлу', a:+ba.toFixed(1), saw:+(90-ba).toFixed(1) };
      }
      for (let i=0;i<n;i++) add(g, sect, len, cutA, cutB, null, MS_NOTE[q.tag] || 'член мансарды');
    });
  }

  if (p.braces && m.postZ.length) m.postZ.forEach(()=>{
    const ba=deg(m.braceAngle);
    for(let s=0;s<2;s++) add('brace',[50,150],m.braceLen,
      {t:'по грани стойки',a:+(90-ba).toFixed(1),saw:+ba.toFixed(1)},
      {t:'по низу стропил',a:+(A+ba).toFixed(1),saw:+(90-A-ba).toFixed(1)},null,'2×М10 на узел');
  });

  add('fascia',[25,150],m.L,sq,sq,null,'карниз правый');
  add('fascia',[25,150],m.L,sq,sq,null,'карниз левый');
  if (m.type==='hip') { add('fascia',[25,150],m.W,sq,sq,null,'карниз перед'); add('fascia',[25,150],m.W,sq,sq,null,'карниз зад'); }
  else m.faces.forEach(f=>{ const fa=deg(f.a);
    for(let q=0;q<2;q++) add('rake',[25,150],f.rl,
      {t:'вертикальный',a:+(90-fa).toFixed(1),saw:+fa.toFixed(1)},
      {t:'вертикальный',a:+(90-fa).toFixed(1),saw:+fa.toFixed(1)},null,'фронтон'); });

  m.rafters.forEach(r=>add('counter',[50,50],r.len-.06,sq,sq,null,''));
  if (!m.solid) m.rows.forEach(r=>add('batten',[25,100],r.len,sq,sq,null,'шаг '+mm(m.cv.module||.35)+' мм'));
  if (m.extraIns>.001) m.faces.forEach(f=>{ const zl=f.kind==='tri'?m.span/2:m.length/2;
    for(let x=.3;x<f.rlPie-.05;x+=.6) add('extra',[50,mm(m.extraIns)],2*Math.min(m.zHalfPie(f,x),zl),sq,sq,null,''); });

  const map=new Map();
  raw.forEach(r=>{
    const sig=[r.g,r.sect.join('x'),Math.round(r.len*1000),r.cutA.t,r.cutA.a,r.cutB.t,r.cutB.a,r.notch?r.notch.t+r.notch.d:'-'].join('|');
    if(!map.has(sig)) map.set(sig,{...r,qty:0,sig});
    map.get(sig).qty++;
  });
  const list=[...map.values()], cnt={};
  list.sort((a,b)=>(GRP[a.g].st-GRP[b.g].st)||(b.len-a.len));
  list.forEach(it=>{
    const G=GRP[it.g]; cnt[G.ab]=(cnt[G.ab]||0)+1;
    it.mark=`${p.prefix}-${G.ab}-${String(cnt[G.ab]).padStart(2,'0')}`;
    it.code=`${G.lat}-${String(cnt[G.ab]).padStart(2,'0')}`;
    it.stage=G.st; it.name=G.n; it.sectS=it.sect.join('×');
    it.cutLen=Math.round(it.len*1000)+ +p.allow;
    it.vol=it.sect[0]/1000*it.sect[1]/1000*it.len*it.qty;
    it.mass=it.vol*RHO;
    it.angled=(it.cutA.t!=='ровный'?1:0)+(it.cutB.t!=='ровный'?1:0)+(it.notch?1:0);
    it.cuts=2*it.qty+(it.notch?it.qty:0);
  });
  return list;
}