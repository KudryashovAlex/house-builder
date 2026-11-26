import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ══════════════════════════════════════════════════════════════
   РЕАЛЬНЫЕ УЗЛЫ КРЕПЛЕНИЯ ДЕРЕВЯННОЙ КРОВЛИ
   1. Скользящая опора стропил — полка на стропиле наглухо,
      полка на мауэрлате с вертикальным пазом 13×58 мм.
   2. Накладной ригель — болты насквозь, шайба + гайка.
   3. Подкос — уголок в пятке, накладка в голове.
   4. Оголовок и опорная плита стойки.
   5. Полунога — скошенный уголок в накосное.
   6. Шпилька М12 мауэрлата в венец.
   7. Кронштейн снегозадержателя сквозь покрытие в обрешётку.
   8. Саморезы конька и хребтов по флангам.
   9. Прогоны, подкладки, стойки, шпренгели, накладки стыков.

   ВАЖНО: ядро отдаёт векторы собственного класса Vec3. На границе
   рендера они принудительно приводятся к THREE.Vector3 — иначе
   методы вроде negate() отсутствуют и сборка обрывается.
   ══════════════════════════════════════════════════════════════ */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const PT = 0.004, SCREW_R = 0.005, HOLE_R = 0.0055;

/* Приведение любого вектора ядра/сцены к THREE.Vector3 */
function T3(v) {
  if (!v) return new THREE.Vector3();
  if (v.isVector3) return v.clone();
  return new THREE.Vector3(
    Number.isFinite(v.x) ? v.x : 0,
    Number.isFinite(v.y) ? v.y : 0,
    Number.isFinite(v.z) ? v.z : 0
  );
}

function mergeSafe(list) {
  try { const g = mergeGeometries(list, false); list.forEach(x => x.dispose()); return g || null; }
  catch { list.forEach(x => x.dispose()); return null; }
}
function hexHead(wR, hR, hH, wH) {
  const w = new THREE.CylinderGeometry(wR, wR, wH, 18); w.translate(0, wH / 2, 0);
  const h = new THREE.CylinderGeometry(hR, hR, hH, 6); h.translate(0, wH + hH / 2, 0);
  const g = mergeSafe([w, h]);
  if (g) return g;
  const f = new THREE.CylinderGeometry(hR, hR, hH + wH, 6);
  f.translate(0, (hH + wH) / 2, 0);
  return f;
}
function qTo(dir) {
  const d = T3(dir);
  if (d.lengthSq() < 1e-12) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
}
function mtx(pos, dir, scale) {
  return new THREE.Matrix4().compose(T3(pos), qTo(dir), scale ? T3(scale) : V(1, 1, 1));
}
function basisMtx(center, U, Vv, N, offset) {
  const n = T3(N).normalize();
  const m = new THREE.Matrix4().makeBasis(T3(U).normalize(), T3(Vv).normalize(), n);
  m.setPosition(T3(center).addScaledVector(n, offset || 0));
  return m;
}
function box(w, h, d, mm_, x = 0, y = 0, z = 0) {
  if (![w, h, d, x, y, z].every(Number.isFinite) || w <= 1e-4 || h <= 1e-4 || d <= 1e-4) return null;
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mm_);
  me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; return me;
}
function meshOf(g, mm_) { if (!g || !mm_) return null; const me = new THREE.Mesh(g, mm_); me.castShadow = true; me.receiveShadow = true; return me; }
function beamBetween(a, b, w, h, mm_) {
  const A = T3(a), B = T3(b);
  const d = B.clone().sub(A); const len = d.length();
  if (!Number.isFinite(len) || len < .05) return null;
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mm_);
  me.position.copy(A).add(B).multiplyScalar(.5);
  me.quaternion.setFromUnitVectors(V(0, 0, 1), d.normalize());
  me.castShadow = true; me.receiveShadow = true; return me;
}

