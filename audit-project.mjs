/* ══════════════════════════════════════════════════════════════
   АУДИТ ПРОЕКТА · без зависимостей, Node 18+
   Кладётся в корень: node audit-project.mjs
   Читает файлы, строит граф, проверяет экспорты, циклы, мёртвые
   файлы, контракты данных и реально запускает чистые модули.
   ══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ARGV = process.argv.slice(2);
const arg = (k, d) => { const i = ARGV.indexOf('--' + k); return i < 0 ? d : (ARGV[i + 1] && !ARGV[i + 1].startsWith('--') ? ARGV[i + 1] : true); };
const OPT = {
  root: path.resolve(String(arg('root', '.'))),
  out: String(arg('out', 'project-audit')),
  runtime: !ARGV.includes('--no-runtime'),
  html: !ARGV.includes('--no-html'),
  md: !ARGV.includes('--no-md'),
  json: !ARGV.includes('--no-json'),
  quiet: ARGV.includes('--quiet'),
  failOn: String(arg('fail-on', 'error')),
  maxDepth: Number(arg('depth', 12))
};
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', '.next', '.cache', 'out']);
const CODE = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
const C = process.stdout.isTTY && !ARGV.includes('--no-color');
const col = (c, s) => C ? `\x1b[${c}m${s}\x1b[0m` : String(s);
const red = s => col('31;1', s), grn = s => col('32;1', s), yel = s => col('33;1', s),
  blu = s => col('36;1', s), dim = s => col('90', s), bold = s => col('1', s), mag = s => col('35;1', s);

function walk(dir, base, acc = [], depth = 0) {
  if (depth > OPT.maxDepth) return acc;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.env') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, base, acc, depth + 1); }
    else acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
}

function tokenize(src) {
  const T = []; const n = src.length; let i = 0;
  const isIdS = c => /[A-Za-z0-9_$]/.test(c);
  const prevSig = () => { for (let k = T.length - 1; k >= 0; k--) return T[k]; return null; };
  const regexAllowed = () => {
    const p = prevSig(); if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 'regex') return false;
    if (p.t === 'id') return ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await', 'instanceof'].includes(p.v);
    if (p.t === 'punc') return ![')', ']', '}', '++', '--'].includes(p.v);
    return true;
  };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '#' && src[i + 1] === '!') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'") {
      const s = i, q = c; i++;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      T.push({ t: 'str', v: src.slice(s + 1, i - 1), s, e: i }); continue;
    }
    if (c === '`') {
      const s = i; i++; let depth = 0;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (depth === 0 && src[i] === '`') { i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0 && src[i] === '}') { depth--; i++; continue; }
        i++;
      }
      T.push({ t: 'tpl', v: src.slice(s + 1, i - 1), s, e: i }); continue;
    }
    if (c === '/' && regexAllowed()) {
      const s = i; i++; let cls = false, ok = false;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '\n') break;
        if (d === '[') cls = true;
        else if (d === ']') cls = false;
        else if (d === '/' && !cls) { i++; ok = true; break; }
        i++;
      }
      if (ok) { while (i < n && /[gimsuyd]/.test(src[i])) i++; T.push({ t: 'regex', v: src.slice(s, i), s, e: i }); continue; }
      i = s;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const s = i; while (i < n && /[0-9a-fA-FxXoObBn._]/.test(src[i])) i++;
      T.push({ t: 'num', v: src.slice(s, i), s, e: i }); continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const s = i; while (i < n && isIdS(src[i])) i++;
      T.push({ t: 'id', v: src.slice(s, i), s, e: i }); continue;
    }
    const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
    if (['===', '!==', '...', '**=', '&&=', '||=', '??=', '>>>', '<<='].includes(three)) { T.push({ t: 'punc', v: three, s: i, e: i + 3 }); i += 3; continue; }
    if (['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>', '&=', '|=', '^='].includes(two)) { T.push({ t: 'punc', v: two, s: i, e: i + 2 }); i += 2; continue; }
    T.push({ t: 'punc', v: c, s: i, e: i + 1 }); i++;
  }
  return T;
}

function parseModule(src) {
  const T = tokenize(src);
  const imports = [], exports = [], shapes = [], reads = [], userData = { write: new Set(), read: new Set() };
  const at = k => T[k];
  const isKW = (k, v) => at(k) && at(k).t === 'id' && at(k).v === v;
  const isP = (k, v) => at(k) && at(k).t === 'punc' && at(k).v === v;
  const readClause = (k) => {
    const names = []; let j = k;
    const takeDefault = () => { if (at(j) && at(j).t === 'id' && at(j).v !== 'from') { names.push({ imported: 'default', local: at(j).v }); j++; } };
    if (at(j) && at(j).t === 'str') return { names, next: j };
    if (!isP(j, '{') && !isP(j, '*')) { takeDefault(); if (isP(j, ',')) j++; }
    if (isP(j, '*')) { j++; if (isKW(j, 'as')) { j++; names.push({ imported: '*', local: at(j)?.v || '*' }); j++; } }
    else if (isP(j, '{')) {
      j++;
      while (j < T.length && !isP(j, '}')) {
        if (isP(j, ',')) { j++; continue; }
        const a = at(j)?.v; j++;
        let b = a;
        if (isKW(j, 'as')) { j++; b = at(j)?.v; j++; }
        if (a) names.push({ imported: a, local: b });
      }
      if (isP(j, '}')) j++;
    }
    return { names, next: j };
  };
  for (let k = 0; k < T.length; k++) {
    if (isKW(k, 'import')) {
      const nx = at(k + 1);
      if (nx && nx.t === 'punc' && (nx.v === '(' || nx.v === '.')) {
        if (nx.v === '(' && at(k + 2) && at(k + 2).t === 'str')
          imports.push({ spec: at(k + 2).v, names: [], kind: 'dynamic', line: lineOf(src, nx.s) });
        continue;
      }
      if (nx && nx.t === 'str') { imports.push({ spec: nx.v, names: [], kind: 'side', line: lineOf(src, nx.s) }); continue; }
      const { names, next } = readClause(k + 1);
      let j = next;
      if (isKW(j, 'from')) j++;
      const sp = at(j);
      if (sp && sp.t === 'str') imports.push({ spec: sp.v, names, kind: names.length ? 'named' : 'side', line: lineOf(src, nx ? nx.s : k) });
      continue;
    }
    if (isKW(k, 'export')) {
      let j = k + 1;
      if (isKW(j, 'default')) { exports.push({ name: 'default', kind: 'default', line: lineOf(src, T[k].s) }); continue; }
      if (isKW(j, 'type')) { continue; }
      if (isP(j, '*')) {
        j++; let alias = '*';
        if (isKW(j, 'as')) { j++; alias = at(j)?.v || '*'; j++; }
        if (isKW(j, 'from')) j++;
        const sp = at(j);
        if (sp && sp.t === 'str') { imports.push({ spec: sp.v, names: [{ imported: '*', local: '*' }], kind: 'reexport-all', line: lineOf(src, T[k].s) }); exports.push({ name: alias, kind: 'star', from: sp.v, line: lineOf(src, T[k].s) }); }
        continue;
      }
      if (isP(j, '{')) {
        const list = []; j++;
        while (j < T.length && !isP(j, '}')) {
          if (isP(j, ',')) { j++; continue; }
          const a = at(j)?.v; j++; let b = a;
          if (isKW(j, 'as')) { j++; b = at(j)?.v; j++; }
          if (a) list.push({ local: a, name: b });
        }
        if (isP(j, '}')) j++;
        if (isKW(j, 'from')) {
          j++; const sp = at(j);
          if (sp && sp.t === 'str') {
            imports.push({ spec: sp.v, names: list.map(x => ({ imported: x.local, local: x.name })), kind: 'reexport', line: lineOf(src, T[k].s) });
            list.forEach(x => exports.push({ name: x.name, kind: 'reexport', from: sp.v, orig: x.local, line: lineOf(src, T[k].s) }));
          }
        } else list.forEach(x => exports.push({ name: x.name, kind: 'named', orig: x.local, line: lineOf(src, T[k].s) }));
        continue;
      }
      if (isKW(j, 'const') || isKW(j, 'let') || isKW(j, 'var')) {
        j++;
        if (isP(j, '{') || isP(j, '[')) {
          const close = isP(j, '{') ? '}' : ']'; j++;
          while (j < T.length && !isP(j, close)) {
            if (at(j).t === 'id' && !isKW(j, 'as')) {
              const nm = at(j).v;
              if (!['const', 'let', 'var'].includes(nm)) exports.push({ name: nm, kind: 'named', line: lineOf(src, T[k].s) });
            }
            if (isP(j, '{') || isP(j, '[') || isP(j, '(')) { let d = 1; j++; while (j < T.length && d) { if (isP(j, '{') || isP(j, '[') || isP(j, '(')) d++; if (isP(j, '}') || isP(j, ']') || isP(j, ')')) d--; j++; } continue; }
            j++;
          }
        } else if (at(j) && at(j).t === 'id') exports.push({ name: at(j).v, kind: 'named', line: lineOf(src, T[k].s) });
        continue;
      }
      if (isKW(j, 'async')) j++;
      if (isKW(j, 'function') || isKW(j, 'class')) {
        j++; if (isP(j, '*')) j++;
        if (at(j) && at(j).t === 'id') exports.push({ name: at(j).v, kind: 'named', line: lineOf(src, T[k].s) });
        continue;
      }
      continue;
    }
    if (isP(k, '{') && at(k + 1) && at(k + 1).t === 'id' && ['t', 'type', 'kind'].includes(at(k + 1).v) && isP(k + 2, ':') && at(k + 3) && at(k + 3).t === 'str') {
      const disc = at(k + 1).v, val = at(k + 3).v;
      const keys = []; let j = k + 1, d = 0;
      while (j < T.length) {
        if (isP(j, '{')) d++;
        else if (isP(j, '}')) { d--; if (!d) break; }
        if (d === 1 && at(j).t === 'id' && isP(j + 1, ':')) keys.push(at(j).v);
        j++;
      }
      if (keys.length) shapes.push({ disc, val, keys: [...new Set(keys)], line: lineOf(src, T[k].s) });
    }
    if (at(k) && at(k).t === 'id' && isP(k + 1, '.') && at(k + 2) && at(k + 2).t === 'id') {
      const obj = at(k).v, prop = at(k + 2).v;
      if (isP(k + 3, '.') && at(k + 4) && at(k + 4).t === 'id') {
        if (prop === 'userData') {
          const f = at(k + 4).v;
          const assign = isP(k + 5, '=') || isP(k + 5, '+=') || isP(k + 5, '||=');
          (assign ? userData.write : userData.read).add(f);
        }
      } else if (!['length', 'prototype', 'constructor'].includes(prop)) {
        const indexed = isP(k + 3, '[');
        reads.push({ obj, prop, indexed, line: lineOf(src, T[k].s) });
      }
    }
  }
  const uniq = new Map();
  exports.forEach(e => { if (!uniq.has(e.name)) uniq.set(e.name, e); });
  return { imports, exports: [...uniq.values()], shapes, reads, userData: { write: [...userData.write], read: [...userData.read] }, tokens: T.length };
}
function lineOf(src, idx) { let l = 1; for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') l++; return l; }

const files = walk(OPT.root, OPT.root).sort();
const codeFiles = files.filter(f => CODE.has(path.extname(f)));
const htmlFiles = files.filter(f => f.endsWith('.html'));
const cssFiles = files.filter(f => f.endsWith('.css'));
const MOD = new Map();
const ISSUES = [];
const add = (sev, kind, title, detail, file, line) => ISSUES.push({ sev, kind, title, detail: detail || '', file: file || '', line: line || 0 });

for (const f of codeFiles) {
  let src = ''; try { src = fs.readFileSync(path.join(OPT.root, f), 'utf8'); } catch (e) { add('error', 'io', 'Файл не читается', String(e.message), f); continue; }
  let p; try { p = parseModule(src); } catch (e) { add('error', 'parse', 'Разбор не удался', String(e.message), f); p = { imports: [], exports: [], shapes: [], reads: [], userData: { write: [], read: [] }, tokens: 0 }; }
  MOD.set(f, { file: f, lines: src.split('\n').length, bytes: Buffer.byteLength(src), ...p });
}

let PKG = null;
try { PKG = JSON.parse(fs.readFileSync(path.join(OPT.root, 'package.json'), 'utf8')); } catch { }
const deps = new Set([...Object.keys(PKG?.dependencies || {}), ...Object.keys(PKG?.devDependencies || {}), ...Object.keys(PKG?.peerDependencies || {})]);
const IMPORTMAP = {};
const ENTRIES = new Set();
for (const h of htmlFiles) {
  const src = fs.readFileSync(path.join(OPT.root, h), 'utf8');
  const im = src.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  if (im) { try { const j = JSON.parse(im[1]); Object.assign(IMPORTMAP, j.imports || {}); } catch (e) { add('warn', 'html', 'importmap не парсится', String(e.message), h); } }
  const re = /<script[^>]*\bsrc=["']([^"']+)["']/gi; let m;
  while ((m = re.exec(src))) {
    const s = m[1].replace(/^\.\//, '').split('?')[0];
    if (/^https?:/.test(s)) continue;
    ENTRIES.add(norm(path.join(path.dirname(h), s)));
  }
  const inline = /<script[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = inline.exec(src))) {
    const body = m[1];
    const ri = /(?:from|import)\s*['"]([^'"]+)['"]/g; let mm;
    while ((mm = ri.exec(body))) {
      const s = mm[1];
      if (s.startsWith('.')) {
        const target = norm(path.join(path.dirname(h), s));
        MOD.get(h) || MOD.set(h, { file: h, src, lines: src.split('\n').length, bytes: Buffer.byteLength(src), imports: [], exports: [], shapes: [], reads: [], userData: { write: [], read: [] }, html: true });
        MOD.get(h).imports.push({ spec: s, names: [], kind: 'html', line: lineOf(src, src.indexOf(mm[0])), resolved: target });
      }
    }
    ENTRIES.add(h);
  }
}
if (PKG?.main) ENTRIES.add(norm(PKG.main));
if (PKG?.module) ENTRIES.add(norm(PKG.module));
['index.js', 'main.js', 'src/main.js', 'src/index.js'].forEach(f => { if (MOD.has(f)) ENTRIES.add(f); });

function norm(p) { return p.split(path.sep).join('/').replace(/^\.\//, ''); }

const EXTS = ['', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.css', '.json', '/index.js', '/index.ts'];
function resolve(spec, fromFile) {
  if (IMPORTMAP[spec]) return { kind: 'importmap', target: IMPORTMAP[spec] };
  for (const k of Object.keys(IMPORTMAP)) if (k.endsWith('/') && spec.startsWith(k)) return { kind: 'importmap', target: IMPORTMAP[k] + spec.slice(k.length) };
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const base = spec.startsWith('/') ? spec.slice(1) : norm(path.join(path.dirname(fromFile), spec));
    for (const e of EXTS) { const cand = norm(base + e); if (MOD.has(cand) || files.includes(cand)) return { kind: 'local', target: cand }; }
    return { kind: 'missing', target: base };
  }
  if (spec.startsWith('node:')) return { kind: 'node', target: spec };
  const rootPkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (deps.has(rootPkg)) return { kind: 'pkg', target: rootPkg };
  if (['three', 'react', 'vue'].includes(rootPkg)) return { kind: 'pkg-undeclared', target: rootPkg };
  return { kind: 'unknown', target: spec };
}

const EDGES = [];
for (const [f, m] of MOD) {
  for (const im of m.imports) {
    const r = im.resolved ? { kind: 'local', target: im.resolved } : resolve(im.spec, f);
    im.res = r;
    if (r.kind === 'missing') add('error', 'resolve', 'Импорт не разрешается', `${im.spec} → ${r.target}`, f, im.line);
    if (r.kind === 'unknown') add('error', 'resolve', 'Неизвестный пакет', `${im.spec} — нет в package.json и importmap`, f, im.line);
    if (r.kind === 'pkg-undeclared') add('warn', 'resolve', 'Пакет не объявлен в package.json', `${im.spec} разрешается через importmap, но не установлен как зависимость`, f, im.line);
    if (r.kind === 'local' || r.kind === 'importmap') EDGES.push({ from: f, to: r.target, im });
  }
}

function hasExport(file, name, seen = new Set()) {
  if (seen.has(file + ':' + name)) return false;
  seen.add(file + ':' + name);
  const m = MOD.get(file); if (!m) return false;
  if (name === '*') return true;
  const direct = m.exports.find(e => e.name === name);
  if (direct) {
    if (direct.kind === 'reexport' && direct.from) {
      const r = resolve(direct.from, file);
      return r.kind === 'local' ? hasExport(r.target, direct.orig || name, seen) : true;
    }
    return true;
  }
  for (const e of m.exports.filter(x => x.kind === 'star')) {
    const r = resolve(e.from, file);
    if (r.kind === 'local' && hasExport(r.target, name, seen)) return true;
  }
  return false;
}
let namedChecked = 0, namedOk = 0;
for (const e of EDGES) {
  const m = MOD.get(e.from); if (!m) continue;
  for (const nm of e.im.names || []) {
    if (nm.imported === '*' || e.im.kind === 'reexport-all') continue;
    if (!MOD.has(e.to)) continue;
    namedChecked++;
    if (hasExport(e.to, nm.imported)) namedOk++;
    else add('error', 'export', 'Импортируется несуществующий экспорт', `${nm.imported} из ${e.to}`, e.from, e.im.line);
  }
}

const adj = new Map(); const radj = new Map();
for (const f of MOD.keys()) { adj.set(f, []); radj.set(f, []); }
for (const e of EDGES) { if (adj.has(e.from) && adj.has(e.to)) { adj.get(e.from).push(e.to); radj.get(e.to).push(e.from); } }

function tarjan() {
  let idx = 0; const I = new Map(), L = new Map(), on = new Set(), st = [], out = [];
  const strong = v => {
    I.set(v, idx); L.set(v, idx); idx++; st.push(v); on.add(v);
    for (const w of adj.get(v) || []) {
      if (!I.has(w)) { strong(w); L.set(v, Math.min(L.get(v), L.get(w))); }
      else if (on.has(w)) L.set(v, Math.min(L.get(v), I.get(w)));
    }
    if (L.get(v) === I.get(v)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) out.push(c); }
  };
  for (const v of MOD.keys()) if (!I.has(v)) strong(v);
  return out;
}
const CYCLES = tarjan();
CYCLES.forEach(c => add('warn', 'cycle', 'Циклическая зависимость', c.join(' → ') + ' → ' + c[0], c[0]));
for (const [f, list] of adj) if (list.includes(f)) add('warn', 'cycle', 'Файл импортирует сам себя', f, f);

const reach = new Set();
const stack = [...ENTRIES].filter(f => MOD.has(f));
while (stack.length) { const f = stack.pop(); if (reach.has(f)) continue; reach.add(f); (adj.get(f) || []).forEach(t => stack.push(t)); }
const DEAD = [...MOD.keys()].filter(f => !reach.has(f) && !ENTRIES.has(f));
DEAD.forEach(f => add('info', 'dead', 'Файл недостижим из точек входа', `${f} — никто не импортирует, из HTML не подключён`, f));

const usedNames = new Set();
for (const e of EDGES) for (const nm of e.im.names || []) usedNames.add(e.to + ':' + nm.imported);
function markUsed(file, name, seen = new Set()) {
  const key = file + ':' + name; if (seen.has(key)) return; seen.add(key);
  usedNames.add(key);
  const m = MOD.get(file); if (!m) return;
  const ex = m.exports.find(x => x.name === name);
  if (ex?.from) { const r = resolve(ex.from, file); if (r.kind === 'local') markUsed(r.target, ex.orig || name, seen); }
  if (name === '*') m.exports.forEach(x => { if (x.from) { const r = resolve(x.from, file); if (r.kind === 'local') markUsed(r.target, x.orig || x.name, seen); } });
}
[...usedNames].forEach(k => { const i = k.lastIndexOf(':'); markUsed(k.slice(0, i), k.slice(i + 1)); });
const UNUSED = [];
for (const [f, m] of MOD) {
  if (ENTRIES.has(f) || DEAD.includes(f)) continue;
  m.exports.forEach(e => {
    if (e.name === 'default' || e.kind === 'star') return;
    if (!usedNames.has(f + ':' + e.name)) UNUSED.push({ file: f, name: e.name, line: e.line });
  });
}
UNUSED.forEach(u => add('info', 'unused', 'Экспорт никем не используется', `${u.name} в ${u.file}`, u.file, u.line));

const CONTRACTS = [];
const producers = [...MOD.values()].filter(m => m.shapes.length);
for (const p of producers) {
  const groups = new Map();
  p.shapes.forEach(s => { const k = s.disc + ':' + s.val; if (!groups.has(k)) groups.set(k, s); });
  const variants = [...groups.values()];
  if (variants.length < 2) continue;
  const disc = variants[0].disc;
  const common = variants.reduce((acc, v) => acc.filter(k => v.keys.includes(k)), variants[0].keys.slice());
  const consumers = (radj.get(p.file) || []).map(f => MOD.get(f)).filter(Boolean);
  for (const c of consumers) {
    const risky = [];
    for (const r of c.reads) {
      if (r.prop === disc || common.includes(r.prop)) continue;
      const owners = variants.filter(v => v.keys.includes(r.prop));
      if (!owners.length || owners.length === variants.length) continue;
      let near = '';
      try { const lines = fs.readFileSync(path.join(OPT.root, c.file), 'utf8').split('\n'); near = lines[r.line - 1] || ''; } catch {}
      const guarded = new RegExp(`(${disc}|type|kind)\\s*===|\\.\\s*${r.prop}\\s*\\?|Array\\.isArray|&&`).test(near);
      if (!guarded) risky.push({ prop: r.prop, line: r.line, onlyIn: owners.map(o => o.val).join('/'), missingIn: variants.filter(v => !v.keys.includes(r.prop)).map(v => v.val).join('/') });
    }
    if (risky.length) CONTRACTS.push({
      producer: p.file, consumer: c.file, disc,
      variants: variants.map(v => ({ val: v.val, keys: v.keys })),
      common, risky
    });
  }
}
CONTRACTS.forEach(c => c.risky.forEach(r =>
  add('error', 'contract', 'Чтение поля, которого нет во всех вариантах формы',
    `${c.consumer}:${r.line} читает .${r.prop} — есть только у ${r.onlyIn}, нет у ${r.missingIn} (производитель ${c.producer})`, c.consumer, r.line)));

const UD_W = new Map(), UD_R = new Map();
for (const [f, m] of MOD) {
  m.userData.write.forEach(k => { if (!UD_W.has(k)) UD_W.set(k, []); UD_W.get(k).push(f); });
  m.userData.read.forEach(k => { if (!UD_R.has(k)) UD_R.get(k) || UD_R.set(k, []); UD_R.get(k).push(f); });
}
const USERDATA = [...new Set([...UD_W.keys(), ...UD_R.keys()])].map(k => ({
  key: k, writers: UD_W.get(k) || [], readers: UD_R.get(k) || []
}));
USERDATA.filter(u => u.readers.length && !u.writers.length).forEach(u =>
  add('warn', 'contract', 'userData читается, но нигде не пишется', `${u.key}: читают ${u.readers.join(', ')}`, u.readers[0]));

const LAYER_ORDER = ['vec3', 'format', 'roof-params', 'roof-stages', 'roof-prices', 'roof-mansard', 'roof-model', 'roof-structure', 'roof-long', 'roof-pieces', 'roof-nesting', 'roof-bom', 'roof-checks', 'roof-barcode', 'roof-export', 'roof-controller', 'index', 'roof-hardware', 'roof-render', 'lab'];
const layerOf = f => { const b = path.basename(f).replace(/\.(js|mjs|css)$/, ''); const i = LAYER_ORDER.indexOf(b); return i < 0 ? 99 : i; };
for (const e of EDGES) {
  const a = layerOf(e.from), b = layerOf(e.to);
  if (a < 99 && b < 99 && b > a && !MOD.get(e.from)?.html)
    add('info', 'layer', 'Обратная связь по слоям', `${e.from} (слой ${a}) импортирует ${e.to} (слой ${b})`, e.from, e.im.line);
}

let MAPDIFF = null;
const mapFile = files.find(f => /roof-map\.html$/.test(f));
if (mapFile) {
  const src = fs.readFileSync(path.join(OPT.root, mapFile), 'utf8');
  const mm = src.match(/const\s+M\s*=\s*(\[[\s\S]*?\n\];)/);
  if (mm) {
    let claimed = [];
    try { claimed = Function('"use strict";return ' + mm[1].replace(/;$/, ''))(); } catch (e) { add('warn', 'map', 'Данные карты не разбираются', String(e.message), mapFile); }
    if (Array.isArray(claimed) && claimed.length) {
      const rows = [];
      const realByBase = new Map([...MOD.keys()].map(f => [path.basename(f), f]));
      claimed.forEach(c => {
        const base = path.basename(c.file || '');
        const real = realByBase.get(base);
        const rec = { id: c.id, file: c.file, exists: !!real, issues: [] };
        if (!real) { rec.issues.push('файла нет на диске'); rows.push(rec); return; }
        const m = MOD.get(real);
        const realEx = new Set(m.exports.map(e => e.name));
        (c.ex || []).forEach(e => {
          const nm = String(e[0] || '').split(' / ')[0].trim();
          if (nm && !realEx.has(nm) && !/^(re-exports|:root|\.|@|select|input)/.test(nm)) rec.issues.push(`заявлен экспорт ${nm}, которого нет`);
        });
        [...realEx].forEach(n => {
          if (n === 'default') return;
          if (!(c.ex || []).some(e => String(e[0] || '').includes(n))) rec.issues.push(`экспорт ${n} есть в коде, но не описан в карте`);
        });
        const realImp = new Set(m.imports.map(i => i.res?.target).filter(Boolean).map(t => path.basename(t).replace(/\.(js|mjs|css)$/, '')));
        (c.imp || []).forEach(i => { const b = String(i).replace(/\s*\(.*\)$/, ''); if (!realImp.has(b) && !/внешн/.test(i)) rec.issues.push(`заявлена зависимость ${b}, её нет`); });
        [...realImp].forEach(b => { if (!(c.imp || []).some(i => String(i).startsWith(b))) rec.issues.push(`зависимость ${b} есть, но не описана`); });
        const isDead = DEAD.includes(real);
        if (!!c.dead !== isDead) rec.issues.push(isDead ? 'файл мёртвый, а карта считает живым' : 'карта считает мёртвым, а он достижим');
        rows.push(rec);
      });
      const notInMap = [...MOD.keys()].filter(f => !claimed.some(c => path.basename(c.file || '') === path.basename(f)) && !MOD.get(f).html);
      MAPDIFF = { file: mapFile, rows, notInMap };
      rows.filter(r => r.issues.length).forEach(r => add('warn', 'map', 'Карта расходится с кодом', `${r.file}: ${r.issues.join('; ')}`, r.file));
      notInMap.forEach(f => add('info', 'map', 'Файла нет в карте', f, f));
    }
  }
}

const RUNTIME = { ran: false, loaded: [], failed: [], browserOnly: [], matrix: [], ownAudit: null };
async function runtime() {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
  globalThis.sessionStorage = globalThis.localStorage;
  const stubEl = () => ({ style: {}, classList: { add() { }, remove() { }, toggle() { }, contains: () => false }, dataset: {}, appendChild() { }, addEventListener() { }, setAttribute() { }, querySelector: () => null, querySelectorAll: () => [], getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), textContent: '', innerHTML: '', children: [] });
  globalThis.document = { createElement: stubEl, createElementNS: stubEl, querySelector: () => null, querySelectorAll: () => [], head: stubEl(), body: stubEl(), documentElement: stubEl(), addEventListener() { } };
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() { } });
  globalThis.ResizeObserver = class { observe() { } disconnect() { } };
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  if (!globalThis.Blob) globalThis.Blob = class { constructor(p) { this.size = String(p?.[0] || '').length; } text() { return Promise.resolve(''); } };
  if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:stub';
  if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => { };

  const bare = f => (MOD.get(f)?.imports || []).some(i => i.res && ['pkg', 'pkg-undeclared', 'importmap', 'unknown'].includes(i.res.kind) && !String(i.spec).startsWith('node:'));
  const pure = [...MOD.keys()].filter(f => !MOD.get(f).html && !bare(f) && !f.endsWith('.css'));
  for (const f of pure) {
    const t0 = Date.now();
    try {
      const mod = await import(pathToFileURL(path.join(OPT.root, f)).href + '?t=' + Date.now());
      RUNTIME.loaded.push({ file: f, ms: Date.now() - t0, exports: Object.keys(mod) });
      MOD.get(f).runtime = mod;
    } catch (e) {
      RUNTIME.failed.push({ file: f, error: String(e && e.message || e), stack: String(e && e.stack || '').split('\n').slice(0, 4).join('\n') });
      add('error', 'runtime', 'Модуль не загружается', String(e && e.message || e), f);
    }
  }
  for (const f of [...MOD.keys()].filter(f => bare(f))) RUNTIME.browserOnly.push(f);

  const modelMod = [...MOD.values()].find(m => m.runtime?.computeRoofModel);
  if (modelMod) {
    const R = modelMod.runtime;
    const paramsMod = [...MOD.values()].find(m => m.runtime?.ROOF_DEFAULTS);
    const base = paramsMod?.runtime?.ROOF_DEFAULTS || {};
    const structMod = [...MOD.values()].find(m => m.runtime?.computeRoofStructure)?.runtime;
    const piecesMod = [...MOD.values()].find(m => m.runtime?.computeRoofPieces)?.runtime;
    const nestMod = [...MOD.values()].find(m => m.runtime?.nestRoofPieces)?.runtime;
    const longMod = [...MOD.values()].find(m => m.runtime?.planLongMembers)?.runtime;
    const MATRIX = [
      ['базовая', {}],
      ['двускатная', { type: 'gable' }],
      ['вальма 14×18', { type: 'hip', span: 14, length: 18 }],
      ['крутая 45°', { pitch: 45 }],
      ['пологая 10°', { pitch: 10 }],
      ['мансарда ломаный', { mansard: 1, mansardScheme: 'broken' }],
      ['мансарда висячие', { mansard: 1, mansardScheme: 'tie', pitch: 45 }],
      ['мансарда прогон', { mansard: 1, mansardScheme: 'ridge' }],
      ['мансарда ферма', { mansard: 1, mansardScheme: 'truss', span: 10 }],
      ['короткая заготовка', { stock: 4000, span: 12 }],
      ['без балок', { joists: 0 }],
      ['снег VIII 3 сорт', { snowZone: 'VIII', grade: '3' }]
    ];
    for (const [name, patch] of MATRIX) {
      const p = { ...base, ...patch };
      const rec = { name, steps: [], ok: true, nan: [], error: '' };
      let m = null, S = null, pcs = null, plan = null, ns = null;
      const step = (label, fn) => {
        const t0 = Date.now();
        try { const v = fn(); rec.steps.push({ label, ok: true, ms: Date.now() - t0 }); return v; }
        catch (e) { rec.ok = false; rec.error = `${label}: ${String(e && e.message || e)}`; rec.steps.push({ label, ok: false, ms: Date.now() - t0, error: String(e && e.message || e), stack: String(e && e.stack || '').split('\n').slice(1, 3).join(' | ') }); return null; }
      };
      m = step('model', () => R.computeRoofModel(p));
      if (m) {
        const bad = Object.entries(m).filter(([, v]) => typeof v === 'number' && !Number.isFinite(v)).map(([k]) => k);
        if (bad.length) { rec.nan = bad; rec.ok = false; }
        if (structMod) S = step('structure', () => structMod.computeRoofStructure(p, m));
        if (piecesMod) pcs = step('pieces', () => piecesMod.computeRoofPieces(p, m));
        if (longMod && pcs) plan = step('plan', () => longMod.planLongMembers(m, p, pcs));
        if (nestMod && pcs) ns = step('nesting', () => nestMod.nestRoofPieces(pcs, p));
        if (S) { const sb = Object.entries(S).filter(([, v]) => typeof v === 'number' && !Number.isFinite(v)).map(([k]) => k); if (sb.length) { rec.nan.push(...sb.map(k => 'S.' + k)); rec.ok = false; } }
        rec.stats = {
          faces: m.faces?.length, rafters: m.rafters?.length, wood: Number(m.wood?.toFixed?.(2) ?? 0),
          pieces: pcs?.length, boards: ns?.boards, utilR: S ? Number(S.utilR?.toFixed?.(2) ?? 0) : null,
          utilD: S ? Number(S.utilD?.toFixed?.(2) ?? 0) : null
        };
      }
      RUNTIME.matrix.push(rec);
      if (!rec.ok) add('error', 'runtime', `Конфигурация «${name}» падает или даёт NaN`, rec.error || ('NaN в полях: ' + rec.nan.join(', ')), modelMod.file);
    }
    const own = [...MOD.values()].find(m => m.runtime?.runMatrix || m.runtime?.auditCore);
    if (own?.runtime?.runMatrix) {
      try {
        const rows = own.runtime.runMatrix(null);
        RUNTIME.ownAudit = rows.map(r => ({ name: r.name, bugs: r.bugs, violations: r.violations, passed: r.passed, skipped: r.skipped, fails: (r.all || []).filter(x => !x.pass && !x.expected && !x.skipped).map(x => `${x.id} ${x.name}: ${x.detail}`) }));
        const tot = RUNTIME.ownAudit.reduce((s, r) => s + r.bugs, 0);
        if (tot) add('warn', 'runtime', `Собственный аудит проекта сообщает о ${tot} багах`, 'подробности во вкладке «Рантайм» отчёта', own.file);
      } catch (e) { add('warn', 'runtime', 'Собственный аудит не запустился', String(e && e.message || e), own.file); }
    }
  }
  RUNTIME.ran = true;
}
if (OPT.runtime) await runtime();

const SEV = { error: 0, warn: 1, info: 2 };
ISSUES.sort((a, b) => SEV[a.sev] - SEV[b.sev] || a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file));
const counts = {
  files: MOD.size, code: codeFiles.length, html: htmlFiles.length, css: cssFiles.length,
  edges: EDGES.length, exports: [...MOD.values()].reduce((s, m) => s + m.exports.length, 0),
  errors: ISSUES.filter(i => i.sev === 'error').length,
  warns: ISSUES.filter(i => i.sev === 'warn').length,
  infos: ISSUES.filter(i => i.sev === 'info').length,
  cycles: CYCLES.length, dead: DEAD.length, unused: UNUSED.length, contracts: CONTRACTS.length
};
const DATA = {
  generated: new Date().toISOString(), root: OPT.root, counts,
  entries: [...ENTRIES], importmap: IMPORTMAP, deps: [...deps],
  modules: [...MOD.values()].map(m => ({
    file: m.file, lines: m.lines, bytes: m.bytes, html: !!m.html,
    imports: m.imports.map(i => ({ spec: i.spec, kind: i.kind, line: i.line, res: i.res, names: i.names })),
    exports: m.exports, shapes: m.shapes, userData: m.userData,
    dead: DEAD.includes(m.file), entry: ENTRIES.has(m.file),
    fanIn: (radj.get(m.file) || []).length, fanOut: (adj.get(m.file) || []).length,
    loaded: RUNTIME.loaded.some(l => l.file === m.file),
    browserOnly: RUNTIME.browserOnly.includes(m.file)
  })),
  edges: EDGES.map(e => ({ from: e.from, to: e.to, kind: e.im.kind })),
  issues: ISSUES, cycles: CYCLES, dead: DEAD, unused: UNUSED,
  contracts: CONTRACTS, userdata: USERDATA, mapdiff: MAPDIFF, runtime: RUNTIME
};

function consoleReport() {
  const L = [];
  L.push('');
  L.push(bold('  АУДИТ ПРОЕКТА ') + dim(OPT.root));
  L.push(dim('  ' + '─'.repeat(64)));
  L.push(`  файлов ${bold(counts.files)} · связей ${bold(counts.edges)} · экспортов ${bold(counts.exports)} · точек входа ${bold(ENTRIES.size)}`);
  L.push('');
  const line = (ok, label, val) => L.push(`  ${ok ? grn('✔') : (ok === null ? yel('⚠') : red('✕'))} ${label.padEnd(34)} ${val}`);
  const resolveBad = ISSUES.filter(i => i.kind === 'resolve' && i.sev === 'error').length;
  const exportBad = ISSUES.filter(i => i.kind === 'export').length;
  line(resolveBad === 0, 'Разрешение импортов', `${EDGES.length - resolveBad}/${EDGES.length}`);
  line(exportBad === 0, 'Именованные экспорты', `${namedOk}/${namedChecked}`);
  line(CYCLES.length === 0 ? true : null, 'Циклы', String(CYCLES.length));
  line(DEAD.length === 0 ? true : null, 'Мёртвые файлы', String(DEAD.length));
  line(CONTRACTS.length === 0, 'Риски контрактов данных', String(CONTRACTS.length));
  line(UNUSED.length === 0 ? true : null, 'Неиспользуемые экспорты', String(UNUSED.length));
  if (RUNTIME.ran) {
    line(RUNTIME.failed.length === 0, 'Загрузка модулей в Node', `${RUNTIME.loaded.length}/${RUNTIME.loaded.length + RUNTIME.failed.length}` + (RUNTIME.browserOnly.length ? ` (браузерных ${RUNTIME.browserOnly.length})` : ''));
    const mBad = RUNTIME.matrix.filter(r => !r.ok).length;
    line(mBad === 0, 'Прогон конфигураций', `${RUNTIME.matrix.length - mBad}/${RUNTIME.matrix.length}`);
    if (RUNTIME.ownAudit) {
      const b = RUNTIME.ownAudit.reduce((s, r) => s + r.bugs, 0);
      line(b === 0, 'Собственный аудит проекта', b === 0 ? `${RUNTIME.ownAudit.length} конфигураций чисто` : `${b} багов`);
    }
  }
  if (MAPDIFF) {
    const bad = MAPDIFF.rows.filter(r => r.issues.length).length + MAPDIFF.notInMap.length;
    line(bad === 0 ? true : null, 'Сверка с roof-map.html', bad === 0 ? 'совпадает' : `${bad} расхождений`);
  }
  L.push('');
  const groups = {};
  ISSUES.forEach(i => { (groups[i.sev] = groups[i.sev] || []).push(i); });
  for (const sev of ['error', 'warn', 'info']) {
    const list = groups[sev]; if (!list?.length) continue;
    const head = sev === 'error' ? red(`ОШИБКИ · ${list.length}`) : sev === 'warn' ? yel(`ПРЕДУПРЕЖДЕНИЯ · ${list.length}`) : dim(`ЗАМЕТКИ · ${list.length}`);
    L.push('  ' + head);
    list.slice(0, sev === 'info' ? 14 : 40).forEach(i => {
      L.push(`   ${dim(i.kind.padEnd(9))} ${i.title}`);
      if (i.detail) L.push(`             ${dim(i.detail)}`);
      if (i.file) L.push(`             ${blu(i.file + (i.line ? ':' + i.line : ''))}`);
    });
    if (list.length > (sev === 'info' ? 14 : 40)) L.push(dim(`   …ещё ${list.length - (sev === 'info' ? 14 : 40)}`));
    L.push('');
  }
  if (RUNTIME.matrix.length) {
    L.push('  ' + bold('ПРОГОН КОНФИГУРАЦИЙ'));
    RUNTIME.matrix.forEach(r => {
      const s = r.ok ? grn('✔') : red('✕');
      const st = r.stats ? dim(`скатов ${r.stats.faces} · стропил ${r.stats.rafters} · ${r.stats.wood} м³ · марок ${r.stats.pieces ?? '—'}`) : '';
      L.push(`   ${s} ${r.name.padEnd(24)} ${st}`);
      if (!r.ok) L.push(`     ${red(r.error || 'NaN: ' + r.nan.join(', '))}`);
    });
    L.push('');
  }
  L.push(dim('  отчёты: ' + OPT.out + '.json / .md' + (OPT.html ? ' / .html' : '')));
  L.push('');
  return L.join('\n');
}
if (!OPT.quiet) process.stdout.write(consoleReport());

if (OPT.json) fs.writeFileSync(path.join(OPT.root, OPT.out + '.json'), JSON.stringify(DATA, null, 2));
if (OPT.md) {
  const BT = String.fromCharCode(96);
  const L = ['# Аудит проекта', '', `${BT}Корень:${BT} ${BT}${OPT.root}${BT}`, `Сгенерировано: ${DATA.generated}`, '',
    `Файлов **${counts.files}** · связей **${counts.edges}** · экспортов **${counts.exports}** · ошибок **${counts.errors}** · предупреждений **${counts.warns}**`, '',
    '## Проверки', '',
    '| проверка | результат |', '|---|---|',
    `| Разрешение импортов | ${EDGES.length - ISSUES.filter(i => i.kind === 'resolve' && i.sev === 'error').length}/${EDGES.length} |`,
    `| Именованные экспорты | ${namedOk}/${namedChecked} |`,
    `| Циклы | ${CYCLES.length} |`, `| Мёртвые файлы | ${DEAD.length} |`,
    `| Риски контрактов | ${CONTRACTS.length} |`, `| Неиспользуемые экспорты | ${UNUSED.length} |`];
  if (RUNTIME.ran) L.push(`| Загрузка в Node | ${RUNTIME.loaded.length}/${RUNTIME.loaded.length + RUNTIME.failed.length} |`,
    `| Прогон конфигураций | ${RUNTIME.matrix.filter(r => r.ok).length}/${RUNTIME.matrix.length} |`);
  L.push('', '## Проблемы', '');
  ['error', 'warn', 'info'].forEach(sev => {
    const list = ISSUES.filter(i => i.sev === sev); if (!list.length) return;
    L.push(`### ${sev === 'error' ? 'Ошибки' : sev === 'warn' ? 'Предупреждения' : 'Заметки'} (${list.length})`, '');
    list.forEach(i => L.push(`- **${i.title}** — ${i.detail}${i.file ? `  \n  ${BT}${i.file}${i.line ? ':' + i.line : ''}${BT}` : ''}`));
    L.push('');
  });
  L.push('## Граф зависимостей', '');
  [...MOD.values()].sort((a, b) => a.file.localeCompare(b.file)).forEach(m => {
    L.push(`### ${m.file}${m.dead ? ' — МЁРТВЫЙ' : ''}${ENTRIES.has(m.file) ? ' — точка входа' : ''}`);
    L.push(`${m.lines} строк · импортов ${m.imports.length} · экспортов ${m.exports.length} · входящих ${(radj.get(m.file) || []).length}`, '');
    if (m.exports.length) L.push('Экспорты: ' + m.exports.map(e => `${BT}${e.name}${BT}`).join(', ') + '\n');
    if (m.imports.length) L.push('Импорты: ' + m.imports.map(i => `${BT}${i.spec}${BT} → ${i.res?.kind === 'local' ? i.res.target : i.res?.kind}`).join(', ') + '\n');
  });
  if (CONTRACTS.length) {
    L.push('## Контракты данных', '');
    CONTRACTS.forEach(c => {
      L.push(`### ${c.producer} → ${c.consumer}`);
      L.push(`Дискриминатор ${BT}${c.disc}${BT}, варианты: ${c.variants.map(v => BT + v.val + BT).join(', ')}`, '');
      c.risky.forEach(r => L.push(`- строка ${r.line}: читает ${BT}.${r.prop}${BT} — есть у ${r.onlyIn}, нет у ${r.missingIn}`));
      L.push('');
    });
  }
  if (RUNTIME.matrix.length) {
    L.push('## Прогон конфигураций', '', '| конфигурация | итог | скаты | стропила | м³ | марки |', '|---|---|---|---|---|---|');
    RUNTIME.matrix.forEach(r => L.push(`| ${r.name} | ${r.ok ? 'OK' : 'ПАДЕНИЕ'} | ${r.stats?.faces ?? '—'} | ${r.stats?.rafters ?? '—'} | ${r.stats?.wood ?? '—'} | ${r.stats?.pieces ?? '—'} |`));
    L.push('');
    RUNTIME.matrix.filter(r => !r.ok).forEach(r => L.push(`- **${r.name}**: ${r.error || 'NaN: ' + r.nan.join(', ')}`));
  }
  if (MAPDIFF) {
    L.push('', '## Расхождения с картой', '');
    MAPDIFF.rows.filter(r => r.issues.length).forEach(r => L.push(`- **${r.file}**: ${r.issues.join('; ')}`));
    MAPDIFF.notInMap.forEach(f => L.push(`- ${BT}${f}${BT} — файла нет в карте`));
  }
  fs.writeFileSync(path.join(OPT.root, OPT.out + '.md'), L.join('\n'));
}

if (OPT.html) {
  const BT = String.fromCharCode(96);
  const TPL = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Аудит проекта</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a110e;--sf:#121c17;--sf2:#19241e;--ov:#202e26;--ln:#293830;--ln2:#3f5347;--tx:#eef4ec;--dim:#a1b4a7;--mute:#6f8377;
--timber:#e0913f;--hi:#ffc477;--deep:#9d5a17;--steel:#7fb2d8;--blue:#4cc9f0;--acid:#a3e635;--violet:#b07cf0;--mag:#f472b6;
--red:#f4645f;--green:#4ade80;--warn:#fbbf24;--f:'Manrope',system-ui,sans-serif;--d:'Unbounded',sans-serif;--m:'JetBrains Mono',monospace;--bar:60px;--filt:56px}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--tx);font:13.5px/1.55 var(--f);overflow:hidden;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;z-index:-2;background:radial-gradient(820px 480px at 3% -8%,rgba(224,145,63,.17),transparent 62%),radial-gradient(700px 460px at 100% 0,rgba(76,201,240,.12),transparent 60%),radial-gradient(900px 640px at 44% 116%,rgba(163,230,53,.07),transparent 62%),linear-gradient(180deg,#0d1712,#0a110e 46%,#080f0c)}
body::after{content:'';position:fixed;inset:0;z-index:-1;opacity:.4;background-image:linear-gradient(rgba(63,83,71,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(63,83,71,.16) 1px,transparent 1px);background-size:46px 46px;mask-image:radial-gradient(circle at 44% 24%,#000 16%,transparent 74%)}
.sc{scrollbar-width:thin;scrollbar-color:var(--deep) var(--sf)}
.sc::-webkit-scrollbar{width:11px;height:11px}.sc::-webkit-scrollbar-track{background:var(--sf);border-radius:9px}
.sc::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--timber),var(--deep));border-radius:9px;border:2px solid var(--sf)}
.sc::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,var(--hi),var(--timber))}
#bar{position:fixed;inset:0 0 auto 0;height:var(--bar);z-index:60;display:flex;align-items:center;gap:12px;padding:0 16px;background:linear-gradient(180deg,rgba(10,17,14,.97),rgba(10,17,14,.86));backdrop-filter:blur(14px);border-bottom:1px solid var(--ln)}
.brand{display:flex;align-items:center;gap:10px}.brand svg{width:28px;height:28px;color:var(--timber);filter:drop-shadow(0 0 11px rgba(224,145,63,.5))}
.bn{font-family:var(--d);font-weight:700;font-size:12.5px;letter-spacing:.05em}.bs{font-size:10px;color:var(--mute)}
#bar .grow{flex:1}
.hs{display:flex;gap:6px}.hs div{background:rgba(10,17,14,.7);border:1px solid var(--ln);border-radius:8px;padding:4px 9px;text-align:center}
.hs b{display:block;font:800 13px var(--m);color:var(--hi);line-height:1.1}.hs.bad b{color:var(--red)}.hs.warn b{color:var(--warn)}.hs.good b{color:var(--green)}
.hs span{font:700 7.5px var(--f);letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.btn{border:1px solid var(--ln2);border-radius:9px;background:#1e2b24;color:var(--tx);font:700 11.5px var(--f);padding:8px 12px;cursor:pointer;transition:.15s;white-space:nowrap}
.btn:hover{border-color:var(--timber);background:#2c3b33;transform:translateY(-1px)}
.btn:focus-visible,input:focus-visible,.chip:focus-visible,.seg button:focus-visible,.row:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(224,145,63,.32)}
#filt{position:fixed;top:var(--bar);left:0;right:0;z-index:55;display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:9px 16px;min-height:var(--filt);background:linear-gradient(180deg,rgba(18,28,23,.96),rgba(13,21,17,.92));backdrop-filter:blur(12px);border-bottom:1px solid var(--ln)}
.search{position:relative;flex:0 1 240px;min-width:150px}
.search input{width:100%;padding:8px 10px 8px 30px;font:600 12px var(--f);color:var(--tx);background:#1b2721;border:1px solid var(--ln2);border-radius:9px}
.search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--mute)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:8px;border:1px solid var(--ln);background:#1a2620;font:700 10.5px var(--f);color:var(--mute);cursor:pointer;transition:.14s}
.chip:hover{color:var(--tx);border-color:var(--ln2)}.chip.on{color:var(--tx);border-color:var(--ln2);background:var(--ov)}
.chip i{width:8px;height:8px;border-radius:2.5px;background:#3b4a41;display:block}
.sep{width:1px;height:22px;background:var(--ln)}
.seg{display:flex;border:1px solid var(--ln2);border-radius:9px;overflow:hidden}
.seg button{border:0;background:#1a2620;color:var(--mute);font:700 10.5px var(--f);padding:7px 11px;cursor:pointer}
.seg button.on{background:linear-gradient(180deg,var(--hi),var(--timber));color:#241708}
.mini{display:flex;align-items:center;gap:7px;font:700 10px var(--f);color:var(--mute)}
.mini input[type=range]{width:80px;height:16px;-webkit-appearance:none;background:none;cursor:pointer}
.mini input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:3px;background:linear-gradient(90deg,var(--deep),var(--ln))}
.mini input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-4.5px;border-radius:50%;background:radial-gradient(circle at 34% 28%,var(--hi),var(--timber) 56%,var(--deep));border:2px solid #1a1206}
.mini b{font:800 10px var(--m);color:var(--hi);min-width:26px;text-align:right}
#main{position:fixed;top:calc(var(--bar) + var(--filt));left:0;right:0;bottom:0;overflow-y:auto;padding:16px 18px 40px}
.hero h1{font:800 23px/1.2 var(--f);margin:0 0 6px}
.hero h1 em{font-style:normal;background:linear-gradient(96deg,var(--hi),var(--acid) 54%,var(--blue));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{margin:0 0 14px;color:var(--dim);font-size:12.5px;max-width:96ch}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin-bottom:14px}
.card{border:1px solid var(--ln);border-radius:12px;background:linear-gradient(165deg,var(--sf2),var(--sf));padding:11px 13px;position:relative;overflow:hidden}
.card::after{content:'';position:absolute;inset:0 auto 0 0;width:3px;background:var(--timber)}
.card.bad::after{background:var(--red)}.card.good::after{background:var(--green)}.card.warn::after{background:var(--warn)}
.card b{display:block;font:800 22px/1.05 var(--m);color:var(--hi)}.card.bad b{color:var(--red)}.card.good b{color:var(--green)}.card.warn b{color:var(--warn)}
.card span{display:block;font:800 8px var(--f);letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin-top:4px}
.card em{display:block;font-style:normal;font:600 10px var(--m);color:var(--dim);margin-top:3px}
.panel{border:1px solid var(--ln);border-radius:13px;background:linear-gradient(180deg,var(--sf2),var(--sf));overflow:hidden;margin-bottom:12px}
.ph{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--ln);background:linear-gradient(90deg,rgba(224,145,63,.09),transparent 72%);flex-wrap:wrap}
.ph b{font:800 12px var(--m);color:var(--hi)}.ph .grow{flex:1}.ph em{font-style:normal;font:600 10.5px var(--m);color:var(--mute)}
.pb{padding:12px 14px}
.tag{font:800 8.5px var(--f);letter-spacing:.09em;text-transform:uppercase;padding:3px 8px;border-radius:6px}
.t-err{background:rgba(244,100,95,.16);color:var(--red)}.t-warn{background:rgba(251,191,36,.14);color:var(--warn)}
.t-info{background:rgba(127,178,216,.14);color:var(--steel)}.t-ok{background:rgba(74,222,128,.14);color:var(--green)}
.t-dead{background:rgba(176,124,240,.15);color:var(--violet)}
.row{display:grid;grid-template-columns:22px 88px 1fr auto;gap:10px;align-items:start;padding:9px 12px;border-bottom:1px solid rgba(41,56,48,.5);cursor:pointer;transition:.13s;width:100%;text-align:left;background:none;border-left:0;border-right:0;border-top:0;color:inherit;font:inherit}
.row:last-child{border-bottom:none}.row:hover{background:rgba(255,255,255,.03)}
.row .st{font:800 13px var(--f);text-align:center}
.row.error .st{color:var(--red)}.row.warn .st{color:var(--warn)}.row.info .st{color:var(--steel)}
.row .kd{font:700 9.5px var(--m);color:var(--mute)}
.row .ti{font:600 12px var(--f);color:var(--dim)}.row.error .ti{color:var(--tx);font-weight:700}
.row .fl{font:600 10px var(--m);color:var(--steel);text-align:right;white-space:nowrap}
.det{display:none;padding:0 12px 12px;font:500 11.5px/1.6 var(--m);color:var(--dim)}
.row.open + .det{display:block}
.det .box{background:rgba(0,0,0,.26);border:1px solid var(--ln);border-radius:9px;padding:9px 11px;word-break:break-word}
table.t{width:100%;border-collapse:collapse;font:600 11px var(--m)}
table.t th{text-align:left;font:800 8.5px var(--f);letter-spacing:.1em;text-transform:uppercase;color:var(--mute);padding:7px 8px;border-bottom:1px solid var(--ln)}
table.t td{padding:6px 8px;border-bottom:1px solid rgba(41,56,48,.5);color:var(--dim);vertical-align:top}
table.t tr:last-child td{border-bottom:none}
table.t td.n{color:var(--hi);white-space:nowrap}
.links{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.link{font:700 10px var(--m);padding:4px 8px;border-radius:6px;border:1px solid var(--ln2);background:#1a2620;color:var(--steel);cursor:pointer}
.link:hover{border-color:var(--timber);color:var(--hi)}
.link.none{color:var(--mute);border-style:dashed;cursor:default}
#graph{display:block;width:100%;height:min(70vh,720px);cursor:grab;touch-action:none}
#graph.drag{cursor:grabbing}
.gn rect{transition:.15s}.gn text{font:700 9.5px var(--m);fill:var(--dim);pointer-events:none}
.gn.sel rect{stroke:var(--timber);stroke-width:2}.gn.sel text{fill:var(--hi)}
.gn.dead rect{stroke-dasharray:3 2}
.ge{fill:none;stroke:var(--ln2);stroke-width:1.1;opacity:.45}
.ge.hot{stroke:var(--timber);opacity:1;stroke-width:2}
.ge.bad{stroke:var(--red);opacity:.9}
.empty{text-align:center;padding:50px 20px;color:var(--mute)}
.empty b{display:block;font:800 15px var(--f);color:var(--dim);margin-bottom:6px}
.note{font:500 11.5px/1.6 var(--f);color:var(--dim);background:rgba(76,201,240,.06);border:1px solid rgba(76,201,240,.2);border-radius:9px;padding:9px 11px;margin-bottom:12px}
.note b{color:var(--blue)}
@media(max-width:860px){.bs,.hs{display:none}#main{padding:12px}.row{grid-template-columns:20px 70px 1fr}.row .fl{display:none}}
</style></head><body>
<header id="bar">
 <div class="brand"><svg viewBox="0 0 32 32"><path d="M2 16 16 5l14 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M6 16v12h20V16M9 28V19M16 12v16M23 28V19M6 22h20" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
 <div><div class="bn">АУДИТ ПРОЕКТА</div><div class="bs" id="rootlbl"></div></div></div>
 <div class="grow"></div><div class="hs" id="hs"></div>
 <button class="btn" id="bJson" type="button">⤓ JSON</button>
 <button class="btn" id="bMd" type="button">⤓ MD</button>
</header>
<div id="filt">
 <label class="search"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M11 11l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
 <input id="q" type="search" placeholder="Поиск по файлам, проблемам, экспортам…"></label>
 <div class="sep"></div><div id="sevs" style="display:flex;gap:5px"></div>
 <div class="sep"></div>
 <div class="seg" id="tabs">
  <button data-t="over" class="on" type="button">Обзор</button>
  <button data-t="files" type="button">Файлы</button>
  <button data-t="graph" type="button">Граф</button>
  <button data-t="contracts" type="button">Контракты</button>
  <button data-t="runtime" type="button">Рантайм</button>
  <button data-t="map" type="button">Карта</button>
 </div>
 <div class="sep"></div>
 <button class="chip" id="tDead" type="button"><i></i>Мёртвые</button>
 <button class="chip" id="tEntry" type="button"><i></i>Точки входа</button>
 <div class="mini"><span>Глубина</span><input type="range" id="cD" min="1" max="3" step="1" value="1"><b id="vD">1</b></div>
 <div class="mini"><span>Масштаб</span><input type="range" id="cZ" min="60" max="180" step="5" value="100"><b id="vZ">100%</b></div>
 <button class="btn" id="bReset" type="button">↺ Сброс</button>
</div>
<div id="main" class="sc"></div>
<script id="payload" type="application/json">__DATA__</script>
<script>
var D=JSON.parse(document.getElementById('payload').textContent);
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var F={q:'',sev:{error:true,warn:true,info:true},tab:'over',dead:false,entry:false,depth:1,zoom:1};
var selFile=null,pan={x:0,y:0},drag=null,open={};
var byFile={};D.modules.forEach(function(m){byFile[m.file]=m});
document.getElementById('rootlbl').textContent=D.root+' · '+new Date(D.generated).toLocaleString('ru');
var SEVC={error:'var(--red)',warn:'var(--warn)',info:'var(--steel)'};
var SEVN={error:'Ошибки',warn:'Предупреждения',info:'Заметки'};
Object.keys(SEVN).forEach(function(k){
 var b=document.createElement('button');b.type='button';b.className='chip on';b.dataset.s=k;
 b.innerHTML='<i style="background:'+SEVC[k]+'"></i>'+SEVN[k];
 b.onclick=function(){F.sev[k]=!F.sev[k];sync();render()};
 document.getElementById('sevs').appendChild(b);
});
function sync(){
 document.querySelectorAll('#sevs .chip').forEach(function(b){var on=F.sev[b.dataset.s];b.classList.toggle('on',on);b.querySelector('i').style.background=on?SEVC[b.dataset.s]:'#3b4a41'});
 document.querySelectorAll('#tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.t===F.tab)});
 [['tDead','dead'],['tEntry','entry']].forEach(function(p){var e=document.getElementById(p[0]);e.classList.toggle('on',F[p[1]]);e.querySelector('i').style.background=F[p[1]]?'var(--acid)':'#3b4a41'});
}
function head(){
 var c=D.counts;
 document.getElementById('hs').innerHTML=
  '<div class="'+(c.errors?'bad':'good')+'"><b>'+c.errors+'</b><span>ошибок</span></div>'+
  '<div class="'+(c.warns?'warn':'good')+'"><b>'+c.warns+'</b><span>предупр.</span></div>'+
  '<div><b>'+c.files+'</b><span>файлов</span></div>'+
  '<div><b>'+c.edges+'</b><span>связей</span></div>';
}
function matchIssue(i){
 if(!F.sev[i.sev])return false;
 if(F.q){var h=(i.title+' '+i.detail+' '+i.file+' '+i.kind).toLowerCase();if(h.indexOf(F.q)<0)return false}
 return true;
}
function matchFile(m){
 if(F.dead&&!m.dead)return false;
 if(F.entry&&!m.entry)return false;
 if(F.q){var h=(m.file+' '+m.exports.map(function(e){return e.name}).join(' ')+' '+m.imports.map(function(i){return i.spec}).join(' ')).toLowerCase();if(h.indexOf(F.q)<0)return false}
 return true;
}
function issueRow(i,ix){
 var id='i'+ix;
 var h='<button class="row '+i.sev+(open[id]?' open':'')+'" data-k="'+id+'" type="button">'+
  '<span class="st">'+(i.sev==='error'?'✕':i.sev==='warn'?'⚠':'i')+'</span>'+
  '<span class="kd">'+esc(i.kind)+'</span><span class="ti">'+esc(i.title)+'</span>'+
  '<span class="fl">'+esc(i.file||'')+(i.line?':'+i.line:'')+'</span></button>'+
  '<div class="det"><div class="box">'+esc(i.detail||'—')+'</div>'+
  (i.file&&byFile[i.file]?'<div class="links"><button class="link" data-go="'+esc(i.file)+'">открыть '+esc(i.file)+'</button></div>':'')+'</div>';
 return h;
}
function renderOverview(){
 var c=D.counts,rt=D.runtime;
 var h='<div class="hero"><h1>Что в проекте <em>реально работает</em></h1>'+
  '<p>Отчёт построен чтением файлов: JS разобран токенизатором, импорты разрешены по дискам и importmap, каждый именованный экспорт проверен по цепочке реэкспортов. Чистые модули исполнены в Node на матрице параметров.</p></div>';
 h+='<div class="grid">'+
  card(c.files,'файлов',c.code+' js · '+c.html+' html · '+c.css+' css')+
  card(c.edges,'связей',c.exports+' экспортов')+
  card(c.errors,'ошибок','',c.errors?'bad':'good')+
  card(c.warns,'предупреждений','',c.warns?'warn':'good')+
  card(c.cycles,'циклов','',c.cycles?'warn':'good')+
  card(c.dead,'мёртвых файлов','',c.dead?'warn':'good')+
  card(c.contracts,'рисков контрактов','',c.contracts?'bad':'good')+
  card(c.unused,'неиспользуемых экспортов','',c.unused?'warn':'good')+'</div>';
 if(rt&&rt.ran){
  var okc=rt.matrix.filter(function(r){return r.ok}).length;
  h+='<div class="grid">'+card(rt.loaded.length+'/'+(rt.loaded.length+rt.failed.length),'загрузилось в Node',rt.browserOnly.length+' браузерных')+
   card(okc+'/'+rt.matrix.length,'конфигураций прошло','',okc===rt.matrix.length?'good':'bad');
  if(rt.ownAudit){var b=rt.ownAudit.reduce(function(s,r){return s+r.bugs},0);h+=card(b,'багов по аудиту проекта',rt.ownAudit.length+' конфигураций',b?'bad':'good')}
  h+='</div>';
 }
 var list=D.issues.filter(matchIssue);
 h+='<div class="panel"><div class="ph"><b>Проблемы</b><span class="tag t-err">'+D.issues.filter(function(i){return i.sev==='error'}).length+' ошибок</span>'+
  '<span class="tag t-warn">'+D.issues.filter(function(i){return i.sev==='warn'}).length+' предупреждений</span><span class="grow"></span><em>'+list.length+' показано</em></div><div>';
 if(!list.length)h+='<div class="empty"><b>Под фильтр ничего не попало</b>Смягчите фильтры или очистите поиск.</div>';
 list.forEach(function(i,ix){h+=issueRow(i,ix)});
 h+='</div></div>';
 return h;
}
function card(v,l,e,cls){return '<div class="card '+(cls||'')+'"><b>'+esc(v)+'</b><span>'+esc(l)+'</span>'+(e?'<em>'+esc(e)+'</em>':'')+'</div>'}
function renderFiles(){
 var list=D.modules.filter(matchFile).sort(function(a,b){return a.file.localeCompare(b.file)});
 if(selFile&&byFile[selFile])return fileCard(byFile[selFile]);
 var h='<div class="panel"><div class="ph"><b>Файлы</b><span class="grow"></span><em>'+list.length+' из '+D.modules.length+'</em></div><div>';
 if(!list.length)h+='<div class="empty"><b>Ничего не найдено</b></div>';
 list.forEach(function(m){
  var iss=D.issues.filter(function(i){return i.file===m.file});
  var err=iss.filter(function(i){return i.sev==='error'}).length;
  h+='<button class="row '+(err?'error':iss.length?'warn':'info')+'" data-go="'+esc(m.file)+'" type="button">'+
   '<span class="st">'+(err?'✕':m.dead?'○':iss.length?'⚠':'✔')+'</span>'+
   '<span class="kd">'+m.lines+' стр</span><span class="ti">'+esc(m.file)+'</span>'+
   '<span class="fl">↓'+m.fanIn+' ↑'+m.fanOut+' · '+m.exports.length+' эксп</span></button>';
 });
 return h+'</div></div>';
}
function fileCard(m){
 var iss=D.issues.filter(function(i){return i.file===m.file});
 var h='<div class="panel"><div class="ph"><b>'+esc(m.file)+'</b>'+
  (m.entry?'<span class="tag t-ok">точка входа</span>':'')+(m.dead?'<span class="tag t-dead">мёртвый</span>':'')+
  (m.loaded?'<span class="tag t-ok">загрузился</span>':'')+(m.browserOnly?'<span class="tag t-info">браузерный</span>':'')+
  '<span class="grow"></span><em>'+m.lines+' строк · '+m.bytes+' байт</em>'+
  '<button class="btn" data-back="1" type="button">← к списку</button></div><div class="pb">';
 h+='<div class="note">Входящих связей <b>'+m.fanIn+'</b>, исходящих <b>'+m.fanOut+'</b>. Экспортов '+m.exports.length+'.</div>';
 h+='<h4 style="margin:0 0 6px;font:800 8.5px var(--f);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)">Экспорты</h4><table class="t"><tbody>';
 if(!m.exports.length)h+='<tr><td colspan="3" style="color:var(--mute)">нет</td></tr>';
 m.exports.forEach(function(e){
  h+='<tr><td class="n">'+esc(e.name)+'</td><td>'+esc(e.kind)+'</td><td>'+(e.from?'из '+esc(e.from):'строка '+e.line)+'</td></tr>';
 });
 h+='</tbody></table>';
 h+='<h4 style="margin:14px 0 6px;font:800 8.5px var(--f);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)">Импорты</h4><table class="t"><tbody>';
 if(!m.imports.length)h+='<tr><td style="color:var(--mute)">нет</td></tr>';
 m.imports.forEach(function(i){
  var ok=i.res&&['local','pkg','node','importmap'].indexOf(i.res.kind)>=0;
  h+='<tr><td class="n">'+esc(i.spec)+'</td><td style="color:'+(ok?'var(--green)':'var(--red)')+'">'+esc(i.res?i.res.kind:'?')+'</td>'+
   '<td>'+(i.res&&i.res.target?esc(i.res.target):'')+(i.names&&i.names.length?' · '+i.names.map(function(n){return esc(n.imported)}).join(', '):'')+'</td></tr>';
 });
 h+='</tbody></table>';
 if(m.shapes&&m.shapes.length){
  h+='<h4 style="margin:14px 0 6px;font:800 8.5px var(--f);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)">Формы данных, которые отдаёт модуль</h4><table class="t"><tbody>';
  var seen={};m.shapes.forEach(function(s){var k=s.disc+':'+s.val;if(seen[k])return;seen[k]=1;
   h+='<tr><td class="n">'+esc(s.disc)+' = '+esc(s.val)+'</td><td>'+s.keys.map(function(k2){return esc(k2)}).join(', ')+'</td></tr>'});
  h+='</tbody></table>';
 }
 if(m.userData&&(m.userData.write.length||m.userData.read.length)){
  h+='<h4 style="margin:14px 0 6px;font:800 8.5px var(--f);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)">userData сцены</h4>'+
   '<div class="links">'+m.userData.write.map(function(k){return '<span class="link none">пишет '+esc(k)+'</span>'}).join('')+
   m.userData.read.map(function(k){return '<span class="link none">читает '+esc(k)+'</span>'}).join('')+'</div>';
 }
 if(iss.length){h+='<h4 style="margin:14px 0 6px;font:800 8.5px var(--f);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)">Проблемы файла</h4>';
  iss.forEach(function(i,ix){h+=issueRow(i,'f'+ix)})}
 return h+'</div></div>';
}
function renderGraph(){
 var list=D.modules.filter(matchFile);
 var ids={};list.forEach(function(m){ids[m.file]=1});
 var near={};if(selFile)near[selFile]=1;
 var front=selFile?[selFile]:[];
 for(var d=0;d<F.depth;d++){var nx=[];front.forEach(function(f){D.edges.forEach(function(e){
  if(e.from===f&&!near[e.to]){near[e.to]=1;nx.push(e.to)}if(e.to===f&&!near[e.from]){near[e.from]=1;nx.push(e.from)}})});front=nx}
 var cols={},order=[];
 list.forEach(function(m){var dir=m.file.indexOf('/')>=0?m.file.slice(0,m.file.lastIndexOf('/')):'.';if(!cols[dir]){cols[dir]=[];order.push(dir)}cols[dir].push(m)});
 order.sort();
 var CW=210,RH=38,PX=36,PY=52;
 var maxR=Math.max.apply(null,[1].concat(order.map(function(k){return cols[k].length})));
 var W=PX*2+order.length*CW,H=PY+maxR*RH+30,pos={};
 order.forEach(function(k,ci){cols[k].forEach(function(m,ri){pos[m.file]={x:PX+ci*CW,y:PY+ri*RH}})});
 var z=F.zoom/100,vw=W/z,vh=H/z;
 var es=D.edges.filter(function(e){return ids[e.from]&&ids[e.to]}).map(function(e){
  var p=pos[e.from],q=pos[e.to];if(!p||!q)return '';
  var x1=p.x+150,y1=p.y+12,x2=q.x,y2=q.y+12,mx=(x1+x2)/2;
  var hot=selFile&&(e.from===selFile||e.to===selFile);
  return '<path class="ge'+(hot?' hot':'')+'" d="M'+x1+' '+y1+' C'+mx+' '+y1+' '+mx+' '+y2+' '+x2+' '+y2+'"/>';
 }).join('');
 var ns=list.map(function(m){var p=pos[m.file];var dim=F.depth<3&&selFile&&!near[m.file];
  var err=D.issues.some(function(i){return i.file===m.file&&i.sev==='error'});
  return '<g class="gn'+(m.file===selFile?' sel':'')+(m.dead?' dead':'')+'" data-id="'+esc(m.file)+'" transform="translate('+p.x+','+p.y+')" style="cursor:pointer;opacity:'+(dim?.28:1)+'">'+
   '<rect width="150" height="24" rx="7" fill="'+(m.file===selFile?'rgba(224,145,63,.18)':'#18231d')+'" stroke="'+(err?'#f4645f':m.dead?'#6f8377':'#3f5347')+'"/>'+
   '<rect width="3" height="24" rx="1.5" fill="'+(m.entry?'#a3e635':err?'#f4645f':'#e0913f')+'" opacity=".85"/>'+
   '<text x="10" y="16">'+esc(m.file.split('/').pop())+'</text></g>';
 }).join('');
 var ls=order.map(function(k,ci){return '<text x="'+(PX+ci*CW)+'" y="34" style="font:800 8.5px var(--f);letter-spacing:.14em;text-transform:uppercase;fill:#6f8377">'+esc(k)+'</text>'}).join('');
 return '<div class="panel"><div class="ph"><b>Граф зависимостей</b><span class="tag t-info">'+list.length+' узлов</span>'+
  '<span class="grow"></span><em>тяните мышью · глубина '+F.depth+' · '+(selFile?esc(selFile):'выберите узел')+'</em></div>'+
  '<svg id="graph" viewBox="'+((W-vw)/2+pan.x)+' '+((H-vh)/2+pan.y)+' '+vw+' '+vh+'" preserveAspectRatio="xMidYMid meet">'+ls+es+ns+'</svg></div>';
}
function renderContracts(){
 var h='<div class="note"><b>Контракт данных</b> — место, где один модуль отдаёт структуру, а другой её читает. Если вариантов формы несколько, а поле читается без проверки варианта — это будущий TypeError.</div>';
 if(!D.contracts.length)h+='<div class="panel"><div class="pb"><div class="empty"><b>Рисков не найдено</b>Все чтения полей покрыты всеми вариантами форм либо защищены проверкой.</div></div></div>';
 D.contracts.forEach(function(c){
  h+='<div class="panel"><div class="ph"><b>'+esc(c.producer)+' → '+esc(c.consumer)+'</b><span class="tag t-err">'+c.risky.length+' рисков</span>'+
   '<span class="grow"></span><em>дискриминатор '+esc(c.disc)+'</em></div><div class="pb">';
  h+='<table class="t"><tbody>';
  c.variants.forEach(function(v){h+='<tr><td class="n">'+esc(c.disc)+' = '+esc(v.val)+'</td><td>'+v.keys.map(esc).join(', ')+'</td></tr>'});
  h+='</tbody></table><div style="margin-top:10px">';
  c.risky.forEach(function(r){h+='<div class="note" style="background:rgba(244,100,95,.07);border-color:rgba(244,100,95,.3)">'+
   'строка <b>'+r.line+'</b> читает <b>.'+esc(r.prop)+'</b> — есть только у <b>'+esc(r.onlyIn)+'</b>, отсутствует у <b>'+esc(r.missingIn)+'</b></div>'});
  h+='</div><div class="links"><button class="link" data-go="'+esc(c.consumer)+'">открыть потребителя</button><button class="link" data-go="'+esc(c.producer)+'">открыть производителя</button></div></div></div>';
 });
 if(D.userdata&&D.userdata.length){
  h+='<div class="panel"><div class="ph"><b>userData сцены</b><span class="grow"></span><em>'+D.userdata.length+' ключей</em></div><div class="pb"><table class="t">'+
   '<thead><tr><th>ключ</th><th>кто пишет</th><th>кто читает</th></tr></thead><tbody>';
  D.userdata.forEach(function(u){
   var bad=u.readers.length&&!u.writers.length;
   h+='<tr'+(bad?' style="background:rgba(244,100,95,.07)"':'')+'><td class="n">'+esc(u.key)+'</td><td>'+(u.writers.map(esc).join(', ')||'—')+'</td><td>'+(u.readers.map(esc).join(', ')||'—')+'</td></tr>';
  });
  h+='</tbody></table></div></div>';
 }
 return h;
}
function renderRuntime(){
 var rt=D.runtime;
 if(!rt||!rt.ran)return '<div class="panel"><div class="pb"><div class="empty"><b>Рантайм не запускался</b>Запустите скрипт без флага --no-runtime.</div></div></div>';
 var h='<div class="grid">'+card(rt.loaded.length,'загрузилось','', 'good')+card(rt.failed.length,'не загрузилось','',rt.failed.length?'bad':'good')+
  card(rt.browserOnly.length,'браузерных','зависят от внешних пакетов')+card(rt.matrix.filter(function(r){return r.ok}).length+'/'+rt.matrix.length,'конфигураций','',rt.matrix.every(function(r){return r.ok})?'good':'bad')+'</div>';
 if(rt.failed.length){
  h+='<div class="panel"><div class="ph"><b>Не загрузились</b></div><div class="pb">';
  rt.failed.forEach(function(f){h+='<div class="note" style="background:rgba(244,100,95,.07);border-color:rgba(244,100,95,.3)"><b>'+esc(f.file)+'</b><br>'+esc(f.error)+'<br><span style="color:var(--mute)">'+esc(f.stack)+'</span></div>'});
  h+='</div></div>';
 }
 if(rt.matrix.length){
  h+='<div class="panel"><div class="ph"><b>Прогон конфигураций</b><span class="grow"></span><em>реальное исполнение computeRoofModel → structure → pieces → plan → nesting</em></div><div class="pb"><table class="t">'+
   '<thead><tr><th>конфигурация</th><th>итог</th><th>скаты</th><th>стропила</th><th>м³</th><th>марки</th><th>изгиб</th><th>прогиб</th></tr></thead><tbody>';
  rt.matrix.forEach(function(r){
   var s=r.stats||{};
   h+='<tr'+(r.ok?'':' style="background:rgba(244,100,95,.08)"')+'><td class="n">'+esc(r.name)+'</td>'+
    '<td style="color:'+(r.ok?'var(--green)':'var(--red)')+'">'+(r.ok?'OK':'ПАДЕНИЕ')+'</td>'+
    '<td>'+(s.faces==null?'—':s.faces)+'</td><td>'+(s.rafters==null?'—':s.rafters)+'</td><td>'+(s.wood==null?'—':s.wood)+'</td>'+
    '<td>'+(s.pieces==null?'—':s.pieces)+'</td><td>'+(s.utilR==null?'—':Math.round(s.utilR*100)+'%')+'</td><td>'+(s.utilD==null?'—':Math.round(s.utilD*100)+'%')+'</td></tr>';
   if(!r.ok)h+='<tr><td colspan="8" style="color:var(--warn)">'+esc(r.error||('NaN: '+r.nan.join(', ')))+'</td></tr>';
  });
  h+='</tbody></table></div></div>';
 }
 if(rt.ownAudit){
  var tot=rt.ownAudit.reduce(function(s,r){return s+r.bugs},0);
  h+='<div class="panel"><div class="ph"><b>Собственный аудит проекта</b><span class="tag '+(tot?'t-err':'t-ok')+'">'+tot+' багов</span><span class="grow"></span><em>'+rt.ownAudit.length+' конфигураций</em></div><div class="pb">';
  rt.ownAudit.forEach(function(r){
   if(!r.bugs&&!r.violations)return;
   h+='<div class="note" style="background:rgba(244,100,95,.07);border-color:rgba(244,100,95,.3)"><b>'+esc(r.name)+'</b> — '+r.bugs+' багов, '+r.violations+' нарушений норм<br>'+r.fails.map(esc).join('<br>')+'</div>';
  });
  if(!tot)h+='<div class="empty"><b>Все конфигурации чистые</b></div>';
  h+='</div></div>';
 }
 if(rt.browserOnly.length)h+='<div class="panel"><div class="ph"><b>Только браузер</b><span class="grow"></span><em>импортируют внешние пакеты</em></div><div class="pb"><div class="links">'+
  rt.browserOnly.map(function(f){return '<button class="link" data-go="'+esc(f)+'">'+esc(f)+'</button>'}).join('')+'</div></div></div>';
 return h;
}
function renderMap(){
 var md=D.mapdiff;
 if(!md)return '<div class="panel"><div class="pb"><div class="empty"><b>Карта не найдена</b>Нет roof-map.html или в нём нет блока const M.</div></div></div>';
 var bad=md.rows.filter(function(r){return r.issues.length});
 var h='<div class="note">Сверка того, что <b>нарисовано в карте</b>, с тем, что <b>есть в коде</b>. Карта — снимок, код живёт; здесь видно, где снимок устарел.</div>';
 h+='<div class="grid">'+card(md.rows.length,'модулей в карте')+card(bad.length,'расхождений','',bad.length?'warn':'good')+card(md.notInMap.length,'нет в карте','',md.notInMap.length?'warn':'good')+'</div>';
 h+='<div class="panel"><div class="ph"><b>Расхождения</b><span class="grow"></span><em>'+esc(md.file)+'</em></div><div>';
 if(!bad.length&&!md.notInMap.length)h+='<div class="empty"><b>Карта совпадает с кодом</b></div>';
 bad.forEach(function(r,ix){
  h+='<button class="row warn'+(open['m'+ix]?' open':'')+'" data-k="m'+ix+'" type="button"><span class="st">⚠</span><span class="kd">'+r.issues.length+'</span>'+
   '<span class="ti">'+esc(r.file)+'</span><span class="fl">'+(r.exists?'есть':'НЕТ ФАЙЛА')+'</span></button>'+
   '<div class="det"><div class="box">'+r.issues.map(esc).join('<br>')+'</div>'+(r.exists?'<div class="links"><button class="link" data-go="'+esc(r.file)+'">открыть файл</button></div>':'')+'</div>';
 });
 md.notInMap.forEach(function(f){
  h+='<button class="row info" data-go="'+esc(f)+'" type="button"><span class="st">i</span><span class="kd">нет в карте</span><span class="ti">'+esc(f)+'</span><span class="fl"></span></button>';
 });
 return h+'</div></div>';
}
function render(){
 head();sync();
 var m=document.getElementById('main');
 m.innerHTML=F.tab==='over'?renderOverview():F.tab==='files'?renderFiles():F.tab==='graph'?renderGraph():
  F.tab==='contracts'?renderContracts():F.tab==='runtime'?renderRuntime():renderMap();
 m.querySelectorAll('[data-k]').forEach(function(b){b.onclick=function(){var k=b.dataset.k;open[k]=!open[k];render()}});
 m.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){selFile=b.dataset.go;F.tab=F.tab==='graph'?'graph':'files';render()}});
 m.querySelectorAll('[data-back]').forEach(function(b){b.onclick=function(){selFile=null;render()}});
 var svg=document.getElementById('graph');
 if(svg){
  svg.querySelectorAll('.gn').forEach(function(g){g.onclick=function(){selFile=g.dataset.id;render()}});
  svg.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};svg.classList.add('drag');svg.setPointerCapture(e.pointerId)});
  svg.addEventListener('pointermove',function(e){
   if(!drag)return;var vb=svg.getAttribute('viewBox').split(' ').map(Number);var r=svg.getBoundingClientRect();
   pan.x=drag.px-(e.clientX-drag.x)*(vb[2]/r.width);pan.y=drag.py-(e.clientY-drag.y)*(vb[3]/r.height);
   svg.setAttribute('viewBox',(vb[2]*0+ (vb[0]+pan.x-drag.px))+' '+(vb[1]+pan.y-drag.py)+' '+vb[2]+' '+vb[3]);
  });
  var stop=function(){drag=null;svg.classList.remove('drag')};
  svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);
 }
}
document.querySelectorAll('#tabs button').forEach(function(b){b.onclick=function(){F.tab=b.dataset.t;if(F.tab!=='files'&&F.tab!=='graph')selFile=null;render()}});
document.getElementById('q').oninput=function(e){F.q=e.target.value.trim().toLowerCase();render()};
document.getElementById('tDead').onclick=function(){F.dead=!F.dead;render()};
document.getElementById('tEntry').onclick=function(){F.entry=!F.entry;render()};
document.getElementById('cD').oninput=function(e){F.depth=+e.target.value;document.getElementById('vD').textContent=F.depth;if(F.tab==='graph')render()};
document.getElementById('cZ').oninput=function(e){F.zoom=+e.target.value;document.getElementById('vZ').textContent=F.zoom+'%';if(F.tab==='graph')render()};
document.getElementById('bReset').onclick=function(){F.q='';document.getElementById('q').value='';F.sev={error:true,warn:true,info:true};F.dead=false;F.entry=false;F.depth=1;F.zoom=1;pan={x:0,y:0};selFile=null;open={};
 document.getElementById('cD').value=1;document.getElementById('vD').textContent='1';document.getElementById('cZ').value=100;document.getElementById('vZ').textContent='100%';render()};
function dl(n,t,m){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:m}));a.download=n;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1500)}
document.getElementById('bJson').onclick=function(){dl('project-audit.json',JSON.stringify(D,null,2),'application/json')};
document.getElementById('bMd').onclick=function(){
 var BT=String.fromCharCode(96);
 var L=['# Аудит проекта','','Корень: '+D.root,'','Файлов '+D.counts.files+' · связей '+D.counts.edges+' · ошибок '+D.counts.errors,'','## Проблемы',''];
 D.issues.forEach(function(i){L.push('- **'+i.title+'** ('+i.sev+'/'+i.kind+') — '+i.detail+(i.file?' '+BT+i.file+(i.line?':'+i.line:'')+BT:''))});
 L.push('','## Файлы','');
 D.modules.forEach(function(m){L.push('### '+m.file+(m.dead?' — МЁРТВЫЙ':''));L.push('Экспорты: '+m.exports.map(function(e){return e.name}).join(', '));L.push('Импорты: '+m.imports.map(function(i){return i.spec}).join(', '),'')});
 dl('project-audit.md',L.join('\\n'),'text/markdown');
};
addEventListener('keydown',function(e){
 if(/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)){if(e.key==='Escape'){e.target.value='';F.q='';render();e.target.blur()}return}
 var k=e.key.toLowerCase();
 if(k==='/'){e.preventDefault();document.getElementById('q').focus()}
 if(k==='g'){F.tab='graph';render()}if(k==='f'){F.tab='files';render()}if(k==='o'){F.tab='over';render()}
 if(k==='k'){F.tab='contracts';render()}if(k==='r'){F.tab='runtime';render()}
});
render();
</script></body></html>`;
  fs.writeFileSync(path.join(OPT.root, OPT.out + '.html'), TPL.replace('__DATA__', JSON.stringify(DATA).replace(/<\//g, '<\\/')));
}

const bad = OPT.failOn === 'error' ? counts.errors : OPT.failOn === 'warn' ? counts.errors + counts.warns : OPT.failOn === 'never' ? 0 : counts.errors;
