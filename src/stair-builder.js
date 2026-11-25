import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeStair } from './stairs.js';
import { num, safeBox, safeSphere, safeExtrude, safeMatrix, guardGeometry, cleanPoly, polyArea, isSimple } from './safe.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TREAD_T = .04, NOSING = .03, STRING_T = .05, RAIL_H = .9;

/* Светлая нейтральная текстура — тон задаёт material.color, иначе дерево уходит в чёрный */
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f2e8d8'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    x.strokeStyle = Math.random() > .5 ? 'rgba(126,84,42,.17)' : 'rgba(255,248,232,.42)';
    x.lineWidth = Math.random() * 2.4 + .5;
    let y = Math.random() * 256;
    x.beginPath(); x.moveTo(0, y);
    for (let px = 0; px <= 256; px += 16) { y += (Math.random() - .5) * 5; x.lineTo(px, y); }
    x.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const kx = Math.random() * 256, ky = Math.random() * 256;
    x.strokeStyle = 'rgba(120,78,38,.20)';
    for (let r = 3; r < 12; r += 3) { x.beginPath(); x.ellipse(kx, ky, r, r * .6, 0, 0, Math.PI * 2); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function materials(d, preview) {
  if (preview) {
    const g = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: .45, depthWrite: false });
    return { tread: g, body: g, rail: g, metal: g, preview: true };
  }
  const tex = woodTexture();
  return {
    tread: new THREE.MeshStandardMaterial({ color: '#b57a41', map: tex, roughness: .55 }),
    body:  new THREE.MeshStandardMaterial({ color: '#cb9a63', map: tex, roughness: .8 }),
    rail:  d.rail === 'white'
      ? new THREE.MeshStandardMaterial({ color: '#f6f1e6', roughness: .45 })
      : new THREE.MeshStandardMaterial({ color: '#a97038', map: tex, roughness: .5 }),
    metal: new THREE.MeshStandardMaterial({ color: '#343b41', roughness: .32, metalness: .85 }),
    preview: false,
  };
}

class Bin {
  constructor() { this.m = new Map(); }
  add(key, geo, matrix) {
    if (!geo) return;
    if (matrix) geo.applyMatrix4(matrix);
    let g = geo;
    if (g.index) { g = geo.toNonIndexed(); geo.dispose(); }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!guardGeometry(g)) return;
    if (!this.m.has(key)) this.m.set(key, []);
    this.m.get(key).push(g);
  }
  flush(group, M, userData) {
    this.m.forEach((list, key) => {
      const mat = M[key] || M.body;
      let merged = null;
      if (list.length === 1) merged = list[0];
      else {
        try { merged = mergeGeometries(list, false); } catch { merged = null; }
        if (merged) list.forEach(g => g.dispose());
      }
      const emit = g => {
        if (!guardGeometry(g)) return;
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = !M.preview;
        mesh.receiveShadow = !M.preview;
        Object.assign(mesh.userData, userData);
        group.add(mesh);
      };
      if (merged) emit(merged); else list.forEach(emit);
    });
    this.m.clear();
  }
}

function xf(px, py, pz, ry = 0) {
  const m = safeMatrix(px, py, pz);
  if (!m) return null;
  if (Number.isFinite(ry) && ry !== 0) m.multiply(new THREE.Matrix4().makeRotationY(ry));
  return m;
}
const local = (x, y, z, rx = 0, ry = 0, rz = 0) => safeMatrix(x, y, z, rx, ry, rz);

function barMatrix(a, b) {
  const dx = num(b.x, NaN) - num(a.x, NaN);
  const dy = num(b.y, NaN) - num(a.y, NaN);
  const dz = num(b.z, NaN) - num(a.z, NaN);
  if (![dx, dy, dz].every(Number.isFinite)) return null;
  const horiz = Math.hypot(dx, dz);
  const len = Math.hypot(horiz, dy);
  if (len < .02) return null;
  const qy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(dx, dz));
  const qx = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.atan2(dy, horiz));
  const q = new THREE.Quaternion().multiplyQuaternions(qy, qx);
  return {
    m: new THREE.Matrix4().compose(V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), q, V(1, 1, 1)),
    len,
  };
}

