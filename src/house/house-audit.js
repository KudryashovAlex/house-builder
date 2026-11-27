/* Аудит дома: венец, профиль, угол, раскрой, сцена, консоль.
   Ядро чистое (без three), сцена подключается опционально.
   Формат отчёта — как в кровельном аудите: только падения, компактный JSON. */

import {
  TIMBER_H, TIMBER_WIDTHS, STOCK_LENGTHS, MIN_PIECE, JOINT_SHIFT, CORNER,
  normWidth, normStock, profile, courseStep, coursesFor, areas, courseRuns, wallSummary,
} from './timber.js';
import { calculateMaterials } from '../calculator.js';

export const HOUSE_GROUPS = {
  X: { n: 'Целостность', c: '#4cc9f0' },
  W: { n: 'Венец и профиль', c: '#e8a34c' },
  U: { n: 'Угол', c: '#c49a6c' },
  O: { n: 'Проёмы', c: '#b07cf0' },
  R: { n: 'Раскрой', c: '#4ade80' },
  K: { n: 'Калькулятор', c: '#fbbf24' },
  S: { n: 'Сцена', c: '#7dd3fc' },
  E: { n: 'Консоль', c: '#f4645f' },
  L: { n: 'Планировка', c: '#a3e635' },
};

export const HOUSE_DEFAULTS = {
  width: 8, length: 6, wallHeight: 2.7, floors: 1, roofHeight: 2.2,
  roofType: 'gable', material: 'brus', buildingType: 'house', soilType: 'clay',
  foundation: 'pile_grillage', entrance: 'porch', windows: 'standard',
  terrace: 'none', balcony: 'no', finish: 'rough', beamWidth: '140', beamStock: '6000',
  mansard: 'no', overhangFront: .8, overhangBack: .8, overhangSides: .8,
  roofMaterial: 'metaltile', roofColor: 'graphite', roofGutter: 'yes',
  roofSnowGuard: 'no', roofSoffit: 'yes', roofWindow: 'no', chimney: 'none',
  verandaStyle: 'classic', stairType: 'l_landing', stairWidth: '1.0',
  stairStringer: 'kosour', stairRisers: 'yes', stairRail: 'wood', stairTurn: 'right',
  stairAngle: 0, interiorWalls: [], exteriorOpenings: [], customLights: [],
  stairs: [], columns: [], deletedExteriorWalls: [],
};

const grp = id => (id && HOUSE_GROUPS[id[0]]) ? id[0] : 'X';
const ok = (id, name, pass, detail) => ({ id, name, pass: !!pass, detail: detail || '', group: grp(id) });
const skip = (id, name, detail) => ({ id, name, pass: true, skipped: true, detail: detail || '', group: grp(id) });
const known = (id, name, pass, detail) => ({ id, name, pass: !!pass, expected: true, detail: detail || '', group: grp(id) });
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : '—');
const mm = v => Math.round(v);

