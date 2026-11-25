import './roof.css';
import {
  createRoof, SEATS, TIEMODE, COVERS, SNOW, WIND, RHO,
  ROOF_STAGES, RATES, resetRates, saveRates, roofPrice,
  fmt, f1, f2, f3, mm, cl, code39,
  planLongMembers, LONG_STRATEGIES,
  cutCSV, nestCSV, assemblyCSV, packageJSON, download
} from './index.js';
import { createRoofStage, ROOF_LAYERS } from './roof-render.js';
import { MANSARD_SCHEMES } from './roof-mansard.js';

/* ── коллектор ошибок: тест читает его, а не ловит глазами ── */
const RT_ERRORS = [];
addEventListener('error', e => RT_ERRORS.push(String(e.message || e)));
addEventListener('unhandledrejection', e => RT_ERRORS.push('promise: ' + String(e.reason)));
const _cerr = console.error.bind(console);
console.error = (...a) => { RT_ERRORS.push(a.map(v => String(v && v.message || v)).join(' ')); _cerr(...a); };

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const roof = createRoof();
const host = $('#stage');
let stage3d = null, TAB = 'calc', playing = false, playT = 0, activeNode = null;
let panelDirty = true, needBuild = true, LONGPLAN = null, hoverPiece = null, lastPick = 0;
let buildCount = 0, lastBuildMs = 0;
const VIS = {}; ROOF_LAYERS.forEach(l => VIS[l.id] = 1);
const P = () => roof.get();

/* дефолты мансарды, которых может не быть в ROOF_DEFAULTS */
{
  const p = P(), add = {};
  if (p.mansard === undefined) add.mansard = 0;
  if (p.mansardScheme === undefined) add.mansardScheme = 'broken';
  if (p.mansardRoomH === undefined) add.mansardRoomH = 2.4;
  if (p.mansardKnee === undefined) add.mansardKnee = 0;
  if (p.mansardLowPitch === undefined) add.mansardLowPitch = 62;
  if (p.mansardHighPitch === undefined) add.mansardHighPitch = 28;
  if (p.mansardAutoSection === undefined) add.mansardAutoSection = 1;
  if (p.mansardUpperTruss === undefined) add.mansardUpperTruss = 1;
  if (p.economy === undefined) add.economy = 1;
  if (Object.keys(add).length) roof.patch(add);
}

let toastT;
const toast = t => { const e = $('#toast'); if (!e) return; e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2600); };
function bundle() {
  const d = roof.all();
  const lp = LONGPLAN || planLongMembers(d.model, P(), d.pieces);
  return { d, lp, pr: roofPrice([...d.lines, ...lp.bom]) };
}

const NODES = [
  { id: 1, t: 'Ригель сбоку — болтовой узел', k: ['Заход на стропило', 'Одиночный срез', '7d / 3d'],
    d: m => `Накладной ригель ${mm(m.tt)}×${mm(m.th)} прижат к боковой грани стропилы и заходит на неё на ${mm(m.fullOverlap)} мм. ${m.boltN} болтов М${m.boltD} насквозь: зажим ${mm(m.tt + m.rt)} мм, шайба под головкой и под гайкой.`,
    at: m => ({ x: (m.fullLo + m.fullHi) / 2, y: m.tieY + m.th / 2, z: (m.tieZ[0] || 0) + m.rt / 2 + m.tt / 2 }), dist: 1.5 },
  { id: 2, t: 'Опирание стропил', k: ['Седло и упор', 'Врубка ≤ ¼', 'Отрыв ветра'],
    d: m => m.seatMode === 'notch'
      ? `Площадка врубки ${mm(m.seatW)} мм, глубина ${mm(m.notchPerp)} мм (${(m.notchRatio * 100).toFixed(0)}% сечения). Пятка — вертикальный рез, упирается в мауэрлат.`
      : `Опорный брусок ${mm(m.pw)}×${mm(m.blockH)} мм с седлом: площадка ${mm(m.seatW)} мм, врубка ${mm(m.notchPerp)} мм, вертикальный упор ${mm(m.blockH - m.blockFloorY)} мм принимает пятку.`,
    at: m => ({ x: m.span / 2 + m.pw / 2, y: m.blockH + .02, z: (m.rafters.find(r => !r.jack) || { z: 0 }).z + .06 }), dist: 1.5 },
  { id: 3, t: 'Коньковый узел', k: ['Прогон полной высоты', 'Стойки ≤ 2.5 м'],
    d: m => `Вертикальный рез стропилы ${mm(m.plumbH)} мм, прогон ${m.ridgeBeamSect.join('×')} мм — опирание всей гранью.`,
    at: m => ({ x: 0, y: m.beamTop - m.ridgeBeamSect[1] / 2000, z: m.ridgeHalf * .5 }), dist: 2.2 },
  { id: 4, t: 'Подкос', k: ['Угол в пятке', 'Накладка в голове'],
    d: m => `Подкос под ${(m.braceAngle * 180 / Math.PI).toFixed(0)}° от низа стойки к низу стропил. Пролёт снижен до ${f2(m.runHoriz)} м.`,
    at: m => ({ x: m.dBrace * .55, y: (m.sleeperTop + m.braceHeadY) / 2, z: (m.postZ[0] || 0) + .04 }), dist: 1.6 },
  { id: 5, t: 'Накосная балка и полунога', k: ['Скос кромки', 'Cheek-рез'], hip: true,
    d: m => `Накосное ${mm(m.hipW)}×${mm(m.hipDepth)} — пакет из ${m.hipLam} досок, длина ${f2(m.hips[0] ? m.hips[0].full : 0)} м. Торец полуноги — косой рез в боковой плоскости накосного.`,
    at: m => ({ x: m.W * .24, y: m.apex * .6, z: m.L * .24 }), dist: 2.4 },
  { id: 6, t: 'Мансардная комната', k: ['Потолок = ригель', 'Без колонн'], mansard: true,
    d: m => `Комната ${m.mansard.roomWidth.toFixed(2)}×${m.length.toFixed(1)} м, потолок ${m.mansard.roomH.toFixed(2)} м. Ригель перелома работает потолком и затяжкой. Центральные опоры исключены.`,
    at: m => ({ x: 0, y: m.mansard.roomH * .55, z: 0 }), dist: 4.2 }
];

