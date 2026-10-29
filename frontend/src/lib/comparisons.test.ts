import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import type { Dataset } from '../types/dataset';
import type { ComparisonConfig } from '../types/comparison';
import { profile } from './csv';
import { comparisonMetrics, evaluateComparison, minimizeMetric, runComparison, validateComparison } from './comparisons';

const rows = Array.from({ length: 30 }, (_, i) => [String(i), String(i % 2)]);
const dataset: Dataset = { name: 'fixture.csv', bytes: 200, headers: ['x', 'target'], rows, columns: profile(['x', 'target'], rows), missing: 0, delimiter: ',' };
const config: ComparisonConfig = { experiment: { target: 'target', predictors: ['x'], roles: { x: 'Numérica', target: 'Categórica nominal' }, task: 'classification', model: 'logistic_regression', test_size: .2, seed: 42, stratify: true, positive_class: '1', preprocessing: { numeric_imputation: 'median', categorical_imputation: 'most_frequent', scaling: 'standard' } }, models: ['logistic_regression', 'decision_tree_classifier'], folds: 3, primary_metric: 'roc_auc' };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('métricas y dirección de selección compatibles con binaria, multiclase y regresión', () => {
  assert.equal(comparisonMetrics('classification', true)[0], 'roc_auc');
  assert.equal(comparisonMetrics('classification', false)[0], 'f1_macro');
  assert.equal(comparisonMetrics('regression', false)[0], 'rmse');
  assert.equal(minimizeMetric('mae'), true);
  assert.equal(minimizeMetric('rmse'), true);
  assert.equal(minimizeMetric('r2'), false);
  assert.deepEqual(validateComparison(dataset, config), []);
  assert.ok(validateComparison(dataset, { ...config, models: ['logistic_regression'] }).length);
  assert.ok(validateComparison(dataset, { ...config, models: ['logistic_regression', 'linear_regression'] }).length);
  assert.ok(validateComparison(dataset, { ...config, primary_metric: 'rmse' }).length);
});

test('CV usa el CSV completo y configuración compatible; no evalúa test automáticamente', async () => {
  let count = 0;
  globalThis.fetch = async (url, options) => {
    count++;
    assert.equal(url, 'https://api.example/api/comparisons');
    assert.ok(options?.body instanceof FormData);
    const form = options.body;
    const csv = form.get('file'); assert.ok(csv instanceof Blob);
    assert.deepEqual(Papa.parse(await csv.text()).data, [dataset.headers, ...dataset.rows]);
    assert.deepEqual(JSON.parse(String(form.get('config'))), config);
    return new Response(JSON.stringify({ api_version: '0.4.0', evaluation_scope: 'cross_validation', session_token: 'token', models: [] }));
  };
  const result = await runComparison('https://api.example/', dataset, config, new AbortController().signal);
  assert.equal(result.evaluation_scope, 'cross_validation');
  assert.equal(count, 1);
});

test('evaluación final envía solo token y candidato, sin CSV ni parámetros sustituibles', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example/api/comparisons/evaluate');
    assert.deepEqual(JSON.parse(String(options?.body)), { token: 'secret', model: 'logistic_regression' });
    return new Response(JSON.stringify({ evaluation_scope: 'test', metrics: {} }));
  };
  await evaluateComparison('https://api.example', 'secret', 'logistic_regression', new AbortController().signal);
});

test('caducidad, consumo previo de test y timeout conservan mensajes del servidor', async () => {
  for (const [status, detail] of [[410, 'La sesión ha caducado'], [409, 'El test ya se consultó'], [504, 'Tiempo máximo superado']] as const) {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail }), { status });
    await assert.rejects(evaluateComparison('https://api.example', 'secret', 'logistic_regression', new AbortController().signal), new RegExp(detail));
  }
});
