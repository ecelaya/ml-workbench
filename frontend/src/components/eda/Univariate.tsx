import { useMemo, useState } from 'react';
import type { Dataset } from '../../types/dataset';
import { boxSummary, categoryPlot, categorySummary, defaultOrder, orderFrequencies, percent, visualization } from '../../lib/eda';
import { describe, histogram, numericValue } from '../../lib/statistics';
import { Boxplots, fmt, FrequencyChart, methodology, MultiSelect, Note, Panel, pct, Table, VariableSelect } from './Shared';
export type Orders = Record<number, string[]>;
export function categoryOrder(index: number, values: readonly string[], orders: Orders): string[] | undefined {
  return orders[index] ?? defaultOrder([...new Set(values.map(v => v.trim()).filter(Boolean))]) ?? undefined;
}
function OrderEditor({ values, order, onSave }: { values: string[]; order?: string[]; onSave: (order: string[]) => void }) {
  const [draft, setDraft] = useState(() => order ?? [...new Set(values.map(v => v.trim()).filter(Boolean))]);
  function move(index: number, delta: number) {
    const next = [...draft];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    setDraft(next);
  }
  return <div className="order-editor"><h3>Orden de menor a mayor</h3><Note>{order ? 'Orden numérico, reconocido o configurado. Puedes ajustarlo.' : 'Orden provisional de aparición: usa las flechas y confirma el orden antes de visualizar.'}</Note><Table headers={['Posición', 'Categoría', 'Mover']} rows={draft.map((name, i) => [String(i + 1), name, <div className="order-buttons" key={name}><button aria-label={`Subir ${name}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button aria-label={`Bajar ${name}`} disabled={i === draft.length - 1} onClick={() => move(i, 1)}>↓</button></div>])}/><button className="eda-action" disabled={!draft.length} onClick={() => onSave(draft)}>Confirmar orden</button><Note>El orden solo afecta la presentación; no asigna distancias entre categorías.</Note></div>;
}

interface Props { dataset: Dataset; selected: number[]; onSelected: (values: number[]) => void; variable: number; onVariable: (value: number) => void; orders: Orders; onOrder: (index: number, order: string[]) => void }
export function Univariate({ dataset, selected, onSelected, variable, onVariable, orders, onOrder }: Props) {
  const values = useMemo(() => dataset.rows.map(row => row[variable] ?? ''), [dataset.rows, variable]);
  const column = dataset.columns[variable];
  const kind = column ? visualization(column.role, values) : 'identifier';
  const numeric = useMemo(() => values.map(numericValue), [values]);
  const stats = useMemo(() => describe(numeric), [numeric]);
  const box = useMemo(() => boxSummary(numeric), [numeric]);
  const summary = useMemo(() => categorySummary(values), [values]);
  const numericRows = useMemo(() => selected.filter(i => dataset.columns[i]?.role === 'Numérica').map(i => {
    const raw = dataset.rows.map(row => row[i] ?? ''), s = describe(raw.map(numericValue));
    const missing = raw.filter(v => !v.trim()).length;
    return [dataset.headers[i], fmt(s.n), fmt(missing), fmt(s.excluded - missing), ...[s.mean, s.median, s.sd, s.variance, s.min, s.q1, s.q3, s.max].map(fmt)];
  }), [dataset.rows, dataset.columns, dataset.headers, selected]);
  const otherRows = useMemo(() => selected.filter(i => dataset.columns[i]?.role !== 'Numérica' && dataset.columns[i]).map(i => {
    const s = categorySummary(dataset.rows.map(row => row[i] ?? '')), id = dataset.columns[i]?.role === 'Identificador';
    return [dataset.headers[i], dataset.columns[i]?.role, fmt(s.n), fmt(s.missing), fmt(s.unique), id ? '—' : s.modes.slice(0, 5).join(', ') + (s.modes.length > 5 ? ` (+${s.modes.length - 5} empates)` : ''), id ? fmt(s.duplicates) : '—', id ? pct(s.uniqueness) : '—'];
  }), [dataset.rows, dataset.columns, dataset.headers, selected]);
  if (!column) return <Note>No hay variables para analizar.</Note>;
  const ordinal = column.role === 'Categórica ordinal';
  const order = ordinal ? categoryOrder(variable, values, orders) : undefined;
  const ordered = orderFrequencies(summary.categories, order);
  const discrete = kind === 'discrete-bars';
  const discreteData = discrete ? [...numeric.filter((v): v is number => v !== null).reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map<number, number>())].sort((a, b) => a[0] - b[0]).map(([v, count]) => ({ name: fmt(v), count })) : [];
  return <div className="eda-stack"><Panel title="Estadísticas por variable" detail="Selección independiente de los roles y de la variable del gráfico."><MultiSelect dataset={dataset} selected={selected} onChange={onSelected} label="Variables para las tablas"/>{numericRows.length > 0 && <><h3 className="eda-subheading">Variables numéricas</h3><Table headers={['Variable', 'N válido', 'Ausentes', 'No numéricos', 'Media', 'Mediana', 'Desv. estándar', 'Varianza', 'Mínimo', 'Q1', 'Q3', 'Máximo']} rows={numericRows}/><Note>{methodology}</Note></>}{otherRows.length > 0 && <><h3 className="eda-subheading">Categorías e identificadores</h3><Table headers={['Variable', 'Rol', 'N válido', 'Ausentes', 'Cardinalidad', 'Moda (incluye empates)', 'Repeticiones ID', 'Unicidad ID']} rows={otherRows}/><Note>Unicidad = valores distintos / N no vacío. Repeticiones = ocurrencias posteriores a la primera, excluyendo ausentes. No se calculan magnitudes sobre categorías ni identificadores.</Note></>}{!selected.length && <Note>Selecciona una o varias variables para ver sus estadísticas.</Note>}</Panel>
    <Panel title="Distribución individual" detail="El rol determina el análisis; las variables discretas conservan su significado numérico."><div className="eda-controls"><VariableSelect dataset={dataset} value={variable} onChange={onVariable} label="Variable del gráfico"/></div>
      {column.role === 'Numérica' ? <><Note>N válido: {fmt(stats.n)} · Ausentes: {values.filter(v => !v.trim()).length} · No numéricos: {stats.excluded - values.filter(v => !v.trim()).length}. {discrete ? 'Barras de valores numéricos discretos: enteros con hasta 20 valores distintos.' : 'Histograma: intervalos de igual anchura; último intervalo cerrado en el máximo.'}</Note><FrequencyChart label={`Distribución de ${column.name}`} contiguous={!discrete} data={discrete ? discreteData : histogram(numeric).map((b, i, bins) => ({ name: `${fmt(b.start)} – ${fmt(b.end)}${i === bins.length - 1 ? ' ]' : ' )'}`, count: b.count }))}/><h3 className="eda-subheading">Dispersión y posibles atípicos</h3><Boxplots label={`Boxplot de ${column.name}`} groups={[{ name: column.name, box }]}/></> : column.role === 'Identificador' ? <><Table headers={['N no vacío', 'Únicos', 'Repeticiones', 'Ausentes', 'Unicidad / no vacíos']} rows={[[fmt(summary.n), fmt(summary.unique), fmt(summary.duplicates), fmt(summary.missing), pct(summary.uniqueness)]]}/><Note>Las repeticiones de este identificador no implican filas completas duplicadas. No se calculan medias ni gráficos de magnitudes.</Note></> : <>
      {ordinal && <OrderEditor key={`${variable}-${column.role}`} values={values} order={order} onSave={o => onOrder(variable, o)}/>}
      <Note>N válido: {fmt(summary.n)} · Ausentes: {fmt(summary.missing)} · Categorías: {fmt(summary.unique)}. Moda: {summary.modes.slice(0, 5).join(', ') || '—'}{summary.modes.length > 5 ? ` (+${summary.modes.length - 5} empates)` : ''}. Frecuencias relativas sobre N no vacío.</Note>
      {ordinal && !order ? <Note>Gráfico pendiente de configurar el orden; las frecuencias originales están disponibles debajo sin orden estadístico.</Note> : ordinal && ordered.length > 30 ? <Note>Gráfico omitido: más de 30 niveles ordinales. La tabla conserva todos los niveles y su orden.</Note> : <><FrequencyChart label={`Frecuencias de ${column.name}`} data={ordinal ? ordered : categoryPlot(ordered)}/>{!ordinal && ordered.length > 15 && <Note>Solo en el gráfico: 14 categorías más frecuentes y el resto en «Otros (agrupados)». La moda, cardinalidad y tabla se calculan sobre las categorías originales.</Note>}</>}
      <Table key={variable} headers={['Categoría', 'Frecuencia absoluta', 'Frecuencia relativa (% válido)']} rows={ordered.map(c => [c.name, fmt(c.count), pct(percent(c.count, summary.n))])}/></>}
    </Panel></div>;
}