const SPEC = [
  { g: 'Мансарда', id: 'mansard', c: [
    { k: 'mansard', t: 'chip', n: 'Мансардный этаж' },
    { k: 'mansardScheme', t: 'select', n: 'Схема без центральных опор', o: Object.entries(MANSARD_SCHEMES).map(([k, v]) => [k, v.short]) },
    { k: 'mansardRoomH', t: 'range', n: 'Высота потолка', min: 2.0, max: 3.2, step: .05, u: 'м', need: 1 },
    { k: 'mansardKnee', t: 'range', n: 'Аттиковая стенка', min: 0, max: 1.8, step: .05, u: 'м', need: 1 },
    { k: 'mansardLowPitch', t: 'range', n: 'Нижний уклон', min: 45, max: 75, step: 1, u: '°', need: 'broken' },
    { k: 'mansardHighPitch', t: 'range', n: 'Верхний уклон', min: 15, max: 40, step: 1, u: '°', need: 'broken' },
    { k: 'mansardAutoSection', t: 'chip', n: 'Автоподбор сечения', need: 1 },
    { k: 'mansardUpperTruss', t: 'chip', n: 'Ферма над потолком', need: 'broken' },
    { k: 'economy', t: 'chip', n: 'Экономия опор' }] },
  { g: 'Геометрия', c: [
    { k: 'type', t: 'select', n: 'Форма', o: [['gable', 'Двускатная'], ['hip', 'Вальмовая']] },
    { k: 'span', t: 'range', n: 'Пролёт', min: 4, max: 14, step: .5, u: 'м' },
    { k: 'length', t: 'range', n: 'Длина по коньку', min: 4, max: 18, step: .5, u: 'м' },
    { k: 'pitch', t: 'range', n: 'Уклон', min: 8, max: 50, step: 1, u: '°' },
    { k: 'eave', t: 'range', n: 'Карнизный свес', min: .3, max: 1.2, step: .05, u: 'м' },
    { k: 'rake', t: 'range', n: 'Фронтонный свес', min: .3, max: 1, step: .05, u: 'м' }] },
  { g: 'Опирание стропил', c: [
    { k: 'seat', t: 'select', n: 'Узел опирания', o: Object.entries(SEATS).map(([k, v]) => [k, v.s]) },
    { k: 'rafter', t: 'select', n: 'Сечение стропилы', o: [['50x150', '50×150'], ['50x200', '50×200'], ['50x250', '50×250'], ['60x200', '60×200'], ['60x250', '60×250']] },
    { k: 'plate', t: 'select', n: 'Мауэрлат', o: [['100x150', '100×150'], ['150x150', '150×150'], ['200x200', '200×200']] },
    { k: 'hipW', t: 'select', n: 'Накосное', o: [['100', '100 (2×50)'], ['150', '150 (3×50)'], ['200', '200 (4×50)']] },
    { k: 'step', t: 'select', n: 'Шаг стропил', o: [[.6, '600 мм'], [.9, '900 мм'], [1, '1000 мм']] },
    { k: 'scheme', t: 'select', n: 'Схема', o: [['nasl', 'Наслонная'], ['vis', 'Висячая']] },
    { k: 'joists', t: 'chip', n: 'Балки перекрытия' }, { k: 'braces', t: 'chip', n: 'Подкосы' }] },
  { g: 'Ригель', c: [
    { k: 'tieMode', t: 'select', n: 'Расположение', o: Object.entries(TIEMODE).map(([k, v]) => [k, v.s]) },
    { k: 'tieSect', t: 'select', n: 'Сечение', o: [['50x100', '50×100'], ['50x150', '50×150'], ['50x200', '50×200'], ['60x200', '60×200']] },
    { k: 'tiePos', t: 'range', n: 'Высота', min: .35, max: .8, step: .01, u: 'от низа' },
    { k: 'tieSides', t: 'select', n: 'Накладки', o: [[1, 'С одной стороны'], [2, 'С двух сторон']] },
    { k: 'boltD', t: 'select', n: 'Болты', o: [[10, 'М10'], [12, 'М12'], [16, 'М16'], [20, 'М20']] },
    { k: 'boltN', t: 'select', n: 'Болтов на узел', o: [[2, '2 шт'], [4, '4 шт'], [6, '6 шт'], [8, '8 шт']] },
    { k: 'ties', t: 'chip', n: 'Ригели' }, { k: 'fix', t: 'chip', n: 'Крепёж' }] },
  { g: 'Нагрузки и древесина', c: [
    { k: 'snowZone', t: 'select', n: 'Снеговой район', o: Object.keys(SNOW).map(k => [k, `${k} — ${SNOW[k]} кПа`]) },
    { k: 'windZone', t: 'select', n: 'Ветровой район', o: Object.keys(WIND).map(k => [k, `${k} — ${WIND[k]} кПа`]) },
    { k: 'grade', t: 'select', n: 'Сорт сосны', o: [['1', '1 сорт'], ['2', '2 сорт'], ['3', '3 сорт']] },
    { k: 'moisture', t: 'range', n: 'Влажность', min: 10, max: 30, step: 1, u: '%' }] },
  { g: 'Распил и длинные детали', c: [
    { k: 'stock', t: 'select', n: 'Заготовка', o: [[6000, '6000 мм'], [6500, '6500 мм'], [4000, '4000 мм'], [3000, '3000 мм']] },
    { k: 'longStrategy', t: 'select', n: 'Если длиннее заготовки', o: Object.entries(LONG_STRATEGIES).map(([k, v]) => [k, v]) },
    { k: 'allow', t: 'range', n: 'Припуск на деталь', min: 0, max: 60, step: 5, u: 'мм' },
    { k: 'kerf', t: 'range', n: 'Пропил', min: 2, max: 8, step: 1, u: 'мм' },
    { k: 'tol', t: 'select', n: 'Допуск длины', o: [[1, '±1 мм'], [2, '±2 мм'], [3, '±3 мм']] },
    { k: 'prefix', t: 'text', n: 'Префикс марки' }] },
  { g: 'Пирог и покрытие', c: [
    { k: 'cover', t: 'select', n: 'Покрытие', o: Object.entries(COVERS).map(([k, v]) => [k, v.n]) },
    { k: 'insul', t: 'select', n: 'Утепление', o: [[0, 'Холодный чердак'], [150, '150 мм'], [200, '200 мм'], [250, '250 мм'], [300, '300 мм'], [400, '400 мм']] },
    { k: 'deck', t: 'select', n: 'Основание', o: [['auto', 'По покрытию'], ['solid', 'Сплошное OSB']] },
    { k: 'gutter', t: 'chip', n: 'Водосток' }, { k: 'snow', t: 'chip', n: 'Снегозадержатели' }, { k: 'soffit', t: 'chip', n: 'Подшивка' }] },
  { g: 'Отображение', c: [
    { k: 'explode', t: 'range', n: 'Разлёт слоёв', min: 0, max: 1, step: .01, u: '', live: 1 },
    { k: 'sec', t: 'range', n: 'Секущая', min: -1, max: 1, step: .01, u: '', live: 1 },
    { k: 'secOn', t: 'chip', n: 'Разрез' }, { k: 'wire', t: 'chip', n: 'Каркас' },
    { k: 'grid', t: 'chip', n: 'Сетка' }, { k: 'marks', t: 'chip', n: 'Марки' },
    { k: 'quality', t: 'select', n: 'Детализация', o: [['high', 'Высокая'], ['low', 'Быстрая']] }] }
];
const STRK = new Set(['type', 'seat', 'tieMode', 'tieSect', 'rafter', 'plate', 'hipW', 'scheme', 'snowZone', 'windZone', 'grade', 'cover', 'deck', 'quality', 'prefix', 'longStrategy', 'mansardScheme']);
const VIEWK = new Set(['explode', 'sec', 'secOn', 'wire', 'grid', 'marks']);

