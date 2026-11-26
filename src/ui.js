import { PRICES } from './prices.js';
import { calculateMaterials } from './calculator.js';
import { ROOF_MATERIALS, ROOF_COLORS, roofGeom } from './roof.js';

let priceOpen = false;

export function updateFoundationRecommendation(params) {
  const map = { clay: 'pile_grillage', sand: 'strip', peat: 'pile', unknown: 'pile_grillage' };
  params.foundation = map[params.soilType] || 'pile_grillage';
}

const YESNO = (yes, no) => [{ value: 'yes', label: yes }, { value: 'no', label: no }];

const SECTIONS = [
  {
    id: 'building', title: 'Что строим', openByDefault: true,
    controls: [
      { id: 'buildingType', label: 'Тип постройки', type: 'select', options: [
        { value: 'house', label: 'Дом' }, { value: 'bath', label: 'Баня' },
        { value: 'garage', label: 'Гараж' }, { value: 'roof', label: 'Только крыша' },
      ] },
      { id: 'soilType', label: 'Тип грунта', type: 'select', options: [
        { value: 'clay', label: 'Глина / Суглинок' }, { value: 'sand', label: 'Песок' },
        { value: 'peat', label: 'Торф / Насыпной' }, { value: 'unknown', label: 'Не знаю' },
      ] },
      { id: 'finish', label: 'Комплектация', type: 'select', options: [
        { value: 'rough', label: 'Коробка' },
        { value: 'preFinish', label: 'Под чистовую' },
        { value: 'turnkey', label: 'Под ключ' },
      ] },
    ],
  },
  {
    id: 'dimensions', title: 'Габариты', openByDefault: true,
    controls: [
      { id: 'width', label: 'Ширина', type: 'range', min: 4, max: 15, step: .5, unit: 'м' },
      { id: 'length', label: 'Длина', type: 'range', min: 4, max: 15, step: .5, unit: 'м' },
      { id: 'floors', label: 'Этажи', type: 'range', min: 1, max: 3, step: 1, unit: '' },
      { id: 'wallHeight', label: 'Высота этажа', type: 'range', min: 2.5, max: 3.5, step: .1, unit: 'м' },
      { id: 'mansard', label: 'Мансардный этаж', type: 'select', options: [
        { value: 'no', label: 'Нет (полноценный)' }, { value: 'yes', label: 'Да (в крыше)' },
      ] },
    ],
  },
  {
    id: 'walls', title: 'Стены', openByDefault: true,
    controls: [
      { id: 'material', label: 'Материал стен', type: 'select', options: [
        { value: 'brus', label: 'Профилированный брус' }, { value: 'brevno', label: 'Оцилиндрованное бревно' },
      ] },
      { id: 'beamWidth', label: 'Толщина стены', type: 'select', options: [
        { value: '90', label: '90 × 140 мм' },
        { value: '140', label: '140 × 140 мм' },
        { value: '190', label: '190 × 140 мм' },
      ] },
      { id: 'beamStock', label: 'Длина заготовки', type: 'select', options: [
        { value: '5000', label: '5 м — дешевле' },
        { value: '6000', label: '6 м — дороже, меньше стыков' },
      ] },
    ],
  },
  {
    id: 'roof', title: 'Крыша', openByDefault: true,
    controls: [
      { id: 'roofType', label: 'Форма', type: 'select', options: [
        { value: 'gable', label: 'Двускатная' }, { value: 'hip', label: 'Вальмовая (4 ската)' },
      ] },
      { id: 'roofMaterial', label: 'Покрытие', type: 'select', options: ROOF_MATERIALS },
      { id: 'roofColor', label: 'Цвет', type: 'select', options: ROOF_COLORS },
      { id: 'roofHeight', label: 'Высота конька', type: 'range', min: 1, max: 4, step: .1, unit: 'м' },
      { id: 'overhangFront', label: 'Свес спереди', type: 'range', min: .5, max: 4, step: .1, unit: 'м' },
      { id: 'overhangBack', label: 'Свес сзади', type: 'range', min: .5, max: 4, step: .1, unit: 'м' },
      { id: 'overhangSides', label: 'Свес по бокам', type: 'range', min: .5, max: 4, step: .1, unit: 'м' },
      { id: 'roofGutter', label: 'Водосток', type: 'select', options: YESNO('Да, с трубами', 'Нет') },
      { id: 'roofSoffit', label: 'Подшивка свесов', type: 'select', options: YESNO('Да', 'Нет') },
      { id: 'roofSnowGuard', label: 'Снегозадержатели', type: 'select', options: YESNO('Да', 'Нет') },
      { id: 'roofWindow', label: 'Мансардное окно', type: 'select', options: YESNO('Да', 'Нет') },
      { id: 'chimney', label: 'Дымоход', type: 'select', options: [
        { value: 'none', label: 'Нет' }, { value: 'brick', label: 'Кирпичный' }, { value: 'steel', label: 'Стальной сэндвич' },
      ] },
    ],
  },
  {
    id: 'extras', title: 'Окна, двери, веранды', openByDefault: false,
    controls: [
      { id: 'windows', label: 'Остекление', type: 'select', options: [
        { value: 'none', label: 'Без окон' },
        { value: 'small', label: 'Минимум (1 на фасад)' },
        { value: 'standard', label: 'Стандарт (2 на фасад + бока)' },
        { value: 'panoramic', label: 'Панорама (широкие полосы)' },
        { value: 'custom', label: 'Пользовательский' },
      ] },
      { id: 'entrance', label: 'Вход (фасад)', type: 'select', options: [
        { value: 'none', label: 'Просто вход' }, { value: 'porch', label: 'Крыльцо' },
        { value: 'veranda_open', label: 'Веранда открытая' }, { value: 'veranda_glazed', label: 'Веранда остеклённая' },
      ] },
      { id: 'terrace', label: 'Терраса (сзади)', type: 'select', options: [
        { value: 'none', label: 'Нет' }, { value: 'open', label: 'Открытая' }, { value: 'glazed', label: 'Остеклённая' },
      ] },
      { id: 'balcony', label: 'Балкон', type: 'select', options: YESNO('Да', 'Нет') },
    ],
  },
];

