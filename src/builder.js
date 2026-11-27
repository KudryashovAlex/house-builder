import * as THREE from 'three';
import { addVerandaStructure } from './verandas.js';
import { buildStairGroup } from './stair-builder.js';
import { computeStair } from './stairs.js';
import { sanitizeHouseParams, guardGeometry, cleanPoly, polyArea, isSimple, num } from './safe.js';
import { buildRoof, roofGeom } from './roof.js';

let currentHouse = null;

const BASE_HEIGHT = 0.6;
const MANSARD_KNEE_HEIGHT = 1.8;

// --- ГЕНЕРАТОР ТЕКСТУРЫ ДЕРЕВА ---
let WOOD_TEXTURE;
let WOOD_BUMP_MAP;

function createPureWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c49a6c'; 
  ctx.fillRect(0, 0, 512, 512);
  
  for (let i = 0; i < 200; i++) {
    ctx.beginPath();
    ctx.strokeStyle = Math.random() > 0.5 ? '#b0855a' : '#d4ab7e';
    ctx.lineWidth = Math.random() * 3 + 1;
    let y = Math.random() * 512;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 20) {
      y += (Math.random() - 0.5) * 15;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; 
  tex.wrapT = THREE.RepeatWrapping;
  
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512; bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d');
  bCtx.drawImage(canvas, 0, 0);
  
  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping; 
  bump.wrapT = THREE.RepeatWrapping;

  return { map: tex, bumpMap: bump };
}

const textures = createPureWoodTexture();
WOOD_TEXTURE = textures.map;
WOOD_BUMP_MAP = textures.bumpMap;

const MATERIAL_STYLES = {
  brus:   { color: '#c49a6c' },
  brevno: { color: '#b8875e' },
};
import { TIMBER_H, normWidth, courseStep, coursesFor, profile as timberProfile, CORNER } from './house/timber.js';
function isMansard(params) {
  return params.mansard === 'yes' && params.floors >= 2;
}

function getWallsHeight(params) {
  if (isMansard(params)) {
    return params.wallHeight * (params.floors - 1) + MANSARD_KNEE_HEIGHT;
  }
  return params.wallHeight * params.floors;
}

function applyShadows(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildHouse(scene, params) {
  sanitizeHouseParams(params);
  disposeCurrent(scene);
  const house = new THREE.Group();
  
  const isBrevno = params.material === 'brevno';
  /* Толщина стены и высота венца — РАЗНЫЕ размеры: 90/140/190 × 140.
     Шаг венца берём из профиля, а не «0.95 от высоты». */
  const beamW = normWidth(params.beamWidth) / 1000;
  const beamH = isBrevno ? beamW : TIMBER_H / 1000;
  const stepY = isBrevno ? beamW * 0.85 : courseStep() / 1000;

  const baseWallsHeight = getWallsHeight(params);
  let layers = isBrevno ? Math.ceil(baseWallsHeight / stepY) : coursesFor(baseWallsHeight * 1000).n;
  
  if (params.editMode) {
    const maxVisibleHeight = params.currentFloor * params.wallHeight;
    layers = Math.min(layers, Math.ceil(maxVisibleHeight / stepY));
  }
  
  const actualWallsHeight = layers * stepY;

  if (params.buildingType === 'roof') {
    const roof = createGableRoof(params.width, params.length, params.roofHeight, params);
    roof.position.y = BASE_HEIGHT;
    house.add(roof);
  } else {
    addFoundation(house, params);
    addWalls(house, params, actualWallsHeight, layers, stepY);
    if (!isMansard(params) && params.roofType === 'hip') {
      addTopTrim(house, params, layers, stepY); 
    }
    addFloorSlabs(house, params);
    addInteriorLighting(house, params);
    
    if (!params.editMode) {
      let roof;
      if (isMansard(params) || params.roofType === 'gable') {
        roof = createGableRoof(params.width, params.length, params.roofHeight, params); // <--- Убрали 0.8
      } else {
        roof = createHipRoof(params.width, params.length, params.roofHeight, params); // <--- Убрали 0.8
      }
      roof.position.y = BASE_HEIGHT + actualWallsHeight + beamW / 2;
      house.add(roof);
    }

    //addWindows(house, params, actualWallsHeight);
    //addFrontDoor(house, params);
    addTerrace(house, params);
    addEntrance(house, params);
    addBalcony(house, params);
    addInteriorWalls(house, params);
    
    // НОВЫЕ ФУНКЦИИ ДЛЯ ВНЕШНИХ ОКОН
    addExteriorHitboxes(house, params, actualWallsHeight);
    addExteriorOpeningsVisuals(house, params);
    addStairs(house, params);
    addColumns(house, params);
  }
  scene.add(house);
  currentHouse = house;
  return house;
}

function disposeCurrent(scene) {
  if (!currentHouse) return;
  scene.remove(currentHouse);
  currentHouse.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (m.map && m.map !== WOOD_TEXTURE) m.map.dispose();
        if (m.bumpMap && m.bumpMap !== WOOD_BUMP_MAP) m.bumpMap.dispose();
        m.dispose();
      });
    }
  });
  currentHouse = null;
}

