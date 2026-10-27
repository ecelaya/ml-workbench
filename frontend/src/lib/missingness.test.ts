import { test } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { consideredColumns, filteredCsv, rowMissingness, rowsAboveThreshold, sortMissingColumns } from './missingness';
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test('usa la definición existente: espacios vacíos sí, NA/NULL/N/A y cero no', () => {
  const rows = [['', '  ', '\t', 'NA', 'NULL', 'N/A', '0']];
  const report = rowMissingness(rows, 7, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(report.records[0]?.missing, 3);
  close(report.records[0]!.percentage, 300 / 7);
  close(report.mean, 300 / 7); close(report.median, 300 / 7); close(report.max, 300 / 7);
  assert.equal(report.completelyEmpty, 0);
});
test('intervalos excluyentes incluyen cada extremo en el intervalo correcto', () => {
  const counts = [0, 1, 10, 11, 20, 21, 40, 41, 60, 61, 80, 81, 100];
  const rows = counts.map(missing => Array.from({ length: 100 }, (_, i) => i < missing ? '' : 'x'));
  const r = rowMissingness(rows, 100, Array.from({ length: 100 }, (_, i) => i));
  assert.deepEqual(r.distribution.map(band => band.count), [1, 2, 2, 2, 2, 2, 2]);
  assert.equal(r.distribution.reduce((n, b) => n + b.count, 0), rows.length);
  close(r.distribution.reduce((n, b) => n + b.percentage, 0), 100);
  assert.equal(r.emptyInSelection, 1); assert.equal(r.completelyEmpty, 1);
  assert.equal(r.max, 100); assert.equal(r.median, 40);
});
test('umbrales 0, 40 y 100 son estrictos, sin redondear antes del filtro', () => {
  const rows = [0, 2, 3, 5].map(n => Array.from({ length: 5 }, (_, i) => i < n ? '' : 'x'));
  const r = rowMissingness(rows, 5, [0, 1, 2, 3, 4]);
  assert.deepEqual(rowsAboveThreshold(r.records, 5, 0).map(row => row.index), [1, 2, 3]);
  assert.deepEqual(rowsAboveThreshold(r.records, 5, 40).map(row => row.index), [2, 3]);
  assert.deepEqual(rowsAboveThreshold(r.records, 5, 100), []);
  const exact = rowMissingness([Array.from({ length: 25 }, (_, i) => i < 7 ? '' : 'x')], 25, Array.from({ length: 25 }, (_, i) => i));
  assert.deepEqual(rowsAboveThreshold(exact.records, 25, 28), []);
  assert.equal(rowsAboveThreshold(exact.records, 25, 27.99).length, 1);
});
test('media, mediana y máximo consideran todos los registros, incluidos los de 0 % NA', () => {
  const r = rowMissingness([['x', 'y'], ['', 'y'], ['', '']], 2, [0, 1]);
  assert.equal(r.mean, 50); assert.equal(r.median, 50); assert.equal(r.max, 100);
  assert.equal(r.completelyEmpty, 1);
  const large = rowMissingness(Array.from({ length: 101 }, (_, i) => [i === 100 ? '' : 'x']), 1, [0]);
  assert.equal(large.records.length, 101); close(large.mean, 100 / 101);
  assert.deepEqual(rowsAboveThreshold(large.records, 1, 40).map(row => row.index), [100]);
});
test('seleccionar columnas cambia denominador, distribución y filtro sin modificar los datos', () => {
  const rows = [['', 'x'], ['', ''], ['x', 'y']], original = structuredClone(rows);
  const all = rowMissingness(rows, 2, [0, 1]), one = rowMissingness(rows, 2, [0]);
  assert.equal(all.records[0]?.percentage, 50); assert.equal(one.records[0]?.percentage, 100);
  assert.equal(one.emptyInSelection, 2); assert.equal(one.completelyEmpty, 1);
  assert.equal(rowsAboveThreshold(all.records, 2, 60).length, 1);
  assert.equal(rowsAboveThreshold(one.records, 1, 60).length, 2);
  assert.deepEqual(rows, original);
  assert.deepEqual(consideredColumns([0, 0, 1, -1, 9, 1.2, NaN], 2), [0, 1]);
});
test('datasets vacíos, sin columnas y selección vacía no producen NaN ni porcentajes inventados', () => {
  const empty = rowMissingness([], 2, [0, 1]);
  assert.equal(empty.mean, null); assert.equal(empty.median, null); assert.equal(empty.max, null);
  assert.equal(empty.completelyEmpty, 0); assert.ok(empty.distribution.every(b => b.count === 0 && b.percentage === 0));
  for (const r of [rowMissingness([[]], 0, []), rowMissingness([['']], 1, []), rowMissingness([['']], 1, [2])]) {
    assert.deepEqual(r.records, []); assert.equal(r.mean, null);
    assert.deepEqual(rowsAboveThreshold(r.records, r.columns.length, 0), []);
  }
  assert.deepEqual(rowsAboveThreshold([], 1, NaN), []);
});
test('orden descendente es estable y conserva el orden del informe original', () => {
  const input = [{ name: 'a', missingPercent: 10 }, { name: 'b', missingPercent: 90 }, { name: 'c', missingPercent: 10 }];
  assert.deepEqual(sortMissingColumns(input, true).map(c => c.name), ['b', 'a', 'c']);
  assert.deepEqual(sortMissingColumns(input, false).map(c => c.name), ['a', 'b', 'c']);
  assert.deepEqual(input.map(c => c.name), ['a', 'b', 'c']);
});
test('CSV filtrado conserva todas las columnas y contenido original, comillas, espacios y saltos de línea', () => {
  const headers = ['id', 'text', 'missing'];
  const rows = [['01', ' coma, punto; y "comillas"\r\nsegunda línea ', ''], ['02', '=1+1', ' '], ['03', 'NA', 'NULL']];
  const r = rowMissingness(rows, 3, [2]);
  const filtered = rowsAboveThreshold(r.records, 1, 40);
  const csv = filteredCsv(headers, rows, filtered, ';');
  const parsed = Papa.parse<string[]>(csv, { delimiter: ';' });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.data, [headers, rows[0], rows[1]]);
  assert.equal(parsed.data[2]?.[1], '=1+1'); // Exportación fiel: no se reescriben valores.
  assert.deepEqual(Papa.parse<string[]>(filteredCsv(headers, rows, []), { skipEmptyLines: true }).data, [headers]);
});
