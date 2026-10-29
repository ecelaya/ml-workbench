import type { ComparisonResult } from '../types/comparison';
export type ComparisonView = 'bars' | 'points';
export const boundedMetric = (metric: string) => ['accuracy', 'roc_auc', 'precision_macro', 'recall_macro', 'f1_macro', 'precision_positive', 'recall_positive', 'f1_positive', 'sensitivity', 'specificity'].includes(metric);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const exactMetric = (value: number | null) => value === null ? '—' : String(value).replace('.', ',');

export function availableChartMetrics(result: ComparisonResult) {
  // Preserve the API's metric list and model order, including undefined metrics.
  return result.metric_names.filter(metric => result.models.some(model => Object.hasOwn(model.metrics, metric)));
}
export function chartRows(result: ComparisonResult, metric: string) {
  return result.models.map(model => {
    const stat = model.metrics[metric];
    const mean = stat && stat.valid_folds > 0 && finite(stat.mean) ? stat.mean : null;
    const std = stat && stat.valid_folds >= 2 && finite(stat.std) && stat.std >= 0 ? stat.std : null;
    const lower = mean === null || std === null ? null : Math.max(boundedMetric(metric) || metric === 'mae' || metric === 'rmse' ? 0 : -Infinity, mean - std);
    const upper = mean === null || std === null ? null : Math.min(boundedMetric(metric) ? 1 : Infinity, mean + std);
    return { model: model.model, mean, std, lower, upper, valid: stat?.valid_folds ?? 0,
      error: mean !== null && lower !== null && upper !== null ? [mean - lower, upper - mean] as [number, number] : null,
      values: model.folds.map(fold => ({ fold: fold.fold, value: finite(fold.metrics[metric]) ? fold.metrics[metric]! : null,
        reason: fold.undefined_reasons[metric] })),
    };
  });
}
export type ComparisonChartRow = ReturnType<typeof chartRows>[number];
export function chartDomain(rows: ComparisonChartRow[], metric: string, view: ComparisonView): [number, number] {
  if (view === 'bars' && boundedMetric(metric)) return [0, 1];
  const values = rows.flatMap(row => row.mean === null ? [] : [row.lower ?? row.mean, row.upper ?? row.mean]);
  if (!values.length) return [0, 1];
  const low = Math.min(...values), high = Math.max(...values);
  const padding = high > low ? (high - low) * .08 : Math.max(Math.abs(high) * .05, .01);
  const nonnegative = boundedMetric(metric) || metric === 'mae' || metric === 'rmse';
  const min = view === 'bars' ? nonnegative ? 0 : Math.min(0, low - padding) : nonnegative ? Math.max(0, low - padding) : low - padding;
  const max = boundedMetric(metric) ? Math.min(1, high + padding) : Math.max(view === 'bars' ? 0 : -Infinity, high + padding);
  return [min, max];
}
