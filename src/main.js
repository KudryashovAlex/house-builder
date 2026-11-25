import * as THREE from 'three';
import * as SCENE from './scene.js';
import * as EDITOR from './editor.js';
import * as WALK from './walk.js';
import * as UI from './ui.js';
import { buildHouse } from './builder.js';
import { initRoofEnvironment } from './roof.js';

/* Пространства имён вместо именованных импортов:
   main.js работает и со старыми, и с новыми версиями модулей. */

const STORAGE_KEY = 'dom-les-config-v3';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(Number(v)) ? Number(v) : a));

const DEFAULTS = {
  width: 8, length: 6, wallHeight: 2.7, floors: 1, roofHeight: 2.2,
  roofType: 'gable', material: 'brus', buildingType: 'house', soilType: 'clay',
  foundation: 'pile_grillage', entrance: 'porch', windows: 'standard',
  terrace: 'none', balcony: 'no', finish: 'rough', beamWidth: '150', mansard: 'no',
  overhangFront: 0.8, overhangBack: 0.8, overhangSides: 0.8,
  roofMaterial: 'metaltile', roofColor: 'graphite', roofGutter: 'yes',
  roofSnowGuard: 'no', roofSoffit: 'yes', roofWindow: 'no', chimney: 'none',
  verandaStyle: 'classic',
  stairType: 'l_landing', stairWidth: '1.0', stairStringer: 'kosour',
  stairRisers: 'yes', stairRail: 'wood', stairTurn: 'right', stairAngle: 0,
  interiorWalls: [], exteriorOpenings: [], customLights: [],
  stairs: [], columns: [], deletedExteriorWalls: [],
};

const params = { ...structuredClone(DEFAULTS), editMode: false, currentFloor: 1 };

const ENUMS = {
  roofType: ['gable', 'hip'], material: ['brus', 'brevno'],
  buildingType: ['house', 'bath', 'garage', 'roof'],
  soilType: ['clay', 'sand', 'peat', 'unknown'],
  entrance: ['none', 'porch', 'veranda_open', 'veranda_glazed'],
  windows: ['none', 'small', 'standard', 'panoramic', 'custom'],
  terrace: ['none', 'open', 'glazed'], balcony: ['no', 'yes'],
  mansard: ['no', 'yes'], finish: ['rough', 'preFinish', 'turnkey'],
  beamWidth: ['100', '120', '150', '180', '200'],
  roofMaterial: ['metaltile', 'seam', 'shingle', 'proflist'],
  roofColor: ['graphite', 'chocolate', 'moss', 'ruby', 'terracotta', 'blue', 'gray', 'black'],
  roofGutter: ['yes', 'no'], roofSnowGuard: ['yes', 'no'],
  roofSoffit: ['yes', 'no'], roofWindow: ['yes', 'no'],
  chimney: ['none', 'brick', 'steel'],
  verandaStyle: ['classic', 'modern', 'chalet', 'glass'],
  stairType: ['straight', 'l_landing', 'u_landing', 'l_winder'],
  stairWidth: ['0.9', '1.0', '1.1', '1.2'],
  stairStringer: ['kosour', 'tetiva'], stairRisers: ['yes', 'no'],
  stairRail: ['wood', 'white', 'forge'], stairTurn: ['right', 'left'],
};

