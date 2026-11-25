import * as THREE from 'three';

/* ============================================================
   КРОВЛЯ v2: исправлены водосток (трубы у стены, а не в воздухе),
   хребты вальмы (цилиндры по поверхности, ничего не торчит),
   снегозадержатели на ВСЕХ скатах, мансардное окно утоплено в
   плоскость, все базисы правые (ничего не зеркалится).
   ============================================================ */

export const ROOF_MATERIALS = [
  { value: 'metaltile', label: 'Металлочерепица' },
  { value: 'seam',      label: 'Фальцевая кровля' },
  { value: 'shingle',   label: 'Гибкая черепица' },
  { value: 'proflist',  label: 'Профлист' },
];

export const ROOF_COLORS = [
  { value: 'graphite',   label: 'Графит',        hex: '#3b4147' },
  { value: 'chocolate',  label: 'Шоколад',       hex: '#4b3327' },
  { value: 'moss',       label: 'Зелёный мох',   hex: '#2f4a35' },
  { value: 'ruby',       label: 'Красный рубин', hex: '#7c2331' },
  { value: 'terracotta', label: 'Терракота',     hex: '#9c4b2c' },
  { value: 'blue',       label: 'Синий',         hex: '#27466f' },
  { value: 'gray',       label: 'Серый',         hex: '#71777b' },
  { value: 'black',      label: 'Чёрный',        hex: '#23272b' },
];

const YESNO = [{ value: 'yes' }, { value: 'no' }];
const CHIMNEY = [{ value: 'none' }, { value: 'brick' }, { value: 'steel' }];

const pick = (v, list, def) => (list.some(o => o.value === String(v)) ? String(v) : def);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, num(v, a)));

export function roofDesign(p) {
  return {
    material: pick(p.roofMaterial, ROOF_MATERIALS, 'metaltile'),
    color: pick(p.roofColor, ROOF_COLORS, 'graphite'),
    gutter: pick(p.roofGutter, YESNO, 'yes'),
    snow: pick(p.roofSnowGuard, YESNO, 'no'),
    soffit: pick(p.roofSoffit, YESNO, 'yes'),
    window: pick(p.roofWindow, YESNO, 'no'),
    chimney: pick(p.chimney, CHIMNEY, 'none'),
  };
}

export function roofColorHex(key) {
  return (ROOF_COLORS.find(c => c.value === key) || ROOF_COLORS[0]).hex;
}