function addFoundation(house, params) {
  const { width, length, foundation } = params;
  if (foundation === 'strip') {
    const geo = new THREE.BoxGeometry(width + 0.3, BASE_HEIGHT, length + 0.3);
    const mat = new THREE.MeshStandardMaterial({ color: '#6b6b6b', roughness: 0.9 });
    const base = applyShadows(new THREE.Mesh(geo, mat));
    base.position.y = BASE_HEIGHT / 2;
    house.add(base);
  } else if (foundation === 'pile' || foundation === 'pile_grillage') {
    const pileMat = new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.8 });
    const pileGeo = new THREE.CylinderGeometry(0.2, 0.25, BASE_HEIGHT, 8);
    const positions = [
      [-width/2, length/2], [width/2, length/2], [-width/2, -length/2], [width/2, -length/2],
      [0, length/2], [0, -length/2], [-width/2, 0], [width/2, 0],
    ];
    positions.forEach(([x, z]) => {
      const pile = applyShadows(new THREE.Mesh(pileGeo, pileMat));
      pile.position.set(x, BASE_HEIGHT / 2, z);
      house.add(pile);
    });
    if (foundation === 'pile_grillage') {
      const grillGeo = new THREE.BoxGeometry(width + 0.2, 0.25, length + 0.2);
      const grillMat = new THREE.MeshStandardMaterial({ color: '#555555', roughness: 0.7 });
      const grillage = applyShadows(new THREE.Mesh(grillGeo, grillMat));
      grillage.position.y = BASE_HEIGHT;
      house.add(grillage);
    }
  }
}
function addInteriorLighting(house, params) {
  if (!params.customLights) return;
  
  const bulbGeo = new THREE.SphereGeometry(0.12, 16, 16);

  params.customLights.forEach(l => {
    if (params.editMode && l.floor > params.currentFloor) return;

    const ceilingY = BASE_HEIGHT + l.floor * params.wallHeight - 0.3;
    
    // Выбираем цвет в зависимости от типа
    let lightColor = 0xfff0c0; // Теплый по умолчанию
    let emissiveColor = '#ffcc00';
    if (l.type === 'cold') {
      lightColor = 0xdcf0ff; // Холодный белый
      emissiveColor = '#aaccff';
    }

    const light = new THREE.PointLight(lightColor, l.intensity, params.width * 2, 1); 
    light.position.set(l.x, ceilingY, l.z);
    house.add(light);

    const bulbMat = new THREE.MeshStandardMaterial({ 
      color: '#ffffff', 
      emissive: emissiveColor, 
      emissiveIntensity: l.intensity * 0.5 
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.copy(light.position);
    bulb.userData.isCustomLight = true;
    bulb.userData.lightRef = l;
    house.add(bulb);
  });
}
function addTopTrim(house, params, layers, stepY) {
  const isBrevno = params.material === 'brevno';
  const beamW = Number(params.beamWidth || 150) / 1000;
  const protrusion = beamW * (isBrevno ? 1.5 : 1.2);
  
  const mat = new THREE.MeshStandardMaterial({
    color: MATERIAL_STYLES[params.material]?.color || '#c49a6c',
    map: WOOD_TEXTURE, bumpMap: WOOD_BUMP_MAP, bumpScale: 0.05, roughness: 0.9
  });

  // Вычисляем высоту, где сейчас находится крыша
  const roofY = BASE_HEIGHT + layers * stepY + beamW / 2;
  
  // Высота нашей выравнивающей обвязки (половина бруса)
  const trimH = beamW / 2;
  
  // Длина обвязки с учетом выступов (как у обычных стен)
  const lenX = params.width + protrusion * 2;
  const lenZ = params.length + protrusion * 2;

  // 1. Передняя и задняя обвязка (вдоль оси X)
  [params.length / 2, -params.length / 2].forEach(zPos => {
    const geo = new THREE.BoxGeometry(lenX, trimH, beamW);
    const mesh = applyShadows(new THREE.Mesh(geo, mat));
    // Ставим ровно под крышу
    mesh.position.set(0, roofY - trimH / 2, zPos);
    house.add(mesh);
  });

  // 2. Левая и правая обвязка (вдоль оси Z)
  [-params.width / 2, params.width / 2].forEach(xPos => {
    const geo = new THREE.BoxGeometry(beamW, trimH, lenZ);
    const mesh = applyShadows(new THREE.Mesh(geo, mat));
    mesh.position.set(xPos, roofY - trimH / 2, 0);
    house.add(mesh);
  });
}
function addWalls(house, params, wallsHeight, layers, stepY) {
  const isBrevno = params.material === 'brevno';
  const beamW = normWidth(params.beamWidth) / 1000;
  const beamH = isBrevno ? beamW : TIMBER_H / 1000;
  /* Остаток угла «в чашу» — 250 мм по сортаменту, а не доля толщины. */
  const protrusion = isBrevno ? beamW * 1.5 : CORNER.tail / 1000;
  
  const mat = new THREE.MeshStandardMaterial({
    color: MATERIAL_STYLES[params.material]?.color || '#c49a6c',
    map: WOOD_TEXTURE, bumpMap: WOOD_BUMP_MAP, bumpScale: 0.05, roughness: 0.9
  });

  const extOpenings = params.exteriorOpenings || [];
  const deletedWalls = params.deletedExteriorWalls || [];

  for (let i = 0; i < layers; i++) {
    const yX = BASE_HEIGHT + i * stepY + beamH;
    const yZ = yX;   // венцы всех стен в одном уровне — иначе чаша не сойдётся
    const floorNumX = Math.floor((yX - BASE_HEIGHT) / params.wallHeight) + 1;
    const floorNumZ = Math.floor((yZ - BASE_HEIGHT) / params.wallHeight) + 1;

    ['front', 'back'].forEach(wallName => {
      const zPos = wallName === 'front' ? params.length / 2 : -params.length / 2;
      let holes = [];
      
      extOpenings.forEach(op => {
        if (op.wall === wallName && op.floor === floorNumX) {
          const opYMin = BASE_HEIGHT + (op.floor - 1) * params.wallHeight + op.sillHeight;
          const opYMax = opYMin + op.height;
          const logYMin = yX - beamH / 2;
          const logYMax = yX + beamH / 2;
          
          if (logYMax > opYMin && logYMin < opYMax) {
            holes.push({ x: op.x, width: op.width + 0.04, op: op, opYMin: opYMin, opYMax: opYMax, logYMin: logYMin, logYMax: logYMax });
          }
        }
      });

      deletedWalls.forEach(del => {
        if (del.wall === wallName && del.floor === floorNumX) {
          holes.push({ x: del.x, width: del.width });
        }
      });

      holes.sort((a, b) => a.x - b.x);
      let currentX = -params.width / 2 - protrusion;
      const endX = params.width / 2 + protrusion;

      holes.forEach(hole => {
        const holeMin = hole.x - hole.width / 2;
        const holeMax = hole.x + hole.width / 2;
        if (holeMin > currentX) {
          addLogMesh(house, mat, isBrevno, holeMin - currentX, beamH, beamW, currentX + (holeMin - currentX) / 2, yX, zPos, 'x', params.width, params.length, stepY, i);
        }

        if (hole.op) {
          const overlap = 0.02;
          if (hole.logYMax > hole.opYMax) {
            const topH = Math.min(beamH, hole.logYMax - hole.opYMax) - overlap;
            const fillerGeo = new THREE.BoxGeometry(hole.width, topH, beamW);
            const filler = applyShadows(new THREE.Mesh(fillerGeo, mat));
            filler.position.set(hole.x, hole.opYMax + overlap + topH/2, zPos);
            house.add(filler);
          }
          if (hole.logYMin < hole.opYMin) {
            const botH = Math.min(beamH, hole.opYMin - hole.logYMin) + overlap;
            const fillerGeo = new THREE.BoxGeometry(hole.width, botH, beamW);
            const filler = applyShadows(new THREE.Mesh(fillerGeo, mat));
            filler.position.set(hole.x, hole.logYMin - overlap*2 + botH/2, zPos);
            house.add(filler);
          }
        }

        currentX = Math.max(currentX, holeMax);
      });

      if (endX > currentX) {
        addLogMesh(house, mat, isBrevno, endX - currentX, beamH, beamW, currentX + (endX - currentX) / 2, yX, zPos, 'x', params.width, params.length, stepY, i);
      }
    });

    ['left', 'right'].forEach(wallName => {
      const xPos = wallName === 'left' ? -params.width / 2 : params.width / 2;
      let holes = [];
      
      extOpenings.forEach(op => {
        if (op.wall === wallName && op.floor === floorNumZ) {
          const opYMin = BASE_HEIGHT + (op.floor - 1) * params.wallHeight + op.sillHeight;
          const opYMax = opYMin + op.height;
          const logYMin = yZ - beamH / 2;
          const logYMax = yZ + beamH / 2;
          
          if (logYMax > opYMin && logYMin < opYMax) {
            holes.push({ x: op.x, width: op.width + 0.04, op: op, opYMin: opYMin, opYMax: opYMax, logYMin: logYMin, logYMax: logYMax });
          }
        }
      });

      deletedWalls.forEach(del => {
        if (del.wall === wallName && del.floor === floorNumZ) {
          holes.push({ x: del.x, width: del.width });
        }
      });

      holes.sort((a, b) => a.x - b.x);
      let currentZ = -params.length / 2 - protrusion;
      const endZ = params.length / 2 + protrusion;

      holes.forEach(hole => {
        const holeMin = hole.x - hole.width / 2;
        const holeMax = hole.x + hole.width / 2;
        if (holeMin > currentZ) {
          addLogMesh(house, mat, isBrevno, beamW, beamH, holeMin - currentZ, xPos, yZ, currentZ + (holeMin - currentZ) / 2, 'z', params.width, params.length, stepY, i);
        }

        // ФИКС: Доборы для боковых стен с твоей логикой
        if (hole.op) {
          const overlap = 0.02;
          if (hole.logYMax > hole.opYMax) {
            const topH = Math.min(beamH, hole.logYMax - hole.opYMax) - overlap;
            const fillerGeo = new THREE.BoxGeometry(beamW, topH, hole.width);
            const filler = applyShadows(new THREE.Mesh(fillerGeo, mat));
            filler.position.set(xPos, hole.opYMax + overlap + topH/2, hole.x);
            house.add(filler);
          }
          if (hole.logYMin < hole.opYMin) {
            const botH = Math.min(beamH, hole.opYMin - hole.logYMin) + overlap;
            const fillerGeo = new THREE.BoxGeometry(beamW, botH, hole.width);
            const filler = applyShadows(new THREE.Mesh(fillerGeo, mat));
            filler.position.set(xPos, hole.logYMin - overlap*2 + botH/2, hole.x);
            house.add(filler);
          }
        }

        currentZ = Math.max(currentZ, holeMax);
      });

      if (endZ > currentZ) {
        addLogMesh(house, mat, isBrevno, beamW, beamH, endZ - currentZ, xPos, yZ, currentZ + (endZ - currentZ) / 2, 'z', params.width, params.length, stepY, i);
      }
    });
  }
}
/* Профиль венца берём из timber.js: шипы вниз, пазы сверху, зазор 2 мм.
   Тело 0…H сдвигаем на −H/2, чтобы центр меша совпал с центром тела. */
function createProfiledShape(w, h) {
  const pr = timberProfile(Math.round(w * 1000));
  const s = new THREE.Shape();
  pr.pts.forEach(([x, y], i) => {
    const X = x / 1000, Y = y / 1000 - h / 2;
    if (i) s.lineTo(X, Y); else s.moveTo(X, Y);
  });
  s.closePath();
  return s;
}
function createProfiledShapeOld(w) {
  const hw = w / 2;
  const chamfer = w * 0.105;
  const crestW  = w * 0.052;
  const grooveW = w * 0.105;
  const depth   = w * 0.052;
  
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hw + chamfer);

  // НИЗ (ШИПЫ)
  shape.lineTo(-hw + chamfer, -hw);
  shape.lineTo(-hw + chamfer + crestW, -hw); // Левый шип
  shape.lineTo(-hw + chamfer + crestW, -hw + depth); // Паз
  shape.lineTo(-hw + chamfer + crestW + grooveW, -hw + depth);
  shape.lineTo(-hw + chamfer + crestW + grooveW, -hw);
  shape.lineTo(hw - chamfer - crestW - grooveW, -hw); // Центр
  shape.lineTo(hw - chamfer - crestW - grooveW, -hw + depth); // Паз
  shape.lineTo(hw - chamfer - crestW, -hw + depth);
  shape.lineTo(hw - chamfer - crestW, -hw);
  shape.lineTo(hw - chamfer, -hw); // Правый шип
  shape.lineTo(hw, -hw + chamfer);

  // ПРАВАЯ СТЕНКА
  shape.lineTo(hw, hw - chamfer);

  // ВЕРХ (ПАЗЫ)
  shape.lineTo(hw - chamfer, hw);
  shape.lineTo(hw - chamfer - crestW, hw);
  shape.lineTo(hw - chamfer - crestW, hw - depth); // Правый паз
  shape.lineTo(-hw + chamfer + crestW + grooveW, hw - depth); // Левый паз
  shape.lineTo(-hw + chamfer + crestW, hw - depth);
  shape.lineTo(-hw + chamfer + crestW, hw);
  shape.lineTo(-hw + chamfer, hw);
  shape.lineTo(-hw, hw - chamfer);
  
  return shape;
}
function addLogMesh(house, mat, isBrevno, sx, sy, sz, x, y, z, axis, houseWidth, houseLength, stepY, courseIdx) {
  if (![sx, sy, sz, x, y, z, stepY].every(Number.isFinite) || sx <= 0.001 || sy <= 0.001 || sz <= 0.001) return;
  const gap = 0.01;
  let geo;
  
  if (isBrevno) {
    const R = (sy - gap) / 2;
    const length = axis === 'x' ? sx : sz;
    geo = new THREE.CylinderGeometry(R, R, length, 24, 1);
    const pos = geo.attributes.position;
    if (axis === 'x') geo.rotateZ(Math.PI / 2); else geo.rotateX(Math.PI / 2);
    
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      if (py < 0) {
        let yGroove = axis === 'x' 
          ? -stepY + Math.sqrt(Math.max(0, R * R - pz * pz))
          : -stepY + Math.sqrt(Math.max(0, R * R - px * px));
        let yCut = yGroove;
        if (py < yCut) py = yCut;
      }
      pos.setY(i, py);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const uvs = [];
    for (let i = 0; i < pos.count; i++) {
      if (axis === 'x') uvs.push(pos.getX(i) * 2, pos.getY(i) * 5);
      else uvs.push(pos.getZ(i) * 2, pos.getY(i) * 5);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  } else {
    const length = axis === 'x' ? sx : sz;
    const shape = createProfiledShape(axis === 'x' ? sz : sx, sy);
    geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
    geo.translate(0, 0, -length / 2);
    if (axis === 'x') geo.rotateY(Math.PI / 2);

    const pos = geo.attributes.position;
    
    /* Угол «в чашу с остатком» = полудерево: на пересечении снимаем половину тела,
       через венец чередуем какую — тогда брусы не делят объём. Остаток за углом целый.
       Ширина выемки — по толщине ПОПЕРЕЧНОЙ стены, а не по высоте венца. */
    const halfSpan = axis === 'x' ? houseWidth / 2 : houseLength / 2;
    if (isBrevno) {
      for (let i = 0; i < pos.count; i++) {
        const py = pos.getY(i);
        if (py >= 0) continue;
        const along = axis === 'x' ? x + pos.getX(i) : z + pos.getZ(i);
        if (Math.abs(Math.abs(along) - halfSpan) < sy) pos.setY(i, Math.max(py, -sy * 0.1));
      }
    } else {
      const thick = axis === 'x' ? sz : sx;
      const cupR = thick / 2 + CORNER.cupClear / 1000;
      const keepTop = ((courseIdx | 0) + (axis === 'z' ? 1 : 0)) % 2 === 0;
      for (let i = 0; i < pos.count; i++) {
        const along = axis === 'x' ? x + pos.getX(i) : z + pos.getZ(i);
        if (Math.abs(Math.abs(along) - halfSpan) > cupR) continue;
        const py = pos.getY(i);
        pos.setY(i, keepTop ? Math.max(py, 0) : Math.min(py, 0));
      }
    }
    
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const uvs = [];
    for (let i = 0; i < pos.count; i++) {
      if (axis === 'x') uvs.push(pos.getX(i) * 2, pos.getY(i) * 5);
      else uvs.push(pos.getZ(i) * 2, pos.getY(i) * 5);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y - (isBrevno ? 0 : gap / 2), z);
  applyShadows(mesh);
  house.add(mesh);
}
function isWallDeleted(wallName, floor, params) {
  if (!params.deletedExteriorWalls) return false;
  const del = params.deletedExteriorWalls.filter(d => d.wall === wallName && d.floor === floor);
  if (del.length === 0) return false;
  
  const wallWidth = (wallName === 'front' || wallName === 'back') ? params.width : params.length;
  
  const intervals = del.map(d => [d.x - d.width/2, d.x + d.width/2]);
  intervals.sort((a, b) => a[0] - b[0]);
  
  let merged = [];
  for (let interval of intervals) {
    if (merged.length === 0) {
      merged.push(interval);
    } else {
      let last = merged[merged.length - 1];
      if (interval[0] <= last[1]) {
        last[1] = Math.max(last[1], interval[1]);
      } else {
        merged.push(interval);
      }
    }
  }
  
  let covered = 0;
  for (let interval of merged) {
    covered += interval[1] - interval[0];
  }
  
  return covered > wallWidth - 0.2;
}
function getGableZ(params, isFront, floor) {
  const length = params.length;
  if (isFront) {
    // Если передняя стена цела, фронтон остается на месте
    if (!isWallDeleted('front', floor, params)) return length / 2;
    
    // Ищем самую дальнюю вперед опору
    let maxZ = -length / 2;
    (params.interiorWalls || []).forEach(w => {
      if (w.floor === floor && !w.isFence) {
        maxZ = Math.max(maxZ, w.z1, w.z2);
      }
    });
    (params.columns || []).forEach(c => {
      if (c.floor === floor) maxZ = Math.max(maxZ, c.z);
    });
    return maxZ;
  } else {
    // Если задняя стена цела, фронтон остается на месте
    if (!isWallDeleted('back', floor, params)) return -length / 2;
    
    // Ищем самую дальнюю назад опору
    let minZ = length / 2;
    (params.interiorWalls || []).forEach(w => {
      if (w.floor === floor && !w.isFence) {
        minZ = Math.min(minZ, w.z1, w.z2);
      }
    });
    (params.columns || []).forEach(c => {
      if (c.floor === floor) minZ = Math.min(minZ, c.z);
    });
    return minZ;
  }
}
function createGableRoof(width, length, roofHeight, params) {
  const group = new THREE.Group();
  group.add(buildRoof(params));

  const G = roofGeom(params);
  const isBrevno = params.material === 'brevno';
  const beamW = Number(params.beamWidth || 150) / 1000;
  const protrusion = beamW * (isBrevno ? 1.5 : 1.2);
  const hw = G.hw, totalDrop = G.rise;
  const woodMat = new THREE.MeshStandardMaterial({
    color: MATERIAL_STYLES[params.material]?.color || '#c49a6c',
    map: WOOD_TEXTURE, bumpMap: WOOD_BUMP_MAP, bumpScale: 0.05, roughness: 0.9
  });

  function createWoodGableWall() {
    const g = new THREE.Group();
    const startY = -beamW / 2;
    const gap = 0.01;
    const stepY = isBrevno ? beamW * 0.85 : beamW * 0.95;
    const count = Math.ceil((roofHeight - startY) / stepY);
    const getLimitX = (yGlobal) => {
      const xRoof = (roofHeight - yGlobal) * hw / totalDrop;
      const xWall = width / 2 + protrusion;
      return Math.max(0, Math.min(xRoof - 0.02, xWall));
    };
    for (let i = 0; i < count; i++) {
      const yBase = startY + i * stepY + gap / 2;
      if (yBase > roofHeight) break;
      let geo, yOffset;
      if (isBrevno) {
        const R = (beamW - gap) / 2;
        geo = new THREE.CylinderGeometry(R, R, width + protrusion * 2, 24);
        geo.rotateZ(Math.PI / 2);
        yOffset = yBase + R;
        const pos = geo.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          let py = pos.getY(j), pz = pos.getZ(j);
          if (py < 0) {
            const yGroove = -stepY + Math.sqrt(Math.max(0, R * R - pz * pz));
            if (py < yGroove) py = yGroove;
          }
          pos.setY(j, py);
        }
        for (let j = 0; j < pos.count; j++) {
          const x = pos.getX(j);
          const limitX = getLimitX(yOffset + pos.getY(j));
          if (x > limitX) pos.setX(j, limitX);
          else if (x < -limitX) pos.setX(j, -limitX);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      } else {
        const len = width + protrusion * 2;
        geo = new THREE.ExtrudeGeometry(createProfiledShape(beamW - gap), { depth: len, bevelEnabled: false });
        geo.translate(0, 0, -len / 2);
        geo.rotateY(Math.PI / 2);
        yOffset = yBase + (beamW - gap) / 2;
        const pos = geo.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          const x = pos.getX(j);
          const limitX = getLimitX(yOffset + pos.getY(j));
          if (x > limitX) pos.setX(j, limitX);
          else if (x < -limitX) pos.setX(j, -limitX);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      }
      const pos = geo.attributes.position;
      const uvs = [];
      for (let j = 0; j < pos.count; j++) uvs.push(pos.getX(j) * 2, pos.getY(j) * 5);
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const m = applyShadows(new THREE.Mesh(geo, woodMat));
      m.position.set(0, yOffset - (isBrevno ? 0 : gap / 2), 0);
      g.add(m);
    }
    return g;
  }

  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, roofHeight - 0.05, 0,
    -width / 2 + 0.05, 0, 0,
    width / 2 - 0.05, 0, 0
  ]), 3));
  triGeo.setIndex([0, 1, 2]);
  triGeo.computeVertexNormals();
  const darkMat = new THREE.MeshStandardMaterial({ color: '#2a1505', side: THREE.DoubleSide });

  const topFloor = isMansard(params) ? params.floors - 1 : params.floors;
  const frontZ = getGableZ(params, true, topFloor);
  const backZ = getGableZ(params, false, topFloor);

  if (frontZ > backZ + 0.5) {
    const tri = new THREE.Mesh(triGeo, darkMat);
    tri.position.set(0, 0, frontZ);
    group.add(tri);
    const gable = createWoodGableWall();
    gable.position.set(0, 0, frontZ);
    group.add(gable);
  }
  if (backZ < frontZ - 0.5) {
    const tri = new THREE.Mesh(triGeo, darkMat);
    tri.position.set(0, 0, backZ);
    tri.rotation.y = Math.PI;
    group.add(tri);
    const gable = createWoodGableWall();
    gable.position.set(0, 0, backZ);
    gable.rotation.y = Math.PI;
    group.add(gable);
  }
  return group;
}
function createHipRoof(width, length, roofHeight, params) {
  return buildRoof(params);
}