function sanitize(p) {
  p.width = clamp(p.width, 4, 15) || 8;
  p.length = clamp(p.length, 4, 15) || 6;
  p.wallHeight = clamp(p.wallHeight, 2.5, 3.5) || 2.7;
  p.floors = Math.round(clamp(p.floors, 1, 3)) || 1;
  p.roofHeight = clamp(p.roofHeight, 1, 4) || 2.2;
  p.overhangFront = clamp(p.overhangFront, .5, 4);
  p.overhangBack = clamp(p.overhangBack, .5, 4);
  p.overhangSides = clamp(p.overhangSides, .5, 4);
  p.stairAngle = Number(p.stairAngle) || 0;

  for (const k of Object.keys(ENUMS)) {
    if (!ENUMS[k].includes(String(p[k]))) p[k] = DEFAULTS[k];
    else p[k] = String(p[k]);
  }
  if (p.buildingType === 'bath' || p.buildingType === 'garage') p.floors = 1;
  if (p.floors < 2) { p.mansard = 'no'; p.balcony = 'no'; }

  const arr = v => (Array.isArray(v) ? v : []);
  const fin = v => Number.isFinite(Number(v));
  const hw = p.width / 2, hl = p.length / 2;
  const wallLen = w => (w === 'front' || w === 'back') ? p.width : p.length;

  p.interiorWalls = arr(p.interiorWalls)
    .filter(w => w && [w.x1, w.z1, w.x2, w.z2].every(fin) && w.floor >= 1 && w.floor <= p.floors)
    .map(w => ({
      ...w,
      x1: clamp(w.x1, -hw, hw), x2: clamp(w.x2, -hw, hw),
      z1: clamp(w.z1, -hl, hl), z2: clamp(w.z2, -hl, hl),
      openings: arr(w.openings),
    }));

  p.exteriorOpenings = arr(p.exteriorOpenings)
    .filter(o => o && ['front', 'back', 'left', 'right'].includes(o.wall) &&
      o.floor >= 1 && o.floor <= p.floors && fin(o.x) && o.width > .2 && o.width < wallLen(o.wall) - .2)
    .map(o => ({
      ...o,
      x: clamp(o.x, -wallLen(o.wall) / 2 + o.width / 2 + .05, wallLen(o.wall) / 2 - o.width / 2 - .05),
    }));

  p.deletedExteriorWalls = arr(p.deletedExteriorWalls)
    .filter(d => d && ['front', 'back', 'left', 'right'].includes(d.wall) && d.floor >= 1 && d.floor <= p.floors && fin(d.x))
    .map(d => ({ ...d, x: clamp(d.x, -wallLen(d.wall) / 2, wallLen(d.wall) / 2), width: clamp(d.width, .5, 15) || 2 }));

  p.customLights = arr(p.customLights)
    .filter(l => l && fin(l.x) && fin(l.z) && l.floor >= 1 && l.floor <= p.floors)
    .map(l => ({ ...l, x: clamp(l.x, -hw, hw), z: clamp(l.z, -hl, hl), intensity: clamp(l.intensity, 1, 12) || 5 }));

  p.columns = arr(p.columns)
    .filter(c => c && fin(c.x) && fin(c.z) && c.floor >= 1 && c.floor <= p.floors)
    .map(c => ({
      ...c,
      x: clamp(c.x, -hw - p.overhangSides + .1, hw + p.overhangSides - .1),
      z: clamp(c.z, -hl - p.overhangBack + .1, hl + p.overhangFront - .1),
    }));

  p.stairs = arr(p.stairs)
    .filter(s => s && fin(s.x) && fin(s.z) && s.floor >= 1 && s.floor < p.floors)
    .map(s => ({ ...s, angle: Number(s.angle) || 0 }));

  p.currentFloor = Math.round(clamp(p.currentFloor, 1, p.floors)) || 1;
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const k of Object.keys(DEFAULTS)) if (saved[k] !== undefined) params[k] = saved[k];
  } catch { /* повреждённое сохранение игнорируем */ }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { editMode, currentFloor, ...data } = params;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* quota */ }
  }, 400);
}

/* ================= СЦЕНА ================= */
const { scene, camera, renderer, controls } = SCENE.initScene();
initRoofEnvironment(renderer, scene);

const activeCamera = () =>
  (typeof SCENE.getRenderCamera === 'function' ? SCENE.getRenderCamera() : camera) || camera;

function rebuild() {
  buildHouse(scene, params);
  renderer.shadowMap.needsUpdate = true;
  if (typeof window.syncEditor === 'function') window.syncEditor();
}

