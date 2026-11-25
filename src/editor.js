import * as THREE from 'three';
import { createStairMesh } from './builder.js';
import {
  screenToWorld, getWorldPerPixel, planZoomAt, planPanByPixels,
  fitPlanView, getPlanCamera, getPlanZoom,
} from './scene.js';
import './editor-ui.css';
import { computeStair, stairFitsHouse, stairOverlapsAny, stairWorldPoly } from './stairs.js';

const BASE = 0.6;
const OK = 0x4ade80, BAD = 0xf87171, ACC = 0xe8a34c;

const TOOL_NAMES = {
  wall: 'Стена', fence: 'Забор', room: 'Комната', door: 'Дверь', window: 'Окно',
  light: 'Свет', stairs: 'Лестница', column: 'Столб', delete: 'Удалить',
};
const TOOL_BTN = {
  wall: 'tool-wall', fence: 'tool-fence', room: 'tool-room', door: 'tool-door',
  window: 'tool-window', light: 'tool-light', stairs: 'tool-stairs',
  column: 'tool-column', delete: 'tool-delete',
};

let scene, params, onChange;
let helpers, gridGroup, lotLine, floorTint;
let wallGhost, roomGhosts = [], openingGhost, highlight, cursorMark, cursorFoot, pointerDot;
let columnGhost, lightGhost, stairGhost, handleA, handleB, guideX, guideZ;
let stairKey = '', gridKey = '';
const undoStack = [];

const S = {
  tool: 'wall',
  anchor: null, dragStart: null, dragging: false,
  press: { x: 0, y: 0 },
  raw: new THREE.Vector3(), cursor: new THREE.Vector3(),
  snapKind: 'grid',
  roomStart: null, pending: null, hover: null,
  shift: false, space: false,
  pan: false, panLast: { x: 0, y: 0 },
  overCanvas: false,
  opts: { grid: true, snap: .5, angle: true, guides: true, alpha: .3, labels: true, roomDoor: true },
};

const ui = {};
const floorY = () => BASE + (params.currentFloor - 1) * params.wallHeight;
const ghostY = () => floorY() + .16;
const beamW = () => Number(params.beamWidth || 150) / 1000;
const toast = (m) => window.showToast?.(m);

/* ---------- геометрия ---------- */
function segInfo(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const L = Math.hypot(dx, dz);
  if (L < 1e-6) return { t: 0, d: Math.hypot(px - x1, pz - z1), L: 0 };
  const t = ((px - x1) * dx + (pz - z1) * dz) / L;
  const tc = Math.max(0, Math.min(L, t));
  return { t, d: Math.hypot(px - (x1 + dx / L * tc), pz - (z1 + dz / L * tc)), L };
}

function collinearOverlap(a, b, w) {
  const i1 = segInfo(a.x, a.z, w.x1, w.z1, w.x2, w.z2);
  const i2 = segInfo(b.x, b.z, w.x1, w.z1, w.x2, w.z2);
  if (i1.d > .07 || i2.d > .07) return false;
  const lo = Math.min(i1.t, i2.t), hi = Math.max(i1.t, i2.t);
  return Math.min(hi, i1.L) - Math.max(lo, 0) > .25;
}

/* ---------- призрак стены ---------- */
function makeWallGhost() {
  const g = new THREE.Group();
  const footMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: .95, depthTest: false, depthWrite: false });
  const volMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: .3, depthWrite: false });
  const lineMat = new THREE.LineBasicMaterial({ color: OK, transparent: true, opacity: .95, depthTest: false });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const foot = new THREE.Mesh(unit, footMat);
  const vol = new THREE.Mesh(unit, volMat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(unit), lineMat);
  foot.renderOrder = 900; vol.renderOrder = 901; edges.renderOrder = 902;
  g.add(foot, vol, edges);
  g.userData = { foot, vol, edges, footMat, volMat, lineMat };
  g.visible = false;
  helpers.add(g);
  return g;
}

function setWallGhost(g, a, b, height, thick, ok, alpha = S.opts.alpha) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < .005) { g.visible = false; return; }
  g.visible = true;
  g.position.set((a.x + b.x) / 2, ghostY(), (a.z + b.z) / 2);
  g.rotation.y = -Math.atan2(dz, dx);
  const h = Math.max(.06, height * .55);
  const { foot, vol, edges, footMat, volMat, lineMat } = g.userData;
  foot.scale.set(len, .03, thick); foot.position.set(0, .015, 0);
  vol.scale.set(len, h, thick); vol.position.set(0, h / 2, 0);
  edges.scale.set(len, h, thick); edges.position.set(0, h / 2, 0);
  const c = ok ? OK : BAD;
  footMat.color.setHex(c); volMat.color.setHex(c); lineMat.color.setHex(c);
  volMat.opacity = alpha;
}

function disposeTree(obj) {
  obj.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
  });
}

/* ---------- сетка ---------- */
function rebuildGrid() {
  const key = `${params.width}|${params.length}|${S.opts.snap}|${params.currentFloor}`;
  if (key === gridKey) {
    gridGroup.position.y = floorY() + .14;
    floorTint.position.y = floorY() + .12;
    lotLine.position.y = floorY() + .15;
    return;
  }
  gridKey = key;
  disposeTree(gridGroup);
  helpers.remove(gridGroup);
  gridGroup = new THREE.Group();
  helpers.add(gridGroup);

  const hx = params.width / 2, hz = params.length / 2, ext = 4;
  const x0 = -hx - ext, x1 = hx + ext, z0 = -hz - ext, z1 = hz + ext;
  const step = S.opts.snap > 0 ? S.opts.snap : .5;
  const minor = [], major = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1 + 1e-6; x += step) {
    (Math.abs(x % 1) < 1e-6 ? major : minor).push(x, 0, z0, x, 0, z1);
  }
  for (let z = Math.ceil(z0 / step) * step; z <= z1 + 1e-6; z += step) {
    (Math.abs(z % 1) < 1e-6 ? major : minor).push(x0, 0, z, x1, 0, z);
  }
  const mk = (arr, color, opacity) => {
    if (!arr.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    gridGroup.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  };
  mk(minor, 0x4c6355, .32);
  mk(major, 0x86a68f, .55);
  gridGroup.position.y = floorY() + .14;
  gridGroup.visible = S.opts.grid;

  const lotGeo = new THREE.BufferGeometry();
  lotGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz,
  ], 3));
  lotLine.geometry.dispose();
  lotLine.geometry = lotGeo;
  lotLine.position.y = floorY() + .15;

  floorTint.scale.set(params.width, params.length, 1);
  floorTint.position.y = floorY() + .12;
}

