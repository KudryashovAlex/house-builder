import { ROOF_DEFAULTS } from './roof-params.js';
import { computeRoofModel } from './roof-model.js';
import { computeRoofStructure } from './roof-structure.js';
import { computeRoofPieces } from './roof-pieces.js';
import { nestRoofPieces } from './roof-nesting.js';
import { roofBOM, roofPrice } from './roof-bom.js';
import { roofChecks } from './roof-checks.js';
import { planLongMembers } from './roof-long.js';

/* План опор считается ВНУТРИ вывода: его детали попадают в раскрой,
   смету и этикетки наравне с остальными. Раньше они жили отдельно
   и в распил не попадали вовсе. */
export function createRoof(initial = {}) {
  let params = { ...ROOF_DEFAULTS, ...initial };
  let cache = null;
  const subs = new Set();
  const invalidate = () => { cache = null; };
  const emit = () => subs.forEach(fn => { try { fn(api); } catch (e) { console.error(e); } });

  function derived() {
    if (cache) return cache;
    const model = computeRoofModel(params);
    const structure = computeRoofStructure(params, model);
    const pieces = computeRoofPieces(params, model);
    const plan = planLongMembers(model, params, pieces);
    const nesting = nestRoofPieces(pieces, params);
    const lines = [...roofBOM(params, model, structure, pieces, nesting), ...plan.bom];
    const estimate = roofPrice(lines);
    const checks = roofChecks(params, model, structure, pieces, nesting);
    cache = { model, structure, pieces, plan, nesting, lines, estimate, checks };
    return cache;
  }

  const api = {
    get: () => params,
    set(k, v) { params[k] = v; invalidate(); emit(); return api; },
    patch(o) { Object.assign(params, o); invalidate(); emit(); return api; },
    reset(next = {}) { params = { ...ROOF_DEFAULTS, ...next }; invalidate(); emit(); return api; },
    model: () => derived().model,
    structure: () => derived().structure,
    pieces: () => derived().pieces,
    plan: () => derived().plan,
    nesting: () => derived().nesting,
    bom: () => derived().lines,
    estimate: () => derived().estimate,
    checks: () => derived().checks,
    all: derived,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    refresh() { invalidate(); emit(); return api; }
  };
  return api;
}