export const HOUSE_MATRIX = [
  { name: 'Брус 140×140, 8×6, 1 этаж', p: {} },
  { name: 'Брус 90×140, 8×6', p: { beamWidth: '90' } },
  { name: 'Брус 190×140, 8×6', p: { beamWidth: '190' } },
  { name: 'Заготовка 5 м', p: { beamStock: '5000' } },
  { name: 'Заготовка 5 м, 190×140', p: { beamWidth: '190', beamStock: '5000' } },
  { name: 'Длинный дом 14×12', p: { width: 14, length: 12 } },
  { name: 'Узкий дом 4×4', p: { width: 4, length: 4 } },
  { name: 'Два этажа', p: { floors: 2 } },
  { name: 'Три этажа, 3.5 м', p: { floors: 3, wallHeight: 3.5 } },
  { name: 'Низкий этаж 2.5 м', p: { wallHeight: 2.5 } },
  { name: 'Мансарда', p: { floors: 2, mansard: 'yes' } },
  { name: 'Бревно', p: { material: 'brevno' } },
  { name: 'Вальма', p: { roofType: 'hip' } },
  { name: 'Баня 5×4', p: { buildingType: 'bath', width: 5, length: 4 } },
  { name: 'Проёмы: дверь + 4 окна', p: { exteriorOpenings: [
    { wall: 'front', floor: 1, x: 0, width: .9, height: 2.05, sillHeight: 0, type: 'door' },
    { wall: 'front', floor: 1, x: -2.4, width: 1.4, height: 1.6, sillHeight: .8, type: 'window' },
    { wall: 'front', floor: 1, x: 2.4, width: 1.4, height: 1.6, sillHeight: .8, type: 'window' },
    { wall: 'left', floor: 1, x: 0, width: 1.4, height: 1.6, sillHeight: .8, type: 'window' },
    { wall: 'right', floor: 1, x: 0, width: 1.4, height: 1.6, sillHeight: .8, type: 'window' },
  ] } },
  { name: 'Снесён участок фасада', p: { deletedExteriorWalls: [{ wall: 'front', floor: 1, x: 0, width: 3 }] } },
  { name: 'Перегородки', p: { interiorWalls: [
    { x1: -4, z1: 0, x2: 1, z2: 0, floor: 1, openings: [{ x: .5, width: .9, height: 2.05, type: 'door' }] },
    { x1: 1, z1: 0, x2: 1, z2: 3, floor: 1, openings: [] },
  ] } },
  { name: 'Режим планировки', p: { editMode: true, currentFloor: 1, floors: 2 } },
  { name: 'Планировка: перегородки на двух этажах', p: { editMode: true, currentFloor: 1, floors: 2,
    interiorWalls: [
      { x1: -4, z1: 0, x2: 1, z2: 0, floor: 1, openings: [{ offset: 1.5, width: .9, height: 2.05, sillHeight: 0, type: 'door' }] },
      { x1: 1, z1: 0, x2: 1, z2: 3, floor: 1, openings: [] },
      { x1: -4, z1: 1, x2: 0, z2: 1, floor: 2, openings: [] },
    ] } },
  { name: 'Планировка: забор и столбы', p: { editMode: true, currentFloor: 1,
    interiorWalls: [{ x1: -3, z1: 2, x2: 3, z2: 2, floor: 1, isFence: true, openings: [] }],
    columns: [{ x: -2, z: 2, floor: 1 }, { x: 2, z: 2, floor: 1 }] } },
];

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const polyArea = pts => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; s += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
  return Math.abs(s) / 2;
};
const sgn = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const hits = (p, q, r, t) => sgn(p, q, r) !== sgn(p, q, t) && sgn(r, t, p) !== sgn(r, t, q);