function createWindow(w, h) {
  const group = new THREE.Group();
  const ft = 0.08; const fd = 0.06;

  const trimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  const trim = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.04), trimMat));
  trim.position.z = -0.01; group.add(trim);

  const frameMat = new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#5a8ca8', roughness: 0.1, metalness: 0.8 });

  const glass = new THREE.Mesh(new THREE.BoxGeometry(w - ft*2, h - ft*2, 0.02), glassMat);
  glass.position.z = 0.02; group.add(glass);

  const vBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.05), frameMat));
  vBar.position.z = 0.03; group.add(vBar);
  const hBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.05), frameMat));
  hBar.position.z = 0.03; group.add(hBar);

  return group;
}

function addWindowPanel(house, w, h, x, y, z, rotationY) {
  const group = createWindow(w, h);
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  house.add(group);
}

function addWindows(house, params, wallsHeight) {
  if (params.windows === 'none') return;
  
  const wOffset = Number(params.beamWidth || 150) / 2000 + 0.01;
  const Z_FRONT = params.length / 2 + wOffset;
  const Z_BACK = -params.length / 2 - wOffset;
  const X_LEFT = -params.width / 2 - wOffset;
  const X_RIGHT = params.width / 2 + wOffset;

  const mansard = isMansard(params);
  const hasTerrace = params.terrace !== 'none';
  const BACK_ROT = Math.PI;

  let fullFloors = mansard ? params.floors - 1 : params.floors;
  if (params.editMode) fullFloors = Math.min(fullFloors, params.currentFloor);

  for (let f = 0; f < fullFloors; f++) {
    const floorBaseY = BASE_HEIGHT + f * params.wallHeight;

    if (params.windows === 'panoramic') {
      const bandH = 1.8;
      const yPos = floorBaseY + params.wallHeight * 0.5;
      const sideBandW = params.width / 2 - 0.8;
      const sideBandX = params.width / 4 + 0.2;

      if (sideBandW > 0.3) {
        addWindowPanel(house, sideBandW, bandH, -sideBandX, yPos, Z_FRONT, 0);
        addWindowPanel(house, sideBandW, bandH,  sideBandX, yPos, Z_FRONT, 0);
      } else {
        addWindowPanel(house, params.width * 0.35, bandH, params.width * 0.3, yPos, Z_FRONT, 0);
      }

      if (hasTerrace) {
        if (sideBandW > 0.3) {
          addWindowPanel(house, sideBandW, bandH, -sideBandX, yPos, Z_BACK, BACK_ROT);
          addWindowPanel(house, sideBandW, bandH,  sideBandX, yPos, Z_BACK, BACK_ROT);
        } else {
          addWindowPanel(house, params.width * 0.35, bandH, -params.width * 0.3, yPos, Z_BACK, BACK_ROT);
        }
      } else {
        addWindowPanel(house, params.width * 0.7, bandH, 0, yPos, Z_BACK, BACK_ROT);
      }

      addWindowPanel(house, params.length * 0.7, bandH, X_LEFT, yPos, 0, -Math.PI / 2);
      addWindowPanel(house, params.length * 0.7, bandH, X_RIGHT, yPos, 0,  Math.PI / 2);
    } else {
      const count = params.windows === 'small' ? 1 : 2;
      const winW = params.windows === 'small' ? 1.1 : 1.4;
      const winH = params.windows === 'small' ? 1.3 : 1.6;
      const yPos = floorBaseY + params.wallHeight * 0.55;

      for (let i = 0; i < count; i++) {
        let xPos = count === 1 ? params.width * 0.25 : (i - 0.5) * (params.width * 0.45);
        addWindowPanel(house, winW, winH, xPos, yPos, Z_FRONT, 0);
      }

      if (hasTerrace) {
        const offset = params.width * 0.25;
        if (count === 1) {
          addWindowPanel(house, winW, winH, -offset, yPos, Z_BACK, BACK_ROT);
        } else {
          addWindowPanel(house, winW, winH, -offset, yPos, Z_BACK, BACK_ROT);
          addWindowPanel(house, winW, winH,  offset, yPos, Z_BACK, BACK_ROT);
        }
      } else {
        if (count === 1) {
          addWindowPanel(house, winW, winH, 0, yPos, Z_BACK, BACK_ROT);
        } else {
          addWindowPanel(house, winW, winH, -params.width * 0.2, yPos, Z_BACK, BACK_ROT);
          addWindowPanel(house, winW, winH,  params.width * 0.2, yPos, Z_BACK, BACK_ROT);
        }
      }

      if (params.windows === 'standard') {
        addWindowPanel(house, winW, winH, X_LEFT, yPos, 0, -Math.PI / 2);
        addWindowPanel(house, winW, winH, X_RIGHT, yPos, 0,  Math.PI / 2);
      }
    }
  }

  if (mansard && (!params.editMode || params.currentFloor >= params.floors)) {
    const roofBaseY = BASE_HEIGHT + wallsHeight;
    const triangleCenterY = roofBaseY - 1 + params.roofHeight * 0.35; 
    const winW = 1.2; const winH = 1.4;

    addWindowPanel(house, winW, winH, 0, triangleCenterY, Z_FRONT, 0);
    addWindowPanel(house, winW, winH, 0, triangleCenterY, Z_BACK, BACK_ROT);
  }
}