/* ---------- Окружение (envMap для металла и стекла) ---------- */
let ENV = null;
export function initRoofEnvironment(renderer, scene) {
  if (ENV || !renderer) return ENV;
  try {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#7fb6e8');
    g.addColorStop(.44, '#cfe3f2');
    g.addColorStop(.52, '#f4e7ce');
    g.addColorStop(.60, '#708f64');
    g.addColorStop(1, '#3c5140');
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    const s = x.createRadialGradient(148, 58, 3, 148, 58, 74);
    s.addColorStop(0, 'rgba(255,250,236,1)');
    s.addColorStop(1, 'rgba(255,250,236,0)');
    x.fillStyle = s; x.fillRect(0, 0, 512, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader();
    ENV = pm.fromEquirectangular(tex).texture;
    pm.dispose();
    tex.dispose();
    if (scene) scene.environment = ENV;
  } catch { ENV = null; }
  return ENV;
}

/* ---------- Геометрия ---------- */
export function roofGeom(p) {
  const width = clamp(p.width, 4, 15) || 8;
  const length = clamp(p.length, 4, 15) || 6;
  const roofHeight = clamp(p.roofHeight, .8, 5) || 2.2;
  const oF = clamp(p.overhangFront, .3, 4);
  const oB = clamp(p.overhangBack, .3, 4);
  const oS = clamp(p.overhangSides, .3, 4);
  const mansard = p.mansard === 'yes' && num(p.floors, 1) >= 2;
  const type = (mansard || p.roofType !== 'hip') ? 'gable' : 'hip';

  const hw = width / 2 + oS;
  const lF = length / 2 + oF;
  const lB = length / 2 + oB;
  const L = lF + lB;
  const zC = (lF - lB) / 2;
  const drop = (oS * roofHeight) / (width / 2);
  const rise = roofHeight + drop;
  const slopeLen = Math.hypot(hw, rise);
  const theta = Math.atan2(rise, hw);
  const c = Math.cos(theta), s = Math.sin(theta);

  let zRf = lF - hw, zRb = hw - lB, pyramid = false;
  if (type === 'hip' && zRf <= zRb + .05) { pyramid = true; zRf = zRb = zC; }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const faces = [];
  if (type === 'gable') {
    faces.push({ name: 'right', verts: [V(hw, -drop, lF), V(hw, -drop, -lB), V(0, roofHeight, -lB), V(0, roofHeight, lF)] });
    faces.push({ name: 'left',  verts: [V(-hw, -drop, -lB), V(-hw, -drop, lF), V(0, roofHeight, lF), V(0, roofHeight, -lB)] });
  } else {
    faces.push({ name: 'right', verts: [V(hw, -drop, lF), V(hw, -drop, -lB), V(0, roofHeight, zRb), V(0, roofHeight, zRf)] });
    faces.push({ name: 'left',  verts: [V(-hw, -drop, -lB), V(-hw, -drop, lF), V(0, roofHeight, zRf), V(0, roofHeight, zRb)] });
    faces.push({ name: 'front', verts: [V(-hw, -drop, lF), V(hw, -drop, lF), V(0, roofHeight, zRf)] });
    faces.push({ name: 'back',  verts: [V(hw, -drop, -lB), V(-hw, -drop, -lB), V(0, roofHeight, zRb)] });
  }

  const center = V(0, roofHeight * .3, zC);
  let area = 0;
  faces.forEach(f => {
    const O = f.verts[0].clone();
    const u = f.verts[1].clone().sub(O).normalize();
    const ref = f.verts[f.verts.length - 1].clone().sub(O);
    const v = ref.clone().sub(u.clone().multiplyScalar(ref.dot(u))).normalize();
    let n = new THREE.Vector3().crossVectors(u, v);
    const fc = f.verts.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / f.verts.length);
    if (n.dot(fc.clone().sub(center)) < 0) { u.negate(); n.negate(); }
    f.O = O; f.u = u; f.v = v; f.n = n;
    f.pts2 = f.verts.map(q => {
      const d = q.clone().sub(O);
      return new THREE.Vector2(d.dot(u), d.dot(v));
    });
    f.depth = f.pts2.reduce((m, q) => Math.max(m, q.y), 0);
        f.widthAt = dist => {
      const xs = [];
      const n = f.pts2.length;
      for (let i = 0; i < n; i++) {
        const a = f.pts2[i], b = f.pts2[(i + 1) % n];
        if ((a.y <= dist && b.y > dist) || (b.y <= dist && a.y > dist)) {
          const t = (dist - a.y) / (b.y - a.y);
          xs.push(a.x + (b.x - a.x) * t);
        }
      }
      if (xs.length < 2) return 0;
      return Math.max(...xs) - Math.min(...xs);
    };
    let a2 = 0;
    for (let i = 0; i < f.pts2.length; i++) {
      const A = f.pts2[i], B = f.pts2[(i + 1) % f.pts2.length];
      a2 += A.x * B.y - B.x * A.y;
    }
    f.area = Math.abs(a2) / 2;
    area += f.area;
  });

  const hipEdges = [];
  if (type === 'hip') {
    const rf = V(0, roofHeight, zRf), rb = V(0, roofHeight, zRb);
    hipEdges.push({ a: rf, b: V(hw, -drop, lF),   f1: 'right', f2: 'front' });
    hipEdges.push({ a: rf, b: V(-hw, -drop, lF),  f1: 'left',  f2: 'front' });
    hipEdges.push({ a: rb, b: V(hw, -drop, -lB),  f1: 'right', f2: 'back' });
    hipEdges.push({ a: rb, b: V(-hw, -drop, -lB), f1: 'left',  f2: 'back' });
  }

  const eaveLen = type === 'gable' ? 2 * L : 2 * L + 4 * hw;
  const soffitArea = 2 * oS * L + (type === 'hip' ? 2 * hw * (oF + oB) : 0);

  const beamW = clamp(p.beamWidth, 100, 200) / 1000;
  const stepY = (p.material === 'brevno' ? beamW * .85 : beamW * .95);
  const wallH = mansard ? num(p.wallHeight, 2.7) * (num(p.floors, 1) - 1) + 1.8 : num(p.wallHeight, 2.7) * num(p.floors, 1);
  const layers = Math.max(1, Math.ceil(wallH / stepY));
  const wallTop = (p.buildingType === 'roof' ? 0 : .6) + (p.buildingType === 'roof' ? 0 : layers * stepY + beamW / 2);

  return {
    type, width, length, roofHeight, oF, oB, oS, hw, lF, lB, L, zC,
    drop, rise, slopeLen, theta, c, s, zRf, zRb, pyramid,
    faces, hipEdges, area, eaveLen, soffitArea,
    groundY: -wallTop,
    surfaceY: x => -drop + (hw - Math.abs(x)) * (rise / hw),
  };
}

