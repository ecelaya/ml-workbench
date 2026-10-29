import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Dataset } from '../types/dataset';
import type { ExperimentResult } from '../types/experiment';
import { SAMPLE_DATASETS } from '../data/sampleDatasets';
import { profile } from './csv';
import { classLabel, resolveClassMetadata } from './classMetadata';
import { ConfusionHeatmap } from '../components/models/ConfusionHeatmap';

function data(headers: string[], rows: string[][]): Dataset {
  return { name: 'own.csv', headers, rows, columns: profile(headers, rows), missing: 0, bytes: 100, delimiter: ',' };
}
function sample(id: string) {
  const metadata = SAMPLE_DATASETS.find(s => s.id === id)!;
  const parsed = Papa.parse<string[]>(readFileSync(new URL(`../../public/datasets/${metadata.filename}`, import.meta.url), 'utf8'), { skipEmptyLines: true }).data;
  return { metadata, dataset: data(parsed[0]!, parsed.slice(1)) };
}

test('Titanic real: supervivencia positiva y etiquetas semánticas sin recodificar el CSV', () => {
  const { dataset, metadata } = sample('titanic');
  const resolved = resolveClassMetadata(dataset, 'survived', metadata);
  assert.deepEqual(resolved.classes, ['0', '1']);
  assert.equal(resolved.positiveClass, '1');
  assert.equal(classLabel('1', resolved.labels), 'Sobrevivió (1)');
  assert.equal(classLabel('0', resolved.labels), 'No sobrevivió (0)');
  assert.equal(resolveClassMetadata(dataset, 'survived').positiveClass, '');
});

test('WDBC real conserva M/B: maligno por defecto y benigno seleccionable manualmente', () => {
  const { dataset, metadata } = sample('breast-cancer');
  const resolved = resolveClassMetadata(dataset, 'diagnosis', metadata);
  assert.deepEqual(resolved.classes, ['B', 'M']);
  assert.equal(resolved.positiveClass, 'M');
  assert.equal(classLabel('M', resolved.labels), 'Maligno (M)');
  assert.equal(classLabel('B', resolved.labels), 'Benigno (B)');
  assert.equal(resolveClassMetadata(dataset, 'diagnosis', metadata, { diagnosis: 'B' }).positiveClass, 'B');
  assert.equal(resolveClassMetadata(dataset, 'diagnosis').positiveClass, '');
});

test('CSV arbitrario no inventa significado y comparte la elección manual por target entre módulos', () => {
  const dataset = data(['target', 'other'], [['alpha', 'yes'], ['omega', 'no']]);
  assert.equal(resolveClassMetadata(dataset, 'target').positiveClass, '');
  const selections = { target: 'omega' };
  const models = resolveClassMetadata(dataset, 'target', undefined, selections);
  const comparisons = resolveClassMetadata(dataset, 'target', undefined, selections);
  assert.equal(models.positiveClass, comparisons.positiveClass);
  assert.equal(models.positiveClass, 'omega');
  const changed = { ...selections, target: 'alpha' };
  assert.equal(resolveClassMetadata(dataset, 'target', undefined, changed).positiveClass, 'alpha');
  assert.equal(resolveClassMetadata(dataset, 'other', undefined, changed).positiveClass, 'yes');
  assert.equal(resolveClassMetadata(dataset, 'target', undefined, { target: 'invalid' }).positiveClass, '');
});

test('convenciones completas sí/no y true/false; 0/1 no implica semántica ni evento positivo', () => {
  for (const [negative, positive] of [['no', 'sí'], ['FALSE', 'TRUE'], ['negative', 'positive']]) {
    const resolved = resolveClassMetadata(data(['target'], [[negative!], [positive!]]), 'target');
    assert.equal(resolved.positiveClass, positive);
  }
  assert.equal(resolveClassMetadata(data(['target'], [['0'], ['1']]), 'target').positiveClass, '');
  assert.equal(resolveClassMetadata(data(['target'], [['yes'], ['no'], ['maybe']]), 'target').positiveClass, '');
  assert.equal(classLabel('constructor'), 'constructor');
  assert.equal(classLabel('toString'), 'toString');
});

test('metadatos se aplican solo al objetivo original; multiclase, vacío y target inexistente son seguros', () => {
  const { dataset, metadata } = sample('iris');
  assert.equal(resolveClassMetadata(dataset, 'species', metadata).positiveClass, '');
  assert.equal(resolveClassMetadata(dataset, 'sepal_length_cm', metadata).positiveClass, '');
  assert.deepEqual(resolveClassMetadata(dataset, 'missing', metadata).classes, []);
  assert.equal(resolveClassMetadata(null, 'target').positiveClass, '');
  assert.equal(resolveClassMetadata(data([], []), 'target').positiveClass, '');
});

test('matriz de confusión muestra las etiquetas y los códigos originales', () => {
  const result = { classes: ['0', '1'], confusion_matrix: [[2, 1], [0, 3]], confusion_matrix_normalized: [[2 / 3, 1 / 3], [0, 1]] } as ExperimentResult;
  const html = renderToStaticMarkup(createElement(ConfusionHeatmap, { result, classLabels: { '0': 'No sobrevivió', '1': 'Sobrevivió' } }));
  assert.match(html, /Sobrevivió \(1\)/);
  assert.match(html, /No sobrevivió \(0\)/);
});
