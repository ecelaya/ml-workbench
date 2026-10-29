import { useState } from 'react';
import { availableChartMetrics } from '../../lib/comparisonCharts';
import { ComparisonChart } from './ComparisonChart';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ComparisonResult } from '../../types/comparison';
import type { ModelId } from '../../types/experiment';
import { MODELS } from '../../lib/experiments';
import { formatMetric as formatNumber, METRIC_INFO } from '../../lib/modelResults';
import { minimizeMetric } from '../../lib/comparisons';
import { Note, Panel, Table } from '../eda/Shared';
import { InfoTooltip } from '../InfoTooltip';
import { classLabel, type ClassLabels } from '../../lib/classMetadata';
const name = (id: string) => MODELS.find(m => m.id === id)?.name ?? id;
const label = (metric: string) => METRIC_INFO[metric]?.label ?? metric;
const formatMetric = (metric: string, value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? formatNumber(metric, value) : '—';
const colors = ['#33866b', '#b1854b', '#6283a0'];
export function ComparisonResults({ result, selected, onSelected, onEvaluate, busy, attempted, positiveClass, classLabels = {} }: { result: ComparisonResult; selected: ModelId | ''; onSelected: (id: ModelId) => void; onEvaluate: () => void; busy: boolean; attempted: boolean; positiveClass?: string; classLabels?: ClassLabels }) {
  const [requestedMetric, setRequestedMetric] = useState(result.primary_metric);
  const metrics = availableChartMetrics(result);
  const metric = metrics.includes(requestedMetric) ? requestedMetric : metrics[0] ?? result.primary_metric;
  const folds = [1, 2, 3].map((fold, i) => ({ fold: `Fold ${fold}`, ...Object.fromEntries(result.models.map(m => [m.model, m.folds[i]?.metrics[metric] ?? null])) }));
  return <>
    <Panel title="Resultados de validación cruzada" detail={`Solo train: ${result.sizes.train} registros. Test reservado: ${result.sizes.test}. ${result.splitter}, shuffle, semilla ${result.seed}.`}>
      {positiveClass && <Note>Clase positiva compartida con Modelos: {classLabel(positiveClass, classLabels)}. Se utiliza en las métricas positivas y ROC-AUC.</Note>}
      <Note>Orden por {label(result.primary_metric)} ({minimizeMetric(result.primary_metric) ? 'menor' : 'mayor'} es mejor). {result.best_model ? `Mejor media de CV: ${name(result.best_model)}.` : 'Ningún candidato tiene la métrica principal definida en todos los folds.'} Esto no demuestra superioridad estadística.</Note>
      <Table headers={['Modelo', ...result.metric_names.map(key => <span className="metric-label" key={key}>{label(key)}<InfoTooltip title={label(key)} explanation={METRIC_INFO[key]?.explanation.replace(/test/g, 'validación del fold') ?? 'Métrica por fold.'}/></span>), 'Fit total (s)']} rows={result.models.map(m => [name(m.model), ...result.metric_names.map(key => { const stat = m.metrics[key]; return stat ? `${formatMetric(key, stat.mean)} ± ${formatMetric(key, stat.std)} (${stat.valid_folds}/3)` : '—'; }), m.training_seconds.toFixed(2)])}/>
      <Note>Media ± desviación estándar entre folds. {result.std_convention} Los recuentos indican folds válidos; las medias parciales no optan al mejor modelo. Accuracy y su desviación se expresan en porcentaje y puntos porcentuales, respectivamente.</Note>
      {result.warnings.map(w => <Note key={w}>{w}</Note>)}
    </Panel>
    <ComparisonChart key={result.session_token} result={result} metric={metric} onMetric={setRequestedMetric}/>
    <Panel title="Resultados por fold" detail={`Métrica representada: ${label(metric)}. Las mismas particiones se utilizan para todos los candidatos.`}>
      <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={folds} margin={{ left: 12, right: 24 }}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="fold"/><YAxis domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} tickFormatter={v => formatMetric(metric, Number(v))}/><Tooltip formatter={v => formatMetric(metric, Number(v))}/><Legend/>{result.models.map((m, i) => <Line key={m.model} dataKey={m.model} name={name(m.model)} stroke={colors[i]} connectNulls={false} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer></div>
      <Table headers={['Modelo', 'Fold', 'Train / validación', ...result.metric_names.map(label), 'Fit (s)']} rows={result.models.flatMap(m => m.folds.map(f => [name(m.model), f.fold, `${f.train_n} / ${f.validation_n}`, ...result.metric_names.map(key => formatMetric(key, f.metrics[key] ?? null)), f.training_seconds.toFixed(2)]))}/>
      {result.models.map(m => <details className="model-details" key={m.model}><summary>Avisos y métricas indefinidas · {name(m.model)}</summary>{m.folds.map(f => <Note key={f.fold}>Fold {f.fold}: {[...Object.entries(f.undefined_reasons).map(([key, reason]) => `${label(key)}: ${reason}`), ...f.warnings].join(' · ') || 'Sin avisos.'}</Note>)}</details>)}
    </Panel>
    <Panel title="Evaluación final opcional" detail={`La sesión caduca a las ${new Date(result.expires_at * 1000).toLocaleTimeString('es-ES')}. No se evalúa test automáticamente.`}>
      <div className="eda-controls"><label className="eda-field">Modelo seleccionado<select value={selected} disabled={busy || attempted} onChange={e => onSelected(e.target.value as ModelId)}><option value="" disabled>Elige un candidato</option>{result.models.map(m => <option key={m.model} value={m.model}>{name(m.model)}</option>)}</select></label><button className="primary" disabled={busy || attempted || !selected} onClick={onEvaluate}>Confirmar selección y consultar test una vez</button></div>
      <Note>Se ajustará un Pipeline nuevo con todo train y se evaluará únicamente este candidato sobre el test reservado. Tras confirmar, no podrás repetir esta evaluación, incluso si falla o agota el tiempo.</Note>
    </Panel>
  </>;
}