export function roofArea(p) { return roofGeom(p).area; }

/* ---------- Текстуры ---------- */
function noise(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = Math.random() > .5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

function makeRoofTextures(kind) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  let tileW = 1, tileH = 1, metalness = .6, roughness = .4;

  if (kind === 'metaltile') {
    tileW = 1.10; tileH = .35; metalness = .62; roughness = .38;
    x.fillStyle = '#e9eaec'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const x0 = (W / 6) * i;
      const g = x.createLinearGradient(x0, 0, x0 + W / 6, 0);
      g.addColorStop(0, 'rgba(0,0,0,.20)');
      g.addColorStop(.18, 'rgba(255,255,255,.30)');
      g.addColorStop(.5, 'rgba(255,255,255,.06)');
      g.addColorStop(.86, 'rgba(0,0,0,.14)');
      g.addColorStop(1, 'rgba(0,0,0,.24)');
      x.fillStyle = g; x.fillRect(x0, 0, W / 6, H);
    }
    const step = H * .22;
    const sg = x.createLinearGradient(0, H - step, 0, H);
    sg.addColorStop(0, 'rgba(255,255,255,.34)');
    sg.addColorStop(.22, 'rgba(0,0,0,.30)');
    sg.addColorStop(1, 'rgba(0,0,0,.10)');
    x.fillStyle = sg; x.fillRect(0, H - step, W, step);
    x.fillStyle = 'rgba(255,255,255,.42)'; x.fillRect(0, H - step - 2, W, 2);
    noise(x, W, H, 2400, .05);
  } else if (kind === 'seam') {
    tileW = .55; tileH = 1.0; metalness = .72; roughness = .3;
    x.fillStyle = '#e6e8ea'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 240; i++) {
      x.strokeStyle = Math.random() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
      x.lineWidth = Math.random() * 2 + .4;
      const px = Math.random() * W;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (Math.random() - .5) * 6, H); x.stroke();
    }
    [0, W - 14].forEach(px => {
      x.fillStyle = 'rgba(0,0,0,.30)'; x.fillRect(px, 0, 14, H);
      x.fillStyle = 'rgba(255,255,255,.46)'; x.fillRect(px + 3, 0, 5, H);
      x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(px + 11, 0, 3, H);
    });
    noise(x, W, H, 1200, .04);
  } else if (kind === 'proflist') {
    tileW = .20; tileH = 1.0; metalness = .6; roughness = .42;
    x.fillStyle = '#e4e6e8'; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,.26)');
    g.addColorStop(.10, 'rgba(255,255,255,.34)');
    g.addColorStop(.26, 'rgba(255,255,255,.10)');
    g.addColorStop(.34, 'rgba(0,0,0,.16)');
    g.addColorStop(.52, 'rgba(0,0,0,.05)');
    g.addColorStop(.70, 'rgba(255,255,255,.14)');
    g.addColorStop(.86, 'rgba(0,0,0,.22)');
    g.addColorStop(1, 'rgba(0,0,0,.28)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    noise(x, W, H, 1000, .04);
  } else {
    tileW = .90; tileH = .29; metalness = .04; roughness = .86;
    x.fillStyle = '#d9d9d6'; x.fillRect(0, 0, W, H);
    const rh = H / 2, cw = W / 6;
    for (let r = 0; r < 2; r++) {
      const off = (r % 2) * cw * .5;
      for (let i = -1; i <= 6; i++) {
        const px = i * cw + off, py = r * rh;
        x.fillStyle = `rgba(255,255,255,${(Math.random() * .18)})`;
        x.fillRect(px + 1.5, py + 1.5, cw - 3, rh - 3);
        x.fillStyle = 'rgba(0,0,0,.34)';
        x.fillRect(px, py, cw, 2.5);
        x.fillRect(px, py, 2.5, rh);
        x.fillStyle = 'rgba(0,0,0,.18)';
        x.fillRect(px, py + rh - 5, cw, 5);
      }
    }
    noise(x, W, H, 14000, .10);
  }

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / tileW, 1 / tileH);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const bc = document.createElement('canvas');
  bc.width = W; bc.height = H;
  const bx = bc.getContext('2d');
  try { bx.filter = 'grayscale(1) contrast(1.7)'; } catch { /* ок */ }
  bx.drawImage(c, 0, 0);
  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.copy(map.repeat);

  return { map, bump, metalness, roughness };
}

function brickTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#c9c2b4'; x.fillRect(0, 0, W, H);
  const bh = H / 8, bw = W / 3;
  for (let r = 0; r < 8; r++) {
    const off = (r % 2) * bw * .5;
    for (let i = -1; i <= 3; i++) {
      const t = Math.random();
      x.fillStyle = t > .66 ? '#a8563c' : t > .33 ? '#9c4e36' : '#b06044';
      x.fillRect(i * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  noise(x, W, H, 3000, .07);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 4);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/* ---------- Примитивы ---------- */
function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

function box(w, h, d, mat, x, y, z) {
  if (!(w > 1e-4 && h > 1e-4 && d > 1e-4)) return null;
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}

/* Правый базис плоскости: X — вдоль карниза, Y — наружная нормаль, Z = X×Y */
function faceQuaternion(f) {
  const z = new THREE.Vector3().crossVectors(f.u, f.n).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.u.clone(), f.n.clone(), z));
}

function tubeAlong(dir, len, r, mat, open = false) {
  if (len < .03) return null;
  const geo = new THREE.CylinderGeometry(r, r, len, open ? 12 : 14, 1, open);
  const m = shadowed(new THREE.Mesh(geo, mat));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

function faceMesh(f, thickness, mat) {
  const shape = new THREE.Shape();
  f.pts2.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
  shape.closePath();
  let geo;
  try { geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }); }
  catch { return null; }
    geo.translate(0, 0, -thickness);
  // Правый базис плоскости: X — вдоль карниза, Y — вверх по скату, Z — наружная нормаль
  const basis = new THREE.Matrix4().makeBasis(f.u.clone(), f.v.clone(), f.n.clone());
  basis.setPosition(f.O);
  geo.applyMatrix4(basis);
  geo.computeVertexNormals();
  return shadowed(new THREE.Mesh(geo, mat));
}

function gutterProfile(rOut, rIn, len, mat) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI + Math.PI * i / 14;
    pts.push(new THREE.Vector2(Math.cos(a) * rOut, Math.sin(a) * rOut));
  }
  for (let i = 14; i >= 0; i--) {
    const a = Math.PI + Math.PI * i / 14;
    pts.push(new THREE.Vector2(Math.cos(a) * rIn, Math.sin(a) * rIn));
  }
  let geo;
  try { geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: len, bevelEnabled: false }); }
  catch { return null; }
  geo.translate(0, 0, -len / 2);
  return shadowed(new THREE.Mesh(geo, mat));
}

