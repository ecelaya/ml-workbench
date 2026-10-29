import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_EVALUATION_METHOD, evaluationSignature, type EvaluationMethod } from './generalization';
import { EvaluationMethodSelector } from '../components/models/EvaluationMethodSelector';
import { ModelCVResults } from '../components/models/ModelCVResults';
import type { ComparisonResult } from '../types/comparison';

function selected(method: EvaluationMethod) {
  const html = renderToStaticMarkup(createElement(EvaluationMethodSelector, { value: method, onChange: () => {} }));
  return { html, value: html.match(/<option value="([^"]+)" selected=""/u)?.[1] };
}
test('nuevo dataset inicia CV y el selector mantiene disponible train/test rápido', () => {
  const initial = selected(DEFAULT_EVALUATION_METHOD);
  assert.equal(initial.value, 'cv');
  assert.match(initial.html, /Validación cruzada sobre train \(recomendado\)/);
  assert.match(initial.html, /Train\/test simple \(rápido\)/);
  assert.match(initial.html, /tres folds/);
  assert.match(initial.html, /Test queda reservado/);
});
test('elección manual simple se conserva en un selector controlado; cambiar configuración invalida la firma', () => {
  const method: EvaluationMethod = 'simple';
  assert.equal(selected(method).value, 'simple');
  const initial = evaluationSignature({ model: 'linear_regression', seed: 42 }, method);
  const updated = evaluationSignature({ model: 'linear_regression', seed: 10 }, method);
  assert.notEqual(initial, updated);
  assert.equal(selected(method).value, 'simple');
  assert.equal(selected(DEFAULT_EVALUATION_METHOD).value, 'cv');
});
test('renderizar los resultados CV no evalúa test; el botón exige confirmación y se deshabilita tras el intento', () => {
  const cv = { models: [], folds: 3, metric_names: [], duration_seconds: 1, expires_at: 0,
    splitter: 'StratifiedKFold', seed: 42, sizes: { train: 120, test: 30 }, warnings: [] } as unknown as ComparisonResult;
  let confirmations = 0;
  const props = { result: cv, busy: false, attempted: false, onEvaluate: () => { confirmations++; } };
  const html = renderToStaticMarkup(createElement(ModelCVResults, props));
  assert.equal(confirmations, 0);
  assert.match(html, /Reajustar con todo train y evaluar una vez en test/);
  const attempted = renderToStaticMarkup(createElement(ModelCVResults, { ...props, attempted: true }));
  assert.match(attempted, /<button[^>]*disabled=""[^>]*>Reajustar/u);
  assert.equal(confirmations, 0);
});
