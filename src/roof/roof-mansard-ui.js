import { cl, deg } from './format.js';

export const MANSARD_SCHEMES = {
  broken: { n: 'Ломаный скат (мансардный)', short: 'Ломаный скат',
    d: 'Нижний скат 55–70°, верхний 20–35°. Ригель в переломе — потолок комнаты. Над потолком бабка с подкосами. Опор в центре нет.' },
  tie: { n: 'Висячие стропила с затяжкой по полу', short: 'Висячие + затяжка',
    d: 'Пара стропил замкнута балками перекрытия. Потолочный ригель усилен двумя подкосами в стропило. Пролёт до 6 м.' },
  ridge: { n: 'Коньковый прогон на фронтонах', short: 'Прогон на фронтонах',
    d: 'Клеёный прогон перекрывает всю длину и опирается только на фронтоны. Решётки над потолком нет — всё несёт прогон.' },
  truss: { n: 'Мансардная ферма заводская', short: 'Ферма',
    d: 'Полная решётка с проёмом под комнату: нижний пояс, потолочный пояс, стойки проёма, раскосы и гвоздевые пластины. Хорды считает завод.' }
};

/* Реальный сортамент клеёных балок. Узкие высокие сечения (90×800)
   отбраковываются по h/b — они неустойчивы из плоскости и нестрогаемы. */
const GL_W = [90, 115, 140, 165, 190, 215, 240, 265, 290];
const GL_H = [200, 240, 300, 360, 400, 450, 500, 560, 600, 630, 700, 800];
const MAX_HB = 4.5;
export const GL = { Ri: 24, Rt: 16, Rsm: 2.6, E: 11500, n: 'Клеёная GL24h' };
export const RAFTER_SECTIONS = [[50,150],[50,200],[60,200],[50,250],[60,250],[50,300],[60,300],[75,300],[100,300]];

const STUD = [50, 150], KING = [50, 150], BRACE = [50, 150], COLLAR = [50, 100], WEB = [45, 145];
const rad = d => d * Math.PI / 180;
export const snowMu = d => d <= 30 ? 1 : d >= 60 ? 0 : (60 - d) / 30;
export const slopeLineLoad = (deadKN, caS, slopeDeg, Sg, step) =>
  ((deadKN / caS) * 1.1 + Sg * snowMu(slopeDeg) * 1.4) * step;

export function checkRafterSection(sect, runH, caS, qPair, G, seatWmm, meta) {
  const [b, h] = sect;
  const W = b * h * h / 6, I = b * h * h * h / 12;
  const M = qPair * runH * runH / 8;
  const sigma = M * 1e6 / Math.max(1, W);
  const Ls = runH / caS * 1000, qN = qPair * caS * caS;
  const defl = 5 * qN * Math.pow(Ls, 4) / (384 * G.E * I), lim = Ls / 200;
  const sm = (qPair * runH / 2 * 1000) / Math.max(1, seatWmm * b);
  return { tag: (meta && meta.tag) || 'main', deg: meta && Number.isFinite(meta.deg) ? meta.deg : null,
    sect, sigma, defl, lim, sm, W, I, Ls, qPair, runH, caS,
    utilR: sigma / G.Ri, utilD: defl / lim, utilSm: sm / G.Rsm,
    ok: sigma <= G.Ri && defl <= lim && sm <= G.Rsm };
}
export function pickRafterSection(cases, G, seatWmm, minSect) {
  const pool = minSect ? RAFTER_SECTIONS.filter(s => s[0]*s[1] >= minSect[0]*minSect[1]) : RAFTER_SECTIONS;
  for (const sect of pool) {
    const res = cases.map(c => checkRafterSection(sect, c.runH, c.caS, c.qPair, G, seatWmm, c));
    if (res.every(r => r.ok)) return { sect, cases: res, auto: true };
  }
  const sect = pool[pool.length - 1];
  return { sect, cases: cases.map(c => checkRafterSection(sect, c.runH, c.caS, c.qPair, G, seatWmm, c)), auto: true, exhausted: true };
}

/* Подбор прогона: минимальная площадь при h/b ≤ 4.5, изгиб ≤ Ri, прогиб ≤ L/250.
   Раньше бралась первая passing по возрастанию ширины — получалось 90×800. */
