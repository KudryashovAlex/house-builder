import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { computeStair, pointInPoly } from './stairs.js';

let controls, camera_, scene_, params_;
let active = false, walkAmbient, onExitCallback = null;
const keys = { w: false, a: false, s: false, d: false, shift: false };
const velocity = new THREE.Vector3();
const BASE = 0.6, EYE = 1.6;
let cache = { key: '', list: [] };

const resetKeys = () => { keys.w = keys.a = keys.s = keys.d = keys.shift = false; };

function layouts() {
  const p = params_;
  const key = [p.wallHeight, p.beamWidth, p.stairType, p.stairWidth, p.stairTurn,
    (p.stairs || []).map(s => `${s.x},${s.z},${s.floor},${s.angle}`).join(';')].join('|');
  if (key !== cache.key) {
    cache = { key, list: (p.stairs || []).map(s => ({ s, L: computeStair(p, s) })) };
  }
  return cache.list;
}

function distToSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - x1, pz - z1);
  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

function collides(x, z, playerFloor, currentY) {
  const p = params_;
  const beamW = Number(p.beamWidth || 150) / 1000;
  const playerR = .25;
  const margin = beamW / 2 + playerR;
  const feet = currentY - EYE;

  for (const { s, L } of layouts()) {
    const baseY = BASE + (s.floor - 1) * p.wallHeight;
    const loc = L.toLocal(x, z);
    const here = L.heightAt(loc.x, loc.z);
    if (here !== null && Math.abs(feet - (baseY + here)) < 1.1) {
      for (const r of L.rails) {
        const a = L.toWorld(r.x1, r.z1), b = L.toWorld(r.x2, r.z2);
        if (distToSegment(x, z, a.x, a.z, b.x, b.z) < .07 + playerR) return true;
      }
    }
    if (playerFloor === s.floor + 1) {
      for (const g of L.guards) {
        const a = L.toWorld(g.x1, g.z1), b = L.toWorld(g.x2, g.z2);
        if (distToSegment(x, z, a.x, a.z, b.x, b.z) < .07 + playerR) return true;
      }
      const poly = L.hole.map(q => L.toWorld(q.x, q.z));
      if (here === null && pointInPoly({ x, z }, poly)) return true;
    }
  }

  for (const wall of (p.interiorWalls || [])) {
    if (wall.floor !== playerFloor) continue;
    if (distToSegment(x, z, wall.x1, wall.z1, wall.x2, wall.z2) < (wall.isFence ? .15 + playerR : margin)) {
      let inDoorway = false;
      const wdx = wall.x2 - wall.x1, wdz = wall.z2 - wall.z1;
      const wl = Math.hypot(wdx, wdz);
      if (wl > .01 && wall.openings) {
        const proj = (x - wall.x1) * (wdx / wl) + (z - wall.z1) * (wdz / wl);
        for (const op of wall.openings) {
          if (op.type === 'door' && op.isOpen && proj > op.offset && proj < op.offset + op.width) { inDoorway = true; break; }
        }
      }
      if (!inDoorway) return true;
    }
  }

  for (const col of (p.columns || [])) {
    if (col.floor !== playerFloor) continue;
    if (Math.hypot(x - col.x, z - col.z) < beamW * .75 + playerR) return true;
  }

  const halfW = p.width / 2, halfL = p.length / 2;
  const walls = [
    { name: 'front', x1: -halfW, z1: halfL, x2: halfW, z2: halfL },
    { name: 'back', x1: -halfW, z1: -halfL, x2: halfW, z2: -halfL },
    { name: 'left', x1: -halfW, z1: -halfL, x2: -halfW, z2: halfL },
    { name: 'right', x1: halfW, z1: -halfL, x2: halfW, z2: halfL },
  ];
  for (const w of walls) {
    if (distToSegment(x, z, w.x1, w.z1, w.x2, w.z2) < margin) {
      const proj = (w.name === 'front' || w.name === 'back') ? x : z;
      const deleted = (p.deletedExteriorWalls || []).some(d =>
        d.wall === w.name && d.floor === playerFloor && Math.abs(proj - d.x) < d.width / 2 - .1);
      const doorHere = (p.exteriorOpenings || []).some(op =>
        op.wall === w.name && op.floor === playerFloor && op.type === 'door' && op.isOpen &&
        Math.abs(proj - op.x) < op.width / 2 - .15);
      if (!deleted && !doorHere) return true;
    }
  }
  return false;
}

