import { num, clamp, int } from './safe.js';

export const STAIR_TYPES = [
  { value: 'straight',  label: 'Прямая (один марш)' },
  { value: 'l_landing', label: 'Г-образная с площадкой' },
  { value: 'u_landing', label: 'П-образная с площадкой' },
  { value: 'l_winder',  label: 'Г-образная забежная' },
];
export const STAIR_WIDTHS = [
  { value: '0.9', label: '0.9 м (минимум)' },
  { value: '1.0', label: '1.0 м (комфорт)' },
  { value: '1.1', label: '1.1 м' },
  { value: '1.2', label: '1.2 м (парадный)' },
];
export const STAIR_STRINGERS = [
  { value: 'kosour', label: 'Косоур (открытый)' },
  { value: 'tetiva', label: 'Тетива (закрытый)' },
];
export const STAIR_RAILS = [
  { value: 'wood',  label: 'Дерево' },
  { value: 'white', label: 'Крашеное дерево' },
  { value: 'forge', label: 'Кованый металл' },
];
export const STAIR_TURNS = [
  { value: 'right', label: 'Поворот направо' },
  { value: 'left',  label: 'Поворот налево' },
];
export const STAIR_RISERS = [
  { value: 'yes', label: 'С подступенками' },
  { value: 'no',  label: 'Открытые (без подступенков)' },
];

const pick = (v, list, def) => (list.some(o => o.value === String(v)) ? String(v) : def);

/* Внутренний объект конструкции. НИКОГДА не назначать через Object.assign на params —
   у него есть своё поле width (ширина марша), которое затрёт ширину дома. */
export function stairDesign(p) {
  return {
    type:     pick(p.stairType, STAIR_TYPES, 'l_landing'),
    width:    pick(p.stairWidth, STAIR_WIDTHS, '1.0'),
    stringer: pick(p.stairStringer, STAIR_STRINGERS, 'kosour'),
    risers:   pick(p.stairRisers, STAIR_RISERS, 'yes'),
    rail:     pick(p.stairRail, STAIR_RAILS, 'wood'),
    turn:     pick(p.stairTurn, STAIR_TURNS, 'right'),
  };
}

/* Единственный разрешённый способ нормализовать параметры лестницы в params */
export function sanitizeStairParams(p) {
  const d = stairDesign(p);
  p.stairType = d.type;
  p.stairWidth = d.width;
  p.stairStringer = d.stringer;
  p.stairRisers = d.risers;
  p.stairRail = d.rail;
  p.stairTurn = d.turn;
  return p;
}

// Формула Блонделя: 2h + b = 600…640 мм. Все подъёмы строго равны.
export function solveRises(rise) {
  const H = clamp(rise, 2.2, 4.5) || 2.7;
  let best = null;
  const nMin = Math.max(6, Math.ceil(H / 0.205));
  const nMax = Math.max(nMin, Math.floor(H / 0.145));
  for (let N = nMin; N <= nMax; N++) {
    const h = H / N;
    const b = clamp(0.62 - 2 * h, 0.25, 0.32);
    const bl = 2 * h + b;
    if (!Number.isFinite(bl) || bl < 0.595 || bl > 0.645) continue;
    const score = Math.abs(h - 0.17) * 1.2 + Math.abs(b - 0.29) * .8 + Math.abs(bl - 0.62);
    if (!best || score < best.score) best = { n: N, h, b, blondel: bl };
  }
  if (!best) {
    const N = Math.max(6, Math.round(H / 0.175));
    const h = H / N;
    const b = clamp(0.62 - 2 * h, 0.25, 0.32);
    best = { n: N, h, b, blondel: 2 * h + b };
  }
  return best;
}