function sizeRidgeBeam(wLine, spanM) {
  const M = wLine * spanM * spanM / 8;
  const Lmm = spanM * 1000, needW = M * 1e6 / GL.Ri, lim = Lmm / 250;
  const pool = [];
  for (const b of GL_W) for (const h of GL_H) {
    if (h / b > MAX_HB) continue;
    pool.push({ b, h, area: b * h });
  }
  pool.sort((x, y) => x.area - y.area || x.h - y.h);
  for (const { b, h } of pool) {
    const W = b * h * h / 6, I = b * Math.pow(h, 3) / 12;
    if (W < needW) continue;
    const f = 5 * wLine * Math.pow(Lmm, 4) / (384 * GL.E * I);
    if (f > lim) continue;
    return { sect: [b, h], M, W, I, sigma: M * 1e6 / W, defl: f, deflLim: lim, ok: true, hb: +(h / b).toFixed(2),
      note: `Клеёная ${b}×${h} (h/b ${(h / b).toFixed(1)}), пролёт ${spanM.toFixed(1)} м без стоек` };
  }
  const last = pool[pool.length - 1], b = last.b, h = last.h;
  const W = b * h * h / 6, I = b * Math.pow(h, 3) / 12;
  return { sect: [b, h], M, W, I, sigma: M * 1e6 / W,
    defl: 5 * wLine * Math.pow(Lmm, 4) / (384 * GL.E * I), deflLim: lim, ok: false, hb: +(h / b).toFixed(2),
    note: `Пролёт ${spanM.toFixed(1)} м велик для клеёного прогона — нужны фермы или стойки у фронтонов` };
}