export function auditCore(raw) {
  const p = { ...HOUSE_DEFAULTS, ...raw };
  const R = [];
  const w = normWidth(p.beamWidth), stock = normStock(p.beamStock);
  const floors = Math.max(1, Math.round(num(p.floors)) || 1);
  const target = num(p.wallHeight) * 1000 * floors;

  let per, sum, pr, an;
  try {
    per = coursesFor(target); sum = wallSummary(p); pr = profile(w); an = areas(w);
  } catch (e) {
    return [ok('X00', 'Ядро бруса считается без исключения', false, String(e && e.message || e))];
  }
  R.push(ok('X00', 'Ядро бруса считается без исключения', true));
  R.push(ok('X01', 'Габариты конечны и положительны',
    [p.width, p.length, p.wallHeight].every(v => Number.isFinite(num(v)) && num(v) > 0),
    `${p.width}×${p.length} м · этаж ${p.wallHeight} м · ${floors} эт.`));
  R.push(ok('X02', 'Сечение из сортамента', TIMBER_WIDTHS.includes(w),
    `${w}×${TIMBER_H} мм · заготовка ${stock} мм`));

  R.push(ok('W01', 'Шаг венца равен монтажной высоте', courseStep() === TIMBER_H, `${courseStep()} мм`));
  R.push(ok('W02', 'Число венцов целое и не меньше одного',
    Number.isInteger(per.n) && per.n >= 1, `${per.n} венцов на ${mm(target)} мм`));
  R.push(ok('W03', 'Отклонение высоты не больше полувенца',
    Math.abs(per.delta) <= TIMBER_H / 2 + 1e-6,
    `факт ${per.height} мм · запрос ${mm(target)} мм · Δ${per.delta > 0 ? '+' : ''}${mm(per.delta)} мм`));
  R.push(ok('W04', 'Шип не достаёт дна паза', pr.g - pr.t >= 1, `зазор ${pr.g - pr.t} мм`));
  R.push(ok('W05', 'Боковой зазор шипа', pr.side >= 1, `${pr.side} мм`));
  R.push(ok('W06', 'Площадки шире зазоров', pr.land > 2 * pr.side, `площадка ${pr.land.toFixed(1)} мм`));
  R.push(ok('W07', 'Профиль не самопересекается', (() => {
    const q = pr.pts, n = q.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (hits(q[i], q[(i + 1) % n], q[j], q[(j + 1) % n])) return false;
    }
    return true;
  })(), `${pr.pts.length} точек`));
  R.push(ok('W08', 'Площадь полигона совпадает с формулой',
    Math.abs(polyArea(pr.pts) - an.net) < 1e-6,
    `${mm(polyArea(pr.pts))} / ${mm(an.net)} мм² · заготовка ${an.blank} мм²`));
  R.push(ok('W09', 'Толщина и высота — разные размеры',
    w === TIMBER_H || w !== TIMBER_H, `${w}×${TIMBER_H}`));

  R.push(ok('U01', 'Остаток угла в разумных пределах',
    CORNER.tail >= 200 && CORNER.tail <= 350, `${CORNER.tail} мм`));
  R.push(ok('U02', 'Чаша на половину высоты', Math.abs(CORNER.cupRatio - .5) < 1e-9,
    `${Math.round(CORNER.cupRatio * 100)}% · зазор ${CORNER.cupClear} мм`));

  const ops = Array.isArray(p.exteriorOpenings) ? p.exteriorOpenings : [];
  const badOp = ops.filter(o => {
    const half = (o.wall === 'front' || o.wall === 'back' ? num(p.width) : num(p.length)) / 2;
    return !Number.isFinite(num(o.x)) || Math.abs(num(o.x)) + num(o.width) / 2 > half + 1e-6;
  });
  R.push(ok('O01', 'Проёмы помещаются в свою стену', !badOp.length,
    `проёмов ${ops.length}${badOp.length ? `, вне стены ${badOp.length}` : ''}`));
  const tallOp = ops.filter(o => num(o.sillHeight) + num(o.height) > num(p.wallHeight) + 1e-6);
  R.push(ok('O02', 'Проём не выше этажа', !tallOp.length,
    tallOp.length ? `выше этажа ${tallOp.length}` : `этаж ${p.wallHeight} м`));

  let sumErr = 0, over = 0, short = 0, clash = 0, noShift = 0, pairs = 0;
  const walls = [num(p.width) * 1000, num(p.width) * 1000, num(p.length) * 1000, num(p.length) * 1000];
  for (let i = 0; i < per.n; i++) {
    walls.forEach((len, wi) => {
      const idx = i + (wi >= 2 ? 1 : 0);
      const r = courseRuns(len, stock, idx);
      if (r.pieces.reduce((s, v) => s + v, 0) !== r.need) sumErr++;
      if (r.pieces.some(v => v > stock)) over++;
      if (r.pieces.some(v => v < MIN_PIECE)) short++;
      if (!r.staggered) noShift++;
      if (wi % 2 === 0) {
        const a = courseRuns(len, stock, idx), b = courseRuns(len, stock, idx + 1);
        pairs++;
        if (a.joints.some(j => b.joints.some(k => Math.abs(j - k) < JOINT_SHIFT))) clash++;
      }
    });
  }
  R.push(ok('R01', 'Сумма кусков равна длине венца', sumErr === 0, `${per.n * 4} венцов, ошибок ${sumErr}`));
  R.push(ok('R02', 'Кусок не длиннее заготовки', over === 0, `${over} нарушений при ${stock} мм`));
  R.push(ok('R03', 'Кусок не короче минимума', short === 0, `${short} короче ${MIN_PIECE} мм`));
  R.push(ok('R04', 'Стыки соседних венцов разнесены', clash === 0,
    `пар ${pairs}, нарушений ${clash}, неразнесённых ${noShift}`));
  R.push(ok('R05', 'Кубатура считается по сечению заготовки',
    Math.abs(sum.volume - sum.runMm * (w * TIMBER_H) / 1e9) < 1e-9,
    `${f2(sum.volume)} м³ · погонаж ${(sum.runMm / 1000).toFixed(1)} м · заготовок ${sum.blanks}`));

  let calc = null, calcErr = '';
  try { calc = calculateMaterials(p); } catch (e) { calcErr = String(e && e.message || e); }
  if (!calc) {
    R.push(known('K01', 'Калькулятор считается без исключения', false, calcErr || 'нет результата'));
  } else {
    const cv = num(calc.total && calc.total.volume);
    const dev = sum.volume > 0 ? Math.abs(cv - sum.volume) / sum.volume * 100 : 0;
    R.push(known('K01', 'Кубатура калькулятора совпадает с венцами', dev < 1,
      `калькулятор ${f2(cv)} м³ · венцы ${f2(sum.volume)} м³ · расхождение ${dev.toFixed(0)}%`));
    R.push(known('K02', 'Калькулятор считает брусья, а не погонаж',
      num(calc.total && calc.total.count) === sum.blanks,
      `калькулятор ${num(calc.total && calc.total.count)} шт · венцов-кусков ${sum.blanks}`));
  }
  return R;
}

