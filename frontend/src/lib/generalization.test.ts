import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Dataset } from '../types/dataset';
import type { ExperimentConfig, ExperimentResult } from '../types/experiment';
import { evaluationSignature, metricGap, performanceObservation } from './generalization';
import { runModelCV } from './comparisons';
import { profile } from './csv';
import { Generalization } from '../components/models/Generalization';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test('diferencias absolutas y observaciones respetan dirección, nulos y ausencia de umbrales universales', () => {
  assert.equal(metricGap(.9, .7), .20000000000000007);
  assert.equal(metricGap(2, 5), 3);
  assert.equal(metricGap(null, .5), null);
  assert.equal(metricGap(NaN, .5), null);
  assert.match(performanceObservation('rmse', 2, 5), /mejor en train/);
  assert.match(performanceObservation('f1_macro', .8, .4), /mejor en train/);
  assert.match(performanceObservation('r2', .2, .8), /mejor fuera/);
  assert.match(performanceObservation('accuracy', .8, .8), /no demuestra/);
});

test('método y cambios de configuración invalidan la firma; seleccionar una métrica gráfica no la altera', () => {
  const config = { model: 'linear_regression', positive_class: '1', seed: 42, preprocessing: { scaling: 'standard' } };
  const initial = evaluationSignature(config, 'simple');
  assert.notEqual(initial, evaluationSignature(config, 'cv'));
  assert.notEqual(initial, evaluationSignature({ ...config, seed: 5 }, 'simple'));
  assert.notEqual(initial, evaluationSignature({ ...config, positive_class: '0' }, 'simple'));
  assert.notEqual(initial, evaluationSignature({ ...config, preprocessing: { scaling: 'none' } }, 'simple'));
  assert.equal(initial, evaluationSignature(config, 'simple'));
});

test('CV opcional envía un solo modelo, tres folds y return_train_score sin consultar test', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => [String(i), String(i % 2)]);
  const dataset: Dataset = { name: 'own.csv', headers: ['x', 'target'], rows, columns: profile(['x', 'target'], rows), delimiter: ',', bytes: 100, missing: 0 };
  const config: ExperimentConfig = { target: 'target', predictors: ['x'], roles: { x: 'Numérica', target: 'Categórica nominal' }, task: 'classification', model: 'logistic_regression', test_size: .2, seed: 42, stratify: true, positive_class: '1', preprocessing: { numeric_imputation: 'median', categorical_imputation: 'most_frequent', scaling: 'standard' } };
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, 'https://api.example/api/experiments/cv');
    assert.ok(options?.body instanceof FormData);
    const settings = JSON.parse(String(options.body.get('config')));
    assert.equal(settings.return_train_score, true);
    assert.deepEqual(settings.models, ['logistic_regression']);
    assert.equal(settings.folds, 3);
    assert.deepEqual(settings.experiment, config);
    return new Response(JSON.stringify({ evaluation_scope: 'cross_validation', api_version: '0.4.0', models: [], session_token: 'fixture' }));
  };
  await runModelCV('https://api.example', dataset, config, new AbortController().signal);
  assert.equal(requests, 1);
});

test('errores y timeout conservan el mensaje, sin fabricar puntuaciones', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => [String(i), String(i)]);
  const dataset: Dataset = { name: 'own.csv', headers: ['x','y'], rows, columns: profile(['x','y'], rows), delimiter: ',', bytes: 100, missing: 0 };
  const config: ExperimentConfig = { target: 'y', predictors: ['x'], roles: { x: 'Numérica', y: 'Numérica' }, task: 'regression', model: 'linear_regression', test_size: .2, seed: 42, stratify: false, preprocessing: { numeric_imputation: 'median', categorical_imputation: 'most_frequent', scaling: 'standard' } };
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Tiempo máximo superado' }), { status: 504 });
  await assert.rejects(runModelCV('https://api.example', dataset, config, new AbortController().signal), /Tiempo máximo/);
});

test('tabla simple muestra train/test, brecha absoluta y aviso de optimismo', () => {
  const result = { metrics: { rmse: 5 }, train_metrics: { rmse: 2 }, sizes: { train: 80, test: 20 } } as ExperimentResult;
  const html = renderToStaticMarkup(createElement(Generalization, { result }));
  assert.match(html, /Generalización/);
  assert.match(html, /optimistas/);
  assert.match(html, /Train \(N=80\)/);
  assert.match(html, /Test \(N=20\)/);
  assert.match(html, /3,0000/);
});