function mansardInfo() {
  const p = P();
  if (!p.mansard) return `<div class="ms-note">Мансарда выключена — крыша считается со стойками под коньком. Включите, чтобы убрать центральные опоры и получить комнату с плоским потолком.</div>`;
  let d; try { d = roof.all(); } catch (e) { return `<div class="ms-warn">Ошибка расчёта: ${e.message}</div>`; }
  const m = d.model, S = d.structure, MS = m.mansard;
  if (!MS) return `<div class="ms-warn">Мансарда не посчитана</div>`;
  const badH = MS.roomHeight < 2.2, badW = MS.usableWidth < 2.5, posts = m.postZ.length + d.plan.posts.length;
  const gov = S.govTag === 'upper' ? 'верх' : S.govTag === 'lower' ? 'низ' : 'скат';
  const w = [...(MS.warnings || []), ...(d.plan.warnings || [])];
  return `<div class="ms-info">
    <div><span>Комната</span><b class="${badW ? 'bad' : ''}">${MS.roomWidth.toFixed(2)} × ${m.length.toFixed(1)} м</b></div>
    <div><span>Потолок (ригель)</span><b class="${badH ? 'bad' : 'good'}">${MS.roomH.toFixed(2)} м</b></div>
    <div><span>Площадь</span><b>${MS.usableArea.toFixed(1)} м²</b></div>
    <div><span>Стропило</span><b>${Math.round(m.rt * 1000)}×${Math.round(m.rd * 1000)}</b></div>
    <div><span>Изгиб / прогиб (${gov})</span><b class="${Math.max(S.utilR, S.utilD) > 1 ? 'bad' : ''}">${Math.round(S.utilR * 100)}% / ${Math.round(S.utilD * 100)}%</b></div>
    <div><span>Ригель</span><b>${MS.tieN.toFixed(1)} кН · ${Math.round(MS.tieUtil * 100)}%</b></div>
    ${MS.ridgeBeam ? `<div><span>Прогон клеёный</span><b>${MS.ridgeBeam.sect.join('×')}</b></div>` : ''}
    <div><span>Опор в комнате</span><b class="${posts ? 'bad' : 'good'}">${posts}</b></div>
    <div><span>Пиломатериал</span><b>${m.wood.toFixed(2)} м³</b></div>
  </div><div class="ms-note">${MANSARD_SCHEMES[MS.scheme].d}</div>
  ${w.length ? `<div class="ms-warn">${w.map(x => '⚠ ' + x).join('<br>')}</div>` : ''}`;
}

function renderCtl() {
  const b = $('#ctlBody'); if (!b) return;
  const scroll = b.scrollTop;
  b.innerHTML = '';
  const p = P();
  SPEC.forEach(sec => {
    const g = document.createElement('div'); g.className = 'grp';
    if (sec.id) g.dataset.sec = sec.id;
    g.innerHTML = `<button class="ghead" type="button" aria-expanded="true"><span>${sec.g}</span><span class="ar">▼</span></button><div class="gbody"></div>`;
    const hd = g.querySelector('.ghead');
    hd.onclick = () => { const c = g.classList.toggle('cl'); hd.setAttribute('aria-expanded', String(!c)); };
    const body = g.querySelector('.gbody');
    sec.c.forEach(c => {
      if (c.need === 1 && !p.mansard) return;
      if (c.need === 'broken' && !(p.mansard && p.mansardScheme === 'broken')) return;
      const id = 'ctl-' + c.k;
      if (c.t === 'chip') {
        const e = document.createElement('button'); e.type = 'button'; e.id = id; e.dataset.k = c.k; e.dataset.t = 'chip';
        e.className = 'chip' + (p[c.k] ? ' on' : ''); e.setAttribute('aria-pressed', String(!!p[c.k]));
        e.innerHTML = `<span class="sw" style="background:${p[c.k] ? 'var(--green)' : '#3b4a41'}"></span>${c.n}`;
        e.onclick = () => { roof.set(c.k, p[c.k] ? 0 : 1); needBuild = true; renderCtl(); panelDirty = true; };
        body.appendChild(e); return;
      }
      const w = document.createElement('div'); w.className = 'ctl';
      const lb = document.createElement('label'); lb.setAttribute('for', id); lb.innerHTML = `<span>${c.n}</span>`;
      if (c.t === 'range') { const v = document.createElement('span'); v.className = 'val'; v.textContent = `${p[c.k]} ${c.u}`; lb.appendChild(v); }
      w.appendChild(lb);
      if (c.t === 'range') {
        const i = document.createElement('input'); i.type = 'range'; i.id = id; i.dataset.k = c.k; i.dataset.t = 'range';
        i.min = c.min; i.max = c.max; i.step = c.step; i.value = p[c.k]; i.setAttribute('aria-label', c.n);
        i.oninput = e => {
          const v = parseFloat(e.target.value);
          lb.querySelector('.val').textContent = `${v} ${c.u}`;
          roof.set(c.k, v);
          if (c.k === 'sec' && !P().secOn) { roof.set('secOn', 1); renderCtl(); }
          if (c.live || VIEWK.has(c.k)) pushView(); else { needBuild = true; panelDirty = true; }
          if (sec.id === 'mansard') refreshMansardInfo();
        };
        i.onchange = () => { if (!c.live && !VIEWK.has(c.k)) renderCtl(); };
        w.appendChild(i);
      } else if (c.t === 'text') {
        const i = document.createElement('input'); i.type = 'text'; i.id = id; i.dataset.k = c.k; i.dataset.t = 'text';
        i.value = p[c.k]; i.maxLength = 6; i.setAttribute('aria-label', c.n);
        i.oninput = e => { roof.set('prefix', (e.target.value || 'КР').toUpperCase().replace(/[^A-ZА-Я0-9]/gi, '').slice(0, 6) || 'КР'); needBuild = true; panelDirty = true; };
        w.appendChild(i);
      } else {
        const s = document.createElement('select'); s.id = id; s.dataset.k = c.k; s.dataset.t = 'select'; s.setAttribute('aria-label', c.n);
        c.o.forEach(([v, n]) => { const o = document.createElement('option'); o.value = v; o.textContent = n; if (String(p[c.k]) === String(v)) o.selected = true; s.appendChild(o); });
        s.onchange = e => { const v = e.target.value; roof.set(c.k, STRK.has(c.k) ? v : (v !== '' && !isNaN(+v) ? +v : v)); needBuild = true; renderCtl(); panelDirty = true; };
        w.appendChild(s);
      }
      body.appendChild(w);
    });
    if (sec.id === 'mansard') {
      const info = document.createElement('div'); info.className = 'ms-box'; info.innerHTML = mansardInfo();
      body.appendChild(info);
      const acts = document.createElement('div'); acts.className = 'ms-acts';
      acts.innerHTML = `<button type="button" data-act="fit">Вписать вид</button><button type="button" data-act="sect">Разрез комнаты</button><button type="button" data-act="msReset">Сброс мансарды</button>`;
      acts.querySelector('[data-act="fit"]').onclick = () => stage3d?.frame();
      acts.querySelector('[data-act="sect"]').onclick = () => { const on = !P().secOn; roof.patch({ secOn: on ? 1 : 0, sec: 0 }); renderCtl(); pushView(); };
      acts.querySelector('[data-act="msReset"]').onclick = () => {
        roof.patch({ mansard: 1, mansardScheme: 'broken', mansardRoomH: 2.4, mansardKnee: 0, mansardLowPitch: 62, mansardHighPitch: 28, mansardAutoSection: 1, mansardUpperTruss: 1, insul: 250 });
        needBuild = true; renderCtl(); panelDirty = true; toast('Мансарда сброшена к базовой');
      };
      body.appendChild(acts);
    }
    b.appendChild(g);
  });
  const gn = document.createElement('div'); gn.className = 'grp'; gn.dataset.sec = 'nodes';
  gn.innerHTML = `<button class="ghead" type="button" aria-expanded="true"><span>Узлы конструкции</span><span class="ar">▼</span></button><div class="gbody"></div>`;
  const gh = gn.querySelector('.ghead'); gh.onclick = () => { const c = gn.classList.toggle('cl'); gh.setAttribute('aria-expanded', String(!c)); };
  b.appendChild(gn);
  const nl = gn.querySelector('.gbody');
  NODES.filter(n => (!n.hip || P().type === 'hip') && (!n.mansard || P().mansard)).forEach(n => {
    const e = document.createElement('button'); e.type = 'button'; e.className = 'nodeBtn' + (activeNode === n.id ? ' on' : '');
    e.dataset.node = n.id;
    e.innerHTML = `<i>${n.id}</i><span>${n.t}<em>${n.k.join(' · ')}</em></span>`;
    e.onclick = () => focusNode(n.id); nl.appendChild(e);
  });
  b.scrollTop = scroll;
}
function refreshMansardInfo() { const box = document.querySelector('[data-sec="mansard"] .ms-box'); if (box) box.innerHTML = mansardInfo(); }