/* ---------- привязка ---------- */
function magnetPoints() {
  const pts = [];
  const f = params.currentFloor;
  (params.interiorWalls || []).forEach(w => {
    if (w.floor !== f) return;
    pts.push({ x: w.x1, z: w.z1 }, { x: w.x2, z: w.z2 });
  });
  const hx = params.width / 2, hz = params.length / 2;
  pts.push({ x: -hx, z: -hz }, { x: hx, z: -hz }, { x: hx, z: hz }, { x: -hx, z: hz });
  pts.push({ x: 0, z: -hz }, { x: 0, z: hz }, { x: -hx, z: 0 }, { x: hx, z: 0 });
  return pts;
}

function computeCursor(cx, cy) {
  // Точный луч камеры по реальному rect канваса — расхождения с курсором нет ни на каком зуме
  screenToWorld(cx, cy, floorY(), S.raw);
  const p = S.raw.clone();
  const anchor = S.dragStart || S.anchor || S.roomStart;
  const snap = S.opts.snap;
  S.snapKind = snap > 0 ? 'grid' : 'free';

  // радиус магнита в экранных пикселях — одинаковое ощущение на любом масштабе
  const magR = Math.max(.06, Math.min(.7, 13 * getWorldPerPixel()));
  let best = null, bestD = magR;
  for (const m of magnetPoints()) {
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d < bestD) { bestD = d; best = m; }
  }

  if (best) {
    p.x = best.x; p.z = best.z; S.snapKind = 'endpoint';
  } else if (anchor && S.opts.angle && !S.shift) {
    const dx = p.x - anchor.x, dz = p.z - anchor.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) {
      const stepA = Math.PI / 4;
      const ang = Math.round(Math.atan2(dz, dx) / stepA) * stepA;
      let L = len;
      if (snap > 0) { L = Math.round(len / snap) * snap; if (L < snap) L = snap; }
      p.x = anchor.x + Math.cos(ang) * L;
      p.z = anchor.z + Math.sin(ang) * L;
      S.snapKind = 'angle';
    }
  } else if (snap > 0) {
    p.x = Math.round(p.x / snap) * snap;
    p.z = Math.round(p.z / snap) * snap;
  }
  p.x = Math.round(p.x * 1000) / 1000;
  p.z = Math.round(p.z * 1000) / 1000;
  S.cursor.copy(p);
}

function insideLot(p, tol = .02) {
  return Math.abs(p.x) <= params.width / 2 + tol && Math.abs(p.z) <= params.length / 2 + tol;
}

/* ---------- выбор объекта (аналитика 2D) ---------- */
function pickAt(p) {
  const f = params.currentFloor;
  const bw = beamW();
  const tol = bw / 2 + .16;

  for (const l of (params.customLights || [])) {
    if (l.floor === f && Math.hypot(l.x - p.x, l.z - p.z) < .42) return { kind: 'light', ref: l };
  }
  for (const s of (params.stairs || [])) {
    if (s.floor !== f) continue;
    const run = Math.max(1, Math.floor(params.wallHeight / .18)) * .28;
    const dx = p.x - s.x, dz = p.z - s.z;
    const c = Math.cos(-(s.angle || 0)), sn = Math.sin(-(s.angle || 0));
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    if (Math.abs(lx) < .62 && lz > -.2 && lz < run + .2) return { kind: 'stair', ref: s, run };
  }
  for (const col of (params.columns || [])) {
    if (col.floor === f && Math.hypot(col.x - p.x, col.z - p.z) < bw * .95) return { kind: 'column', ref: col };
  }
  for (const w of (params.interiorWalls || [])) {
    if (w.floor !== f) continue;
    const i = segInfo(p.x, p.z, w.x1, w.z1, w.x2, w.z2);
    if (i.d < tol + .12) {
      for (const op of (w.openings || [])) {
        if (i.t > op.offset - .06 && i.t < op.offset + op.width + .06) return { kind: 'intOpening', wall: w, op };
      }
    }
  }
  const hx = params.width / 2, hz = params.length / 2;
  const edges = [
    { name: 'front', x1: -hx, z1: hz, x2: hx, z2: hz, axis: 'x' },
    { name: 'back', x1: -hx, z1: -hz, x2: hx, z2: -hz, axis: 'x' },
    { name: 'left', x1: -hx, z1: -hz, x2: -hx, z2: hz, axis: 'z' },
    { name: 'right', x1: hx, z1: -hz, x2: hx, z2: hz, axis: 'z' },
  ];
  for (const op of (params.exteriorOpenings || [])) {
    if (op.floor !== f) continue;
    const e = edges.find(v => v.name === op.wall);
    if (!e) continue;
    const i = segInfo(p.x, p.z, e.x1, e.z1, e.x2, e.z2);
    const along = e.axis === 'x' ? p.x : p.z;
    if (i.d < tol + .14 && Math.abs(along - op.x) < op.width / 2 + .06) return { kind: 'extOpening', op, edge: e };
  }
  let bestWall = null, bestD = tol;
  for (const w of (params.interiorWalls || [])) {
    if (w.floor !== f) continue;
    const i = segInfo(p.x, p.z, w.x1, w.z1, w.x2, w.z2);
    if (i.d < bestD && i.t > -.15 && i.t < i.L + .15) { bestD = i.d; bestWall = { kind: 'intWall', ref: w, t: i.t, L: i.L }; }
  }
  if (bestWall) return bestWall;

  let bestEdge = null; bestD = tol;
  for (const e of edges) {
    const i = segInfo(p.x, p.z, e.x1, e.z1, e.x2, e.z2);
    const along = e.axis === 'x' ? p.x : p.z;
    const half = e.axis === 'x' ? hx : hz;
    if (i.d < bestD && Math.abs(along) <= half + .25) { bestD = i.d; bestEdge = { kind: 'extWall', edge: e, along }; }
  }
  return bestEdge;
}

