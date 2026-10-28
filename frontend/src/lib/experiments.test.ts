import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import type { Dataset } from '../types/dataset';
import type { ExperimentConfig } from '../types/experiment';
import { profile } from './csv';
import { defaultPredictors, experimentForm, runExperiment, suggestTask, targetSummary, validateExperiment } from './experiments';

function fixture(): Dataset {
  const headers = ['id', 'amount', 'category', 'target'];
  const rows = Array.from({ length: 50 }, (_, i) => [String(i + 1), String(i * 1.5), i % 2 ? '001' : ' a,"b"\nline ', i < 2 ? '' : String(i % 2)]);
  return { name: 'test.csv', bytes: 1000, headers, rows, columns: profile(headers, rows), missing: 2, delimiter: ',' };
}
function config(dataset: Dataset): ExperimentConfig {
  return { target: 'target', predictors: ['amount', 'category'], roles: Object.fromEntries(dataset.columns.map(c => [c.name, c.role])), task: 'classification', model: 'logistic_regression', test_size: .2, seed: 42, stratify: true, preprocessing: { numeric_imputation: 'median', scaling: 'standard', categorical_imputation: 'most_frequent' } };
}
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test('sugiere problema por rol y excluye objetivo e identificadores por defecto', () => {
  const dataset = fixture();
  assert.equal(suggestTask('Numérica'), 'regression');
  assert.equal(suggestTask('Categórica nominal'), 'classification');
  assert.equal(suggestTask('Categórica ordinal'), 'classification');
  assert.deepEqual(defaultPredictors(dataset, 'target'), ['amount', 'category']);
  assert.deepEqual(defaultPredictors(dataset, 'target', ['category']), ['amount']);
});
test('excluye solo objetivos ausentes y calcula tamaños completos con ceil', () => {
  const dataset = fixture();
  const result = targetSummary(dataset, 'target', .2, 'classification');
  assert.deepEqual(result.excluded, [0, 1]); assert.equal(result.usable, 48);
  assert.equal(result.train, 38); assert.equal(result.test, 10); assert.equal(result.stratifiable, true);
  dataset.rows[2]![3] = 'rare';
  assert.equal(targetSummary(dataset, 'target', .2, 'classification').stratifiable, false);
});
test('multipart conserva todos los registros, valores originales y configuración', async () => {
  const dataset = fixture(), settings = config(dataset), form = experimentForm(dataset, settings);
  const file = form.get('file'); assert.ok(file instanceof Blob);
  const csv = await file.text();
  const parsed = Papa.parse<string[]>(csv);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.data, [dataset.headers, ...dataset.rows]);
  assert.equal(parsed.data.length, 51);
  assert.deepEqual(JSON.parse(String(form.get('config'))), settings);
});
test('rechaza pocas clases, target no numérico, ausencia de predictores y semillas inválidas', () => {
  const dataset = fixture(), settings = config(dataset);
  assert.deepEqual(validateExperiment(dataset, settings), []);
  assert.ok(validateExperiment(dataset, { ...settings, predictors: [] }).length);
  assert.ok(validateExperiment(dataset, { ...settings, predictors: ['target'] }).length);
  assert.ok(validateExperiment(dataset, { ...settings, seed: NaN }).length);
  assert.ok(validateExperiment(dataset, { ...settings, test_size: .5 }).length);
  assert.ok(validateExperiment(dataset, { ...settings, model: 'linear_regression' }).length);
  dataset.rows.forEach(row => { row[3] = 'single'; });
  assert.ok(targetSummary(dataset, 'target', .2, 'classification').errors.length);
  assert.ok(targetSummary(dataset, 'target', .2, 'regression').errors.length);
});
test('errores de red y de datos de la API son comprensibles, sin resultados ficticios', async () => {
  const dataset = fixture(), settings = config(dataset), controller = new AbortController();
  globalThis.fetch = async () => { throw new Error('network'); };
  await assert.rejects(runExperiment('https://api.example', dataset, settings, controller.signal), /No se pudo conectar con FastAPI/);
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Target inválido' }), { status: 422 });
  await assert.rejects(runExperiment('https://api.example', dataset, settings, controller.signal), /Target inválido/);
  globalThis.fetch = async () => new Response('<html/>', { status: 502 });
  await assert.rejects(runExperiment('https://api.example', dataset, settings, controller.signal), /Respuesta inválida/);
});
test('solo la llamada de entrenamiento envía el dataset completo a la URL configurada', async () => {
  const dataset = fixture(), settings = config(dataset);
  let requested = '', rows = 0;
  globalThis.fetch = async (input, init) => {
    requested = String(input); assert.equal(init?.method, 'POST');
    const form = init?.body; assert.ok(form instanceof FormData);
    const file = form.get('file'); assert.ok(file instanceof Blob);
    rows = Papa.parse(await file.text()).data.length - 1;
    return new Response(JSON.stringify({ api_version: '0.3.1', evaluation_scope: 'test', metrics: { accuracy: .5 }, sizes: { received: 50 } }));
  };
  const result = await runExperiment('https://api.example/', dataset, settings, new AbortController().signal);
  assert.equal(requested, 'https://api.example/api/experiments'); assert.equal(rows, 50); assert.equal(result.metrics.accuracy, .5);
});
test('valida exclusiones, clase positiva y orden ordinal sin convertir nominales implícitamente', () => {
  const dataset = fixture(), settings = config(dataset);
  assert.ok(validateExperiment(dataset, { ...settings, positive_class: 'unknown' }).some(e => e.includes('clase positiva')));
  assert.ok(validateExperiment(dataset, { ...settings, preprocessing: { ...settings.preprocessing, variables: { amount: { encoding: 'exclude' }, category: { encoding: 'exclude' } } } }).some(e => e.includes('exclusiones')));
  const ordinal = { ...settings, preprocessing: { ...settings.preprocessing, variables: { category: { encoding: 'ordinal' as const, ordinal_categories: ['a', 'b'] } } } };
  assert.ok(validateExperiment(dataset, ordinal).some(e => e.includes('rol ordinal')));
  const allowed = { ...ordinal, roles: { ...ordinal.roles, category: 'Categórica ordinal' as const } };
  assert.deepEqual(validateExperiment(dataset, allowed), []);
  assert.ok(validateExperiment(dataset, { ...allowed, preprocessing: { ...allowed.preprocessing, variables: { category: { encoding: 'ordinal', ordinal_categories: ['a', 'a'] } } } }).some(e => e.includes('orden ordinal')));
});
