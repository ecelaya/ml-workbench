// Optional end-to-end HTTP check against a running local API. No dataset/model
// is persisted by the API. Requires Node 22+ and the existing tsx dev dependency.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SAMPLE_DATASETS } from '../src/data/sampleDatasets';
import { parseCsv } from '../src/lib/csv';
import { defaultModel, defaultPredictors, runExperiment } from '../src/lib/experiments';
import { validateSampleDataset } from '../src/lib/sampleDatasets';
const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('Uso: tsx frontend/scripts/validate-ml-api.ts URL_API');
Object.defineProperty(globalThis, 'FileReader', { value: class {
  onload: ((event: { target: { result: string } }) => void) | null = null;
  readAsText(blob: Blob) { void blob.text().then(result => this.onload?.({ target: { result } })); }
} });
for (const sample of SAMPLE_DATASETS) {
  const file = new File([new Uint8Array(readFileSync(new URL(`../public/datasets/${sample.filename}`, import.meta.url)))], sample.filename);
  const dataset = await parseCsv(file, undefined, { missingValueTokens: sample.missingValueTokens });
  validateSampleDataset(dataset, sample);
  const task = sample.problem === 'Regresión' ? 'regression' : 'classification';
  const result = await runExperiment(baseUrl, dataset, {
    target: sample.target, predictors: defaultPredictors(dataset, sample.target, sample.suggestedExcludedPredictors),
    roles: Object.fromEntries(dataset.columns.map(c => [c.name, c.role])), task,
    model: defaultModel(task), test_size: .2, seed: 42, stratify: true,
    preprocessing: { numeric_imputation: 'median', scaling: 'standard', categorical_imputation: 'most_frequent' },
  }, AbortSignal.timeout(120_000));
  assert.equal(result.evaluation_scope, 'test');
  assert.equal(result.sizes.received, sample.rows);
  assert.equal(result.sizes.train + result.sizes.test, result.sizes.usable);
  assert.equal(result.sizes.usable + result.sizes.excluded_target, result.sizes.received);
  assert.ok(Object.values(result.metrics).every(v => v === null || Number.isFinite(v)));
  console.log(`${sample.name}: HTTP correcto, ${result.sizes.received} filas completas, train=${result.sizes.train}, test=${result.sizes.test}, ${result.task_type}.`);
}
