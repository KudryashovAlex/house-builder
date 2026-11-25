// src/verandas.js
import * as THREE from 'three';

export const VERANDA_STYLES = [
  { value: 'classic', label: 'Классика · точёные балясины' },
  { value: 'modern',  label: 'Модерн · тросы и LED' },
  { value: 'chalet',  label: 'Шале · массивный брус' },
  { value: 'glass',   label: 'Панорама · стеклянные перила' },
];

const BASE = 0.6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const STYLE = {
  classic: { post: 0.14, postColor: '#7a5230', trim: '#f3ead9', rail: '#f3ead9', metal: '#3a3f45', deck: '#9a6b3f', lattice: true,  lanterns: true,  planters: true,  capH: 0.12 },
  modern:  { post: 0.10, postColor: '#2f363c', trim: '#22282c', rail: '#2b3136', metal: '#2b3136', deck: '#8f6238', lattice: false, lanterns: false, planters: false, capH: 0.05 },
  chalet:  { post: 0.20, postColor: '#5f4126', trim: '#4a3320', rail: '#5f4126', metal: '#3a3f45', deck: '#7c5530', lattice: true,  lanterns: true,  planters: true,  capH: 0.14 },
  glass:   { post: 0.09, postColor: '#8a6a45', trim: '#f5f2ec', rail: '#f5f2ec', metal: '#c9ced2', deck: '#a8794a', lattice: false, lanterns: false, planters: false, capH: 0.05 },
};

function deckTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a6b3f';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = Math.random() > .5 ? 'rgba(70,42,18,.28)' : 'rgba(230,190,140,.22)';
    ctx.lineWidth = Math.random() * 2 + .6;
    const y = Math.random() * 256;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + (Math.random() - .5) * 7);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shadowed(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function layout(params, side) {
  const isFront = side === 'front';
  const kind = isFront ? params.entrance : params.terrace;
  const active = isFront
    ? (kind === 'veranda_open' || kind === 'veranda_glazed')
    : (kind === 'open' || kind === 'glazed');
  if (!active) return null;

  const sign = isFront ? 1 : -1;
  const w = clamp(params.width * (isFront ? .62 : .66), 3.4, 8.2);
  const d = isFront ? 3.0 : 3.2;
  const zPos = sign * (params.length / 2 + d / 2);
  const deckTop = BASE;
  const roofAttach = deckTop + params.wallHeight + .12;
  const roofDrop = .5;
  const gapW = 1.7;
  const railH = .95;
  const glazed = isFront ? kind === 'veranda_glazed' : kind === 'glazed';
  const style = STYLE[params.verandaStyle] ? params.verandaStyle : 'classic';
  const outerZ = zPos + sign * d / 2;

  return { isFront, sign, w, d, zPos, deckTop, roofAttach, roofDrop, gapW, railH, glazed, style, outerZ, kind };
}

export function getVerandaCollisionSegments(params) {
  const segs = [];
  ['front', 'back'].forEach(side => {
    const L = layout(params, side);
    if (!L) return;
    const { w, d, zPos, outerZ, gapW, sign } = L;
    const xL = -w / 2, xR = w / 2;
    const zIn = zPos - sign * d / 2, zOut = outerZ;
    segs.push({ x1: xL, z1: zIn, x2: xL, z2: zOut });
    segs.push({ x1: xR, z1: zIn, x2: xR, z2: zOut });
    segs.push({ x1: xL, z1: zOut, x2: -gapW / 2, z2: zOut });
    segs.push({ x1: gapW / 2, z1: zOut, x2: xR, z2: zOut });
  });
  return segs;
}

export function addVerandaStructure(house, params, side) {
  const L = layout(params, side);
  if (!L) return;
  const S = STYLE[L.style];
  const g = new THREE.Group();
  g.userData.isVeranda = true;
  house.add(g);

  const woodTex = deckTexture();
  const mat = {
    deck:  new THREE.MeshStandardMaterial({ color: S.deck, map: woodTex, roughness: .82 }),
    post:  new THREE.MeshStandardMaterial({ color: S.postColor, roughness: .8 }),
    trim:  new THREE.MeshStandardMaterial({ color: S.trim, roughness: .6 }),
    rail:  new THREE.MeshStandardMaterial({ color: S.rail, roughness: .55 }),
    metal: new THREE.MeshStandardMaterial({ color: S.metal, roughness: .35, metalness: .75 }),
    roof:  new THREE.MeshStandardMaterial({ color: '#20262b', roughness: .55, metalness: .25 }),
    stone: new THREE.MeshStandardMaterial({ color: '#7c7f82', roughness: .95 }),
    glass: new THREE.MeshStandardMaterial({ color: '#bfe3f2', transparent: true, opacity: .26, roughness: .05, metalness: .1, side: THREE.DoubleSide, depthWrite: false }),
    led:   new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45e', emissiveIntensity: 1.6, roughness: .4 }),
    leaf:  new THREE.MeshStandardMaterial({ color: '#3f7a4a', roughness: .9 }),
    soil:  new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 1 }),
  };

  const box = (w, h, d, m, x, y, z, cast = true) => {
    const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), cast);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };

  const { w, d, zPos, deckTop, roofAttach, roofDrop, gapW, railH, glazed, outerZ, sign } = L;
  const xL = -w / 2, xR = w / 2;
  const zIn = zPos - sign * d / 2;

  /* ================= КРОВЛЯ: точные высоты ================= */
  const roofDepth = d + .65;
  const roofThick = .1;
  const beamH = .2;
  const slopeAng = Math.atan2(roofDrop, roofDepth);
  const a = sign * slopeAng;
  const cosA = Math.cos(slopeAng);
  const zC = zPos + sign * .12;
  const roofY = roofAttach - roofDrop / 2;
  const yMid = z => roofY - (z - zC) * Math.tan(a);
  const roofUnderAt = z => yMid(z) - (roofThick / 2) / cosA;
  const beamBottomAt = z => roofUnderAt(z) - beamH / cosA;

  const innerPostZ = zIn + sign * .12;
  const outerPostZ = outerZ - sign * .12;

  /* --- Настил --- */
  const plankD = .135, gap = .012;
  const rows = Math.floor(d / (plankD + gap));
  for (let i = 0; i < rows; i++) {
    const z = zIn + sign * (i * (plankD + gap) + plankD / 2 + .03);
    box(w - .04, .05, plankD, mat.deck, 0, deckTop - .025, z);
  }
  box(w, .16, .1, mat.post, 0, deckTop - .13, zIn + sign * .05);
  box(w, .16, .1, mat.post, 0, deckTop - .13, outerZ - sign * .05);
  box(.1, .16, d, mat.post, xL + .05, deckTop - .13, zPos);
  box(.1, .16, d, mat.post, xR - .05, deckTop - .13, zPos);
  const joists = Math.max(3, Math.round(w / .8));
  for (let i = 0; i <= joists; i++) {
    box(.07, .14, d - .1, mat.post, xL + (w / joists) * i, deckTop - .14, zPos);
  }
  const footX = [xL + .25, 0, xR - .25];
  const footZ = [zIn + sign * .25, outerZ - sign * .25];
  footX.forEach(fx => footZ.forEach(fz => {
    const f = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, deckTop - .18, 10), mat.stone));
    f.position.set(fx, (deckTop - .18) / 2, fz);
    g.add(f);
  }));
  if (S.lattice) {
    const slats = Math.floor(w / .18);
    for (let i = 0; i <= slats; i++) {
      box(.035, deckTop - .22, .03, mat.trim, xL + (w / slats) * i, (deckTop - .22) / 2 + .04, outerZ - sign * .02);
    }
  } else {
    box(w - .1, .06, .04, mat.metal, 0, deckTop - .2, outerZ - sign * .02);
    box(w - .1, .06, .04, mat.metal, 0, deckTop - .34, outerZ - sign * .02);
  }

  /* --- Балки: наружная, пристенная, две наклонные боковые --- */
  box(w + .1, beamH, .14, mat.post, 0, roofUnderAt(outerPostZ) - beamH / 2, outerPostZ);
  box(w + .1, beamH, .14, mat.post, 0, roofUnderAt(innerPostZ) - beamH / 2, innerPostZ);
  const sideBeamLen = Math.abs(outerPostZ - innerPostZ) / cosA + .14;
  [xL + .12, xR - .12].forEach(bx => {
    const cz = (innerPostZ + outerPostZ) / 2;
    const beam = box(.12, beamH, sideBeamLen, mat.post, bx, roofUnderAt(cz) - (beamH / 2) / cosA, cz);
    beam.rotation.x = a;
  });

  /* --- Столбы: верх строго под балкой, капитель между столбом и балкой --- */
  const postPositions = [
    [xL + .12, innerPostZ], [xR - .12, innerPostZ],
    [xL + .12, outerPostZ], [xR - .12, outerPostZ],
    [-gapW / 2 - .06, outerPostZ], [gapW / 2 + .06, outerPostZ],
  ];
  const postTopByIndex = [];
  postPositions.forEach(([px, pz], idx) => {
    const beamBottom = beamBottomAt(pz);
    const postTop = beamBottom - S.capH;
    const h = Math.max(1.2, postTop - deckTop);
    postTopByIndex[idx] = deckTop + h;
    box(S.post, h, S.post, mat.post, px, deckTop + h / 2, pz);
    box(S.post * 1.5, .09, S.post * 1.5, mat.trim, px, deckTop + .045, pz);
    if (L.style === 'classic' || L.style === 'chalet') {
      const cap = shadowed(new THREE.Mesh(new THREE.ConeGeometry(S.post * .85, S.capH, 4), mat.trim));
      cap.position.set(px, postTop + S.capH / 2, pz);
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
    } else {
      box(S.post * 1.3, S.capH, S.post * 1.3, mat.metal, px, postTop + S.capH / 2, pz);
    }
  });
  const outerPostTop = postTopByIndex[2];

  /* --- Перила / стекло --- */
  function railRun(x1, z1, x2, z2, height, isGlazedPanel) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < .2) return;
    const rg = new THREE.Group();
    rg.position.set((x1 + x2) / 2, deckTop, (z1 + z2) / 2);
    rg.rotation.y = -Math.atan2(dz, dx);
    g.add(rg);
    const rbox = (bw, bh, bd, m, x, y, z, cast = true) => {
      const mm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m), cast);
      mm.position.set(x, y, z); rg.add(mm); return mm;
    };

    if (isGlazedPanel || L.style === 'glass') {
      const gh = height - (isGlazedPanel ? .12 : .18);
      const panel = rbox(len - .12, gh, .025, mat.glass, 0, .1 + gh / 2, 0, false);
      panel.renderOrder = 2;
      rbox(len, .06, .07, mat.metal, 0, height, 0);
      rbox(len, .05, .06, mat.metal, 0, .08, 0);
      if (isGlazedPanel) {
        const mull = Math.max(1, Math.round(len / 1.1));
        for (let i = 1; i < mull; i++) rbox(.045, gh, .05, mat.metal, -len / 2 + (len / mull) * i, .1 + gh / 2, 0);
        if (L.style === 'classic') {
          rbox(len - .1, .04, .04, mat.trim, 0, .1 + gh * .5, 0);
          rbox(len - .1, .04, .04, mat.trim, 0, .1 + gh * .75, 0);
        }
      }
      return;
    }

    rbox(len, .09, .12, mat.rail, 0, height, 0);
    rbox(len, .07, .1, mat.rail, 0, .12, 0);
    if (L.style === 'classic') {
      const n = Math.max(2, Math.floor(len / .14));
      const bal = new THREE.CylinderGeometry(.026, .032, height - .22, 8);
      for (let i = 0; i <= n; i++) {
        const b = shadowed(new THREE.Mesh(bal, mat.rail));
        b.position.set(-len / 2 + (len / n) * i, .12 + (height - .22) / 2, 0);
        rg.add(b);
        const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 8), mat.rail));
        knob.position.set(b.position.x, .12 + (height - .22) * .55, 0);
        rg.add(knob);
      }
    } else if (L.style === 'modern') {
      const cable = new THREE.CylinderGeometry(.011, .011, len - .06, 6);
      cable.rotateZ(Math.PI / 2);
      for (let i = 0; i < 5; i++) {
        const c = shadowed(new THREE.Mesh(cable, mat.metal));
        c.position.set(0, .2 + i * (height - .32) / 4, 0);
        rg.add(c);
      }
      rbox(len - .08, .025, .03, mat.led, 0, height - .07, .05, false);
    } else if (L.style === 'chalet') {
      const bays = Math.max(1, Math.round(len / 1.2));
      const bayW = len / bays;
      const diagLen = Math.hypot(bayW - .1, height - .34);
      const diagAng = Math.atan2(height - .34, bayW - .1);
      for (let i = 0; i < bays; i++) {
        const cx = -len / 2 + bayW * (i + .5);
        [diagAng, -diagAng].forEach(ang => {
          const dmesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(diagLen, .07, .06), mat.rail));
          dmesh.position.set(cx, .12 + (height - .22) / 2, 0);
          dmesh.rotation.z = ang;
          rg.add(dmesh);
        });
      }
    }
  }

  // Боковое остекление с наклонным верхом (точно под балкой)
  function glazedSidePanel(x) {
    const zA = zIn + sign * .16, zB = outerZ - sign * .16;
    const yBot = deckTop + .1;
    const topA = beamBottomAt(zA) - .04, topB = beamBottomAt(zB) - .04;
    const shape = new THREE.Shape();
    shape.moveTo(zA, yBot);
    shape.lineTo(zB, yBot);
    shape.lineTo(zB, topB);
    shape.lineTo(zA, topA);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2);
    const panel = new THREE.Mesh(geo, mat.glass);
    panel.position.x = x + .0125;
    panel.renderOrder = 2;
    g.add(panel);
    // наклонная верхняя рейка
    const cz = (zA + zB) / 2;
    const len = Math.hypot(zB - zA, topB - topA);
    const topRail = box(.07, .06, len, mat.metal, x, (topA + topB) / 2, cz);
    topRail.rotation.x = a;
    box(.07, .05, Math.abs(zB - zA), mat.metal, x, yBot - .02, cz);
    // муллионы
    [0.33, 0.66].forEach(t => {
      const mz = zA + (zB - zA) * t;
      const mh = beamBottomAt(mz) - .08 - yBot;
      box(.045, mh, .05, mat.metal, x, yBot + mh / 2, mz);
    });
  }

  const outerGlazedH = beamBottomAt(outerPostZ) - deckTop - .02;
  if (glazed) {
    glazedSidePanel(xL + .06);
    glazedSidePanel(xR - .06);
    railRun(xL + .06, outerPostZ, -gapW / 2 - .02, outerPostZ, outerGlazedH, true);
    railRun(gapW / 2 + .02, outerPostZ, xR - .06, outerPostZ, outerGlazedH, true);
    box(gapW + .2, .12, .1, mat.trim, 0, beamBottomAt(outerPostZ) - .06, outerPostZ);
  } else {
    railRun(xL + .06, zIn + sign * .1, xL + .06, outerZ - sign * .1, railH, false);
    railRun(xR - .06, zIn + sign * .1, xR - .06, outerZ - sign * .1, railH, false);
    railRun(xL + .06, outerPostZ, -gapW / 2 - .02, outerPostZ, railH, false);
    railRun(gapW / 2 + .02, outerPostZ, xR - .06, outerPostZ, railH, false);
  }

  /* --- Кровельный пирог --- */
  const roof = box(w + .55, roofThick, roofDepth, mat.roof, 0, roofY, zC);
  roof.rotation.x = a;
  const ribs = Math.floor((w + .4) / .45);
  for (let i = 0; i <= ribs; i++) {
    const rib = box(.03, .035, roofDepth - .05, mat.metal, xL - .2 + ((w + .4) / ribs) * i, roofY + .065, zC, false);
    rib.rotation.x = a;
  }
  const rafters = Math.max(3, Math.round(w / .9));
  for (let i = 0; i <= rafters; i++) {
    const r = box(.08, .14, roofDepth - .15, mat.post, xL + (w / rafters) * i, roofY - .11, zC);
    r.rotation.x = a;
  }
  const fasciaZ = outerZ + sign * .32;
  const fasciaY = roofUnderAt(fasciaZ) - .08;
  box(w + .55, .22, .08, mat.trim, 0, fasciaY, fasciaZ);
  const gutter = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, w + .55, 10), mat.metal));
  gutter.rotation.z = Math.PI / 2;
  gutter.position.set(0, fasciaY - .14, fasciaZ + sign * .05);
  g.add(gutter);

  // Подкосы от наружных столбов к балке
  if (L.style === 'chalet' || L.style === 'classic') {
    [[xL + .12, outerPostZ], [xR - .12, outerPostZ]].forEach(([bx, bz]) => {
      const brace = box(.09, .7, .09, mat.post, bx, outerPostTop - .3, bz - sign * .28);
      brace.rotation.x = sign * .72;
    });
  }

  /* --- Лестница --- */
  const stepW = gapW - .1, rise = .15, tread = .3;
  for (let i = 1; i <= 3; i++) {
    const top = deckTop - (i - 1) * rise;
    const z = outerZ + sign * (i * tread - tread / 2);
    box(stepW, rise, tread, mat.deck, 0, top - rise / 2, z);
    box(.08, rise + .04, tread * 3, mat.post, -stepW / 2 - .04, deckTop - .22, outerZ + sign * tread * 1.5);
    box(.08, rise + .04, tread * 3, mat.post, stepW / 2 + .04, deckTop - .22, outerZ + sign * tread * 1.5);
  }

  /* --- Свет и зелень (всё ниже балок) --- */
  if (S.lanterns) {
    [[xL + .45, outerZ - sign * .4], [xR - .45, outerZ - sign * .4]].forEach(([lx, lz]) => {
      const anchor = beamBottomAt(lz) - .02;
      const chain = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .3, 6), mat.metal));
      chain.position.set(lx, anchor - .15, lz);
      g.add(chain);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 12),
        new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: '#ffb45e', emissiveIntensity: 2.2 }));
      bulb.position.set(lx, anchor - .38, lz);
      g.add(bulb);
      const pl = new THREE.PointLight(0xffc98a, .8, 5.5, 2);
      pl.position.copy(bulb.position);
      g.add(pl);
    });
  } else {
    const pl = new THREE.PointLight(0xffd9a0, .55, 6, 2);
    pl.position.set(0, beamBottomAt(zPos) - .3, zPos);
    g.add(pl);
  }
  if (S.planters) {
    [[xL + .55, outerZ - sign * .45], [xR - .55, outerZ - sign * .45]].forEach(([px, pz]) => {
      box(.5, .38, .42, mat.post, px, deckTop + .19, pz);
      box(.44, .05, .36, mat.soil, px, deckTop + .38, pz);
      for (let i = 0; i < 3; i++) {
        const s = shadowed(new THREE.Mesh(new THREE.SphereGeometry(.16 - i * .02, 10, 10), mat.leaf));
        s.position.set(px + (i - 1) * .11, deckTop + .5 + (i % 2) * .07, pz + (i - 1) * .05);
        g.add(s);
      }
    });
  }

  return g;
}