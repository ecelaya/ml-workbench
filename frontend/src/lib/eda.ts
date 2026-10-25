import type { ColumnProfile, StatisticalRole } from '../types/dataset';
import { describe, frequencies, numericValue } from './statistics';
export const percent = (count: number, total: number) => total ? count / total * 100 : 0;
export function visualization(role: StatisticalRole, values: readonly string[]) {
  if (role === 'Identificador') return 'identifier';
  if (role === 'Categórica ordinal') return 'ordered-bars';
  if (role === 'Categórica nominal') return 'category-bars';
  const valid = values.map(numericValue).filter((v): v is number => v !== null);
  return valid.length && valid.every(Number.isInteger) && new Set(valid).size <= 20 ? 'discrete-bars' : 'histogram';
}
export function pairAnalysis(a: StatisticalRole, b: StatisticalRole) {
  if (a === 'Identificador' || b === 'Identificador') return 'unsupported';
  if (a === 'Numérica' && b === 'Numérica') return 'scatter';
  return a === 'Numérica' || b === 'Numérica' ? 'grouped' : 'contingency';
}
export function numericSelection(columns: readonly ColumnProfile[], selected: readonly number[]) {
  return selected.filter(i => columns[i]?.role === 'Numérica');
}
export function defaultOrder(categories: readonly string[]): string[] | null {
  if (!categories.length) return [];
  const numeric = categories.map(numericValue);
  if (numeric.every(v => v !== null)) return [...categories].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  for (const order of [['low', 'medium', 'high'], ['bajo', 'medio', 'alto'], ['baja', 'media', 'alta']]) {
    if (categories.every(c => order.includes(c.toLowerCase()))) return [...categories].sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
  }
  return null;
}
export function orderFrequencies(categories: ReturnType<typeof frequencies>['categories'], order?: readonly string[]) {
  if (!order) return categories;
  const ranks = new Map(order.map((v, i) => [v, i]));
  return [...categories].sort((a, b) => (ranks.get(a.name) ?? Infinity) - (ranks.get(b.name) ?? Infinity) || a.name.localeCompare(b.name));
}
export function categorySummary(values: readonly string[]) {
  const f = frequencies(values);
  const max = f.categories[0]?.count ?? 0;
  return { ...f, modes: f.categories.filter(c => c.count === max).map(c => c.name), unique: f.categories.length, duplicates: f.n - f.categories.length, uniqueness: percent(f.categories.length, f.n) };
}
export function categoryPlot(categories: ReturnType<typeof frequencies>['categories'], limit = 15) {
  if (categories.length <= limit) return categories.map(c => ({ ...c, grouped: false }));
  const kept = [...categories].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit - 1);
  // Separate synthetic category from an actual category named "Otros".
  let name = 'Otros (agrupados)';
  while (categories.some(c => c.name === name)) name += '*';
  return [...kept.map(c => ({ ...c, grouped: false })), { name, count: categories.reduce((sum, c) => sum + c.count, 0) - kept.reduce((sum, c) => sum + c.count, 0), grouped: true }];
}
export function boxSummary(values: readonly (number | null)[]) {
  const stats = describe(values);
  if (stats.q1 === null || stats.q3 === null) return { ...stats, low: null, high: null, outliers: [] as number[] };
  const iqr = stats.q3 - stats.q1;
  const lower = stats.q1 - 1.5 * iqr, upper = stats.q3 + 1.5 * iqr;
  let low: number | null = null, high: number | null = null;
  const outliers: number[] = [];
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    if (value < lower || value > upper) outliers.push(value);
    else { low = low === null ? value : Math.min(low, value); high = high === null ? value : Math.max(high, value); }
  }
  return { ...stats, low, high, outliers };
}
export function groupedNumeric(categories: readonly string[], values: readonly string[]) {
  const groups = new Map<string, (number | null)[]>();
  let excluded = 0;
  categories.forEach((raw, i) => {
    const key = raw.trim(), value = numericValue(values[i]);
    if (!key) { excluded++; return; }
    const group = groups.get(key) ?? []; group.push(value); groups.set(key, group);
    if (value === null) excluded++;
  });
  return { excluded, groups: [...groups].map(([name, data]) => ({ name, box: boxSummary(data) })) };
}
export function completePairs(x: readonly string[], y: readonly string[]) {
  const points: { x: number; y: number }[] = [];
  x.forEach((value, i) => { const a = numericValue(value), b = numericValue(y[i]); if (a !== null && b !== null) points.push({ x: a, y: b }); });
  return points;
}
export function samplePoints<T>(points: readonly T[], limit = 3000): T[] {
  if (points.length <= limit) return [...points];
  return Array.from({ length: limit }, (_, i) => points[Math.floor(i * (points.length - 1) / (limit - 1))]!);
}
export function contingency(x: readonly string[], y: readonly string[]) {
  const counts = new Map<string, Map<string, number>>(), totals = new Map<string, number>();
  const ys = new Set<string>();
  let n = 0;
  x.forEach((raw, i) => {
    const a = raw.trim(), b = y[i]?.trim(); if (!a || !b) return;
    const row = counts.get(a) ?? new Map<string, number>(); row.set(b, (row.get(b) ?? 0) + 1); counts.set(a, row);
    totals.set(a, (totals.get(a) ?? 0) + 1); ys.add(b); n++;
  });
  return { n, excluded: x.length - n, xs: [...counts.keys()], ys: [...ys], cells: [...counts].flatMap(([a, row]) => [...row].map(([b, count]) => ({ a, b, count, rowPercent: percent(count, totals.get(a)!), totalPercent: percent(count, n) }))), counts, totals };
}
export function quality(rows: readonly string[][], columns: readonly ColumnProfile[]) {
  const seen = new Set<string>(); let duplicates = 0;
  for (const row of rows) { const key = JSON.stringify(row); if (seen.has(key)) duplicates++; else seen.add(key); }
  return { duplicates, duplicatePercent: percent(duplicates, rows.length), columns: columns.map((c, i) => {
    const f = categorySummary(rows.map(row => row[i] ?? ''));
    return { name: c.name, role: c.role, ...f, missingPercent: percent(f.missing, rows.length), constant: f.n > 0 && f.unique === 1, highCardinality: f.n >= 20 && f.unique / f.n >= .9 };
  }) };
}
