import type { ExperimentResult } from '../types/experiment';
export const METRIC_INFO: Record<string, { label: string; explanation: string }> = {
  accuracy: { label: 'Accuracy', explanation: 'Porcentaje de predicciones correctas sobre todas las observaciones de test.' },
  precision_positive: { label: 'Precision positiva', explanation: 'Entre las predicciones positivas, proporción que realmente pertenece a la clase positiva elegida.' },
  recall_positive: { label: 'Recall positivo', explanation: 'Proporción de observaciones de la clase positiva identificadas correctamente.' },
  f1_positive: { label: 'F1 positivo', explanation: 'Media armónica de precision y recall para la clase positiva elegida.' },
  precision_macro: { label: 'Precision macro', explanation: 'Media no ponderada de la precision de las clases, todas con el mismo peso.' },
  recall_macro: { label: 'Recall macro', explanation: 'Media no ponderada del recall de las clases, todas con el mismo peso.' },
  f1_macro: { label: 'F1 macro', explanation: 'Media no ponderada del F1 calculado por clase, no el F1 de las medias.' },
  sensitivity: { label: 'Sensibilidad', explanation: 'Recall de la clase positiva: verdaderos positivos / positivos reales. No definida si no hay positivos reales.' },
  specificity: { label: 'Especificidad', explanation: 'Recall de la clase negativa: verdaderos negativos / negativos reales. No definida si no hay negativos reales.' },
  roc_auc: { label: 'ROC-AUC', explanation: 'Área bajo la curva ROC usando la probabilidad de la clase positiva elegida. Requiere ambas clases en test. No optimiza el umbral.' },
  mae: { label: 'MAE', explanation: 'Media del error absoluto, en las unidades originales del objetivo. Utiliza todo test.' },
  rmse: { label: 'RMSE', explanation: 'Raíz de la media del error cuadrático, en las unidades del objetivo; penaliza más los errores grandes.' },
  r2: { label: 'R²', explanation: 'Coeficiente de determinación; puede ser negativo. No está definido si el objetivo es constante en test.' },
};
export function formatMetric(name: string, value: number): string {
  const digits = name === 'accuracy' ? 2 : 4;
  return (name === 'accuracy' ? value * 100 : value).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (name === 'accuracy' ? ' %' : '');
}
export function visibleMetrics(result: Pick<ExperimentResult, 'task_type' | 'metrics'>) {
  const names = result.task_type === 'regression' ? ['mae', 'rmse', 'r2'] : result.task_type === 'binary' ? ['accuracy', 'precision_positive', 'recall_positive', 'f1_positive', 'precision_macro', 'recall_macro', 'f1_macro', 'sensitivity', 'specificity', 'roc_auc'] : ['accuracy', 'precision_macro', 'recall_macro', 'f1_macro'];
  return names.flatMap(name => { const value = result.metrics[name]; return typeof value === 'number' && Number.isFinite(value) ? [{ name, value, ...METRIC_INFO[name]!, formatted: formatMetric(name, value) }] : []; });
}
export function paddedDomain(bounds: [number, number] | null): [number, number] {
  if (!bounds) return [-1, 1];
  const [min, max] = bounds;
  const padding = min === max ? Math.max(Math.abs(min) * .05, 1) : (max / 20 - min / 20);
  return [Number.isFinite(min - padding) ? min - padding : min, Number.isFinite(max + padding) ? max + padding : max];
}
export function heatmapCells(result: Pick<ExperimentResult, 'classes' | 'confusion_matrix' | 'confusion_matrix_normalized'>, normalized: boolean) {
  return result.classes.map((real, i) => {
    const support = result.confusion_matrix?.[i]?.reduce((sum, value) => sum + value, 0) ?? 0;
    return result.classes.map((predicted, j) => ({ real, predicted, count: result.confusion_matrix?.[i]?.[j] ?? 0, support, value: normalized ? support ? result.confusion_matrix_normalized?.[i]?.[j] ?? null : null : result.confusion_matrix?.[i]?.[j] ?? 0 }));
  });
}
export const inferTargetUnits = (target: string) => /_(mm|cm|kg|g)$/i.exec(target)?.[1]?.toLowerCase() ?? '';