function buildParts(o) {
  const { scheme, half, length, ceilHalf, roomH, ridgeY, kneeTop, th, pw, ph, plateLenZ, lowA, highA } = o;
  const P = [];
  const box = (s, p, zs, mat, tag, st, mk) => P.push({ t:'box', s, p, zs, mat, tag, st, mk });
  const beam = (a, b, s, zs, mat, tag, st, mk) => P.push({ t:'beam', a, b, s, zs, mat, tag, st, mk });
  const plate = (p, zs, tag, st, s=[.16,.004,.16]) => P.push({ t:'box', s, p, zs, mat:'steel', tag, st });

  box([2*ceilHalf, .022, length], [0, .011, 0], null, 'floor', 'mansardFloor', 2);
  box([2*ceilHalf, .018, length], [0, roomH - th - .009, 0], null, 'ceil', 'mansardCeiling', 10);

  if (kneeTop > .05) {
    const wallH = Math.max(.08, kneeTop - ph);
    [-1,1].forEach(s => {
      box([pw, wallH, plateLenZ], [s*half, wallH/2, 0], null, 'knee', 'knee', 1);
      box([pw, ph, plateLenZ], [s*half, kneeTop - ph/2, 0], null, 'plate', 'kneeCap', 1, ['plate', plateLenZ]);
      const n = Math.max(2, Math.round(plateLenZ/.6));
      for (let i=0;i<=n;i++)
        box([.05, wallH, .15], [s*half, wallH/2, -plateLenZ/2 + plateLenZ*i/n], null, 'web', 'kneeStud', 1, ['post', wallH]);
    });
  }
  [-1,1].forEach(s => {
    box([.05, roomH, .15], [s*ceilHalf, roomH/2, 0], 'tie', 'web', 'roomStud', 6, ['post', roomH]);
    box([.05, .05, length], [s*ceilHalf, .025, 0], null, 'web', 'roomRail', 6);
  });

  const yAt = x => ridgeY - (ridgeY - kneeTop) * (Math.abs(x)/half);

  if (scheme === 'broken') {
    [-1,1].forEach(s => box([.10,.20,plateLenZ], [s*ceilHalf, roomH-.10, 0], null, 'purlin', 'breakPurlin', 5));
    const hU = ridgeY - roomH;
    if (hU >= .7 && ceilHalf >= 1.0) {
      const kLen = hU - .04;
      box([KING[0]/1000, kLen, KING[1]/1000], [0, roomH + kLen/2, 0], 'upper', 'web', 'upperKing', 8, ['post', kLen]);
      plate([0, ridgeY - .05, 0], 'upper', 'trussPlate', 8, [.2,.004,.2]);
      const t = (ceilHalf/Math.cos(highA)) * .55;
      const tx = ceilHalf - t*Math.cos(highA), ty = ridgeY - t*Math.sin(highA);
      [-1,1].forEach(s => {
        const a=[0, roomH+.12], b=[s*Math.abs(tx), ty];
        beam(a, b, [BRACE[0]/1000, BRACE[1]/1000], 'upper', 'web', 'trussWeb', 8, ['brace', Math.hypot(b[0]-a[0], b[1]-a[1])]);
        plate([b[0], b[1]-.02, 0], 'upper', 'trussPlate', 8);
      });
      const cy = roomH + hU*.62;
      const chHalf = Math.min(Math.max(.25,(ridgeY-cy)/Math.tan(highA)), ceilHalf-.1);
      box([2*chHalf, COLLAR[1]/1000, COLLAR[0]/1000], [0, cy, 0], 'upper', 'web', 'trussCeiling', 8, ['tie', 2*chHalf]);
    }
  } else if (scheme === 'tie') {
    const t = ((half - ceilHalf)/Math.cos(lowA)) * .62;
    const tx = ceilHalf + t*Math.cos(lowA), ty = roomH + t*Math.sin(lowA);
    [-1,1].forEach(s => {
      const a=[s*ceilHalf, roomH - th*.5], b=[s*Math.abs(tx), ty];
      beam(a, b, [BRACE[0]/1000, BRACE[1]/1000], 'tie', 'web', 'tieBrace', 7, ['brace', Math.hypot(b[0]-a[0], b[1]-a[1])]);
      plate([a[0], a[1]+.02, 0], 'tie', 'trussPlate', 7);
      plate([b[0], b[1]-.02, 0], 'tie', 'trussPlate', 7);
    });
  } else if (scheme === 'ridge') {
    [-1,1].forEach(sz => box([.26,.02,.24], [0, 0, sz*(length/2-.12)], null, 'steel', 'gableBearing', 4));
  } else if (scheme === 'truss') {
    [-1,1].forEach(s => {
      const xr = s*ceilHalf;
      beam([xr, .06], [s*half*.97, yAt(half*.97)-.05], [WEB[0]/1000, WEB[1]/1000], 'tie', 'web', 'trussWeb', 8,
        ['brace', Math.hypot(half*.97-ceilHalf, yAt(half*.97)-.05-.06)]);
      beam([xr, roomH-.06], [0, ridgeY-.10], [WEB[0]/1000, WEB[1]/1000], 'tie', 'web', 'trussWeb', 8,
        ['brace', Math.hypot(ceilHalf, ridgeY-.10-roomH+.06)]);
      plate([xr, .05, 0], 'tie', 'trussPlate', 8);
      plate([xr, roomH-.02, 0], 'tie', 'trussPlate', 8);
      plate([s*half*.97, yAt(half*.97)-.06, 0], 'tie', 'trussPlate', 8);
    });
    plate([0, ridgeY-.10, 0], 'tie', 'trussPlate', 8, [.22,.004,.22]);
    box([2*ceilHalf, WEB[0]/1000, WEB[1]/1000], [0, roomH - th - .04, 0], 'tie', 'web', 'trussCeiling', 8);
  }
  return P;
}

