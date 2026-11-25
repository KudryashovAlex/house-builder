export const fin = (v, d = 0) => Number.isFinite(v) ? v : d;
export const cl = (v, a, b) => Math.max(a, Math.min(b, fin(v, a)));
export const fmt = n => Math.round(fin(n)).toLocaleString('ru-RU');
export const f1 = n => fin(n).toFixed(1);
export const f2 = n => fin(n).toFixed(2);
export const f3 = n => fin(n).toFixed(3);
export const mm = n => Math.round(fin(n) * 1000);
export const deg = r => fin(r) * 180 / Math.PI;