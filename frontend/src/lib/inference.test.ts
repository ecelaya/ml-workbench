import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profile } from './csv';
import { inferRole, inferStorage } from './inference';
import { numericColumns } from './statistics';
const infer = (name: string, values: string[]) => profile([name], values.map(v => [v]))[0]!;

test('Titanic: fixture representativa sin reglas por nombre de dataset', () => {
  const headers = ['PassengerId', 'Survived', 'Pclass', 'Sex', 'Age', 'Fare', 'SibSp', 'Parch', 'Ticket'];
  const rows = [
    ['1', '0', '3', 'male', '22', '7.25', '1', '0', 'A/5 21171'],
    ['2', '1', '1', 'female', '38', '71.2833', '1', '0', 'PC 17599'],
    ['3', '1', '3', 'female', '26', '7.925', '0', '0', 'STON/O2. 3101282'],
    ['4', '1', '1', 'female', '35', '53.1', '1', '0', '113803'],
    ['5', '0', '3', 'male', '35', '8.05', '0', '0', '373450'],
    ['6', '0', '2', 'male', '', '13', '3', '2', '113803'],
  ];
  const c = profile(headers, rows);
  assert.deepEqual(c.map(v => v.role), ['Identificador', 'Categórica nominal', 'Categórica ordinal', 'Categórica nominal', 'Numérica', 'Numérica', 'Numérica', 'Numérica', 'Identificador']);
  assert.deepEqual(c.map(v => v.type), ['Entero', 'Entero', 'Entero', 'Texto', 'Entero', 'Decimal', 'Entero', 'Entero', 'Texto']);
  assert.equal(c[8]?.suggestion.tentative, true);
  assert.deepEqual(numericColumns(c, {}), [4, 5, 6, 7]);
});
test('nombres de ID respetan tokens y convenciones, sin coincidencias parciales', () => {
  for (const name of ['id', 'identifier', 'uuid', 'passenger_id', 'PassengerId', 'CustomerID', 'user.identifier', 'order-guid']) assert.equal(infer(name, ['8', '9']).role, 'Identificador', name);
  for (const name of ['humidity', 'paid', 'identity_score', 'valid', 'identifierlength', 'uuidcount']) {
    assert.equal(infer(name, ['8', '9']).role, 'Numérica', name);
  }
});
test('binarios 0/1 y booleanos son nominales, no ordinales ni magnitudes', () => {
  assert.equal(infer('result', ['0', '1', '', '1']).role, 'Categórica nominal');
  assert.equal(infer('flag', ['0.0', '1e0']).role, 'Categórica nominal');
  assert.equal(infer('active', ['true', 'false']).type, 'Booleano');
  assert.equal(infer('active', ['true', 'false']).role, 'Categórica nominal');
  assert.equal(infer('constant', ['0', '0']).role, 'Numérica');
});
test('pocos enteros no implican ordinalidad; niveles requieren evidencia', () => {
  for (const name of ['children', 'visits', 'SibSp', 'Parch', 'x']) assert.equal(infer(name, ['0', '2', '3', '2']).role, 'Numérica');
  for (const name of ['service_tier', 'Priority', 'education_level', 'travel_class', 'qclass']) assert.equal(infer(name, ['1', '2', '3', '2']).role, 'Categórica ordinal');
  assert.equal(infer('class', ['cat', 'dog']).role, 'Categórica nominal');
  assert.equal(infer('level', ['10.5', '20.2']).role, 'Numérica');
  assert.equal(infer('priority', ['low', 'medium', 'high']).role, 'Categórica ordinal');
  assert.equal(infer('group_code', ['1', '2', '3']).role, 'Categórica nominal');
});
test('referencias compartidas requieren cardinalidad; texto único por sí solo no es ID', () => {
  assert.equal(infer('booking_reference', ['A', 'B', 'C', 'D', 'D']).role, 'Identificador');
  assert.equal(infer('ticket', ['A', 'A', 'A', 'B', 'B', 'B']).role, 'Categórica nominal');
  assert.equal(infer('comment', ['A', 'B', 'C', 'D', 'E']).role, 'Categórica nominal');
  assert.equal(infer('x', ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002']).role, 'Identificador');
});
test('secuencia consecutiva requiere muestra suficiente, unicidad y orden observado', () => {
  const sequence = Array.from({ length: 25 }, (_, i) => String(i + 1));
  assert.equal(infer('row', sequence).role, 'Identificador');
  assert.equal(infer('row', sequence.slice(0, 5)).role, 'Numérica');
  assert.equal(infer('row', [...sequence].reverse()).role, 'Numérica');
  assert.equal(infer('row', [...sequence, '1']).role, 'Numérica');
  assert.equal(infer('age', sequence).role, 'Numérica');
});
test('almacenamiento es independiente de rol; metadatos pueden declarar orden', () => {
  assert.equal(inferStorage(['1', '-2']), 'Entero');
  assert.equal(inferStorage(['1.0', '2e0']), 'Decimal');
  assert.equal(inferStorage(['2026-02-28']), 'Fecha');
  assert.equal(inferStorage(['2026-02-30']), 'Texto');
  assert.equal(infer('empty', ['', ' ']).suggestion.tentative, true);
  assert.equal(inferRole('size', ['S', 'M'], 'Texto', { orderedValues: ['S', 'M', 'L'] }).role, 'Categórica ordinal');
  assert.equal(inferRole('size', ['unknown'], 'Texto', { orderedValues: ['S', 'M', 'L'] }).role, 'Categórica nominal');
});
test('cambiar rol restablece el análisis por defecto, con inclusión explícita opcional', () => {
  const columns = profile(['amount'], [['2'], ['3'], ['4']]);
  assert.deepEqual(numericColumns(columns, {}), [0]);
  const nominal = columns.map(c => ({ ...c, role: 'Categórica nominal' as const }));
  assert.deepEqual(numericColumns(nominal, {}), []);
  assert.deepEqual(numericColumns(nominal, { 0: true }), [0]);
});