/* ---------- проверки ---------- */
function wallCheck(a, b) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < .45) return { ok: false, reason: 'Минимум 0.5 м' };
  if (!insideLot(a) || !insideLot(b)) return { ok: false, reason: 'За пределами дома' };
  for (const w of (params.interiorWalls || [])) {
    if (w.floor !== params.currentFloor) continue;
    if (collinearOverlap(a, b, w)) return { ok: false, reason: 'Здесь уже есть стена' };
  }
  return { ok: true, reason: '' };
}

function openingDims() {
  if (S.tool === 'door') return { width: params.doorType === 'double' ? 1.6 : .9, height: 2.05, sill: 0, type: 'door' };
  if (params.windowType === 'small') return { width: 1.1, height: 1.3, sill: .8, type: 'window' };
  if (params.windowType === 'panoramic') return { width: 2, height: 1.8, sill: .5, type: 'window' };
  return { width: 1.4, height: 1.6, sill: .8, type: 'window' };
}

function stairFits(p) {
  return stairFitsHouse(params, { x: p.x, z: p.z, floor: params.currentFloor, angle: params.stairAngle || 0 });
}

/* ---------- отмена ---------- */
function snapshot() {
  return JSON.stringify({
    interiorWalls: params.interiorWalls || [],
    exteriorOpenings: params.exteriorOpenings || [],
    deletedExteriorWalls: params.deletedExteriorWalls || [],
    stairs: params.stairs || [],
    columns: params.columns || [],
    customLights: params.customLights || [],
    windows: params.windows,
  });
}
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 40) undoStack.shift();
  if (ui.undo) ui.undo.disabled = false;
}
function undo() {
  const s = undoStack.pop();
  if (!s) { toast('Отменять нечего'); return; }
  Object.assign(params, JSON.parse(s));
  const sel = document.getElementById('windows');
  if (sel) sel.value = params.windows;
  S.anchor = null; S.roomStart = null;
  onChange();
  if (ui.undo) ui.undo.disabled = undoStack.length === 0;
  toast('Действие отменено');
}

/* ---------- действия ---------- */
function commitWall(a, b, isFence) {
  const chk = wallCheck(a, b);
  if (!chk.ok) { toast(chk.reason); return false; }
  pushUndo();
  params.interiorWalls.push({
    x1: a.x, z1: a.z, x2: b.x, z2: b.z,
    floor: params.currentFloor, isFence: !!isFence, openings: [],
  });
  onChange();
  return true;
}

function commitRoom(a, b) {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
  const z1 = Math.min(a.z, b.z), z2 = Math.max(a.z, b.z);
  const w = x2 - x1, d = z2 - z1;
  if (w < 1 || d < 1) { toast('Комната минимум 1 × 1 м'); return false; }
  if (!insideLot({ x: x1, z: z1 }) || !insideLot({ x: x2, z: z2 })) { toast('Комната выходит за пределы дома'); return false; }
  pushUndo();
  const corners = [
    [{ x: x1, z: z1 }, { x: x2, z: z1 }],
    [{ x: x2, z: z1 }, { x: x2, z: z2 }],
    [{ x: x2, z: z2 }, { x: x1, z: z2 }],
    [{ x: x1, z: z2 }, { x: x1, z: z1 }],
  ];
  let added = 0;
  corners.forEach(([p, q], idx) => {
    if (!wallCheck(p, q).ok) return;
    const wall = { x1: p.x, z1: p.z, x2: q.x, z2: q.z, floor: params.currentFloor, isFence: false, openings: [] };
    if (S.opts.roomDoor && idx === 2 && w >= 1.8) {
      wall.openings.push({ type: 'door', offset: w / 2 - .45, width: .9, sillHeight: 0, height: 2.05 });
    }
    params.interiorWalls.push(wall);
    added++;
  });
  if (!added) { undoStack.pop(); toast('Здесь уже есть стены'); return false; }
  onChange();
  toast(`Комната ${w.toFixed(1)} × ${d.toFixed(1)} м готова`);
  return true;
}

function markCustom() {
  params.windows = 'custom';
  const sel = document.getElementById('windows');
  if (sel) sel.value = 'custom';
}

function commitOpening() {
  const p = S.pending;
  if (!p || !p.ok) { toast(p?.reason || 'Наведите на стену'); return; }
  pushUndo();
  if (p.target === 'interior') {
    p.wall.openings = p.wall.openings || [];
    p.wall.openings.push({ type: p.dims.type, offset: p.offset, width: p.dims.width, sillHeight: p.dims.sill, height: p.dims.height });
    p.wall.openings.sort((a, b) => a.offset - b.offset);
  } else {
    params.exteriorOpenings = params.exteriorOpenings || [];
    params.exteriorOpenings.push({
      wall: p.edge.name, floor: params.currentFloor, x: p.along,
      width: p.dims.width, height: p.dims.height, sillHeight: p.dims.sill, type: p.dims.type,
    });
    markCustom();
  }
  onChange();
  toast(p.dims.type === 'door' ? 'Дверь установлена — клик по ней в 3D открывает' : 'Окно установлено');
}

function doDelete() {
  const h = S.hover;
  if (!h) { toast('Наведите на объект'); return; }
  pushUndo();
  let done = true;
  if (h.kind === 'light') params.customLights.splice(params.customLights.indexOf(h.ref), 1);
  else if (h.kind === 'stair') params.stairs.splice(params.stairs.indexOf(h.ref), 1);
  else if (h.kind === 'column') params.columns.splice(params.columns.indexOf(h.ref), 1);
  else if (h.kind === 'intOpening') h.wall.openings.splice(h.wall.openings.indexOf(h.op), 1);
  else if (h.kind === 'extOpening') { params.exteriorOpenings.splice(params.exteriorOpenings.indexOf(h.op), 1); markCustom(); }
  else if (h.kind === 'intWall') params.interiorWalls.splice(params.interiorWalls.indexOf(h.ref), 1);
  else if (h.kind === 'extWall') {
    const along = Math.round(h.along * 10) / 10;
    params.deletedExteriorWalls = params.deletedExteriorWalls || [];
    params.deletedExteriorWalls.push({ wall: h.edge.name, floor: params.currentFloor, x: along, width: 2 });
    params.exteriorOpenings = (params.exteriorOpenings || []).filter(op => {
      if (op.wall !== h.edge.name || op.floor !== params.currentFloor) return true;
      return !(along - 1 < op.x + op.width / 2 && along + 1 > op.x - op.width / 2);
    });
    markCustom();
    toast('Снесено 2 м стены — проход под свесом крыши');
  } else done = false;
  if (!done) { undoStack.pop(); return; }
  onChange();
}