function renderLayers() {
  const d = roof.all(), m = d.model, p = P();
  const bx = $('#pieRows'); if (!bx) return; bx.innerHTML = '';
  const order = ['cover', 'batten', 'counter', 'membrane', 'frame', 'fix', 'insul', 'vapor', 'lining', 'seat', 'plate', 'joists', 'ridge', 'trim', 'gutter', 'snow', 'soffit'];
  const th = id => ({ cover: p.cover === 'shingle' ? 'гонты' : 'лист 28', batten: m.solid ? 'OSB 12' : '25×100',
    counter: '50×50', membrane: '0.5 мм', frame: m.rafters.length + ' ног',
    fix: (m.fix.slide + m.fix.angle + m.fix.bolt) + ' шт', insul: m.insulMM + ' мм', vapor: '0.2 мм',
    lining: '16 мм', seat: mm(m.pw) + '×' + mm(m.blockH), plate: m.plateLenZ.toFixed(1) + ' м',
    joists: m.joistN + ' шт', ridge: m.ridgeLen.toFixed(1) + ' м', trim: (m.eaveLen + m.rakeLen).toFixed(0) + ' м',
    gutter: m.spouts + ' стояка', snow: m.faces.reduce((s, f) => s + (f.snowRows || []).length, 0) + ' ряд', soffit: f1(m.soffitA) + ' м²' })[id] || '';
  const exists = id => {
    if ((id === 'insul' || id === 'vapor') && !m.warm) return false;
    if (id === 'lining' && !m.warm && !m.mansardOn) return false;
    if (id === 'seat' && (m.seatMode === 'notch' || m.mansardOn)) return false;
    if (id === 'joists' && !m.joistsOn) return false;
    if (id === 'fix' && !p.fix) return false;
    if (id === 'gutter' && !p.gutter) return false;
    if (id === 'snow' && !p.snow) return false;
    if (id === 'soffit' && !p.soffit) return false;
    return true;
  };
  let n = 0;
  order.forEach(id => {
    if (!exists(id)) return; n++;
    const l = ROOF_LAYERS.find(x => x.id === id);
    const r = document.createElement('button'); r.type = 'button'; r.className = 'prow' + (VIS[id] ? '' : ' off');
    r.dataset.layer = id; r.setAttribute('aria-pressed', String(!!VIS[id]));
    r.innerHTML = `<i style="background:${l.c}"></i><span>${l.n}</span><em>${th(id)}</em>`;
    r.onclick = () => { VIS[id] = VIS[id] ? 0 : 1; pushView(); renderLayers(); };
    bx.appendChild(r);
  });
  $('#pieCount').textContent = n + ' шт';
}
$('#pieAll').onclick = () => { ROOF_LAYERS.forEach(l => VIS[l.id] = 1); pushView(); renderLayers(); };
$('#pieOff').onclick = () => { ROOF_LAYERS.forEach(l => VIS[l.id] = 0); pushView(); renderLayers(); };
$('#pieStr').onclick = () => { ROOF_LAYERS.forEach(l => VIS[l.id] = ['joists', 'plate', 'seat', 'frame', 'fix', 'counter', 'batten'].includes(l.id) ? 1 : 0); pushView(); renderLayers(); toast('Каркас с крепежом'); };

function pushView() {
  if (!stage3d) return; const p = P();
  stage3d.setView({ stage: p.stage, explode: p.explode, wire: p.wire, grid: p.grid, marks: p.marks, secOn: p.secOn, sec: p.sec, vis: VIS });
}
function focusNode(id) {
  const n = NODES.find(x => x.id === id), m = roof.model(); if (!n || !m) return;
  if (n.hip && P().type !== 'hip') return;
  if (n.mansard && !P().mansard) return;
  const T = n.at(m); if (![T.x, T.y, T.z].every(Number.isFinite)) return;
  activeNode = id;
  roof.patch({ explode: 0, secOn: 1, sec: cl(T.z / (m.L / 2 + 1), -.98, .98), stage: Math.max(P().stage, n.id === 5 ? 8 : 6) });
  stage3d.focus(T, n.dist);
  $('#nodeT').textContent = `Узел ${n.id}. ${n.t}`;
  $('#nodeD').textContent = typeof n.d === 'function' ? n.d(m) : n.d;
  $('#nodeK').innerHTML = n.k.map(k => `<i>${k}</i>`).join('');
  $('#nodeCard').style.display = 'block'; $('#pie').classList.add('shift');
  renderCtl(); syncAsm(); pushView(); panelDirty = true;
}
$('#nodeX').onclick = () => { activeNode = null; $('#nodeCard').style.display = 'none'; $('#pie').classList.remove('shift'); roof.set('secOn', 0); stage3d.endTween(); renderCtl(); pushView(); };

function syncAsm() {
  const p = P(), st = cl(p.stage, 0, 13), S = ROOF_STAGES[st], pieces = roof.pieces();
  $('#asmRange').value = st; $('#asmNum').textContent = `${st}/13`; $('#asmT').textContent = S.t;
  const ms = pieces.filter(x => x.stage === st), cnt = ms.reduce((s, x) => s + x.qty, 0);
  $('#asmC').textContent = cnt ? `${cnt} дет · ${ms.length} марок` : '—';
  $('#asmD').textContent = S.d;
  $('#asmMarks').classList.toggle('on', !!p.marks);
}
const stopPlay = () => { playing = false; $('#asmPlay').classList.remove('on'); $('#asmPlay').textContent = '▶'; };
$('#asmRange').oninput = e => { roof.set('stage', +e.target.value); stopPlay(); syncAsm(); pushView(); panelDirty = true; };
$('#asmPrev').onclick = () => { roof.set('stage', Math.max(0, P().stage - 1)); stopPlay(); syncAsm(); pushView(); panelDirty = true; };
$('#asmNext').onclick = () => { roof.set('stage', Math.min(13, P().stage + 1)); stopPlay(); syncAsm(); pushView(); panelDirty = true; };
$('#asmPlay').onclick = () => {
  if (playing) { stopPlay(); return; }
  roof.patch({ stage: 0, marks: 1 }); playT = 0; playing = true;
  $('#asmPlay').classList.add('on'); $('#asmPlay').textContent = '❚❚';
  syncAsm(); pushView(); renderCtl(); panelDirty = true; toast('Сборка по этапам');
};
$('#asmMarks').onclick = () => { roof.set('marks', P().marks ? 0 : 1); syncAsm(); pushView(); renderCtl(); };

