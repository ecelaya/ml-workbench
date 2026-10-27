import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SAMPLE_DATASETS, sampleDatasetUrl } from '../data/sampleDatasets';
import { sampleDatasetFile, validateSampleDataset } from './sampleDatasets';
import { MAX_BYTES, MAX_COLUMNS, MAX_ROWS, parseCsv } from './csv';
import { describe, frequencies, numericValue } from './statistics';

// Only the browser FileReader transport is adapted for Node. parseCsv, Papa's
// file/chunk path, validation, profiling and statistics are the production code.
const originalReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class {
  onload: ((event: { target: { result: string } }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  readAsText(blob: Blob) { void blob.text().then(result => this.onload?.({ target: { result } }), error => this.onerror?.(error)); }
} });
after(() => { if (originalReader) Object.defineProperty(globalThis, 'FileReader', originalReader); else Reflect.deleteProperty(globalThis, 'FileReader'); });
const contents = (filename: string) => readFileSync(new URL(`../../public/datasets/${filename}`, import.meta.url));

for (const sample of SAMPLE_DATASETS) {
  test(`${sample.name}: asset íntegro, mismo parser File y estadísticas sobre todas las filas`, async () => {
    const buffer = contents(sample.filename);
    assert.equal(buffer.byteLength, sample.bytes);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), sample.sha256);
    assert.ok(buffer.byteLength <= MAX_BYTES && sample.rows <= MAX_ROWS && sample.columns <= MAX_COLUMNS);
    let requested = '';
    const fetcher: typeof fetch = async input => { requested = String(input); return new Response(new Uint8Array(buffer), { headers: { 'content-type': 'text/csv' } }); };
    const file = await sampleDatasetFile(sample, '/workbench/', fetcher);
    assert.equal(requested, `/workbench/datasets/${sample.filename}`);
    assert.equal(file.name, sample.filename);
    let progressed = 0;
    const dataset = await parseCsv(file, count => { progressed = count; }, { missingValueTokens: sample.missingValueTokens });
    validateSampleDataset(dataset, sample);
    assert.equal(dataset.rows.length, sample.rows); assert.equal(dataset.headers.length, sample.columns);
    assert.equal(progressed, sample.rows);
    assert.ok(dataset.rows.every(row => row.length === sample.columns));
    assert.equal(sample.predictors + sample.identifiers + 1, sample.columns);
    const targetIndex = dataset.headers.indexOf(sample.target);
    assert.ok(targetIndex >= 0);
    const targets = dataset.rows.map(row => row[targetIndex]!);
    const classes = frequencies(targets);
    assert.equal(classes.n, sample.rows);
    assert.equal(dataset.columns[targetIndex]?.missing, 0);
    if (sample.id === 'california-housing') {
      const stats = describe(targets.map(numericValue));
      assert.equal(stats.n, 20640); assert.ok(Math.abs(stats.mean! - 2.068558169089147) < 1e-10);
      assert.equal(dataset.missing, 0);
    } else {
      const counts = Object.fromEntries(classes.categories.map(c => [c.name, c.count]));
      const expected = { titanic: { '0': 809, '1': 500 }, iris: { 'Iris-setosa': 50, 'Iris-versicolor': 50, 'Iris-virginica': 50 }, wine: { '1': 59, '2': 71, '3': 48 }, 'breast-cancer': { B: 357, M: 212 }, 'palmer-penguins': { Adelie: 152, Chinstrap: 68, Gentoo: 124 } };
      assert.deepEqual(counts, expected[sample.id as keyof typeof expected]);
      if (sample.id === 'titanic') {
        assert.equal(dataset.missing, 3855);
        const age = dataset.headers.indexOf('age');
        assert.equal(describe(dataset.rows.map(row => numericValue(row[age]))).n, 1046);
      } else if (sample.id === 'palmer-penguins') {
        assert.equal(dataset.missing, 19);
        assert.deepEqual(dataset.headers, ['species', 'island', 'bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'sex', 'year']);
        assert.deepEqual(dataset.columns.map(c => c.missing), [0, 0, 2, 2, 2, 2, 11, 0]);
        assert.equal(describe(dataset.rows.map(row => numericValue(row[5]))).n, 342);
      } else assert.equal(dataset.missing, 0);
    }
    // The last record is available for analysis/export, not just the first page.
    assert.ok(dataset.rows[sample.rows - 1]);
  });
}
test('rutas estáticas admiten Vercel, desarrollo y un base path', () => {
  const sample = SAMPLE_DATASETS.find(s => s.id === 'titanic')!;
  assert.equal(sampleDatasetUrl(sample, '/'), '/datasets/titanic.csv');
  assert.equal(sampleDatasetUrl(sample, '/app'), '/app/datasets/titanic.csv');
  assert.equal(sampleDatasetUrl(sample, '/app/'), '/app/datasets/titanic.csv');
  assert.equal(new Set(SAMPLE_DATASETS.map(s => s.id)).size, 6);
  assert.equal(new Set(SAMPLE_DATASETS.map(s => s.filename)).size, 6);
});
test('errores HTTP, HTML y archivos truncados no llegan al análisis', async () => {
  const sample = SAMPLE_DATASETS[0]!;
  await assert.rejects(sampleDatasetFile(sample, '/', async () => new Response('', { status: 404 })), /HTTP 404/);
  await assert.rejects(sampleDatasetFile(sample, '/', async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } })), /No se encontró/);
  await assert.rejects(sampleDatasetFile(sample, '/', async () => new Response('partial')), /no coincide/);
  await assert.rejects(sampleDatasetFile(sample, '/', async () => { throw new Error('Sin conexión'); }), /Sin conexión/);
});
test('metadatos incompatibles se rechazan después del mismo parser', async () => {
  const sample = SAMPLE_DATASETS.find(s => s.id === 'iris')!;
  const file = new File([new Uint8Array(contents(sample.filename))], sample.filename);
  const dataset = await parseCsv(file);
  assert.throws(() => validateSampleDataset(dataset, { ...sample, rows: 99 }), /no coinciden/);
  assert.throws(() => validateSampleDataset(dataset, { ...sample, columns: 99 }), /no coinciden/);
  assert.throws(() => validateSampleDataset(dataset, { ...sample, target: 'unknown' }), /no coinciden/);
});