/* ---------- отрисовка помощников ---------- */
function hideGhosts() {
  wallGhost.visible = false;
  roomGhosts.forEach(g => (g.visible = false));
  openingGhost.visible = false;
  highlight.visible = false;
  columnGhost.visible = false;
  lightGhost.visible = false;
  cursorMark.visible = false;
  cursorFoot.visible = false;
  pointerDot.visible = false;
  handleA.visible = handleB.visible = false;
  guideX.visible = guideZ.visible = false;
  if (stairGhost) stairGhost.visible = false;
  ui.label.style.display = 'none';
}

function showLabel(world, text, cls = '') {
  if (!S.opts.labels || !text) { ui.label.style.display = 'none'; return; }
  const v = new THREE.Vector3(world.x, ghostY() + .4, world.z).project(getPlanCamera());
  ui.label.style.left = `${(v.x * .5 + .5) * window.innerWidth}px`;
  ui.label.style.top = `${(-v.y * .5 + .5) * window.innerHeight}px`;
  ui.label.textContent = text;
  ui.label.className = cls;
  ui.label.style.display = 'block';
}

function setHud(metric, hint, bad = false) {
  ui.metric.textContent = metric || '';
  ui.metric.className = 'ed-metric' + (bad ? ' bad' : '');
  ui.hint.innerHTML = hint || '';
}

function refreshStairGhost() {
  const key = [params.wallHeight, params.currentFloor, params.stairAngle, params.beamWidth,
    params.stairType, params.stairWidth, params.stairStringer, params.stairRisers,
    params.stairRail, params.stairTurn].join('|');
  if (key === stairKey && stairGhost) return;
  stairKey = key;
  if (stairGhost) { helpers.remove(stairGhost); disposeTree(stairGhost); }
  stairGhost = createStairMesh(params, { x: 0, z: 0, floor: params.currentFloor, angle: params.stairAngle || 0 }, true);
  stairGhost.visible = false;
  helpers.add(stairGhost);
}

function tintStair(ok) {
  if (!stairGhost) return;
  stairGhost.traverse(c => {
    if (c.material && c.material.color) {
      c.material.color.setHex(ok ? OK : BAD);
      c.material.opacity = ok ? .55 : .4;
    }
  });
}