function addFrontDoor(house, params) {
  const wOffset = Number(params.beamWidth || 150) / 2000 + 0.01;
  const xPos = 0; const yPos = BASE_HEIGHT + 1; 
  const zPos = params.length / 2 + wOffset;
  const doorMat = new THREE.MeshStandardMaterial({ color: '#2a1505', roughness: 0.85 });
  const door = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.05), doorMat));
  door.position.set(xPos, yPos, zPos);
  house.add(door);

  const handleMat = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.9, roughness: 0.2 });
  const handle = applyShadows(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), handleMat));
  handle.position.set(xPos + 0.35, yPos, zPos + 0.04);
  house.add(handle);
}

function addBackDoor(house, params) {
  const wOffset = Number(params.beamWidth || 150) / 2000 + 0.01;
  const mat = new THREE.MeshStandardMaterial({ color: '#2a1505', roughness: 0.85 });
  const door = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.05), mat));
  door.position.set(0, BASE_HEIGHT + 1, -params.length / 2 - wOffset);
  door.rotation.y = Math.PI;
  house.add(door);
}

function createRailing(w, h, d, mat) {
  const group = new THREE.Group();
  const topBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), mat));
  topBar.position.y = h; group.add(topBar);
  const botBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), mat));
  botBar.position.y = 0.1; group.add(botBar);

  const count = Math.floor(w / 0.15);
  const step = w / count;
  const balusterGeo = new THREE.BoxGeometry(0.05, h, 0.05);
  for (let i = 0; i <= count; i++) {
    const b = applyShadows(new THREE.Mesh(balusterGeo, mat));
    b.position.set(-w/2 + i * step, h/2, 0);
    group.add(b);
  }
  return group;
}