class Batch {
  constructor() { this.shaft = []; this.sHead = []; this.bHead = []; this.nut = []; }
  screw(surface, outward, depth) {
    const s = T3(surface), n = T3(outward);
    if (n.lengthSq() < 1e-12 || !Number.isFinite(depth) || depth < .008) return;
    n.normalize();
    this.sHead.push(mtx(s, n));
    this.shaft.push(mtx(s.clone().addScaledVector(n, -depth / 2), n, V(SCREW_R, depth, SCREW_R)));
  }
  bolt(faceA, faceB, r) {
    const a = T3(faceA), b = T3(faceB);
    const ax = b.clone().sub(a); const len = ax.length();
    if (!Number.isFinite(len) || len < .01 || !Number.isFinite(r) || r <= 0) return;
    ax.normalize();
    this.bHead.push(mtx(a, ax.clone().negate()));
    this.nut.push(mtx(b, ax));
    const p = a.clone().addScaledVector(ax, -.013), q = b.clone().addScaledVector(ax, .016);
    this.shaft.push(mtx(p.clone().add(q).multiplyScalar(.5), ax, V(r, p.distanceTo(q), r)));
  }
  flush(group, gs, mats) {
    const add = (arr, geo, mat) => {
      if (!arr.length || !geo) return;
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      arr.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      group.add(im);
    };
    add(this.shaft, gs.shaft, mats.zinc);
    add(this.sHead, gs.sHead, mats.zinc);
    add(this.bHead, gs.bHead, mats.zinc);
    add(this.nut, gs.nut, mats.zinc);
  }
}

function plateGeo(w, h, t, holes, slot) {
  if (!(w > .005 && h > .005 && t > .0005)) return null;
  const r = Math.min(.008, w / 4, h / 4);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  (holes || []).forEach(([hx, hy, hr]) => {
    const q = new THREE.Path(); q.absarc(hx, hy, hr || HOLE_R, 0, Math.PI * 2, true); s.holes.push(q);
  });
  if (slot) {
    const [sw, sh, sy] = slot, rr = sw / 2;
    const q = new THREE.Path();
    q.absarc(0, sy + sh / 2 - rr, rr, 0, Math.PI, false);
    q.absarc(0, sy - sh / 2 + rr, rr, Math.PI, Math.PI * 2, false);
    q.closePath(); s.holes.push(q);
  }
  let g; try { g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 8 }); } catch { return null; }
  g.translate(0, 0, -t / 2);
  const pos = g.attributes.position.array;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) { g.dispose(); return null; }
  g.computeVertexNormals();
  return g;
}
function putPlate(group, mat, geo, surface, U, Vv, N, thick) {
  if (!geo) return null;
  const me = new THREE.Mesh(geo, mat);
  me.applyMatrix4(basisMtx(surface, U, Vv, N, (thick || PT) / 2));
  me.castShadow = true; me.receiveShadow = true; group.add(me);
  return me;
}
function holeGrid(c, r, dx, dy) {
  const out = [];
  for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) out.push([(i - (c - 1) / 2) * dx, (j - (r - 1) / 2) * dy, HOLE_R]);
  return out;
}
function cornerAngle(group, mats, b, C0, nA0, nB0, dA0, dB0, lA, lB, hgt, yC, depth) {
  const C = T3(C0), nA = T3(nA0).normalize(), nB = T3(nB0).normalize();
  const dA = T3(dA0).normalize(), dB = T3(dB0).normalize();
  const cA = C.clone().addScaledVector(dA, lA / 2); cA.y = yC;
  const cB = C.clone().addScaledVector(dB, lB / 2); cB.y = yC;
  putPlate(group, mats.steel, plateGeo(lA, hgt, PT, holeGrid(2, 2, lA * .45, hgt * .42)), cA, dA, UP, nA);
  putPlate(group, mats.steel, plateGeo(lB, hgt, PT, holeGrid(2, 2, lB * .45, hgt * .42)), cB, dB, UP, nB);
  [.32, .72].forEach(t => [-1, 1].forEach(sy => {
    const pa = C.clone().addScaledVector(dA, lA * t); pa.y = yC + sy * hgt * .21;
    b.screw(pa.addScaledVector(nA, PT), nA, depth);
    const pb = C.clone().addScaledVector(dB, lB * t); pb.y = yC + sy * hgt * .21;
    b.screw(pb.addScaledVector(nB, PT), nB, depth);
  }));
}
function wallOf(m, f) {
  const isEnd = f.kind === 'tri';
  return { axisN: isEnd ? V(0, 0, 1) : V(1, 0, 0), half: isEnd ? m.length / 2 : m.span / 2 };
}
function L2W(f, X, Y, Z) {
  return T3(f.pos).addScaledVector(T3(f.basis.X), X).addScaledVector(T3(f.basis.Y), Y).addScaledVector(T3(f.basis.Z), Z);
}
function frameLocal(f) {
  const o = new THREE.Group();
  o.position.copy(T3(f.pos));
  o.rotation.set(f.rot.x, f.rot.y, f.rot.z);
  return o;
}

