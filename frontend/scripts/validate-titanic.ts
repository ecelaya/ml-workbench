// Optional integration validation; CSV stays local and is not bundled in the app.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { profile } from '../src/lib/csv';
import { completePairs, contingency, quality, visualization } from '../src/lib/eda';
import { describe, numericValue } from '../src/lib/statistics';

const path = process.argv[2];
if (!path) throw new Error('Indica la ruta local del CSV Titanic train (891 filas).');
const parsed = Papa.parse<string[]>(readFileSync(path, 'utf8'), { skipEmptyLines: 'greedy' });
assert.deepEqual(parsed.errors, []);
const [headers, ...rows] = parsed.data;
assert.ok(headers); assert.equal(rows.length, 891);
const columns = profile(headers, rows);
const get = (name: string) => { const index = headers.indexOf(name); assert.ok(index >= 0); return { column: columns[index]!, values: rows.map(row => row[index] ?? '') }; };
for (const [name, role, plot] of [
  ['PassengerId', 'Identificador', 'identifier'], ['Survived', 'Categórica nominal', 'category-bars'],
  ['Pclass', 'Categórica ordinal', 'ordered-bars'], ['Sex', 'Categórica nominal', 'category-bars'],
  ['Embarked', 'Categórica nominal', 'category-bars'], ['Age', 'Numérica', 'histogram'],
  ['Fare', 'Numérica', 'histogram'], ['SibSp', 'Numérica', 'discrete-bars'],
  ['Parch', 'Numérica', 'discrete-bars'], ['Ticket', 'Identificador', 'identifier'],
]) {
  const { column, values } = get(name!);
  assert.equal(column.role, role, name); assert.equal(visualization(column.role, values), plot, name);
}
const age = describe(get('Age').values.map(numericValue)), fare = describe(get('Fare').values.map(numericValue));
assert.equal(age.n, 714); assert.equal(age.excluded, 177); assert.ok(Math.abs(age.mean! - 29.69911764705882) < 1e-10);
assert.equal(fare.n, 891); assert.ok(Math.abs(fare.mean! - 32.204207968574636) < 1e-10);
assert.equal(completePairs(get('Age').values, get('Fare').values).length, 714);
const ct = contingency(get('Sex').values, get('Survived').values);
assert.equal(ct.n, 891); assert.equal(ct.counts.get('female')?.get('1'), 233); assert.equal(ct.counts.get('male')?.get('1'), 109);
const report = quality(rows, columns);
assert.equal(report.duplicates, 0); assert.equal(get('PassengerId').column.unique, 891);
assert.equal(get('Embarked').column.missing, 2); assert.equal(get('Ticket').column.unique, 681);
console.log('Titanic completo validado: 891 filas; roles, gráficos, descriptivos, pares completos, contingencia y calidad correctos.');
