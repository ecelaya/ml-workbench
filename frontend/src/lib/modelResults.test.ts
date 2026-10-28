import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMetric, heatmapCells, inferTargetUnits, paddedDomain, visibleMetrics } from './modelResults';

test('formato visual: accuracy porcentual con dos decimales; demás métricas cuatro', () => {
  assert.equal(formatMetric('accuracy', .92345), '92,35 %');
  for (const key of ['precision_positive', 'recall_positive', 'f1_macro', 'roc_auc', 'mae', 'rmse', 'r2']) assert.equal(formatMetric(key, .92345), '0,9235');
  assert.equal(formatMetric('r2', -1.23456), '-1,2346');
  assert.equal(formatMetric('accuracy', 0), '0,00 %');
});
test('no se muestran métricas nulas o ajenas a la tarea ni se modifica su precisión', () => {
  const metrics = { accuracy: .923456789, f1_macro: .811111111, roc_auc: null, mae: 45, specificity: .5 };
  const shown = visibleMetrics({ task_type: 'multiclass', metrics });
  assert.deepEqual(shown.map(m => m.name), ['accuracy', 'f1_macro']);
  assert.equal(shown[0]?.value, .923456789);
  assert.equal(metrics.accuracy, .923456789);
  assert.deepEqual(visibleMetrics({ task_type: 'regression', metrics: { mae: 0, rmse: 1, r2: null, accuracy: 1 } }).map(m => m.name), ['mae', 'rmse']);
  assert.ok(shown.every(m => m.explanation.length > 10));
});
test('mapa de calor utiliza la matriz y normalización de la API, con etiquetas correctas', () => {
  const data = { classes: ['healthy', 'ill'], confusion_matrix: [[3, 2], [1, 2]], confusion_matrix_normalized: [[.6, .4], [1 / 3, 2 / 3]] };
  const raw = heatmapCells(data, false), normalized = heatmapCells(data, true);
  assert.equal(raw[0]?.[1]?.real, 'healthy'); assert.equal(raw[0]?.[1]?.predicted, 'ill');
  assert.equal(raw[0]?.[1]?.value, 2); assert.equal(raw[0]?.[1]?.support, 5);
  assert.equal(normalized[1]?.[0]?.value, 1 / 3);
  assert.equal(normalized[1]?.[0]?.count, 1);
  assert.equal(heatmapCells({ ...data, confusion_matrix: [[0, 0], [1, 2]] }, true)[0]?.[0]?.value, null);
});
test('dominios de regresión conservan negativos, comparten escala y no recortan constantes', () => {
  const domain = paddedDomain([-3, 7]);
  assert.deepEqual(domain, [-3.5, 7.5]);
  assert.deepEqual(paddedDomain([-3, 7]), domain); // Used unchanged by X and Y.
  assert.deepEqual(paddedDomain([-5, -5]), [-6, -4]);
  assert.ok(paddedDomain([-10, -5])[1] < 0);
  const residual = paddedDomain([-2, 1]); assert.ok(residual[0] < -2 && residual[1] > 1 && residual[0] < 0 && residual[1] > 0);
});
test('solo se sugieren unidades presentes en el nombre; las demás requieren metadatos', () => {
  assert.equal(inferTargetUnits('body_mass_g'), 'g'); assert.equal(inferTargetUnits('length_mm'), 'mm');
  assert.equal(inferTargetUnits('species'), ''); assert.equal(inferTargetUnits('MedHouseVal'), '');
});