function addTerrace(house, params) {
  if (params.terrace === 'none') return;
  addVerandaStructure(house, params, 'back');
}

function addEntrance(house, params) {
  if (params.entrance === 'veranda_open' || params.entrance === 'veranda_glazed') {
    addVeranda(house, params);
  } else if (params.entrance === 'porch') {
    addPorch(house, params);
  }
}

function addVeranda(house, params) {
  addVerandaStructure(house, params, 'front');
}
function addPorch(house, params) {
  const w = 2.5; const d = 1.5; const zPos = params.length / 2 + d / 2;
  const mat = new THREE.MeshStandardMaterial({ color: '#4a2a10', roughness: 0.9 });
  const platform = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mat));
  platform.position.set(0, BASE_HEIGHT, zPos); house.add(platform);
  const step1 = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 0.3), mat));
  step1.position.set(0, BASE_HEIGHT - 0.2, zPos + d/2); house.add(step1);
}

function addBalcony(house, params) {
  if (params.balcony !== 'yes' || params.floors < 2) return;
  const w = 4; const d = 1.5; const zPos = params.length / 2 + d / 2;
  const hasVeranda = params.entrance === 'veranda_open' || params.entrance === 'veranda_glazed';
  const yPos = hasVeranda ? BASE_HEIGHT + params.wallHeight + 0.45 : BASE_HEIGHT + params.wallHeight;

  const mat = new THREE.MeshStandardMaterial({ color: '#4a2a10', roughness: 0.9 });
  const platform = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), mat));
  platform.position.set(0, yPos, zPos); house.add(platform);

  const rFront = createRailing(w, 0.9, 0.05, mat);
  rFront.position.set(0, yPos + 0.1, zPos + d/2 - 0.05); house.add(rFront);
  const rLeft = createRailing(d, 0.9, 0.05, mat);
  rLeft.rotation.y = Math.PI / 2; rLeft.position.set(-w/2 + 0.05, yPos + 0.1, zPos); house.add(rLeft);
  const rRight = createRailing(d, 0.9, 0.05, mat);
  rRight.rotation.y = -Math.PI / 2; rRight.position.set(w/2 - 0.05, yPos + 0.1, zPos); house.add(rRight);

  if (!hasVeranda) {
    const pillarGeo = new THREE.BoxGeometry(0.15, params.wallHeight, 0.15);
    [[-w/2 + 0.1, zPos + d/2 - 0.1], [w/2 - 0.1, zPos + d/2 - 0.1]].forEach(([x, z]) => {
      const pillar = applyShadows(new THREE.Mesh(pillarGeo, mat));
      pillar.position.set(x, BASE_HEIGHT + params.wallHeight/2, z);
      house.add(pillar);
    });
  }
}

