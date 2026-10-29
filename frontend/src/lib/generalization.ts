import { minimizeMetric } from './comparisons';
export type EvaluationMethod = 'simple' | 'cv';
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
