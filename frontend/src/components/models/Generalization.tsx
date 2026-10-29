import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExperimentResult } from '../../types/experiment';
import type { ComparisonResult } from '../../types/comparison';
import { formatMetric, METRIC_INFO } from '../../lib/modelResults';
import { metricGap, performanceObservation } from '../../lib/generalization';
import { boundedMetric } from '../../lib/comparisonCharts';
import { Note, Panel, Table } from '../eda/Shared';
const score = (metric: string, value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? formatMetric(metric, value) : '—';
const label = (metric: string) => METRIC_INFO[metric]?.label ?? metric;
export function Generalization({ result, cv }: { result?: ExperimentResult; cv?: ComparisonResult }) {
  const candidate = cv?.models[0];
  const names = cv?.metric_names ?? Object.keys(result?.metrics ?? {});
  const [requested, setRequested] = useState(names[0] ?? '');
  const metric = names.includes(requested) ? requested : names[0] ?? '';
  const train = cv ? candidate?.train_metrics?.[metric]?.mean : result?.train_metrics?.[metric];
  const validation = cv ? candidate?.metrics[metric]?.mean : result?.metrics[metric];
  const outside = cv ? 'Validación del fold' : 'Test';
  const data = cv ? candidate?.folds.map(f => ({ name: `Fold ${f.fold}`, train: f.train_metrics?.[metric], validation: f.metrics[metric] })) ?? [] : [{ name: label(metric), train, validation }];
  const rows = names.map(key => {
    const a = candidate?.train_metrics?.[key], b = candidate?.metrics[key];
    const trainValue = cv ? a?.mean : result?.train_metrics?.[key], validationValue = cv ? b?.mean : result?.metrics[key];
    const comparable = !cv || a?.valid_folds === 3 && b?.valid_folds === 3;
    return [label(key), cv ? `${score(key, a?.mean)} ± ${score(key, a?.std)} (${a?.valid_folds ?? 0}/3)` : score(key, trainValue), cv ? `${score(key, b?.mean)} ± ${score(key, b?.std)} (${b?.valid_folds ?? 0}/3)` : score(key, validationValue), score(key, comparable ? metricGap(trainValue, validationValue) : null)];
  });
  return <Panel title="Generalización" detail={cv ? 'Train in-sample y validación fuera de muestra por fold. Test permanece reservado.' : 'Pipeline ajustado solo con train; predicciones del mismo pipeline en train y test.'}>
    <Note>Las métricas de train son optimistas: proceden de observaciones usadas para ajustar el modelo y su preprocesamiento. Una puntuación alta en train no demuestra capacidad de generalización.</Note>
    {!result?.train_metrics && !candidate?.train_metrics ? <Note>El backend no proporciona puntuaciones de train. Actualiza la API y ejecuta de nuevo; no se estiman valores ficticios.</Note> : <>
      <Table headers={['Métrica', cv ? 'Train · media ± DE' : `Train (N=${result?.sizes.train})`, cv ? 'Validación · media ± DE' : `Test (N=${result?.sizes.test})`, cv ? '|Media train − media validación|' : '|Train − test|']} rows={rows}/>
      <div className="eda-controls"><label className="eda-field">Métrica del gráfico<select value={metric} onChange={e => setRequested(e.target.value)}>{names.map(key => <option key={key} value={key}>{label(key)}</option>)}</select></label></div>
      <div className="chart" role="group" aria-label={`Train frente a ${outside}: ${label(metric)}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ left: 16, right: 24, bottom: 10 }}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 10 }}/><YAxis width={80} domain={boundedMetric(metric) ? [0, 1] : metric === 'r2' ? ['auto', 'auto'] : [0, 'auto']} tickFormatter={v => score(metric, Number(v))}/><Tooltip formatter={v => score(metric, typeof v === 'number' ? v : null)}/><Legend/><Bar dataKey="train" name="Train in-sample" fill="#8da99a" isAnimationActive={false}/><Bar dataKey="validation" name={outside} fill="#33866b" isAnimationActive={false}/></BarChart></ResponsiveContainer></div>
      {cv && <><Table headers={['Fold', 'N train / validación', 'Train', 'Validación', '|Train − validación|', 'Motivos de indefinición']} rows={candidate?.folds.map(f => [f.fold, `${f.train_n} / ${f.validation_n}`, score(metric, f.train_metrics?.[metric]), score(metric, f.metrics[metric]), score(metric, metricGap(f.train_metrics?.[metric], f.metrics[metric])), [f.train_undefined_reasons?.[metric], f.undefined_reasons[metric]].filter(Boolean).join(' · ') || '—']) ?? []}/><Note>{cv.std_convention} Se muestran agregados con el número de folds válidos; las medias parciales requieren cautela. La diferencia de medias no equivale a la media de diferencias absolutas.</Note></>}
      <Note>{cv && (candidate?.train_metrics?.[metric]?.valid_folds !== 3 || candidate.metrics[metric]?.valid_folds !== 3) ? 'Faltan folds válidos: no se interpreta una brecha entre medias parciales.' : performanceObservation(metric, train, validation)} Las diferencias de Accuracy se expresan en puntos porcentuales.</Note>
    </>}
    <Note>Sobreajuste: el modelo puede adaptar demasiado el entrenamiento y rendir peor en nuevos datos. Infraajuste: puede no capturar patrones relevantes ni siquiera en train. Valorar ambos requiere referencias, dificultad de la tarea, tamaños de muestra y variabilidad; no hay umbrales universales ni conclusiones causales a partir de esta tabla.</Note>
    {result?.train_warnings?.map((warning, index) => <Note key={index}>Train: {warning}</Note>)}
  </Panel>;
}