/* ================= DOM ================= */
const editorPanel = $('editor-panel');
const submenuPanel = $('submenu-panel');
const btnEdit = $('btn-edit'), btnWalk = $('btn-walk');
const btnFloor = [$('floor-1'), $('floor-2'), $('floor-3')];
const toastEl = $('toast');

let toastTimer = null;
window.showToast = (msg) => {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
};
const toast = window.showToast;

const hideSubmenu = () => { if (submenuPanel) submenuPanel.style.display = 'none'; };

function showSubmenu(options, onSelect) {
  if (!submenuPanel) return;
  submenuPanel.innerHTML = '';
  options.forEach(opt => {
    const b = document.createElement('button');
    b.textContent = opt.label;
    b.style.cssText = 'padding:8px 15px;cursor:pointer;background:#2c3630;color:#ece7da;border:1px solid #35423a;border-radius:8px;font:600 13px Manrope,sans-serif;transition:.15s;';
    b.onmouseover = () => { b.style.borderColor = '#e8a34c'; b.style.color = '#f7c477'; };
    b.onmouseout = () => { b.style.borderColor = '#35423a'; b.style.color = '#ece7da'; };
    b.onclick = () => { hideSubmenu(); onSelect(opt.value); rebuild(); };
    submenuPanel.appendChild(b);
  });
  submenuPanel.style.display = 'flex';
}

function paintTools(activeId) {
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.style.background = '#2c3630';
    b.style.color = '#cfd8cf';
  });
  const el = $(activeId);
  if (el) {
    el.style.background = activeId === 'tool-delete' ? '#f87171' : '#4ade80';
    el.style.color = '#10240f';
  }
}

function paintFloors() {
  btnFloor.forEach((b, i) => {
    if (!b) return;
    const on = i + 1 === params.currentFloor;
    b.style.background = on ? '#4ade80' : '#2c3630';
    b.style.color = on ? '#10240f' : '#cfd8cf';
    if (i > 0) b.style.display = params.floors >= i + 1 ? 'inline-block' : 'none';
  });
}

function setFloor(floor) {
  params.currentFloor = Math.max(1, Math.min(floor, params.floors));
  paintFloors();
  if (typeof window.resetStairsPreview === 'function') window.resetStairsPreview();
  rebuild();
}

/* ================= СТАНДАРТНЫЕ ПРОЁМЫ ================= */
function generateDefaultOpenings(p) {
  if (p.windows === 'custom') return;
  p.exteriorOpenings = [];
  p.exteriorOpenings.push({ wall: 'front', floor: 1, x: 0, width: .9, height: 2.05, sillHeight: 0, type: 'door' });
  if (p.terrace !== 'none') {
    p.exteriorOpenings.push({ wall: 'back', floor: 1, x: 0, width: .9, height: 2.05, sillHeight: 0, type: 'door' });
  }
  for (let f = 1; f <= p.floors; f++) {
    if (p.windows === 'standard') {
      const w = 1.4, h = 1.6, s = .8;
      p.exteriorOpenings.push(
        { wall: 'front', floor: f, x: -p.width * .25, width: w, height: h, sillHeight: s, type: 'window' },
        { wall: 'front', floor: f, x: p.width * .25, width: w, height: h, sillHeight: s, type: 'window' },
        { wall: 'back', floor: f, x: -p.width * .2, width: w, height: h, sillHeight: s, type: 'window' },
        { wall: 'back', floor: f, x: p.width * .2, width: w, height: h, sillHeight: s, type: 'window' },
        { wall: 'left', floor: f, x: 0, width: w, height: h, sillHeight: s, type: 'window' },
        { wall: 'right', floor: f, x: 0, width: w, height: h, sillHeight: s, type: 'window' },
      );
    } else if (p.windows === 'small') {
      const w = 1.1, h = 1.3, s = .8;
      p.exteriorOpenings.push(
        { wall: 'front', floor: f, x: p.width * .25, width: w, height: h, sillHeight: s, type: 'window' },
        { wall: 'back', floor: f, x: 0, width: w, height: h, sillHeight: s, type: 'window' },
      );
    } else if (p.windows === 'panoramic') {
      const h = 1.8, s = .5;
      p.exteriorOpenings.push(
        { wall: 'front', floor: f, x: -p.width * .35, width: p.width * .3, height: h, sillHeight: s, type: 'window' },
        { wall: 'front', floor: f, x: p.width * .35, width: p.width * .3, height: h, sillHeight: s, type: 'window' },
        { wall: 'back', floor: f, x: 0, width: p.width * .7, height: h, sillHeight: s, type: 'window' },
        { wall: 'left', floor: f, x: 0, width: p.length * .7, height: h, sillHeight: s, type: 'window' },
        { wall: 'right', floor: f, x: 0, width: p.length * .7, height: h, sillHeight: s, type: 'window' },
      );
    }
  }
  p.exteriorOpenings = p.exteriorOpenings.filter(op => {
    if (op.type !== 'window' || op.floor !== 1) return true;
    if (op.wall === 'front') return !(op.x - op.width / 2 < .5 && op.x + op.width / 2 > -.5);
    if (op.wall === 'back' && p.terrace !== 'none') return !(op.x - op.width / 2 < .5 && op.x + op.width / 2 > -.5);
    return true;
  });
}