export function buildHardware(m, p, S) {
  const mats = {
    steel: new THREE.MeshStandardMaterial({ color: '#cfd8de', metalness: .85, roughness: .28 }),
    zinc: new THREE.MeshStandardMaterial({ color: '#f0f5f8', metalness: .9, roughness: .2 }),
    dark: new THREE.MeshStandardMaterial({ color: '#66747d', metalness: .8, roughness: .4 }),
    wood: new THREE.MeshStandardMaterial({ color: '#c08a4a', roughness: .82 }),
    splice: new THREE.MeshStandardMaterial({ color: '#b8813a', roughness: .78 })
  };
  const gs = {
    shaft: new THREE.CylinderGeometry(1, 1, 1, 10),
    sHead: hexHead(.015, .011, .008, .003),
    bHead: hexHead(.019, .014, .009, .0035),
    nut: hexHead(.019, .014, .010, .0035)
  };
  const out = [], errors = [];
  const mk = (layer, stage) => { const g = new THREE.Group(); out.push({ layer, stage, group: g }); return { g, b: new Batch() }; };
  const safe = (name, fn) => { try { fn(); } catch (e) { errors.push(name + ': ' + (e && e.message || e)); } };

  /* 1. Шпильки М12: мауэрлат → венец */
  safe('шпильки', () => {
    const { g, b } = mk('fix', 1);
    [{ n: V(1, 0, 0), along: V(0, 0, 1), half: m.span / 2, len: m.plateLenZ },
     { n: V(0, 0, 1), along: V(1, 0, 0), half: m.length / 2, len: m.span }].forEach(r => {
      const cnt = Math.max(2, Math.round(r.len / 1.2));
      [-1, 1].forEach(sg => {
        for (let i = 0; i <= cnt; i++) {
          const top = r.n.clone().multiplyScalar(sg * r.half).addScaledVector(r.along, -r.len / 2 + r.len * i / cnt);
          top.y = .004;
          const bot = top.clone(); bot.y = -m.ph - .16;
          b.bolt(top, bot, .006);
        }
      });
    });
    b.flush(g, gs, mats);
  });

  /* 4. Оголовки и опорные плиты стоек конька */
  if (m.postZ.length) safe('оголовки', () => {
    const { g, b } = mk('fix', 4);
    const cap = plateGeo(m.sw + .04, m.sh + .04, PT, holeGrid(2, 2, m.sw * .55, m.sh * .55));
    const fl = plateGeo(m.sh + .02, .06, PT, holeGrid(2, 1, m.sh * .5, 0));
    m.postZ.forEach(z => {
      [[m.sleeperTop, m.sw, 1], [m.sleeperTop + m.postH, m.bw, -1]].forEach(([y, hug, dir]) => {
        putPlate(g, mats.steel, cap, V(0, y, z), V(1, 0, 0), V(0, 0, 1), UP.clone().multiplyScalar(dir));
        [-1, 1].forEach(sx => [-1, 1].forEach(sz =>
          b.screw(V(sx * m.sw * .275, y + dir * PT, z + sz * m.sh * .275), UP.clone().multiplyScalar(dir), .055)));
        [-1, 1].forEach(sx => {
          const n = V(sx, 0, 0);
          putPlate(g, mats.steel, fl, V(sx * (hug / 2 + PT / 2), y + dir * .03, z), V(0, 0, 1), UP, n);
          [-1, 1].forEach(sz => b.screw(V(sx * (hug / 2 + PT), y + dir * .03, z + sz * m.sh * .25), n, .045));
        });
      });
    });
    b.flush(g, gs, mats);
  });

  /* 6. Скользящие опоры стропил + болты ригеля.
     Опирание считается ПО СКАТУ: у мансарды нижний скат стоит на аттиковой
     стенке, верхний опёрт на прогон перелома и стены под собой не имеет. */
  const MSD = m.mansardOn ? m.mansard : null;
  const bearOf = f => {
    if (!MSD) return { xsi: m.Xsi, xso: m.Xso, yBot: -m.ph + .02 };
    if (f.tag === 'upper') return null;
    const xsi = (m.half - m.pw / 2 - MSD.breakX) / f.ca;
    return { xsi, xso: xsi + m.seatW / f.ca, yBot: MSD.kneeTop - m.ph + .02 };
  };
  safe('опирание', () => {
    const { g, b } = mk('fix', 6);
    const LA = .11, LB = .08, HA = .15;
    m.rafters.filter(r => !r.jack).forEach(r => {
      const f = r.f, w = wallOf(m, f), bear = bearOf(f);
      if (!bear) return;
      const notch = !MSD && m.seatMode === 'notch';
      const Xs = notch ? bear.xsi + m.seatW * f.ca / 2 : (bear.xsi + bear.xso) / 2;
      const Ys = notch ? m.seatW * f.sa / 2 : 0;
      const P0 = L2W(f, Xs, Ys, r.z);
      const wallN = w.axisN.clone().multiplyScalar(Math.sign(P0.dot(w.axisN)) || 1);
      const cN = w.half + m.pw / 2 + PT / 2;
      [-1, 1].forEach(sj => {
        const nJ = T3(f.basis.Z).multiplyScalar(sj);
        const C = wallN.clone().multiplyScalar(cN).addScaledVector(nJ, P0.dot(nJ) + m.rt / 2 + PT / 2);
        C.y = P0.y;
        const yA = P0.y + .045;
        const cA = C.clone().addScaledVector(wallN, -LA / 2); cA.y = yA;
        putPlate(g, mats.steel, plateGeo(LA, HA, PT, holeGrid(2, 2, LA * .45, HA * .40)), cA, wallN.clone().negate(), UP, nJ);
        [.30, .72].forEach(t => [-1, 1].forEach(sy => {
          const sp = C.clone().addScaledVector(wallN, -LA * t); sp.y = yA + sy * HA * .20;
          b.screw(sp.addScaledVector(nJ, PT), nJ, .042);
        }));
        const yTop = P0.y + .02, yBot = bear.yBot, HB = Math.max(.07, yTop - yBot), yB = (yTop + yBot) / 2;
        const cB = C.clone().addScaledVector(nJ, LB / 2); cB.y = yB;
        putPlate(g, mats.steel, plateGeo(LB, HB, PT, [], [.013, .058, (P0.y - .038) - yB]), cB, nJ, UP, wallN);
        const sp = C.clone().addScaledVector(nJ, LB / 2); sp.y = P0.y - .038;
        b.screw(sp.addScaledVector(wallN, PT), wallN, .055);
      });
    });
    if (m.tieMode === 'side' && S && S.boltLayout && S.boltLayout.ok) {
      const r = m.boltD / 2000;
      m.tieZ.forEach(z => {
        for (let s = 0; s < m.tieSides; s++) {
          const sg = m.tieSides === 2 ? (s ? 1 : -1) : 1;
          const gLo = sg > 0 ? z - m.rt / 2 : z - m.rt / 2 - m.tt;
          const gHi = sg > 0 ? z + m.rt / 2 + m.tt : z + m.rt / 2;
          S.boltLayout.positions.forEach(q => [-1, 1].forEach(sx => b.bolt(V(sx * q.x, q.y, gLo), V(sx * q.x, q.y, gHi), r)));
        }
      });
    } else if (m.tieMode === 'under') {
      const geo = plateGeo(.28, .13, PT, holeGrid(3, 2, .08, .052));
      const midX = (m.underEdgeLo + m.underEdgeHi) / 2, midY = m.tieY + m.th / 2;
      m.tieZ.forEach(z => [-1, 1].forEach(sx => {
        const U = V(m.ca * sx, -m.sa, 0), Vv = V(m.sa * sx, m.ca, 0), c = V(sx * midX, midY, z);
        [-1, 1].forEach(sz => {
          const N = V(0, 0, sz);
          putPlate(g, mats.steel, geo, c.clone().addScaledVector(N, m.rt / 2), U, Vv, N);
          [-1, 0, 1].forEach(du => [-1, 1].forEach(dv =>
            b.screw(c.clone().addScaledVector(U, du * .08).addScaledVector(Vv, dv * .026).addScaledVector(N, m.rt / 2 + PT), N, .042)));
        });
      }));
    }
    b.flush(g, gs, mats);
  });

  /* 7. Подкосы конька */
  if (p.braces && m.postZ.length) safe('подкосы', () => {
    const { g, b } = mk('fix', 7);
    const head = plateGeo(.20, .10, PT, holeGrid(2, 3, .082, .030));
    m.postZ.forEach(z => [-1, 1].forEach(s => {
      const F = V(s * (m.sw / 2 + .02), m.sleeperTop + .18, z), H = V(s * m.dBrace, m.braceHeadY, z);
      const ax = H.clone().sub(F); if (ax.length() < .2) return; ax.normalize();
      [-1, 1].forEach(sz => {
        cornerAngle(g, mats, b, V(s * (m.sw / 2 + PT / 2), F.y + .07, z + sz * (m.rt / 2 + PT / 2)),
          V(s, 0, 0), V(0, 0, sz), V(0, 0, sz), V(s, 0, 0), .055, .11, .12, F.y + .07, .042);
        const N = V(0, 0, sz), U = ax.clone(), Vv = V(-ax.y, ax.x, 0), c = H.clone().addScaledVector(ax, .024);
        putPlate(g, mats.steel, head, c.clone().addScaledVector(N, m.rt / 2), U, Vv, N);
        [-1, 1].forEach(sx => [-1, 0, 1].forEach(sy =>
          b.screw(c.clone().addScaledVector(U, sx * .041).addScaledVector(Vv, sy * .030).addScaledVector(N, m.rt / 2 + PT), N, .042)));
      });
    }));
    b.flush(g, gs, mats);
  });
  /* Узел перелома мансарды: верхняя и нижняя стропилы сходятся на прогоне
     перелома. Двусторонние накладки и саморезы — как в ферменном узле. */
  if (m.mansardOn && m.mansard && m.mansard.scheme === 'broken') safe('узел перелома', () => {
    const { g, b } = mk('fix', 6);
    const MS = m.mansard, pt = .010, half = m.rd / 2;
    const cH = Math.cos(MS.highA), sH = Math.sin(MS.highA), cL = Math.cos(MS.lowA), sL = Math.sin(MS.lowA);
    const node = [];
    [.10, .20].forEach(t => {
      node.push([MS.breakX - t * cH + half * sH, MS.breakY + t * sH + half * cH]);
      node.push([MS.breakX + t * cL + half * sL, MS.breakY - t * sL + half * cL]);
    });
    /* Размер накладки — по фактическому узлу с отступом 70 мм под саморезы. */
    /* Узел опёрт на прогон — он не моментный. Накладка 160×200 лежит на древесине
       обоих членов и на прогоне, а не парит по габариту узла. */
    const cx = MS.breakX, cy = MS.breakY + .10, PW = .16, PH = .20;
    const geo = plateGeo(PW, PH, pt, node.map(([x, y]) => [x - cx, y - cy, HOLE_R]));
    [-1, 1].forEach(sx => {
      (m.faceZ[0] || []).forEach(z => {
        if (Math.abs(z) > m.length / 2 + 1e-6) return;
        [-1, 1].forEach(sz => {
          const N = V(0, 0, sz);
          putPlate(g, mats.steel, geo, V(sx * cx, cy, z + sz * m.rt / 2), V(sx, 0, 0), UP, N);
          [-1, 1].forEach(du => [-1, 1].forEach(dv =>
            b.screw(V(sx * (cx + du * .045), cy + dv * .065, z + sz * (m.rt / 2 + pt)), N, .06)));
        });
      });
    });
    b.flush(g, gs, mats);
  });

  /* 8. Полуноги: скошенный уголок в накосное */
  if (m.hips.length) safe('полуноги', () => {
    const { g, b } = mk('fix', 8);
    m.rafters.filter(r => r.jack).forEach(r => {
      const f = r.f;
      const adj = m.hips.filter(h => f.adj && ((f.adj.sx && h.sx === f.adj.sx) || (f.adj.sz && h.sz === f.adj.sz)));
      if (!adj.length) return;
      const Pj = L2W(f, r.x0, m.rd * .5, r.z);
      let best = null, bd = 1e9;
      adj.forEach(h => {
        const J = T3(h.J), axis = T3(h.axis);
        const t = Math.max(0, Math.min(h.full, Pj.clone().sub(J).dot(axis)));
        const Ah = J.addScaledVector(axis, t);
        const d = Ah.distanceTo(Pj);
        if (d < bd) { bd = d; best = { h, Ah }; }
      });
      if (!best || bd > .8) return;
      const { h, Ah } = best;
      const side = T3(h.side);
      [-1, 1].forEach(sj => {
        const nJ = T3(f.basis.Z).multiplyScalar(sj);
        const nH = side.clone().multiplyScalar(Math.sign(Pj.clone().sub(Ah).dot(side)) || 1);
        const cJ = Pj.dot(nJ) + m.rt / 2 + PT / 2, cH = Ah.dot(nH) + m.hipW / 2 + PT / 2;
        const det = nJ.x * nH.z - nJ.z * nH.x;
        if (Math.abs(det) < 1e-5) return;
        const cx = (cJ * nH.z - nJ.z * cH) / det, cz = (nJ.x * cH - cJ * nH.x) / det;
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;
        const C = V(cx, Pj.y, cz);
        const dA = new THREE.Vector3().crossVectors(UP, nJ).normalize();
        if (dA.dot(T3(f.basis.X)) < 0) dA.negate();
        const dB = new THREE.Vector3().crossVectors(UP, nH).normalize();
        if (dB.dot(T3(h.axis)) < 0) dB.negate();
        cornerAngle(g, mats, b, C, nJ, nH, dA, dB, .09, .09, .11, Pj.y, .040);
      });
    });
    b.flush(g, gs, mats);
  });

  /* 13. Кронштейны снегозадержателей */
  if (p.snow) safe('снегозадержатели', () => {
    const { g, b } = mk('snow', 13);
    const base = plateGeo(.08, .055, .004, holeGrid(2, 1, .045, 0));
    const collar = new THREE.TorusGeometry(.027, .007, 8, 14);
    m.faces.forEach(f => m.snowRows.forEach(x => {
      if (x < .25) return;
      const len = 2 * m.zHalf(f, x) - .4; if (len < .6) return;
      const n = Math.max(2, Math.round(len / .9));
      for (let i = 0; i <= n; i++) {
        const s = L2W(f, x, m.coverTop, -len / 2 + len * i / n);
        const bY = T3(f.basis.Y), bX = T3(f.basis.X), bZ = T3(f.basis.Z);
        putPlate(g, mats.steel, base, s, bX, bZ, bY, .004);
        [-1, 1].forEach(sx => b.screw(s.clone().addScaledVector(bX, sx * .0225).addScaledVector(bY, .004), bY, .055));
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.017, .020, .092, 10), mats.steel);
        post.position.copy(s).addScaledVector(bY, .046);
        post.quaternion.copy(qTo(bY)); post.castShadow = true; g.add(post);
        const col = new THREE.Mesh(collar, mats.dark);
        col.position.copy(s).addScaledVector(bY, .11);
        col.quaternion.copy(qTo(bZ)); col.castShadow = true; g.add(col);
      }
    }));
    b.flush(g, gs, mats);
  });

  /* 13. Саморезы конька и хребтов по флангам */
  safe('конёк', () => {
    const { g, b } = mk('ridge', 13);
    const LIFT = .018, apexY = m.apex + m.coverTop / m.ca + LIFT;
    if (m.ridgeLen > .05) {
      const cnt = Math.max(2, Math.round(m.ridgeLen / .6));
      for (let i = 0; i <= cnt; i++) {
        const z = -m.ridgeHalf + m.ridgeLen * i / cnt;
        [-1, 1].forEach(s => {
          const n = V(m.sa * s, m.ca, 0);
          b.screw(V(0, apexY, z).addScaledVector(V(m.ca * s, -m.sa, 0), .10).addScaledVector(n, .004), n, .05);
        });
      }
    }
    m.hips.forEach(h => {
      const J = T3(h.J), axis = T3(h.axis), up = T3(h.up);
      const sC = m.coverTop / Math.max(.18, up.dot(T3(h.n1))) + LIFT / Math.max(.2, up.y);
      const cnt = Math.max(2, Math.round(h.full / .7));
      for (let i = 0; i <= cnt; i++) {
        const ap = J.clone().addScaledVector(axis, h.full * i / cnt).addScaledVector(up, sC);
        [T3(h.n1), T3(h.n2)].forEach(n => {
          const d = new THREE.Vector3().crossVectors(n, axis).normalize();
          if (d.y > 0) d.negate();
          b.screw(ap.clone().addScaledVector(d, .09).addScaledVector(n, .004), n, .05);
        });
      }
    });
    b.flush(g, gs, mats);
  });

  /* Прогоны, подкладки, стойки, шпренгели */
  const LP = p.__long;
  if (LP) {
    if ((LP.purlins || []).length || (LP.posts || []).length || (LP.shprengels || []).length) safe('прогоны', () => {
      const { g, b } = mk('frame', 4);
      (LP.pads || []).forEach(q => {
        const me = box(q.sect[0] / 1000, q.sect[1] / 1000, q.len, mats.wood, q.x, q.sect[1] / 2000, q.z);
        if (me) { me.userData.mk = q.mark; g.add(me); }
      });
      (LP.purlins || []).forEach(q => {
        const f = m.faces[q.fi]; if (!f) return;
        const w = q.sect[0] / 1000, h = q.sect[1] / 1000;
        const me = box(w, h, q.len, mats.wood, q.X, -h / 2, 0);
        if (!me) return;
        me.userData.mk = q.mark;
        const fr = frameLocal(f); fr.add(me); g.add(fr);
        const nB = Math.max(2, Math.round(q.len / 1.2));
        for (let i = 0; i <= nB; i++) b.screw(L2W(f, q.X, .004, -q.len / 2 + q.len * i / nB), T3(f.basis.Y), .07);
      });
      (LP.posts || []).forEach(q => {
        const bot = q.bottom || 0, h = Math.max(.2, q.top - bot);
        const me = box(q.sect[0] / 1000, h, q.sect[1] / 1000, mats.wood, q.x, bot + h / 2, q.z);
        if (me) { me.userData.mk = q.mark; g.add(me); }
        const cap = box(q.sect[0] / 1000 + .05, .012, q.sect[1] / 1000 + .05, mats.steel, q.x, q.top + .006, q.z);
        if (cap) g.add(cap);
        const foot = box(q.sect[0] / 1000 + .05, .012, q.sect[1] / 1000 + .05, mats.steel, q.x, bot + .006, q.z);
        if (foot) g.add(foot);
        [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
          b.screw(V(q.x + sx * .045, q.top + .012, q.z + sz * .045), UP, .06);
          b.screw(V(q.x + sx * .045, bot + .012, q.z + sz * .045), UP, .06);
        }));
      });
      (LP.shprengels || []).forEach(q => {
        const yC = q.beamY != null ? q.beamY : q.sect[1] / 2000;
        const beam = beamBetween(V(q.a.x, yC, q.a.z), V(q.b.x, yC, q.b.z), q.sect[0] / 1000, q.sect[1] / 1000, mats.wood);
        if (beam) { beam.userData.mk = q.mark; g.add(beam); }
        const h = m.hips[q.hi];
        if (q.post) {
          const ph = Math.max(.2, q.post.top - q.post.bottom);
          const post = box(q.post.sect[0] / 1000, ph, q.post.sect[1] / 1000, mats.wood, q.post.x, q.post.bottom + ph / 2, q.post.z);
          if (post) { post.userData.mk = q.post.mark; g.add(post); }
          const cap = box(.20, .012, .20, mats.steel, q.post.x, q.post.top + .006, q.post.z);
          if (cap) g.add(cap);
          const foot = box(.20, .012, .20, mats.steel, q.post.x, q.post.bottom + .006, q.post.z);
          if (foot) g.add(foot);
          [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
            b.screw(V(q.post.x + sx * .055, q.post.top + .012, q.post.z + sz * .055), UP, .06);
            b.screw(V(q.post.x + sx * .055, q.post.bottom + .012, q.post.z + sz * .055), UP, .06);
          }));
          if (h) [-1, 1].forEach(s => {
            const t = Math.max(.2, Math.min(h.full - .2, q.hipT + s * .8));
            const Ph = T3(h.J).addScaledVector(T3(h.axis), t);
            const u1 = Math.max(.18, T3(h.up).dot(T3(h.n1)));
            const target = Ph.addScaledVector(T3(h.up), m.rd / u1 - m.hipDepth);
            const bs = V(q.post.x, q.post.bottom + .25, q.post.z);
            const br = beamBetween(bs, target, .05, .15, mats.wood);
            if (br) g.add(br);
            b.bolt(bs.clone().addScaledVector(UP, .02), target, .005);
          });
        } else if (h) {
          const Ph = T3(h.J).addScaledVector(T3(h.axis), q.hipT);
          b.bolt(V(Ph.x, yC - .05, Ph.z), V(Ph.x, q.hipY + .02, Ph.z), .006);
        }
      });
      b.flush(g, gs, mats);
    });

    /* Накладки стыков стропил — точно там, где рендер сделал разрыв */
    const withJoints = [];
    m.rafters.forEach((r, ri) => { if ((r.joints || []).length) withJoints.push({ r, ri }); });
    if (withJoints.length) safe('накладки', () => {
      const { g, b } = mk('fix', 6);
      const frames = new Map();
      const frameFor = fi => {
        if (!frames.has(fi)) { const fr = frameLocal(m.faces[fi]); frames.set(fi, fr); g.add(fr); }
        return frames.get(fi);
      };
      const rB = (p.boltD || 12) / 2000;
      const nk = (LP.supportPieces || []).find(x => x.code && x.code.startsWith('NK-'));
      withJoints.forEach(({ r, ri }) => {
        r.joints.forEach(j => {
          const pl = j.plateLen / 1000, pw = j.plateW / 1000, pt = j.plateTh / 1000;
          const geo = plateGeo(pl, pw, pt, []);
          if (!geo) { errors.push('накладка: геометрия не построена'); return; }
          const fr = frameFor(r.fi);
          [-1, 1].forEach(sz => {
            const me = meshOf(geo, mats.splice);
            if (!me) return;
            me.position.set(j.X, m.rd / 2, r.z + sz * (m.rt / 2 + pt / 2));
            me.userData.joint = ri + ':' + j.X.toFixed(4);
            if (nk) me.userData.mk = nk.mark;
            fr.add(me);
          });
          for (let side = -1; side <= 1; side += 2)
            for (let i = 0; i < j.perSide; i++) {
              const bx = j.X + side * (j.a3 / 1000 + i * j.a1 / 1000);
              for (let row = 0; row < j.rows; row++) {
                const by = m.rd / 2 + (row - (j.rows - 1) / 2) * (j.a2 / 1000);
                const zA = r.z - (m.rt / 2 + 2 * pt), zB = r.z + (m.rt / 2 + 2 * pt);
                b.bolt(L2W(r.f, bx, by, zA), L2W(r.f, bx, by, zB), rB);
              }
            }
        });
      });
      b.flush(g, gs, mats);
    });

    /* Накладки стыков мауэрлата */
    const ps = (LP.splices || []).find(s => s.group === 'plate' && s.plates > 0);
    if (ps) safe('стыки мауэрлата', () => {
      const { g, b } = mk('fix', 1);
      const pl = ps.plateLen / 1000, pw = Math.min(ps.plateW / 1000, m.ph * .92), pt = ps.plateTh / 1000;
      const geo = plateGeo(pl, pw, pt, []);
      if (!geo) { b.flush(g, gs, mats); return; }
      const rB = (p.boltD || 12) / 2000;
      const nm = (LP.supportPieces || []).find(x => x.code && x.code.startsWith('NM-'));
      for (let j = 1; j <= ps.joints; j++) {
        const t = j / (ps.joints + 1);
        [-1, 1].forEach(sx => {
          const z = -m.plateLenZ / 2 + m.plateLenZ * t + (sx > 0 ? .35 : -.35);
          [-1, 1].forEach(sz => {
            const me = meshOf(geo, mats.splice);
            if (me) {
              me.position.set(sx * (m.span / 2 + sz * (m.pw / 2 + pt / 2)), -m.ph / 2, z);
              me.rotation.y = Math.PI / 2;
              if (nm) me.userData.mk = nm.mark;
              g.add(me);
            }
            for (let i = 0; i < ps.perSide; i++) {
              const zz = z + (i - (ps.perSide - 1) / 2) * (ps.a1 / 1000);
              b.bolt(V(sx * (m.span / 2 - m.pw / 2 - pt), -m.ph / 2, zz), V(sx * (m.span / 2 + m.pw / 2 + pt), -m.ph / 2, zz), rB);
            }
          });
        });
      }
      b.flush(g, gs, mats);
    });
  }

  const count = out.reduce((s, o) => {
    let n = 0; o.group.traverse(c => { if (c.isInstancedMesh) n += c.count; else if (c.isMesh) n++; });
    return s + n;
  }, 0);
  return { parts: out, count, materials: mats, errors };
}

export const HARDWARE_NOTES = [
  ['Скользящая опора', 'Полка на стропиле наглухо, полка на мауэрлате — вертикальный паз 13×58 мм под усадку сруба 2–7%.'],
  ['Болты ригеля', 'Насквозь через ригель и стропило, шайба + гайка. Шаг вдоль ≥7d, от торца ≥7d, от кромки ≥3d.'],
  ['Стык стропил', 'Впритык НА прогоне, двусторонние накладки, минимум 4 болта. Вразбежку на общем прогоне не делается.'],
  ['Шпренгель', 'Диагональ через угол на два мауэрлата, стойка под накосное и два подкоса. При малом уклоне — прямое опирание.'],
  ['Прогоны', 'На всех скатах, стойка на подкладке поперёк балок. Разгружают пролёт стропилы.']
];