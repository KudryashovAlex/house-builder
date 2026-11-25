export function nestRoofPieces(list, p) {
  const stock = +p.stock, kerf = +p.kerf, tol = +p.tol, bySect = new Map();
  list.forEach(it => {
    const k = it.sectS;
    if (!bySect.has(k)) bySect.set(k, []);
    for (let i = 0; i < it.qty; i++) bySect.get(k).push({ mark: it.mark, len: it.cutLen, sect: k });
  });
  const bins = [], over = [];
  bySect.forEach(items => {
    items.sort((a, b) => b.len - a.len);
    const local = [];
    items.forEach(it => {
      if (it.len > stock) { over.push(it); return; }
      let best = null, bestRest = 1e9;
      local.forEach(b => { const rest = stock - b.used - it.len - kerf; if (rest >= 0 && rest < bestRest) { best = b; bestRest = rest; } });
      if (best) { best.items.push(it); best.used += it.len + kerf; }
      else local.push({ sect: it.sect, used: it.len + kerf, items: [it] });
    });
    local.forEach(b => bins.push(b));
  });
  const boards = bins.length;
  // Детали длиннее заготовки тоже потребляют материал — иначе отход завышается
  const usedLen = bins.reduce((s, b) => s + b.items.reduce((q, i) => q + i.len, 0), 0)
    + over.reduce((s, i) => s + i.len, 0);
  const stockLen = boards * stock + over.reduce((s, i) => s + i.len, 0);
  const waste = stockLen > 0 ? 1 - usedLen / stockLen : 0;
  const vol = bins.reduce((s, b) => { const [a, c] = b.sect.split('×').map(Number); return s + a / 1000 * c / 1000 * stock / 1000; }, 0)
    + over.reduce((s, i) => { const [a, c] = i.sect.split('×').map(Number); return s + a / 1000 * c / 1000 * i.len / 1000; }, 0);
  const usable = Math.max(500, stock - +p.allow - kerf);
  return { bins, over, boards, waste, vol, stock, kerf, tol, usedLen, stockLen, usable };
}