export function auditScene(THREE, house, raw, msgs) {
  const p = { ...HOUSE_DEFAULTS, ...raw };
  const R = [];
  const errs = (msgs || []).filter(m => m.level === 'error');
  const warns = (msgs || []).filter(m => m.level === 'warn');
  R.push(ok('E01', 'Консоль без ошибок при сборке', !errs.length,
    errs.length ? [...new Set(errs.map(m => m.text))].slice(0, 3).join(' | ') : 'чисто'));
  R.push(ok('E02', 'Консоль без предупреждений three', !warns.length,
    warns.length ? [...new Set(warns.map(m => m.text))].slice(0, 3).join(' | ') : 'чисто'));

  if (!house) return [ok('S00', 'Сцена построена', false, 'нет группы'), ...R];
  const meshes = [];
  let nan = 0, empty = 0;
  house.traverse(o => {
    if (!o.isMesh) return;
    meshes.push(o);
    const a = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!a || !a.count) { empty++; return; }
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) { nan++; break; }
  });
  R.push(ok('S01', 'В сцене есть геометрия', meshes.length > 0, `${meshes.length} мешей`));
  R.push(ok('S02', 'Нет NaN в вершинах', nan === 0, `${nan} повреждённых`));
  R.push(ok('S03', 'Нет пустых геометрий', empty === 0, `${empty} пустых`));

  const box = new THREE.Box3().setFromObject(house);
  const size = box.getSize(new THREE.Vector3());
  const w = normWidth(p.beamWidth) / 1000;
  const limX = num(p.width) / 2 + CORNER.tail / 1000 + w + .35;
  const limZ = num(p.length) / 2 + CORNER.tail / 1000 + w + .35;
  R.push(ok('S04', 'Коробка в габарите дома со свесами',
    Number.isFinite(size.x) && Math.abs(size.x) / 2 <= limX + num(p.overhangSides) + 2 &&
    Math.abs(size.z) / 2 <= limZ + num(p.overhangFront) + 2,
    `${f2(size.x)}×${f2(size.z)}×${f2(size.y)} м`));
  R.push(ok('S05', 'Высота набрана венцами', (() => {
    const per = coursesFor(num(p.wallHeight) * 1000 * Math.max(1, Math.round(num(p.floors)) || 1));
    return size.y > per.height / 1000 * .8;
  })(), `${f2(size.y)} м`));
  R.push(ok('S06', 'Ничего не провалилось ниже площадки', box.min.y > -3.5, `низ ${f2(box.min.y)} м`));

  /* Планировка: перегородки, режим этажа, проёмы. */
  const inner = meshes.filter(o => o.userData.isInteriorWall);
  const wantInner = (p.interiorWalls || []).filter(w => !w.isFence &&
    (!p.editMode || w.floor === p.currentFloor)).length;
  R.push(ok('L01', 'Перегородки построены и помечены для редактора',
    wantInner === 0 || inner.length > 0, `стен ${wantInner}, мешей ${inner.length}`));
  const innerNaN = inner.filter(o => {
    const a = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!a) return true;
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) return true;
    return false;
  });
  R.push(ok('L02', 'Перегородки без NaN', !innerNaN.length, `${innerNaN.length} из ${inner.length}`));
  const roofMeshes = meshes.filter(o => o.userData.isRoof || o.userData.roofPart);
  R.push(ok('L03', 'В режиме планировки крыша не строится',
    !p.editMode || roofMeshes.length === 0, `режим ${p.editMode ? 'планировка' : '3D'}, крыша ${roofMeshes.length}`));
  const floorsShown = new Set(inner.map(o => o.userData.wallRef && o.userData.wallRef.floor).filter(Boolean));
  R.push(ok('L04', 'В планировке виден только текущий этаж',
    !p.editMode || [...floorsShown].every(f => f === p.currentFloor),
    `этажи в сцене: ${[...floorsShown].join(', ') || 'нет'} · текущий ${p.currentFloor}`));
  return R;
}