function setTot(cap, sum, sub, a, b, c) {
  $('#totCap').textContent = cap; $('#tSum').textContent = sum; $('#tSub').textContent = sub;
  $('#s1l').textContent = a[0]; $('#s1').textContent = a[1];
  $('#s2l').textContent = b[0]; $('#s2').textContent = b[1];
  $('#s3l').textContent = c[0]; $('#s3').textContent = c[1];
}
function lineRow(l, showRate) {
  const r = document.createElement('div'); r.className = 'bl';
  const bd = RATES[l.k] && RATES[l.k].verified ? '<span class="badge ok">✓</span>' : '<span class="badge mk">?</span>';
  r.innerHTML = `<div class="n">${l.n}${bd}</div><div class="s">${fmt(l.sum)} ₽</div>
    <div class="q">${f2(l.q)} ${l.u}${l.note ? ' · ' + l.note : ''}</div><div class="u">${showRate ? fmt(l.rate) : ''}</div>`;
  return r;
}
function renderRight() {
  const { d, lp, pr } = bundle(), p = P(), m = d.model, S = d.structure, pcs = d.pieces, NS = d.nesting;
  const totalQty = pcs.reduce((s, i) => s + i.qty, 0), moist = Math.min(20, +p.moisture);
  const jacks = m.rafters.filter(r => r.jack).length;
  $('#hArea').textContent = f1(m.area) + ' м²';
  $('#hWood').textContent = f2(m.wood) + ' м³';
  $('#hNotch').textContent = Math.round(m.notchRatio * 100) + '%';
  $('#hNotch').parentElement.classList.toggle('bad', m.notchRatio > .33);
  $('#hNotch').parentElement.classList.toggle('good', m.notchRatio <= .13);
  $('#hTie').textContent = f1(S.tieN) + ' кН';
  $('#hTie').parentElement.classList.toggle('bad', S.utilB > 1 || S.utilT > 1);
  $('#hBolt').textContent = Math.round(S.utilB * 100) + '%';
  $('#hBolt').parentElement.classList.toggle('bad', S.utilB > 1);
  $('#hBolt').parentElement.classList.toggle('good', S.utilB <= .85);
  $('#hPcs').textContent = totalQty + ' / ' + pcs.length;
  $('#tag').textContent = `${m.rafters.length} ног · ${jacks} полуног · ${pcs.length} марок`;
  const body = $('#rightBody'); body.innerHTML = ''; body.dataset.tab = TAB;

  if (TAB === 'rate') {
    setTot('Ставки', fmt(RATES.lumberBoard.v) + ' ₽/м³', 'Зелёное — подтверждено, жёлтое — проверить',
      ['Пиломат.', fmt(RATES.lumberBoard.v)], ['Распил', fmt(RATES.sawCut.v)], ['Сборка', fmt(RATES.wKit.v)]);
    const n = document.createElement('div'); n.className = 'note';
    n.innerHTML = '<b>Подтверждено:</b> пиломатериал 17 000 ₽/м³, брус 23 000 ₽/м³, кладка 8 500 ₽/м³. Остальное — ориентиры, не проверены по прайсу.';
    body.appendChild(n);
    const gr = {}; Object.entries(RATES).forEach(([k, r]) => { (gr[r.g] = gr[r.g] || []).push([k, r]); });
    Object.entries(gr).forEach(([g, rs]) => {
      const dd = document.createElement('div'); dd.className = 'bg';
      dd.innerHTML = `<div class="bgh"><span>${g}</span><em>${rs.filter(x => x[1].verified).length}/${rs.length} подтв.</em></div>`;
      const inner = document.createElement('div'); inner.style.padding = '4px 11px 9px';
      rs.forEach(([k, r]) => {
        const id = 'rate-' + k, row = document.createElement('div'); row.className = 'rate';
        const lb = document.createElement('label'); lb.setAttribute('for', id);
        lb.innerHTML = `${r.n}<span class="badge ${r.verified ? 'ok' : 'mk'}">${r.verified ? 'подтв.' : 'проверить'}</span><span class="ru">${r.u}${r.hint ? ' · ' + r.hint : ''}</span>`;
        row.appendChild(lb);
        const i = document.createElement('input'); i.type = 'number'; i.id = id; i.dataset.rate = k; i.min = 0; i.step = r.v >= 1000 ? 100 : 1; i.value = r.v;
        i.setAttribute('aria-label', r.n + ', ' + r.u);
        i.oninput = e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) { RATES[k].v = v; saveRates(); panelDirty = true; } };
        row.appendChild(i); inner.appendChild(row);
      });
      dd.appendChild(inner); body.appendChild(dd);
    });
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.act = 'ratesReset';
    b.style.width = '100%'; b.textContent = 'Вернуть исходные ставки';
    b.onclick = () => { resetRates(); panelDirty = true; toast('Ставки возвращены'); };
    body.appendChild(b); return;
  }
  if (TAB === 'est') {
    setTot('Итого по крыше', '~' + fmt(Math.round(pr.total / 1000) * 1000) + ' ₽',
      `${m.cv.n} · ${m.mansardOn ? 'мансарда ' + m.insulMM + ' мм' : m.warm ? 'тёплая ' + m.insulMM + ' мм' : 'холодный чердак'} · ${f1(m.area)} м²`,
      ['Материалы', fmt(pr.mat)], ['Распил', fmt(pr.saw)], ['Работа', fmt(pr.work)]);
    const n = document.createElement('div'); n.className = 'note';
    n.innerHTML = 'Распил, маркировка, доставка и решение по длинным деталям выделены отдельно — это цена <b>комплекта</b>. Жёлтые ставки не проверены по прайсу.';
    body.appendChild(n);
    const gr = {}; pr.lines.forEach(l => { (gr[l.g] = gr[l.g] || []).push(l); });
    Object.entries(gr).forEach(([g, ls]) => {
      const sum = ls.reduce((s, l) => s + l.sum, 0);
      const dd = document.createElement('div'); dd.className = 'bg';
      dd.innerHTML = `<div class="bgh"><span>${g}</span><em>${fmt(sum)} ₽</em></div>`;
      ls.forEach(l => dd.appendChild(lineRow(l, l.g !== 'Работа' && l.g !== 'Распил')));
      body.appendChild(dd);
    });
    return;
  }
  if (TAB === 'cut') {
    setTot('Ведомость распила', NS.boards + ' загот.',
      `${totalQty} деталей · ${pcs.length} марок · ${f2(NS.vol)} м³ · отход ${Math.round(NS.waste * 100)}%`,
      ['Объём', f2(NS.vol) + ' м³'], ['Масса', fmt(NS.vol * RHO) + ' кг'], ['Резов', fmt(pcs.reduce((s, i) => s + i.cuts, 0))]);
    const n = document.createElement('div'); n.className = 'note amb';
    n.innerHTML = `<b>Лесопилке:</b> сорт ${S.G.n} по ГОСТ 8486, влажность ≤${moist}%, антисептик по всем граням. Заготовка ${NS.stock} мм, припуск ${p.allow} мм, пропил ${NS.kerf} мм, допуск ±${p.tol} мм. Углы — к оси детали и на торцовочной пиле.`;
    body.appendChild(n);
    if (lp.over.length) {
      const w = document.createElement('div'); w.className = 'note err';
      w.innerHTML = `<b>${lp.over.length} марок длиннее ${lp.usable} мм.</b> Решение: ${LONG_STRATEGIES[lp.strategy]}.` +
        (lp.notes.length ? '<br>' + lp.notes.join('<br>') : '') + (lp.warnings.length ? '<br><b>' + lp.warnings.join('<br>') + '</b>' : '');
      body.appendChild(w);
    }
    const acts = document.createElement('div'); acts.className = 'row'; acts.style.marginBottom = '10px';
    const b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'btn s'; b1.dataset.act = 'cutCsv'; b1.textContent = '⤓ Ведомость CSV';
    b1.onclick = () => { download('roof-cut-list.csv', cutCSV(p, pcs, S, NS)); toast('Ведомость выгружена'); };
    const b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'btn s'; b2.dataset.act = 'nestCsv'; b2.textContent = '⤓ Раскрой CSV';
    b2.onclick = () => { download('roof-nesting.csv', nestCSV(NS)); toast('Раскрой выгружен'); };
    acts.appendChild(b1); acts.appendChild(b2); body.appendChild(acts);
    const tw = document.createElement('div'); tw.className = 'bg'; tw.style.overflow = 'auto';
    let html = '<table class="cut"><thead><tr><th>Марка</th><th>Сечение</th><th class="num">L, мм</th><th class="num">Кол</th><th>Резы</th></tr></thead><tbody>';
    pcs.forEach(it => {
      const ct = [`A: ${it.cutA.t} ${it.cutA.a}°${it.cutA.saw !== undefined ? ` (пила ${it.cutA.saw}°)` : ''}`,
        `B: ${it.cutB.t} ${it.cutB.a}°${it.cutB.saw !== undefined ? ` (пила ${it.cutB.saw}°)` : ''}`];
      if (it.notch) ct.push(`${it.notch.t}: ${it.notch.w}×${it.notch.d}`);
      html += `<tr><td class="mk">${it.mark}<div style="color:var(--mute);font:500 9px var(--f)">${it.name}</div></td>
        <td>${it.sectS}</td><td class="num">${mm(it.len)}<div style="color:var(--mute);font-size:9px">заг ${it.cutLen}</div></td>
        <td class="num">${it.qty}</td><td class="ang">${ct.join('<br>')}</td></tr>`;
    });
    tw.innerHTML = html + '</tbody></table>'; body.appendChild(tw);
    return;
  }
  if (TAB === 'asm') {
    const st = cl(p.stage, 0, 13);
    setTot('Сборка по маркам', `Этап ${st}/13`, ROOF_STAGES[st].t,
      ['Готово', Math.round(st / 13 * 100) + '%'],
      ['Деталей', fmt(pcs.filter(x => x.stage <= st).reduce((s, x) => s + x.qty, 0))],
      ['Осталось', fmt(pcs.filter(x => x.stage > st).reduce((s, x) => s + x.qty, 0))]);
    const n = document.createElement('div'); n.className = 'note';
    n.innerHTML = 'Комплект пакетируется по этапам. Двигайте ползунок внизу сцены или нажмите ▶. Клик по этапу переводит сцену на него.';
    body.appendChild(n);
    ROOF_STAGES.forEach((s, i) => {
      const ms = pcs.filter(x => x.stage === i), qty = ms.reduce((a, x) => a + x.qty, 0);
      const dd = document.createElement('div'); dd.className = 'stg' + (i === st ? ' cur' : i < st ? ' done' : '');
      const h = document.createElement('button'); h.type = 'button'; h.className = 'stgh'; h.dataset.stage = i;
      h.innerHTML = `<i>${i < st ? '✓' : i}</i><b>${s.t}</b><em>${qty ? qty + ' дет' : '—'}</em>`;
      h.onclick = () => { roof.set('stage', i); stopPlay(); syncAsm(); pushView(); panelDirty = true; };
      dd.appendChild(h);
      const b = document.createElement('div'); b.className = 'stgb';
      b.innerHTML = s.d + (ms.length ? `<div class="mk">${ms.map(x => `<span>${x.mark}×${x.qty}</span>`).join('')}</div>` : '');
      dd.appendChild(b); body.appendChild(dd);
    });
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn'; bt.dataset.act = 'asmCsv';
    bt.style.width = '100%'; bt.style.marginTop = '6px'; bt.textContent = '⤓ Инструкция сборки CSV';
    bt.onclick = () => { download('roof-assembly.csv', assemblyCSV(pcs, m)); toast('Инструкция выгружена'); };
    body.appendChild(bt); return;
  }
  if (TAB === 'lab') {
    setTot('Этикетки на детали', pcs.length + ' марок', `${totalQty} деталей · Code 39 · печать A4`,
      ['Печать', 'A4'], ['Штрихкод', 'Code 39'], ['Деталей', fmt(totalQty)]);
    const n = document.createElement('div'); n.className = 'note';
    n.innerHTML = 'Этикетка на торец детали: марка, сечение, длина с припуском, углы, этап и сканируемый Code 39.';
    body.appendChild(n);
    pcs.forEach(it => {
      const dd = document.createElement('div'); dd.className = 'lab';
      const cuts = [`A ${it.cutA.a}° ${it.cutA.t}`, `B ${it.cutB.a}° ${it.cutB.t}`];
      if (it.notch) cuts.push(`седло ${it.notch.w}×${it.notch.d}`);
      dd.innerHTML = `<div class="lh"><span class="lm">${it.mark}</span><span class="lq">×${it.qty}</span></div>
        <div class="ls">${it.sectS} · L=${mm(it.len)} мм · заготовка ${it.cutLen} мм</div>
        <div class="lc">${it.name}${it.note ? ' · ' + it.note : ''}<br>${cuts.join(' · ')}<br>Этап ${it.stage} · допуск ±${p.tol} мм · W≤${moist}%</div>
        ${code39(it.code, 34)}
        <div class="lf"><span>${p.prefix} · ${S.G.n}</span><span>${f3(it.vol / it.qty)} м³ · ${fmt(it.mass / it.qty)} кг</span></div>`;
      body.appendChild(dd);
    });
    return;
  }
  const worst = Math.max(S.utilR, S.utilD, S.utilSm, S.utilB, S.utilT);
  setTot('Несущая способность', Math.round(worst * 100) + '% макс.',
    `${S.G.n} · снег ${p.snowZone} · расч. ${f2(S.qd)} кН/м²`,
    ['Стропило', Math.round(S.utilR * 100) + '%'], ['Ригель', f1(S.tieN) + ' кН'], ['Болты', Math.round(S.utilB * 100) + '%']);
  const n = document.createElement('div'); n.className = 'note amb';
  n.innerHTML = m.mansardOn
    ? `<b>Мансарда ${MANSARD_SCHEMES[m.mansard.scheme].short}.</b> Комната ${m.mansard.roomWidth.toFixed(2)}×${m.length.toFixed(1)} м, потолок ${m.mansard.roomH.toFixed(2)} м. Governing скат: ${S.govTag}. Опор в комнате: ${m.postZ.length + lp.posts.length}.`
    : `<b>Опорный брусок — не подъём стропилы.</b> Глубина врубки = ширина площадки × sin(уклона). Площадка ${mm(m.seatW)} мм, врубка ${mm(m.notchPerp)} мм (${(m.notchRatio * 100).toFixed(0)}%), распор принимает упор ${mm(m.blockH - m.blockFloorY)} мм.`;
  body.appendChild(n);
  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  const ck = d.checks.slice();
  if (stage3d && stage3d.meshCount === 0) ck.unshift({ lv: 'bad', t: 'Сцена пуста', d: 'Нажмите «Пересобрать».' });
  if (stage3d && stage3d.hwErrors.length) ck.unshift({ lv: 'bad', t: 'Ошибки сборки', d: stage3d.hwErrors.join(' | ') });
  ck.sort((a, b) => order[a.lv] - order[b.lv]).forEach(c => {
    const e = document.createElement('div'); e.className = 'chk ' + c.lv;
    e.innerHTML = `<div class="ic">${c.lv === 'ok' ? '✓' : c.lv === 'bad' ? '✕' : 'i'}</div><div style="flex:1"><div class="tt">${c.t}</div><div class="dd">${c.d}</div></div>`;
    if (c.act) {
      const map = { block: [{ seat: 'block' }, '→ Опорный брусок'], bolt6: [{ boltN: 6 }, '→ 6 болтов'],
        tie250: [{ tieSect: '50x200' }, '→ Ригель 50×200'], rafter250: [{ rafter: '50x250' }, '→ Стропило 50×250'],
        braces: [{ braces: 1 }, '→ Подкосы'], plate200: [{ plate: '200x200' }, '→ Мауэрлат 200×200'],
        support: [{ longStrategy: 'support' }, '→ Прогон на стойках'] }[c.act];
      if (map) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn fix'; b.textContent = map[1];
        b.onclick = () => { roof.patch(map[0]); needBuild = true; renderCtl(); panelDirty = true; toast('Параметр изменён'); };
        e.querySelector('div[style]').appendChild(b); }
    }
    body.appendChild(e);
  });
  const tb = document.createElement('div'); tb.className = 'bg';
  tb.innerHTML = `<div class="bgh"><span>Ригель и болты</span><em>EC5 / СП 64</em></div>`;
  [['Нагрузка расчётная', f2(S.qd) + ' кН/м²'], ['Governing скат', S.govTag], ['Пролёт', f2(S.runHoriz) + ' м'],
   ['Плечо h − hc', f2(S.hEff) + ' м'], ['Распор в опоре', f1(S.thrustFull) + ' кН'], ['Принято в расчёт', f1(S.tieN) + ' кН'],
   ['Fv,Rd на болт', f2(S.FvRd) + ' кН'], ['Ёмкость узла', f1(S.capEnd) + ' кН'],
   ['Заход на стропило', mm(m.fullOverlap) + ' мм'], ['σ растяжения', f2(S.sigT) + ' МПа ≤ ' + S.G.Rt]
  ].forEach(([k, v]) => { const r = document.createElement('div'); r.className = 'bl'; r.innerHTML = `<div class="n">${k}</div><div class="s">${v}</div>`; tb.appendChild(r); });
  body.appendChild(tb);
  const rb = document.createElement('div'); rb.className = 'bg';
  rb.innerHTML = `<div class="bgh"><span>Стропило и опора</span><em>${S.G.n}</em></div>`;
  [['Сечение', S.sectMM.join('×')], ['σ изгиба', f2(S.sigma) + ' МПа ≤ ' + S.G.Ri],
   ['Прогиб', f1(S.defl) + ' мм ≤ ' + f1(S.deflLim)], ['Смятие', f2(S.smB) + ' МПа ≤ ' + S.G.Rsm],
   ['Площадка врубки', mm(m.seatW) + ' мм'], ['Глубина врубки', mm(m.notchPerp) + ' мм'],
   ['Прогон', m.ridgeBeamSect.join('×')], ['Масса кровли', fmt(S.massKg) + ' кг']
  ].forEach(([k, v]) => { const r = document.createElement('div'); r.className = 'bl'; r.innerHTML = `<div class="n">${k}</div><div class="s">${v}</div>`; rb.appendChild(r); });
  body.appendChild(rb);
}
$$('.tab').forEach(t => t.onclick = () => { $$('.tab').forEach(x => x.classList.remove('on')); t.classList.add('on'); TAB = t.dataset.tab; panelDirty = true; });