/* ================= РЕЖИМ ПЛАНИРОВКИ ================= */
function setEditMode(isEdit) {
  params.editMode = isEdit;
  document.body.classList.toggle('editing', isEdit);
  hideSubmenu();

  if (typeof SCENE.setPlanMode === 'function') {
    SCENE.setPlanMode(isEdit, params);
  } else {
    controls.enabled = true;
    if (isEdit) {
      camera.position.set(0, 30, 0);
      controls.target.set(0, 0, 0);
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.maxPolarAngle = 0;
    } else {
      camera.position.set(18, 14, 18);
      controls.target.set(0, 3, 0);
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.maxPolarAngle = Math.PI / 2 - .05;
    }
  }

  if (isEdit) {
    if (editorPanel) editorPanel.style.display = 'flex';
    params.currentFloor = 1;
    paintFloors();
    if (typeof window.setEditorTool === 'function') window.setEditorTool('wall');
    paintTools('tool-wall');
    if (typeof window.toggleEditorGrid === 'function') window.toggleEditorGrid(true);
  } else {
    if (editorPanel) editorPanel.style.display = 'none';
    if (typeof window.resetStairsPreview === 'function') window.resetStairsPreview();
    if (typeof window.toggleEditorGrid === 'function') window.toggleEditorGrid(false);
  }
  rebuild();
}

/* ================= UI ================= */
const handleUIChange = (p) => {
  sanitize(p);
  if (typeof UI.updateFoundationRecommendation === 'function') UI.updateFoundationRecommendation(p);
  if (!p.editMode) generateDefaultOpenings(p);
  if (typeof window.resetStairsPreview === 'function') window.resetStairsPreview();
  rebuild();
  paintFloors();
  save();
};

loadSaved();
sanitize(params);
if (typeof UI.updateFoundationRecommendation === 'function') UI.updateFoundationRecommendation(params);
generateDefaultOpenings(params);
rebuild();
if (typeof UI.initUI === 'function') UI.initUI(params, handleUIChange);
paintFloors();

if (typeof EDITOR.initEditor === 'function') {
  EDITOR.initEditor(scene, camera, controls, params, () => {
    rebuild();
    if (typeof UI.updatePriceDisplay === 'function') UI.updatePriceDisplay(params);
    save();
  });
}

if (typeof WALK.initWalk === 'function') {
  WALK.initWalk(camera, renderer, scene, params, () => {
    document.body.classList.remove('walking');
    if (btnWalk) btnWalk.textContent = 'Прогулка';
    controls.enabled = !params.editMode;
  });
}

const walkActive = () => typeof WALK.isWalkActive === 'function' && WALK.isWalkActive();