function addInteriorWalls(house, params) {
  if (!params.interiorWalls) return;

  const isBrevno = params.material === 'brevno';
  const beamW = Number(params.beamWidth || 150) / 1000;
  const stepY = isBrevno ? beamW * 0.85 : beamW * 0.95;
  const thickness = beamW;

  const mat = new THREE.MeshStandardMaterial({ 
    color: MATERIAL_STYLES[params.material]?.color || '#c49a6c',
    map: WOOD_TEXTURE, bumpMap: WOOD_BUMP_MAP, bumpScale: 0.05, roughness: 0.9 
  });
  const doorMat = new THREE.MeshStandardMaterial({ color: '#5a3a1a', roughness: 0.8 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ 
    color: '#a4cde0', metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.4, side: THREE.DoubleSide
  });

  const actualHeight = params.wallHeight - 0.05;

  params.interiorWalls.forEach(wall => {
    if (params.editMode && wall.floor !== params.currentFloor) return;

    const p1 = new THREE.Vector3(wall.x1, 0, wall.z1);
    const p2 = new THREE.Vector3(wall.x2, 0, wall.z2);
    const dir = p2.clone().sub(p1);
    const L = dir.length();
    if (L < 0.1) return;
    dir.normalize();

    const angleDoor = -Math.atan2(dir.z, dir.x);
    const angleWood = Math.atan2(dir.x, dir.z);
    const floorY = BASE_HEIGHT + (wall.floor - 1) * params.wallHeight;
    const isAlongX = Math.abs(dir.x) > Math.abs(dir.z);

    const protrusion = beamW * 1.2;
    let ext1 = 0, ext2 = 0;
    if (Math.abs(Math.abs(wall.z1) - params.length / 2) < 0.2) ext1 = protrusion;
    if (Math.abs(Math.abs(wall.x1) - params.width / 2) < 0.2) ext1 = protrusion;
    if (Math.abs(Math.abs(wall.z2) - params.length / 2) < 0.2) ext2 = protrusion;
    if (Math.abs(Math.abs(wall.x2) - params.width / 2) < 0.2) ext2 = protrusion;

    if (wall.isFence) {
      const fenceH = 1.0; const fenceY = floorY;
      const fenceMat = new THREE.MeshStandardMaterial({ color: '#6b4724', map: WOOD_TEXTURE, roughness: 0.9 });
      const centerX = (p1.x + p2.x) / 2; const centerZ = (p1.z + p2.z) / 2;

      const topBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(L, 0.1, 0.08), fenceMat));
      topBar.position.set(centerX, fenceY + fenceH, centerZ); topBar.rotation.y = angleDoor;
      topBar.userData.isInteriorWall = true; topBar.userData.wallRef = wall; house.add(topBar);

      const botBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.08), fenceMat));
      botBar.position.set(centerX, fenceY + 0.15, centerZ); botBar.rotation.y = angleDoor;
      botBar.userData.isInteriorWall = true; botBar.userData.wallRef = wall; house.add(botBar);

      const balusterCount = Math.floor(L / 0.15); const stepDist = L / balusterCount;
      for (let i = 0; i <= balusterCount; i++) {
        const bx = p1.x + dir.x * i * stepDist; const bz = p1.z + dir.z * i * stepDist;
        const baluster = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(0.04, fenceH, 0.04), fenceMat));
        baluster.position.set(bx, fenceY + fenceH / 2, bz); baluster.rotation.y = angleDoor;
        baluster.userData.isInteriorWall = true; baluster.userData.wallRef = wall; house.add(baluster);
      }

      const postGeo = new THREE.BoxGeometry(0.1, fenceH + 0.1, 0.1);
      const post1 = applyShadows(new THREE.Mesh(postGeo, fenceMat));
      post1.position.set(p1.x, fenceY + (fenceH + 0.1) / 2, p1.z); post1.userData.isInteriorWall = true; post1.userData.wallRef = wall; house.add(post1);
      const post2 = applyShadows(new THREE.Mesh(postGeo, fenceMat));
      post2.position.set(p2.x, fenceY + (fenceH + 0.1) / 2, p2.z); post2.userData.isInteriorWall = true; post2.userData.wallRef = wall; house.add(post2);
      return; 
    }

    const layersCount = Math.ceil(actualHeight / stepY);
    for (let i = 0; i < layersCount; i++) {
      let yGlobal = floorY + i * stepY + beamW / 2;
      if (!isAlongX) yGlobal += stepY / 2;
      yGlobal -= 0.005; 

      const activeOps = (wall.openings || []).filter(op => {
        const opYMin = floorY + (op.sillHeight || 0);
        const opYMax = opYMin + op.height;
        const logYMin = yGlobal - beamW / 2;
        const logYMax = yGlobal + beamW / 2;
        
        return logYMax > opYMin && logYMin < opYMax;
      }).sort((a, b) => a.offset - b.offset);

      let currentOffset = -ext1;
      const endOffset = L + ext2;

      const drawPiece = (start, end) => {
        const length = end - start;
        if (length <= 0.01) return;
        const cx = p1.x + dir.x * (start + length / 2);
        const cz = p1.z + dir.z * (start + length / 2);

        let geo;
        if (isBrevno) {
          geo = new THREE.CylinderGeometry(beamW / 2, beamW / 2, length, 16);
          geo.rotateX(Math.PI / 2);
        } else {
          const shape = createProfiledShape(beamW);
          geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
          geo.translate(0, 0, -length / 2);
        }
        const pos = geo.attributes.position;
        const uvs = [];
        for (let j = 0; j < pos.count; j++) uvs.push(pos.getX(j) * 2, pos.getY(j) * 5);
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

        const mesh = applyShadows(new THREE.Mesh(geo, mat));
        mesh.position.set(cx, yGlobal, cz);
        mesh.rotation.y = angleWood;
        mesh.userData.isInteriorWall = true;
        mesh.userData.wallRef = wall;
        house.add(mesh);
      };

      activeOps.forEach(op => {
        const opMin = op.offset - 0.02;
        const opMax = op.offset + op.width + 0.02;
        if (opMin > currentOffset) drawPiece(currentOffset, opMin);

        // ФИКС: Доборы для внутренних стен с твоей логикой
        const opYMin = floorY + (op.sillHeight || 0);
        const opYMax = opYMin + op.height;
        const logYMin = yGlobal - beamW / 2;
        const logYMax = yGlobal + beamW / 2;
        const cx = p1.x + dir.x * (op.offset + op.width / 2);
        const cz = p1.z + dir.z * (op.offset + op.width / 2);
        const overlap = 0.02;

        if (logYMax > opYMax) {
            const topH = Math.min(beamW, logYMax - opYMax) - overlap;
            const fillerGeo = new THREE.BoxGeometry(op.width + 0.04, topH, thickness);
            const filler = applyShadows(new THREE.Mesh(fillerGeo, mat));
            filler.position.set(cx, opYMax + overlap + topH/2, cz);
            filler.rotation.y = angleDoor;
            house.add(filler);
        }
        if (logYMin < opYMin) {
            const botH = Math.min(beamW, opYMin - logYMin) + overlap;
            const fillerGeo = new THREE.BoxGeometry(op.width + 0.04, botH, thickness);
            const filler = applyShadows(new THREE.Mesh(fillerGeo, mat));
            filler.position.set(cx, logYMin - overlap*2 + botH/2, cz);
            filler.rotation.y = angleDoor;
            house.add(filler);
        }

        currentOffset = Math.max(currentOffset, opMax);
      });

      if (endOffset > currentOffset) drawPiece(currentOffset, endOffset);
    }

    (wall.openings || []).forEach(op => {
      const opCenter = p1.clone().add(dir.clone().multiplyScalar(op.offset + op.width / 2));
      const group = new THREE.Group();
      group.position.set(opCenter.x, floorY + (op.sillHeight || 0), opCenter.z);
      group.rotation.y = angleDoor;

      group.userData.isOpening = true;
      group.userData.wallRef = wall;
      group.userData.openingRef = op;

      const frameThick = 0.05;
      const frameDepth = thickness + 0.06; 

      const frameTop = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width + frameThick*2, frameThick, frameDepth), frameMat));
      frameTop.position.set(0, op.height + frameThick/2, 0); group.add(frameTop);

      if (op.type === 'window' && op.sillHeight > 0) {
        const frameBot = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width + frameThick*2, frameThick, frameDepth), frameMat));
        frameBot.position.set(0, -frameThick/2, 0); group.add(frameBot);
      }

      const frameL = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(frameThick, op.height, frameDepth), frameMat));
      frameL.position.set(-op.width/2 - frameThick/2, op.height/2, 0); group.add(frameL);
      
      const frameR = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(frameThick, op.height, frameDepth), frameMat));
      frameR.position.set(op.width/2 + frameThick/2, op.height/2, 0); group.add(frameR);

      if (op.type === 'door') {
        const openAngle = op.isOpen ? Math.PI / 2 : 0;

        if (op.width > 1.2) {
          const halfW = op.width / 2;
          const leafW = halfW - 0.02;
          
          const doorLeafL = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(leafW, op.height - 0.02, 0.04), doorMat));
          doorLeafL.userData.isDoor = true;
          doorLeafL.userData.doorRef = op;
          const pivotL = new THREE.Group();
          pivotL.position.set(-halfW + 0.01, op.height/2, 0);
          doorLeafL.position.set(leafW/2, 0, 0); 
          pivotL.add(doorLeafL);
          pivotL.rotation.y = Math.PI / 6 + openAngle;
          group.add(pivotL);

          const doorLeafR = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(leafW, op.height - 0.02, 0.04), doorMat));
          doorLeafR.userData.isDoor = true;
          doorLeafR.userData.doorRef = op;
          const pivotR = new THREE.Group();
          pivotR.position.set(halfW - 0.01, op.height/2, 0);
          doorLeafR.position.set(-leafW/2, 0, 0); 
          pivotR.add(doorLeafR);
          pivotR.rotation.y = -Math.PI / 6 - openAngle;
          group.add(pivotR);
        } else {
          const doorLeaf = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.02, op.height - 0.02, 0.04), doorMat));
          doorLeaf.userData.isDoor = true;
          doorLeaf.userData.doorRef = op;
          const pivot = new THREE.Group();
          pivot.position.set(-op.width/2 + 0.01, op.height/2, 0);
          doorLeaf.position.set(op.width/2, 0, 0); 
          pivot.add(doorLeaf);
          pivot.rotation.y = Math.PI / 6 + openAngle;
          group.add(pivot);
        }
      } else {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.02, op.height - 0.02, 0.02), glassMat);
        glass.position.set(0, op.height/2, 0); group.add(glass);
        const vBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(0.04, op.height, 0.05), frameMat));
        vBar.position.set(0, op.height/2, 0.03); group.add(vBar);
        const hBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width, 0.04, 0.05), frameMat));
        hBar.position.set(0, op.height/2, 0.03); group.add(hBar);
      }
      house.add(group);
    });
  });
}
function addFloorSlabs(house, params) {
  if (params.floors < 2) return;

  const beamW = Number(params.beamWidth || 150) / 1000;
  const floorW = params.width - beamW;
  const floorL = params.length - beamW;
  if (floorW <= 0.2 || floorL <= 0.2) return;

  const mat = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 });
  const halfW = floorW / 2, halfL = floorL / 2;
  const limX = halfW - 0.03, limZ = halfL - 0.03;

  const makeSlabShape = () => {
    const s = new THREE.Shape();
    s.moveTo(-halfW, -halfL);
    s.lineTo(halfW, -halfL);
    s.lineTo(halfW, halfL);
    s.lineTo(-halfW, halfL);
    s.closePath();
    return s;
  };

  const extrudeSlab = (shape) => {
    let g = null;
    try {
      g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g = guardGeometry(g);
    } catch { g = null; }
    return g;
  };

  for (let i = 1; i < params.floors; i++) {
    if (params.editMode && i >= params.currentFloor) break;

    const shape = makeSlabShape();

    (params.stairs || []).filter(s => s.floor === i).forEach(stair => {
      const L = computeStair(params, stair);
      const raw = (L.hole || []).map(p => {
        const wp = L.toWorld(p.x, p.z);
        return {
          x: Math.max(-limX, Math.min(limX, wp.x)),
          y: -Math.max(-limZ, Math.min(limZ, wp.z)),
        };
      });
      const pts = cleanPoly(raw, 0.02);
      if (pts.length < 3 || Math.abs(polyArea(pts)) < 0.08 || !isSimple(pts)) return;
      const hole = new THREE.Path();
      pts.forEach((p, idx) => (idx === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y)));
      hole.closePath();
      shape.holes.push(hole);
    });

    let slabGeo = extrudeSlab(shape);
    if (!slabGeo) slabGeo = extrudeSlab(makeSlabShape());
    if (!slabGeo) continue;

    const slabMesh = applyShadows(new THREE.Mesh(slabGeo, mat));
    slabMesh.position.set(0, BASE_HEIGHT + i * params.wallHeight, 0);
    house.add(slabMesh);
  }
}

