import { minimizeMetric } from './comparisons';
import { boundedMetric } from './comparisonCharts';
import type { ComparisonModel } from '../types/comparison';
export type EvaluationMethod = 'simple' | 'cv';
export const DEFAULT_EVALUATION_METHOD: EvaluationMethod = 'cv';
export const evaluationSignature = (config: unknown, method: EvaluationMethod) => JSON.stringify({ config, method });
export function metricGap(train: number | null | undefined, validation: number | null | undefined) {
  return typeof train === 'number' && Number.isFinite(train) && typeof validation === 'number' && Number.isFinite(validation) ? Math.abs(train - validation) : null;
}
export function performanceObservation(metric: string, train: number | null | undefined, validation: number | null | undefined) {
  if (metricGap(train, validation) === null) return 'No se puede comparar esta métrica porque falta un valor definido.';
  const betterTrain = minimizeMetric(metric) ? train! < validation! : train! > validation!;
  return train === validation ? 'Las puntuaciones coinciden; esto no demuestra ausencia de sobreajuste.' : betterTrain
    ? 'El rendimiento observado es mejor en train. Una brecha es compatible con sobreajuste, pero también puede reflejar variabilidad o diferencias de distribución.'
    : 'El rendimiento observado es mejor fuera de train. La variabilidad y la composición de la partición pueden producir este resultado.';
}

export const finiteScore = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function directionalGap(metric: string, train: number | null | undefined, validation: number | null | undefined) {
  if (finiteScore(train) === null || finiteScore(validation) === null) return null;
  return minimizeMetric(metric) ? validation! - train! : train! - validation!;
}
export function generalizationRows(candidate: ComparisonModel | undefined, metric: string) {
  return candidate?.folds.map(f => ({ name: `Fold ${f.fold}`, train: finiteScore(f.train_metrics?.[metric]), validation: finiteScore(f.metrics[metric]), trainN: f.train_n, validationN: f.validation_n })) ?? [];
}
export function generalizationDomain(metric: string, points: { train: number | null; validation: number | null }[], zoom = true): [number, number] {
  const values = points.flatMap(p => [p.train, p.validation].filter((value): value is number => finiteScore(value) !== null));
  if (!values.length || !zoom && boundedMetric(metric)) return [0, 1];
  const low = Math.min(...values), high = Math.max(...values);
  const margin = high === low ? Math.max(Math.abs(high) * .05, .01) : (high - low) * .12;
  const nonnegative = boundedMetric(metric) || minimizeMetric(metric);
  return [zoom ? nonnegative ? Math.max(0, low - margin) : low - margin : nonnegative ? 0 : Math.min(0, low - margin),
    boundedMetric(metric) ? Math.min(1, high + margin) : Math.max(zoom ? -Infinity : 0, high + margin)];
}
export function contextualObservation(metric: string, candidate: ComparisonModel | undefined) {
  const points = generalizationRows(candidate, metric);
  const gaps = points.map(p => directionalGap(metric, p.train, p.validation));
  if (!gaps.length || gaps.some(gap => gap === null)) return 'Faltan resultados definidos: no se interpreta una diferencia global a partir de folds incompletos.';
  const a = candidate?.train_metrics?.[metric], b = candidate?.metrics[metric];
  if (a?.valid_folds !== points.length || b?.valid_folds !== points.length) return 'Las medias son parciales; consulta los resultados definidos de cada fold.';
  const better = gaps.filter(gap => gap! > 0).length;
  if (better === gaps.length) return 'Train muestra mejor rendimiento que validación en todos los folds. Este patrón es compatible con sobreajuste, pero no lo demuestra ni identifica su causa: también pueden influir la muestra, la variabilidad o diferencias de distribución.';
  if (gaps.every(gap => gap === 0)) return 'Las puntuaciones coinciden en los folds observados. Esto no demuestra ausencia de sobreajuste ni permite descartar infraajuste.';
  if (better === 0) return 'Train no supera a validación en los folds observados. La variabilidad y la composición de las particiones pueden producir este patrón; no permite concluir por sí solo que exista infraajuste.';
  return `Train rinde mejor en ${better} de ${gaps.length} folds; la dirección de la diferencia no es uniforme. Interpreta la media junto con esta variabilidad, sin un diagnóstico automático.`;
}