function updateGhosts() {
  hideGhosts();
  if (ui.zoom) ui.zoom.textContent = `${Math.round(getPlanZoom() * 100)}%`;
  if (!params.editMode || !S.overCanvas) { setHud('', 'Наведите курсор на план'); return; }

  const p = S.cursor;
  const bw = beamW();
  const H = params.wallHeight;
  const tool = S.tool;
  const wpp = getWorldPerPixel();

  // истинная позиция указателя — всегда видна, привязка читается явно
  pointerDot.visible = true;
  pointerDot.position.set(S.raw.x, ghostY() + .03, S.raw.z);
  const dotR = 3.2 * wpp;
  pointerDot.scale.set(dotR, dotR, dotR);

  cursorMark.visible = true;
  cursorMark.position.set(p.x, ghostY() + .02, p.z);
  cursorMark.material.color.setHex(S.snapKind === 'endpoint' ? OK : ACC);
  const markR = Math.max(.12, 11 * wpp) / .22;
  cursorMark.userData.baseScale = markR;
  cursorFoot.visible = true;
  cursorFoot.position.set(p.x, ghostY() + .01, p.z);
  cursorFoot.scale.set(bw, .02, bw);

  if (S.opts.guides) {
    guideX.visible = guideZ.visible = true;
    const gx = guideX.geometry.attributes.position;
    gx.setXYZ(0, -60, 0, p.z); gx.setXYZ(1, 60, 0, p.z); gx.needsUpdate = true;
    const gz = guideZ.geometry.attributes.position;
    gz.setXYZ(0, p.x, 0, -60); gz.setXYZ(1, p.x, 0, 60); gz.needsUpdate = true;
    guideX.position.y = guideZ.position.y = ghostY() - .02;
  }

  const snapTxt = S.snapKind === 'endpoint' ? 'к углу'
    : S.snapKind === 'angle' ? 'угол 45°'
    : S.opts.snap > 0 ? `сетка ${S.opts.snap} м` : 'без привязки';

  if (tool === 'wall' || tool === 'fence') {
    const a = S.dragStart || S.anchor;
    if (a) {
      const chk = wallCheck(a, p);
      setWallGhost(wallGhost, a, p, H, bw, chk.ok);
      handleA.visible = handleB.visible = true;
      const hr = Math.max(.06, 6 * wpp) / .11;
      handleA.scale.setScalar(hr); handleB.scale.setScalar(hr);
      handleA.position.set(a.x, ghostY() + .05, a.z);
      handleB.position.set(p.x, ghostY() + .05, p.z);
      const len = Math.hypot(p.x - a.x, p.z - a.z);
      const ang = ((Math.atan2(p.z - a.z, p.x - a.x) * 180 / Math.PI) + 360) % 360;
      showLabel({ x: (a.x + p.x) / 2, z: (a.z + p.z) / 2 },
        chk.ok ? `${len.toFixed(2)} м · ${Math.round(ang)}°` : chk.reason, chk.ok ? '' : 'bad');
      setHud(`${len.toFixed(2)} м`, chk.ok
        ? 'Клик — поставить и продолжить · <b>Shift</b> свободный угол · <b>Esc</b> завершить'
        : chk.reason, !chk.ok);
    } else {
      setHud('', `Клик — начало стены · тяните — одна стена · ${snapTxt} · колесо — зум`);
    }
    return;
  }

  if (tool === 'room') {
    if (S.roomStart) {
      const a = S.roomStart;
      const x1 = Math.min(a.x, p.x), x2 = Math.max(a.x, p.x);
      const z1 = Math.min(a.z, p.z), z2 = Math.max(a.z, p.z);
      const c = [{ x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 }];
      const ok = (x2 - x1) >= 1 && (z2 - z1) >= 1 && insideLot(c[0]) && insideLot(c[2]);
      for (let i = 0; i < 4; i++) setWallGhost(roomGhosts[i], c[i], c[(i + 1) % 4], H, bw, ok);
      showLabel({ x: (x1 + x2) / 2, z: (z1 + z2) / 2 },
        ok ? `${(x2 - x1).toFixed(1)} × ${(z2 - z1).toFixed(1)} м · ${((x2 - x1) * (z2 - z1)).toFixed(1)} м²` : 'Минимум 1 × 1 м',
        ok ? '' : 'bad');
      setHud(`${((x2 - x1) * (z2 - z1)).toFixed(1)} м²`, ok ? 'Отпустите — 4 стены сразу' : 'Растяните комнату', !ok);
    } else {
      setHud('', 'Зажмите и растяните прямоугольник — 4 стены одним движением');
    }
    return;
  }

  if (tool === 'door' || tool === 'window') {
    const dims = openingDims();
    const hit = pickAt(p);
    S.pending = null;
    if (hit && hit.kind === 'intWall') {
      const w = hit.ref;
      if (w.isFence) { setHud('', 'В заборе проём не нужен', true); showLabel(p, 'Забор — без проёмов', 'bad'); return; }
      const L = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      if (L < dims.width + .2) { showLabel(p, 'Стена короче проёма', 'bad'); setHud('', 'Стена слишком короткая', true); return; }
      const offset = Math.max(.1, Math.min(hit.t - dims.width / 2, L - dims.width - .1));
      const overlap = (w.openings || []).some(op => offset < op.offset + op.width && offset + dims.width > op.offset);
      const ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L;
      const a = { x: w.x1 + ux * offset, z: w.z1 + uz * offset };
      const b = { x: w.x1 + ux * (offset + dims.width), z: w.z1 + uz * (offset + dims.width) };
      setWallGhost(openingGhost, a, b, dims.height, bw + .1, !overlap, .42);
      S.pending = { target: 'interior', wall: w, offset, dims, ok: !overlap, reason: 'Здесь уже есть проём' };
      showLabel({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
        overlap ? 'Занято' : `${dims.width.toFixed(2)} × ${dims.height.toFixed(2)} м`, overlap ? 'bad' : '');
      setHud(`${dims.width.toFixed(2)} м`, overlap ? 'Сдвиньте вдоль стены' : 'Клик — поставить проём', overlap);
    } else if (hit && hit.kind === 'extWall') {
      const e = hit.edge;
      const half = e.axis === 'x' ? params.width / 2 : params.length / 2;
      if (half * 2 < dims.width + .2) { showLabel(p, 'Фасад короче проёма', 'bad'); return; }
      let along = Math.round(hit.along * 10) / 10;
      along = Math.max(-half + dims.width / 2 + .1, Math.min(half - dims.width / 2 - .1, along));
      const overlap = (params.exteriorOpenings || []).some(op =>
        op.wall === e.name && op.floor === params.currentFloor &&
        along - dims.width / 2 < op.x + op.width / 2 && along + dims.width / 2 > op.x - op.width / 2);
      const a = e.axis === 'x' ? { x: along - dims.width / 2, z: e.z1 } : { x: e.x1, z: along - dims.width / 2 };
      const b = e.axis === 'x' ? { x: along + dims.width / 2, z: e.z1 } : { x: e.x1, z: along + dims.width / 2 };
      setWallGhost(openingGhost, a, b, dims.height, bw + .12, !overlap, .42);
      S.pending = { target: 'exterior', edge: e, along, dims, ok: !overlap, reason: 'Здесь уже есть проём' };
      showLabel({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
        overlap ? 'Занято' : `${dims.width.toFixed(2)} × ${dims.height.toFixed(2)} м`, overlap ? 'bad' : '');
      setHud(`${dims.width.toFixed(2)} м`, overlap ? 'Сдвиньте вдоль фасада' : 'Клик — поставить на фасад', overlap);
    } else {
      setHud('', 'Наведите на стену — проём покажется до клика');
    }
    return;
  }

  if (tool === 'stairs') {
    refreshStairGhost();
    const cand = { x: p.x, z: p.z, floor: params.currentFloor, angle: params.stairAngle || 0 };
    const L = computeStair(params, cand);
    const topFloor = params.currentFloor >= params.floors;
    const fits = stairFits(p);
    const overlap = stairOverlapsAny(params, cand);
    const ok = !topFloor && fits && !overlap;
    stairGhost.visible = true;
    stairGhost.position.set(p.x, floorY(), p.z);
    stairGhost.rotation.y = -(params.stairAngle || 0);
    stairGhost.scale.x = L.mirror;
    tintStair(ok);
    const i = L.info;
    const reason = topFloor ? 'Верхний этаж — лестнице некуда вести' : !fits ? 'Не помещается в габариты' : overlap ? 'Пересекает другую лестницу' : '';
    showLabel(p, ok ? `${i.rises}×${i.riserMM} / ${i.treadMM} мм · ${i.pitchDeg}°` : reason, ok ? '' : 'bad');
    setHud(ok ? `2h+b=${i.blondelMM}` : '', ok
      ? `${i.rises} подъёмов по ${i.riserMM} мм · проступь ${i.treadMM} мм · уклон ${i.pitchDeg}° · проход 2.0 м · клик — поставить`
      : reason, !ok);
    return;
  }

  if (tool === 'column') {
    const oS = (params.overhangSides || .8) - .1;
    const oF = (params.overhangFront || .8) - .1;
    const oB = (params.overhangBack || .8) - .1;
    const cx = Math.max(-params.width / 2 - oS, Math.min(params.width / 2 + oS, p.x));
    const cz = Math.max(-params.length / 2 - oB, Math.min(params.length / 2 + oF, p.z));
    const overlap = (params.columns || []).some(c => c.floor === params.currentFloor && Math.abs(c.x - cx) < .5 && Math.abs(c.z - cz) < .5);
    columnGhost.visible = true;
    columnGhost.position.set(cx, ghostY() + H * .275, cz);
    columnGhost.scale.set(bw * 1.5, H * .55, bw * 1.5);
    columnGhost.material.color.setHex(overlap ? BAD : OK);
    columnGhost.material.opacity = S.opts.alpha + .1;
    S.pending = { x: cx, z: cz, ok: !overlap };
    showLabel({ x: cx, z: cz }, overlap ? 'Занято' : `Столб ${(bw * 1500).toFixed(0)} мм`, overlap ? 'bad' : '');
    setHud('', overlap ? 'Рядом уже есть столб' : 'Клик — поставить опору под свес', overlap);
    return;
  }

  if (tool === 'light') {
    const near = (params.customLights || []).find(l => l.floor === params.currentFloor && Math.hypot(l.x - p.x, l.z - p.z) < .8);
    lightGhost.visible = true;
    lightGhost.position.set(p.x, ghostY() + .05, p.z);
    lightGhost.material.color.setHex(near ? ACC : OK);
    const lr = Math.max(.18, 14 * wpp) / .34;
    lightGhost.scale.set(lr, lr, 1);
    showLabel(p, near ? `Яркость ${near.intensity} → следующий уровень` : 'Новый светильник', near ? 'info' : '');
    setHud(near ? `${near.intensity}` : '', near ? 'Клик — переключить яркость' : 'Клик — повесить люстру');
    return;
  }

  if (tool === 'delete') {
    const h = pickAt(p);
    S.hover = h;
    if (!h) { setHud('', 'Наведите на стену, проём, лестницу, столб или свет'); return; }
    let a, b, hh = H, th = bw * 1.7, label = '';
    if (h.kind === 'intWall') {
      a = { x: h.ref.x1, z: h.ref.z1 }; b = { x: h.ref.x2, z: h.ref.z2 };
      label = h.ref.isFence ? 'Удалить забор' : 'Удалить перегородку';
      if (h.ref.isFence) hh = 1.1;
    } else if (h.kind === 'extWall') {
      const along = Math.round(h.along * 10) / 10;
      a = h.edge.axis === 'x' ? { x: along - 1, z: h.edge.z1 } : { x: h.edge.x1, z: along - 1 };
      b = h.edge.axis === 'x' ? { x: along + 1, z: h.edge.z1 } : { x: h.edge.x1, z: along + 1 };
      label = 'Снести 2 м фасада';
    } else if (h.kind === 'intOpening') {
      const w = h.wall, L = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      const ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L;
      a = { x: w.x1 + ux * h.op.offset, z: w.z1 + uz * h.op.offset };
      b = { x: w.x1 + ux * (h.op.offset + h.op.width), z: w.z1 + uz * (h.op.offset + h.op.width) };
      hh = h.op.height; label = h.op.type === 'door' ? 'Удалить дверь' : 'Удалить окно';
    } else if (h.kind === 'extOpening') {
      const e = h.edge;
      a = e.axis === 'x' ? { x: h.op.x - h.op.width / 2, z: e.z1 } : { x: e.x1, z: h.op.x - h.op.width / 2 };
      b = e.axis === 'x' ? { x: h.op.x + h.op.width / 2, z: e.z1 } : { x: e.x1, z: h.op.x + h.op.width / 2 };
      hh = h.op.height; label = h.op.type === 'door' ? 'Удалить дверь' : 'Удалить окно';
    } else if (h.kind === 'stair') {
      const poly = stairWorldPoly(params, h.ref);
      const xs = poly.map(q => q.x), zs = poly.map(q => q.z);
      a = { x: Math.min(...xs), z: Math.min(...zs) };
      b = { x: Math.max(...xs), z: Math.max(...zs) };
      th = Math.max(.4, b.z - a.z); hh = H; label = 'Удалить лестницу';
    } else if (h.kind === 'column') {
      a = { x: h.ref.x - .2, z: h.ref.z }; b = { x: h.ref.x + .2, z: h.ref.z };
      th = bw * 2.2; label = 'Удалить столб';
    } else {
      a = { x: h.ref.x - .25, z: h.ref.z }; b = { x: h.ref.x + .25, z: h.ref.z };
      th = .5; hh = .6; label = 'Удалить светильник';
    }
    setWallGhost(highlight, a, b, hh, th, false, .3);
    showLabel({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, label, 'bad');
    setHud('', `${label} · <b>Ctrl+Z</b> вернёт`);
  }
}

/* ---------- интерфейс ---------- */
function buildUI() {
  const panel = document.getElementById('editor-panel');
  const toolbar = panel?.querySelector('.toolbar');
  panel?.querySelector('.editor-hint')?.remove();

  if (toolbar && !document.getElementById('tool-room')) {
    const room = document.createElement('button');
    room.id = 'tool-room';
    room.className = 'tool-btn';
    room.textContent = '▭ Комната';
    room.addEventListener('click', () => setTool('room'));
    const fence = document.getElementById('tool-fence');
    toolbar.insertBefore(room, fence ? fence.nextSibling : null);
  }

  const dock = document.createElement('div');
  dock.className = 'editor-dock';

  const opts = document.createElement('div');
  opts.className = 'ed-row';
  opts.innerHTML = `
    <button class="ed-chip on" id="ed-grid" title="Сетка (G)"><span class="dot"></span>Сетка</button>
    <select class="ed-select" id="ed-snap" title="Шаг привязки">
      <option value="0.25">0.25 м</option>
      <option value="0.5" selected>0.5 м</option>
      <option value="1">1 м</option>
      <option value="0">Без привязки</option>
    </select>
    <button class="ed-chip on" id="ed-angle" title="Привязка углов к 45° (Shift — временно выключить)"><span class="dot"></span>45°</button>
    <button class="ed-chip on" id="ed-guides" title="Направляющие через курсор"><span class="dot"></span>Напр.</button>
    <button class="ed-chip on" id="ed-labels" title="Метки размеров у курсора"><span class="dot"></span>Размеры</button>
    <button class="ed-chip on" id="ed-roomdoor" title="Ставить дверь в новой комнате"><span class="dot"></span>Дверь</button>
    <label class="ed-slider-wrap" title="Плотность призрака"><span>Призрак</span>
      <input class="ed-range" id="ed-alpha" type="range" min="0.1" max="0.7" step="0.05" value="0.3"></label>
    <span class="ed-sep"></span>
    <button class="ed-icon" id="ed-fit" title="Вписать дом (F)">⤢</button>
    <button class="ed-icon" id="ed-zout" title="Отдалить">−</button>
    <span class="ed-zoom" id="ed-zoom">100%</span>
    <button class="ed-icon" id="ed-zin" title="Приблизить">+</button>
    <span class="ed-sep"></span>
    <button class="ed-icon" id="ed-undo" title="Отменить (Ctrl+Z)" disabled>↶</button>`;

  const status = document.createElement('div');
  status.className = 'ed-status';
  status.innerHTML = `<span class="ed-metric" id="hud-metric"></span><span class="ed-hint" id="hud-hint"></span>`;

  dock.appendChild(opts);
  if (toolbar) dock.appendChild(toolbar);
  dock.appendChild(status);
  panel?.appendChild(dock);

  const label = document.createElement('div');
  label.id = 'plan-label';
  document.body.appendChild(label);

  ui.label = label;
  ui.metric = document.getElementById('hud-metric');
  ui.hint = document.getElementById('hud-hint');
  ui.undo = document.getElementById('ed-undo');
  ui.zoom = document.getElementById('ed-zoom');

  const toggle = (id, key, after) => {
    const el = document.getElementById(id);
    el.addEventListener('click', () => {
      S.opts[key] = !S.opts[key];
      el.classList.toggle('on', S.opts[key]);
      after?.();
      updateGhosts();
    });
  };
  toggle('ed-grid', 'grid', () => { gridGroup.visible = S.opts.grid; });
  toggle('ed-angle', 'angle');
  toggle('ed-guides', 'guides');
  toggle('ed-labels', 'labels');
  toggle('ed-roomdoor', 'roomDoor');

  document.getElementById('ed-snap').addEventListener('change', e => {
    S.opts.snap = parseFloat(e.target.value);
    gridKey = '';
    rebuildGrid();
    updateGhosts();
  });
  document.getElementById('ed-alpha').addEventListener('input', e => {
    S.opts.alpha = parseFloat(e.target.value);
    updateGhosts();
  });
  document.getElementById('ed-fit').addEventListener('click', () => { fitPlanView(params); updateGhosts(); });
  document.getElementById('ed-zin').addEventListener('click', () => {
    planZoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25); updateGhosts();
  });
  document.getElementById('ed-zout').addEventListener('click', () => {
    planZoomAt(window.innerWidth / 2, window.innerHeight / 2, .8); updateGhosts();
  });
  ui.undo.addEventListener('click', undo);
}

function setTool(tool) {
  S.tool = tool;
  S.anchor = null; S.dragStart = null; S.dragging = false;
  S.roomStart = null; S.pending = null; S.hover = null;
  const sub = document.getElementById('submenu-panel');
  if (sub) sub.style.display = 'none';
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.style.background = '#2c3630';
    b.style.color = '#cfd8cf';
  });
  const active = document.getElementById(TOOL_BTN[tool]);
  if (active) {
    active.style.background = tool === 'delete' ? '#f87171' : '#4ade80';
    active.style.color = '#10240f';
  }
  if (tool === 'stairs') refreshStairGhost();
  updateGhosts();
}

