// Optional end-to-end HTTP check against a running local API. No dataset/model
// is persisted by the API. Requires Node 22+ and the existing tsx dev dependency.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SAMPLE_DATASETS } from '../src/data/sampleDatasets';
import { parseCsv } from '../src/lib/csv';
import { defaultModel, defaultPredictors, runExperiment } from '../src/lib/experiments';
import { visibleMetrics, heatmapCells, paddedDomain } from '../src/lib/modelResults';
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
    positive_class: task === 'classification' && dataset.columns.find(c => c.name === sample.target)?.unique === 2 ? [...new Set(dataset.rows.map(row => row[dataset.headers.indexOf(sample.target)]!))].sort()[0] : undefined, target_units: sample.targetUnits,
    preprocessing: { numeric_imputation: 'median', scaling: 'standard', categorical_imputation: 'most_frequent' },
  }, AbortSignal.timeout(120_000));
  assert.equal(result.api_version, '0.3.1');
  assert.equal(result.evaluation_scope, 'test');
  assert.equal(result.pipeline_summary.feature_count, result.pipeline_summary.feature_names.length);
  assert.equal(result.pipeline_summary.excluded_target, result.sizes.excluded_target);
  assert.ok(visibleMetrics(result).every(metric => metric.value === result.metrics[metric.name]));
  if (result.confusion_matrix) {
    assert.equal(result.confusion_matrix.flat().reduce((sum, n) => sum + n, 0), result.sizes.test);
    for (const row of heatmapCells(result, true)) for (const cell of row) if (cell.support) assert.ok(Math.abs(cell.value! - cell.count / cell.support) < 1e-12);
  } else {
    const domain = paddedDomain(result.regression_bounds);
    for (const point of result.predictions) { assert.ok(point.actual >= domain[0] && point.actual <= domain[1]); assert.ok(point.predicted >= domain[0] && point.predicted <= domain[1]); assert.ok(Math.abs(point.residual - (point.actual - point.predicted)) < 1e-12); }
  }
  assert.equal(result.sizes.received, sample.rows);
  assert.equal(result.sizes.train + result.sizes.test, result.sizes.usable);
  assert.equal(result.sizes.usable + result.sizes.excluded_target, result.sizes.received);
  assert.ok(Object.values(result.metrics).every(v => v === null || Number.isFinite(v)));
  console.log(`${sample.name}: HTTP correcto, ${result.sizes.received} filas completas, train=${result.sizes.train}, test=${result.sizes.test}, ${result.task_type}.`);
}
