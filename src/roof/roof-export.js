import { mm, f2, f3, fmt } from './format.js';
import { ROOF_STAGES } from './roof-stages.js';
import { RATES } from './roof-prices.js';

const csv = rows => '\uFEFF' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');

export function cutCSV(p, pieces, S, NS) {
  const rows = [['Марка','Штрихкод','Наименование','Сечение мм','Длина мм','Заготовка мм','Кол-во','Рез A тип','Рез A к оси','Рез A пила','Рез A план','Рез B тип','Рез B к оси','Рез B пила','Врубка','Глубина мм','От верха мм','Этап','Объём м3','Масса кг','Примечание']];
  pieces.forEach(i => rows.push([i.mark, i.code, i.name, i.sectS, mm(i.len), i.cutLen, i.qty,
    i.cutA.t, i.cutA.a, i.cutA.saw ?? '', i.cutA.cheek ?? '', i.cutB.t, i.cutB.a, i.cutB.saw ?? '',
    i.notch ? i.notch.t : '', i.notch ? i.notch.d : '', i.notch ? i.notch.at : '', i.stage, f3(i.vol), fmt(i.mass), i.note]));
  rows.push([], ['Сорт', S.G.n], ['Влажность %', Math.min(20, +p.moisture)], ['Допуск мм', '±' + p.tol],
    ['Припуск мм', p.allow], ['Пропил мм', p.kerf], ['Заготовка мм', NS.stock]);
  return csv(rows);
}

export function nestCSV(NS) {
  const rows = [['Заготовка №','Сечение','Длина заготовки мм','Использовано мм','Остаток мм','Детали']];
  NS.bins.forEach((b, i) => rows.push([i + 1, b.sect, NS.stock, Math.round(b.used), Math.round(NS.stock - b.used), b.items.map(x => x.mark + ':' + x.len).join(' | ')]));
  NS.over.forEach(o => rows.push(['ВНЕ ГАБАРИТА', o.sect, o.len, o.len, 0, o.mark]));
  rows.push([], ['Всего заготовок', NS.boards], ['Отход %', Math.round(NS.waste * 100)], ['Объём м3', f2(NS.vol)]);
  return csv(rows);
}

export function assemblyCSV(pieces, m) {
  const rows = [['Этап','Название','Описание','Марки','Деталей','Крепёж']];
  ROOF_STAGES.forEach((s, i) => {
    const ms = pieces.filter(x => x.stage === i);
    const fast = i === 1 ? 'Шпилька М12 ×' + m.fix.stud
      : i === 6 ? `Болт М${m.boltD} ×${m.fix.bolt}, скользящие ×${m.fix.slide}`
      : i === 7 ? 'Болт М10 ×' + m.fix.bolt10
      : i === 8 ? 'Уголки ×' + m.jackJoints * 2
      : i === 12 ? 'Саморез 7/м²' : '';
    rows.push([i, s.t, s.d, ms.map(x => x.mark + '×' + x.qty).join(' | '), ms.reduce((a, x) => a + x.qty, 0), fast]);
  });
  return csv(rows);
}

export function packageJSON(roof) {
  const p = roof.get(), d = roof.all();
  return JSON.stringify({
    project: 'ДОМ·ЛЕС · производственный пакет кровли',
    date: new Date().toISOString(),
    params: p,
    geometry: {
      area: d.model.area, span: d.model.span, length: d.model.length, pitch: d.model.pitch,
      ridgeLen: d.model.ridgeLen, apex: d.model.apex, hipCount: d.model.hips.length,
      hipLength: d.model.hips[0] ? d.model.hips[0].full : 0,
      tieOverlap: d.model.fullOverlap, notch: d.model.notchRatio
    },
    structure: {
      grade: d.structure.G.n, snowZone: p.snowZone, Sg: d.structure.Sg, mu: d.structure.mu,
      qd: d.structure.qd, tieN: d.structure.tieN, boltFvRd: d.structure.FvRd,
      boltUtil: d.structure.utilB, rafterUtil: d.structure.utilR,
      defl: d.structure.defl, deflLim: d.structure.deflLim, bearing: d.structure.smB
    },
    checks: d.checks.map(c => ({ level: c.lv, title: c.t, detail: String(c.d).replace(/<[^>]+>/g, '') })),
    pieces: d.pieces.map(i => ({
      mark: i.mark, barcode: i.code, name: i.name, section: i.sectS, lengthMM: mm(i.len),
      stockLengthMM: i.cutLen, qty: i.qty, cutA: i.cutA, cutB: i.cutB, notch: i.notch,
      stage: i.stage, volumeM3: +f3(i.vol), massKg: Math.round(i.mass)
    })),
    nesting: {
      stockMM: d.nesting.stock, kerfMM: d.nesting.kerf, allowMM: +p.allow, tolMM: +p.tol,
      boards: d.nesting.boards, waste: d.nesting.waste, volumeM3: d.nesting.vol,
      bins: d.nesting.bins.map((b, i) => ({ n: i + 1, section: b.sect, usedMM: Math.round(b.used), items: b.items })),
      oversize: d.nesting.over
    },
    assembly: ROOF_STAGES.map((s, i) => ({
      stage: i, title: s.t, description: s.d,
      marks: d.pieces.filter(x => x.stage === i).map(x => ({ mark: x.mark, qty: x.qty }))
    })),
    rates: Object.fromEntries(Object.entries(RATES).map(([k, r]) => [k, { value: r.v, unit: r.u, source: r.src }])),
    estimate: {
      lines: d.estimate.lines, materials: d.estimate.mat,
      sawmill: d.estimate.saw, work: d.estimate.work, total: d.estimate.total
    }
  }, null, 2);
}

export function download(name, text, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}