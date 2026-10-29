import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ComparisonResult } from '../types/comparison';
import { availableChartMetrics, boundedMetric, chartDomain, chartRows, exactMetric } from './comparisonCharts';

function fixture(name: string): ComparisonResult {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/comparison-${name}.json`, import.meta.url), 'utf8')) as ComparisonResult;
}

for (const name of ['iris', 'titanic', 'california-housing']) {
  test(`${name}: métricas disponibles y representaciones conservan resultados y orden de CV`, () => {
    const result = fixture(name);
    const original = JSON.stringify(result);
    const fetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('No se debe entrenar desde la visualización'); };
    try {
      for (const metric of availableChartMetrics(result)) {
        const rows = chartRows(result, metric);
        assert.deepEqual(rows.map(row => row.model), result.models.map(model => model.model));
        for (const [i, row] of rows.entries()) {
          assert.equal(row.mean, result.models[i]!.metrics[metric]!.mean);
          assert.equal(row.std, result.models[i]!.metrics[metric]!.std);
          assert.deepEqual(row.values.map(fold => fold.value), result.models[i]!.metrics[metric]!.values);
          if (boundedMetric(metric)) {
            assert.deepEqual(chartDomain(rows, metric, 'bars'), [0, 1]);
            assert.ok((row.lower ?? 0) >= 0 && (row.upper ?? 1) <= 1);
          } else if (metric === 'mae' || metric === 'rmse') assert.equal(chartDomain(rows, metric, 'bars')[0], 0);
          const [low, high] = chartDomain(rows, metric, 'points');
          assert.ok(low < high);
          if (row.mean !== null) assert.ok(low <= row.mean && high >= row.mean);
        }
      }
      assert.equal(requests, 0);
      assert.equal(JSON.stringify(result), original);
    } finally { globalThis.fetch = fetch; }
  });
}

test('intervalos acotados se recortan sin alterar la desviación original', () => {
  const result = fixture('titanic');
  result.models[0]!.metrics.roc_auc = { mean: .98, std: .1, valid_folds: 3, values: [.8, 1, 1] };
  const row = chartRows(result, 'roc_auc')[0]!;
  assert.equal(row.std, .1);
  assert.equal(row.upper, 1);
  assert.equal(row.lower, .88);
  assert.ok(Math.abs(row.error![1] - .02) < 1e-12);
  assert.deepEqual(chartDomain([row], 'roc_auc', 'bars'), [0, 1]);
  const domain = chartDomain([row], 'roc_auc', 'points');
  assert.ok(domain[0] >= 0 && domain[1] <= 1 && domain[0] > 0);
});

test('desviación cero, nula, folds insuficientes y medias indefinidas no se confunden', () => {
  const result = fixture('iris');
  const metric = result.primary_metric;
  const original = result.models[0]!.metrics[metric]!;
  for (const [mean, std, valid, hasError] of [[.8, 0, 3, true], [.8, null, 3, false], [.8, .1, 1, false], [null, null, 0, false]] as const) {
    result.models[0]!.metrics[metric] = { ...original, mean, std, valid_folds: valid };
    const row = chartRows(result, metric)[0]!;
    assert.equal(row.error !== null, hasError);
    assert.equal(row.mean, mean);
    if (hasError) assert.deepEqual(row.error, [0, 0]);
  }
  assert.deepEqual(chartDomain([], metric, 'points'), [0, 1]);
  assert.equal(exactMetric(.12345678901234567), '0,12345678901234566');
  assert.equal(exactMetric(null), '—');
});

test('MAE/RMSE parten de cero y R² conserva valores negativos; métricas ausentes no se ofrecen', () => {
  const result = fixture('california-housing');
  result.models[0]!.metrics.r2 = { mean: -2, std: .4, valid_folds: 3, values: [-2, -1.6, -2.4] };
  const rows = chartRows(result, 'r2');
  assert.ok(chartDomain(rows, 'r2', 'bars')[0] < -2);
  for (const metric of ['mae', 'rmse']) assert.equal(chartDomain(chartRows(result, metric), metric, 'bars')[0], 0);
  result.metric_names.push('not_available');
  assert.ok(!availableChartMetrics(result).includes('not_available'));
});
