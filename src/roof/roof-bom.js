import { SEATS, TIEMODE } from './roof-params.js';
import { mm, f1, f2, fmt } from './format.js';
import { RATES } from './roof-prices.js';

export function roofBOM(p, m, S, pcs, NS) {
  const G = [], add = (g, n, q, u, k, note) => { if (Number.isFinite(q) && q > 1e-4) G.push({ g, n, q, u, k, note }); };
  const C = Math.ceil, trim = l => C(l / 1.9);
  add('Пиломатериал', `Стропила ${p.rafter.replace('x', '×')}`, m.V.rafter, 'м³', 'lumberBoard', `${m.rafters.filter(r => !r.jack).length} ног`);
  if (m.V.hip > 0) add('Пиломатериал', `Накосные ${mm(m.hipW)}×${mm(m.hipDepth)}`, m.V.hip, 'м³', 'lumberBoard', `4 шт, скос кромки, ${m.jackJoints} врубок`);
  if (m.V.tie > 0) add('Пиломатериал', `Ригели ${p.tieSect.replace('x', '×')}`, m.V.tie, 'м³', 'lumberBoard', `${m.tieZ.length * m.tieSides} шт, ${TIEMODE[m.tieMode].s.toLowerCase()}`);
  add('Пиломатериал', `Мауэрлат ${p.plate.replace('x', '×')}`, m.V.plate, 'м³', 'lumberBoard', `${(2 * m.plateLenZ + 2 * m.span).toFixed(1)} м.п.`);
  if (m.V.seat > 0) add('Пиломатериал', `${SEATS[m.seatMode].n} ${mm(m.pw)}×${mm(m.blockH)}`, m.V.seat, 'м³', 'lumberBoard', 'запил 0%');
  add('Пиломатериал', 'Прогон 100×150', m.V.ridgeBeam, 'м³', 'lumberBoard', `${m.ridgeLen.toFixed(1)} м.п.`);
  if (m.V.sleeper > 0) add('Пиломатериал', 'Лежень 150×150', m.V.sleeper, 'м³', 'lumberBoard', 'по балкам');
  add('Пиломатериал', 'Стойки 150×150', m.V.post, 'м³', 'lumberBoard', `${m.postZ.length} шт`);
  if (m.V.brace > 0) add('Пиломатериал', 'Подкосы 50×150', m.V.brace, 'м³', 'lumberBoard', `${m.postZ.length * 2} шт`);
  if (m.V.joist > 0) add('Пиломатериал', 'Балки перекрытия 50×200', m.V.joist, 'м³', 'lumberBoard', `${m.joistN} шт`);
  add('Пиломатериал', 'Контробрешётка 50×50', m.V.counter, 'м³', 'lumberBoard', `${m.rafLen.toFixed(0)} м.п.`);
  if (!m.solid) add('Пиломатериал', 'Обрешётка 25×100', m.V.batten, 'м³', 'lumberBoard', `${m.batLen.toFixed(0)} м.п.`);
  if (m.V.extraBatten > 0) add('Пиломатериал', 'Контр-брус утепления', m.V.extraBatten, 'м³', 'lumberBoard', `${Math.round(m.extraBattenLen)} м.п.`);
  add('Пиломатериал', 'Лобовая / ветровая 25×150', m.V.fascia, 'м³', 'lumberBoard', `${(m.eaveLen + m.rakeLen).toFixed(0)} м.п.`);

  const cuts = pcs.reduce((s, i) => s + i.cuts, 0), angled = pcs.reduce((s, i) => s + i.angled * i.qty, 0), notch = pcs.reduce((s, i) => s + (i.notch ? i.qty : 0), 0);
  add('Распил', 'Торцовка деталей', cuts, 'рез', 'sawCut', `${pcs.reduce((s, i) => s + i.qty, 0)} деталей`);
  add('Распил', 'Косые и compound-резы', angled, 'рез', 'sawAngle', 'по ведомости углов');
  if (notch > 0) add('Распил', 'Врубки седла', notch, 'шт', 'sawNotch', `${mm(m.notchPerp)} мм`);
  add('Распил', 'Маркировка + Code 39', pcs.length, 'марка', 'sawLabel', 'этикетка на деталь');
  add('Распил', 'Пакетирование', Math.max(1, Math.ceil(NS.vol / 2.2)), 'паллета', 'pack', 'по этапам сборки');
  add('Распил', 'Доставка', Math.max(1, Math.ceil(NS.vol / 20)), 'рейс', 'deliver', `${f2(NS.vol)} м³, ${fmt(S.massKg)} кг`);

  add('Пирог', 'Мембрана', m.area * 1.15, 'м²', 'membrane', 'нахлёст 150 мм');
  if (m.solid) add('Пирог', 'OSB-3 12 мм', C(m.area * 1.08 / 3.125), 'лист', 'osb', 'сплошной настил');
  if (m.warm) {
    const ia = m.area * (m.insulEnd / m.rl) * (m.length / m.L);
    add('Пирог', 'Минвата', ia * m.it, 'м³', 'wool', `${p.insul} мм`);
    add('Пирог', 'Пароизоляция', ia * 1.15, 'м²', 'vapor', '');
    add('Пирог', 'Подшивка вагонка', ia * 1.05, 'м²', 'lumberBoard', '16 мм');
  }
  if (p.cover === 'shingle') {
    const full = m.pitch < 18;
    add('Пирог', 'Подкладочный ковёр', full ? m.area * 1.1 : (m.eaveLen + m.rakeLen) * .6, 'м²', 'underlay', full ? 'сплошной' : 'карнизы');
    add('Пирог', 'Мастика', m.area * .12, 'кг', 'mastic', '');
  }
  if (p.cover === 'shingle') add('Покрытие', m.cv.n, m.packs, 'упак', 'shingle', `отход ${Math.round(m.wasteReal * 100)}%`);
  else add('Покрытие', m.cv.n, m.sheetArea, 'м²', m.cv.rate, `${m.sheets} листов`);

  add('Погонаж', 'Конёк / хребет 2 м', trim(m.ridgeLen + m.hipLen), 'шт', 'ridge', `${(m.ridgeLen + m.hipLen).toFixed(1)} м.п.`);
  add('Погонаж', 'Заглушка конька', p.type === 'gable' ? 2 : 4, 'шт', 'endcap', '');
  if (m.rakeLen > 0) add('Погонаж', 'Ветровая планка 2 м', trim(m.rakeLen), 'шт', 'rake', '');
  add('Погонаж', 'Карнизная планка 2 м', trim(m.eaveLen), 'шт', 'drip', '');
  add('Погонаж', 'Уплотнитель', m.ridgeLen + m.eaveLen + m.hipLen, 'м.п.', 'seal', '');

  if (p.gutter) {
    const runs = p.type === 'gable' ? 2 : 4, per = m.eaveLen / runs, n = C(per / 3) * runs;
    add('Водосток', 'Жёлоб 3 м', n, 'шт', 'gut', `${m.eaveLen.toFixed(1)} м.п.`);
    add('Водосток', 'Соединитель', Math.max(0, n - runs), 'шт', 'gutJoin', '');
    add('Водосток', 'Заглушка', p.type === 'gable' ? 4 : 0, 'шт', 'gutCap', '');
    if (p.type === 'hip') add('Водосток', 'Угол 90°', 4, 'шт', 'gutCorner', '');
    add('Водосток', 'Кронштейн', C(m.eaveLen / .6) + runs, 'шт', 'gutBrk', 'шаг 600');
    add('Водосток', 'Воронка', m.spouts, 'шт', 'funnel', '');
    add('Водосток', 'Труба 3 м', m.spouts, 'шт', 'pipe', '');
    add('Водосток', 'Колено 45°', m.spouts * 3, 'шт', 'elbow', '');
    add('Водосток', 'Хомут', m.spouts * 3, 'шт', 'clamp', '');
    add('Водосток', 'Отлив', m.spouts, 'шт', 'outlet', '');
  }
  if (p.snow) add('Снегозадержание', 'Комплект 3 м', C(m.eaveLen / 3) * m.snowRows.length, 'компл', 'snowSet', '');
  if (p.soffit) {
    add('Подшивка', 'Софит-панель', C(m.soffitA / .9), 'шт', 'soffit', `${m.soffitA.toFixed(1)} м²`);
    add('Подшивка', 'J-профиль 3 м', C(m.eaveLen * 2 / 3), 'шт', 'jprof', '');
  }
  if (p.fix) {
    add('Крепёж', 'Скользящая опора', m.fix.slide, 'шт', 'slide', 'усадка сруба');
    add('Крепёж', 'Уголок перфорированный', m.fix.angle, 'шт', 'angle', '');
    if (m.fix.bolt > 0) add('Крепёж', `Болт М${m.boltD} комплект`, m.fix.bolt, 'компл', 'bolt', `${m.boltN} на узел`);
    if (m.fix.bolt10 > 0) add('Крепёж', 'Болт М10', m.fix.bolt10, 'шт', 'bolt10', 'подкосы');
    add('Крепёж', 'Шпилька М12', m.fix.stud, 'шт', 'stud', 'мауэрлат');
  }
  if (p.cover === 'seam') add('Крепёж', 'Кляммер', C(m.area * 6), 'шт', 'klammer', '');
  else if (p.cover === 'shingle') add('Крепёж', 'Гвоздь ершёный', m.area * .09, 'кг', 'nail', '');
  else add('Крепёж', 'Саморез 4.8×35', C(m.area * 7 / 100) * 100, 'шт', 'screw', '7 шт/м²');
  add('Крепёж', 'Саморез 4.8×70', C((m.ridgeLen + m.eaveLen + m.rakeLen + m.hipLen) / .3 / 50) * 50, 'шт', 'screwLong', '');
  add('Крепёж', 'Антисептик', m.wood * 20, 'л', 'antiseptic', '20 л/м³');

  add('Работа', 'Сборка комплекта по маркам', m.area, 'м²', 'wKit', 'вместо работ с нуля');
  if (m.seatMode !== 'notch') add('Работа', 'Опорные элементы', m.seatMode === 'cleat' ? m.bearR : C(m.seatRuns / 3), 'узел', 'wSeat', '');
  if (p.joists) add('Работа', 'Балки перекрытия', m.span * m.length, 'м²', 'wJoist', '');
  add('Работа', 'Мембрана + обрешётка', m.area, 'м²', 'wDeck', '');
  add('Работа', `Монтаж: ${m.cv.n}`, m.area, 'м²', m.cv.work, '');
  if (m.warm) add('Работа', 'Утепление + подшивка', m.area * (m.insulEnd / m.rl) * (m.length / m.L), 'м²', 'wWarm', '');
  add('Работа', 'Конёк, планки', m.ridgeLen + m.eaveLen + m.rakeLen + m.hipLen, 'м.п.', 'wTrim', '');
  if (p.gutter) add('Работа', 'Водосток', m.eaveLen, 'м.п.', 'wGut', '');
  if (p.snow) add('Работа', 'Снегозадержатели', m.eaveLen * m.snowRows.length, 'м.п.', 'wSnow', '');
  if (p.soffit) add('Работа', 'Подшивка свесов', m.soffitA, 'м²', 'wSoffit', '');
  add('Работа', 'Антисептирование', m.wood, 'м³', 'wAnti', '');
  return G;
}

export function roofPrice(lines) {
  let mat = 0, work = 0, saw = 0;
  const out = lines.map(l => {
    const r = RATES[l.k] || { v: 0, u: '' };
    let q = l.q;
    if (l.n === 'Подшивка вагонка') q = l.q * .016;
    const s = q * r.v;
    if (l.g === 'Работа') work += s; else if (l.g === 'Распил') saw += s; else mat += s;
    return { ...l, q, rate: r.v, unit: r.u, sum: s };
  });
  const oh = (mat + saw) * RATES.overhead.v / 100;
  out.push({ g: 'Работа', n: 'Леса, подъём, мусор', q: RATES.overhead.v, u: '%', rate: mat + saw, unit: '₽', sum: oh, note: `${RATES.overhead.v}%` });
  return { lines: out, mat, work: work + oh, saw, total: mat + work + oh + saw };
}