import type { Dataset } from '../types/dataset';
import type { ExperimentResult, ModelId, Task } from '../types/experiment';
import type { ComparisonConfig, ComparisonResult } from '../types/comparison';
import { experimentForm, MODELS, targetSummary, validateExperiment } from './experiments';

export function comparisonMetrics(task: Task, binary: boolean) {
  return task === 'regression' ? ['rmse', 'mae', 'r2'] : binary
    ? ['roc_auc', 'accuracy', 'precision_macro', 'recall_macro', 'f1_macro', 'precision_positive', 'recall_positive', 'f1_positive']
    : ['f1_macro', 'accuracy', 'precision_macro', 'recall_macro'];
}
export const minimizeMetric = (metric: string) => metric === 'mae' || metric === 'rmse';
export function validateComparison(dataset: Dataset, config: ComparisonConfig) {
  const errors = validateExperiment(dataset, config.experiment);
  if (config.models.length < 2 || config.models.length > 3 || new Set(config.models).size !== config.models.length || config.models.some(id => !MODELS.some(m => m.id === id && m.task === config.experiment.task))) errors.push('Selecciona entre dos y tres modelos compatibles distintos.');
  if (config.folds !== 3) errors.push('Solo están habilitados tres folds bajo el presupuesto actual.');
  const binary = targetSummary(dataset, config.experiment.target, config.experiment.test_size, config.experiment.task).counts.size === 2;
  if (!comparisonMetrics(config.experiment.task, binary).includes(config.primary_metric)) errors.push('La métrica principal no es compatible con el problema.');
  if (config.experiment.task === 'classification' && binary && !config.experiment.positive_class) errors.push('Elige explícitamente la clase positiva.');
  return errors;
}
async function request(baseUrl: string, endpoint: string, body: FormData | string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try { response = await fetch(`${baseUrl.replace(/\/$/, '')}${endpoint}`, { method: 'POST', body, signal, ...(typeof body === 'string' ? { headers: { 'Content-Type': 'application/json' } } : {}) }); }
  catch (error) { if (signal.aborted) throw error; throw new Error('No se pudo conectar con FastAPI. Revisa la URL del backend y CORS.'); }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error(`Respuesta inválida del backend (HTTP ${response.status}).`); }
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload ? payload.detail : null;
    throw new Error(typeof detail === 'string' ? detail : `La operación fue rechazada (HTTP ${response.status}).`);
  }
  return payload;
}
export async function runComparison(baseUrl: string, dataset: Dataset, config: ComparisonConfig, signal: AbortSignal): Promise<ComparisonResult> {
  const errors = validateComparison(dataset, config);
  if (errors.length) throw new Error(errors.join(' '));
  const form = experimentForm(dataset, config.experiment);
  form.set('config', JSON.stringify(config));
  const result = await request(baseUrl, '/api/comparisons', form, signal);
  if (!result || typeof result !== 'object' || !('evaluation_scope' in result) || result.evaluation_scope !== 'cross_validation' || !('session_token' in result) || !('models' in result) || !('api_version' in result) || result.api_version !== '0.4.0') throw new Error('Actualiza el backend: se requiere la API de comparaciones v0.4.');
  return result as ComparisonResult;
}
export async function evaluateComparison(baseUrl: string, token: string, model: ModelId, signal: AbortSignal): Promise<ExperimentResult> {
  const result = await request(baseUrl, '/api/comparisons/evaluate', JSON.stringify({ token, model }), signal);
  if (!result || typeof result !== 'object' || !('evaluation_scope' in result) || result.evaluation_scope !== 'test' || !('metrics' in result)) throw new Error('El backend devolvió una evaluación final inválida.');
  return result as ExperimentResult;
}