export function initEditor(sceneRef, cameraRef, controlsRef, paramsRef, callback) {
  scene = sceneRef;
  params = paramsRef;
  onChange = callback;

  helpers = new THREE.Group();
  helpers.renderOrder = 800;
  scene.add(helpers);

  gridGroup = new THREE.Group();
  helpers.add(gridGroup);

  floorTint = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x0e1a12, transparent: true, opacity: .28, depthWrite: false })
  );
  floorTint.rotation.x = -Math.PI / 2;
  floorTint.renderOrder = 700;
  helpers.add(floorTint);

  const lotGeo = new THREE.BufferGeometry();
  lotGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  lotLine = new THREE.LineLoop(lotGeo, new THREE.LineBasicMaterial({ color: ACC, transparent: true, opacity: .85 }));
  helpers.add(lotLine);

  wallGhost = makeWallGhost();
  openingGhost = makeWallGhost();
  highlight = makeWallGhost();
  for (let i = 0; i < 4; i++) roomGhosts.push(makeWallGhost());

  const handleGeo = new THREE.SphereGeometry(.11, 12, 10);
  handleA = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({ color: ACC, depthTest: false }));
  handleB = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({ color: ACC, depthTest: false }));
  handleA.renderOrder = handleB.renderOrder = 950;
  handleA.visible = handleB.visible = false;
  helpers.add(handleA, handleB);

  cursorMark = new THREE.Mesh(
    new THREE.TorusGeometry(.22, .03, 8, 28),
    new THREE.MeshBasicMaterial({ color: ACC, depthTest: false, transparent: true, opacity: .95 })
  );
  cursorMark.rotation.x = -Math.PI / 2;
  cursorMark.renderOrder = 960;
  cursorMark.userData.baseScale = 1;
  helpers.add(cursorMark);

  cursorFoot = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: .5, depthTest: false, depthWrite: false })
  );
  cursorFoot.renderOrder = 955;
  helpers.add(cursorFoot);

  pointerDot = new THREE.Mesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: .9 })
  );
  pointerDot.renderOrder = 970;
  helpers.add(pointerDot);

  columnGhost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: .4, depthWrite: false })
  );
  helpers.add(columnGhost);

  lightGhost = new THREE.Mesh(
    new THREE.TorusGeometry(.34, .045, 8, 26),
    new THREE.MeshBasicMaterial({ color: OK, depthTest: false, transparent: true, opacity: .9 })
  );
  lightGhost.rotation.x = -Math.PI / 2;
  lightGhost.renderOrder = 950;
  helpers.add(lightGhost);

  const guideMat = new THREE.LineBasicMaterial({ color: ACC, transparent: true, opacity: .25, depthTest: false });
  const mkGuide = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const l = new THREE.Line(g, guideMat);
    l.renderOrder = 890;
    helpers.add(l);
    return l;
  };
  guideX = mkGuide();
  guideZ = mkGuide();

  buildUI();
  rebuildGrid();
  helpers.visible = false;

  window.setEditorTool = setTool;
  window.toggleEditorGrid = (v) => {
    helpers.visible = v;
    gridGroup.visible = S.opts.grid;
    if (!v) hideGhosts();
  };
  window.resetStairsPreview = () => {
    if (stairGhost) { helpers.remove(stairGhost); disposeTree(stairGhost); stairGhost = null; stairKey = ''; }
  };
  window.syncEditor = () => {
    if (!params.editMode) { helpers.visible = false; return; }
    helpers.visible = true;
    rebuildGrid();
    if (S.anchor && !insideLot(S.anchor)) S.anchor = null;
    updateGhosts();
  };
  window.editorUndo = undo;

  attachEvents();
  setTool('wall');
  return { setTool, undo };
}

