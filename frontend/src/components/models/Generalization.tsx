import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExperimentResult } from '../../types/experiment';
import type { ComparisonResult } from '../../types/comparison';
import { METRIC_INFO } from '../../lib/modelResults';
import { contextualObservation, directionalGap, finiteScore, generalizationDomain, generalizationRows, performanceObservation } from '../../lib/generalization';
import { minimizeMetric } from '../../lib/comparisons';
import { boundedMetric } from '../../lib/comparisonCharts';
import { Note, Panel, Table } from '../eda/Shared';
import { SummaryCards } from './SummaryCards';
const score = (metric: string, value: number | null | undefined, gap = false) => finiteScore(value) === null ? '—' :
  (metric === 'accuracy' ? value! * 100 : value!).toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + (metric === 'accuracy' ? gap ? ' pp' : ' %' : '');
const label = (metric: string) => METRIC_INFO[metric]?.label ?? metric;
const axisScore = (metric: string, value: number) => metric === 'accuracy'
  ? `${(value * 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })}\u00a0%`
  : value.toLocaleString('es-ES', { maximumFractionDigits: 2 });

export function Generalization({ result, cv, targetUnits }: { result?: ExperimentResult; cv?: ComparisonResult; targetUnits?: string }) {
  const candidate = cv?.models[0];
  const names = cv?.metric_names ?? Object.keys(result?.metrics ?? {});
  const [requested, setRequested] = useState(names[0] ?? '');
  const [zoom, setZoom] = useState(true);
  const metric = names.includes(requested) ? requested : names[0] ?? '';
  const train = cv ? candidate?.train_metrics?.[metric]?.mean : result?.train_metrics?.[metric];
  const validation = cv ? candidate?.metrics[metric]?.mean : result?.metrics[metric];
  const outside = cv ? 'Validación del fold' : 'Test';
  const points = generalizationRows(candidate, metric);
  const domain = generalizationDomain(metric, points, zoom);
  const complete = !cv || candidate?.train_metrics?.[metric]?.valid_folds === cv.folds && candidate?.metrics[metric]?.valid_folds === cv.folds;
  const gap = complete ? directionalGap(metric, train, validation) : null;
  const formula = minimizeMetric(metric) ? `${cv ? 'Validación' : 'Test'} − Train` : `Train − ${cv ? 'Validación' : 'Test'}`;
  const units = minimizeMetric(metric) ? targetUnits || result?.config?.target_units || 'unidades del objetivo (no especificadas)' : metric === 'accuracy' ? 'porcentaje; diferencias en puntos porcentuales' : metric === 'r2' ? 'sin unidades; puede ser negativo' : 'sin unidades, escala 0–1';
  const rows = names.map(key => {
    const a = candidate?.train_metrics?.[key], b = candidate?.metrics[key];
    const trainValue = cv ? a?.mean : result?.train_metrics?.[key], validationValue = cv ? b?.mean : result?.metrics[key];
    const comparable = !cv || a?.valid_folds === cv.folds && b?.valid_folds === cv.folds;
    return [label(key), cv ? `${score(key, a?.mean)} ± ${score(key, a?.std, true)} (${a?.valid_folds ?? 0}/3)` : score(key, trainValue), cv ? `${score(key, b?.mean)} ± ${score(key, b?.std, true)} (${b?.valid_folds ?? 0}/3)` : score(key, validationValue), score(key, comparable ? directionalGap(key, trainValue, validationValue) : null, true)];
  });
  return <Panel title="Generalización" detail={cv ? 'Train in-sample y validación fuera de muestra por fold. Test permanece reservado.' : 'Pipeline ajustado solo con train; predicciones del mismo pipeline en train y test.'}>
    <Note>Las métricas de train son optimistas: proceden de observaciones usadas para ajustar el modelo y su preprocesamiento. Una puntuación alta en train no demuestra capacidad de generalización.</Note>
    {!result?.train_metrics && !candidate?.train_metrics ? <Note>El backend no proporciona puntuaciones de train. Actualiza la API y ejecuta de nuevo; no se estiman valores ficticios.</Note> : <>
      <Table headers={['Métrica', cv ? 'Train · media ± DE' : `Train (N=${result?.sizes.train})`, cv ? 'Validación · media ± DE' : `Test (N=${result?.sizes.test})`, 'Brecha dirigida (positiva = mejor train)']} rows={rows}/>
      <div className="eda-controls"><label className="eda-field">Métrica del gráfico<select value={metric} onChange={e => setRequested(e.target.value)}>{names.map(key => <option key={key} value={key}>{label(key)}</option>)}</select></label>{cv && <label className="model-check"><input type="checkbox" checked={zoom} onChange={e => setZoom(e.target.checked)}/>Ampliar automáticamente el eje Y</label>}</div>
      <Note>{label(metric)}: {units}. {minimizeMetric(metric) ? 'Menor es mejor.' : 'Mayor es mejor.'} Brecha = {formula}; positiva indica deterioro fuera de train, negativa indica mejor puntuación fuera de train.</Note>
      {cv ? <>
        <SummaryCards items={[
          { label: 'Media de train', value: score(metric, train) },
          { label: 'Media de validación', value: score(metric, validation) },
          { label: `Brecha · ${formula}`, value: score(metric, gap, true), explanation: 'Diferencia dirigida entre las medias. Solo se compara cuando ambas incluyen todos los folds.' },
          { label: 'DE de validación', value: score(metric, candidate?.metrics[metric]?.std, true), explanation: 'Desviación estándar muestral entre folds, descriptiva; no es un intervalo de confianza.' },
        ]}/>
        <Note>{zoom && domain[0] !== 0 ? 'Eje Y ampliado: no comienza en cero.' : 'Eje Y adaptado a los resultados.'} Límites: {score(metric, domain[0])} a {score(metric, domain[1])}. Se conservan todos los valores observados.</Note>
        {points.some(p => p.train !== null || p.validation !== null) ? <div className="generalization-chart" role="group" aria-label={`Líneas por fold: ${label(metric)}. Valores y N disponibles en la tabla.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={points} accessibilityLayer margin={{ left: 16, right: 28, top: 18, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 11 }}/><YAxis width={85} domain={domain} allowDataOverflow tick={{ fontSize: 11 }} tickFormatter={v => axisScore(metric, Number(v))}/>
          <Tooltip content={({ active, payload }) => {
            const point = payload?.[0]?.payload as (typeof points)[number] | undefined;
            return active && point ? <div className="comparison-tooltip"><strong>{point.name}</strong><p>Train in-sample: {score(metric, point.train)} · N={point.trainN}</p><p>Validación: {score(metric, point.validation)} · N={point.validationN}</p><p>Brecha ({formula}): {score(metric, directionalGap(metric, point.train, point.validation), true)}</p></div> : null;
          }}/><Legend wrapperStyle={{ fontSize: 11 }}/>
          <Line type="linear" dataKey="train" name="Train in-sample" stroke="#6283a0" strokeWidth={2} dot={{ r: 5, fill: '#6283a0' }} activeDot={{ r: 7 }} connectNulls={false} isAnimationActive={false}/>
          <Line type="linear" dataKey="validation" name="Validación del fold" stroke="#33866b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 5, fill: '#33866b' }} activeDot={{ r: 7 }} connectNulls={false} isAnimationActive={false}/>
        </LineChart></ResponsiveContainer></div> : <Note>No hay valores definidos para representar esta métrica.</Note>}
        <Note>{contextualObservation(metric, candidate)}</Note>
        <Table headers={['Fold', 'N train / validación', 'Train', 'Validación', formula, 'Motivos de indefinición']} rows={candidate?.folds.map(f => [f.fold, `${f.train_n} / ${f.validation_n}`, score(metric, f.train_metrics?.[metric]), score(metric, f.metrics[metric]), score(metric, directionalGap(metric, f.train_metrics?.[metric], f.metrics[metric]), true), [f.train_undefined_reasons?.[metric], f.undefined_reasons[metric]].filter(Boolean).join(' · ') || '—']) ?? []}/>
        <Note>{cv.std_convention} Train: {candidate?.train_metrics?.[metric]?.valid_folds ?? 0}/{cv.folds} folds válidos; validación: {candidate?.metrics[metric]?.valid_folds ?? 0}/{cv.folds}. No se interpreta la brecha entre medias incompletas.</Note>
      </> : <>
        <div className="chart" role="group" aria-label={`Train frente a ${outside}: ${label(metric)}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: label(metric), train, validation }]} margin={{ left: 16, right: 24, top: 24, bottom: 10 }}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 10 }}/><YAxis width={80} domain={boundedMetric(metric) ? [0, 1] : metric === 'r2' ? ['auto', 'auto'] : [0, 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => axisScore(metric, Number(v))}/><Tooltip formatter={v => score(metric, typeof v === 'number' ? v : null)}/><Legend/><Bar dataKey="train" name="Train in-sample" fill="#8da99a" isAnimationActive={false}/><Bar dataKey="validation" name={outside} fill="#33866b" isAnimationActive={false}/></BarChart></ResponsiveContainer></div>
        <Note>{performanceObservation(metric, train, validation)}</Note>
      </>}
    </>}
    <Note>Sobreajuste: adaptación excesiva al entrenamiento que puede limitar el rendimiento en datos nuevos. Infraajuste: patrones relevantes que el modelo podría no capturar. Valorar ambos requiere referencias, dificultad de la tarea, tamaños de muestra y variabilidad; no hay umbrales universales ni conclusiones causales a partir de este gráfico.</Note>
    {result?.train_warnings?.map((warning, index) => <Note key={index}>Train: {warning}</Note>)}
  </Panel>;
}