/* ---------- Сборка ---------- */
export function buildRoof(params) {
  const G = roofGeom(params);
  const d = roofDesign(params);
  const group = new THREE.Group();
  group.userData.isRoof = true;

  const T = makeRoofTextures(d.material);
  const base = new THREE.Color(roofColorHex(d.color));
  const hasEnv = !!ENV;
  const roofMat = new THREE.MeshStandardMaterial({
    color: base, map: T.map, bumpMap: T.bump, bumpScale: .014,
    metalness: hasEnv ? T.metalness : Math.min(T.metalness, .28),
    roughness: T.roughness, envMap: ENV || null, envMapIntensity: .95,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: base.clone().multiplyScalar(.8),
    metalness: hasEnv ? .5 : .22, roughness: .45, envMap: ENV || null, envMapIntensity: .8,
  });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f3f0e7', roughness: .55, metalness: .04, envMap: ENV || null });
  const soffitMat = new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: .7, metalness: .03, envMap: ENV || null });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#8d949a', metalness: hasEnv ? .85 : .35, roughness: .3, envMap: ENV || null });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#9fc6dd', metalness: .1, roughness: .06, transparent: true, opacity: .42,
    envMap: ENV || null, envMapIntensity: 1.4, side: THREE.DoubleSide,
  });

  const add = m => { if (m) group.add(m); return m; };
  const TH = .055;
  const { hw, lF, lB, L, zC, drop, rise, slopeLen, theta, c, s, roofHeight: rH, type } = G;

  /* Скаты */
  G.faces.forEach(f => add(faceMesh(f, TH, roofMat)));

  /* Конёк: два фартука + валик + заглушки */
  const ridgeZ0 = type === 'gable' ? -lB : G.zRb;
  const ridgeZ1 = type === 'gable' ? lF : G.zRf;
  const ridgeLen = ridgeZ1 - ridgeZ0;
  if (ridgeLen > .05) {
    const rzC = (ridgeZ0 + ridgeZ1) / 2;
    [-1, 1].forEach(side => {
      const flap = box(.18, .028, ridgeLen + .04, trimMat, side * .085 * c, rH - .085 * s + .035, rzC);
      if (flap) { flap.rotation.z = -side * theta; group.add(flap); }
    });
    const bead = tubeAlong(new THREE.Vector3(0, 0, 1), ridgeLen + .04, .032, trimMat);
    if (bead) { bead.position.set(0, rH + .045, rzC); group.add(bead); }
    [ridgeZ0 - .02, ridgeZ1 + .02].forEach(z => add(box(.24, .09, .035, trimMat, 0, rH + .01, z)));
  }

  /* Хребты вальмы: цилиндр строго по ребру, прижат к поверхности */
  if (type === 'hip') {
    G.hipEdges.forEach(e => {
      const f1 = G.faces.find(f => f.name === e.f1);
      const f2 = G.faces.find(f => f.name === e.f2);
      const n = f1.n.clone().add(f2.n).normalize();
      const dir = e.b.clone().sub(e.a);
      const len = dir.length();
      const cap = tubeAlong(dir, len + .1, .085, trimMat);
      if (!cap) return;
      cap.position.copy(e.a).add(e.b).multiplyScalar(.5).addScaledVector(n, .045);
      group.add(cap);
    });
  }

  /* Карниз: доска + капельник */
  [{ x: hw, sign: 1 }, { x: -hw, sign: -1 }].forEach(({ x, sign }) => {
    add(box(.032, .22, L, whiteMat, sign * (hw + .016), -drop - .11, zC));
    const drip = box(.07, .022, L, trimMat, sign * (hw - .025), -drop + .028, zC);
    if (drip) { drip.rotation.z = -sign * theta; group.add(drip); }
  });

  /* Ветровые планки */
  if (type === 'gable') {
    [{ z: lF, sign: 1 }, { z: -lB, sign: -1 }].forEach(({ z, sign }) => {
      [-1, 1].forEach(side => {
        const b1 = box(slopeLen + .06, .20, .034, whiteMat, side * hw / 2, (rH - drop) / 2 - .04, z + sign * .018);
        if (b1) { b1.rotation.z = -side * theta; group.add(b1); }
        const b2 = box(slopeLen + .06, .05, .07, trimMat, side * hw / 2, (rH - drop) / 2 + .06, z + sign * .03);
        if (b2) { b2.rotation.z = -side * theta; group.add(b2); }
      });
    });
  } else {
    [{ z: lF, sign: 1 }, { z: -lB, sign: -1 }].forEach(({ z, sign }) => {
      add(box(2 * hw + .06, .22, .032, whiteMat, 0, -drop - .11, z + sign * .016));
      add(box(2 * hw + .06, .022, .07, trimMat, 0, -drop + .028, z + sign * .025));
    });
  }

  /* Софиты: только горизонтальные полосы под свесами */
  if (d.soffit === 'yes') {
    [{ sign: 1 }, { sign: -1 }].forEach(({ sign }) => {
      add(box(G.oS, .022, L, soffitMat, sign * (G.width / 2 + hw) / 2, -drop - .022, zC));
    });
    if (type === 'hip') {
      add(box(2 * hw, .022, G.oF, soffitMat, 0, -drop - .022, (G.length / 2 + lF) / 2));
      add(box(2 * hw, .022, G.oB, soffitMat, 0, -drop - .022, -(G.length / 2 + lB) / 2));
    }
  }

  /* Водосток: жёлоб у карниза, труба У СТЕНЫ, колена и отлив соединены */
  if (d.gutter === 'yes') {
    const wallX = G.width / 2;
    [{ sign: 1 }, { sign: -1 }].forEach(({ sign }) => {
      const gx = sign * (hw + .045);
      const gy = -drop - .06;
      const gut = gutterProfile(.066, .056, L - .04, trimMat);
      if (gut) { gut.position.set(gx, gy, zC); group.add(gut); }
      const nBr = Math.max(2, Math.round(L / .7));
      for (let i = 0; i <= nBr; i++) {
        const z = -lB + .02 + (L - .04) * i / nBr;
        add(box(.09, .022, .035, metalMat, gx - sign * .03, gy + .05, z));
      }
      [lF - .35, -lB + .35].forEach(gz => {
        const px = sign * (wallX + .075);
        const topY = gy - .07;
        const botY = G.groundY + .28;
        // верхнее колено: от жёлоба к трубе
        const elbowTop = tubeAlong(new THREE.Vector3(px - gx, -0.16, 0), Math.hypot(px - gx, .16) + .06, .043, trimMat);
        if (elbowTop) { elbowTop.position.set((gx + px) / 2, topY - .08, gz); group.add(elbowTop); }
        // стояк
        const h = topY - .14 - botY;
        if (h > .3) {
          const pipe = tubeAlong(new THREE.Vector3(0, 1, 0), h, .043, trimMat);
          if (pipe) { pipe.position.set(px, botY + h / 2, gz); group.add(pipe); }
          [.25, .6, .9].forEach(t => add(box(.11, .045, .05, metalMat, sign * (wallX + .035), botY + h * t, gz)));
          // нижнее колено + отлив
          const elbowBot = tubeAlong(new THREE.Vector3(sign * .55, -.5, 0), .3, .043, trimMat);
          if (elbowBot) { elbowBot.position.set(px + sign * .11, botY - .07, gz); group.add(elbowBot); }
          const shoe = tubeAlong(new THREE.Vector3(sign * .8, -.6, 0), .26, .046, trimMat);
          if (shoe) { shoe.position.set(px + sign * .27, botY - .2, gz); group.add(shoe); }
        }
      });
    });
  }

  /* Снегозадержатели: на КАЖДОМ скате, труба и стойки по нормали */
  if (d.snow === 'yes') {
    G.faces.forEach(f => {
      const eaveMid = f.verts[0].clone().add(f.verts[1]).multiplyScalar(.5);
      const runLen = f.verts[0].distanceTo(f.verts[1]);
      const rows = f.depth > 2.0 ? [.45, 1.15] : [.45];
      rows.forEach(dist => {
        if (dist > f.depth - .35) return;
        const P = eaveMid.clone().addScaledVector(f.v, dist);
        // Ряд короче ширины ската в месте установки (отступ от хребтов и краёв)
        const len = Math.min(runLen, f.widthAt(dist)) - .4;
        if (len < .8) return;
        const tube = tubeAlong(f.u, len, .021, metalMat);
        if (!tube) return;
        tube.position.copy(P).addScaledVector(f.n, .085);
        group.add(tube);
        const nSt = Math.max(2, Math.round(len / .9));
        for (let i = 0; i <= nSt; i++) {
          const Q = P.clone().addScaledVector(f.u, -len / 2 + len * i / nSt);
          const st = tubeAlong(f.n, .1, .016, metalMat);
          if (st) { st.position.copy(Q).addScaledVector(f.n, .04); group.add(st); }
        }
      });
    });
  }

  /* Мансардное окно: утоплено в плоскость, по правому базису */
  if (d.window === 'yes') {
    const f = G.faces.find(v => v.name === 'right');
    const dist = f.depth * .46;
    const wA = .92, wB = .74;
    if (f.depth > 1.7 && f.widthAt(dist) > wA + .5) {
      const eaveMid = f.verts[0].clone().add(f.verts[1]).multiplyScalar(.5);
      const P = eaveMid.clone().addScaledVector(f.v, dist).addScaledVector(f.n, -.015);
      const wg = new THREE.Group();
      wg.quaternion.copy(faceQuaternion(f));
      wg.position.copy(P);
      const apron = box(wA + .2, .014, wB + .2, trimMat, 0, .012, 0);
      if (apron) wg.add(apron);
      const frame = box(wA, .09, wB, whiteMat, 0, .05, 0);
      if (frame) wg.add(shadowed(frame));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(wA - .12, .02, wB - .12), glassMat);
      glass.position.y = .085;
      wg.add(glass);
      const mull = box(wA - .12, .03, .035, whiteMat, 0, .095, 0);
      if (mull) wg.add(mull);
      group.add(wg);
    }
  }

  /* Дымоход с разделкой по плоскости ската */
  if (d.chimney !== 'none') {
    const f = G.faces.find(v => v.name === 'right');
    const cx = Math.min(hw - .6, G.width * .22);
    const cz = -G.length * .16;
    const sy = G.surfaceY(cx);
    const topY = rH + (d.chimney === 'brick' ? 1.0 : .85);
    const P = new THREE.Vector3(cx, sy, cz);
    const q = faceQuaternion(f);
    if (d.chimney === 'brick') {
      const brickMat = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: .9, metalness: .02, envMap: ENV || null });
      const shaftH = topY - (sy - .8);
      add(box(.42, shaftH, .42, brickMat, cx, sy - .8 + shaftH / 2, cz));
      add(box(.54, .07, .54, new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: .85 }), cx, topY + .035, cz));
      add(box(.30, .10, .30, new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: .8 }), cx, topY + .11, cz));
      const skirt = box(.66, .025, .66, trimMat, 0, 0, 0);
      if (skirt) { skirt.quaternion.copy(q); skirt.position.copy(P).addScaledVector(f.n, .03); group.add(skirt); }
    } else {
      const h = topY - (sy - .6);
      const pipe = tubeAlong(new THREE.Vector3(0, 1, 0), h, .11, metalMat);
      if (pipe) { pipe.position.set(cx, sy - .6 + h / 2, cz); group.add(pipe); }
      const apron = new THREE.Mesh(new THREE.ConeGeometry(.3, .22, 16, 1, true), trimMat);
      apron.quaternion.copy(q);
      apron.position.copy(P).addScaledVector(f.n, .1);
      group.add(shadowed(apron));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(.17, .13, 16), metalMat);
      cap.position.set(cx, topY + .09, cz);
      group.add(shadowed(cap));
    }
  }

  group.userData.roofInfo = { area: G.area, eaveLen: G.eaveLen, soffitArea: G.soffitArea, type: G.type };
  return group;
}