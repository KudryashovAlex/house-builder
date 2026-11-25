// src/calculator.js
import { PRICES } from './prices.js';

const MANSARD_KNEE_HEIGHT = 1.8;
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

function getWallsHeight(params) {
  const isMansard = params.mansard === 'yes' && params.floors >= 2;
  if (isMansard) return params.wallHeight * (params.floors - 1) + MANSARD_KNEE_HEIGHT;
  return params.wallHeight * params.floors;
}

function mergedLength(intervals) {
  if (!intervals.length) return 0;
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) last[1] = Math.max(last[1], sorted[i][1]);
    else merged.push(sorted[i].slice());
  }
  return merged.reduce((s, [a, b]) => s + (b - a), 0);
}

export function calculateMaterials(params) {
  const isBrevno = params.material === 'brevno';
  const beamW = num(params.beamWidth, 150) / 1000;
  const stepY = isBrevno ? beamW * 0.85 : beamW * 0.95; // совпадает с builder.js
  const protrusion = beamW * (isBrevno ? 1.5 : 1.2);
  const layers = Math.max(1, Math.ceil(getWallsHeight(params) / stepY));

  // --- 1. Коробка ---
  const lenX = params.width + protrusion * 2;
  const lenZ = params.length + protrusion * 2;
  const wallCountX = layers * 2;
  const wallCountZ = layers * 2;
  let wallLengthTotal = wallCountX * lenX + wallCountZ * lenZ;

  // Вычитаем проёмы (окна/двери) на их высоту в венцах
  (params.exteriorOpenings || []).forEach(op => {
    const h = num(op.height, op.type === 'door' ? 2.05 : 1.6);
    const opLayers = Math.max(1, Math.ceil(h / stepY));
    wallLengthTotal -= (num(op.width, 0) + 0.04) * opLayers;
  });

  // Вычитаем снесённые участки стен
  ['front', 'back', 'left', 'right'].forEach(wallName => {
    for (let f = 1; f <= params.floors; f++) {
      const dels = (params.deletedExteriorWalls || []).filter(d => d.wall === wallName && d.floor === f);
      if (!dels.length) continue;
      const half = ((wallName === 'front' || wallName === 'back') ? params.width : params.length) / 2;
      const removed = mergedLength(dels.map(d => [
        Math.max(-half, d.x - d.width / 2),
        Math.min(half, d.x + d.width / 2),
      ]));
      const floorLayers = Math.max(1, Math.ceil(params.wallHeight / stepY));
      wallLengthTotal -= removed * floorLayers;
    }
  });
  wallLengthTotal = Math.max(0, wallLengthTotal);

  // --- 2. Фронтоны ---
  let gableCountTotal = 0;
  let gableLengthTotal = 0;
  const hasGable = params.roofType === 'gable' || params.mansard === 'yes';
  if (hasGable && params.buildingType !== 'roof') {
    const oS = num(params.overhangSides, 0.8);
    const hw = params.width / 2 + oS;
    const drop = (oS * params.roofHeight) / (params.width / 2);
    const totalDrop = params.roofHeight + drop;
    const startY = -beamW / 2;
    const count = Math.max(1, Math.ceil((params.roofHeight - startY) / stepY));
    for (let i = 0; i < count; i++) {
      const yBase = startY + i * stepY;
      if (yBase > params.roofHeight) break;
      const xRoof = (params.roofHeight - (yBase + beamW / 2)) * hw / totalDrop;
      const xWall = params.width / 2 + protrusion;
      const limitX = Math.max(0, Math.min(xRoof - 0.02, xWall));
      gableCountTotal += 1;
      gableLengthTotal += limitX * 2 + protrusion * 2;
    }
    gableCountTotal *= 2;
    gableLengthTotal *= 2;
  }

  // --- 3. Перегородки и заборы ---
  let interiorCount = 0;
  let interiorLength = 0;
  (params.interiorWalls || []).forEach(wall => {
    const L = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
    if (L < 0.1) return;
    if (wall.isFence) {
      interiorLength += L * 2.2;
      interiorCount += Math.floor(L / 0.15) + 3;
      return;
    }
    const wallLayers = Math.max(1, Math.ceil((params.wallHeight - 0.05) / stepY));
    let len = L * wallLayers;
    (wall.openings || []).forEach(op => {
      const h = num(op.height, op.type === 'door' ? 2.05 : 1.6);
      const opLayers = Math.max(1, Math.ceil(h / stepY));
      len -= (num(op.width, 0) + 0.04) * opLayers;
    });
    interiorLength += Math.max(0, len);
    interiorCount += wallLayers;
  });

  const totalCount = wallCountX + wallCountZ + gableCountTotal + interiorCount;
  const totalLength = wallLengthTotal + gableLengthTotal + interiorLength;
  const volume = isBrevno
    ? Math.PI * (beamW / 2) ** 2 * totalLength
    : beamW * beamW * totalLength;

  return {
    walls: { count: wallCountX + wallCountZ, length: wallLengthTotal, logsX: wallCountX, logsZ: wallCountZ },
    gables: { count: gableCountTotal, length: gableLengthTotal },
    interior: { count: interiorCount, length: interiorLength },
    total: { count: totalCount, length: totalLength, volume },
  };
}

// Стоимость веранд/террас с учётом стиля (используется UI при необходимости)
export function calculateVerandaExtras(params) {
  const e = PRICES.extras || {};
  let sum = 0;
  if (params.entrance === 'veranda_open') sum += e.verandaOpen || 0;
  if (params.entrance === 'veranda_glazed') sum += e.verandaGlazed || 0;
  if (params.terrace === 'open') sum += e.terraceOpen || 0;
  if (params.terrace === 'glazed') sum += e.terraceGlazed || 0;

  const styleDelta = {
    classic: 0,
    modern: e.verandaStyleModern || 0,
    chalet: e.verandaStyleChalet || 0,
    glass: e.verandaStyleGlass || 0,
  }[params.verandaStyle] || 0;

  const count =
    ((params.entrance === 'veranda_open' || params.entrance === 'veranda_glazed') ? 1 : 0) +
    ((params.terrace === 'open' || params.terrace === 'glazed') ? 1 : 0);

  return sum + styleDelta * count;
}