export const ROOF_DEFAULTS = {
  type: 'hip', span: 8, length: 10, pitch: 26, eave: .6, rake: .5, step: .6,
  rafter: '50x200', plate: '150x150', seat: 'block', hipW: '100',
  tieMode: 'side', tieSides: 1, tiePos: .62, tieSect: '50x150', boltD: 12, boltN: 4,
  scheme: 'nasl', snowZone: 'IV', windZone: 'II', grade: '2', moisture: 18,
  cover: 'metaltile', insul: 0, deck: 'auto',
  stock: 6000, kerf: 4, allow: 30, tol: 2, prefix: 'КР', longStrategy: 'support',
  braces: 1, ties: 1, fix: 1, joists: 1, gutter: 1, snow: 1, soffit: 1,

  // мансарда
  mansard: 0, mansardScheme: 'broken', mansardKnee: .9,
  mansardBreak: .45, mansardLowPitch: 62, mansardHighPitch: 28,
  economy: 1,

  explode: 0, secOn: 0, sec: 0, wire: 0, grid: 1, quality: 'high', marks: 1, stage: 13
};

export const SEATS = {
  notch: { n: 'Запил по мауэрлату (площадка на всю ширину)', s: 'Запил' },
  block: { n: 'Опорный брусок с седлом и упором', s: 'Опорный брусок' },
  cleat: { n: 'Прибоины под каждую стропилу', s: 'Прибоины' }
};

export const TIEMODE = {
  side:  { n: 'Сбоку, накладной на болтах', s: 'Сбоку' },
  under: { n: 'Снизу, верхняя грань по подошве стропил', s: 'Снизу' }
};

export const COVERS = {
  metaltile: { n: 'Металлочерепица', w: 1.10, module: .35, solid: false, rate: 'metaltile', work: 'wMetaltile', min: 14, col: '#5c6b7a', kg: 5 },
  seam:      { n: 'Фальцевая кровля', w: .55, module: 0, solid: true, rate: 'seam', work: 'wSeam', min: 7, col: '#6d7c8a', kg: 6 },
  shingle:   { n: 'Гибкая черепица', w: 0, module: 0, solid: true, rate: 'shingle', work: 'wShingle', min: 12, col: '#4a4038', kg: 12 },
  prof:      { n: 'Профлист С21', w: 1.00, module: .60, solid: false, rate: 'prof', work: 'wProf', min: 12, col: '#5f6f7d', kg: 4.5 }
};

export const RAFTER_MAX = { '50x150': 2.5, '50x200': 3.5, '50x250': 4.4, '60x200': 3.9, '60x250': 4.8 };
export const SNOW = { I: .8, II: 1.2, III: 1.8, IV: 2.4, V: 3.2, VI: 4.0, VII: 4.8, VIII: 5.6 };
export const WIND = { I: .23, II: .30, III: .38, IV: .48, V: .60, VI: .73, VII: .85 };
export const GRADE = {
  '1': { Ri: 14, Rt: 10, Rsm: 2.0, E: 10000, n: '1 сорт' },
  '2': { Ri: 13, Rt: 7, Rsm: 1.8, E: 10000, n: '2 сорт' },
  '3': { Ri: 8.5, Rt: 5, Rsm: 1.4, E: 9000, n: '3 сорт' }
};
export const RHO = 500;