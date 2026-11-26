/* Профилированный брус: сортамент, профиль венца, шаг венца, заготовки, раскрой.
   Чистое ядро — без three и без DOM. Все размеры в миллиметрах.
   Единственный источник истины: builder.js и calculator.js берут цифры отсюда. */

export const TIMBER_H = 140;                  // высота венца (монтажная), мм
export const TIMBER_WIDTHS = [90, 140, 190];  // толщина стены, мм
export const STOCK_LENGTHS = [5000, 6000];    // заготовки, мм
export const STOCK_DEFAULT = 6000;
export const MIN_PIECE = 1200;                // короче этого куска в венец не ставим
export const JOINT_SHIFT = 1000;              // минимальный разнос стыков соседних венцов

/* Угол «в чашу с остатком»: остаток наружу, чаша на половину высоты. */
export const CORNER = { tail: 250, cupRatio: .5, cupClear: 2 };

const num = v => (Number.isFinite(Number(v)) ? Number(v) : NaN);
export const normWidth = v => { const n = Math.round(num(v)); return TIMBER_WIDTHS.includes(n) ? n : 140; };
export const normStock = v => { const n = Math.round(num(v)); return STOCK_LENGTHS.includes(n) ? n : STOCK_DEFAULT; };

/* ── ПРОФИЛЬ ВЕНЦА ────────────────────────────────────────────────
   y = 0 — посадочная плоскость: площадки низа ложатся на площадки верха нижнего венца.
   Шипы уходят ВНИЗ на t, тело 0…H, пазы выбраны сверху на g = t + зазор.
   Шаг венца = H, поэтому площадки смыкаются в ноль, шип не достаёт дна паза на 2 мм,
   по бокам шипа остаётся по 1 мм. Никаких «0.95 от высоты» больше нет. */
export function profile(width) {
  const w = normWidth(width), H = TIMBER_H;
  const chamfer = Math.min(8, Math.round(w * .07));
  const tenon = Math.round(w * .22);
  const t = 10, clear = 2, side = 1;
  const land = (w - 2 * chamfer - 2 * tenon) / 3;
  const g = t + clear;
  const x0 = -w / 2, x7 = w / 2;
  const a0 = x0 + chamfer;
  const a1 = a0 + land, a2 = a1 + tenon;
  const a3 = a2 + land, a4 = a3 + tenon;
  const a5 = a4 + land;
  const pts = [
    [x0, chamfer], [a0, 0],
    [a1, 0], [a1, -t], [a2, -t], [a2, 0],
    [a3, 0], [a3, -t], [a4, -t], [a4, 0],
    [a5, 0], [x7, chamfer],
    [x7, H - chamfer], [a5, H],
    [a4 + side, H], [a4 + side, H - g], [a3 - side, H - g], [a3 - side, H],
    [a2 + side, H], [a2 + side, H - g], [a1 - side, H - g], [a1 - side, H],
    [a0, H], [x0, H - chamfer],
  ];
  return { w, H, chamfer, tenon, t, g, side, land, pts,
    tenons: [[a1, a2], [a3, a4]], grooves: [[a1 - side, a2 + side], [a3 - side, a4 + side]] };
}

/* Шаг венца = монтажная высота тела. Не коэффициент, а геометрия. */
export const courseStep = () => TIMBER_H;

/* Сколько венцов нужно на этажи и какая высота получится на самом деле. */
export function coursesFor(targetMm) {
  const n = Math.max(1, Math.round(num(targetMm) / TIMBER_H) || 1);
  return { n, step: TIMBER_H, height: n * TIMBER_H, delta: n * TIMBER_H - num(targetMm) };
}

/* Площадь сечения профиля и площадь заготовки (по ней считают кубатуру и деньги). */
export function areas(width) {
  const p = profile(width);
  const blank = p.w * p.H;
  const net = blank - 2 * p.chamfer * p.chamfer
    - p.grooves.reduce((s, [a, b]) => s + (b - a) * p.g, 0)
    + p.tenons.reduce((s, [a, b]) => s + (b - a) * p.t, 0);
  return { blank, net };
}

function jointsOf(pieces) {
  const j = []; let acc = 0;
  for (let i = 0; i < pieces.length - 1; i++) { acc += pieces[i]; j.push(acc); }
  return j;
}
const pack = (need, stock, pieces, staggered) =>
  ({ need, stock, pieces, joints: jointsOf(pieces), staggered });

/* ── РАСКРОЙ ВЕНЦА ────────────────────────────────────────────────
   Длина венца = длина стены + два остатка. Длиннее заготовки — режем на куски
   и разносим стыки через венец минимум на метр. Если разнос не нашёлся,
   честно ставим staggered:false — это увидит аудит, а не замолчит. */
export function courseRuns(wallMm, stockMm, index) {
  const stock = normStock(stockMm);
  const need = Math.max(MIN_PIECE, Math.round(num(wallMm)) + 2 * CORNER.tail);
  if (need <= stock) return pack(need, stock, [need], true);
  const n = Math.ceil(need / stock);
  const base = Math.floor(need / n);
  const even = new Array(n).fill(base); even[n - 1] += need - base * n;
  if (index % 2 === 0) return pack(need, stock, even, true);
  const ej = jointsOf(even);
  const stepH = Math.max(50, Math.round(stock / 40));
  for (let h = MIN_PIECE; h <= stock; h += stepH) {
    const rest = need - h, m = Math.ceil(rest / stock);
    if (m < 1) continue;
    const b = Math.floor(rest / m);
    if (b < MIN_PIECE || b > stock) continue;
    const pieces = [h, ...new Array(m).fill(b)];
    pieces[pieces.length - 1] += need - pieces.reduce((s, v) => s + v, 0);
    if (pieces.some(v => v < MIN_PIECE || v > stock)) continue;
    if (jointsOf(pieces).every(j => ej.every(e => Math.abs(j - e) >= JOINT_SHIFT)))
      return pack(need, stock, pieces, true);
  }
  return pack(need, stock, even, false);
}

/* Сводка по коробке: венцы, погонаж, кубатура, число заготовок. */
export function wallSummary(p) {
  const w = normWidth(p.beamWidth), stock = normStock(p.beamStock);
  const floors = Math.max(1, Math.round(num(p.floors)) || 1);
  const per = coursesFor((num(p.wallHeight) || 2.7) * 1000 * floors);
  const walls = [
    { name: 'front', len: (num(p.width) || 8) * 1000, axis: 'x' },
    { name: 'back',  len: (num(p.width) || 8) * 1000, axis: 'x' },
    { name: 'left',  len: (num(p.length) || 6) * 1000, axis: 'z' },
    { name: 'right', len: (num(p.length) || 6) * 1000, axis: 'z' },
  ];
  const a = areas(w);
  let runMm = 0, blanks = 0, noShift = 0; const rows = [];
  for (let i = 0; i < per.n; i++) {
    walls.forEach(wl => {
      const r = courseRuns(wl.len, stock, i + (wl.axis === 'z' ? 1 : 0));
      runMm += r.need; blanks += r.pieces.length;
      if (!r.staggered) noShift++;
      rows.push({ course: i + 1, wall: wl.name, axis: wl.axis, ...r });
    });
  }
  return { width: w, height: TIMBER_H, stock, courses: per.n, wallHeight: per.height,
    delta: per.delta, runMm, blanks, noShift,
    volume: runMm * a.blank / 1e9, netVolume: runMm * a.net / 1e9, rows };
}