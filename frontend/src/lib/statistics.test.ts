import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, frequencies, histogram, numericColumns, numericValue, pearson } from './statistics';
import { profile } from './csv';
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);
test('conversion numérica estricta: no convierte nulos ni etiquetas', () => {
  assert.deepEqual(['', ' ', 'NA', 'null', 'true', '1,2', 'Infinity', '1e999'].map(numericValue), Array(8).fill(null));
  assert.deepEqual([' 0 ', '-2.5', '1e2'].map(numericValue), [0, -2.5, 100]);
});
test('descriptivos con interpolación lineal y varianza muestral', () => {
  const s = describe([1, 2, null, 3, 4]);
  assert.equal(s.n, 4); assert.equal(s.excluded, 1);
  close(s.mean, 2.5); close(s.variance, 5 / 3); close(s.sd, Math.sqrt(5 / 3));
  close(s.q1, 1.75); close(s.median, 2.5); close(s.q3, 3.25);
  assert.equal(s.min, 1); assert.equal(s.max, 4);
});
test('muestras vacías, singleton y constantes no inventan estadísticos', () => {
  const empty = describe([null, NaN, Infinity]);
  assert.equal(empty.n, 0); assert.equal(empty.mean, null); assert.equal(empty.median, null); assert.equal(empty.sd, null);
  const single = describe([7]); assert.equal(single.mean, 7); assert.equal(single.sd, null); assert.equal(single.q1, 7);
  assert.equal(describe([3, 3, 3]).sd, 0);
  assert.equal(describe([.1, .1, .1]).sd, 0);
});
test('histograma conserva todas las observaciones, incluidos extremos y ceros', () => {
  const bins = histogram([-2, -1, 0, 1, 2, null]);
  assert.equal(bins.reduce((sum, b) => sum + b.count, 0), 5);
  assert.equal(bins[0]?.start, -2); assert.equal(bins.at(-1)?.end, 2);
  assert.deepEqual(histogram([0, 0, null]), [{ start: 0, end: 0, count: 2 }]);
  assert.deepEqual(histogram([null]), []);
});
test('Pearson usa pares completos y detecta constante o muestra insuficiente', () => {
  const pair = pearson([1, 2, null, 4], [2, 4, 99, null]);
  close(pair.r, 1); assert.equal(pair.n, 2);
  close(pearson([1, 2, 3], [3, 2, 1]).r, -1);
  close(pearson([-1, 0, 1], [1, 0, 1]).r, 0);
  assert.equal(pearson([1, 1], [1, 2]).r, null);
  assert.equal(pearson([.1, .1, .1], [1, 2, 3]).r, null);
  assert.equal(pearson([1, null], [2, 3]).r, null);
  assert.equal(pearson([1, 2], [null, null]).n, 0);
});
test('números grandes no desbordan sumas ni correlaciones', () => {
  close(describe([1e308, 1e308]).mean! / 1e308, 1);
  close(pearson([1e300, 2e300, 3e300], [3e300, 2e300, 1e300]).r, -1);
  assert.equal(histogram([-1e308, 1e308]).reduce((sum, b) => sum + b.count, 0), 2);
});
test('frecuencias preservan todas las categorías, sin colisiones con nombres especiales', () => {
  const f = frequencies(['a', ' a ', '', ' ', '__proto__', 'b']);
  assert.equal(f.n, 4); assert.equal(f.missing, 2); assert.equal(f.categories.length, 3);
  assert.deepEqual(f.categories[0], { name: 'a', count: 2 });
  assert.equal(frequencies(Array.from({ length: 25 }, (_, i) => String(i))).categories.length, 25);
});
test('el rol es distinto del almacenamiento; IDs numéricos no son medidas por defecto', () => {
  const columns = profile(['id', 'temperatura', 'grupo', 'nivel'], [['1', '20.1', 'a', 'bajo'], ['2', '22.3', 'b', 'alto']]);
  assert.deepEqual(columns.map(c => c.type), ['Entero', 'Decimal', 'Texto', 'Texto']);
  assert.deepEqual(columns.map(c => c.role), ['Identificador', 'Numérica', 'Categórica nominal', 'Categórica ordinal']);
  assert.deepEqual(numericColumns(columns, {}), [1]);
  assert.deepEqual(numericColumns(columns, { 0: true, 1: false, 2: true }), [0, 2]);
  assert.deepEqual(numericColumns(columns.map(c => ({ ...c, role: 'Categórica ordinal' })), {}), []);
});
