// Run with an existing directory of source downloads. Never fetches during build.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
const input = resolve(process.argv[2] ?? 'node_modules/.cache/sample-datasets');
const output = fileURLToPath(new URL('../public/datasets/', import.meta.url));
mkdirSync(output, { recursive: true });
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
function read(path, expected) {
  const buffer = readFileSync(resolve(input, path));
  assert.equal(hash(buffer), expected, `Source changed: ${path}`);
  return buffer.toString('utf8');
}
function parse(text) {
  const parsed = Papa.parse(text, { skipEmptyLines: 'greedy' });
  assert.deepEqual(parsed.errors, []);
  return parsed.data;
}
function save(file, headers, rows, count) {
  assert.equal(rows.length, count);
  assert.ok(rows.every(row => row.length === headers.length));
  writeFileSync(resolve(output, file), Papa.unparse({ fields: headers, data: rows }, { newline: '\n' }) + '\n');
}
const iris = read('iris/iris.data', '6f608b71a7317216319b4d27b4d9bc84e6abd734eda7872b71a458569e2656c0');
save('iris.csv', ['sepal_length_cm', 'sepal_width_cm', 'petal_length_cm', 'petal_width_cm', 'species'], parse(iris), 150);
const wine = read('wine/wine.data', '6be6b1203f3d51df0b553a70e57b8a723cd405683958204f96d23d7cd6aea659');
save('wine.csv', ['cultivar_type', 'alcohol', 'malic_acid', 'ash', 'alcalinity_of_ash', 'magnesium', 'total_phenols', 'flavanoids', 'nonflavanoid_phenols', 'proanthocyanins', 'color_intensity', 'hue', 'od280_od315', 'proline'], parse(wine), 178);
const breast = read('breast-cancer/wdbc.data', 'd606af411f3e5be8a317a5a8b652b425aaf0ff38ca683d5327ffff94c3695f4a');
const measures = ['radius', 'texture', 'perimeter', 'area', 'smoothness', 'compactness', 'concavity', 'concave_points', 'symmetry', 'fractal_dimension'];
save('breast-cancer-wisconsin-diagnostic.csv', ['id', 'diagnosis', ...['mean', 'se', 'worst'].flatMap(suffix => measures.map(name => `${name}_${suffix}`))], parse(breast), 569);
const titanic = read('titanic.arff', 'c56e3785c96cd8aceac85f11bff21c2bf72841426f50903a6f27be8f334a7d03');
const attributes = [...titanic.matchAll(/^@attribute '([^']+)'/gm)].map(match => match[1]);
// This specific ARFF data section uses standard CSV quoting. Preserve text and
// numeric representations; only the ARFF missing marker ? becomes an empty cell.
save('titanic.csv', attributes, parse(titanic.split(/@data\s*\r?\n/i)[1]).map(row => row.map(value => value === '?' ? '' : value)), 1309);
read('california_housing.csv', '94ef369b909f5c725340b512b7c9a05c1550a554b6592d29303990e3ba521a1f');
copyFileSync(resolve(input, 'california_housing.csv'), resolve(output, 'california-housing.csv'));
read('penguins.csv', 'f204db2c753b0937caac3cb35258562c14f073e4bbc76be24b4c51ce22767a93');
copyFileSync(resolve(input, 'penguins.csv'), resolve(output, 'penguins.csv'));
for (const file of ['titanic.csv', 'iris.csv', 'california-housing.csv', 'wine.csv', 'breast-cancer-wisconsin-diagnostic.csv', 'penguins.csv']) {
  const buffer = readFileSync(resolve(output, file));
  console.log(`${file}  ${buffer.length} bytes  SHA-256 ${hash(buffer)}`);
}