$('#bCsv').onclick = () => { const { d } = bundle(); download('roof-cut-list.csv', cutCSV(P(), d.pieces, d.structure, d.nesting)); toast('Ведомость выгружена'); };
$('#bJson').onclick = () => { download('roof-production-package.json', packageJSON(roof), 'application/json'); toast('Пакет выгружен'); };
$('#bPrint').onclick = () => { const prev = TAB; TAB = 'lab'; renderRight();
  setTimeout(() => { window.print(); TAB = prev; $$('.tab').forEach(x => x.classList.toggle('on', x.dataset.tab === prev)); panelDirty = true; }, 260); };
$('#bReset').onclick = () => {
  roof.reset(); ROOF_LAYERS.forEach(l => VIS[l.id] = 1); activeNode = null;
  $('#nodeCard').style.display = 'none'; $('#pie').classList.remove('shift');
  stopPlay(); stage3d.endTween(); needBuild = true; renderCtl(); syncAsm(); pushView(); panelDirty = true; toast('Сброшено');
};
$('#bRand').onclick = () => {
  const pk = a => a[Math.floor(Math.random() * a.length)];
  roof.patch({ type: pk(['gable', 'hip', 'hip']), span: Math.round((5 + Math.random() * 7) * 2) / 2,
    length: Math.round((7 + Math.random() * 9) * 2) / 2, pitch: Math.round(16 + Math.random() * 30),
    mansard: pk([0, 1, 1]), mansardScheme: pk(['broken', 'tie', 'ridge', 'truss']),
    mansardRoomH: Math.round((2.2 + Math.random() * .8) * 20) / 20, mansardKnee: pk([0, .6, .9, 1.2]),
    step: pk([.6, .6, .9]), rafter: pk(['50x200', '50x250', '60x250']), seat: pk(['notch', 'block', 'cleat']),
    cover: pk(['metaltile', 'metaltile', 'seam', 'shingle', 'prof']), insul: pk([0, 250, 300]), secOn: 0 });
  activeNode = null; $('#nodeCard').style.display = 'none'; $('#pie').classList.remove('shift');
  stopPlay(); stage3d.endTween(); needBuild = true; renderCtl(); syncAsm(); pushView(); panelDirty = true; toast('Новый вариант');
};
$('#mob').onclick = () => { if (innerWidth <= 900) document.body.classList.toggle('ctl'); else document.body.classList.toggle('est'); };
$('#failRetry').onclick = () => { $('#fail').classList.remove('on'); needBuild = true; stage3d.endTween(); stage3d.resize(); };

