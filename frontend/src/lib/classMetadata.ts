import type { Dataset } from '../types/dataset';
import type { SampleDataset } from '../data/sampleDatasets';
import { isMissing } from './csv';

export type ClassLabels = Readonly<Record<string, string>>;
export const classLabel = (value: string, labels: ClassLabels = {}) => Object.hasOwn(labels, value) && labels[value] ? `${labels[value]} (${value})` : value;

/** Match complete, observed label pairs; never attach semantics to bare 0/1. */
export function resolveClassMetadata(dataset: Dataset | null, target: string, sample?: SampleDataset, selections: Readonly<Record<string, string>> = {}) {
  const column = dataset?.headers.indexOf(target) ?? -1;
  const classes = [...new Set(column < 0 ? [] : dataset?.rows.flatMap(row => isMissing(row[column] ?? '') ? [] : [row[column]!]))].sort();
  const known = sample?.target === target;
  const labels: ClassLabels = known ? sample.classLabels ?? {} : {};
  let suggested = '', explanation = '';
  if (classes.length === 2) {
    if (known && sample.positiveClass && classes.includes(sample.positiveClass)) {
      suggested = sample.positiveClass;
      explanation = 'Clase positiva indicada por los metadatos del ejemplo. Puedes cambiarla.';
    } else {
      const pairs = [['false', 'true'], ['no', 'yes'], ['no', 'sí'], ['no', 'si'], ['negative', 'positive'], ['negativo', 'positivo']];
      const normalized = classes.map(value => value.trim().toLocaleLowerCase('es'));
      const pair = pairs.find(([negative, positive]) => normalized.includes(negative!) && normalized.includes(positive!));
      if (pair) {
        suggested = classes[normalized.indexOf(pair[1]!)]!;
        explanation = 'Sugerencia por la convención de las etiquetas; confirma que corresponde a tu objetivo. No se deduce su significado clínico o de negocio.';
      } else explanation = 'Los códigos o etiquetas no determinan por sí solos qué evento interesa. Elige la clase positiva según el significado del objetivo.';
    }
  }
  const manual = Object.hasOwn(selections, target);
  const selected = manual ? selections[target] ?? '' : suggested;
  return { classes, labels, positiveClass: classes.length === 2 && classes.includes(selected) ? selected : '',
    explanation: manual ? 'Selección manual compartida entre Modelos y Comparaciones. Puedes modificarla.' : explanation };
}
