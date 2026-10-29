import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Bar, CartesianGrid, ComposedChart, ErrorBar, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ComparisonResult } from '../../types/comparison';
import { availableChartMetrics, chartDomain, chartRows, exactMetric, type ComparisonChartRow, type ComparisonView } from '../../lib/comparisonCharts';
import { MODELS } from '../../lib/experiments';
import { formatMetric, METRIC_INFO } from '../../lib/modelResults';
import { Note, Panel } from '../eda/Shared';
import { InfoTooltip } from '../InfoTooltip';
const modelName = (id: string) => MODELS.find(model => model.id === id)?.name ?? id;
const shortName = (id: string) => id.startsWith('random_forest') ? 'Random Forest' : id.startsWith('decision_tree') ? 'Árbol' : id === 'logistic_regression' ? 'Logística' : 'Lineal';

function Details({ row, metric }: { row: ComparisonChartRow; metric: string }) {
  return <><strong>{modelName(row.model)}</strong><p>Media: {exactMetric(row.mean)}</p><p>Desviación estándar: {exactMetric(row.std)}</p><p>Folds válidos: {row.valid}/3</p>{row.values.map(f => <p key={f.fold}>Fold {f.fold}: {exactMetric(f.value)}{f.reason && ` · ${f.reason}`}</p>)}<p>{METRIC_INFO[metric]?.label ?? metric}: valores sin redondeo visual, en la escala original{metric === 'accuracy' ? ' 0–1' : ''}.</p></>;
}

function HoverDetails({ row, metric, anchor, x, y }: { row: ComparisonChartRow; metric: string; anchor: RefObject<HTMLDivElement | null>; x: number; y: number }) {
  const element = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    const place = () => {
      const chart = anchor.current?.getBoundingClientRect(), box = element.current?.getBoundingClientRect();
      if (!chart || !box) return;
      const left = Math.max(8, Math.min(chart.left + x + 12, window.innerWidth - box.width - 8));
      const below = chart.top + y + 12;
      const top = Math.max(8, Math.min(below + box.height < window.innerHeight - 8 ? below : chart.top + y - box.height - 12, window.innerHeight - box.height - 8));
      setPosition({ left, top, ready: true });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, x, y, row, metric]);
  return createPortal(<div ref={element} className="comparison-tooltip comparison-hover-tooltip" role="tooltip" style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}><Details row={row} metric={metric}/></div>, document.body);
}

export function ComparisonChart({ result, metric, onMetric }: { result: ComparisonResult; metric: string; onMetric: (metric: string) => void }) {
  const metrics = availableChartMetrics(result);
  const [view, setView] = useState<ComparisonView>('bars');
  const chart = useRef<HTMLDivElement>(null);
  const rows = chartRows(result, metric);
  const domain = chartDomain(rows, metric, view);
  const data = rows.map(row => ({ ...row, name: shortName(row.model),
    withError: row.error === null ? null : row.mean, withoutError: row.error === null ? row.mean : null }));
  const label = METRIC_INFO[metric]?.label ?? metric;
  return <Panel title={`Rendimiento medio · ${label}`} detail="±1 desviación estándar entre folds: descriptiva, no un intervalo de confianza.">
    <div className="eda-controls"><label className="eda-field">Visualización<select value={view} onChange={e => setView(e.target.value as ComparisonView)}><option value="bars">Gráfico de barras</option><option value="points">Puntos con barras de error</option></select></label><label className="eda-field">Métrica representada<select value={metric} disabled={!metrics.length} onChange={e => onMetric(e.target.value)}>{metrics.map(key => <option key={key} value={key}>{METRIC_INFO[key]?.label ?? key}</option>)}</select></label><InfoTooltip title="Lectura del gráfico" explanation="Cambiar estos controles solo modifica la visualización. El ranking y el mejor modelo conservan la métrica principal de la comparación. Los intervalos representan ±1 desviación estándar; se recortan al dominio permitido de la métrica."/></div>
    <Note>Selección y orden originales: {METRIC_INFO[result.primary_metric]?.label ?? result.primary_metric}. Métrica visualizada: {label}. Eje Y: {exactMetric(domain[0])} a {exactMetric(domain[1])}, en escala original{metric === 'accuracy' ? ' 0–1 (marcas en %)' : ''}.</Note>
    {rows.some(row => row.mean !== null) ? <div ref={chart} className="comparison-plot" role="group" aria-label={`${view === 'bars' ? 'Barras' : 'Puntos'} de ${label}. Datos accesibles en los detalles por modelo.`}>
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ left: 18, right: 26, top: 24, bottom: 22 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={36}/><YAxis domain={domain} allowDataOverflow width={80} tickFormatter={v => formatMetric(metric, Number(v))}/>
        <Tooltip content={({ active, payload, coordinate }) => { const row = payload?.[0]?.payload as ComparisonChartRow | undefined; return active && row ? <HoverDetails row={row} metric={metric} anchor={chart} x={coordinate?.x ?? 0} y={coordinate?.y ?? 0}/> : null; }}/>
        {view === 'bars' ? <>
          <Bar dataKey="withError" name="Media" stackId="mean" fill="#33866b" isAnimationActive={false}><ErrorBar dataKey="error" direction="y" width={7}/></Bar>
          <Bar dataKey="withoutError" name="Media sin desviación disponible" stackId="mean" fill="#33866b" isAnimationActive={false}/>
        </> : <>
          <Line dataKey="withError" name="Media" stroke="none" dot={{ r: 5, fill: '#33866b' }} activeDot={{ r: 7 }} isAnimationActive={false}><ErrorBar dataKey="error" direction="y" width={8} stroke="#33866b"/></Line>
          <Line dataKey="withoutError" name="Media sin desviación disponible" stroke="none" dot={{ r: 5, fill: '#33866b' }} activeDot={{ r: 7 }} isAnimationActive={false}/>
        </>}
      </ComposedChart></ResponsiveContainer>
    </div> : <Note>No hay medias definidas para esta métrica. Consulta los motivos por fold.</Note>}
    <Note>Las medias parciales se identifican por su N válido y no cambian la selección del mejor modelo. No se dibuja error sin al menos dos folds válidos y una desviación disponible. Una desviación cero conserva su valor cero. Los extremos fuera del dominio se recortan solo al dibujar; los datos originales se conservan.</Note>
    <div className="comparison-details">{rows.map(row => <details key={row.model}><summary>{modelName(row.model)} · media {row.mean === null ? '—' : formatMetric(metric, row.mean)} · {row.valid}/3 folds</summary><div className="comparison-tooltip"><Details row={row} metric={metric}/></div></details>)}</div>
  </Panel>;
}