function onKeyDown(e) {
  if (!active) return;
  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true;
}
function onKeyUp(e) {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyD') keys.d = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = false;
}
function onUnlock() { if (active) exit(); }

export function initWalk(camera, renderer, scene, params, onExit) {
  camera_ = camera; scene_ = scene; params_ = params; onExitCallback = onExit;
  controls = new PointerLockControls(camera, renderer.domElement);
  controls.addEventListener('unlock', onUnlock);
  walkAmbient = new THREE.AmbientLight(0xffffff, .55);
  walkAmbient.visible = false;
  scene.add(walkAmbient);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('pointerlockerror', () => {
    if (active) { exit(); window.showToast?.('Браузер запретил захват мыши — нажмите «Прогулка» ещё раз'); }
  });
}

export function startWalk() {
  if (active) return;
  active = true;
  resetKeys();
  camera_.position.set(0, BASE + EYE, params_.length / 2 + 5);
  camera_.lookAt(0, BASE + EYE, 0);
  velocity.set(0, 0, 0);
  walkAmbient.visible = true;
  try {
    const pr = controls.lock();
    if (pr && pr.catch) pr.catch(() => setTimeout(() => { if (active) controls.lock(); }, 1000));
  } catch (e) { console.warn('Pointer lock', e); }
}

export function exit() {
  active = false;
  resetKeys();
  if (controls.isLocked) controls.unlock();
  walkAmbient.visible = false;
  if (onExitCallback) onExitCallback();
}

export function isWalkActive() { return active; }

export function updateWalk(delta) {
  if (!active || !controls.isLocked) return;
  const p = params_;
  const speed = keys.shift ? 55 : 30;

  velocity.x -= velocity.x * 15 * delta;
  velocity.z -= velocity.z * 15 * delta;

  const forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  const right = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  const dir = new THREE.Vector3();
  camera_.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  if (forward) { velocity.x += forward * speed * dir.x * delta; velocity.z += forward * speed * dir.z * delta; }
  if (right) { velocity.x += right * speed * dir.z * delta * -1; velocity.z += right * speed * dir.x * delta; }

  let playerFloor = Math.floor((camera_.position.y - EYE - BASE + .3) / p.wallHeight) + 1;
  playerFloor = Math.max(1, Math.min(playerFloor, p.floors));

  const nx = camera_.position.x + velocity.x * delta;
  const nz = camera_.position.z + velocity.z * delta;
  if (!collides(nx, camera_.position.z, playerFloor, camera_.position.y)) camera_.position.x = nx; else velocity.x = 0;
  if (!collides(camera_.position.x, nz, playerFloor, camera_.position.y)) camera_.position.z = nz; else velocity.z = 0;
  camera_.position.x = Math.max(-48, Math.min(48, camera_.position.x));
  camera_.position.z = Math.max(-48, Math.min(48, camera_.position.z));

  // подъём по настоящим ступеням
  let onStairs = false, stairEye = 0;
  for (const { s, L } of layouts()) {
    const loc = L.toLocal(camera_.position.x, camera_.position.z);
    const hh = L.heightAt(loc.x, loc.z);
    if (hh === null) continue;
    const eye = BASE + (s.floor - 1) * p.wallHeight + hh + EYE;
    if (Math.abs(camera_.position.y - eye) < 1.15) { onStairs = true; stairEye = eye; break; }
  }

  if (onStairs) {
    camera_.position.y += (stairEye - camera_.position.y) * 18 * delta;
  } else {
    const targetY = BASE + (playerFloor - 1) * p.wallHeight + EYE;
    camera_.position.y += (targetY - camera_.position.y) * 10 * delta;
  }
}