/* Профильный поручень: несущая рейка + скруглённый верх */
function handrail(bin, key, a, b) {
  const bar = barMatrix(a, b);
  if (!bar) return;
  bin.add(key, safeBox(.062, .05, bar.len), bar.m);
  const up = new THREE.Matrix4().makeTranslation(0, .038, 0);
  bin.add(key, safeBox(.075, .028, bar.len), bar.m.clone().multiply(up));
}

function buildFlight(bin, L, treads, place, railKey, balKey) {
  if (!place || !Number.isFinite(treads) || treads < 1) return;
  const { b, h, W, design } = L;
  const closed = design.stringer === 'tetiva';
  const run = treads * b, rise = treads * h;
  const theta = Math.atan2(h, b);
  const innerW = Math.max(.2, W - 2 * STRING_T);
  const treadW = closed ? innerW : W + .04;
  const put = (key, geo, m) => { if (geo && m) bin.add(key, geo, place.clone().multiply(m)); };

  for (let i = 0; i < treads; i++) {
    const top = (i + 1) * h;
    put('tread', safeBox(treadW, TREAD_T, b + NOSING), local(0, top - TREAD_T / 2, i * b + (b - NOSING) / 2));
    // скруглённый носик проступи
    put('tread', safeBox(treadW, .022, .022), local(0, top - TREAD_T + .011, i * b - NOSING + .011));
    if (design.risers === 'yes') {
      put('body', safeBox(closed ? innerW : W, h - TREAD_T, .022),
        local(0, i * h + (h - TREAD_T) / 2, i * b + .011));
    }
  }

  const dv = .30 / Math.cos(theta);
  let pts = [];
  if (closed) {
    const topAt = z => (z / b + 1) * h - TREAD_T + .03;
    const zA = -.06, zB = run + .06, dv2 = .32 / Math.cos(theta);
    pts = [{ x: zA, y: topAt(zA) }, { x: zB, y: topAt(zB) }, { x: zB, y: topAt(zB) - dv2 }, { x: zA, y: topAt(zA) - dv2 }];
  } else {
    pts.push({ x: 0, y: 0 });
    for (let i = 0; i < treads; i++) {
      pts.push({ x: i * b, y: (i + 1) * h - TREAD_T });
      pts.push({ x: (i + 1) * b, y: (i + 1) * h - TREAD_T });
    }
    pts.push({ x: run, y: rise - dv }, { x: 0, y: -dv });
  }
  const profile = cleanPoly(pts);
  if (profile.length >= 3 && Math.abs(polyArea(profile)) > 1e-5 && isSimple(profile)) {
    const sgeo = safeExtrude(profile, STRING_T);
    if (sgeo) {
      sgeo.rotateY(-Math.PI / 2);
      const inset = closed ? 0 : .06;
      [-1, 1].forEach(side => {
        const px = side > 0 ? (W / 2 - inset) : (-W / 2 + inset + STRING_T);
        put('body', sgeo.clone(), local(px, 0, 0));
      });
      sgeo.dispose();
    }
  }

  const pitch = z => (z / b + 1) * h;
  const zA = -.30, zB = run + .15;
  [-1, 1].forEach(side => {
    const rx = side * (W / 2 - .045);
    handrail(bin, railKey,
      { x: rx, y: pitch(zA) + RAIL_H, z: zA },
      { x: rx, y: pitch(zB) + RAIL_H, z: zB });
    if (design.rail === 'forge') {
      const b2 = barMatrix({ x: rx, y: pitch(zA) + RAIL_H * .45, z: zA }, { x: rx, y: pitch(zB) + RAIL_H * .45, z: zB });
      if (b2) put('metal', safeBox(.032, .04, b2.len), b2.m);
    }
    const cnt = Math.max(2, Math.round(run / .12));
    for (let i = 0; i <= cnt; i++) {
      const z = (run * i) / cnt;
      const baseY = (Math.floor(z / b + 1e-6) + 1) * h;
      const hgt = pitch(z) + RAIL_H - .05 - baseY;
      if (!Number.isFinite(hgt) || hgt < .12) continue;
      const w = design.rail === 'forge' ? .02 : .028;
      put(balKey, safeBox(w, hgt, w), local(rx, baseY + hgt / 2, z));
      if (design.rail === 'forge') {
        put('metal', safeBox(.042, .022, .042), local(rx, baseY + hgt * .5, z));
      }
    }
    [[-.06, 0], [run + .06, (treads + 1) * h]].forEach(([pz, by]) => {
      const ph = RAIL_H + .14;
      put(railKey, safeBox(.085, ph, .085), local(rx, by + ph / 2, pz));
      put(railKey, safeBox(.125, .032, .125), local(rx, by + ph + .016, pz));
      put(design.rail === 'forge' ? 'metal' : railKey, safeSphere(.044, 12, 9), local(rx, by + ph + .058, pz));
      put(railKey, safeBox(.115, .05, .115), local(rx, by + .025, pz));
    });
  });
}