export function computeStair(params, stair) {
  const d = stairDesign(params);
  const H = clamp(params.wallHeight, 2.2, 4.5) || 2.7;
  const W = clamp(d.width, .8, 1.4) || 1;
  const sx = num(stair && stair.x, 0);
  const sz = num(stair && stair.z, 0);
  const angle = num(stair && stair.angle, 0);
  const { n, h, b, blondel } = solveRises(H);

  let type = d.type;
  if (type === 'l_winder' && n < 10) type = 'l_landing';
  if (type !== 'straight' && n < 8) type = 'straight';

  const mirror = d.turn === 'left' ? -1 : 1;
  let k, m, wind = 0;
  if (type === 'straight') { k = n; m = 0; }
  else if (type === 'l_winder') { wind = 3; k = int(Math.round((n - 3) / 2), 2, n - 5); m = n - 3 - k; }
  else { k = int(Math.round(n / 2), 3, n - 3); m = n - k; }
  if (!Number.isFinite(k) || k < 2 || m < 2) { type = 'straight'; k = n; m = 0; wind = 0; }

  const run1 = Math.max(b, (k - 1) * b);
  const run2 = m > 1 ? Math.max(b, (m - 1) * b) : 0;
  const corner = type !== 'straight';
  const cornerW = type === 'u_landing' ? 2 * W : W;
  const cZ0 = run1, cZ1 = run1 + W;
  const f2Base = k + wind;
  const xL = -W / 2, xR = W / 2;

  const slabT = .1, headroom = 2.0;
  const firstRiser = Math.max(1, Math.floor((H - headroom - slabT) / h) + 1);
  const z0 = clamp((firstRiser - 1) * b, 0, run1);

  let footprint, hole, exitEdge;
  if (type === 'straight') {
    footprint = [{ x: xL, y: 0 }, { x: xR, y: 0 }, { x: xR, y: run1 }, { x: xL, y: run1 }];
    hole = [{ x: xL, y: z0 }, { x: xR, y: z0 }, { x: xR, y: run1 }, { x: xL, y: run1 }];
    exitEdge = 2;
  } else if (type === 'u_landing') {
    const f2z = run1 - run2;
    footprint = [{ x: xL, y: 0 }, { x: xR, y: 0 }, { x: xR, y: f2z }, { x: xR + W, y: f2z }, { x: xR + W, y: cZ1 }, { x: xL, y: cZ1 }];
    hole = [{ x: xL, y: z0 }, { x: xR, y: z0 }, { x: xR, y: f2z }, { x: xR + W, y: f2z }, { x: xR + W, y: cZ1 }, { x: xL, y: cZ1 }];
    exitEdge = 2;
  } else {
    footprint = [{ x: xL, y: 0 }, { x: xR, y: 0 }, { x: xR, y: cZ0 }, { x: xR + run2, y: cZ0 }, { x: xR + run2, y: cZ1 }, { x: xL, y: cZ1 }];
    hole = [{ x: xL, y: z0 }, { x: xR, y: z0 }, { x: xR, y: cZ0 }, { x: xR + run2, y: cZ0 }, { x: xR + run2, y: cZ1 }, { x: xL, y: cZ1 }];
    exitEdge = 3;
  }
  const toXZ = p => ({ x: p.x, z: p.y });
  footprint = footprint.map(toXZ);
  hole = hole.map(toXZ);

  const rails = [];
  const seg = (x1, z1, x2, z2) => {
    if ([x1, z1, x2, z2].every(Number.isFinite) && Math.hypot(x2 - x1, z2 - z1) > .05) rails.push({ x1, z1, x2, z2 });
  };
  if (type === 'straight') { seg(xL, 0, xL, run1); seg(xR, 0, xR, run1); }
  else if (type === 'u_landing') {
    seg(xL, 0, xL, cZ1); seg(xL, cZ1, xR + W, cZ1);
    seg(xR + W, run1 - run2, xR + W, cZ1); seg(xR, 0, xR, run1 - run2);
  } else {
    seg(xL, 0, xL, cZ1); seg(xL, cZ1, xR + run2, cZ1);
    seg(xR, 0, xR, cZ0); seg(xR, cZ0, xR + run2, cZ0);
  }

  const bounds = footprint.reduce((a, p) => ({
    minX: Math.min(a.minX, p.x), maxX: Math.max(a.maxX, p.x),
    minZ: Math.min(a.minZ, p.z), maxZ: Math.max(a.maxZ, p.z),
  }), { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 });

  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const toWorld = (lx, lz) => {
    const X = mirror * num(lx, 0), Z = num(lz, 0);
    return { x: sx + X * cosA - Z * sinA, z: sz + X * sinA + Z * cosA };
  };
  const toLocal = (wx, wz) => {
    const dx = num(wx, 0) - sx, dz = num(wz, 0) - sz;
    return { x: mirror * (dx * cosA + dz * sinA), z: -dx * sinA + dz * cosA };
  };

  const heightAt = (lx, lz) => {
    if (!Number.isFinite(lx) || !Number.isFinite(lz)) return null;
    const e = 1e-6;
    if (lx >= xL - e && lx <= xR + e && lz >= -.02 && lz < run1) {
      return (clamp(Math.floor(lz / b), 0, k - 2) + 1) * h;
    }
    if (corner && lx >= xL - e && lx <= xL + cornerW + e && lz >= cZ0 - e && lz <= cZ1 + e) {
      if (type === 'l_winder') {
        const deg = clamp(Math.atan2(lz - cZ0, -(lx - xR)) * 180 / Math.PI, 0, 89.999);
        return (k + 1 + clamp(Math.floor(deg / 30), 0, 2)) * h;
      }
      return k * h;
    }
    if (m > 1) {
      if (type === 'u_landing') {
        if (lx >= xR - e && lx <= xR + W + e && lz >= run1 - run2 - e && lz <= run1 + e) {
          return (f2Base + 1 + clamp(Math.floor((run1 - lz) / b), 0, m - 2)) * h;
        }
      } else if (lx >= xR - e && lx <= xR + run2 + e && lz >= cZ0 - e && lz <= cZ1 + e) {
        return (f2Base + 1 + clamp(Math.floor((lx - xR) / b), 0, m - 2)) * h;
      }
    }
    return null;
  };

  const guards = [];
  for (let i = 0; i < hole.length; i++) {
    if (i === exitEdge) continue;
    const a = hole[i], c = hole[(i + 1) % hole.length];
    if (Math.hypot(c.x - a.x, c.z - a.z) < .12) continue;
    guards.push({ x1: a.x, z1: a.z, x2: c.x, z2: c.z });
  }

  const treads1 = Math.max(1, k - 1);
  const treads2 = m > 1 ? Math.max(1, m - 1) : 0;
  const treadsTotal = treads1 + wind + treads2;

  return {
    design: d, type, mirror, angle, W, n, h, b, blondel, k, m, wind,
    treads1, treads2, run1, run2, corner, cornerW, cZ0, cZ1, f2Base, xL, xR, H, z0,
    footprint, hole, exitEdge, rails, guards, bounds, heightAt, toWorld, toLocal,
    info: {
      rises: n, riserMM: Math.round(h * 1000), treadMM: Math.round(b * 1000),
      blondelMM: Math.round(blondel * 1000), pitchDeg: Math.round(Math.atan2(h, b) * 180 / Math.PI),
      treads: treadsTotal, headroom,
    },
    metrics: {
      treads: treadsTotal, rises: n,
      railLength: rails.reduce((s, r) => s + Math.hypot(r.x2 - r.x1, r.z2 - r.z1), 0),
      woodVolume: treadsTotal * W * .04 * (b + .03) + n * W * .02 * h
        + 2 * (run1 + run2) * .05 * .3 + (corner ? cornerW * W * .04 : 0),
    },
  };
}

