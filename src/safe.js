import * as THREE from 'three';

/* Единый фильтр чисел: '1 80', '0,25', undefined, NaN → конечное значение по умолчанию */
export function num(v, d = 0) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  const n = parseFloat(String(v ?? '').replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : d;
}
export function clamp(v, a, b) {
  const n = num(v, a);
  return Math.max(a, Math.min(b, n));
}
export function int(v, a, b) {
  return Math.round(clamp(v, a, b));
}

const ENUM = {
  material: ['brus', 'brevno'],
  roofType: ['gable', 'hip'],
  buildingType: ['house', 'bath', 'garage', 'roof'],
  foundation: ['pile_grillage', 'strip', 'pile'],
  entrance: ['none', 'porch', 'veranda_open', 'veranda_glazed'],
  windows: ['none', 'small', 'standard', 'panoramic', 'custom'],
  terrace: ['none', 'open', 'glazed'],
  balcony: ['no', 'yes'],
  mansard: ['no', 'yes'],
  finish: ['rough', 'preFinish', 'turnkey'],
  soilType: ['clay', 'sand', 'peat', 'unknown'],
  verandaStyle: ['classic', 'modern', 'chalet', 'glass'],
};
const BEAMS = [100, 120, 150, 180, 200];

/* Вызывается один раз на входе в buildHouse — дальше по коду NaN не попадает никогда */
export function sanitizeHouseParams(p) {
  p.width = clamp(p.width, 4, 15) || 8;
  p.length = clamp(p.length, 4, 15) || 6;
  p.wallHeight = clamp(p.wallHeight, 2.4, 4) || 2.7;
  p.floors = int(p.floors, 1, 3) || 1;
  p.roofHeight = clamp(p.roofHeight, .8, 5) || 2.2;
  p.overhangFront = clamp(p.overhangFront, .3, 4);
  p.overhangBack = clamp(p.overhangBack, .3, 4);
  p.overhangSides = clamp(p.overhangSides, .3, 4);
  p.currentFloor = int(p.currentFloor, 1, p.floors) || 1;
  p.stairAngle = num(p.stairAngle, 0);

  const beam = num(p.beamWidth, 150);
  p.beamWidth = String(BEAMS.includes(beam) ? beam : 150);

  for (const k of Object.keys(ENUM)) {
    if (!ENUM[k].includes(String(p[k]))) {
      p[k] = k === 'windows' ? 'standard' : ENUM[k][0];
    }
  }
  if (p.buildingType === 'bath' || p.buildingType === 'garage') p.floors = 1;
  if (p.floors < 2) { p.mansard = 'no'; p.balcony = 'no'; }

  const arr = v => (Array.isArray(v) ? v : []);
  const okOpening = (o, defW, defH) => {
    o.width = clamp(o.width, .3, 6) || defW;
    o.height = clamp(o.height, .3, 3) || defH;
    o.sillHeight = clamp(o.sillHeight, 0, 2);
    return o;
  };

  p.interiorWalls = arr(p.interiorWalls).filter(w =>
    w && [w.x1, w.z1, w.x2, w.z2].every(v => Number.isFinite(num(v, NaN)))
  ).map(w => ({
    ...w,
    x1: num(w.x1), z1: num(w.z1), x2: num(w.x2), z2: num(w.z2),
    floor: int(w.floor, 1, p.floors),
    openings: arr(w.openings)
      .filter(o => o && Number.isFinite(num(o.offset, NaN)))
      .map(o => okOpening({ ...o, offset: clamp(o.offset, 0, 40) }, .9, 2.05)),
  }));

  p.exteriorOpenings = arr(p.exteriorOpenings).filter(o =>
    o && ['front', 'back', 'left', 'right'].includes(o.wall) && Number.isFinite(num(o.x, NaN))
  ).map(o => okOpening({ ...o, x: num(o.x), floor: int(o.floor, 1, p.floors) }, .9, 2.05));

  p.deletedExteriorWalls = arr(p.deletedExteriorWalls).filter(d =>
    d && ['front', 'back', 'left', 'right'].includes(d.wall) && Number.isFinite(num(d.x, NaN))
  ).map(d => ({ ...d, x: num(d.x), width: clamp(d.width, .3, 15) || 2, floor: int(d.floor, 1, p.floors) }));

  p.stairs = arr(p.stairs).filter(s =>
    s && Number.isFinite(num(s.x, NaN)) && Number.isFinite(num(s.z, NaN))
  ).map(s => ({ ...s, x: num(s.x), z: num(s.z), angle: num(s.angle, 0), floor: int(s.floor, 1, p.floors) }));

  p.columns = arr(p.columns).filter(c =>
    c && Number.isFinite(num(c.x, NaN)) && Number.isFinite(num(c.z, NaN))
  ).map(c => ({ ...c, x: num(c.x), z: num(c.z), floor: int(c.floor, 1, p.floors) }));

  p.customLights = arr(p.customLights).filter(l =>
    l && Number.isFinite(num(l.x, NaN)) && Number.isFinite(num(l.z, NaN))
  ).map(l => ({ ...l, x: num(l.x), z: num(l.z), floor: int(l.floor, 1, p.floors), intensity: clamp(l.intensity, 1, 12) || 5 }));

  return p;
}