function railPath(bin, railKey, balKey, pts, surfFn, railH, design) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const sa = num(surfFn(a), NaN), sc = num(surfFn(c), NaN);
    if (!Number.isFinite(sa) || !Number.isFinite(sc)) continue;
    handrail(bin, railKey, { x: a.x, y: sa + railH, z: a.z }, { x: c.x, y: sc + railH, z: c.z });
    const bar = barMatrix({ x: a.x, y: sa, z: a.z }, { x: c.x, y: sc, z: c.z });
    if (!bar) continue;
    const n = Math.max(1, Math.round(bar.len / .12));
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const p = { x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t };
      const by = num(surfFn(p), NaN);
      if (!Number.isFinite(by)) continue;
      const hgt = railH - .05;
      const w = design.rail === 'forge' ? .02 : .028;
      bin.add(balKey, safeBox(w, hgt, w), local(p.x, by + hgt / 2, p.z));
    }
  }
}

function buildLanding(bin, L, y) {
  const x0 = L.xL, x1 = L.xL + L.cornerW, z0 = L.cZ0, z1 = L.cZ1;
  const w = x1 - x0, dd = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // настил площадки досками
  const rows = Math.max(2, Math.floor(dd / .145));
  for (let i = 0; i < rows; i++) {
    const pz = z0 + (dd / rows) * (i + .5);
    bin.add('tread', safeBox(w - .02, TREAD_T, dd / rows - .012), local(cx, y - TREAD_T / 2, pz));
  }
  bin.add('body', safeBox(w, .16, .07), local(cx, y - .12, z0 + .04));
  bin.add('body', safeBox(w, .16, .07), local(cx, y - .12, z1 - .04));
  bin.add('body', safeBox(.07, .16, dd), local(x0 + .04, y - .12, cz));
  bin.add('body', safeBox(.07, .16, dd), local(x1 - .04, y - .12, cz));
  const nj = Math.max(2, Math.round(w / .45));
  for (let i = 1; i < nj; i++) bin.add('body', safeBox(.055, .14, dd - .1), local(x0 + w * i / nj, y - .12, cz));
  if (y > .25) {
    [[x0 + .09, z0 + .09], [x1 - .09, z0 + .09], [x0 + .09, z1 - .09], [x1 - .09, z1 - .09]].forEach(([px, pz]) => {
      bin.add('body', safeBox(.1, y - .2, .1), local(px, (y - .2) / 2, pz));
      bin.add('body', safeBox(.14, .05, .14), local(px, .025, pz));
    });
  }
}