export function stairWorldPoly(params, stair) {
  const L = computeStair(params, stair);
  return L.footprint.map(p => L.toWorld(p.x, p.z));
}

export function stairFitsHouse(params, stair) {
  const bw = clamp(params.beamWidth, 100, 200) / 1000;
  const hx = num(params.width, 8) / 2 - bw / 2 - .04;
  const hz = num(params.length, 6) / 2 - bw / 2 - .04;
  const poly = stairWorldPoly(params, stair);
  return poly.length > 2 && poly.every(p =>
    Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= hx && Math.abs(p.z) <= hz);
}

export function pointInPoly(p, poly) {
  if (!p || !poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const dz = b.z - a.z;
    if (Math.abs(dz) < 1e-9) continue;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / dz + a.x) inside = !inside;
  }
  return inside;
}
function segHit(a, b, c, d) {
  const s = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = s(c, d, a), d2 = s(c, d, b), d3 = s(a, b, c), d4 = s(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
export function polysOverlap(A, B) {
  if (!A || !B || A.length < 3 || B.length < 3) return false;
  if (A.some(p => pointInPoly(p, B)) || B.some(p => pointInPoly(p, A))) return true;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      if (segHit(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
  }
  return false;
}
export function stairOverlapsAny(params, cand) {
  const A = stairWorldPoly(params, cand);
  return (params.stairs || []).some(s => s !== cand && s.floor === cand.floor && polysOverlap(A, stairWorldPoly(params, s)));
}