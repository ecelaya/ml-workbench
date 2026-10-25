import type { ColumnProfile } from '../types/dataset';
export function numericColumns(columns: readonly ColumnProfile[], overrides: Readonly<Record<number, boolean>>): number[] {
  return columns.flatMap((column, index) => (overrides[index] ?? (column.role === 'Numérica')) ? [index] : []);
}
export function numericValue(value: string | undefined): number | null {
  const text = value?.trim() ?? '';
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
const finite = (value: number): number | null => Number.isFinite(value) ? value : null;
function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p;
  const left = sorted[Math.floor(position)]!;
  const right = sorted[Math.ceil(position)]!;
  return finite(left * (1 - (position % 1)) + right * (position % 1));
}
export function describe(values: readonly (number | null)[]) {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const sorted = [...valid].sort((a, b) => a - b);
  // Scale before accumulation to avoid overflowing sums for large finite inputs.
  const scale = valid.reduce((max, v) => Math.max(max, Math.abs(v)), 0) || 1;
  const meanScaled = valid.reduce((sum, v) => sum + v / scale, 0) / valid.length;
  const squared = valid.reduce((sum, v) => sum + (v / scale - meanScaled) ** 2, 0);
  const sd = valid.length > 1 ? sorted[0] === sorted.at(-1) ? 0 : Math.sqrt(squared / (valid.length - 1)) * scale : NaN;
  return { n: valid.length, excluded: values.length - valid.length, mean: finite(meanScaled * scale), min: sorted[0] ?? null, q1: quantile(sorted, .25), median: quantile(sorted, .5), q3: quantile(sorted, .75), max: sorted.at(-1) ?? null, variance: finite(sd * sd), sd: finite(sd) };
}
export function histogram(values: readonly (number | null)[]) {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!valid.length) return [];
  const min = valid.reduce((a, b) => Math.min(a, b));
  const max = valid.reduce((a, b) => Math.max(a, b));
  if (min === max) return [{ start: min, end: max, count: valid.length }];
  const count = Math.min(20, Math.ceil(Math.sqrt(valid.length)));
  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const low = min / scale, range = max / scale - low;
  const bins = Array.from({ length: count }, (_, i) => ({ start: (low + range * i / count) * scale, end: (low + range * (i + 1) / count) * scale, count: 0 }));
  for (const v of valid) bins[Math.min(count - 1, Math.max(0, Math.floor((v / scale - low) / range * count)))]!.count++;
  return bins;
}
export function pearson(x: readonly (number | null)[], y: readonly (number | null)[]) {
  const pairs: [number, number][] = [];
  x.forEach((a, i) => { const b = y[i]; if (a !== null && Number.isFinite(a) && b !== null && b !== undefined && Number.isFinite(b)) pairs.push([a, b]); });
  const n = pairs.length;
  if (n < 2) return { n, r: null };
  if (pairs.every(p => p[0] === pairs[0]![0]) || pairs.every(p => p[1] === pairs[0]![1])) return { n, r: null };
  const sx = pairs.reduce((m, p) => Math.max(m, Math.abs(p[0])), 0) || 1;
  const sy = pairs.reduce((m, p) => Math.max(m, Math.abs(p[1])), 0) || 1;
  const mx = pairs.reduce((sum, p) => sum + p[0] / sx, 0) / n;
  const my = pairs.reduce((sum, p) => sum + p[1] / sy, 0) / n;
  let xx = 0, yy = 0, xy = 0;
  for (const [a, b] of pairs) { const dx = a / sx - mx, dy = b / sy - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  return { n, r: xx === 0 || yy === 0 ? null : finite(Math.max(-1, Math.min(1, xy / Math.sqrt(xx) / Math.sqrt(yy)))) };
}
export function frequencies(values: readonly string[]) {
  const counts = new Map<string, number>();
  let missing = 0;
  for (const value of values) { const key = value.trim(); if (!key) missing++; else counts.set(key, (counts.get(key) ?? 0) + 1); }
  return { n: values.length - missing, missing, categories: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) };
}