// --- ВНЕШНИЕ ОКНА И ДВЕРИ ДЛЯ РЕДАКТОРА ---
function addExteriorHitboxes(house, params, wallsHeight) {
  if (!params.editMode) return;
  
  // Делаем материал полностью прозрачным
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const floorY = BASE_HEIGHT + (params.currentFloor - 1) * params.wallHeight;
  
  // Используем тонкие коробки вместо плоскостей (BoxGeometry) для надежного клика
  const createHitbox = (w, h, d, pos, wallName) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.userData.isExteriorWall = true;
    mesh.userData.wallName = wallName;
    house.add(mesh);
  };
  
  const boxThick = 0.2; // Толщина невидимой коробки для клика
  
  // Передняя стена
  createHitbox(params.width, wallsHeight, boxThick, 
    new THREE.Vector3(0, floorY + wallsHeight/2, params.length/2), 'front');
    
  // Задняя стена
  createHitbox(params.width, wallsHeight, boxThick, 
    new THREE.Vector3(0, floorY + wallsHeight/2, -params.length/2), 'back');
    
  // Левая стена
  createHitbox(boxThick, wallsHeight, params.length, 
    new THREE.Vector3(-params.width/2, floorY + wallsHeight/2, 0), 'left');
    
  // Правая стена
  createHitbox(boxThick, wallsHeight, params.length, 
    new THREE.Vector3(params.width/2, floorY + wallsHeight/2, 0), 'right');
}