/* ---------- Полигоны ---------- */
export function cleanPoly(pts, eps = 1e-4) {
  const out = [];
  for (const p of pts || []) {
    const x = num(p.x, NaN), y = num(p.y !== undefined ? p.y : p.z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > eps) out.push({ x, y });
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= eps) out.pop(); else break;
  }
  return out;
}

export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function crosses(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
export function isSimple(pts) {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (crosses(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

/* ---------- Геометрия: ни один NaN не доходит до рендера ---------- */
export function guardGeometry(geo) {
  if (!geo) return null;
  const pos = geo.attributes && geo.attributes.position;
  if (!pos || pos.count === 0) { geo.dispose(); return null; }
  const a = pos.array;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) { geo.dispose(); return null; }
  }
  const nrm = geo.attributes.normal;
  if (nrm) {
    const b = nrm.array;
    for (let i = 0; i < b.length; i++) {
      if (!Number.isFinite(b[i])) { geo.computeVertexNormals(); break; }
    }
  }
  geo.computeBoundingSphere();
  if (!geo.boundingSphere || !Number.isFinite(geo.boundingSphere.radius)) { geo.dispose(); return null; }
  return geo;
}

export function safeBox(w, h, d) {
  const W = num(w, NaN), H = num(h, NaN), D = num(d, NaN);
  if (![W, H, D].every(Number.isFinite)) return null;
  if (W <= 1e-5 || H <= 1e-5 || D <= 1e-5) return null;
  return guardGeometry(new THREE.BoxGeometry(Math.min(W, 200), Math.min(H, 200), Math.min(D, 200)));
}

export function safeCylinder(rt, rb, h, seg = 12) {
  const R1 = num(rt, NaN), R2 = num(rb, NaN), H = num(h, NaN);
  if (![R1, R2, H].every(Number.isFinite) || H <= 1e-5 || (R1 <= 0 && R2 <= 0)) return null;
  return guardGeometry(new THREE.CylinderGeometry(Math.max(0, R1), Math.max(0, R2), H, Math.max(3, int(seg, 3, 64))));
}

export function safeSphere(r, w = 10, h = 8) {
  const R = num(r, NaN);
  if (!Number.isFinite(R) || R <= 1e-5) return null;
  return guardGeometry(new THREE.SphereGeometry(R, Math.max(4, int(w, 4, 32)), Math.max(3, int(h, 3, 24))));
}

/* Extrude из плоского полигона: чистим, проверяем площадь и самопересечения */
export function safeExtrude(points, depth, opts = {}) {
  const poly = cleanPoly(points);
  if (poly.length < 3) return null;
  if (Math.abs(polyArea(poly)) < 1e-5) return null;
  if (!isSimple(poly)) return null;
  const d = num(depth, 0);
  if (d <= 1e-5) return null;
  const shape = new THREE.Shape();
  poly.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
  shape.closePath();
  let geo = null;
  try {
    geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, ...opts });
  } catch { return null; }
  return guardGeometry(geo);
}

export function safeMatrix(x, y, z, rx = 0, ry = 0, rz = 0) {
  const v = [x, y, z, rx, ry, rz].map(n => num(n, NaN));
  if (!v.every(Number.isFinite)) return null;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(v[3], v[4], v[5]));
  return new THREE.Matrix4().compose(new THREE.Vector3(v[0], v[1], v[2]), q, new THREE.Vector3(1, 1, 1));
}