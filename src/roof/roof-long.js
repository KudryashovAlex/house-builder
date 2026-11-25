import { f1 } from './format.js';
import { GRADE } from './roof-params.js';

export const LONG_STRATEGIES = {
  support: 'Прогон на стойках + шпренгели',
  splice: 'Стык над опорой с накладками',
  order: 'Заказ удлинённой заготовки',
  glulam: 'Клеёная балка / LVL'
};

const FREE = new Set(['batten', 'counter', 'fascia', 'rake', 'extra']);
const SUP_TAG = '__support';

export function analyzeLong(pieces, stock, allow, kerf) {
  const usable = Math.max(500, stock - allow - kerf);
  const over = pieces.filter(p => p.cutLen > usable);
  const maxLen = pieces.reduce((m, p) => Math.max(m, p.cutLen), 0);
  const byGroup = {};
  over.forEach(p => { (byGroup[p.g] = byGroup[p.g] || []).push(p); });
  return { usable, over, maxLen, byGroup, stock, allow, kerf };
}

/* Прогоны нужны только там, где стропила не проходит по длине.
   В мансарде промежуточные опоры запрещены — длина решается заготовкой. */
export function purlinXs(m, p) {
  if (m.mansardOn) return [];
  const strat = p.longStrategy || 'support';
  if (strat !== 'support' && strat !== 'splice') return [];
  const main = m.faces.filter(f => f.tag === 'main');
  if (!main.length || !m.rafters.length) return [];
  const usable = Math.max(500, +p.stock - +p.allow - +p.kerf) / 1000;
  const x0 = Math.min(...m.rafters.filter(r => r.tag === 'main').map(r => r.x0));
  const spanSlope = m.rl - x0;
  if (!(spanSlope > usable)) return [];
  const n = Math.max(1, Math.ceil(spanSlope / usable) - 1);
  const out = [];
  for (let i = 1; i <= n; i++) out.push(x0 + spanSlope * i / (n + 1));
  return out;
}

/* Несущая способность накосного: шпренгель ставим ТОЛЬКО если не проходит */
export function hipNeedsSupport(m, p, qArea) {
  const G = GRADE[p.grade] || GRADE['2'];
  const b = m.hipW * 1000, h = m.hipDepth * 1000;
  const W = b * h * h / 6, I = b * Math.pow(h, 3) / 12;
  return m.hips.map(hp => {
    const w = qArea * 0.354 * m.rl;                    // кН/м грузовая полоса
    const L = hp.full, Lmm = L * 1000;
    const M = w * L * L / 8;
    const sigma = M * 1e6 / W;
    const defl = 5 * w * Math.pow(Lmm, 4) / (384 * G.E * I);
    const need = sigma > G.Ri || defl > Lmm / 200;
    // сколько опор нужно, чтобы прошло
    let n = 0;
    if (need) {
      for (n = 1; n <= 4; n++) {
        const seg = L / (n + 1), segMM = seg * 1000;
        const Ms = w * seg * seg / 8, ss = Ms * 1e6 / W;
        const dd = 5 * w * Math.pow(segMM, 4) / (384 * G.E * I);
        if (ss <= G.Ri && dd <= segMM / 200) break;
      }
      if (n > 4) n = 4;
    }
    return { full: L, sigma, defl, deflLim: Lmm / 200, need, supports: n, w };
  });
}

/* Шаг стоек под прогоном — по его собственной несущей способности, а не 2.5 м */
function postSpacing(m, p, qArea, sectH, segHoriz) {
  const G = GRADE[p.grade] || GRADE['2'];
  const b = 100, h = sectH;
  const W = b * h * h / 6, I = b * Math.pow(h, 3) / 12;
  const w = Math.max(.2, qArea * segHoriz / 2);        // кН/м
  const byBend = Math.sqrt(8 * G.Ri * W / (w * 1e6));
  let byDefl = 6;
  for (let L = 1; L <= 8; L += .1) {
    const f = 5 * w * Math.pow(L * 1000, 4) / (384 * G.E * I);
    if (f > L * 1000 / 200) { byDefl = L - .1; break; }
    byDefl = L;
  }
  return Math.max(1.2, Math.min(byBend, byDefl, 6));
}