/* ================= КНОПКИ РЕЖИМОВ ================= */
if (btnEdit) btnEdit.addEventListener('click', () => {
  const isEdit = !params.editMode;
  setEditMode(isEdit);
  btnEdit.textContent = isEdit ? 'Выйти в 3D' : 'Планировка';
});

if (btnWalk) btnWalk.addEventListener('click', () => {
  if (walkActive()) { WALK.exit(); return; }
  if (params.editMode) {
    setEditMode(false);
    if (btnEdit) btnEdit.textContent = 'Планировка';
  }
  hideSubmenu();
  controls.enabled = false;
  document.body.classList.add('walking');
  WALK.startWalk();
  btnWalk.textContent = 'Выйти (ESC)';
});

/* ================= ИНСТРУМЕНТЫ ================= */
function bindTool(id, tool, submenu) {
  const btn = $(id);
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (typeof window.setEditorTool === 'function') window.setEditorTool(tool);
    paintTools(id);
    if (submenu) showSubmenu(submenu.options, submenu.onSelect);
    else hideSubmenu();
  });
}

bindTool('tool-wall', 'wall');
bindTool('tool-fence', 'fence');
bindTool('tool-room', 'room');
bindTool('tool-column', 'column');
bindTool('tool-delete', 'delete');
bindTool('tool-door', 'door', {
  options: [{ label: 'Одинарная (90 см)', value: 'single' }, { label: 'Двойная (160 см)', value: 'double' }],
  onSelect: v => { params.doorType = v; },
});
bindTool('tool-window', 'window', {
  options: [
    { label: 'Маленькое (1.1 × 1.3)', value: 'small' },
    { label: 'Стандарт (1.4 × 1.6)', value: 'standard' },
    { label: 'Панорама (2.0 × 1.8)', value: 'panoramic' },
  ],
  onSelect: v => { params.windowType = v; },
});
bindTool('tool-light', 'light', {
  options: [{ label: 'Люстра (тёплый)', value: 'warm' }, { label: 'Холодный (белый)', value: 'cold' }],
  onSelect: v => { params.lightType = v; },
});
bindTool('tool-stairs', 'stairs', {
  options: [
    { label: 'Вдоль стены (0°)', value: '0' }, { label: 'Поперёк (90°)', value: '90' },
    { label: 'Развернуть (180°)', value: '180' }, { label: 'Поперёк (270°)', value: '270' },
  ],
  onSelect: v => {
    params.stairAngle = parseFloat(v) * Math.PI / 180;
    if (typeof window.resetStairsPreview === 'function') window.resetStairsPreview();
  },
});

btnFloor.forEach((b, i) => { if (b) b.addEventListener('click', () => setFloor(i + 1)); });

/* ================= СБРОС / СЛУЧАЙНО / ЭКСПОРТ ================= */
function refreshAll() {
  sanitize(params);
  if (typeof UI.updateFoundationRecommendation === 'function') UI.updateFoundationRecommendation(params);
  generateDefaultOpenings(params);
  if (typeof UI.initUI === 'function') UI.initUI(params, handleUIChange);
  paintFloors();
  rebuild();
  save();
}

function leaveEdit() {
  if (!params.editMode) return;
  setEditMode(false);
  if (btnEdit) btnEdit.textContent = 'Планировка';
}

if ($('btn-reset')) $('btn-reset').addEventListener('click', () => {
  leaveEdit();
  Object.assign(params, structuredClone(DEFAULTS));
  params.currentFloor = 1;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  refreshAll();
  toast('Настройки сброшены к начальному варианту');
});

const rnd = a => a[Math.floor(Math.random() * a.length)];
const rndR = (a, b, s) => Math.round((a + Math.random() * (b - a)) / s) * s;