function addExteriorOpeningsVisuals(house, params) {
  if (!params.exteriorOpenings) return;
  
  const beamW = Number(params.beamWidth || 150) / 1000;
  const doorMat = new THREE.MeshStandardMaterial({ color: '#5a3a1a', roughness: 0.8 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ 
    color: '#a4cde0', metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.4, side: THREE.DoubleSide
  });

  params.exteriorOpenings.forEach(op => {
    if (params.editMode && op.floor > params.currentFloor) return;
    const floorY = BASE_HEIGHT + (op.floor - 1) * params.wallHeight;
    const yPos = floorY + op.sillHeight + op.height / 2;
    
    let x = 0, z = 0, rot = 0;
    if (op.wall === 'front') { x = op.x; z = params.length / 2; rot = 0; }
    if (op.wall === 'back') { x = op.x; z = -params.length / 2; rot = Math.PI; }
    if (op.wall === 'left') { x = -params.width / 2; z = op.x; rot = -Math.PI / 2; }
    if (op.wall === 'right') { x = params.width / 2; z = op.x; rot = Math.PI / 2; }

    const group = new THREE.Group();
    group.position.set(x, yPos, z);
    group.rotation.y = rot;
    group.userData.isOpening = true;
    group.userData.isExteriorOpening = true;
    group.userData.openingRef = op;
    
    house.add(group);

    const frameThick = 0.05;
    const frameDepth = beamW + 0.06; // ФИКС: Рама снова аккуратная

    const topFrame = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width + frameThick*2, frameThick, frameDepth), frameMat));
    topFrame.position.set(0, op.height/2 + frameThick/2, 0); group.add(topFrame);

    if (op.type === 'window') {
      const botFrame = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width + frameThick*2, frameThick, frameDepth), frameMat));
      botFrame.position.set(0, -op.height/2 - frameThick/2, 0); group.add(botFrame);
    }

    const sideFrameL = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(frameThick, op.height, frameDepth), frameMat));
    sideFrameL.position.set(-op.width/2 - frameThick/2, 0, 0); group.add(sideFrameL);

    const sideFrameR = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(frameThick, op.height, frameDepth), frameMat));
    sideFrameR.position.set(op.width/2 + frameThick/2, 0, 0); group.add(sideFrameR);

        if (op.type === 'door') {
      // Вычисляем базовый угол (чуть приоткрыта)
      const baseRot = (rot === Math.PI || rot === -Math.PI/2) ? -Math.PI / 6 : Math.PI / 6;
      // Если дверь открыта, доворачиваем на 90 градусов
      const openAngle = op.isOpen ? Math.PI / 2 : 0;

      if (op.width > 1.2) {
        const halfW = op.width / 2;
        const leafW = halfW - 0.02;
        
        // Левая створка
        const doorLeafL = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(leafW, op.height - 0.02, 0.04), doorMat));
        doorLeafL.userData.isDoor = true;       // <--- МЕТКА ДЛЯ КЛИКА
        doorLeafL.userData.doorRef = op;        // <--- ССЫЛКА НА ДВЕРЬ
        const pivotL = new THREE.Group();
        pivotL.position.set(-halfW + 0.01, 0, 0);
        doorLeafL.position.set(leafW/2, 0, 0); 
        pivotL.add(doorLeafL);
        pivotL.rotation.y = baseRot + openAngle; // <--- ПРИМЕНЯЕМ УГОЛ
        group.add(pivotL);

        // Правая створка
        const doorLeafR = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(leafW, op.height - 0.02, 0.04), doorMat));
        doorLeafR.userData.isDoor = true;       // <--- МЕТКА ДЛЯ КЛИКА
        doorLeafR.userData.doorRef = op;        // <--- ССЫЛКА НА ДВЕРЬ
        const pivotR = new THREE.Group();
        pivotR.position.set(halfW - 0.01, 0, 0);
        doorLeafR.position.set(-leafW/2, 0, 0); 
        pivotR.add(doorLeafR);
        pivotR.rotation.y = -baseRot - openAngle; // <--- ПРИМЕНЯЕМ УГОЛ
        group.add(pivotR);

      } else {
        // Одинарная створка
        const doorLeaf = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.02, op.height - 0.02, 0.04), doorMat));
        doorLeaf.userData.isDoor = true;       // <--- МЕТКА ДЛЯ КЛИКА
        doorLeaf.userData.doorRef = op;        // <--- ССЫЛКА НА ДВЕРЬ
        const pivot = new THREE.Group();
        pivot.position.set(-op.width/2 + 0.01, 0, 0);
        doorLeaf.position.set(op.width/2, 0, 0); 
        pivot.add(doorLeaf);
        pivot.rotation.y = baseRot + openAngle; // <--- ПРИМЕНЯЕМ УГОЛ
        group.add(pivot);
      }
    } else {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.02, op.height - 0.02, 0.02), glassMat);
      group.add(glass);
      const vBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(0.04, op.height, 0.05), frameMat));
      vBar.position.z = 0.01; group.add(vBar);
      const hBar = applyShadows(new THREE.Mesh(new THREE.BoxGeometry(op.width, 0.04, 0.05), frameMat));
      hBar.position.z = 0.01; group.add(hBar);
    }
  });
}
export function createStairMesh(params, stair, isPreview = false) {
  return buildStairGroup(params, stair, isPreview, {
    guards: !(params.editMode && params.currentFloor <= stair.floor),
  });
}
function addStairs(house, params) {
  if (!params.stairs) return;
  params.stairs.forEach(stair => {
    if (params.editMode && stair.floor > params.currentFloor) return;
    const group = createStairMesh(params, stair, false);
    house.add(group);
  });
}
function addColumns(house, params) {
  if (!params.columns) return;
  
  const mat = new THREE.MeshStandardMaterial({
    color: '#6b4724', // Темнее стен
    map: WOOD_TEXTURE,
    bumpMap: WOOD_BUMP_MAP,
    bumpScale: 0.05,
    roughness: 0.9
  });
  
  const beamW = Number(params.beamWidth || 150) / 1000;
  const colW = beamW * 1.5; // Столб чуть толще бруса

  params.columns.forEach(col => {
    if (params.editMode && col.floor > params.currentFloor) return;
    
    const floorY = BASE_HEIGHT + (col.floor - 1) * params.wallHeight;
    const h = params.wallHeight; // Высота столба равна высоте этажа
    
    // Основной ствол
    const geo = new THREE.BoxGeometry(colW, h, colW);
    const mesh = applyShadows(new THREE.Mesh(geo, mat));
    mesh.position.set(col.x, floorY + h / 2, col.z);
    mesh.userData.isColumn = true;
    mesh.userData.columnRef = col;
    house.add(mesh);
    
    // Декоративное основание
    const baseGeo = new THREE.BoxGeometry(colW * 1.3, 0.15, colW * 1.3);
    const baseMesh = applyShadows(new THREE.Mesh(baseGeo, mat));
    baseMesh.position.set(col.x, floorY + 0.075, col.z);
    baseMesh.userData.isColumn = true;
    baseMesh.userData.columnRef = col;
    house.add(baseMesh);

    // Декоративная капитель (верхушка)
    const capMesh = applyShadows(new THREE.Mesh(baseGeo, mat));
    capMesh.position.set(col.x, floorY + h - 0.075, col.z);
    capMesh.userData.isColumn = true;
    capMesh.userData.columnRef = col;
    house.add(capMesh);
  });
}