export function solveMansard(p, ctx) {
  const scheme = MANSARD_SCHEMES[p.mansardScheme] ? p.mansardScheme : 'broken';
  const half = ctx.half, length = ctx.length, eave = ctx.eave;
  const knee = cl(p.mansardKnee ?? 0, 0, 1.8);
  const G = ctx.G, step = ctx.step, Sg = ctx.Sg, deadKN = ctx.deadKN;
  const seatWmm = ctx.seatWmm || 60, wantH = cl(p.mansardRoomH ?? 2.4, 2.0, 3.2);
  const out = { scheme, knee, kneeTop: knee, noPosts: true, warnings: [], notes: [], cases: [], autoPicked: false };

  let lowA, highA, lowDeg, highDeg, ceilHalf, ceilY, ridgeY, lowRL, highRL, lowRun;
  if (scheme === 'broken') {
    lowDeg = cl(p.mansardLowPitch ?? 62, 45, 75); highDeg = cl(p.mansardHighPitch ?? 30, 15, 40);
    lowA = rad(lowDeg); highA = rad(highDeg);
    ceilY = Math.max(knee + .8, wantH);
    lowRun = (ceilY - knee)/Math.tan(lowA);
    ceilHalf = half - lowRun;
    if (ceilHalf < 1.1) { ceilHalf = 1.1; lowRun = half - ceilHalf; lowDeg = deg(Math.atan2(ceilY-knee, lowRun)); lowA = rad(lowDeg);
      out.warnings.push(`Нижний уклон выправлен до ${lowDeg.toFixed(0)}° — иначе комната уже 2.2 м.`); }
    if (ceilHalf > half - .35) { ceilHalf = half - .35; lowRun = half - ceilHalf; lowDeg = deg(Math.atan2(ceilY-knee, lowRun)); lowA = rad(lowDeg); }
    ridgeY = ceilY + ceilHalf*Math.tan(highA);
    lowRL = (lowRun + eave)/Math.cos(lowA); highRL = ceilHalf/Math.cos(highA);
    out.notes.push(`Комната ${(2*ceilHalf).toFixed(2)}×${length.toFixed(1)} м, потолок ${ceilY.toFixed(2)} м — это ригель перелома.`);
    out.notes.push(`Низ ${lowDeg.toFixed(0)}° (μ ${snowMu(lowDeg).toFixed(2)}), верх ${highDeg.toFixed(0)}° (μ ${snowMu(highDeg).toFixed(2)}). Верхний скат заходит за перелом на 220 мм внахлёст, сверху планка.`);
    if (highA >= lowA) out.warnings.push('Верхний уклон не меньше нижнего — перелом не работает.');
  } else {
    lowDeg = highDeg = cl(ctx.pitch, 20, 55); lowA = highA = rad(lowDeg);
    const ta = Math.tan(lowA);
    ridgeY = knee + half*ta;
    ceilY = Math.min(wantH, ridgeY - .45);
    if (ceilY < knee + .8) ceilY = Math.min(knee + .8, ridgeY - .25);
    lowRun = (ceilY - knee)/ta;
    ceilHalf = Math.max(.9, half - lowRun);
    lowRL = (half + eave)/Math.cos(lowA); highRL = 0;
    if (Math.abs(ceilY - wantH) > .02) out.warnings.push(`Потолок опущен до ${ceilY.toFixed(2)} м — выше не хватает высоты ската.`);
    out.notes.push(`Комната ${(2*ceilHalf).toFixed(2)}×${length.toFixed(1)} м, плоский потолок ${ceilY.toFixed(2)} м, конёк ${ridgeY.toFixed(2)} м.`);
  }

  out.lowA=lowA; out.highA=highA; out.lowDeg=lowDeg; out.highDeg=highDeg;
  out.roomH=ceilY; out.ceilHalf=ceilHalf; out.roomW=2*ceilHalf;
  out.breakX=ceilHalf; out.breakY=ceilY; out.ridgeY=ridgeY; out.apex=ridgeY;
  out.lowRL=lowRL; out.highRL=highRL; out.lowRun=lowRun; out.lowerRun=lowRun;
  out.eaveY = knee - eave*Math.tan(lowA);
  out.tieY=ceilY; out.tieHalf=ceilHalf;
  out.roomWidth=2*ceilHalf; out.roomHeight=ceilY; out.ceilFlat=true;
  out.usableHalf=ceilHalf; out.usableWidth=2*ceilHalf; out.usableArea=2*ceilHalf*length; out.headroom=ceilY;
  out.lowerSpan=lowRL; out.upperSpan=highRL; out.upperRun=ceilHalf;
  out.studs=[-1,1].map(s=>({x:s*ceilHalf,y0:0,y1:ceilY,sect:STUD.slice(),s}));
  out.lap = scheme === 'broken' ? .22 : 0;

  const cases = scheme === 'broken'
    ? [{tag:'lower',runH:lowRun,caS:Math.cos(lowA),deg:lowDeg,qPair:slopeLineLoad(deadKN,Math.cos(lowA),lowDeg,Sg,step)},
       {tag:'upper',runH:ceilHalf,caS:Math.cos(highA),deg:highDeg,qPair:slopeLineLoad(deadKN,Math.cos(highA),highDeg,Sg,step)}]
    : [{tag:'main',runH:half,caS:Math.cos(lowA),deg:lowDeg,qPair:slopeLineLoad(deadKN,Math.cos(lowA),lowDeg,Sg,step)}];
  out.cases = cases;

  if (scheme === 'truss') {
    out.sect = ctx.minSect || [50,200];
    out.checks = cases.map(c=>checkRafterSection(out.sect,c.runH,c.caS,c.qPair,G,seatWmm,c));
    out.exhausted=false; out.autoPicked=false; out.truss=true;
    out.trussDepth = Math.round((2*half)/12*1000/50)*50; out.trussLoad = cases[0].qPair;
    out.notes.push(`Ферма: пролёт ${(2*half).toFixed(1)} м, высота ≈${out.trussDepth} мм, потолочный пояс ${ceilY.toFixed(2)} м, раскосы и пластины на каждом узле.`);
    out.notes.push('Хорды и решётку рассчитывает завод (СП 64 разд. 9). Сечение в модели — габарит заготовки.');
  } else {
    const pick = pickRafterSection(cases, G, seatWmm, ctx.minSect);
    out.sect=pick.sect; out.checks=pick.cases; out.exhausted=!!pick.exhausted; out.autoPicked=true;
    out.notes.push(`Сечение стропил — минимальное проходящее: ${pick.sect[0]}×${pick.sect[1]} мм.`);
  }

  const hU = Math.max(.2, ridgeY - ceilY);
  out.tieForce = cases[cases.length-1].qPair * Math.pow(2*ceilHalf,2)/(8*hU);
  out.bottomTieForce = scheme === 'ridge' ? 0 : cases[0].qPair*Math.pow(2*half,2)/(8*Math.max(.3, ridgeY-knee));
  if (scheme === 'ridge') {
    const wLine = (deadKN/Math.cos(lowA)*1.1 + Sg*snowMu(lowDeg)*1.4)*half;
    out.ridgeBeam = sizeRidgeBeam(wLine, length);
    out.notes.push(out.ridgeBeam.note + '. Решётки над потолком нет.');
    if (!out.ridgeBeam.ok) out.warnings.push(out.ridgeBeam.note);
    if (out.ridgeBeam.hb > MAX_HB) out.warnings.push(`Пропорция прогона h/b ${out.ridgeBeam.hb} выше ${MAX_HB} — нужна раскрепляющая связь.`);
    if (length > 9) out.warnings.push('Пролёт прогона больше 9 м — рациональнее фермы.');
  }
  if (scheme === 'tie') {
    out.notes.push(`Затяжка по полу воспринимает ${out.bottomTieForce.toFixed(1)} кН, потолочный ригель усилен двумя подкосами.`);
    if (2*half > 6.5) out.warnings.push(`Пролёт ${(2*half).toFixed(1)} м велик для висячей схемы.`);
  }

  const holes = Math.max(1, Math.round(ctx.boltN/2));
  const Anet = ctx.tieSect[0]*Math.max(1, ctx.tieSect[1] - holes*ctx.boltD);
  const N = Math.max(out.tieForce, out.bottomTieForce);
  out.tieSigma = N*1000/Math.max(1,Anet); out.tieUtil = out.tieSigma/G.Rt; out.tieNetArea=Anet; out.tieN=N;
  if (out.tieUtil > 1) out.warnings.push(`Ригель не проходит по растяжению: ${out.tieSigma.toFixed(2)} МПа при Rт=${G.Rt}.`);
  if (ceilY < 2.2) out.warnings.push(`Потолок ${ceilY.toFixed(2)} м ниже 2.2 м — тесно.`);
  if (out.usableWidth < 2.5) out.warnings.push(`Ширина комнаты ${out.usableWidth.toFixed(2)} м — непригодно.`);
  if (out.exhausted) out.warnings.push('Ни одно стандартное сечение не проходит — уменьшите пролёт или шаг.');

  out.parts = buildParts({ scheme, half, length, ceilHalf, roomH:ceilY, ridgeY, kneeTop:knee,
    th:ctx.th, pw:ctx.pw, ph:ctx.ph, plateLenZ:ctx.plateLenZ, lowA, highA });
  out.upperStep = Math.max(step, step*2);
  return out;
}