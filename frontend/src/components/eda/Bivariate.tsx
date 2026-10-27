import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dataset } from '../../types/dataset';
import { completePairs, contingency, groupedNumeric, numericSelection, pairAnalysis, samplePoints } from '../../lib/eda';
import { numericValue, pearson } from '../../lib/statistics';
import { categoryOrder, type Orders } from './Univariate';
import { Boxplots, fmt, methodology, MultiSelect, Note, Panel, pct, Table, VariableSelect } from './Shared';
const colors = ['#33866b', '#82b89b', '#b39159', '#6684a4', '#b47c84', '#836aa1', '#5da5a0', '#a7ae69', '#bf956c', '#73896b', '#a7a7c0', '#b7cfc2'];
interface Props { dataset: Dataset; selected: number[]; onSelected: (selected: number[]) => void; x: number; y: number; onX: (v: number) => void; onY: (v: number) => void; orders: Orders }
export function Bivariate({ dataset, selected, onSelected, x, y, onX, onY, orders }: Props) {
  const numericIndices = dataset.columns.flatMap((c, i) => c.role === 'Numérica' ? [i] : []);
  const eligible = dataset.columns.flatMap((c, i) => c.role !== 'Identificador' ? [i] : []);
  const matrixIndices = useMemo(() => numericSelection(dataset.columns, selected), [dataset.columns, selected]);
  const matrix = useMemo(() => {
    if (matrixIndices.length > 20) return [];
    const vectors = matrixIndices.map(i => dataset.rows.map(row => numericValue(row[i])));
    return vectors.map(a => vectors.map(b => pearson(a, b)));
  }, [dataset.rows, matrixIndices]);
  const a = eligible.includes(x) ? x : eligible[0] ?? -1;
  const b = eligible.includes(y) && y !== a ? y : eligible.find(i => i !== a) ?? -1;
  const av = useMemo(() => dataset.rows.map(row => row[a] ?? ''), [dataset.rows, a]);
  const bv = useMemo(() => dataset.rows.map(row => row[b] ?? ''), [dataset.rows, b]);
  const ac = dataset.columns[a], bc = dataset.columns[b];
  const kind = ac && bc ? pairAnalysis(ac.role, bc.role) : 'unsupported';
  const pair = useMemo(() => kind === 'scatter' ? completePairs(av, bv) : [], [av, bv, kind]);
  const scatter = useMemo(() => samplePoints(pair), [pair]);
  const catIndex = ac?.role === 'Numérica' ? b : a;
  const numIndex = ac?.role === 'Numérica' ? a : b;
  const categoryValues = ac?.role === 'Numérica' ? bv : av;
  const numericValues = ac?.role === 'Numérica' ? av : bv;
  const grouped = useMemo(() => kind === 'grouped' ? groupedNumeric(categoryValues, numericValues) : null, [kind, categoryValues, numericValues]);
  const categoryOrdinal = dataset.columns[catIndex]?.role === 'Categórica ordinal';
  const groupOrder = categoryOrdinal ? categoryOrder(catIndex, categoryValues, orders) : undefined;
  const groups = grouped ? [...grouped.groups].sort((c, d) => groupOrder ? groupOrder.indexOf(c.name) - groupOrder.indexOf(d.name) : c.name.localeCompare(d.name)) : [];
  const ct = useMemo(() => kind === 'contingency' ? contingency(av, bv) : null, [kind, av, bv]);
  const orderA = ac?.role === 'Categórica ordinal' ? categoryOrder(a, av, orders) : undefined;
  const orderB = bc?.role === 'Categórica ordinal' ? categoryOrder(b, bv, orders) : undefined;
  const unordered = (ac?.role === 'Categórica ordinal' && !orderA) || (bc?.role === 'Categórica ordinal' && !orderB);
  const xs = ct ? [...ct.xs].sort((u, v) => orderA ? orderA.indexOf(u) - orderA.indexOf(v) : u.localeCompare(v)) : [];
  const ys = ct ? [...ct.ys].sort((u, v) => orderB ? orderB.indexOf(u) - orderB.indexOf(v) : u.localeCompare(v)) : [];
  const xRanks = new Map(xs.map((value, i) => [value, i]));
  const yRanks = new Map(ys.map((value, i) => [value, i]));
  return <div className="eda-stack"><Panel title="Relación entre dos variables" detail="Selectores independientes. Los identificadores no son compatibles con estos análisis."><div className="eda-controls"><VariableSelect label="Variable X" dataset={dataset} value={a} onChange={onX} indices={eligible}/><VariableSelect label="Variable Y" dataset={dataset} value={b} onChange={onY} indices={eligible.filter(i => i !== a)}/></div>
    {kind === 'unsupported' ? <Note>Se necesitan dos variables distintas con roles numéricos o categóricos.</Note> : kind === 'scatter' ? <><Note>{ac?.name} (X) frente a {bc?.name} (Y). N válido por pareja: {fmt(pair.length)} · Excluidos: {fmt(dataset.rows.length - pair.length)}. {pair.length > 3000 && `Se representan ${scatter.length} puntos muestreados de forma determinista; los cálculos usan todos los pares.`}</Note>{pair.length ? <div className="chart eda-scatter" role="img" aria-label={`Dispersión de ${ac?.name} y ${bc?.name}`}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ left: 15, right: 25, bottom: 25, top: 10 }}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" dataKey="x" name={ac?.name} tickFormatter={fmt} label={{ value: ac?.name, position: 'bottom' }}/><YAxis type="number" dataKey="y" name={bc?.name} tickFormatter={fmt}/><Tooltip formatter={(v, name) => [fmt(Number(v)), name]} cursor={{ strokeDasharray: '3 3' }}/><Scatter data={scatter} fill="#33866b" isAnimationActive={false}/></ScatterChart></ResponsiveContainer></div> : <Note>No hay pares numéricos válidos para representar.</Note>}</> : kind === 'grouped' && grouped ? <><Note>Distribución de {dataset.headers[numIndex]} por {dataset.headers[catIndex]}. N válido por grupo en la tabla; pares excluidos: {fmt(grouped.excluded)}. Ausentes y valores no numéricos no contribuyen a los descriptivos.</Note>{categoryOrdinal && !groupOrder ? <Note>Configura el orden de esta variable ordinal en Univariante para mostrar las cajas ordenadas.</Note> : groups.length > 20 ? <Note>Boxplots omitidos: más de 20 grupos. La tabla conserva los descriptivos de todos los grupos, sin mezclarlos.</Note> : <Boxplots label={`Distribución de ${dataset.headers[numIndex]} por ${dataset.headers[catIndex]}`} groups={groups}/>}<Table headers={['Categoría', 'N válido', 'Excluidos del grupo', 'Media', 'Mediana', 'Desv. estándar', 'Varianza', 'Mínimo', 'Q1', 'Q3', 'Máximo']} rows={groups.map(g => [g.name, fmt(g.box.n), fmt(g.box.excluded), ...[g.box.mean, g.box.median, g.box.sd, g.box.variance, g.box.min, g.box.q1, g.box.q3, g.box.max].map(fmt)])}/><Note>{methodology}</Note></> : ct ? <><Note>N válido de la tabla de contingencia: {fmt(ct.n)} · Pares ausentes: {fmt(ct.excluded)}. Porcentaje por fila: celda / total de su categoría X. Porcentaje total: celda / todos los pares válidos. Las combinaciones no observadas tienen frecuencia cero.</Note>{unordered ? <Note>Configura el orden de las variables ordinales en Univariante para visualizar las barras ordenadas.</Note> : xs.length > 12 || ys.length > 12 ? <Note>Gráfico omitido: más de 12 categorías en alguno de los ejes. Se conservan los recuentos originales en la tabla de combinaciones observadas.</Note> : ct.n > 0 ? <div className="chart eda-scatter" role="img" aria-label="Barras apiladas de frecuencias absolutas por categoría X"><ResponsiveContainer width="100%" height="100%"><BarChart data={xs.map(name => Object.fromEntries([['name', name], ...ys.map((v, i) => [`series${i}`, ct.counts.get(name)?.get(v) ?? 0])]))}><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/><Tooltip formatter={(v, name) => [fmt(Number(v)), name]}/><Legend wrapperStyle={{ fontSize: 11 }}/>{ys.map((name, i) => <Bar key={name} dataKey={`series${i}`} name={name} stackId="counts" fill={colors[i % colors.length]}/>)}</BarChart></ResponsiveContainer></div> : <Note>No hay pares categóricos completos.</Note>}
    {xs.length <= 20 && ys.length <= 20 ? <Table headers={[`${ac?.name} / ${bc?.name}`, ...ys, 'Total fila']} rows={xs.map(name => [name, ...ys.map(v => { const count = ct.counts.get(name)?.get(v) ?? 0; return `${fmt(count)} (${pct(ct.totals.get(name) ? count / ct.totals.get(name)! * 100 : 0)} fila)`; }), fmt(ct.totals.get(name) ?? 0)])}/> : <Note>Alta cardinalidad: se presenta una tabla paginada de combinaciones observadas en lugar de una matriz extensa.</Note>}
    <Table headers={[ac?.name ?? 'X', bc?.name ?? 'Y', 'Frecuencia', '% de fila X', '% del total válido']} rows={[...ct.cells].sort((u, v) => (xRanks.get(u.a)! - xRanks.get(v.a)!) || (yRanks.get(u.b)! - yRanks.get(v.b)!)).map(cell => [cell.a, cell.b, fmt(cell.count), pct(cell.rowPercent), pct(cell.totalPercent)])}/></> : null}
    </Panel>
    <Panel title="Matriz de correlaciones de Pearson" detail="Solo variables con rol numérico. La selección es independiente de la relación por pares y de Univariante."><MultiSelect dataset={dataset} indices={numericIndices} selected={matrixIndices} onChange={onSelected} label="Variables para Pearson"/>{matrixIndices.length < 2 ? <Note>Selecciona al menos dos variables numéricas.</Note> : matrixIndices.length > 20 ? <Note>Selecciona un máximo de 20 variables para mantener la matriz legible.</Note> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Matriz de correlaciones"><table className="correlation"><thead><tr><th>Variable</th>{matrixIndices.map(i => <th key={i}>{dataset.headers[i]}</th>)}</tr></thead><tbody>{matrixIndices.map((i, row) => <tr key={i}><th scope="row">{dataset.headers[i]}</th>{matrixIndices.map((j, col) => { const cell = matrix[row]![col]!; return <td key={j} style={{ backgroundColor: cell.r === null ? undefined : `rgba(${cell.r < 0 ? '184,100,65' : '51,134,107'},${Math.abs(cell.r) * .3})` }}>{fmt(cell.r)}<small>n = {fmt(cell.n)}</small></td>; })}</tr>)}</tbody></table></div>}<Note>Casos completos por pareja. r entre −1 y +1; «—» con menos de dos pares válidos o alguna variable constante. La correlación no implica causalidad. Los códigos nominales, ordinales y los identificadores no se incluyen en Pearson.</Note></Panel>
  </div>;
}
