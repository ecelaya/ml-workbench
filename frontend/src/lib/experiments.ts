import Papa from 'papaparse';
import type { Dataset, StatisticalRole } from '../types/dataset';
import type { ExperimentConfig, ExperimentResult, ModelId, Task } from '../types/experiment';
import { isMissing, MAX_BYTES } from './csv';
import { numericValue } from './statistics';
export const MODELS: { id: ModelId; name: string; task: Task }[] = [
  { id: 'logistic_regression', name: 'Regresión logística', task: 'classification' },
  { id: 'decision_tree_classifier', name: 'Árbol de clasificación', task: 'classification' },
  { id: 'random_forest_classifier', name: 'Random Forest de clasificación', task: 'classification' },
  { id: 'linear_regression', name: 'Regresión lineal', task: 'regression' },
  { id: 'decision_tree_regressor', name: 'Árbol de regresión', task: 'regression' },
  { id: 'random_forest_regressor', name: 'Random Forest de regresión', task: 'regression' },
];
export const suggestTask = (role?: StatisticalRole): Task => role === 'Numérica' ? 'regression' : 'classification';
export const defaultModel = (task: Task): ModelId => task === 'classification' ? 'logistic_regression' : 'linear_regression';
export function defaultPredictors(dataset: Dataset, target: string, excluded: readonly string[] = []): string[] {
  return dataset.columns.filter(c => c.name !== target && c.role !== 'Identificador' && !excluded.includes(c.name)).map(c => c.name);
}
export function targetSummary(dataset: Dataset, target: string, testSize: number, task: Task) {
  const index = dataset.headers.indexOf(target);
  const excluded: number[] = [], counts = new Map<string, number>();
  let invalidNumeric = 0;
  dataset.rows.forEach((row, i) => {
    const value = row[index] ?? '';
    if (isMissing(value)) excluded.push(i);
    else { counts.set(value, (counts.get(value) ?? 0) + 1); if (numericValue(value) === null) invalidNumeric++; }
  });
  const usable = dataset.rows.length - excluded.length, test = Math.ceil(usable * testSize), train = usable - test;
  const stratifiable = counts.size >= 2 && [...counts.values()].every(n => n >= 2) && test >= counts.size && train >= counts.size;
  const errors: string[] = [];
  if (index < 0) errors.push('Selecciona una variable objetivo válida.');
  if (usable < 10) errors.push('Se necesitan al menos 10 observaciones con objetivo no ausente.');
  if (task === 'classification' && counts.size < 2) errors.push('Clasificación requiere al menos dos clases.');
  if (task === 'classification' && counts.size > 100) errors.push('Más de 100 clases: revisa si el objetivo es numérico o un identificador.');
  if (task === 'regression' && invalidNumeric > 0) errors.push(`El objetivo contiene ${invalidNumeric} valores no numéricos no vacíos. Corrige el tipo de problema o el archivo.`);
  return { excluded, counts, usable, train, test, stratifiable, errors };
}
export function validateExperiment(dataset: Dataset, config: ExperimentConfig): string[] {
  const errors = targetSummary(dataset, config.target, config.test_size, config.task).errors;
  if (!config.predictors.length) errors.push('Selecciona al menos un predictor.');
  if (config.predictors.includes(config.target)) errors.push('El objetivo no puede ser predictor de sí mismo.');
  if (config.predictors.some(name => !dataset.headers.includes(name))) errors.push('Algún predictor no pertenece al dataset.');
  if (new Set(config.predictors).size !== config.predictors.length) errors.push('Hay predictores repetidos.');
  if (!Number.isFinite(config.test_size) || config.test_size < .1 || config.test_size > .4) errors.push('El porcentaje de test debe estar entre 10 % y 40 %.');
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 4294967295) errors.push('La semilla debe ser un entero entre 0 y 4294967295.');
  if (!MODELS.some(model => model.id === config.model && model.task === config.task)) errors.push('El modelo no es compatible con el problema.');
  return errors;
}
export function experimentForm(dataset: Dataset, config: ExperimentConfig): FormData {
  // Serialize every parsed row with original string values; no dynamicTyping,
  // numeric conversion or chart subsampling. The backend reads canonical CSV.
  const csv = Papa.unparse({ fields: dataset.headers, data: dataset.rows }, { quotes: true, newline: '\r\n' });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  if (blob.size > MAX_BYTES) throw new Error('El CSV serializado supera 10 MiB. Utiliza un dataset más pequeño.');
  const form = new FormData();
  form.append('file', blob, dataset.name.toLowerCase().endsWith('.csv') ? dataset.name : 'dataset.csv');
  form.append('config', JSON.stringify(config));
  return form;
}
export async function runExperiment(baseUrl: string, dataset: Dataset, config: ExperimentConfig, signal: AbortSignal): Promise<ExperimentResult> {
  const errors = validateExperiment(dataset, config);
  if (errors.length) throw new Error(errors.join(' '));
  const form = experimentForm(dataset, config);
  let response: Response;
  try { response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/experiments`, { method: 'POST', body: form, signal }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new Error('No se pudo conectar con FastAPI. Comprueba que el backend está iniciado, VITE_API_URL y los orígenes CORS. El EDA sigue disponible localmente.');
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error(`Respuesta inválida del backend (HTTP ${response.status}).`); }
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null;
    throw new Error(typeof detail === 'string' ? detail : `La API rechazó el experimento (HTTP ${response.status}). Revisa la configuración.`);
  }
  if (!body || typeof body !== 'object' || !('evaluation_scope' in body) || body.evaluation_scope !== 'test' || !('metrics' in body) || !('sizes' in body)) throw new Error('La API devolvió resultados con un formato inesperado.');
  return body as ExperimentResult;
}
