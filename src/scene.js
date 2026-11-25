import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, planCamera, renderer, controls, dust;
let planMode = false;
let planSpan = 12;
const planTarget = new THREE.Vector3(0, 0, 0);
const PLAN_Y = 80;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#5da4dc');
  g.addColorStop(.45, '#a3cfec');
  g.addColorStop(.78, '#d9e6e2');
  g.addColorStop(1, '#efe0c2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a7c59'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const s = Math.random();
    ctx.fillStyle = s > .66 ? '#558a64' : s > .33 ? '#427252' : '#3b6a4b';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(28, 28);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function canvasRect() {
  return renderer.domElement.getBoundingClientRect();
}

export function initScene() {
  scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog('#cfdce4', 55, 135);

  const aspect = window.innerWidth / window.innerHeight;

  camera = new THREE.PerspectiveCamera(45, aspect, .1, 1000);
  camera.position.set(18, 14, 18);

  planCamera = new THREE.OrthographicCamera(-planSpan * aspect, planSpan * aspect, planSpan, -planSpan, .1, 400);
  planCamera.up.set(0, 0, -1);
  planCamera.position.set(0, PLAN_Y, 0);
  planCamera.lookAt(0, 0, 0);
  planCamera.updateProjectionMatrix();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  document.body.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3e4a3a, .6);
  hemi.position.set(0, 20, 0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe3b3, 2.4);
  sun.position.set(16, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = .02;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x9fc4e8, .5);
  rim.position.set(-18, 12, -14);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const N = 220;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - .5) * 46;
    pos[i * 3 + 1] = .5 + Math.random() * 12;
    pos[i * 3 + 2] = (Math.random() - .5) * 46;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(dg, new THREE.PointsMaterial({
    color: 0xfff2cc, size: .07, transparent: true, opacity: .45, depthWrite: false,
  }));
  scene.add(dust);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 3, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - .05;
  controls.minDistance = 8;
  controls.maxDistance = 60;

  applyPlanFrustum();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyPlanFrustum();
    renderer.shadowMap.needsUpdate = true;
  });

  return { scene, camera, planCamera, renderer, controls };
}

function applyPlanFrustum() {
  const r = canvasRect();
  const a = (r.width || window.innerWidth) / (r.height || window.innerHeight);
  planCamera.left = -planSpan * a;
  planCamera.right = planSpan * a;
  planCamera.top = planSpan;
  planCamera.bottom = -planSpan;
  planCamera.position.set(planTarget.x, PLAN_Y, planTarget.z);
  planCamera.lookAt(planTarget.x, 0, planTarget.z);
  planCamera.updateProjectionMatrix();
  planCamera.updateMatrixWorld();
}

export function getRenderCamera() { return planMode ? planCamera : camera; }
export function getPlanCamera() { return planCamera; }
export function getPlanZoom() { return planCamera.zoom; }
export function getCanvasElement() { return renderer.domElement; }
export function isPlanMode() { return planMode; }

/* Единая точная точка входа: пиксель → мир.
   Берём реальный rect канваса и луч камеры — работает при любом зуме,
   панорамировании, DPR, масштабе браузера и смещении канваса. */
export function screenToWorld(cx, cy, planeY = 0, out = new THREE.Vector3()) {
  const r = canvasRect();
  _ndc.x = ((cx - r.left) / r.width) * 2 - 1;
  _ndc.y = -((cy - r.top) / r.height) * 2 + 1;
  _ray.setFromCamera(_ndc, getRenderCamera());
  _plane.normal.set(0, 1, 0);
  _plane.constant = -planeY;
  if (_ray.ray.intersectPlane(_plane, _hit)) return out.copy(_hit);
  return out.set(planTarget.x, planeY, planTarget.z);
}

export function getWorldPerPixel() {
  const r = canvasRect();
  const h = r.height || window.innerHeight;
  if (planMode) return (2 * planSpan / planCamera.zoom) / h;
  const dist = camera.position.distanceTo(controls.target);
  return (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / h;
}

export function setPlanMode(on, params) {
  planMode = on;
  controls.enabled = !on;
  if (on) fitPlanView(params);
  renderer.shadowMap.needsUpdate = true;
}

export function fitPlanView(params) {
  const r = canvasRect();
  const a = (r.width || window.innerWidth) / (r.height || window.innerHeight);
  const halfW = (params?.width ?? 8) / 2 + (params?.overhangSides ?? .8) + 3.5;
  const halfL = (params?.length ?? 6) / 2 + Math.max(params?.overhangFront ?? .8, params?.overhangBack ?? .8) + 5.5;
  planSpan = Math.max(halfL, halfW / a);
  planCamera.zoom = 1;
  planTarget.set(0, 0, 0);
  applyPlanFrustum();
}

export function planZoomAt(cx, cy, factor) {
  const before = screenToWorld(cx, cy, 0, new THREE.Vector3());
  planCamera.zoom = clamp(planCamera.zoom * factor, .3, 9);
  applyPlanFrustum();
  const after = screenToWorld(cx, cy, 0, new THREE.Vector3());
  planTarget.x += before.x - after.x;
  planTarget.z += before.z - after.z;
  applyPlanFrustum();
}

export function planPanByPixels(dx, dy) {
  const wpp = getWorldPerPixel();
  planTarget.x -= dx * wpp;
  planTarget.z -= dy * wpp;
  applyPlanFrustum();
}

export function updateEnvironment(t) {
  if (!dust) return;
  dust.rotation.y = t * .012;
  dust.position.y = Math.sin(t * .16) * .35;
}