import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dataset } from '../../types/dataset';
import type { boxSummary } from '../../lib/eda';
import { samplePoints } from '../../lib/eda';
export const fmt = (n: number | null) => n === null || !Number.isFinite(n) ? '—' : n.toLocaleString('es-ES', { maximumSignificantDigits: 6 });
export const pct = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`;
export const methodology = 'Cuartiles: interpolación lineal en (n − 1) × p. Desviación y varianza muestrales (n − 1). —: estadístico indefinido o no representable.';
export function Panel({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div></div>{children}</section>;
}
export function Note({ children }: { children: ReactNode }) { return <p className="eda-note">{children}</p>; }
export function Table({ headers, rows }: { headers: ReactNode[]; rows: ReactNode[][] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 20)), current = Math.min(page, pages - 1);
  return <><div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla de resultados"><table><thead><tr>{headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{rows.slice(current * 20, (current + 1) * 20).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>{!rows.length && <Note>No hay observaciones válidas para esta tabla.</Note>}{pages > 1 && <div className="pagination"><span>{rows.length} resultados · Página {current + 1} de {pages}</span><div><button disabled={!current} onClick={() => setPage(current - 1)} aria-label="Resultados anteriores">←</button><button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Resultados siguientes">→</button></div></div>}</>;
}
export function VariableSelect({ dataset, value, onChange, label, indices }: { dataset: Dataset; value: number; onChange: (index: number) => void; label: string; indices?: number[] }) {
  const options = indices ?? dataset.columns.map((_, i) => i);
  return <label className="eda-field">{label}<select value={options.includes(value) ? value : ''} onChange={e => onChange(Number(e.target.value))}><option value="" disabled>Selecciona una variable</option>{options.map(i => <option key={i} value={i}>{dataset.headers[i]}</option>)}</select></label>;
}
export function MultiSelect({ dataset, selected, onChange, indices, label }: { dataset: Dataset; selected: number[]; onChange: (indices: number[]) => void; indices?: number[]; label: string }) {
  const options = indices ?? dataset.columns.map((_, i) => i);
  return <fieldset className="eda-multiselect"><legend>{label}</legend><div className="eda-choice-actions"><button onClick={() => onChange(options)}>Todas</button><button onClick={() => onChange([])}>Ninguna</button></div><div className="eda-choices">{options.map(i => <label key={i}><input type="checkbox" checked={selected.includes(i)} onChange={e => onChange(e.target.checked ? [...selected, i] : selected.filter(v => v !== i))}/>{dataset.headers[i]}</label>)}</div>{!options.length && <Note>No hay variables compatibles con este análisis.</Note>}</fieldset>;
}
export function FrequencyChart({ data, label, unit = 'Observaciones', contiguous = false }: { data: { name: string; count: number }[]; label: string; unit?: string; contiguous?: boolean }) {
  if (!data.length) return <Note>No hay valores válidos para el gráfico.</Note>;
  return <div className="category-chart" style={{ height: Math.max(240, data.length * 32) }} role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" barCategoryGap={contiguous ? 0 : undefined} data={data} margin={{ left: 8, right: 24 }}><CartesianGrid horizontal={false} strokeDasharray="3 3"/><XAxis type="number" allowDecimals={unit !== 'Observaciones'} tickFormatter={fmt}/><YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 11 }} tickFormatter={v => String(v).length > 18 ? `${String(v).slice(0, 18)}…` : String(v)}/><Tooltip formatter={v => [fmt(Number(v)), unit]}/><Bar dataKey="count" fill="#33866b"/></BarChart></ResponsiveContainer></div>;
}
export function Boxplots({ groups, label }: { groups: { name: string; box: ReturnType<typeof boxSummary> }[]; label: string }) {
  const valid = groups.filter(g => g.box.n > 0 && g.box.min !== null && g.box.max !== null);
  if (!valid.length) return <Note>No hay números válidos para el boxplot.</Note>;
  const min = valid.reduce((a, g) => Math.min(a, g.box.min!), Infinity), max = valid.reduce((a, g) => Math.max(a, g.box.max!), -Infinity);
  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const position = (v: number) => min === max ? 365 : 160 + (v / scale - min / scale) / (max / scale - min / scale) * 410;
  return <><div className="boxplot-scroll"><svg viewBox={`0 0 650 ${valid.length * 70 + 50}`} role="img" aria-label={label} style={{ minWidth: 540, width: '100%' }}>{valid.map(({ name, box: b }, i) => {
    const y = i * 70 + 24;
    return <g key={name} tabIndex={0}><title>{`${name}: n=${b.n}, Q1=${fmt(b.q1)}, mediana=${fmt(b.median)}, Q3=${fmt(b.q3)}, bigotes=${fmt(b.low)}–${fmt(b.high)}, posibles atípicos=${b.outliers.length}`}</title><text x="5" y={y + 5} fontSize="11" fill="#405e4a">{name.length > 20 ? name.slice(0, 20) + '…' : name}</text><line x1={position(b.low!)} x2={position(b.high!)} y1={y} y2={y} stroke="#33866b"/><line x1={position(b.low!)} x2={position(b.low!)} y1={y - 8} y2={y + 8} stroke="#33866b"/><line x1={position(b.high!)} x2={position(b.high!)} y1={y - 8} y2={y + 8} stroke="#33866b"/><rect x={position(b.q1!)} y={y - 12} width={Math.max(1, position(b.q3!) - position(b.q1!))} height="24" fill="#d3e9dc" stroke="#33866b"/><line x1={position(b.median!)} x2={position(b.median!)} y1={y - 12} y2={y + 12} stroke="#214e38" strokeWidth="2"/>{samplePoints(b.outliers, 100).map((v, j) => <circle key={j} cx={position(v)} cy={y} r="2" fill="#af713c"><title>{fmt(v)}</title></circle>)}<text x="160" y={y + 29} fontSize="9" fill="#718575">n={b.n} · atípicos={b.outliers.length}</text></g>;
  })}<text x="160" y={valid.length * 70 + 30} fontSize="11">{fmt(min)}</text><text x="570" y={valid.length * 70 + 30} textAnchor="end" fontSize="11">{fmt(max)}</text></svg></div><Note>Bigotes: extremos observados dentro de Q1 − 1,5 × RIC y Q3 + 1,5 × RIC. Posibles atípicos fuera de esas cercas; no se eliminan. Se dibujan hasta 100 puntos atípicos por caja; el recuento incluye todos.</Note></>;
}
