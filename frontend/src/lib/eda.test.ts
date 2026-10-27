import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxSummary, categoryPlot, categorySummary, completePairs, contingency, defaultOrder, groupedNumeric, numericSelection, orderFrequencies, pairAnalysis, percent, quality, samplePoints, visualization } from './eda';
import { profile } from './csv';
import { describe, numericValue } from './statistics';
const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-10);

test('selección del gráfico depende del rol y valores, no confunde discretos con categorías', () => {
  assert.equal(visualization('Numérica', ['0', '2', '3', '2', '']), 'discrete-bars');
  assert.equal(visualization('Numérica', ['1.5', '2', '']), 'histogram');
  assert.equal(visualization('Numérica', Array.from({ length: 21 }, (_, i) => String(i))), 'histogram');
  assert.equal(visualization('Categórica nominal', ['0', '1']), 'category-bars');
  assert.equal(visualization('Categórica ordinal', ['1', '2', '3']), 'ordered-bars');
  assert.equal(visualization('Identificador', ['1', '2', '3']), 'identifier');
  assert.equal(visualization('Numérica', []), 'histogram');
});
test('frecuencias relativas y moda incluyen empates y excluyen ausentes', () => {
  const s = categorySummary(['a', ' b ', 'a', 'b', '', ' ']);
  assert.equal(s.n, 4); assert.equal(s.missing, 2); assert.deepEqual(s.modes, ['a', 'b']);
  assert.equal(s.unique, 2); assert.equal(s.uniqueness, 50);
  assert.equal(percent(s.categories[0]!.count, s.n), 50);
  assert.deepEqual(categorySummary(['', ' ']).modes, []);
  assert.equal(percent(0, 0), 0);
});
test('Otros es solo visual, conserva el total y no colisiona con una categoría real', () => {
  const s = categorySummary(['Otros (agrupados)', ...Array.from({ length: 20 }, (_, i) => `c${i}`), 'c1', 'c1']);
  const original = structuredClone(s.categories);
  const chart = categoryPlot(s.categories);
  assert.equal(chart.length, 15);
  assert.equal(chart.reduce((n, c) => n + c.count, 0), s.n);
  assert.equal(chart.at(-1)?.grouped, true);
  assert.notEqual(chart.at(-1)?.name, 'Otros (agrupados)');
  assert.deepEqual(s.categories, original); assert.equal(s.unique, 21); assert.deepEqual(s.modes, ['c1']);
});
test('orden ordinal numérico, conocido y manual; no inventa orden para etiquetas arbitrarias', () => {
  assert.deepEqual(defaultOrder(['3', '1', '2']), ['1', '2', '3']);
  assert.deepEqual(defaultOrder(['high', 'low', 'medium']), ['low', 'medium', 'high']);
  assert.equal(defaultOrder(['bronze', 'gold', 'silver']), null);
  const c = categorySummary(['gold', 'gold', 'silver', 'bronze']).categories;
  assert.deepEqual(orderFrequencies(c, ['bronze', 'silver', 'gold']).map(v => v.name), ['bronze', 'silver', 'gold']);
  assert.equal(orderFrequencies(c, ['bronze', 'silver', 'gold']).reduce((n, v) => n + v.count, 0), 4);
});
test('boxplot reutiliza cuartiles, cercas Tukey y extremos observados', () => {
  const values = [1, 2, 3, 4, 100, null];
  const b = boxSummary(values), s = describe(values);
  assert.equal(b.q1, s.q1); assert.equal(b.q3, s.q3); assert.equal(b.median, s.median);
  assert.equal(b.low, 1); assert.equal(b.high, 4); assert.deepEqual(b.outliers, [100]);
  assert.equal(b.n, 5); assert.equal(b.excluded, 1);
  assert.deepEqual(boxSummary([null]).outliers, []); assert.equal(boxSummary([null]).low, null);
  assert.equal(boxSummary([2]).low, 2); assert.equal(boxSummary([2]).sd, null);
  assert.deepEqual(boxSummary([3, 3, 3]).outliers, []);
});
test('análisis por pareja respeta roles y no acepta identificadores', () => {
  assert.equal(pairAnalysis('Numérica', 'Numérica'), 'scatter');
  assert.equal(pairAnalysis('Numérica', 'Categórica ordinal'), 'grouped');
  assert.equal(pairAnalysis('Categórica nominal', 'Numérica'), 'grouped');
  assert.equal(pairAnalysis('Categórica ordinal', 'Categórica nominal'), 'contingency');
  assert.equal(pairAnalysis('Identificador', 'Numérica'), 'unsupported');
  const c = profile(['x', 'id', 'binary'], [['2', '1', '0'], ['3', '2', '1']]);
  assert.deepEqual(numericSelection(c, [0, 1, 2]), [0]);
  assert.deepEqual(numericSelection(c.map(v => ({ ...v, role: 'Categórica nominal' })), [0, 1, 2]), []);
});
test('scatter usa casos completos; el muestreo no modifica datos originales', () => {
  assert.deepEqual(completePairs(['1', '2', '', '4'], ['2', '', '3', '8']), [{ x: 1, y: 2 }, { x: 4, y: 8 }]);
  const points = Array.from({ length: 4000 }, (_, i) => i);
  const sampled = samplePoints(points);
  assert.equal(sampled.length, 3000); assert.equal(sampled[0], 0); assert.equal(sampled.at(-1), 3999);
  assert.equal(points.length, 4000); assert.equal(new Set(sampled).size, 3000);
});
test('descriptivos por grupo excluyen pares ausentes sin mezclar grupos', () => {
  const result = groupedNumeric(['a', 'a', 'b', 'b', '', 'c'], ['1', '3', '4', '', '10', 'texto']);
  assert.equal(result.excluded, 3);
  const a = result.groups.find(g => g.name === 'a')!.box;
  close(a.mean, 2); close(a.variance, 2); assert.equal(a.n, 2);
  assert.equal(result.groups.find(g => g.name === 'b')?.box.n, 1);
  assert.equal(result.groups.find(g => g.name === 'c')?.box.mean, null);
});
test('contingencia usa denominadores explícitos y nombres seguros', () => {
  const c = contingency(['a', 'a', 'a', 'b', '', '__proto__'], ['x', 'x', 'y', 'y', 'y', 'name']);
  assert.equal(c.n, 5); assert.equal(c.excluded, 1);
  const ax = c.cells.find(v => v.a === 'a' && v.b === 'x')!;
  assert.equal(ax.count, 2); close(ax.rowPercent, 200 / 3); assert.equal(ax.totalPercent, 40);
  assert.equal(c.counts.get('b')?.get('x') ?? 0, 0);
  assert.equal(c.counts.get('__proto__')?.get('name'), 1);
  assert.equal(c.cells.reduce((sum, v) => sum + v.count, 0), c.n);
  assert.equal(contingency([], []).n, 0);
});
test('calidad distingue filas exactas, repeticiones de ID, ausentes y constantes', () => {
  const rows = [['1', 'a', ''], ['1', 'b', ''], ['1', 'b', ''], ['2', 'a', ' ']];
  const report = quality(rows, profile(['id', 'group', 'empty'], rows));
  assert.equal(report.duplicates, 1); assert.equal(report.duplicatePercent, 25);
  assert.equal(report.columns[0]?.duplicates, 2); assert.equal(report.columns[0]?.uniqueness, 50);
  assert.equal(report.columns[2]?.missingPercent, 100); assert.equal(report.columns[2]?.constant, false);
  assert.equal(quality([['a'], ['a'], ['']], profile(['x'], [['a'], ['a'], ['']])).columns[0]?.constant, true);
  assert.equal(quality([], []).duplicatePercent, 0);
  const sequence = Array.from({ length: 20 }, (_, i) => [String(i)]);
  assert.equal(quality(sequence, profile(['x'], sequence)).columns[0]?.highCardinality, true);
});
test('Titanic: selección generalizable de roles y visualizaciones con una fixture representativa', () => {
  const headers = ['PassengerId', 'Survived', 'Pclass', 'Sex', 'Age', 'Fare', 'SibSp', 'Parch', 'Embarked'];
  // Fixture de prueba, no un dataset incorporado al producto. Incluye edades continuas y conteos >1.
  const rows = Array.from({ length: 30 }, (_, i) => [String(i + 1), String(i % 2), String(i % 3 + 1), i % 2 ? 'female' : 'male', i === 5 ? '' : String(10 + i + (i % 5 === 0 ? .5 : 0)), String(7.25 + i * 2.1), String(i % 4), String(i % 3), ['S', 'C', 'Q'][i % 3]!]);
  const columns = profile(headers, rows);
  assert.deepEqual(columns.map(c => c.role), ['Identificador', 'Categórica nominal', 'Categórica ordinal', 'Categórica nominal', 'Numérica', 'Numérica', 'Numérica', 'Numérica', 'Categórica nominal']);
  assert.deepEqual(columns.map((c, i) => visualization(c.role, rows.map(row => row[i]!))), ['identifier', 'category-bars', 'ordered-bars', 'category-bars', 'histogram', 'histogram', 'discrete-bars', 'discrete-bars', 'category-bars']);
  assert.equal(describe(rows.map(row => numericValue(row[4]))).n, 29);
  assert.deepEqual(numericSelection(columns, columns.map((_, i) => i)), [4, 5, 6, 7]);
});