function buildWinders(bin, L) {
  const { W, h, k, cZ0, cZ1, xL, xR, design } = L;
  const P = { x: xR, z: cZ0 };
  const rIn = .20;
  const dirs = [0, 30, 60, 90].map(deg => {
    const a = deg * Math.PI / 180;
    return { x: -Math.cos(a), z: Math.sin(a) };
  });
  const hit = dir => {
    const tx = dir.x < -1e-6 ? (xL - P.x) / dir.x : Infinity;
    const tz = dir.z > 1e-6 ? (cZ1 - P.z) / dir.z : Infinity;
    const t = Math.min(tx, tz);
    if (!Number.isFinite(t)) return null;
    return { x: P.x + dir.x * t, z: P.z + dir.z * t, edge: tx < tz ? 0 : 1 };
  };
  const hits = dirs.map(hit);
  if (hits.some(v => !v)) return;
  const inner = dirs.map(d => ({ x: P.x + d.x * rIn, z: P.z + d.z * rIn }));

  for (let j = 0; j < 3; j++) {
    const poly = [inner[j], hits[j]];
    if (hits[j].edge !== hits[j + 1].edge) poly.push({ x: xL, z: cZ1 });
    poly.push(hits[j + 1], inner[j + 1]);
    const top = (k + 1 + j) * h;
    const g = safeExtrude(poly.map(p => ({ x: p.x, y: p.z })), TREAD_T);
    if (g) { g.rotateX(Math.PI / 2); bin.add('tread', g, local(0, top, 0)); }
    if (design.risers === 'yes') {
      const a = inner[j], c = hits[j];
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      if (len > .03) {
        bin.add('body', safeBox(.022, h - TREAD_T, len),
          safeMatrix((a.x + c.x) / 2, (k + j) * h + (h - TREAD_T) / 2, (a.z + c.z) / 2,
            0, Math.atan2(c.x - a.x, c.z - a.z), 0));
      }
    }
  }

  const outer = [hits[0], { x: xL, z: cZ1 }, hits[3]];
  const path = [];
  for (let i = 0; i < outer.length - 1; i++) {
    const a = outer[i], c = outer[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(c.x - a.x, c.z - a.z) / .12));
    for (let j = 0; j < n; j++) path.push({ x: a.x + (c.x - a.x) * j / n, z: a.z + (c.z - a.z) * j / n });
  }
  path.push(outer[outer.length - 1]);
  const surf = p => {
    const deg = Math.max(0, Math.min(89.999, Math.atan2(p.z - cZ0, -(p.x - xR)) * 180 / Math.PI));
    return (k + 1 + Math.min(2, Math.floor(deg / 30))) * h;
  };
  const inset = path.map(p => ({
    x: p.x + (Math.abs(p.x - xL) < 1e-6 ? .045 : 0),
    z: p.z - (Math.abs(p.z - cZ1) < 1e-6 ? .045 : 0),
  }));
  railPath(bin, 'rail', design.rail === 'forge' ? 'metal' : 'rail', inset, surf, RAIL_H, design);
}

export function buildStairGroup(params, stair, isPreview = false, opts = {}) {
  const group = new THREE.Group();
  try {
    const L = computeStair(params, stair);
    const d = L.design;
    const M = materials(d, isPreview);
    const bin = new Bin();
    const balKey = d.rail === 'forge' ? 'metal' : 'rail';
    const userData = { isStair: true, stairRef: stair };

    buildFlight(bin, L, L.treads1, xf(0, 0, 0), 'rail', balKey);

    if (L.corner) {
      if (L.type === 'l_winder') buildWinders(bin, L);
      else {
        const y = L.k * L.h;
        buildLanding(bin, L, y);
        const x1 = L.xL + L.cornerW;
        const edges = [
          [{ x: L.xL + .045, z: L.cZ0 }, { x: L.xL + .045, z: L.cZ1 - .045 }],
          [{ x: L.xL + .045, z: L.cZ1 - .045 }, { x: x1 - .045, z: L.cZ1 - .045 }],
        ];
        if (L.type === 'u_landing') edges.push([{ x: x1 - .045, z: L.cZ1 - .045 }, { x: x1 - .045, z: L.cZ0 }]);
        edges.forEach(([a, c]) => railPath(bin, 'rail', balKey, [a, c], () => y, 1.0, d));
      }
    }

    if (L.treads2 > 0) {
      // +PI/2 разворачивает марш вдоль +X (Г-образная), PI — вдоль -Z (П-образная)
      const place = L.type === 'u_landing'
        ? xf(L.xR + L.W / 2, L.f2Base * L.h, L.run1, Math.PI)
        : xf(L.xR, L.f2Base * L.h, L.cZ0 + L.W / 2, Math.PI / 2);
      buildFlight(bin, L, L.treads2, place, 'rail', balKey);
    }

    if (!isPreview && opts.guards !== false) {
      for (let i = 0; i < L.hole.length; i++) {
        if (i === L.exitEdge) continue;
        const a = L.hole[i], c = L.hole[(i + 1) % L.hole.length];
        if (Math.hypot(c.x - a.x, c.z - a.z) < .18) continue;
        railPath(bin, 'rail', balKey, [a, c], () => L.H, 1.0, d);
      }
    }

    bin.flush(group, M, userData);
    group.position.set(num(stair.x, 0), 0.6 + (num(stair.floor, 1) - 1) * num(params.wallHeight, 2.7), num(stair.z, 0));
    group.rotation.y = -L.angle;
    group.scale.x = L.mirror;
    group.userData = { ...userData, layout: L };
  } catch (e) {
    console.warn('Лестница пропущена (некорректные параметры)', e);
  }
  return group;
}