import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profile } from './csv';
test('detecta tipos, valores vacíos y únicos sin alterar las columnas', () => {
  const result = profile(['n', 'b', 'fecha', 'texto', 'vacía'], [['1', 'true', '2026-01-01', 'hola', ''], ['2.5', 'FALSE', '2026-02-28', 'hola', '  ']]);
  assert.deepEqual(result.map(c => c.type), ['Numérica', 'Booleana', 'Fecha', 'Texto', 'Sin datos']);
  assert.equal(result[3]?.unique, 1);
  assert.equal(result[4]?.missing, 2);
});
test('no confunde números ambiguos o fechas imposibles con tipos válidos', () => {
  assert.deepEqual(profile(['a', 'b'], [['1,25', '2026-02-30']]).map(c => c.type), ['Texto', 'Texto']);
});
