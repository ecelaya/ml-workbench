import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComparisonModel, ComparisonResult, MetricAggregate } from '../types/comparison';
import { contextualObservation, directionalGap, generalizationDomain, generalizationRows } from './generalization';
import { Generalization } from '../components/models/Generalization';

function candidate(metric: string, train: (number | null)[], validation: (number | null)[]): ComparisonModel {
  const stat = (values: (number | null)[]): MetricAggregate => {
    const valid = values.filter((v): v is number => v !== null);
    return { mean: valid.length ? valid.reduce((a,b) => a+b, 0) / valid.length : null, std: valid.length >= 2 ? 0 : null, valid_folds: valid.length, values };
  };
  return { model: 'logistic_regression', metrics: { [metric]: stat(validation) }, train_metrics: { [metric]: stat(train) }, training_seconds: 1,
    folds: train.map((value, i) => ({ fold: i+1, train_metrics: { [metric]: value }, metrics: { [metric]: validation[i]! }, train_n: 80, validation_n: 40, training_seconds: 1, warnings: [], train_undefined_reasons: value === null ? { [metric]: 'No definido en train' } : {}, undefined_reasons: validation[i] === null ? { [metric]: 'No definido en validación' } : {} })) };
}

for (const [metric, train, validation] of [
  ['roc_auc', [.96,.97,.95], [.84,.85,.83]],
  ['f1_macro', [.98,.97,.99], [.92,.93,.94]],
  ['rmse', [2,3,4], [4,5,6]],
  ['r2', [-.1,.2,.3], [-.5,.1,.2]],
] as const) {
  test(`${metric}: eje adaptado incluye todos los puntos y la brecha conserva dirección`, () => {
    const row = candidate(metric, [...train], [...validation]);
    const points = generalizationRows(row, metric);
    const domain = generalizationDomain(metric, points);
    for (const value of [...train, ...validation]) assert.ok(domain[0] <= value && domain[1] >= value);
    if (metric === 'roc_auc' || metric === 'f1_macro') assert.ok(domain[0] >= 0 && domain[1] <= 1 && domain[0] > 0);
    if (metric === 'rmse') assert.ok(domain[1] > 1);
    if (metric === 'r2') assert.ok(domain[0] < 0);
    assert.ok(directionalGap(metric, train[0], validation[0])! > 0);
    assert.match(contextualObservation(metric, row), /todos los folds/);
    assert.deepEqual(points.map(p => [p.trainN,p.validationN]), [[80,40],[80,40],[80,40]]);
  });
}

test('constantes y extremos 0/1 tienen escala válida sin puntos añadidos', () => {
  for (const value of [0, .5, 1]) {
    const points = generalizationRows(candidate('f1_macro', [value,value,value], [value,value,value]), 'f1_macro');
    const [low, high] = generalizationDomain('f1_macro', points);
    assert.ok(low < high && low <= value && high >= value && low >= 0 && high <= 1);
    assert.equal(points.length, 3);
    assert.deepEqual(generalizationDomain('f1_macro', points, false), [0,1]);
  }
});

test('folds indefinidos conservan null y no fundamentan un diagnóstico global', () => {
  const row = candidate('roc_auc', [.9,null,.95], [.8,.85,null]);
  const points = generalizationRows(row, 'roc_auc');
  assert.equal(points[1]!.train, null);
  assert.equal(points[2]!.validation, null);
  assert.equal(directionalGap('roc_auc', points[1]!.train, points[1]!.validation), null);
  assert.match(contextualObservation('roc_auc', row), /incompletos/);
  assert.deepEqual(generalizationDomain('roc_auc', []), [0,1]);
});

test('interpretación distingue deterioro, mejor validación y direcciones mixtas sin umbrales', () => {
  assert.equal(directionalGap('rmse', 3, 5), 2);
  assert.equal(directionalGap('roc_auc', .7, .9), -.20000000000000007);
  assert.match(contextualObservation('rmse', candidate('rmse', [5,5,5], [2,2,2])), /no supera/);
  assert.match(contextualObservation('f1_macro', candidate('f1_macro', [.8,.8,.8], [.7,.9,.8])), /1 de 3/);
  assert.match(contextualObservation('r2', candidate('r2', [.8,.8,.8], [.8,.8,.8])), /coinciden/);
});

test('tarjetas, tabla y explicación se generan de datos reales recibidos sin peticiones nuevas', () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('No debe entrenar'); };
  const model = candidate('roc_auc', [.96,.97,.95], [.84,.85,.83]);
  const cv = { models: [model], folds: 3, metric_names: ['roc_auc'], std_convention: 'DE muestral descriptiva' } as ComparisonResult;
  try {
    const before = JSON.stringify(cv);
    const html = renderToStaticMarkup(createElement(Generalization, { cv }));
    assert.match(html, /Media de train/);
    assert.match(html, /Media de validación/);
    assert.match(html, /DE de validación/);
    assert.match(html, /0,9600/);
    assert.match(html, /0,8400/);
    assert.match(html, /0,1200/);
    assert.match(html, /todos los folds/);
    assert.match(html, /no comienza en cero/);
    assert.match(html, /80 \/ 40/);
    assert.equal(JSON.stringify(cv), before);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});