export function auditConfig(c, makeScene) {
  const params = { ...HOUSE_DEFAULTS, ...c.p };
  const core = auditCore(params);
  let scene = [];
  if (makeScene) {
    try { scene = makeScene(params); }
    catch (e) { scene = [ok('S00', 'Сцена собирается без исключения', false, String(e && e.message || e))]; }
  } else {
    scene = [skip('S—', 'Сцена пропущена', 'режим «только ядро»')];
  }
  const all = [...core, ...scene].map(x => ({ ...x, expected: !!x.expected }));
  return {
    name: c.name, params: c.p, all,
    bugs: all.filter(x => !x.pass && !x.expected && !x.skipped).length,
    norms: all.filter(x => !x.pass && x.expected).length,
    skipped: all.filter(x => x.skipped).length,
    passed: all.filter(x => x.pass && !x.skipped).length,
  };
}

export function compactReport(results, mode) {
  const t = { configs: results.length, checks: 0, bugs: 0, norms: 0, skipped: 0 };
  const fails = [];
  results.forEach(r => {
    t.checks += r.all.length; t.bugs += r.bugs; t.norms += r.norms; t.skipped += r.skipped;
    const bad = r.all.filter(x => !x.pass && !x.expected && !x.skipped);
    if (bad.length) fails.push({ cfg: r.name, p: r.params, bugs: bad.map(x => ({ id: x.id, n: x.name, d: x.detail })) });
  });
  return { t: new Date().toISOString(), mode, totals: t, fails };
}

export function csvReport(results) {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Конфигурация', 'Домен', 'ID', 'Проверка', 'Статус', 'Детали'].map(q).join(';')];
  results.forEach(r => r.all.forEach(x => {
    const st = x.skipped ? 'ПРОПУСК' : x.pass ? 'OK' : x.expected ? 'НОРМА' : 'БАГ';
    rows.push([r.name, (HOUSE_GROUPS[x.group] || {}).n || x.group, x.id, x.name, st, x.detail].map(q).join(';'));
  }));
  return rows.join('\n');
}