function spliceDesign(sectMM, boltD) {
  const [t, h] = sectMM;
  const a1 = 7 * boltD, a3 = 7 * boltD, a2 = 3.5 * boltD, a4 = 3 * boltD;
  const rows = Math.max(1, Math.min(2, Math.floor((h - 2 * a4) / a2) + 1));
  const perSide = 2;
  return { rows, perSide, a1, a2, a3, a4,
    plateLen: Math.max(2 * (a3 + (perSide - 1) * a1 + 4 * boltD), 3 * h),
    plateTh: Math.max(25, Math.ceil(t / 2)), plateW: h,
    bolts: 2 * perSide * rows, plates: 2 };
}

function hipUnder(h, t, m) {
  const P = h.J.clone().addScaledVector(h.axis, t);
  const u1 = Math.max(.18, h.up.dot(h.n1));
  return { P, y: P.y + (m.rd / u1 - m.hipDepth) * h.up.y };
}

function shprengelSpan(m, P, sx, sz) {
  const wallX = sx * m.span / 2, wallZ = sz * m.length / 2;
  const dx = sx * m.W / 2, dz = sz * m.L / 2 - sz * m.ridgeHalf;
  const dl = Math.hypot(dx, dz) || 1;
  const base = { x: -dz / dl, z: dx / dl };
  for (const deg of [0, 22, -22, 40, -40, 60, -60]) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const px = base.x * c - base.z * s, pz = base.x * s + base.z * c;
    if (Math.abs(px) < 1e-4 || Math.abs(pz) < 1e-4) continue;
    const tX = (wallX - P.x) / px, tZ = (wallZ - P.z) / pz;
    if (!Number.isFinite(tX) || !Number.isFinite(tZ) || tX * tZ >= 0) continue;
    const ax = P.x + px * tX, az = P.z + pz * tX;
    const bx = P.x + px * tZ, bz = P.z + pz * tZ;
    if (Math.abs(az) > m.length / 2 - .12 || Math.abs(bx) > m.span / 2 - .12) continue;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < .7 || len > m.span + m.length) continue;
    return { a: { x: ax, z: az }, b: { x: bx, z: bz }, len };
  }
  return null;
}