export function initUI(params, onChange) {
  const scrollContainer = document.getElementById('controls-scroll');
  const footer = document.getElementById('footer');
  if (!scrollContainer || !footer) return;
  scrollContainer.innerHTML = '';
  footer.innerHTML = '';

  const hint = document.querySelector('#panel-head .panel-hint');
  if (hint) hint.textContent = 'Меняйте параметры — дом пересобирается сразу. В планировке стены рисуются как в Sims.';

  SECTIONS.forEach(section => {
    const el = document.createElement('div');
    el.className = 'section';
    if (!section.openByDefault) el.classList.add('collapsed');
    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `<span>${section.title}</span><span class="arrow">▼</span>`;
    header.addEventListener('click', () => el.classList.toggle('collapsed'));
    const body = document.createElement('div');
    body.className = 'section-body';
    section.controls.forEach(ctrl => body.appendChild(renderControl(ctrl, params, onChange)));
    el.appendChild(header);
    el.appendChild(body);
    scrollContainer.appendChild(el);
  });

  const fd = document.createElement('div');
  fd.id = 'foundation-info';
  fd.style.cssText = 'font:600 11.5px/1.4 Manrope,sans-serif;color:#8fa792;margin-bottom:8px;';
  footer.appendChild(fd);

  const card = document.createElement('div');
  card.id = 'price-info';
  card.style.cssText = 'padding:12px 13px;background:linear-gradient(160deg,#232d26,#1b231e);border:1px solid rgba(232,163,76,.28);border-radius:12px;';
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <span style="font:700 9.5px/1 Manrope,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#7f8f80;">Примерная стоимость</span>
      <button type="button" id="price-toggle" style="height:24px;padding:0 9px;border-radius:7px;border:1px solid #3a463c;background:#1f2823;color:#9fae9f;font:700 10.5px Manrope,sans-serif;cursor:pointer;">Состав ▾</button>
    </div>
    <div id="price-total" style="font:800 25px/1.15 Manrope,sans-serif;color:#f7c477;margin:7px 0 3px;">—</div>
    <div id="price-sub" style="font:600 11px/1.4 Manrope,sans-serif;color:#7f8f80;">—</div>
    <div id="price-details" style="display:none;"></div>
    <div style="margin-top:9px;font:500 10px/1.5 Manrope,sans-serif;color:#5f6f61;">Предварительный расчёт, не является офертой.</div>`;
  footer.appendChild(card);

  document.getElementById('price-toggle').addEventListener('click', () => {
    priceOpen = !priceOpen;
    const det = document.getElementById('price-details');
    const btn = document.getElementById('price-toggle');
    if (det) det.style.display = priceOpen ? 'block' : 'none';
    if (btn) btn.textContent = priceOpen ? 'Свернуть ▴' : 'Состав ▾';
  });

  updateDisplays(params);
}

function renderControl(ctrl, params, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'control';
  const label = document.createElement('label');
  label.textContent = ctrl.label;

  let valueSpan = null;
  if (ctrl.type === 'range') {
    valueSpan = document.createElement('span');
    valueSpan.className = 'ctrl-value';
    valueSpan.dataset.unit = ctrl.unit || '';
    valueSpan.textContent = `${params[ctrl.id]} ${ctrl.unit}`;
    label.appendChild(valueSpan);
  }
  wrapper.appendChild(label);

  if (ctrl.type === 'select') {
    const select = document.createElement('select');
    select.id = ctrl.id;
    select.name = ctrl.id;
    ctrl.options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (String(params[ctrl.id]) === String(opt.value)) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', e => {
      params[ctrl.id] = e.target.value;
      onChange(params);
      updateDisplays(params);
    });
    wrapper.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.type = 'range';
    input.id = ctrl.id;
    input.min = ctrl.min;
    input.max = ctrl.max;
    input.step = ctrl.step;
    input.value = params[ctrl.id];
    input.addEventListener('input', e => {
      params[ctrl.id] = parseFloat(e.target.value);
      valueSpan.textContent = `${e.target.value} ${ctrl.unit}`;
      onChange(params);
      updateDisplays(params);
    });
    wrapper.appendChild(input);
  }
  return wrapper;
}

function refreshControlValues(params) {
  SECTIONS.forEach(s => s.controls.forEach(ctrl => {
    const el = document.getElementById(ctrl.id);
    if (!el) return;
    if (ctrl.type === 'select') el.value = String(params[ctrl.id]);
    else {
      el.value = params[ctrl.id];
      const span = el.parentElement.querySelector('.ctrl-value');
      if (span) span.textContent = `${params[ctrl.id]} ${span.dataset.unit || ''}`;
    }
  }));
}

function updateDisplays(params) {
  refreshControlValues(params);
  const fd = document.getElementById('foundation-info');
  if (fd) {
    const labels = { pile_grillage: 'Свайно-ростверковый', strip: 'Ленточный', pile: 'Свайный' };
    fd.textContent = `Фундамент: ${labels[params.foundation] || params.foundation}`;
  }
  updatePriceDisplay(params);
}

export function updatePriceDisplay(params) {
  const totalEl = document.getElementById('price-total');
  const subEl = document.getElementById('price-sub');
  const detEl = document.getElementById('price-details');
  if (!totalEl || !detEl) return;

  const b = calculatePrice(params);
  const m = calculateMaterials(params);
  const G = roofGeom(params);
  const fmt = v => roundTo(v, 1000).toLocaleString('ru-RU');
  const area = params.width * params.length * params.floors;
  const matLabel = params.material === 'brevno' ? 'бревно' : 'брус';
  const finishLabel = PRICES.finish[params.finish]?.name || 'Коробка';
  const roofMatLabel = (ROOF_MATERIALS.find(r => r.value === params.roofMaterial) || ROOF_MATERIALS[0]).label;
  const roofColLabel = (ROOF_COLORS.find(r => r.value === params.roofColor) || ROOF_COLORS[0]).label;

  totalEl.textContent = `~${roundTo(b.total, 10000).toLocaleString('ru-RU')} ₽`;
  subEl.textContent = `${area.toFixed(area % 1 ? 1 : 0)} м² · ${params.floors} эт. · ${matLabel} ${params.beamWidth} мм · ${finishLabel}`;

  const row = (k, v, money) => `<div style="display:flex;align-items:baseline;gap:6px;font:600 11.5px/1.9 Manrope,sans-serif;color:#9fae9f;">
      <span>${k}</span>
      <span style="flex:1;border-bottom:1px dotted #3a463c;transform:translateY(-3px);"></span>
      <b style="color:${money ? '#f7c477' : '#ece7da'};font-weight:700;white-space:nowrap;">${v}</b>
    </div>`;
  const head = t => `<div style="margin:11px 0 6px;padding-top:10px;border-top:1px solid #33403a;font:700 9.5px/1 Manrope,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#e8a34c;">${t}</div>`;

  detEl.innerHTML = `
    ${head('Кровля')}
    ${row('Площадь скатов', `${G.area.toFixed(1)} м²`)}
    ${row('Покрытие', roofMatLabel)}
    ${row('Цвет', roofColLabel)}
    ${row('Стропильная система', `${fmt(b.roofFrame)} ₽`, true)}
    ${row('Покрытие и доборы', `${fmt(b.roofCover)} ₽`, true)}
    ${head('Смета')}
    ${row('Фундамент', `${fmt(b.foundation)} ₽`, true)}
    ${row('Стены и сруб', `${fmt(b.walls)} ₽`, true)}
    ${row('Крыша всего', `${fmt(b.roof)} ₽`, true)}
    ${row('Дополнительно', `${fmt(b.extras)} ₽`, true)}
    ${head('Материал стен')}
    ${row('Бревён / брусьев', `${m.total.count} шт.`)}
    ${row('Общая длина', `${Math.round(m.total.length)} м.п.`)}
    ${row('Объём', `${m.total.volume.toFixed(2)} м³`)}
    ${row('в т.ч. перегородки', `${Math.round(m.interior.length)} м.п.`)}`;
}

function calculatePrice(params) {
  const floorArea = params.width * params.length * params.floors;
  const baseRate = PRICES.baseRatePerM2[params.buildingType] || PRICES.baseRatePerM2.house;
  let base = floorArea * baseRate;
  base *= PRICES.materialCoef[params.material] || 1;
  base *= PRICES.beamWidthCoef[params.beamWidth] || 1;
  base *= PRICES.beamStockCoef?.[params.beamStock] || 1;
  base *= PRICES.foundationCoef[params.foundation] || 1;
  base *= PRICES.windowCoef[params.windows] || 1;

  const foundation = base * .18;
  const walls = base * .55;
  const roofFrame = base * .20 * (PRICES.roofCoef[params.roofType] || 1);

  const G = roofGeom(params);
  const rm = PRICES.roofMaterials || {};
  const rc = PRICES.roofColorCoef || {};
  const re = PRICES.roofExtras || {};
  const rate = rm[params.roofMaterial] ?? 950;
  const colK = rc[params.roofColor] ?? 1;
  let roofCover = G.area * rate * colK;
  if (params.roofGutter === 'yes') roofCover += G.eaveLen * (re.gutterPerM || 0);
  if (params.roofSnowGuard === 'yes') roofCover += G.eaveLen * (re.snowGuardPerM || 0);
  if (params.roofSoffit === 'yes') roofCover += G.soffitArea * (re.soffitPerM2 || 0);
  if (params.roofWindow === 'yes') roofCover += re.roofWindow || 0;
  if (params.chimney === 'brick') roofCover += re.chimneyBrick || 0;
  if (params.chimney === 'steel') roofCover += re.chimneySteel || 0;
  const roof = roofFrame + roofCover;

  const e = PRICES.extras || {};
  let extras = 0;
  if (params.entrance === 'veranda_open') extras += e.verandaOpen || 0;
  if (params.entrance === 'veranda_glazed') extras += e.verandaGlazed || 0;
  if (params.entrance === 'porch') extras += e.porch || 0;
  if (params.terrace === 'open') extras += e.terraceOpen || 0;
  if (params.terrace === 'glazed') extras += e.terraceGlazed || 0;
  if (params.balcony === 'yes' && params.floors > 1) extras += (e.balconyPerFloor || 0) * (params.floors - 1);
  if (params.mansard === 'yes' && params.floors >= 2) extras += e.mansard || 0;

  const st = PRICES.stairs || {};
  const stairBase = st[params.stairType] ?? e.stair ?? 45000;
  const wK = ({ '0.9': .92, '1.0': 1, '1.1': 1.08, '1.2': 1.16 })[params.stairWidth] || 1;
  const railK = ({ wood: 1, white: 1.12, forge: 1.35 })[params.stairRail] || 1;
  extras += (params.stairs?.length || 0) * stairBase * wK * railK
    * (params.stairRisers === 'yes' ? 1.06 : 1)
    * (params.stairStringer === 'tetiva' ? 1.08 : 1);
  extras += (params.columns?.length || 0) * (e.column || 0);
  extras += (params.customLights?.length || 0) * (e.light || 0);
  (params.interiorWalls || []).forEach(w => {
    const L = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    extras += L * (w.isFence ? (e.fencePerM || 0) : (e.interiorWallPerM || 0));
  });

  const finishCoef = PRICES.finish[params.finish]?.coef || 1;
  return { foundation, walls, roofFrame, roofCover, roof, extras, total: (foundation + walls + roof + extras) * finishCoef };
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}