if ($('btn-random')) $('btn-random').addEventListener('click', () => {
  leaveEdit();
  Object.assign(params, structuredClone(DEFAULTS), {
    width: rndR(5, 12, .5), length: rndR(5, 12, .5),
    floors: rnd([1, 1, 2, 2, 3]), wallHeight: rndR(2.5, 3.2, .1),
    material: rnd(['brus', 'brus', 'brevno']), beamWidth: rnd(['150', '180', '200']),
    roofType: rnd(['gable', 'gable', 'hip']), roofHeight: rndR(1.6, 3.2, .1),
    roofMaterial: rnd(['metaltile', 'metaltile', 'seam', 'shingle']),
    roofColor: rnd(['graphite', 'chocolate', 'moss', 'ruby', 'blue']),
    overhangFront: rndR(.6, 1.4, .1), overhangBack: rndR(.6, 1.4, .1), overhangSides: rndR(.6, 1.0, .1),
    windows: rnd(['standard', 'standard', 'small', 'panoramic']),
    entrance: rnd(['none', 'porch', 'porch', 'veranda_open', 'veranda_glazed']),
    terrace: rnd(['none', 'none', 'open', 'glazed']),
    verandaStyle: rnd(['classic', 'modern', 'chalet', 'glass']),
    soilType: rnd(['clay', 'sand', 'peat', 'unknown']),
    finish: rnd(['rough', 'preFinish', 'turnkey']),
    currentFloor: 1,
  });
  if (params.floors > 1) { params.balcony = rnd(['no', 'yes']); params.mansard = rnd(['no', 'yes']); }
  refreshAll();
  toast('Случайный вариант готов');
});

function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

if ($('btn-export')) $('btn-export').addEventListener('click', () => {
  const { editMode, currentFloor, ...data } = params;
  download('dom-les-project.json', new Blob([JSON.stringify({
    project: 'Дом·Лес — конфигуратор деревянных домов',
    savedAt: new Date().toISOString(),
    params: data,
  }, null, 2)], { type: 'application/json' }));
  toast('Проект сохранён в JSON');
});

if ($('btn-snapshot')) $('btn-snapshot').addEventListener('click', () => {
  renderer.render(scene, activeCamera());
  renderer.domElement.toBlob(blob => {
    if (blob) { download('dom-les-view.png', blob); toast('Снимок дома сохранён'); }
  }, 'image/png');
});

if ($('btn-panel')) $('btn-panel').addEventListener('click', () => {
  document.body.classList.toggle('panel-open');
});

/* ================= КЛИК ПО ДВЕРЯМ ================= */
const clickRay = new THREE.Raycaster();
const clickNdc = new THREE.Vector2();
renderer.domElement.addEventListener('click', (e) => {
  if (params.editMode) return;
  const cam = activeCamera();
  if (walkActive()) clickNdc.set(0, 0);
  else {
    const r = renderer.domElement.getBoundingClientRect();
    clickNdc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    clickNdc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  clickRay.setFromCamera(clickNdc, cam);
  const hits = clickRay.intersectObjects(scene.children, true);
  for (const hit of hits) {
    if (walkActive() && hit.distance > 3.2) break;
    let obj = hit.object;
    while (obj) {
      if (obj.userData.isDoor && obj.userData.doorRef) {
        const op = obj.userData.doorRef;
        op.isOpen = !op.isOpen;
        rebuild();
        save();
        toast(op.isOpen ? 'Дверь открыта' : 'Дверь закрыта');
        return;
      }
      obj = obj.parent;
    }
  }
});

/* ================= ГЛАВНЫЙ ЦИКЛ ================= */
let lastTime = performance.now();
let firstFrame = true;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, .1);
  lastTime = now;
  const t = now / 1000;

  if (walkActive()) WALK.updateWalk(delta);
  else if (!params.editMode) controls.update();

  if (typeof SCENE.updateEnvironment === 'function') SCENE.updateEnvironment(t);
  if (typeof EDITOR.updateEditorHelpers === 'function') EDITOR.updateEditorHelpers(t);

  renderer.render(scene, activeCamera());

  if (firstFrame) {
    firstFrame = false;
    const loader = $('loader');
    if (loader) { loader.classList.add('done'); setTimeout(() => loader.remove(), 600); }
  }
});

window.addEventListener('error', (e) => {
  console.error('Ошибка конфигуратора:', e.message);
});