test('Penguins conserva cada ausencia original; NA solo se interpreta con configuración explícita', async () => {
  const sample = SAMPLE_DATASETS.find(s => s.id === 'palmer-penguins')!;
  const buffer = contents(sample.filename);
  const file = new File([new Uint8Array(buffer)], sample.filename);
  const unconfigured = await parseCsv(file);
  const configured = await parseCsv(file, undefined, { missingValueTokens: sample.missingValueTokens });
  assert.equal(unconfigured.missing, 0);
  assert.equal(configured.missing, 19);
  let markers = 0;
  for (let i = 0; i < unconfigured.rows.length; i++) {
    for (let j = 0; j < unconfigured.headers.length; j++) {
      const value = unconfigured.rows[i]![j]!;
      if (value === 'NA') markers++;
      assert.equal(configured.rows[i]![j], value === 'NA' ? '' : value);
    }
  }
  assert.equal(markers, 19);
  assert.ok(buffer.toString('utf8').includes('Adelie,Torgersen,NA,NA,NA,NA,NA,2007'));
  assert.equal(configured.columns[2]?.role, 'Numérica');
  assert.equal(configured.columns[2]?.type, 'Decimal');
  // A subsequent personal file uses defaults again; marker settings never leak.
  const personal = await parseCsv(new File(['a,b,c\nNA,NULL,N/A'], 'personal.csv'));
  assert.deepEqual(personal.rows, [['NA', 'NULL', 'N/A']]);
  assert.equal(personal.missing, 0);
});