export function updateEditorHelpers(t) {
  if (!cursorMark || !cursorMark.visible) return;
  const b = cursorMark.userData.baseScale || 1;
  const s = b * (1 + Math.sin(t * 4.2) * .07);
  cursorMark.scale.set(s, s, 1);
}

/* ---------- события ---------- */
function attachEvents() {
  const isCanvas = (e) => e.target && e.target.tagName === 'CANVAS';

  window.addEventListener('pointerdown', (e) => {
    if (!params.editMode || !isCanvas(e)) return;
    S.overCanvas = true;

    if (e.button === 1 || (e.button === 0 && S.space)) {
      S.pan = true; S.panLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      S.anchor = null; S.dragStart = null; S.roomStart = null; S.dragging = false;
      updateGhosts();
      return;
    }
    if (e.button !== 0) return;

    computeCursor(e.clientX, e.clientY);
    S.press = { x: e.clientX, y: e.clientY };
    S.dragging = false;

    const t = S.tool;
    if (t === 'wall' || t === 'fence') {
      S.dragStart = S.anchor ? S.anchor.clone() : S.cursor.clone();
      if (!insideLot(S.dragStart)) { toast('Начните внутри дома'); S.dragStart = null; }
    } else if (t === 'room') {
      S.roomStart = S.cursor.clone();
      if (!insideLot(S.roomStart)) { toast('Начните внутри дома'); S.roomStart = null; }
    } else if (t === 'door' || t === 'window') {
      updateGhosts(); commitOpening();
    } else if (t === 'delete') {
      updateGhosts(); doDelete();
    } else if (t === 'column') {
      updateGhosts();
      if (S.pending?.ok) {
        pushUndo();
        params.columns.push({ x: S.pending.x, z: S.pending.z, floor: params.currentFloor });
        onChange();
      } else toast('Здесь уже есть столб');
    } else if (t === 'light') {
      const p = S.cursor;
      const near = (params.customLights || []).find(l => l.floor === params.currentFloor && Math.hypot(l.x - p.x, l.z - p.z) < .8);
      pushUndo();
      if (near) {
        const levels = [1, 3, 5, 8, 12];
        near.intensity = levels[(levels.indexOf(near.intensity) + 1) % levels.length];
        toast(`Яркость: ${near.intensity}`);
      } else {
        params.customLights.push({ x: p.x, z: p.z, floor: params.currentFloor, intensity: 5, type: params.lightType || 'warm' });
      }
      onChange();
    } else if (t === 'stairs') {
      updateGhosts();
      const p = S.cursor;
      if (params.currentFloor >= params.floors) { toast('Лестницу ставят ниже верхнего этажа'); return; }
      if (!stairFits(p)) { toast('Лестница не помещается — поверните, сдвиньте или смените тип'); return; }
      if (stairOverlapsAny(params, { x: p.x, z: p.z, floor: params.currentFloor, angle: params.stairAngle || 0 })) {
        toast('Лестницы пересекаются'); return;
      }
      pushUndo();
      params.stairs.push({ x: p.x, z: p.z, floor: params.currentFloor, angle: params.stairAngle || 0 });
      onChange();
      toast('Лестница готова — по ней можно подняться в прогулке');
    }
    updateGhosts();
  });

  window.addEventListener('pointermove', (e) => {
    if (!params.editMode) return;
    if (S.pan) {
      planPanByPixels(e.clientX - S.panLast.x, e.clientY - S.panLast.y);
      S.panLast = { x: e.clientX, y: e.clientY };
      computeCursor(e.clientX, e.clientY);
      updateGhosts();
      return;
    }
    S.overCanvas = isCanvas(e);
    if (!S.overCanvas) { hideGhosts(); return; }
    computeCursor(e.clientX, e.clientY);
    if (S.dragStart || S.roomStart) {
      if (Math.hypot(e.clientX - S.press.x, e.clientY - S.press.y) > 5) S.dragging = true;
    }
    updateGhosts();
  });

  window.addEventListener('pointerup', (e) => {
    if (!params.editMode) return;
    if (S.pan && (e.button === 1 || e.button === 0)) { S.pan = false; return; }
    if (e.button !== 0) return;

    const t = S.tool;
    if (t === 'wall' || t === 'fence') {
      if (!S.dragStart) return;
      if (S.overCanvas) computeCursor(e.clientX, e.clientY);
      const a = S.dragStart.clone();
      const b = S.cursor.clone();
      const wasChain = !!S.anchor;
      const moved = Math.hypot(b.x - a.x, b.z - a.z) > .05;
      if (S.dragging && moved) {
        if (commitWall(a, b, t === 'fence')) S.anchor = null;
      } else if (wasChain) {
        if (moved && commitWall(a, b, t === 'fence')) S.anchor = b.clone();
        else if (!moved) S.anchor = null;
      } else {
        S.anchor = a.clone();
      }
      S.dragStart = null; S.dragging = false;
      updateGhosts();
      return;
    }

    if (t === 'room') {
      if (!S.roomStart) return;
      if (S.overCanvas) computeCursor(e.clientX, e.clientY);
      if (S.dragging) commitRoom(S.roomStart, S.cursor.clone());
      S.roomStart = null; S.dragging = false;
      updateGhosts();
    }
  });

  window.addEventListener('dblclick', (e) => {
    if (!params.editMode || !isCanvas(e)) return;
    S.anchor = null; S.dragStart = null;
    updateGhosts();
  });

  window.addEventListener('contextmenu', (e) => {
    if (params.editMode && isCanvas(e)) e.preventDefault();
  });

  window.addEventListener('wheel', (e) => {
    if (!params.editMode || !isCanvas(e)) return;
    e.preventDefault();
    planZoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : .89);
    computeCursor(e.clientX, e.clientY);
    updateGhosts();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!params.editMode) return;
    if (e.key === 'Shift') S.shift = true;
    if (e.code === 'Space') { S.space = true; e.preventDefault(); }
    if (e.key === 'Escape') {
      S.anchor = null; S.dragStart = null; S.roomStart = null; S.dragging = false;
      updateGhosts();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) { fitPlanView(params); updateGhosts(); }
    if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey) {
      S.opts.grid = !S.opts.grid;
      document.getElementById('ed-grid')?.classList.toggle('on', S.opts.grid);
      gridGroup.visible = S.opts.grid;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') S.shift = false;
    if (e.code === 'Space') S.space = false;
  });

  window.addEventListener('blur', () => {
    S.shift = false; S.space = false; S.pan = false;
    S.dragStart = null; S.roomStart = null; S.dragging = false;
  });
}