export function planLongMembers(m, p, pieces) {
  const strategy = LONG_STRATEGIES[p.longStrategy] ? p.longStrategy : 'support';
  const stock = +p.stock, allow = +p.allow, kerf = +p.kerf;
  const A = analyzeLong(pieces.filter(x => !x[SUP_TAG]), stock, allow, kerf);
  const warnings = [], notes = [], bom = [];
  const purlins = [], pads = [], posts = [], shprengels = [], splices = [], supportPieces = [];
  const add = (g, n, q, u, k, note) => { if (Number.isFinite(q) && q > 1e-4) bom.push({ g, n, q, u, k, note }); };
  m.rafters.forEach(r => { r.joints = []; });
  for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i][SUP_TAG]) pieces.splice(i, 1);

  const counters = {};
  const mkPiece = (ab, lat, name, sect, len, stage, note, qty = 1) => {
    counters[ab] = (counters[ab] || 0) + 1;
    const n = String(counters[ab]).padStart(2, '0');
    const L = Math.max(.05, len);
    const it = { [SUP_TAG]: true, g: 'sup_' + lat.toLowerCase(), name,
      mark: `${p.prefix}-${ab}-${n}`, code: `${lat}-${n}`,
      sect: [sect[0], sect[1]], sectS: `${sect[0]}×${sect[1]}`,
      len: +L.toFixed(4), cutLen: Math.round(L * 1000) + allow, qty,
      cutA: { t: 'ровный', a: 90 }, cutB: { t: 'ровный', a: 90 }, notch: null,
      stage, note: note || '',
      vol: sect[0] / 1000 * sect[1] / 1000 * L * qty,
      mass: sect[0] / 1000 * sect[1] / 1000 * L * qty * 500, angled: 0, cuts: 2 * qty };
    supportPieces.push(it); pieces.push(it);
    return it;
  };

  const qArea = m.qArea || 3;
  const bySupport = strategy === 'support' || strategy === 'splice';
  const purX = purlinXs(m, p);
  const nPur = purX.length;
  const rafMax = m.rafters.reduce((s, r) => Math.max(s, r.len), 0);
  const base = { strategy, ...A, purlins, pads, posts, shprengels, splices, supportPieces,
    warnings, notes, bom, orderStock: stock, glulam: strategy === 'glulam', nPur, economy: null };

  let orderStock = stock;
  if (strategy === 'order' || (m.mansardOn && A.over.length)) {
    orderStock = Math.min(9000, Math.ceil(A.maxLen / 500) * 500);
    if (A.maxLen > 9000) warnings.push(`Деталь ${A.maxLen} мм длиннее 9 м — нужны фермы или клеёнка.`);
    else if (A.over.length) {
      notes.push(`Заготовка ${orderStock} мм${m.mansardOn ? ' (в мансарде промежуточные опоры запрещены)' : ''}.`);
      add('Распил', 'Наценка за нестандартную длину', A.over.reduce((s, i) => s + i.vol, 0), 'м³', 'longOrder', `${orderStock} мм`);
    }
  } else if (strategy === 'glulam') {
    notes.push('Клеёная балка / LVL: длинный пролёт без стыков, расчёт по GL24h.');
    add('Пиломатериал', 'Клеёная балка вместо массива', A.over.reduce((s, i) => s + i.vol, 0), 'м³', 'glulam', 'LVL');
  }

  const sectH = Math.max(150, Math.ceil(m.rd * 1000 / 50) * 50);
  const purSect = [100, sectH];
  const padSect = [150, 150];
  const padLen = Math.max(.6, 2 * m.step + .2);
  let savedPosts = 0;

  if (nPur) {
    const segHoriz = (m.rl / (nPur + 1)) * m.ca;
    const spacing = p.economy ? postSpacing(m, p, qArea, sectH, segHoriz) : 2.5;
    if (p.economy && spacing > 2.6) notes.push(`Шаг стоек под прогоном ${spacing.toFixed(2)} м по расчёту вместо фиксированных 2.5 м.`);
    m.faces.filter(f => f.tag === 'main').forEach((f) => {
      const fi = m.faces.indexOf(f);
      purX.forEach(X => {
        const len = 2 * m.zHalf(f, X) - .04;
        if (len < .8) return;
        const piece = mkPiece('ПГ', 'PG', 'Прогон под стропила', purSect, len, 4, `скат ${fi + 1}`);
        purlins.push({ fi, X, len, sect: purSect, mark: piece.mark });
        add('Пиломатериал', `Прогон ${purSect[0]}×${purSect[1]}`, piece.vol, 'м³', 'lumberBoard', `${f1(len)} м`);
        const nPost = Math.max(2, Math.ceil(len / spacing) + 1);
        const nOld = Math.max(2, Math.ceil(len / 2.5) + 1);
        for (let j = 0; j < nPost; j++) {
          const t = -len / 2 + len * j / (nPost - 1);
          const wp = f.pos.clone().addScaledVector(f.basis.X, X).addScaledVector(f.basis.Z, t);
          if (Math.abs(wp.x) > m.span / 2 - .16 || Math.abs(wp.z) > m.length / 2 - .16) { savedPosts++; continue; }
          const under = wp.y - (sectH / 1000) * f.basis.Y.y;
          const padTop = padSect[1] / 1000;
          const hPost = under - padTop;
          if (hPost < .35) continue;
          // подкладка не нужна, если стойка попадает точно на балку перекрытия
          const onJoist = m.joistsOn && Math.abs(((wp.z + m.length / 2) / m.step) % 1) < .18;
          if (!onJoist) {
            const pd = mkPiece('ПК', 'PD', 'Подкладка под стойку', padSect, padLen, 4, 'поперёк балок');
            pads.push({ x: wp.x, z: wp.z, len: padLen, sect: padSect, mark: pd.mark });
            add('Пиломатериал', 'Подкладка 150×150', pd.vol, 'м³', 'lumberBoard', pd.mark);
          }
          const ps = mkPiece('СК', 'SK', 'Стойка под прогон', [150, 150], hPost, 4, onJoist ? 'на балке' : 'на подкладке');
          posts.push({ x: wp.x, z: wp.z, bottom: onJoist ? 0 : padTop, top: under, sect: [150, 150], mark: ps.mark, onPad: !onJoist });
          add('Пиломатериал', 'Стойка под прогон 150×150', ps.vol, 'м³', 'lumberBoard', ps.mark);
          add('Крепёж', 'Уголок на стойку и прогон', 8, 'шт', 'angle', ps.mark);
        }
        savedPosts += Math.max(0, nOld - nPost);
      });
    });

    const D = spliceDesign([Math.round(m.rt * 1000), Math.round(m.rd * 1000)], +p.boltD || 12);
    m.rafters.forEach(r => {
      if (r.jack || r.cheek || r.tag !== 'main') return;
      purX.forEach(X => {
        if (X < r.x0 + D.plateLen / 2000 + .06 || X > m.rl - D.plateLen / 2000 - .06) return;
        r.joints.push({ X, ...D });
      });
    });
    const nJ = m.rafters.reduce((s, r) => s + r.joints.length, 0);
    if (nJ) {
      const np = mkPiece('НК', 'NK', 'Накладка стыка стропил', [D.plateTh, D.plateW], D.plateLen / 1000, 6,
        `${D.perSide} болта М${p.boltD} на сторону`, nJ * 2);
      add('Пиломатериал', `Накладки ${D.plateLen}×${D.plateW}×${D.plateTh}`, np.vol, 'м³', 'lumberBoard', `${nJ * 2} шт`);
      add('Крепёж', `Болт М${p.boltD} на стык стропил`, nJ * D.bolts, 'компл', 'bolt', `${D.bolts} на стык`);
      notes.push(`Стыки (${nJ}) лежат точно на прогоне.`);
    }
  }

  /* Шпренгели: только если накосное не проходит по расчёту */
  const hipCheck = m.hips.length ? hipNeedsSupport(m, p, qArea) : [];
  if (m.hips.length && !m.mansardOn) {
    m.hips.forEach((h, hi) => {
      const c = hipCheck[hi];
      if (!c || !c.need) {
        if (c) notes.push(`Накосное ${hi + 1}: пролёт ${f1(c.full)} м проходит без шпренгеля (σ=${c.sigma.toFixed(1)} МПа, f=${c.defl.toFixed(0)} мм).`);
        return;
      }
      const nS = c.supports;
      for (let k = 1; k <= nS; k++) {
        const t = h.full * k / (nS + 1);
        const { P, y } = hipUnder(h, t, m);
        const span = shprengelSpan(m, P, h.sx, h.sz);
        if (!span) { warnings.push(`Шпренгель угла ${hi + 1}: не удалось опереть оба конца на мауэрлат.`); continue; }
        const beamH = .15, postH = y - .02 - beamH;
        const bp = mkPiece('ШП', 'SP', 'Шпренгель через угол', [150, 150], span.len, 5, 'опора на два мауэрлата');
        add('Пиломатериал', 'Шпренгель 150×150', bp.vol, 'м³', 'lumberBoard', `${f1(span.len)} м`);
        if (postH >= .25) {
          const pp = mkPiece('СШ', 'SS', 'Шпренгельная стойка', [150, 150], postH, 5, `h=${f1(postH)}`);
          shprengels.push({ hi, a: span.a, b: span.b, len: span.len, sect: [150, 150], mark: bp.mark,
            beamY: beamH / 2, hipT: t, hipY: y,
            post: { x: P.x, z: P.z, bottom: beamH, top: y - .02, sect: [150, 150], mark: pp.mark } });
          add('Пиломатериал', 'Шпренгельная стойка 150×150', pp.vol, 'м³', 'lumberBoard', pp.mark);
          add('Крепёж', 'Уголки и болты шпренгеля', 10, 'шт', 'angle', bp.mark);
        } else {
          shprengels.push({ hi, a: span.a, b: span.b, len: span.len, sect: [150, 150], mark: bp.mark,
            beamY: Math.max(beamH / 2, y - beamH / 2), hipT: t, hipY: y, post: null });
          add('Крепёж', 'Уголки прямого опирания накосного', 6, 'шт', 'angle', bp.mark);
        }
      }
    });
  }

  A.over.forEach(pc => {
    const isRafter = pc.g === 'rafter' || pc.g === 'jack';
    const free = FREE.has(pc.g);
    if (isRafter) {
      const nJ = m.rafters.filter(r => !r.jack).reduce((s, r) => s + r.joints.length, 0);
      const D = spliceDesign(pc.sect, +p.boltD || 12);
      splices.push({ mark: pc.mark, group: pc.g, name: pc.name, qty: pc.qty, joints: nPur,
        segLen: Math.ceil(pc.cutLen / (nPur + 1)), free: false, plates: nJ * 2, bolts: nJ * D.bolts,
        plateLen: D.plateLen, plateW: D.plateW, plateTh: D.plateTh, perSide: D.perSide, rows: D.rows,
        a1: D.a1, a2: D.a2, a3: D.a3, sect: pc.sect, at: [] });
      if (!bySupport && !m.mansardOn && strategy !== 'order' && strategy !== 'glulam')
        warnings.push(`${pc.mark}: стык стропилы в пролёте недопустим.`);
      return;
    }
    const joints = Math.max(1, Math.ceil(pc.cutLen / A.usable) - 1);
    const D = free ? null : spliceDesign(pc.sect, +p.boltD || 12);
    splices.push({ mark: pc.mark, group: pc.g, name: pc.name, qty: pc.qty, joints,
      segLen: Math.ceil(pc.cutLen / (joints + 1)), free,
      plates: D ? joints * pc.qty * 2 : 0, bolts: D ? joints * pc.qty * D.bolts : 0,
      plateLen: D ? D.plateLen : 0, plateW: D ? D.plateW : 0, plateTh: D ? D.plateTh : 0,
      perSide: D ? D.perSide : 0, rows: D ? D.rows : 0,
      a1: D ? D.a1 : 0, a2: D ? D.a2 : 0, a3: D ? D.a3 : 0, sect: pc.sect, at: [] });
    if (free) add('Распил', `Стыковка ${pc.name} над опорой`, joints * pc.qty, 'стык', 'sawCut', '');
    else if (pc.g === 'plate') {
      const np = mkPiece('НМ', 'NM', 'Накладка стыка мауэрлата', [D.plateTh, Math.min(D.plateW, 150)], D.plateLen / 1000, 1, 'стык над сваей', joints * pc.qty * 2);
      add('Пиломатериал', 'Накладки мауэрлата', np.vol, 'м³', 'lumberBoard', np.mark);
      add('Крепёж', `Болт М${p.boltD} на стык мауэрлата`, joints * pc.qty * D.bolts, 'компл', 'bolt', '');
    }
  });

  const economy = { savedPosts, hipWithoutSupport: hipCheck.filter(c => !c.need).length,
    postSpacing: nPur ? postSpacing(m, p, qArea, sectH, (m.rl / (nPur + 1)) * m.ca) : 0 };
  if (m.mansardOn) notes.push('Мансарда: центральные опоры, шпренгели и прогоны со стойками исключены. Распор берут ригель перелома и балки перекрытия.');

  return { strategy, ...A, purlins, pads, posts, shprengels, splices, supportPieces,
    warnings, notes, bom, orderStock, glulam: strategy === 'glulam', rafMax, nPur, economy, hipCheck };
}