function onMove(e) {
  if (!stage3d) return;
  const now = performance.now(); if (now - lastPick < 55) return; lastPick = now;
  const mesh = stage3d.pick(e.clientX, e.clientY);
  stage3d.hover(mesh);
  const tip = $('#hover');
  if (!mesh) { tip.style.display = 'none'; hoverPiece = null; return; }
  const piece = roof.pieces().find(x => x.mark === mesh.userData.mk);
  if (!piece) { tip.style.display = 'none'; return; }
  hoverPiece = piece;
  tip.innerHTML = `<div class="hm">${piece.mark}</div><div class="hd">${piece.name} · ${piece.sectS}<br>L=${mm(piece.len)} мм · ${piece.qty} шт<br>Этап ${piece.stage}</div>`;
  const r = host.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 244) + 'px';
  tip.style.top = Math.min(e.clientY - r.top + 14, r.height - 96) + 'px';
  tip.style.display = 'block';
}
function onLeave() { if (stage3d) stage3d.clearHover(); $('#hover').style.display = 'none'; hoverPiece = null; }

try {
  stage3d = createRoofStage(host);
  renderCtl(); syncAsm(); stage3d.resize();
  if (window.ResizeObserver) new ResizeObserver(() => stage3d.resize()).observe(host);
  addEventListener('resize', () => stage3d.resize());
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  stage3d.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); $('#failMsg').textContent = 'Контекст WebGL потерян.'; $('#fail').classList.add('on'); });
  stage3d.renderer.domElement.addEventListener('webglcontextrestored', () => { $('#fail').classList.remove('on'); needBuild = true; });

  let t0 = performance.now();
  stage3d.renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min((now - t0) / 1000, .05); t0 = now;
    try {
      if (needBuild) {
        needBuild = false;
        const t = performance.now();
        const d = roof.all(), p = P();
        LONGPLAN = planLongMembers(d.model, p, d.pieces);
        const res = stage3d.rebuild(d.model, { ...p, __pieces: d.pieces, __struct: d.structure, __long: LONGPLAN });
        pushView(); buildCount++; lastBuildMs = performance.now() - t;
        if (res.meshCount === 0) { $('#failMsg').textContent = 'Модель собрана пустой.'; $('#fail').classList.add('on'); }
        else $('#fail').classList.remove('on');
        panelDirty = true;
      }
      if (playing) {
        playT += dt;
        if (playT > .85) { playT = 0;
          if (P().stage >= 13) { stopPlay(); toast('Сборка завершена'); }
          else { roof.set('stage', P().stage + 1); syncAsm(); pushView(); panelDirty = true; } }
      }
      stage3d.tick(dt, now);
    } catch (err) { RT_ERRORS.push('loop: ' + (err && err.message || err)); }
    if (panelDirty) { panelDirty = false; try { renderRight(); renderLayers(); refreshMansardInfo(); } catch (err) { RT_ERRORS.push('panel: ' + (err && err.message || err)); } }
  });

  /* ═══ ХУК ДЛЯ АВТОТЕСТА ИНТЕРФЕЙСА ═══ */
  window.__roofTest = {
    version: 2,
    ready: () => !!stage3d && !needBuild && buildCount > 0,
    builds: () => buildCount,
    lastBuildMs: () => lastBuildMs,
    errors: () => RT_ERRORS.slice(),
    clearErrors: () => { RT_ERRORS.length = 0; },
    params: () => ({ ...roof.get() }),
    summary: () => { const d = roof.all(), m = d.model, S = d.structure;
      return { mansardOn: m.mansardOn, scheme: m.mansard?.scheme || null, type: m.type, faces: m.faces.length,
        rafters: m.rafters.length, jacks: m.rafters.filter(r => r.jack).length, posts: m.postZ.length,
        planPosts: d.plan.posts.length, ties: m.tieZ.length, wood: +m.wood.toFixed(3),
        roomH: m.mansard?.roomH ?? null, roomW: m.mansard?.roomWidth ?? null,
        sect: [Math.round(m.rt * 1000), Math.round(m.rd * 1000)],
        utilR: +S.utilR.toFixed(3), utilD: +S.utilD.toFixed(3), govTag: S.govTag,
        pieces: d.pieces.length, qty: d.pieces.reduce((s, x) => s + x.qty, 0), marks: d.pieces.map(x => x.mark) }; },
    scene: () => { let visible = 0, total = 0, inst = 0, marks = 0;
      stage3d.root?.traverse(o => { if (o.isInstancedMesh) { inst += o.count; total++; if (o.visible) visible++; }
        else if (o.isMesh) { total++; if (o.visible) visible++; } });
      marks = stage3d.scene.children.find(c => c.userData.isMarks)?.children.length || 0;
      return { meshCount: stage3d.meshCount, hwCount: stage3d.hwCount, errors: stage3d.hwErrors.slice(),
        total, visible, inst, marks, layers: ROOF_LAYERS.map(l => l.id).filter(id => VIS[id]) }; },
    camera: () => ({ pos: stage3d.camera.position.toArray().map(v => +v.toFixed(3)),
      target: stage3d.controls.target.toArray().map(v => +v.toFixed(3)) }),
    capture: (w = 288, h = 180) => {
      const r = stage3d.renderer;
      r.render(stage3d.scene, stage3d.camera);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(r.domElement, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      let lit = 0, sum = 0, minX = w, maxX = 0, minY = h, maxY = 0;
      const cell = new Array(64).fill(0), cn = new Array(64).fill(0);
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
        const mx = Math.max(R, G, B), l = (R + G + B) / 3;
        const ci = (Math.floor(py / h * 8) * 8 + Math.floor(px / w * 8));
        cell[ci] += l; cn[ci]++;
        sum += l;
        if (mx > 64) { lit++; if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
      }
      return { url: c.toDataURL('image/png'),
        lit: +(lit / (w * h)).toFixed(4), mean: +(sum / (w * h)).toFixed(2),
        bbox: lit ? [minX, minY, maxX, maxY] : null,
        grid: cell.map((v, i) => Math.round(v / Math.max(1, cn[i]))) };
    },
    canvasSize: () => { const c = stage3d.renderer.domElement;
      return { w: c.clientWidth, h: c.clientHeight, bw: c.width, bh: c.height, dpr: r0() }; },
    frame: () => stage3d.frame(),
    setView: v => { roof.patch(v); pushView(); }
  };
  function r0() { return stage3d.renderer.getPixelRatio(); }
  setTimeout(() => toast('Мансарда — первая секция слева. Наведите на деталь для марки.'), 900);
} catch (err) {
  RT_ERRORS.push('boot: ' + (err && err.message || err));
  $('#failMsg').textContent = 'Не удалось запустить: ' + (err && err.message || err);
  $('#fail').classList.add('on');
  window.__roofTest = { version: 2, ready: () => false, errors: () => RT_ERRORS.slice(), bootFailed: true };
}