import Papa from 'papaparse';
import { isMissing } from './csv';
import { describe } from './statistics';
import { percent } from './eda';

export const MISSING_BANDS = ['0 %', '> 0 % hasta 10 %', '> 10 % hasta 20 %', '> 20 % hasta 40 %', '> 40 % hasta 60 %', '> 60 % hasta 80 %', '> 80 % hasta 100 %'] as const;
const upperBounds = [0, 10, 20, 40, 60, 80, 100];
export interface RowMissingness { index: number; missing: number; percentage: number }
export function consideredColumns(selected: readonly number[], columnCount: number): number[] {
  return [...new Set(selected)].filter(i => Number.isInteger(i) && i >= 0 && i < columnCount);
}
export function rowMissingness(rows: readonly (readonly string[])[], columnCount: number, selected: readonly number[]) {
  const columns = consideredColumns(selected, columnCount);
  const distribution = MISSING_BANDS.map(name => ({ name, count: 0, percentage: 0 }));
  if (!columns.length) return { columns, records: [] as RowMissingness[], mean: null, median: null, max: null, completelyEmpty: 0, emptyInSelection: 0, distribution };
  let completelyEmpty = 0, emptyInSelection = 0;
  const records = rows.map((row, index) => {
    const missing = columns.reduce((sum, i) => sum + Number(isMissing(row[i] ?? '')), 0);
    if (missing === columns.length) emptyInSelection++;
    if (Array.from({ length: columnCount }, (_, i) => row[i] ?? '').every(isMissing)) completelyEmpty++;
    // Compare integer products: boundary values belong to exactly one interval.
    const band = upperBounds.findIndex(bound => missing * 100 <= bound * columns.length);
    distribution[band]!.count++;
    return { index, missing, percentage: percent(missing, columns.length) };
  });
  distribution.forEach(band => { band.percentage = percent(band.count, rows.length); });
  const stats = describe(records.map(row => row.missing));
  return { columns, records, mean: stats.mean === null ? null : percent(stats.mean, columns.length), median: stats.median === null ? null : percent(stats.median, columns.length), max: stats.max === null ? null : percent(stats.max, columns.length), completelyEmpty, emptyInSelection, distribution };
}
export function rowsAboveThreshold(records: readonly RowMissingness[], columns: number, threshold: number) {
  if (!columns || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) return [];
  return records.filter(row => row.missing * 100 > threshold * columns);
}
export function filteredCsv(headers: readonly string[], rows: readonly (readonly string[])[], filtered: readonly RowMissingness[], delimiter = ',') {
  return Papa.unparse({ fields: [...headers], data: filtered.map(record => [...rows[record.index]!]) }, { delimiter, newline: '\r\n', quotes: true });
}
export function sortMissingColumns<T extends { missingPercent: number }>(columns: readonly T[], descending: boolean): T[] {
  // Stable ties retain the original file order.
  return descending ? columns.map((column, index) => ({ column, index })).sort((a, b) => b.column.missingPercent - a.column.missingPercent || a.index - b.index).map(item => item.column) : [...columns];
}
